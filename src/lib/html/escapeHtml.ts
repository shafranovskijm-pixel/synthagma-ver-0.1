/**
 * Единое экранирование значений, попадающих в HTML документов
 * (проект договора, счёт, акт). Экранируются &, <, >, ", ' и обратный апостроф.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

/** Обрезает аномально длинные реквизиты, чтобы они не ломали вёрстку A4. */
export function clampRequisite(value: unknown, max = 300): string {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** CSS для безопасного переноса длинных значений без горизонтального выхода. */
export const HTML_WRAP_STYLE = "overflow-wrap:anywhere;word-break:break-word;";
