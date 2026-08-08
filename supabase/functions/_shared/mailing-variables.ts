/**
 * Общий renderer/allowlist переменных писем для edge-функций.
 *
 * ВАЖНО: список ключей — копия `src/lib/mailing/variableRegistry.ts`
 * (edge-функции не могут импортировать код из `src/`). Идентичность списков
 * проверяется unit-тестом `src/lib/mailing/__tests__/mailingRenderer.test.ts`.
 *
 * Здесь нет логирования: значения переменных (адреса, тела писем) никогда
 * не попадают в консоль.
 */

export const CORE_MAILING_VARIABLE_KEYS = [
  "first_name",
  "last_name",
  "organization",
  "position",
  "city",
  "email",
  "unsubscribe_url",
] as const;

export const LEGACY_MAILING_VARIABLE_KEYS = [
  "name",
  "recipient_name",
  "company",
  "org_name",
  "plan",
  "course_count",
  "last_login",
  "webinar_url",
  "webinar_title",
  "webinar_date",
  "webinar_time",
  "course_name",
  "course_duration",
  "course_price",
  "course_url",
  "date",
  "time",
  "host_name",
] as const;

export const ALL_MAILING_VARIABLE_KEYS: readonly string[] = [
  ...CORE_MAILING_VARIABLE_KEYS,
  ...LEGACY_MAILING_VARIABLE_KEYS,
];

export const URL_MAILING_VARIABLE_KEYS: readonly string[] = [
  "unsubscribe_url",
  "webinar_url",
  "course_url",
];

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function escapeHtmlValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RenderOptions {
  /** HTML-экранировать значения (для html_body). Для subject — false. */
  escapeHtml?: boolean;
  /**
   * Что делать с токенами, для которых нет значения:
   *  - "keep"  — оставить {{token}} (поведение реальных кампаний);
   *  - "strip" — заменить пустой строкой (seed: письмо без «сырых» токенов).
   */
  unresolved?: "keep" | "strip";
}

/** Подставляет значения переменных в шаблон. */
export function renderMailingTemplate(
  template: string,
  values: Record<string, string>,
  opts: RenderOptions = {},
): string {
  const escape = opts.escapeHtml !== false;
  const unresolved = opts.unresolved || "keep";
  return String(template ?? "").replace(VAR_RE, (full, key: string) => {
    const raw = values[key];
    if (raw === undefined) return unresolved === "strip" ? "" : full;
    if (!escape || URL_MAILING_VARIABLE_KEYS.includes(key)) return raw;
    return escapeHtmlValue(raw);
  });
}

/** Остались ли в тексте неразрешённые токены {{...}}. */
export function hasUnresolvedTokens(text: string): boolean {
  return new RegExp(VAR_RE.source).test(String(text ?? ""));
}

export interface SeedVariableContext {
  seedEmail: string;
  organizationName?: string | null;
  fromName?: string | null;
  fromEmail: string;
  /** Безопасная ссылка отписки для seed (без реального контакта). */
  unsubscribeUrl?: string | null;
}

/**
 * Детерминированные значения ВСЕХ поддерживаемых переменных для seed-теста.
 * У seed нет карточки контакта, поэтому имя — «Коллега», необязательные поля пусты.
 */
export function buildSeedVariableValues(ctx: SeedVariableContext): Record<string, string> {
  const org = (ctx.organizationName || ctx.fromName || "").trim();
  const unsubscribe = (ctx.unsubscribeUrl || "").trim()
    || buildSeedUnsubscribeMailto(ctx.fromEmail);
  const values: Record<string, string> = {};
  for (const key of ALL_MAILING_VARIABLE_KEYS) values[key] = "";
  values.first_name = "Коллега";
  values.name = "Коллега";
  values.recipient_name = "Коллега";
  values.last_name = "";
  values.position = "";
  values.city = "";
  values.organization = org;
  values.org_name = org;
  values.company = org;
  values.email = ctx.seedEmail;
  values.unsubscribe_url = unsubscribe;
  return values;
}

/** Безопасный mailto для seed-отписки (реальный контакт не создаётся). */
export function buildSeedUnsubscribeMailto(fromEmail: string): string {
  const addr = String(fromEmail || "").trim();
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/.test(addr)) return "";
  return `mailto:${addr}?subject=unsubscribe`;
}

/**
 * Заголовки List-Unsubscribe. URL допускается только http(s)/mailto.
 * Возвращает {} если нечего добавить — заголовок не должен быть пустым.
 */
export function buildListUnsubscribeHeaders(args: {
  unsubscribeUrl?: string | null;
  fromEmail?: string | null;
  oneClick?: boolean;
}): Record<string, string> {
  const parts: string[] = [];
  const url = String(args.unsubscribeUrl || "").trim();
  const safeUrl = url && /^(https?:\/\/|mailto:)/i.test(url) && !/[\s<>\r\n,]/.test(url) ? url : "";
  if (safeUrl) parts.push(`<${safeUrl}>`);
  const mailto = buildSeedUnsubscribeMailto(String(args.fromEmail || ""));
  if (mailto && !safeUrl.startsWith("mailto:")) parts.push(`<${mailto}>`);
  if (parts.length === 0) return {};
  const headers: Record<string, string> = { "List-Unsubscribe": parts.join(", ") };
  if (args.oneClick && /^<https?:\/\//i.test(parts[0])) {
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return headers;
}
