/**
 * Единая точка правды «можно ли запускать рассылку сейчас».
 * Fail-closed: любая неизвестность блокирует запуск.
 */
import { isValidEmail } from "./contactsImport";

/**
 * В этой поставке реальная отправка выключена на уровне кода.
 * Включение — отдельная задача после ручной проверки отправителя.
 */
export const MAILING_SENDING_ENABLED = false;

export type MailingSendMode = "test" | "real";

export interface MailingLaunchGateInput {
  mode: MailingSendMode;
  /** статус SMTP-проверки выбранного отправителя: 'ok' | 'error' | 'untested' | null */
  senderSmtpStatus?: string | null;
  senderSelected: boolean;
  hasUnsubscribe: boolean;
  unknownVariables: string[];
  /** база прошла дедупликацию (импорт завершён отчётом) */
  contactsDeduplicated: boolean;
  recipientsCount: number;
  seedEmails: string[];
}

export interface MailingLaunchGate {
  allowed: boolean;
  blockers: string[];
}

export function computeMailingLaunchGate(input: MailingLaunchGateInput): MailingLaunchGate {
  const blockers: string[] = [];

  if (!input.senderSelected) {
    blockers.push("Не выбран отправитель.");
  } else if (input.senderSmtpStatus !== "ok") {
    blockers.push("Отправитель не прошёл проверку SMTP — сначала выполните тест соединения.");
  }

  if (!input.hasUnsubscribe) {
    blockers.push("В письме нет ссылки отписки {{unsubscribe_url}}.");
  }

  if (input.unknownVariables.length > 0) {
    blockers.push(
      `Неизвестные переменные: ${input.unknownVariables.map((v) => `{{${v}}}`).join(", ")}.`,
    );
  }

  if (input.mode === "test") {
    const valid = input.seedEmails.filter(isValidEmail);
    if (valid.length === 0) {
      blockers.push("Укажите хотя бы один корректный seed-адрес для тестовой отправки.");
    }
  } else {
    if (!input.contactsDeduplicated) {
      blockers.push("База не прошла дедупликацию — переимпортируйте контакты.");
    }
    if (input.recipientsCount <= 0) {
      blockers.push("В базе нет получателей.");
    }
  }

  if (!MAILING_SENDING_ENABLED) {
    blockers.push("Отправка писем отключена в этой сборке (режим безопасной настройки).");
  }

  return { allowed: blockers.length === 0, blockers };
}
