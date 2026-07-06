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
