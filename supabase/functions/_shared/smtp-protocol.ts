/**
 * Чистые (runtime-независимые) хелперы SMTP: разбор ответов сервера, проверка
 * ожидаемых кодов, сборка RFC 5322 сообщения, dot-stuffing и защита заголовков
 * от CR/LF injection. Никаких Deno/сетевых зависимостей — модуль покрыт unit-тестами.
 *
 * Безопасность: здесь нет логирования. Пароли, AUTH-payload, адрес получателя и
 * тело письма никогда не попадают в текст ошибок.
 */

export const SMTP_RESPONSE_MAX_BYTES = 64 * 1024;

export interface SmtpResponse {
  /** Числовой код завершающей строки. */
  code: number;
  /** Строки ответа без CRLF. */
  lines: string[];
  /** Полный текст ответа (для завершающей строки). */
  raw: string;
}

const RESPONSE_LINE_RE = /^(\d{3})([ -])?(.*)$/;

/**
 * Ответ считается полным, только если есть строка вида `NNN<space>...` (или ровно
 * `NNN`) — то есть завершающая строка multi-line ответа получена целиком.
 */
export function isCompleteSmtpResponse(buffer: string): boolean {
  if (!buffer.includes("\n")) return false;
  const lines = buffer.split(/\r?\n/);
  // последний элемент после финального \n — незавершённый остаток, игнорируем
  const complete = buffer.endsWith("\n") ? lines.slice(0, -1) : lines.slice(0, -1);
  for (const line of complete) {
    const m = RESPONSE_LINE_RE.exec(line);
    if (!m) continue;
    if (m[2] !== "-") return true;
  }
  return false;
}

/**
 * Разбирает single-line и multi-line SMTP-ответ.
 * Пустой (EOF), непарсируемый или незавершённый ответ — всегда Error.
 */
export function parseSmtpResponse(buffer: string, context = "SMTP"): SmtpResponse {
  if (!buffer || buffer.trim() === "") {
    throw new Error(`SMTP ${context}: соединение закрыто без ответа (EOF)`);
  }
  if (buffer.length > SMTP_RESPONSE_MAX_BYTES) {
    throw new Error(`SMTP ${context}: ответ превышает лимит ${SMTP_RESPONSE_MAX_BYTES} байт`);
  }
  const lines = buffer.split(/\r?\n/).filter((l) => l !== "");
  if (lines.length === 0) {
    throw new Error(`SMTP ${context}: пустой ответ`);
  }
  let last: RegExpExecArray | null = null;
  for (const line of lines) {
    const m = RESPONSE_LINE_RE.exec(line);
    if (!m) {
      throw new Error(`SMTP ${context}: непарсируемый ответ`);
    }
    if (m[2] !== "-") last = m;
  }
  if (!last) {
    throw new Error(`SMTP ${context}: незавершённый multi-line ответ`);
  }
  const code = parseInt(last[1], 10);
  if (!Number.isFinite(code) || code < 200 || code > 599) {
    throw new Error(`SMTP ${context}: некорректный код ответа`);
  }
  return { code, lines, raw: last[0] };
}

/** Проверяет, что код ответа входит в список ожидаемых для шага. */
export function assertSmtpCode(buffer: string, expected: number[], context: string): SmtpResponse {
  const resp = parseSmtpResponse(buffer, context);
  if (!expected.includes(resp.code)) {
    throw new Error(`SMTP ${context} failed: ожидался ${expected.join("/")}, получен ${resp.code}`);
  }
  return resp;
}

/** Ожидаемые коды по шагам протокола. */
export const SMTP_EXPECTED = {
  greeting: [220],
  ehlo: [250],
  starttls: [220],
  authLogin: [334],
  authUser: [334],
  authPass: [235],
  mailFrom: [250, 251],
  rcptTo: [250, 251],
  data: [354],
  dataBody: [250],
  quit: [221],
} as const;

/** Запрещает CR/LF (header/command injection) в значении. */
export function assertNoCrlf(value: string, label: string): string {
  if (/[\r\n\u0000]/.test(value)) {
    throw new Error(`Недопустимые управляющие символы в ${label}`);
  }
  return value;
}

/** Санитизирует значение заголовка: CR/LF складываются в пробел. */
export function sanitizeHeaderValue(value: unknown): string {
  return String(value ?? "").replace(/[\r\n\u0000]+/g, " ").trim();
}

/** Валидирует адрес для конверта (MAIL FROM / RCPT TO / To:). */
export function assertEnvelopeAddress(email: string, label: string): string {
  const value = String(email ?? "").trim();
  assertNoCrlf(value, label);
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/.test(value)) {
    throw new Error(`Некорректный адрес в ${label}`);
  }
  return value;
}

/** RFC 5322 dot-stuffing: строка, начинающаяся с точки, дублирует точку. */
export function dotStuff(body: string): string {
  return body
    .split(/\r\n|\n|\r/)
    .map((line) => (line.startsWith(".") ? "." + line : line))
    .join("\r\n");
}

/** RFC 5322 Date заголовок. */
export function rfc2822Date(date: Date = new Date()): string {
  return date.toUTCString().replace(/GMT$/, "+0000");
}

