// P0: черновик кампании сохраняется без готовности к отправке.
// Согласие, SMTP, получатели, лимиты и переменные требуются только для
// тестовой отправки / планирования / запуска.

export type CampaignRecipientSource =
  | "none"
  | "students"
  | "companies"
  | "organizations"
  | "companies_db"
  | "manual";

/**
 * Новая кампания НИКОГДА не выбирает получателей автоматически.
 * Явный источник «Без получателей / добавить позже».
 */
export const DEFAULT_RECIPIENT_SOURCE: CampaignRecipientSource = "none";

export function defaultRecipientValue(): {
  source: CampaignRecipientSource;
  manualEmails: string[];
  count: number;
  previewReady?: boolean;
} {
  return { source: DEFAULT_RECIPIENT_SOURCE, manualEmails: [], count: 0 };
}

export interface DraftInput {
  name: string;
  subject: string;
  html: string;
}

export interface DraftGateResult {
  ok: boolean;
  reason?: string;
}

/** Минимальные требования к черновику: только контент письма. */
export function validateDraft(input: DraftInput): DraftGateResult {
  if (!input.name.trim()) return { ok: false, reason: "Укажите название кампании" };
  if (!input.subject.trim()) return { ok: false, reason: "Укажите тему письма" };
  if (!input.html.trim()) return { ok: false, reason: "Заполните тело письма" };
  return { ok: true };
}

export interface SendGateInput extends DraftInput {
  consent: boolean;
  recipientCount: number;
  previewReady?: boolean;
  variablesOk: boolean;
  quotaBlocked?: boolean;
  quotaReason?: string | null;
  overDailyLimit?: boolean;
  /** Этап 3: явный аккаунт отправителя обязателен для любой отправки. */
  senderAccountId?: string | null;
}

/** Требования к любой реальной отправке (тест / план / запуск). */
export function validateSend(input: SendGateInput): DraftGateResult {
  const base = validateDraft(input);
  if (!base.ok) return base;
  if (!input.senderAccountId) return { ok: false, reason: "Выберите отправителя" };
  if (input.recipientCount <= 0) return { ok: false, reason: "Добавьте получателей" };
  if (input.previewReady === false) return { ok: false, reason: "Дождитесь проверки списка получателей" };
  if (!input.consent) return { ok: false, reason: "Подтвердите согласие получателей" };
  if (!input.variablesOk) return { ok: false, reason: "В письме есть неизвестные переменные" };
  if (input.overDailyLimit) return { ok: false, reason: "Превышен суточный лимит отправки" };
  if (input.quotaBlocked) return { ok: false, reason: input.quotaReason || "Отправка ограничена квотой" };
  return { ok: true };
}
