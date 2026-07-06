// Извлечение и нормализация российских телефонных номеров из произвольного текста.
// Используется для распознавания доп. телефонов в notes лидов.

// Ищем последовательности из 11 цифр (с +7/8) с любыми разделителями между цифрами:
// покрывает форматы +7 (495) 111-11-11, 8-999-000-00-00, +7 (4212) 21-62-19 и т.п.
const PHONE_REGEX = /(?:\+7|\b8|\b7)(?:[\s\-–—()\.]*\d){10}/g;

export function normalizeRuPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11) return null;
  const head = digits[0];
  if (head !== '7' && head !== '8') return null;
  return '+7' + digits.slice(1);
}

export function extractPhones(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(PHONE_REGEX) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const n = normalizeRuPhone(m);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

export function formatRuPhone(e164: string): string {
  const d = e164.replace(/\D/g, '');
  if (d.length !== 11) return e164;
  return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
}

/** Возвращает доп. телефоны из текста, исключая основной. */
export function extractExtraPhones(text: string | null | undefined, primary?: string | null): string[] {
  const primaryNorm = primary ? normalizeRuPhone(primary) : null;
  return extractPhones(text).filter(p => p !== primaryNorm);
}
