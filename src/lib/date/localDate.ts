/**
 * Локальная календарная дата браузера в формате YYYY-MM-DD.
 *
 * Важно: `new Date().toISOString().slice(0, 10)` возвращает дату в UTC, поэтому
 * в Asia/Vladivostok (UTC+10) утром 5 августа получалось 4 августа. Договоры
 * обязаны датироваться днём, который видит оператор, поэтому используем
 * локальные компоненты даты.
 */
export function localDateIso(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Локальная дата со сдвигом на N месяцев (для дат окончания услуг). */
export function localDateIsoPlusMonths(months: number, date: Date = new Date()): string {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + months);
  return localDateIso(next);
}
