export const CHART_COLORS = [
  "hsl(217, 91%, 50%)",
  "hsl(186, 94%, 42%)",
  "hsl(158, 64%, 42%)",
  "hsl(256, 67%, 59%)",
  "hsl(25, 95%, 53%)",
  "hsl(330, 81%, 60%)",
];

export const FEATURE_LABELS: Record<string, string> = {
  courses: "Курсы",
  students: "Слушатели",
  companies: "Компании",
  documents: "Документооборот",
  journals: "Журналы",
  frdo: "ФРДО",
  marketplace: "Магазин курсов",
  library: "Библиотека",
};

export function parseDevice(ua: string | null): string {
  if (!ua) return "Неизвестно";
  if (/mobile|android|iphone|ipad/i.test(ua)) return "Мобильное";
  if (/tablet/i.test(ua)) return "Планшет";
  return "ПК";
}

export function parseBrowser(ua: string | null): string {
  if (!ua) return "";
  if (/edg/i.test(ua)) return "Edge";
  if (/chrome/i.test(ua)) return "Chrome";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  if (/opera|opr/i.test(ua)) return "Opera";
  return "Другой";
}
