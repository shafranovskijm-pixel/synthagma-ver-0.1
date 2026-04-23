/**
 * Унифицированная обработка ошибок Supabase / edge-функций.
 *
 * Превращает разные типы ошибок (FunctionsHttpError, PostgrestError,
 * сетевые сбои, AuthError) в человекочитаемое сообщение на русском.
 *
 * Использование:
 *   import { toast } from "sonner";
 *   import { getErrorMessage } from "@/utils/handleSupabaseError";
 *
 *   try { ... }
 *   catch (e) { toast.error(getErrorMessage(e)); }
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
  "402": "Достигнут лимит ИИ-генераций. Подключите ключ или обновите тариф",
  "429": "Слишком много запросов. Подождите немного",
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Достаёт максимально информативный текст ошибки.
 * Поддерживает: Error, PostgrestError, FunctionsError, обычные строки.
 */
export function getErrorMessage(err: unknown, fallback = FALLBACK): string {
  if (!err) return fallback;
  if (typeof err === "string") return err || fallback;

  // FunctionsHttpError — у edge-функций тело часто содержит {error, message}
  if (err instanceof FunctionsHttpError) {
    // Попробуем достать message из ответа (синхронно невозможно, поэтому смотрим на context)
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
    // PostgrestError shape: { code, message, details, hint }
    const code = typeof err.code === "string" ? err.code : undefined;
    if (code && KNOWN_CODES[code]) return KNOWN_CODES[code];

    const message = typeof err.message === "string" ? err.message : undefined;
    const details = typeof err.details === "string" ? err.details : undefined;
    const hint = typeof err.hint === "string" ? err.hint : undefined;

    // Иногда внутри лежит {error: "..."}  
    const inner = isObject(err.error) ? err.error : undefined;
    const innerMessage = inner && typeof inner.message === "string" ? inner.message : undefined;

    return message || innerMessage || details || hint || fallback;
  }

  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

/**
 * Шорткат: лог в консоль + возврат сообщения для toast.
 */
export function logAndGetMessage(label: string, err: unknown, fallback?: string): string {
  // eslint-disable-next-line no-console
  console.error(`[${label}]`, err);
  return getErrorMessage(err, fallback);
}
