// Минимальный IMAP-клиент для прогрева почт.
// Умеет: LOGIN, LIST, SELECT, UID SEARCH HEADER, UID STORE, UID MOVE/COPY+EXPUNGE, LOGOUT.
// Работает поверх Deno.connectTls (порт 993). STARTTLS не поддерживается — везде используем ssl/993.

export interface ImapConfig {
  host: string;
  port: number;              // 993
  user: string;
  password: string;
}

type Conn = { conn: Deno.TlsConn; reader: ReadableStreamDefaultReader<Uint8Array>; buf: string; decoder?: TextDecoder };

const dec = new TextDecoder();
const enc = new TextEncoder();

async function bounded<T>(c: Conn, operation: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        try { c.conn.close(); } catch { /* already closed */ }
        reject(new Error("IMAP operation timeout"));
      }, Math.max(1, milliseconds));
    })]);
  } finally { clearTimeout(timer); }
}

async function readBytes(c: Conn, deadline: number): Promise<Uint8Array> {
  if (Date.now() >= deadline) throw new Error("IMAP operation timeout");
  const { value, done } = await bounded(c, c.reader.read(), deadline - Date.now());
  if (done || !value?.length) throw new Error("IMAP connection closed or empty read");
  return value;
}

function decodeChunk(c: Conn, bytes: Uint8Array): string {
  c.decoder ??= new TextDecoder();
  return c.decoder.decode(bytes, { stream: true });
}

async function readUntilTag(c: Conn, tag: string, timeoutMs = 20000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (!new RegExp(`(^|\\n)${tag} (OK|NO|BAD)[^\\n]*\\n`, "m").test(c.buf)) {
    c.buf += decodeChunk(c, await readBytes(c, deadline));
  }
  const idx = c.buf.search(new RegExp(`(^|\\n)${tag} (OK|NO|BAD)[^\\n]*\\n`, "m"));
  const endMatch = c.buf.slice(idx).match(new RegExp(`${tag} (OK|NO|BAD)[^\\n]*\\n`));
  const end = idx + (endMatch ? endMatch[0].length + (idx === 0 ? 0 : 1) : 0);
  const chunk = c.buf.slice(0, end);
  c.buf = c.buf.slice(end);
  return chunk;
}

async function send(c: Conn, line: string) {
  const bytes = enc.encode(line + "\r\n");
  await bounded(c, (async () => {
    let offset = 0;
    while (offset < bytes.length) {
      const written = await c.conn.write(bytes.subarray(offset));
      if (!Number.isInteger(written) || written <= 0 || written > bytes.length - offset) {
        throw new Error("IMAP invalid write result");
      }
      offset += written;
    }
  })(), 20000);
}

let tagCounter = 0;
function nextTag() { tagCounter = (tagCounter + 1) % 100000; return "A" + tagCounter.toString().padStart(4, "0"); }

async function cmd(c: Conn, command: string): Promise<string> {
  const tag = nextTag();
  await send(c, `${tag} ${command}`);
  const resp = await readUntilTag(c, tag);
  if (!new RegExp(`${tag} OK`, "m").test(resp)) {
    // Do not echo server responses: LOGIN failures can contain credentials.
    throw new Error(`IMAP ${command.split(" ")[0]} rejected`);
  }
  return resp;
}

export async function connectImap(cfg: ImapConfig): Promise<Conn> {
  if (/[\r\n\x00]/.test(cfg.user + cfg.password + cfg.host)) throw new Error("Invalid IMAP configuration");
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const connecting = Deno.connectTls({ hostname: cfg.host, port: cfg.port }).then(conn => {
    if (timedOut) { conn.close(); throw new Error("IMAP connect timeout"); }
    return conn;
  });
  let conn: Deno.TlsConn;
  try {
    conn = await Promise.race([connecting, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { timedOut = true; reject(new Error("IMAP connect timeout")); }, 10000);
    })]);
  } finally { clearTimeout(timer); }
  const reader = conn.readable.getReader();
  const c: Conn = { conn, reader, buf: "" };
  // прочитать приветствие
  const deadline = Date.now() + 10000;
  try {
  while (!/\r?\n/.test(c.buf)) c.buf += decodeChunk(c, await readBytes(c, deadline));
  if (!/^\* OK\b/.test(c.buf)) throw new Error("IMAP greeting rejected");
  // очистить всё до конца приветствия
  const nl = c.buf.indexOf("\n");
  if (nl >= 0) c.buf = c.buf.slice(nl + 1);
  // LOGIN
  const escP = cfg.password.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escU = cfg.user.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  await cmd(c, `LOGIN "${escU}" "${escP}"`);
  return c;
  } catch (error) {
    try { conn.close(); } catch { /* already closed */ }
    throw error;
  }
}

