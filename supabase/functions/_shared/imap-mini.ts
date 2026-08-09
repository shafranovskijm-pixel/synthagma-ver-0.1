// Минимальный IMAP-клиент для прогрева почт.
// Умеет: LOGIN, LIST, SELECT, UID SEARCH HEADER, UID STORE, UID MOVE/COPY+EXPUNGE, LOGOUT.
// Работает поверх Deno.connectTls (порт 993). STARTTLS не поддерживается — везде используем ssl/993.

export interface ImapConfig {
  host: string;
  port: number;              // 993
  user: string;
  password: string;
}

type Conn = { conn: Deno.TlsConn; reader: ReadableStreamDefaultReader<Uint8Array>; buf: string };

const dec = new TextDecoder();
const enc = new TextEncoder();

async function readUntilTag(c: Conn, tag: string, timeoutMs = 20000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (!new RegExp(`(^|\\n)${tag} (OK|NO|BAD)`, "m").test(c.buf)) {
    if (Date.now() > deadline) throw new Error(`IMAP timeout waiting for ${tag}`);
    const { value, done } = await c.reader.read();
    if (done) throw new Error("IMAP connection closed");
    c.buf += dec.decode(value);
  }
  const idx = c.buf.search(new RegExp(`(^|\\n)${tag} (OK|NO|BAD)[^\\n]*\\n`, "m"));
  const endMatch = c.buf.slice(idx).match(new RegExp(`${tag} (OK|NO|BAD)[^\\n]*\\n`));
  const end = idx + (endMatch ? endMatch[0].length + (idx === 0 ? 0 : 1) : 0);
  const chunk = c.buf.slice(0, end);
  c.buf = c.buf.slice(end);
  return chunk;
}

async function send(c: Conn, line: string) {
  await c.conn.write(enc.encode(line + "\r\n"));
}

let tagCounter = 0;
function nextTag() { tagCounter = (tagCounter + 1) % 100000; return "A" + tagCounter.toString().padStart(4, "0"); }

async function cmd(c: Conn, command: string): Promise<string> {
  const tag = nextTag();
  await send(c, `${tag} ${command}`);
  const resp = await readUntilTag(c, tag);
  if (!new RegExp(`${tag} OK`, "m").test(resp)) {
    throw new Error(`IMAP ${command.split(" ")[0]} failed: ${resp.trim().slice(0, 300)}`);
  }
  return resp;
}

export async function connectImap(cfg: ImapConfig): Promise<Conn> {
  const conn = await Deno.connectTls({ hostname: cfg.host, port: cfg.port });
  const reader = conn.readable.getReader();
  const c: Conn = { conn, reader, buf: "" };
  // прочитать приветствие
  const deadline = Date.now() + 10000;
  while (!/\* OK/.test(c.buf)) {
    if (Date.now() > deadline) throw new Error("IMAP greeting timeout");
    const { value, done } = await reader.read();
    if (done) throw new Error("IMAP closed on greeting");
    c.buf += dec.decode(value);
  }
  // очистить всё до конца приветствия
  const nl = c.buf.indexOf("\n");
  if (nl >= 0) c.buf = c.buf.slice(nl + 1);
  // LOGIN
  const escP = cfg.password.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escU = cfg.user.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  await cmd(c, `LOGIN "${escU}" "${escP}"`);
  return c;
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

async function selectFolder(c: Conn, folder: string) {
  const safe = folder.replace(/"/g, '\\"');
  await cmd(c, `SELECT "${safe}"`);
}

async function examineFolder(c: Conn, folder: string) {
  const safe = folder.replace(/"/g, '\\"');
  await cmd(c, `EXAMINE "${safe}"`);
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
  if (await searchWarmup(c, warmupId)) return "inbox";

  const spam = await findSpamFolder(c);
  if (!spam) return "missing";
  await examineFolder(c, spam);
  return (await searchWarmup(c, warmupId)) ? "spam" : "missing";
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
  const from = Math.max(1, sinceUid + 1);
  const resp = await cmd(c, `UID SEARCH UID ${from}:*`);
  const m = resp.match(/\* SEARCH([^\r\n]*)/);
  if (!m) return [];
  const parts = m[1].trim().split(/\s+/).filter(Boolean).map(x => parseInt(x, 10)).filter(x => !isNaN(x) && x > sinceUid);
  return parts.sort((a, b) => a - b);
}

/** Скачивает RFC822 для указанного UID (первые ~64KB). */
export async function fetchRfc822(c: Conn, uid: number, maxBytes = 65536): Promise<string | null> {
  const tag = nextTag();
  await send(c, `${tag} UID FETCH ${uid} (BODY.PEEK[]<0.${maxBytes}>)`);
  // Ответ literal имеет форму: * <seq> FETCH (UID <uid> BODY[]<0> {<N>}\r\n<N bytes>...)
  const deadline = Date.now() + 30000;
  // Читаем пока не встретим тег OK/NO/BAD
  while (!new RegExp(`(^|\\n)${tag} (OK|NO|BAD)`, "m").test(c.buf)) {
    if (Date.now() > deadline) throw new Error(`IMAP FETCH timeout uid ${uid}`);
    const { value, done } = await c.reader.read();
    if (done) throw new Error("IMAP closed during FETCH");
    c.buf += dec.decode(value);
  }
  const idx = c.buf.search(new RegExp(`${tag} (OK|NO|BAD)`, "m"));
  const chunk = c.buf.slice(0, idx);
  c.buf = c.buf.slice(idx).replace(new RegExp(`^${tag} [^\\n]*\\n?`), "");
  // Ищем literal {N}\r\n
  const litMatch = chunk.match(/\{(\d+)\}\r\n/);
  if (!litMatch) return null;
  const startIdx = chunk.indexOf(litMatch[0]) + litMatch[0].length;
  const n = parseInt(litMatch[1], 10);
  const raw = chunk.slice(startIdx, startIdx + n);
  return raw;
}

function nextTagExport() { return nextTag(); }

/** SELECT INBOX и вернуть новые UID > sinceUid. */
export async function scanInbox(c: Conn, sinceUid: number, limit = 30): Promise<RawImapMessage[]> {
  await selectFolder(c, "INBOX");
  const uids = (await searchUidsSince(c, sinceUid)).slice(0, limit);
  const out: RawImapMessage[] = [];
  for (const uid of uids) {
    try {
      const raw = await fetchRfc822(c, uid);
      if (raw) out.push({ uid, raw });
    } catch { /* пропускаем битые */ }
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
        const decoded = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m: string, h: string) => String.fromCharCode(parseInt(h, 16)));
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

