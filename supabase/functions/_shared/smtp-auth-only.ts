import { assertNoCrlf, assertSmtpCode, SMTP_RESPONSE_MAX_BYTES } from "./smtp-protocol.ts";

export interface AuthConnection {
  read(buffer: Uint8Array): Promise<number | null>;
  write(buffer: Uint8Array): Promise<number>;
  close(): void;
}
export interface AuthConnector {
  connect(tls: boolean, host: string, port: number): Promise<AuthConnection>;
  startTls(connection: AuthConnection, host: string): Promise<AuthConnection>;
}
export interface AuthConfig { host: string; port: number; security: string; username: string; password: string }

/** Connect, EHLO, optional STARTTLS, AUTH LOGIN, QUIT. Never sends a message. */
export async function smtpAuthOnly(cfg: AuthConfig, connector: AuthConnector, timeoutMs = 15_000): Promise<void> {
  assertNoCrlf(cfg.host, "SMTP host");
  let conn: AuthConnection | undefined;
  let incoming = "";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bounded = async <T>(operation: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([operation, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { try { conn?.close(); } catch { /* closed */ } reject(new Error("SMTP timeout")); }, timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  };
  const read = async (codes: number[], step: string) => {
    const bytes = new Uint8Array(4096);
    while (true) {
      const end = /(?:^|\n)\d{3}(?: [^\r\n]*)?\r?\n/.exec(incoming);
      if (end) {
        const length = end.index + end[0].length;
        const response = incoming.slice(0, length); incoming = incoming.slice(length);
        assertSmtpCode(response, codes, step); return;
      }
      const n = await bounded(conn!.read(bytes));
      if (n === null || n <= 0) throw new Error("SMTP connection closed");
      incoming += decoder.decode(bytes.subarray(0, n), { stream: true });
      if (incoming.length > SMTP_RESPONSE_MAX_BYTES) throw new Error("SMTP response exceeds limit");
    }
  };
  const write = async (line: string) => {
    const bytes = encoder.encode(line + "\r\n");
    let offset = 0;
    while (offset < bytes.length) {
      const n = await bounded(conn!.write(bytes.subarray(offset)));
      if (!Number.isInteger(n) || n <= 0 || n > bytes.length - offset) throw new Error("SMTP write failed");
      offset += n;
    }
  };
  try {
    conn = await bounded(connector.connect(cfg.security !== "starttls" && cfg.security !== "none", cfg.host, cfg.port));
    await read([220], "greeting"); await write(`EHLO ${cfg.host}`); await read([250], "EHLO");
    if (cfg.security === "starttls") {
      await write("STARTTLS"); await read([220], "STARTTLS");
      conn = await bounded(connector.startTls(conn, cfg.host)); incoming = "";
      await write(`EHLO ${cfg.host}`); await read([250], "EHLO after STARTTLS");
    }
    await write("AUTH LOGIN"); await read([334], "AUTH");
    await write(btoa(cfg.username)); await read([334], "AUTH username");
    await write(btoa(cfg.password)); await read([235], "authentication");
    await write("QUIT");
  } finally { try { conn?.close(); } catch { /* closed */ } }
}
