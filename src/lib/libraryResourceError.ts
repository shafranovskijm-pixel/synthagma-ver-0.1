const FALLBACK = "Не удалось сохранить ресурс";
const WITHHELD = "[диагностические данные скрыты]";

// Read only known scalar fields, never serialize the error, response or request.
function ownString(error: object, key: string): string {
  const descriptor = Object.getOwnPropertyDescriptor(error, key);
  return descriptor && "value" in descriptor && typeof descriptor.value === "string"
    ? descriptor.value
    : "";
}

function safeDiagnosticText(value: string): string {
  let text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!text) return "";
  // PostgreSQL details can echo a whole submitted row or key values.
  // Withhold sensitive fields entirely; partial masking can miss a second secret.
  if (/(?:authorization|bearer|basic\s|cookie|password|passwd|pwd|secret|token|api[_ -]?key|credential|signature|failing row contains|key\s*\([^)]*\)\s*=)/i.test(text)) {
    return WITHHELD;
  }
  text = text
    .replace(/(?:https?|postgres(?:ql)?):\/\/[^\s<>"']+/gi, "[URL скрыт]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\b/g, WITHHELD)
    .replace(/\b[A-Za-z0-9_+/=-]{32,}\b/g, WITHHELD)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email скрыт]");
  return text.length > 700 ? `${text.slice(0, 700)}…` : text;
}

/** Safe text-only diagnostics for Error and PostgREST's plain-object errors. */
export function formatLibraryResourceError(error: unknown): string {
  if (!error || (typeof error !== "object" && typeof error !== "function")) return FALLBACK;
  const rawCode = ownString(error, "code");
  const code = /^(?:[A-Z0-9]{5}|PGRST[0-9]{3}|[0-9]{3})$/.test(rawCode) ? rawCode : "";
  const message = safeDiagnosticText(ownString(error, "message")) || FALLBACK;
  const details = safeDiagnosticText(ownString(error, "details"));
  const hint = safeDiagnosticText(ownString(error, "hint"));
  return [
    code ? `Код: ${code}` : "",
    message,
    details ? `Подробности: ${details}` : "",
    hint ? `Подсказка: ${hint}` : "",
  ].filter(Boolean).join("\n");
}
