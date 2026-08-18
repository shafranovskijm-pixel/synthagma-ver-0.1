/**
 * Универсальный рендерер шаблонов с переменными {{variable}}.
 * Используется для массовой генерации договоров, актов и любых
 * документов из шаблонов организации (`org_contract_templates`).
 *
 * БЕЗОПАСНОСТЬ: По умолчанию все значения переменных HTML-экранируются,
 * чтобы исключить XSS при попадании ввода ученика/менеджера в шаблон.
 * Чтобы вставить заранее подготовленный безопасный HTML — используйте
 * двойные фигурные с маркером `&` (например: `{{&signature_html}}`).
 */

export type TemplateVariables = Record<string, string | number | null | undefined>;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/**
 * Подставляет значения переменных в HTML-шаблон.
 * - {{key}} — значение HTML-экранируется (безопасно по умолчанию)
 * - {{&key}} — значение вставляется как сырой HTML (use with caution)
 * - если key входит в `rawKeys` — тоже вставляется как сырой HTML (для авто-таблиц вроде students_table)
 * Неизвестные переменные оставляет как есть, чтобы было видно «дырки» в шаблоне.
 */
export function renderTemplate(html: string, variables: TemplateVariables, rawKeys?: Set<string> | string[]): string {
  if (!html) return "";
  const rawSet = rawKeys instanceof Set ? rawKeys : new Set(rawKeys || []);
  return html.replace(/\{\{\s*(&)?\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, raw, key) => {
    if (!(key in variables)) return match;
    const value = variables[key];
    const str = value === null || value === undefined ? "" : String(value);
    return raw || rawSet.has(key) ? str : escapeHtml(str);
  });
}

/**
 * Возвращает массив всех уникальных переменных, используемых в шаблоне.
 */
export function extractVariables(html: string): string[] {
  if (!html) return [];
  const matches = html.matchAll(/\{\{\s*&?\s*([a-zA-Z0-9_]+)\s*\}\}/g);
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

/**
 * Преобразует число в денежный формат с разделителями.
 */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/**
 * Возвращает корректное русское окончание по числу: рубль/рубля/рублей.
 */
function pluralRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const lastTwo = abs;
  const last = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/**
 * Возвращает сумму прописью с правильным склонением «рубль/копейка».
 * Пример: 1234.05 → «одна тысяча двести тридцать четыре рубля 05 копеек»
 */
export function moneyToWords(amount: number): string {
  const safe = Math.max(0, Number(amount) || 0);
  const rubles = Math.floor(safe);
  const kopecks = Math.round((safe - rubles) * 100);
  const rubWord = pluralRu(rubles, ["рубль", "рубля", "рублей"]);
  const kopWord = pluralRu(kopecks, ["копейка", "копейки", "копеек"]);
  return `${numberToWords(rubles)} ${rubWord} ${String(kopecks).padStart(2, "0")} ${kopWord}`;
}

function numberToWords(num: number): string {
  if (num === 0) return "ноль";
  const units = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

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
    parts.push(pluralRu(millions, ["миллион", "миллиона", "миллионов"]));
  }
  if (thousands > 0) {
    parts.push(under1000(thousands, true));
    parts.push(pluralRu(thousands, ["тысяча", "тысячи", "тысяч"]));
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
  /**
   * Полная согласованная формулировка полномочий представителя, например
   * «действующей на основании доверенности № 1 от 01.01.2026».
   * Юридически значимый текст нельзя выводить из ФИО или пола автоматически.
   */
  director_authority?: string | null;
  /** Устаревшая раздельная форма для пользовательских шаблонов; только явное значение. */
  director_acting?: string | null;
  bank_name?: string | null;
  bank_bik?: string | null;
  bank_account?: string | null;
  bank_corr_account?: string | null;
  email?: string | null;
  phone?: string | null;
}

export function buildOrgVariables(org: OrgRequisitesInput): TemplateVariables {
  return {
    org_name: org.name || "",
    org_inn: org.inn || "",
    org_kpp: org.kpp || "",
    org_ogrn: org.ogrn || "",
    org_address: org.legal_address || "",
    org_director_name: org.director_name || "",
    // Юридически значимую должность нельзя угадывать: организация заполняет её
    // в собственных реквизитах, а мастер блокирует пустой плейсхолдер.
    org_director_position: org.director_position || "",
    // Ни род, ни основание полномочий не выводим автоматически. Встроенные
    // договоры требуют ручную полную формулировку и блокируют пустое значение.
    org_director_authority: org.director_authority || "",
    org_director_acting: org.director_acting || "",
    org_bank_name: org.bank_name || "",
    org_bank_bik: org.bank_bik || "",
    org_bank_account: org.bank_account || "",
    org_bank_corr_account: org.bank_corr_account || "",
    org_email: org.email || "",
    org_phone: org.phone || "",
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

/**
 * Строит HTML-таблицу «Список обучающихся» для подстановки в переменную {{students_table}}.
 */
export interface StudentRow {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  education?: string | null;
  program?: string | null;
  address?: string | null;
}
export function buildStudentsTable(students: StudentRow[]): string {
  const rows = students.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(s.full_name || "")}</td>
      <td>${escapeHtml(s.position || "")}</td>
      <td>${escapeHtml(s.education || "")}</td>
      <td>${escapeHtml(s.program || "")}</td>
      <td>${escapeHtml([s.phone, s.email].filter(Boolean).join(" / "))}</td>
    </tr>`).join("");
  return `<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4">
    <thead><tr>
      <th>№</th><th>ФИО</th><th>Должность</th><th>Образование</th><th>Программа</th><th>Контакты</th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="6" style="text-align:center;color:#888">Обучающиеся не выбраны</td></tr>`}</tbody>
  </table>`;
}

export interface ProgramRow { title?: string | null; hours?: number | null; form?: string | null; count?: number | null; }
export function buildProgramsTable(programs: ProgramRow[]): string {
  const rows = programs.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(p.title || "")}</td>
      <td>${p.hours != null ? p.hours : ""}</td>
      <td>${escapeHtml(p.form || "")}</td>
      <td>${p.count != null ? p.count : ""}</td>
    </tr>`).join("");
  return `<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4">
    <thead><tr><th>№</th><th>Программа</th><th>Часы</th><th>Форма</th><th>Кол-во чел.</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#888">Программы не выбраны</td></tr>`}</tbody>
  </table>`;
}