/** Уникальный Message-ID вида <uuid@domain>. */
export function buildMessageId(fromEmail: string, uuid?: string): string {
  const domain = String(fromEmail || "").split("@")[1]?.trim().toLowerCase() || "localhost";
  assertNoCrlf(domain, "домене отправителя");
  const id = uuid
    || (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  return `<${id}@${domain}>`;
}

function base64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

export function encodeSubjectHeader(subject: string): string {
  return `=?UTF-8?B?${base64(assertNoCrlf(String(subject ?? ""), "теме письма"))}?=`;
}

export function encodeFromHeaderValue(from: string): string {
  assertNoCrlf(from, "адресе отправителя");
  const match = from.match(/^(.+?)\s*<(.+)>$/);
  if (match) {
    return `=?UTF-8?B?${base64(match[1].trim())}?= <${match[2].trim()}>`;
  }
  return from;
}

/** Уже полноценный HTML-документ? (есть <html> и/или doctype) */
export function isFullHtmlDocument(html: string): boolean {
  const s = String(html ?? "");
  return /<!doctype\s+html/i.test(s) || /<html[\s>]/i.test(s);
}

/**
 * Оборачивает фрагмент в полноценный HTML-документ.
 * Если шаблон уже full document — возвращается без изменений (без двойного wrapper).
 * Лечит SpamAssassin HTML_MIME_NO_HTML_TAG.
 */
export function ensureFullHtmlDocument(html: string, title?: string): string {
  const body = String(html ?? "");
  if (isFullHtmlDocument(body)) return body;
  const safeTitle = sanitizeHeaderValue(title || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return [
    "<!doctype html>",
    '<html lang="ru">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    safeTitle ? `<title>${safeTitle}</title>` : "",
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
  ]
    .filter(Boolean)
    .join("\r\n");
}

/**
 * Безопасно строит text/plain из HTML: скрипты/стили удаляются,
 * ссылки разворачиваются в «текст (url)», сущности декодируются.
 */
export function htmlToPlainText(html: string): string {
  let s = String(html ?? "");
  s = s.replace(/<!doctype[^>]*>/gi, "");
  s = s.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|tr|li|h[1-6]|table|section)\s*>/gi, "\n\n");
  s = s.replace(/<li\b[^>]*>/gi, "• ");
  s = s.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => {
    const label = String(text).replace(/<[^>]+>/g, "").trim();
    const url = String(href).trim();
    if (!url || url.startsWith("#") || /^cid:/i.test(url)) return label;
    return label && label !== url ? `${label} (${url})` : url;
  });
  s = s.replace(/<img\b[^>]*>/gi, "");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&laquo;/gi, "«")
    .replace(/&raquo;/gi, "»")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–");
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/ *\n */g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

export interface BuildMessageParams {
  from: string;              // "Имя <email>" либо email
  fromEmail: string;         // адрес конверта для Message-ID домена
  to: string;
  subject: string;
  html: string;
  /** Готовый text/plain. Если не задан — генерируется из HTML. */
  text?: string | null;
  replyTo?: string | null;
  extraHeaders?: Record<string, string> | null;
  attachments?: { filename: string; content: string; contentType: string }[] | null;
  date?: Date;
  messageId?: string;
  boundary?: string;
  altBoundary?: string;
}

const randomBoundary = (prefix: string) =>
  `=_${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;

/** Собирает готовое к DATA сообщение (уже с dot-stuffing и CRLF). */
export function buildRawEmail(p: BuildMessageParams): { raw: string; messageId: string } {
  const to = assertEnvelopeAddress(p.to, "поле To");
  const messageId = p.messageId ? assertNoCrlf(p.messageId, "Message-ID") : buildMessageId(p.fromEmail);

  const baseHeaders = [
    `From: ${encodeFromHeaderValue(p.from)}`,
    `To: ${to}`,
    `Subject: ${encodeSubjectHeader(p.subject)}`,
    `Date: ${rfc2822Date(p.date)}`,
    `Message-ID: ${messageId}`,
    `MIME-Version: 1.0`,
  ];
  if (p.replyTo) baseHeaders.push(`Reply-To: ${assertEnvelopeAddress(p.replyTo, "поле Reply-To")}`);
  if (p.extraHeaders) {
    for (const [k, v] of Object.entries(p.extraHeaders)) {
      const key = assertNoCrlf(String(k), "имени заголовка");
      const value = sanitizeHeaderValue(v);
      if (!value) continue;
      baseHeaders.push(`${key}: ${value}`);
    }
  }

  const htmlDoc = ensureFullHtmlDocument(String(p.html ?? ""), p.subject);
  const plain = (p.text && String(p.text).trim()) || htmlToPlainText(htmlDoc);

  const wrap = (s: string) => s.match(/.{1,76}/g)?.join("\r\n") || s;
  const attachments = p.attachments || [];
  const altBoundary = p.altBoundary || randomBoundary("alt");

  // multipart/alternative: text/plain + text/html (лечит MIME_HTML_ONLY)
  const altBlock = [
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    ``,
    `--${altBoundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    wrap(base64(plain)),
    `--${altBoundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    wrap(base64(htmlDoc)),
    `--${altBoundary}--`,
  ];

  let raw: string;
  if (attachments.length === 0) {
    raw = [...baseHeaders, ...altBlock].join("\r\n");
  } else {
    const boundary = p.boundary || randomBoundary("mix");
    const parts: string[] = [`--${boundary}`, ...altBlock];
    for (const att of attachments) {
      const filename = sanitizeHeaderValue(att.filename).replace(/"/g, "");
      const contentType = sanitizeHeaderValue(att.contentType);
      parts.push(
        `--${boundary}`,
        `Content-Type: ${contentType}; name="${filename}"`,
        `Content-Transfer-Encoding: base64`,
        `Content-Disposition: attachment; filename="${filename}"`,
        ``,
        wrap(base64(att.content)),
      );
    }
    parts.push(`--${boundary}--`);
    raw = [...baseHeaders, `Content-Type: multipart/mixed; boundary="${boundary}"`, ``, ...parts].join("\r\n");
  }

  return { raw: dotStuff(raw), messageId };
}

