const TELEGRAM_HTML_REPLACEMENTS: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export function capCodePoints(value: string, maxCodePoints: number): string {
  if (!Number.isSafeInteger(maxCodePoints) || maxCodePoints < 0) return "";
  return Array.from(value).slice(0, maxCodePoints).join("");
}

export function escapeTelegramHtml(value: unknown, maxCodePoints: number): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return capCodePoints(String(value).trim(), maxCodePoints)
    .replace(/[&<>"]/g, (character) => TELEGRAM_HTML_REPLACEMENTS[character]);
}

export function telegramHtmlValue(
  value: unknown,
  maxCodePoints: number,
  fallback = "—",
): string {
  return escapeTelegramHtml(value, maxCodePoints) || fallback;
}

export function formatTelegramUtm(
  value: unknown,
  maxEntries = 8,
): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "";

  return Object.entries(value as Record<string, unknown>)
    .slice(0, maxEntries)
    .map(([key, item]) => {
      const safeKey = escapeTelegramHtml(key, 48);
      const safeValue = escapeTelegramHtml(item, 128);
      return safeKey && safeValue ? `${safeKey}=${safeValue}` : "";
    })
    .filter(Boolean)
    .join(", ");
}