export async function closeImap(c: Conn) {
  try { await cmd(c, "LOGOUT"); } catch { /* ignore */ }
  try { c.conn.close(); } catch { /* ignore */ }
}

/** Возвращает имя папки Спам (Junk/Spam/[Gmail]/Spam/Спам). */
export async function findSpamFolder(c: Conn): Promise<string | null> {
  const resp = await cmd(c, `LIST "" "*"`);
  const lines = resp.split("\n");
  const candidates: string[] = [];
  for (const line of lines) {
    // * LIST (\HasNoChildren \Junk) "/" "Junk"
    const m = line.match(/^\* LIST \(([^)]*)\) "[^"]*" (?:"([^"]+)"|([^\s]+))/);
    if (!m) continue;
    const flags = m[1].toLowerCase();
    const name = (m[2] ?? m[3] ?? "").trim();
    if (!name) continue;
    if (/\\junk/.test(flags)) return name; // явный флаг \Junk
    if (/(spam|junk|спам)/i.test(name)) candidates.push(name);
  }
  return candidates[0] ?? null;
}

/** Ищет письмо по заголовку X-Warmup-Id в текущей выбранной папке. Возвращает UID первого или null. */
async function searchWarmup(c: Conn, warmupId: string): Promise<number | null> {
  // UID SEARCH HEADER "X-Warmup-Id" "value"
  const safe = warmupId.replace(/["\\]/g, "");
  const resp = await cmd(c, `UID SEARCH HEADER "X-Warmup-Id" "${safe}"`);
  const m = resp.match(/\* SEARCH\s+([\d\s]+)/);
  if (!m) return null;
  const first = m[1].trim().split(/\s+/)[0];
  return first ? parseInt(first, 10) : null;
}

/**
 * Some providers deliver the probe but do not expose custom X-* headers to
 * IMAP SEARCH. The probe id prefix is also present in the subject, so use that
 * header as a read-only fallback without fetching the message body.
 */
async function searchSubjectProbe(c: Conn, warmupId: string): Promise<number | null> {
  const safe = warmupId.slice(0, 8).replace(/["\\]/g, "");
  if (!safe) return null;
  const resp = await cmd(c, `UID SEARCH SUBJECT "${safe}"`);
  const m = resp.match(/\* SEARCH\s+([\d\s]+)/);
  if (!m) return null;
  const first = m[1].trim().split(/\s+/)[0];
  return first ? parseInt(first, 10) : null;
}

async function searchReadOnlyProbe(c: Conn, warmupId: string): Promise<number | null> {
  return (await searchWarmup(c, warmupId)) || searchSubjectProbe(c, warmupId);
}

async function selectFolder(c: Conn, folder: string) {
  const safe = folder.replace(/"/g, '\\"');
  await cmd(c, `SELECT "${safe}"`);
}

/** Возвращает наибольший UID во Входящих, не загружая и не помечая письма. */
export async function highestInboxUid(c: Conn): Promise<number> {
  const resp = await cmd(c, 'STATUS "INBOX" (UIDNEXT)');
  const m = resp.match(/UIDNEXT\s+(\d+)/i);
  const uidNext = m ? Number.parseInt(m[1], 10) : 1;
  return Number.isFinite(uidNext) && uidNext > 1 ? uidNext - 1 : 0;
}

async function examineFolder(c: Conn, folder: string) {
  const safe = folder.replace(/"/g, '\\"');
  await cmd(c, `EXAMINE "${safe}"`);
}

/** The selected mailbox's UIDVALIDITY, obtained by read-only EXAMINE itself. */
export async function examineInbox(c: Conn): Promise<{ uidValidity: number }> {
  const response = await cmd(c, 'EXAMINE "INBOX"');
  const match = response.match(/\[UIDVALIDITY (\d+)\]/i);
  const uidValidity = match ? Number(match[1]) : 0;
  if (!Number.isSafeInteger(uidValidity) || uidValidity < 1 || uidValidity > 4294967295) {
    throw new Error("IMAP UIDVALIDITY missing or invalid");
  }
  return { uidValidity };
}

/**
 * Read-only placement check used by the deliverability MVP.
 * EXAMINE + SEARCH do not mark, move, delete, or fetch message bodies.
 */
export async function placementForReadOnly(
  c: Conn,
  warmupId: string,
): Promise<"inbox" | "spam" | "missing"> {
  await examineFolder(c, "INBOX");
  if (await searchReadOnlyProbe(c, warmupId)) return "inbox";

  const spam = await findSpamFolder(c);
  if (!spam) return "missing";
  await examineFolder(c, spam);
  return (await searchReadOnlyProbe(c, warmupId)) ? "spam" : "missing";
}

/** Проверить, где лежит письмо с X-Warmup-Id: 'inbox' | 'spam' | 'missing'.
 *  Если в спаме — перемещает во «Входящие» и помечает прочитанным. */
export async function placementFor(c: Conn, warmupId: string): Promise<"inbox" | "spam" | "missing"> {
  // INBOX
  await selectFolder(c, "INBOX");
  const inboxUid = await searchWarmup(c, warmupId);
  if (inboxUid) {
    try { await cmd(c, `UID STORE ${inboxUid} +FLAGS (\\Seen)`); } catch { /* ignore */ }
    return "inbox";
  }
  // Spam
  const spam = await findSpamFolder(c);
  if (!spam) return "missing";
  await selectFolder(c, spam);
  const spamUid = await searchWarmup(c, warmupId);
  if (!spamUid) return "missing";
  // Пробуем MOVE (RFC 6851). Если сервер не поддерживает — COPY + STORE \Deleted + EXPUNGE.
  try {
    await cmd(c, `UID MOVE ${spamUid} INBOX`);
  } catch {
    try {
      await cmd(c, `UID COPY ${spamUid} INBOX`);
      await cmd(c, `UID STORE ${spamUid} +FLAGS (\\Deleted)`);
      await cmd(c, `EXPUNGE`);
    } catch { /* fallback failed, всё равно фиксируем как spam */ }
  }
  // Пометить как прочитанное в INBOX (best-effort)
  try {
    await selectFolder(c, "INBOX");
    const uid = await searchWarmup(c, warmupId);
    if (uid) await cmd(c, `UID STORE ${uid} +FLAGS (\\Seen)`);
  } catch { /* ignore */ }
  return "spam";
}

// ==============================================================
// Fetching messages for Unibox / inbox scanner
// ==============================================================

export interface RawImapMessage {
  uid: number;
  raw: string; // full RFC822 (headers + body) up to ~64KB
}

/** UID SEARCH UID <from>:* — возвращает список UID > sinceUid в текущей папке. */
export async function searchUidsSince(c: Conn, sinceUid: number): Promise<number[]> {
  if (!Number.isSafeInteger(sinceUid) || sinceUid < 0 || sinceUid > 4294967295) throw new Error("Invalid IMAP cursor");
  const from = Math.max(1, sinceUid + 1);
  const resp = await cmd(c, `UID SEARCH UID ${from}:*`);
  const m = resp.match(/\* SEARCH([^\r\n]*)/);
  if (!m) throw new Error("IMAP SEARCH response missing");
  const values = m[1].trim().split(/\s+/).filter(Boolean);
  if (values.some(x => !/^\d+$/.test(x) || Number(x) < 1 || Number(x) > 4294967295)) throw new Error("Invalid IMAP SEARCH UID");
  return [...new Set(values.map(Number).filter(x => x > sinceUid))].sort((a, b) => a - b);
}

/** Скачивает RFC822 для указанного UID (первые ~64KB). */
export async function fetchRfc822(c: Conn, uid: number, maxBytes = 65536): Promise<string | null> {
  if (!Number.isSafeInteger(uid) || uid < 1 || uid > 4294967295 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 2000000) {
    throw new Error("Invalid IMAP FETCH limits");
  }
  const tag = nextTag();
  await send(c, `${tag} UID FETCH ${uid} (UID BODY.PEEK[]<0.${maxBytes}>)`);
  // Work in bytes: literal lengths are octets, not JavaScript characters. Only
  // protocol lines outside literals can terminate FETCH (a body may contain a tag).
  const deadline = Date.now() + 30000;
  let buffer = enc.encode(c.buf); c.buf = "";
  let offset = 0;
  let raw: Uint8Array | null = null;
  let messageUid: number | null = null;
  let literal: { length: number; capture: boolean } | null = null;
  while (true) {
    if (literal) {
      if (buffer.length - offset >= literal.length) {
        if (literal.capture) raw = buffer.slice(offset, offset + literal.length);
        offset += literal.length; literal = null;
        continue;
      }
    } else {
      const newline = buffer.indexOf(10, offset);
      if (newline >= 0) {
        const line = dec.decode(buffer.subarray(offset, newline + 1));
        offset = newline + 1;
        const completed = line.match(new RegExp(`^${tag} (OK|NO|BAD)\\b`));
        if (completed) {
          c.buf = decodeChunk(c, buffer.subarray(offset));
          if (completed[1] !== "OK" || !raw?.length) throw new Error("IMAP FETCH rejected or message missing");
          if (messageUid !== uid) throw new Error("IMAP FETCH UID mismatch");
          const message = dec.decode(raw);
          if (!/\r?\n\r?\n/.test(message)) throw new Error("IMAP message headers incomplete");
          return message;
        }
        const marker = line.match(/\{(\d+)\}\r?\n$/);
        if (marker) {
          const length = Number(marker[1]);
          if (!Number.isSafeInteger(length) || length > maxBytes) throw new Error("IMAP literal exceeds limit");
          const returnedUid = line.match(/\bUID (\d+)\b/i);
          const capture = /\bFETCH\s*\(/i.test(line) && /BODY\[\]/i.test(line);
          if (capture) {
            if (raw) throw new Error("IMAP duplicate FETCH body");
            messageUid = returnedUid ? Number(returnedUid[1]) : null;
          }
          literal = { length, capture };
        } else if (raw && !line.startsWith("*")) {
          // RFC3501 permits UID after the BODY literal instead of before it.
          const returnedUid = line.match(/\bUID (\d+)\b/i);
          if (returnedUid) {
            if (messageUid !== null && messageUid !== Number(returnedUid[1])) throw new Error("IMAP conflicting FETCH UID");
            messageUid = Number(returnedUid[1]);
          }
        }
        continue;
      }
    }
    const bytes = await readBytes(c, deadline);
    if (buffer.length + bytes.length > maxBytes + 65536) throw new Error("IMAP FETCH response exceeds limit");
    const combined = new Uint8Array(buffer.length + bytes.length);
    combined.set(buffer); combined.set(bytes, buffer.length); buffer = combined;
  }
}

function nextTagExport() { return nextTag(); }

/** SELECT INBOX и вернуть новые UID > sinceUid. */
export async function scanInbox(c: Conn, sinceUid: number, limit = 30): Promise<RawImapMessage[]> {
  // EXAMINE makes the read-only intent explicit; BODY.PEEK below preserves \Seen.
  await examineFolder(c, "INBOX");
  const uids = (await searchUidsSince(c, sinceUid)).slice(0, limit);
  const out: RawImapMessage[] = [];
  for (const uid of uids) {
    try {
      const raw = await fetchRfc822(c, uid);
      if (!raw) break;
      out.push({ uid, raw });
    } catch {
      // Preserve cursor safety: the caller must retry this UID instead of
      // advancing beyond an unreadable message and losing a possible reply.
      break;
    }
  }
  return out;
}

// ==============================================================
// RFC822 parsing helpers
// ==============================================================

function decodeMimeWord(input: string): string {
  return input.replace(/=\?([^?]+)\?([BbQq])\?([^?]+)\?=/g, (_, charset, enc, data) => {
    try {
      if (enc.toUpperCase() === "B") {
        const bin = atob(data);
        const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
        return new TextDecoder(charset.toLowerCase() === "utf-8" ? "utf-8" : charset).decode(bytes);
      } else {
        // Q-encoding
        const decoded: string = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m: string, h: string) => String.fromCharCode(parseInt(h, 16)));
        const bytes = Uint8Array.from(decoded, ch => ch.charCodeAt(0));
        return new TextDecoder(charset.toLowerCase() === "utf-8" ? "utf-8" : charset).decode(bytes);
      }
    } catch { return data; }
  });
}

function parseHeaders(raw: string): { headers: Record<string, string>; body: string } {
  const sep = raw.indexOf("\r\n\r\n");
  const splitAt = sep >= 0 ? sep : raw.indexOf("\n\n");
  const headerBlock = splitAt >= 0 ? raw.slice(0, splitAt) : raw;
  const body = splitAt >= 0 ? raw.slice(splitAt + (sep >= 0 ? 4 : 2)) : "";
  // Fold continuation lines
  const lines = headerBlock.split(/\r?\n/);
  const folded: string[] = [];
  for (const l of lines) {
    if (/^[ \t]/.test(l) && folded.length > 0) folded[folded.length - 1] += " " + l.trim();
    else folded.push(l);
  }
  const headers: Record<string, string> = {};
  for (const l of folded) {
    const i = l.indexOf(":");
    if (i < 0) continue;
    const k = l.slice(0, i).trim().toLowerCase();
    const v = l.slice(i + 1).trim();
    if (!headers[k]) headers[k] = v;
  }
  return { headers, body };
}

function decodeBody(body: string, encoding: string, charset: string): string {
  const enc = (encoding || "7bit").toLowerCase();
  const cs = (charset || "utf-8").toLowerCase();
  try {
    if (enc === "base64") {
      const clean = body.replace(/\s+/g, "");
      const bin = atob(clean);
      const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
      return new TextDecoder(cs).decode(bytes);
    } else if (enc === "quoted-printable") {
      const decoded = body
        .replace(/=\r?\n/g, "")
        .replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
      const bytes = Uint8Array.from(decoded, ch => ch.charCodeAt(0));
      return new TextDecoder(cs).decode(bytes);
    } else {
      // 7bit/8bit — просто вернуть, но с учётом charset
      if (cs === "utf-8") return body;
      try {
        const bytes = Uint8Array.from(body, ch => ch.charCodeAt(0));
        return new TextDecoder(cs).decode(bytes);
      } catch { return body; }
    }
  } catch { return body; }
}

function parseContentType(v: string): { type: string; boundary?: string; charset?: string } {
  const type = (v.split(";")[0] || "").trim().toLowerCase();
  const boundaryMatch = v.match(/boundary\s*=\s*"?([^";\r\n]+)"?/i);
  const charsetMatch = v.match(/charset\s*=\s*"?([^";\r\n]+)"?/i);
  return {
    type,
    boundary: boundaryMatch ? boundaryMatch[1] : undefined,
    charset: charsetMatch ? charsetMatch[1] : undefined,
  };
}

/** Разбирает RFC822 и возвращает поля для сохранения в БД. */
export function parseRfc822(raw: string) {
  const { headers, body } = parseHeaders(raw);
  const subject = decodeMimeWord(headers["subject"] || "");
  const fromRaw = decodeMimeWord(headers["from"] || "");
  const toRaw = decodeMimeWord(headers["to"] || "");
  const fromMatch = fromRaw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/) || [null, "", fromRaw.trim()];
  const from_name = (fromMatch[1] || "").replace(/^"|"$/g, "").trim() || null;
  const from_email = (fromMatch[2] || fromRaw).trim().toLowerCase();
  const toMatch = toRaw.match(/<([^>]+)>/);
  const to_email = ((toMatch ? toMatch[1] : toRaw) || "").trim().toLowerCase();
  const message_id = (headers["message-id"] || "").trim() || null;
  const in_reply_to = (headers["in-reply-to"] || "").trim() || null;
  const references_ids = (headers["references"] || "").trim() || null;
  const dateStr = headers["date"];
  let received_at = new Date();
  if (dateStr) { const d = new Date(dateStr); if (!isNaN(d.getTime())) received_at = d; }

  const ct = parseContentType(headers["content-type"] || "text/plain");
  let body_text = ""; let body_html = "";

  if (ct.type.startsWith("multipart/") && ct.boundary) {
    const boundary = "--" + ct.boundary;
    const parts = body.split(boundary).slice(1, -1);
    for (const part of parts) {
      const { headers: ph, body: pb } = parseHeaders(part.replace(/^\r?\n/, ""));
      const pct = parseContentType(ph["content-type"] || "text/plain");
      const encp = ph["content-transfer-encoding"] || "7bit";
      const decoded = decodeBody(pb.trim(), encp, pct.charset || ct.charset || "utf-8");
      if (pct.type === "text/plain" && !body_text) body_text = decoded;
      else if (pct.type === "text/html" && !body_html) body_html = decoded;
    }
  } else {
    const enc = headers["content-transfer-encoding"] || "7bit";
    const decoded = decodeBody(body, enc, ct.charset || "utf-8");
    if (ct.type === "text/html") body_html = decoded;
    else body_text = decoded;
  }

  if (!body_text && body_html) {
    body_text = body_html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  return { subject, from_name, from_email, to_email, message_id, in_reply_to, references_ids, received_at, body_text, body_html };
}

