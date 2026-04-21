/**
 * Конфигурация самоонбординга на лендинге курса.
 * Хранится внутри `landing_content.enrollment` в JSONB поля курса.
 *
 * Как использовать:
 *  - Read: `getEnrollmentConfig(landingContent)` — всегда вернёт валидную структуру с дефолтами.
 *  - Write: положите частичное обновление в `landing_content.enrollment` через useLandingEditor / RegistrationPanel.
 */

export type EnrollmentMode = "request" | "instant" | "payment";

export type EnrollmentFieldType =
  | "text"
  | "email"
  | "phone"
  | "select"
  | "checkbox"
  | "inn";

export interface EnrollmentField {
  /** Машинное имя поля (используется ключом в результатах). */
  key: string;
  /** Подпись для пользователя. */
  label: string;
  /** Подсказка-плейсхолдер. */
  placeholder?: string;
  type: EnrollmentFieldType;
  required: boolean;
  /** Значения для select. */
  options?: string[];
}

export interface EnrollmentConfig {
  /**
   * Режим обработки сабмита формы:
   * - request: создаётся `enrollment_requests` (как сейчас, ручное подтверждение менеджером)
   * - instant: edge-функция `landing-self-enroll` сразу создаёт ученика и зачисляет
   * - payment: оплата → автозачисление через webhook
   */
  mode: EnrollmentMode;
  /** ID `student_groups` для автозачисления (опционально). */
  student_group_id?: string | null;
  /** Поля формы. Если пусто — рендерим базовые name/email/phone. */
  fields: EnrollmentField[];
  /** Обязательное согласие на обработку ПД. */
  consent_required: boolean;
  /** URL пользовательского соглашения / политики (для ссылки в чекбоксе). */
  consent_url?: string;
  /** Сообщение после успешного сабмита (markdown не поддерживается). */
  success_message?: string;
  /** Внешний URL редиректа после сабмита (для ретаргетинга). */
  success_url?: string;
  /** Слать ли пароль на email при instant-режиме. */
  send_credentials_email: boolean;
  /** URL PDF/файла-«лид-магнита», который высылается на email после сабмита. */
  lead_magnet_url?: string;
  /** Подпись для лид-магнита (например, «Чек-лист по охране труда.pdf»). */
  lead_magnet_label?: string;
  /** Слать ли уведомление в Telegram организации (включается отдельно в настройках школы). */
  notify_telegram: boolean;
}

export const DEFAULT_ENROLLMENT_FIELDS: EnrollmentField[] = [
  { key: "name", label: "Ваше имя", placeholder: "Иван Иванов", type: "text", required: true },
  { key: "email", label: "Email", placeholder: "you@mail.com", type: "email", required: true },
  { key: "phone", label: "Телефон", placeholder: "+7 ...", type: "phone", required: false },
];

export const DEFAULT_ENROLLMENT_CONFIG: EnrollmentConfig = {
  mode: "request",
  student_group_id: null,
  fields: DEFAULT_ENROLLMENT_FIELDS,
  consent_required: true,
  consent_url: "/personal-data",
  success_message: "Спасибо! Ваша заявка принята.",
  send_credentials_email: true,
  lead_magnet_url: undefined,
  lead_magnet_label: undefined,
  notify_telegram: true,
};

/** Безопасное чтение конфига с дефолтами. */
export function getEnrollmentConfig(landingContent: any): EnrollmentConfig {
  const raw = landingContent?.enrollment ?? {};
  return {
    mode: (raw.mode as EnrollmentMode) ?? DEFAULT_ENROLLMENT_CONFIG.mode,
    student_group_id: raw.student_group_id ?? null,
    fields: Array.isArray(raw.fields) && raw.fields.length > 0
      ? (raw.fields as EnrollmentField[])
      : DEFAULT_ENROLLMENT_FIELDS,
    consent_required: raw.consent_required !== false,
    consent_url: raw.consent_url || DEFAULT_ENROLLMENT_CONFIG.consent_url,
    success_message: raw.success_message || DEFAULT_ENROLLMENT_CONFIG.success_message,
    success_url: raw.success_url || undefined,
    send_credentials_email: raw.send_credentials_email !== false,
    lead_magnet_url: raw.lead_magnet_url || undefined,
    lead_magnet_label: raw.lead_magnet_label || undefined,
    notify_telegram: raw.notify_telegram !== false,
  };
}

/** Простая клиентская валидация по описанию поля. */
export function validateField(field: EnrollmentField, value: string): string | null {
  if (field.required && !value.trim()) return `Поле «${field.label}» обязательно`;
  if (!value) return null;
  if (field.type === "email") {
    const ok = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value);
    if (!ok) return "Неверный формат email (только латиница)";
  }
  if (field.type === "phone") {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 7) return "Слишком короткий номер";
  }
  if (field.type === "inn") {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 10 && digits.length !== 12) return "ИНН должен содержать 10 или 12 цифр";
  }
  if (value.length > 255) return "Значение слишком длинное (макс. 255 символов)";
  return null;
}
