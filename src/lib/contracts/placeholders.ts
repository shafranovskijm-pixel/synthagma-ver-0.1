/**
 * Поиск незаполненных плейсхолдеров в готовом HTML договора.
 * Используется как жёсткий стоп перед сохранением: документ с {{...}} выпускать нельзя.
 */
export function findUnresolvedPlaceholders(html: string): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*&?\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) found.add(m[1]);
  return [...found];
}
