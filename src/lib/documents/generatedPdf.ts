/** An emergency text fallback is never a finished educational/legal document. */
export function generatedPdfPath(result: unknown): string {
  const value = result as { success?: unknown; renderer?: unknown; path?: unknown } | null;
  if (value?.success !== true || value.renderer !== "browserless" ||
      typeof value.path !== "string" || !value.path.trim()) {
    throw new Error("PDF не был сформирован полностью. Документ не зарегистрирован; повторите позже.");
  }
  return value.path;
}
