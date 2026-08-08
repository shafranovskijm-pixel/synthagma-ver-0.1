/**
 * Переменные писем сервиса рассылок СИНТАГМА.
 * Единый источник истины: используется и в редакторе, и в валидации запуска,
 * и в предпросмотре по конкретному контакту.
 */

import { CORE_MAILING_VARIABLE_KEYS } from "./variableRegistry";

export const MAILING_VARIABLES = CORE_MAILING_VARIABLE_KEYS;

export type MailingVariable = (typeof MAILING_VARIABLES)[number];

export const MAILING_VARIABLE_LABELS: Record<MailingVariable, string> = {
  first_name: "Имя",
  last_name: "Фамилия",
  organization: "Организация",
  position: "Должность",
  city: "Город",
  email: "Email",
  unsubscribe_url: "Ссылка отписки",
};

export interface MailingContactLike {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  organization?: string | null;
  position?: string | null;
  city?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** Все переменные из текста в порядке появления, без повторов. */
export function extractVariables(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(VAR_RE)) {
    const key = m[1];
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

/**
 * Переменные, которые система не сможет подставить.
 * `extraKnown` — ключи custom_fields, реально присутствующие в базе контактов.
 */
export function findUnknownVariables(
  texts: Array<string | null | undefined>,
  extraKnown: string[] = [],
): string[] {
  const known = new Set<string>([...MAILING_VARIABLES, ...extraKnown]);
  const unknown: string[] = [];
  for (const text of texts) {
    for (const v of extractVariables(text)) {
      if (!known.has(v) && !unknown.includes(v)) unknown.push(v);
    }
  }
  return unknown;
}

/** Подстановка значений контакта. Отсутствующие значения дают пустую строку. */
export function renderVariables(
  text: string | null | undefined,
  contact: MailingContactLike | null,
  opts: { unsubscribeUrl?: string } = {},
): string {
  if (!text) return "";
  const custom = (contact?.custom_fields ?? {}) as Record<string, unknown>;
  return text.replace(VAR_RE, (_full, rawKey: string) => {
    const key = rawKey.trim();
    if (key === "unsubscribe_url") return opts.unsubscribeUrl ?? "";
    if (contact && key in contact) {
      const value = (contact as unknown as Record<string, unknown>)[key];
      return value == null ? "" : String(value);
    }
    if (key in custom) {
      const value = custom[key];
      return value == null ? "" : String(value);
    }
    return "";
  });
}

/** Есть ли в письме механизм отписки (переменная или явная ссылка). */
export function hasUnsubscribeLink(html: string | null | undefined): boolean {
  if (!html) return false;
  if (extractVariables(html).includes("unsubscribe_url")) return true;
  return /email-unsubscribe|unsubscribe|отписаться/i.test(html);
}
