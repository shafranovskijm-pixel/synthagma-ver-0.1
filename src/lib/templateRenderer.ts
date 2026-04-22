/**
 * Универсальный рендерер шаблонов с переменными {{variable}}.
 * Используется для массовой генерации договоров, актов и любых
 * документов из шаблонов организации (`org_contract_templates`).
 */

export type TemplateVariables = Record<string, string | number | null | undefined>;

/**
 * Подставляет значения переменных в HTML-шаблон.
 * Заменяет {{key}} → value. Неизвестные переменные оставляет как есть,
 * чтобы было видно «дырки» в шаблоне.
 */
export function renderTemplate(html: string, variables: TemplateVariables): string {
  if (!html) return "";
  let result = html;
  Object.entries(variables).forEach(([key, value]) => {
    const safe = value === null || value === undefined ? "" : String(value);
    const regex = new RegExp(`\\{\\{\\s*${escapeRegex(key)}\\s*\\}\\}`, "g");
    result = result.replace(regex, safe);
  });
  return result;
}

/**
 * Возвращает массив всех уникальных переменных, используемых в шаблоне.
 */
export function extractVariables(html: string): string[] {
  if (!html) return [];
  const matches = html.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
  const set = new Set<string>();
  for (const m of matches) set.add(m[1]);
  return Array.from(set);
}

/**
 * Возвращает массив переменных, которые отсутствуют в данных
 * (полезно для UI-предупреждения о незаполненных полях).
 */
export function findMissingVariables(html: string, variables: TemplateVariables): string[] {
  const used = extractVariables(html);
  return used.filter(k => {
    const v = variables[k];
    return v === undefined || v === null || v === "";
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Преобразует число в денежный формат с разделителями.
 */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/**
 * Возвращает сумму прописью (упрощённый вариант для рублей и копеек).
 */
export function moneyToWords(amount: number): string {
  const rubles = Math.floor(amount);
  const kopecks = Math.round((amount - rubles) * 100);
  return `${numberToWords(rubles)} рублей ${String(kopecks).padStart(2, "0")} копеек`;
}

function numberToWords(num: number): string {
  if (num === 0) return "ноль";
  const units = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];
  const thousandsForms = ["тысяч", "тысяча", "тысячи", "тысячи", "тысячи", "тысяч", "тысяч", "тысяч", "тысяч", "тысяч"];

  function under1000(n: number, isFeminine = false): string {
    const localUnits = isFeminine ? ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"] : units;
    const parts: string[] = [];
    parts.push(hundreds[Math.floor(n / 100)]);
    const remainder = n % 100;
    if (remainder >= 10 && remainder < 20) parts.push(teens[remainder - 10]);
    else { parts.push(tens[Math.floor(remainder / 10)]); parts.push(localUnits[remainder % 10]); }
    return parts.filter(Boolean).join(" ");
  }

  const parts: string[] = [];
  const millions = Math.floor(num / 1_000_000);
  const thousands = Math.floor((num % 1_000_000) / 1000);
  const remainder = num % 1000;

  if (millions > 0) {
    parts.push(under1000(millions));
    parts.push(millions === 1 ? "миллион" : (millions % 10 >= 2 && millions % 10 <= 4 && (millions % 100 < 10 || millions % 100 >= 20)) ? "миллиона" : "миллионов");
  }
  if (thousands > 0) {
    parts.push(under1000(thousands, true));
    const lastDigit = thousands % 10;
    const lastTwo = thousands % 100;
    if (lastTwo >= 11 && lastTwo <= 14) parts.push("тысяч");
    else if (lastDigit === 1) parts.push("тысяча");
    else if (lastDigit >= 2 && lastDigit <= 4) parts.push("тысячи");
    else parts.push("тысяч");
  }
  if (remainder > 0) parts.push(under1000(remainder));

  return parts.join(" ").trim();
}

/**
 * Готовит базовый набор переменных для договора с организацией-исполнителем.
 */
export interface OrgRequisitesInput {
  name?: string | null;
  inn?: string | null;
  kpp?: string | null;
  ogrn?: string | null;
  legal_address?: string | null;
  director_name?: string | null;
  director_position?: string | null;
  bank_name?: string | null;
  bank_bik?: string | null;
  bank_account?: string | null;
  bank_corr_account?: string | null;
}

export function buildOrgVariables(org: OrgRequisitesInput): TemplateVariables {
  return {
    org_name: org.name || "",
    org_inn: org.inn || "",
    org_kpp: org.kpp || "",
    org_ogrn: org.ogrn || "",
    org_address: org.legal_address || "",
    org_director_name: org.director_name || "",
    org_director_position: org.director_position || "Генерального директора",
    org_director_acting: "действующего",
    org_bank_name: org.bank_name || "",
    org_bank_bik: org.bank_bik || "",
    org_bank_account: org.bank_account || "",
    org_bank_corr_account: org.bank_corr_account || "",
  };
}

export interface CompanyInput {
  name?: string | null;
  inn?: string | null;
  kpp?: string | null;
  ogrn?: string | null;
  address?: string | null;
  director?: string | null;
}

export function buildCompanyVariables(c: CompanyInput): TemplateVariables {
  return {
    company_name: c.name || "",
    company_inn: c.inn || "",
    company_kpp: c.kpp || "",
    company_ogrn: c.ogrn || "",
    company_address: c.address || "",
    company_director: c.director || "",
  };
}

/**
 * Форматирует дату в формат «12» января 2026 г.
 */
export function formatRussianDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  return `«${day}» ${months[d.getMonth()]} ${d.getFullYear()} г.`;
}

/**
 * Заворачивает HTML-тело в полноценный документ для печати/скачивания.
 */
export function wrapAsPrintableDocument(bodyHtml: string, title: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
@page { size: A4; margin: 2cm; }
body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; color: #000; }
h1, h2, h3 { font-weight: 700; }
table { width: 100%; border-collapse: collapse; }
table, td, th { border: 1px solid #000; padding: 6px; }
.no-print { display: none; }
@media print { .no-print { display: none !important; } }
</style></head><body>${bodyHtml}</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
