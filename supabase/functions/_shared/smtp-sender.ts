// Общий SMTP-отправитель для рассылок (UTF-8 кодировки, как в send-email)
import { checkRateLimit } from "./rate-limiter.ts";
import {
  assertEnvelopeAddress,
  assertSmtpCode,
  buildRawEmail,
  encodeFromHeaderValue,
  encodeSubjectHeader,
  isCompleteSmtpResponse,
  SMTP_EXPECTED,
  SMTP_RESPONSE_MAX_BYTES,
} from "./smtp-protocol.ts";

export function encodeSubject(subject: string): string {
  return encodeSubjectHeader(subject);
}

export function encodeFromHeader(from: string): string {
  return encodeFromHeaderValue(from);
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
  /** Готовый text/plain. Если не задан — генерируется из HTML. */
  text?: string;
  fromOverride?: string; // "Имя <email>"
  replyTo?: string;
  attachments?: Attachment[];
  extraHeaders?: Record<string, string>; // дополнительные заголовки (List-Unsubscribe, etc.)
}

const SMTP_STEP_TIMEOUT_MS = 25_000;

async function withSmtpTimeout<T>(operation: Promise<T>, context: string, close?: () => void): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      try { close?.(); } catch (_) { /* ignore close errors */ }
      reject(new Error(`SMTP timeout (${Math.round(SMTP_STEP_TIMEOUT_MS / 1000)}s): ${context}`));
    }, SMTP_STEP_TIMEOUT_MS);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

/**
 * Отправляет письмо через SMTP (TLS/SSL).
 * Бросает Error при неуспехе.
 */
