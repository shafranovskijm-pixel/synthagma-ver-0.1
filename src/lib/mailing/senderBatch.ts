export interface SenderBatchRow {
  email: string;
  password: string;
}

export interface SenderBatchParseResult {
  rows: SenderBatchRow[];
  duplicateCount: number;
  invalidLines: number[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseSenderBatch(raw: string, maxRows = 500): SenderBatchParseResult {
  const rows: SenderBatchRow[] = [];
  const invalidLines: number[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;

  raw.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const match = /^(\S+)\s+(.+)$/.exec(trimmed);
    const email = (match?.[1] || "").trim().toLowerCase();
    const password = (match?.[2] || "").trim();
    if (!EMAIL_RE.test(email) || !password || /\s/.test(password)) {
      invalidLines.push(index + 1);
      return;
    }
    if (seen.has(email)) {
      duplicateCount += 1;
      return;
    }
    seen.add(email);
    rows.push({ email, password });
  });

  if (rows.length > maxRows) throw new Error(`Слишком много отправителей: максимум ${maxRows}`);
  return { rows, duplicateCount, invalidLines };
}

export function senderRowsForRpc(rows: SenderBatchRow[]) {
  return rows.map(({ email, password }) => ({
    email,
    password,
    label: email,
    from_name: "Развитие 2000",
    smtp_host: "mail.torgi.com.ru",
    smtp_port: 465,
    smtp_security: "ssl",
    smtp_username: email,
    imap_host: "mail.torgi.com.ru",
    imap_port: 993,
    imap_security: "ssl",
    imap_username: email,
    daily_limit: 2,
    preset_key: "torgi",
  }));
}

export function chunkSenderRows<T>(rows: T[], size = 50): T[][] {
  if (!Number.isInteger(size) || size < 1 || size > 50) throw new Error("Некорректный размер пакета");
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks;
}
