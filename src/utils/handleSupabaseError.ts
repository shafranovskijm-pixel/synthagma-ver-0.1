/**
 * Унифицированная обработка ошибок Supabase / edge-функций.
 */

import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from "@supabase/supabase-js";

const FALLBACK = "Произошла ошибка. Попробуйте ещё раз.";

const KNOWN_CODES: Record<string, string> = {
  "23505": "Запись с такими данными уже существует",
  "23503": "Невозможно выполнить: связанная запись не найдена",
  "23502": "Не заполнено обязательное поле",
  "42501": "Недостаточно прав для этого действия",
  "PGRST116": "Запись не найдена",
  "PGRST301": "Сессия истекла. Войдите снова",
  "rate_limit_exceeded": "Слишком много запросов. Попробуйте через минуту",
  "402": "ИИ-кредиты закончились. Пополните баланс GigaChat или свяжитесь с администратором",
  "429": "Слишком много запросов. Подождите немного",
};

function mapAiMessage(msg: string): string | null {
  const m = msg.toLowerCase();
  if (/all ai channels exhausted|tokens depleted|payment required|insufficient.*credit/.test(m) || m.includes("402")) {
    return "ИИ-кредиты закончились. Пополните баланс GigaChat или свяжитесь с администратором";
  }
  if (m.includes("[moderation]")) {
    return "GigaChat отклонил запрос по модерации. Переформулируйте тему урока";
  }
  if (/insufficient permissions|organization or admin role/.test(m)) {
    return "У вас нет прав на генерацию контента. Запросите у владельца организации право «Управление курсами»";
  }
  if (/authentication required|invalid authentication/.test(m)) {
    return "Сессия истекла. Обновите страницу и войдите снова";
  }
  if (/all gigachat models exhausted/.test(m)) {
    return "Все модели GigaChat недоступны. Попробуйте через минуту или обратитесь к администратору";
  }
  return null;
}

const AUTH_CODES: Record<string, string> = {
  same_password: "Новый пароль должен отличаться от старого",
  weak_password: "Пароль слишком простой. Используйте 8+ символов, цифры и буквы",
  password_hibp: "Этот пароль найден в базе утечек. Придумайте другой",
  session_not_found: "Ссылка для сброса устарела. Запросите новую",
  invalid_token: "Ссылка недействительна или устарела. Запросите новую",
  otp_expired: "Срок действия ссылки истёк. Запросите новую",
  over_email_send_rate_limit: "Слишком много запросов. Попробуйте через минуту",
  email_not_confirmed: "Email не подтверждён",
  invalid_credentials: "Неверный email или пароль",
};

function mapAuthMessage(msg: string): string | null {
  const m = msg.toLowerCase();
  if (/should be different|same.*password/.test(m)) return AUTH_CODES.same_password;
  if (/weak password|password.*(short|too short)|at least \d+ characters/.test(m)) return AUTH_CODES.weak_password;
  if (/pwned|leaked|hibp|compromised/.test(m)) return AUTH_CODES.password_hibp;
  if (/session.*(not found|expired|missing)|auth session missing/.test(m)) return AUTH_CODES.session_not_found;
  if (/invalid.*token|token.*invalid|invalid.*flow.*state/.test(m)) return AUTH_CODES.invalid_token;
  if (/otp.*expired|token has expired/.test(m)) return AUTH_CODES.otp_expired;
  if (/rate limit/.test(m)) return AUTH_CODES.over_email_send_rate_limit;
  if (/invalid login credentials|invalid credentials/.test(m)) return AUTH_CODES.invalid_credentials;
  return null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function getErrorMessage(err: unknown, fallback = FALLBACK): string {
  if (!err) return fallback;
  if (typeof err === "string") return err || fallback;

  if (err instanceof FunctionsHttpError) {
    const ctx = (err as unknown as { context?: { status?: number } }).context;
    const status = ctx?.status;
    if (status && KNOWN_CODES[String(status)]) return KNOWN_CODES[String(status)];
    return err.message || "Ошибка сервиса. Попробуйте позже";
  }
  if (err instanceof FunctionsRelayError) {
    return "Не удалось связаться с сервером. Проверьте интернет";
  }
  if (err instanceof FunctionsFetchError) {
    return "Сетевая ошибка. Возможно, запрос блокирует антивирус или VPN";
  }

  if (isObject(err)) {
    const code = typeof err.code === "string" ? err.code : undefined;
    if (code && AUTH_CODES[code]) return AUTH_CODES[code];
    if (code && KNOWN_CODES[code]) return KNOWN_CODES[code];

    const message = typeof err.message === "string" ? err.message : undefined;
    if (message) {
      const mapped = mapAuthMessage(message);
      if (mapped) return mapped;
    }

    const details = typeof err.details === "string" ? err.details : undefined;
    const hint = typeof err.hint === "string" ? err.hint : undefined;

    const inner = isObject(err.error) ? err.error : undefined;
    const innerMessage = inner && typeof inner.message === "string" ? inner.message : undefined;

    return message || innerMessage || details || hint || fallback;
  }

  if (err instanceof Error) {
    const mapped = mapAuthMessage(err.message);
    return mapped || err.message || fallback;
  }
  return fallback;
}

export function logAndGetMessage(label: string, err: unknown, fallback?: string): string {
  // eslint-disable-next-line no-console
  console.error(`[${label}]`, err);
  return getErrorMessage(err, fallback);
}