export async function sendSmtpEmail(cfg: SmtpConfig, opts: SendOptions): Promise<void> {
  const senderFrom = opts.fromOverride
    || (cfg.from_name ? `${cfg.from_name} <${cfg.from_email}>` : cfg.from_email);
  const envelopeFrom = assertEnvelopeAddress(
    senderFrom.match(/<([^>]+)>/)?.[1] || cfg.from_email,
    "адресе отправителя",
  );
  const envelopeTo = assertEnvelopeAddress(opts.to, "адресе получателя");

  const { raw: rawEmail } = buildRawEmail({
    from: senderFrom,
    fromEmail: envelopeFrom,
    to: envelopeTo,
    subject: opts.subject,
    html: opts.html,
    text: opts.text || null,
    replyTo: opts.replyTo || null,
    extraHeaders: opts.extraHeaders || null,
    attachments: opts.attachments || null,
  });

  // Подключение: TLS сразу для 465; для 587/2525 — STARTTLS.
  const useImplicitTls = cfg.port === 465 || cfg.encryption === "ssl";
  const conn: Deno.Conn = await withSmtpTimeout(
    useImplicitTls
      ? Deno.connectTls({ hostname: cfg.host, port: cfg.port })
      : Deno.connect({ hostname: cfg.host, port: cfg.port }),
    `connect ${cfg.host}:${cfg.port}`,
  );

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let activeConn: Deno.Conn = conn;

  /**
   * Читает ответ до завершающей строки `NNN<space>...`.
   * EOF (read вернул null/0) до полного ответа — всегда Error.
   */
  async function readResponse(context: string): Promise<string> {
    let acc = "";
    while (true) {
      const chunk = new Uint8Array(4096);
      const n = await withSmtpTimeout(
        activeConn.read(chunk),
        `read SMTP response (${context})`,
        () => activeConn.close(),
      );
      if (n === null || n === 0) {
        throw new Error(`SMTP ${context}: соединение закрыто без полного ответа (EOF)`);
      }
      acc += decoder.decode(chunk.subarray(0, n), { stream: true });
      if (acc.length > SMTP_RESPONSE_MAX_BYTES) {
        throw new Error(`SMTP ${context}: ответ превышает допустимый размер`);
      }
      if (isCompleteSmtpResponse(acc)) return acc;
    }
  }

  /** Пишет команду и читает ответ. Текст команды в ошибках не раскрывается. */
  async function sendCommand(cmd: string, context: string): Promise<string> {
    await withSmtpTimeout(
      activeConn.write(encoder.encode(cmd + "\r\n")),
      `write SMTP command (${context})`,
      () => activeConn.close(),
    );
    return await readResponse(context);
  }

  try {
    let resp = await readResponse("greeting");
    assertSmtpCode(resp, [...SMTP_EXPECTED.greeting], "greeting");

    resp = await sendCommand("EHLO localhost", "EHLO");
    assertSmtpCode(resp, [...SMTP_EXPECTED.ehlo], "EHLO");

    // STARTTLS upgrade for 587/2525
    if (!useImplicitTls) {
      resp = await sendCommand("STARTTLS", "STARTTLS");
      assertSmtpCode(resp, [...SMTP_EXPECTED.starttls], "STARTTLS");
      activeConn = await withSmtpTimeout(
        Deno.startTls(activeConn as Deno.TcpConn, { hostname: cfg.host }),
        `STARTTLS ${cfg.host}`,
        () => activeConn.close(),
      );
      // повторный EHLO после TLS
      resp = await sendCommand("EHLO localhost", "EHLO after STARTTLS");
      assertSmtpCode(resp, [...SMTP_EXPECTED.ehlo], "EHLO after STARTTLS");
    }

    resp = await sendCommand("AUTH LOGIN", "AUTH LOGIN");
    assertSmtpCode(resp, [...SMTP_EXPECTED.authLogin], "AUTH LOGIN");
    // Значения ниже — секреты, они не логируются и не попадают в тексты ошибок.
    resp = await sendCommand(btoa(cfg.username), "AUTH user");
    assertSmtpCode(resp, [...SMTP_EXPECTED.authUser], "AUTH user");
    resp = await sendCommand(btoa(cfg.password), "AUTH pass");
    assertSmtpCode(resp, [...SMTP_EXPECTED.authPass], "AUTH pass");

    resp = await sendCommand(`MAIL FROM:<${envelopeFrom}>`, "MAIL FROM");
    assertSmtpCode(resp, [...SMTP_EXPECTED.mailFrom], "MAIL FROM");

    resp = await sendCommand(`RCPT TO:<${envelopeTo}>`, "RCPT TO");
    assertSmtpCode(resp, [...SMTP_EXPECTED.rcptTo], "RCPT TO");

    resp = await sendCommand("DATA", "DATA");
    assertSmtpCode(resp, [...SMTP_EXPECTED.data], "DATA");

    await withSmtpTimeout(
      activeConn.write(encoder.encode(rawEmail + "\r\n.\r\n")),
      "write SMTP DATA body",
      () => activeConn.close(),
    );
    // Успех фиксируется ТОЛЬКО при строгом 250 на end-of-data.
    resp = await readResponse("DATA body");
    assertSmtpCode(resp, [...SMTP_EXPECTED.dataBody], "DATA body");

    // QUIT — best effort: письмо уже принято сервером, ошибки здесь игнорируем.
    try {
      await sendCommand("QUIT", "QUIT");
    } catch (_) { /* ignore */ }
  } finally {
    try { activeConn.close(); } catch (_) { /* ignore */ }
  }
}


/**
 * Возвращает SMTP-конфиг платформы из env (SMTP_HOST/PORT/USER/PASS/FROM).
 * Кидает ошибку, если переменные не заданы.
 */
export function getPlatformSmtpConfig(): SmtpConfig {
  const host = Deno.env.get("SMTP_HOST");
  const portStr = Deno.env.get("SMTP_PORT");
  const username = Deno.env.get("SMTP_USER");
  const password = Deno.env.get("SMTP_PASS");
  const fromRaw = Deno.env.get("SMTP_FROM") || "noreply@sintagma.com.ru";

  if (!host || !portStr || !username || !password) {
    throw new Error("Platform SMTP is not configured (SMTP_HOST/PORT/USER/PASS missing)");
  }

  // SMTP_FROM может быть в виде "Имя <email>" либо просто email
  const match = fromRaw.match(/^(.+?)\s*<(.+)>$/);
  const from_email = match ? match[2].trim() : fromRaw.trim();
  const from_name = match ? match[1].trim() : null;

  return {
    host,
    port: parseInt(portStr, 10),
    username,
    password,
    encryption: parseInt(portStr, 10) === 465 ? "ssl" : "starttls",
    from_email,
    from_name,
  };
}

