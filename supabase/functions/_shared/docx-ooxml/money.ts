/** Сумма прописью на русском языке и вспомогательные форматтеры. */

const ONES_M = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

export function pluralRu(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

function triadToWords(num: number, feminine: boolean): string[] {
  const out: string[] = [];
  const h = Math.floor(num / 100);
  const t = Math.floor((num % 100) / 10);
  const o = num % 10;
  if (h) out.push(HUNDREDS[h]);
  if (t === 1) {
    out.push(TEENS[o]);
  } else {
    if (t) out.push(TENS[t]);
    if (o) out.push(feminine ? ONES_F[o] : ONES_M[o]);
  }
  return out;
}

/** 15000 → "пятнадцать тысяч" (без слова «рублей» — оно есть в шаблоне). */
export function numberToWordsRu(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "ноль";
  const groups: number[] = [];
  let rest = n;
  while (rest > 0) { groups.push(rest % 1000); rest = Math.floor(rest / 1000); }
  const names: Array<{ forms: [string, string, string]; feminine: boolean }> = [
    { forms: ["", "", ""], feminine: false },
    { forms: ["тысяча", "тысячи", "тысяч"], feminine: true },
    { forms: ["миллион", "миллиона", "миллионов"], feminine: false },
    { forms: ["миллиард", "миллиарда", "миллиардов"], feminine: false },
  ];
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const g = groups[i];
    if (!g) continue;
    const meta = names[i] || names[0];
    parts.push(...triadToWords(g, meta.feminine));
    if (i > 0) parts.push(pluralRu(g, meta.forms));
  }
  return parts.filter(Boolean).join(" ");
}

/** Сумма прописью с копейками: "пятнадцать тысяч рублей 00 копеек". */
export function moneyToWordsRu(value: number): string {
  const abs = Math.abs(Number(value) || 0);
  const rub = Math.floor(abs);
  const kop = Math.round((abs - rub) * 100);
  const rubWords = `${numberToWordsRu(rub)} ${pluralRu(rub, ["рубль", "рубля", "рублей"])}`;
  const kopWords = `${String(kop).padStart(2, "0")} ${pluralRu(kop, ["копейка", "копейки", "копеек"])}`;
  return `${rubWords} ${kopWords}`;
}

/** 15000 → "15 000,00" */
export function formatMoneyRu(value: number): string {
  const abs = Number(value) || 0;
  const [int, frac] = abs.toFixed(2).split(".");
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${frac}`;
}

/** "Иванов Иван Иванович" → "Иванов И.И." */
export function shortNameRu(fullName: string): string {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const [last, ...rest] = parts;
  const initials = rest.slice(0, 2).map((p) => `${p[0].toUpperCase()}.`).join("");
  return initials ? `${last} ${initials}` : last;
}

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** "2026-08-03" → "«03» августа 2026 г." */
export function formatRussianDateLong(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  const [, y, mm, dd] = m;
  return `«${dd}» ${MONTHS[Number(mm) - 1]} ${y} г.`;
}

/** Диапазон дат обучения: "03.08.2026 — 07.08.2026". */
export function formatDateRangeRu(start: string, end: string): string {
  const d = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
  };
  const a = d(start);
  const b = d(end);
  if (a && b) return `${a} — ${b}`;
  return a || b || "";
}
