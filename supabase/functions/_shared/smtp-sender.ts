// Общий SMTP-отправитель для рассылок (UTF-8 кодировки, как в send-email)

function base64Encode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

export function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${base64Encode(subject)}?=`;
}

export function encodeFromHeader(from: string): string {
  const match = from.match(/^(.+?)\s*<(.+)>$/);
  if (match) {
    return `=?UTF-8?B?${base64Encode(match[1].trim())}?= <${match[2].trim()}>`;
  }
  return from;
}

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption?: string; // tls | ssl | starttls
  from_email: string;
  from_name?: string | null;
}

export interface Attachment {
  filename: string;
  content: string;       // raw text content (will be base64-encoded)
  contentType: string;   // e.g. "text/calendar; method=REQUEST; charset=UTF-8"
}

export interface SendOptions {
  to: string;
  subject: string;
  html: string;
  fromOverride?: string; // "Имя <email>"
  replyTo?: string;
  attachments?: Attachment[];
}

/**
 * Отправляет письмо через SMTP (TLS/SSL).
 * Бросает Error при неуспехе.
 */
export async function sendSmtpEmail(cfg: SmtpConfig, opts: SendOptions): Promise<void> {
  const senderFrom = opts.fromOverride
    || (cfg.from_name ? `${cfg.from_name} <${cfg.from_email}>` : cfg.from_email);
  const encodedSubject = encodeSubject(opts.subject);
  const encodedFrom = encodeFromHeader(senderFrom);
  const encodedHtml = base64Encode(opts.html);
  const hasAttachments = !!(opts.attachments && opts.attachments.length > 0);

  const baseHeaders = [
    `From: ${encodedFrom}`,
    `To: ${opts.to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
  ];
  if (opts.replyTo) baseHeaders.push(`Reply-To: ${opts.replyTo}`);

  let rawEmail: string;
  if (!hasAttachments) {
    const headers = [
      ...baseHeaders,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
    ];
    rawEmail = [
      ...headers,
      ``,
      encodedHtml.match(/.{1,76}/g)?.join("\r\n") || encodedHtml,
    ].join("\r\n");
  } else {
    const boundary = `=_b_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    const parts: string[] = [];
    parts.push(
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      encodedHtml.match(/.{1,76}/g)?.join("\r\n") || encodedHtml,
    );
    for (const att of opts.attachments!) {
      const encoded = base64Encode(att.content);
      parts.push(
        `--${boundary}`,
        `Content-Type: ${att.contentType}; name="${att.filename}"`,
        `Content-Transfer-Encoding: base64`,
        `Content-Disposition: attachment; filename="${att.filename}"`,
        ``,
        encoded.match(/.{1,76}/g)?.join("\r\n") || encoded,
      );
    }
    parts.push(`--${boundary}--`);
    const headers = [
      ...baseHeaders,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ];
    rawEmail = [...headers, ``, ...parts].join("\r\n");
  }

  // Подключение: TLS сразу для 465; для 587/2525 — STARTTLS.
  const useImplicitTls = cfg.port === 465 || cfg.encryption === "ssl";
  const conn: Deno.Conn = useImplicitTls
    ? await Deno.connectTls({ hostname: cfg.host, port: cfg.port })
    : await Deno.connect({ hostname: cfg.host, port: cfg.port });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let activeConn: Deno.Conn = conn;

  async function readResponse(): Promise<string> {
    const buffer = new Uint8Array(4096);
    const n = await activeConn.read(buffer);
    if (n === null) return "";
    return decoder.decode(buffer.subarray(0, n));
  }

  async function sendCommand(cmd: string): Promise<string> {
    await activeConn.write(encoder.encode(cmd + "\r\n"));
    return await readResponse();
  }

  function checkOk(resp: string, ctx: string) {
    const code = parseInt(resp.match(/^(\d+)/)?.[1] || "0", 10);
    if (code >= 400) {
      throw new Error(`SMTP ${ctx} failed: ${resp.trim()}`);
    }
  }

  try {
    let resp = await readResponse(); // greeting
    checkOk(resp, "greeting");

    resp = await sendCommand("EHLO localhost");
    checkOk(resp, "EHLO");

    // STARTTLS upgrade for 587/2525
    if (!useImplicitTls) {
      resp = await sendCommand("STARTTLS");
      checkOk(resp, "STARTTLS");
      activeConn = await Deno.startTls(activeConn as Deno.TcpConn, { hostname: cfg.host });
      // повторный EHLO после TLS
      resp = await sendCommand("EHLO localhost");
      checkOk(resp, "EHLO after STARTTLS");
    }

    resp = await sendCommand("AUTH LOGIN");
    checkOk(resp, "AUTH LOGIN");
    resp = await sendCommand(btoa(cfg.username));
    checkOk(resp, "AUTH user");
    resp = await sendCommand(btoa(cfg.password));
    checkOk(resp, "AUTH pass");

    const emailMatch = senderFrom.match(/<([^>]+)>/) || [null, cfg.from_email];
    const fromEmail = emailMatch[1] || cfg.from_email;

    resp = await sendCommand(`MAIL FROM:<${fromEmail}>`);
    checkOk(resp, "MAIL FROM");

    resp = await sendCommand(`RCPT TO:<${opts.to}>`);
    checkOk(resp, "RCPT TO");

    resp = await sendCommand("DATA");
    if (!resp.startsWith("354")) checkOk(resp, "DATA");

    await activeConn.write(encoder.encode(rawEmail + "\r\n.\r\n"));
    resp = await readResponse();
    checkOk(resp, "DATA body");

    await sendCommand("QUIT");
  } finally {
    try { activeConn.close(); } catch (_) { /* ignore */ }
  }
}