export interface PlatformEmailOptions extends Omit<SendOptions, "to"> {
  to: string;
  /** Ключ для rate-limit (по умолчанию `email:<to>`) */
  rateLimitKey?: string;
  /** Пропустить rate-limit (для cron-задач). По умолчанию false. */
  skipRateLimit?: boolean;
  /** Лимит запросов в окне (по умолчанию 20) */
  rateLimitMax?: number;
  /** Окно в секундах (по умолчанию 60) */
  rateLimitWindowSec?: number;
}

export interface PlatformEmailResult {
  ok: boolean;
  error?: string;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
}

/**
 * Отправляет письмо через платформенный SMTP (env SMTP_*).
 * Включает rate-limit по адресу получателя по умолчанию.
 * Возвращает результат вместо throw — удобно для batched-операций.
 */
export async function sendPlatformEmail(opts: PlatformEmailOptions): Promise<PlatformEmailResult> {
  if (!opts.skipRateLimit) {
    const rlKey = opts.rateLimitKey || `email:${opts.to}`;
    const rl = checkRateLimit(rlKey, {
      maxRequests: opts.rateLimitMax ?? 20,
      windowSeconds: opts.rateLimitWindowSec ?? 60,
    });
    if (!rl.allowed) {
      return { ok: false, rateLimited: true, retryAfterSeconds: rl.retryAfterSeconds, error: "Rate limit exceeded" };
    }
  }

  const supaUrl = Deno.env.get("SUPABASE_URL");
  const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  // 1) Пытаемся взять отправителя из пула email_sender_pool (LRU + суточный лимит)
  let poolSenderId: string | null = null;
  let cfg: SmtpConfig | null = null;
  if (supaUrl && supaKey) {
    try {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
      const admin = createClient(supaUrl, supaKey);
      const { data: picked } = await admin.rpc("pick_next_email_sender");
      const row = Array.isArray(picked) ? picked[0] : picked;
      if (row?.email && row?.app_password) {
        poolSenderId = row.id;
        cfg = {
          host: row.host,
          port: row.port,
          username: row.email,
          password: row.app_password,
          encryption: row.encryption,
          from_email: row.email,
          from_name: row.from_name || "Синтагма",
        };
      }
    } catch (_) { /* fallback ниже */ }
  }

  // 2) Fallback — платформенный SMTP из env
  if (!cfg) {
    try {
      cfg = getPlatformSmtpConfig();
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  const markResult = async (err: string | null) => {
    if (!poolSenderId || !supaUrl || !supaKey) return;
    try {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
      const admin = createClient(supaUrl, supaKey);
      await admin.rpc("mark_email_sender_result", { _sender_id: poolSenderId, _error: err });
    } catch (_) { /* ignore */ }
  };

  try {
    await sendSmtpEmail(cfg, {
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      fromOverride: opts.fromOverride,
      replyTo: opts.replyTo,
      attachments: opts.attachments,
      extraHeaders: opts.extraHeaders,
    });
    await markResult(null);
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message;
    await markResult(msg);
    return { ok: false, error: msg };
  }
}

/**
 * То же, что sendPlatformEmail, но throw'ает при ошибке.
 * Удобно когда верхний уровень и так оборачивает try/catch.
 */
export async function sendPlatformEmailOrThrow(opts: PlatformEmailOptions): Promise<void> {
  const res = await sendPlatformEmail(opts);
  if (!res.ok) {
    throw new Error(res.error || "Platform email send failed");
  }
}
