/**
 * Единый реестр переменных писем (frontend).
 *
 * Ранее список переменных существовал в двух местах
 * (`src/lib/mailing/variables.ts` и `src/utils/mailing/mailingVariables.ts`),
 * что приводило к рассинхронизации allowlist. Теперь оба модуля берут
 * ключи отсюда, а edge-функции — из `supabase/functions/_shared/mailing-variables.ts`
 * (копия покрыта тестом на идентичность).
 */

/** Переменные карточки контакта, доступные в редакторе. */
export const CORE_MAILING_VARIABLE_KEYS = [
  "first_name",
  "last_name",
  "organization",
  "position",
  "city",
  "email",
  "unsubscribe_url",
] as const;

/** Исторически поддерживаемые send-campaign-email переменные. */
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

/** Полный allowlist: ядро + legacy. */
export const ALL_MAILING_VARIABLE_KEYS: readonly string[] = [
  ...CORE_MAILING_VARIABLE_KEYS,
  ...LEGACY_MAILING_VARIABLE_KEYS,
];

/** Переменные-URL: значения не HTML-экранируются (формируются сервером). */
export const URL_MAILING_VARIABLE_KEYS: readonly string[] = [
  "unsubscribe_url",
  "webinar_url",
  "course_url",
];

export const MAILING_VARIABLE_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
