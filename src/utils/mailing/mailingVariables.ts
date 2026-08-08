/**
 * Этап 2 «Рассылки»: единый контракт переменных письма.
 *
 * Значения берутся из строки получателя (email_campaign_recipients) и её
 * custom_data. Любая неизвестная переменная блокирует тест/запуск — это
 * защищает от писем с «{{сырыми}}» подстановками.
 */

export interface RecipientLike {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  organization?: string | null;
  position?: string | null;
  city?: string | null;
  recipient_name?: string | null;
  custom_data?: Record<string, unknown> | null;
}

export interface VariableDef {
  key: string;
  label: string;
  example: string;
}

import { LEGACY_MAILING_VARIABLE_KEYS } from "@/lib/mailing/variableRegistry";

/** Переменные, доступные в кабинете рассылок (этап 2). */
export const MAILING_VARIABLES: VariableDef[] = [
  { key: "first_name", label: "Имя", example: "Иван" },
  { key: "last_name", label: "Фамилия", example: "Иванов" },
  { key: "organization", label: "Организация", example: "ООО «Пример»" },
  { key: "position", label: "Должность", example: "Специалист по охране труда" },
  { key: "city", label: "Город", example: "Москва" },
  { key: "email", label: "Email", example: "ivan@example.com" },
  { key: "unsubscribe_url", label: "Ссылка отписки", example: "https://example.com/unsubscribe" },
];

/**
 * Переменные, которые исторически поддерживает send-campaign-email
 * (вебинары, курсы, метаданные организации). Единый источник — реестр.
 */
export const LEGACY_VARIABLES: string[] = [...LEGACY_MAILING_VARIABLE_KEYS];

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** Все переменные, встречающиеся в тексте (в порядке появления, без дублей). */
export function extractVariables(...parts: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const m of part.matchAll(VAR_RE)) {
      const key = m[1];
      if (!out.includes(key)) out.push(key);
    }
  }
  return out;
}

export interface VariableValidation {
  ok: boolean;
  used: string[];
  unknown: string[];
}

/**
 * @param customKeys ключи из custom_data получателей — считаются известными.
 */
export function validateVariables(
  text: string | null | undefined,
  subject?: string | null,
  customKeys: string[] = [],
): VariableValidation {
  const known = new Set<string>([
    ...MAILING_VARIABLES.map((v) => v.key),
    ...LEGACY_VARIABLES,
    ...customKeys.map((k) => k.trim()).filter(Boolean),
  ]);
  const used = extractVariables(text, subject);
  const unknown = used.filter((k) => !known.has(k));
  return { ok: unknown.length === 0, used, unknown };
}

/** HTML-экранирование пользовательских значений (защита от инъекции в письмо). */
export function escapeHtmlValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Плоская карта значений переменных для получателя. */
export function buildVariableValues(
  recipient: RecipientLike,
  extra: Record<string, unknown> = {},
): Record<string, string> {
  const first = recipient.first_name || "";
  const last = recipient.last_name || "";
  const fullName = [first, last].filter(Boolean).join(" ") || recipient.recipient_name || "";

  const values: Record<string, string> = {
    first_name: first,
    last_name: last,
    organization: recipient.organization || "",
    position: recipient.position || "",
    city: recipient.city || "",
    email: recipient.email || "",
    name: fullName,
    recipient_name: fullName,
    company: recipient.organization || recipient.recipient_name || "",
  };

  const custom = recipient.custom_data || {};
  for (const [k, v] of Object.entries(custom)) {
    if (values[k] === undefined || values[k] === "") values[k] = v === null || v === undefined ? "" : String(v);
  }
  for (const [k, v] of Object.entries(extra)) {
    values[k] = v === null || v === undefined ? "" : String(v);
  }
  return values;
}

/**
 * Подставляет значения переменных с HTML-экранированием.
 * Переменные, для которых нет значения, заменяются пустой строкой —
 * запуск с неизвестными переменными блокируется раньше, на валидации.
 */
export function renderTemplate(
  template: string,
  recipient: RecipientLike,
  extra: Record<string, unknown> = {},
): string {
  const values = buildVariableValues(recipient, extra);
  return template.replace(VAR_RE, (full, key: string) => {
    const raw = values[key];
    if (raw === undefined) return full;
    return escapeHtmlValue(raw);
  });
}

/** Пример получателя для предпросмотра, если реальный не выбран. */
export function samplePreviewRecipient(): RecipientLike {
  return {
    email: "ivan@example.com",
    first_name: "Иван",
    last_name: "Иванов",
    organization: "ООО «Пример»",
    position: "Специалист по охране труда",
    city: "Москва",
    custom_data: {},
  };
}
