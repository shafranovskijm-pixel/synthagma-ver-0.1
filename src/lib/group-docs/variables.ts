import type { GenerationContext } from "./schema";
import { VARIABLE_CATALOG } from "./variableCatalog";
export { VARIABLE_CATALOG } from "./variableCatalog";

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export function formatDateRu(iso: string): string {
  if (!iso) return "";
  // support already-ru dates like 13.01.2026
  const d = parseDate(iso);
  if (!d) return iso;
  return `«${String(d.getDate()).padStart(2, "0")}» ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()} г.`;
}

export function formatDateShort(iso: string): string {
  if (!iso) return "";
  const d = parseDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString("ru-RU");
}

function parseDate(iso: string): Date | null {
  if (!iso) return null;
  // ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  // dd.mm.yyyy
  const m = iso.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Split "Серия 4010 Номер 123456" or "4010 123456" */
function splitPassport(p?: string): { series: string; number: string } {
  if (!p) return { series: "", number: "" };
  const m = p.match(/серия\s*([0-9\s]+?)\s*(?:номер|№)\s*([0-9\s]+)/i);
  if (m) return { series: m[1].replace(/\s+/g, ""), number: m[2].replace(/\s+/g, "") };
  const digits = p.replace(/\D/g, "");
  // Российский паспорт: 4 цифры серии + 6 цифр номера («40 10 123456» → «4010» / «123456»).
  if (digits.length === 10) return { series: digits.slice(0, 4), number: digits.slice(4) };
  const parts = p.replace(/[^\d\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return { series: parts[0], number: parts.slice(1).join("") };
  if (parts.length === 1) return { series: parts[0], number: "" };
  return { series: p, number: "" };
}


/**
 * Паспорт ученика: структурированные поля приоритетнее разбора строки.
 */
export function resolvePassport(s: {
  passport?: string;
  passport_series?: string | null;
  passport_number?: string | null;
}): { series: string; number: string } {
  const series = (s.passport_series || "").trim();
  const number = (s.passport_number || "").trim();
  if (series || number) return { series, number };
  return splitPassport(s.passport);
}

/** Паспорт одной строкой: "1234 567890" */
export function passportString(s: {
  passport?: string;
  passport_series?: string | null;
  passport_number?: string | null;
}): string {
  const pp = resolvePassport(s);
  return [pp.series, pp.number].filter(Boolean).join(" ") || (s.passport || "");
}

function shortName(full: string): string {
  // "Дроздов Дмитрий Викторович" → "Д.В. Дроздов"
  const parts = full.trim().split(/\s+/);
  if (parts.length >= 3) {
    return `${parts[1][0]}.${parts[2][0]}. ${parts[0]}`;
  }
  if (parts.length === 2) return `${parts[1][0]}. ${parts[0]}`;
  return full;
}

function orgShortName(name: string): string {
  // "ООО «Инжиниринговый центр «ГОРЭЛТЕХ»" → "ООО «ИЦ «ГОРЭЛТЕХ»"
  if (/ГОРЭЛТЕХ/i.test(name)) return "ООО «ИЦ «ГОРЭЛТЕХ»";
  return name;
}

/** Generate training day dates between start and end (up to 4) */
function trainingDays(startIso: string, endIso: string): string[] {
  const start = parseDate(startIso);
  const end = parseDate(endIso);
  if (!start || !end) {
    return [
      formatDateShort(startIso),
      "",
      "",
      formatDateShort(endIso),
    ];
  }
  const days: string[] = [];
  const cur = new Date(start);
  while (cur <= end && days.length < 4) {
    // skip weekends optionally? Client used consecutive weekdays
    const wd = cur.getDay();
    if (wd !== 0 && wd !== 6) {
      days.push(cur.toLocaleDateString("ru-RU"));
    } else if (days.length === 0) {
      // if starts on weekend still include
      days.push(cur.toLocaleDateString("ru-RU"));
    }
    cur.setDate(cur.getDate() + 1);
  }
  while (days.length < 4) days.push("");
  return days;
}

function buildStudentsTable(students: GenerationContext["students"]): string {
  if (!students.length) return "<p>Нет обучающихся</p>";
  const rows = students
    .map((s, i) => {
      const pp = resolvePassport(s);
      return (
        `<tr><td style="text-align:center">${i + 1}</td>` +
        `<td>${esc(s.full_name)}</td>` +
        `<td>${esc(s.email || "—")}</td>` +
        `<td>${esc(pp.series || "—")}</td>` +
        `<td>${esc(pp.number || s.passport || "—")}</td>` +
        `<td>${esc(s.education || "—")}</td></tr>`
      );
    })
    .join("");
  return (
    `<table><thead><tr>` +
    `<th>№</th><th>ФИО</th><th>E-mail</th><th>Паспорт серия</th><th>Паспорт номер</th><th>Образование</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>`
  );
}

function buildStudentListRows(
  students: GenerationContext["students"],
  ctx: GenerationContext,
  basis: string
): string {
  const period =
    formatDateShort(ctx.group.start_date) +
    "–" +
    formatDateShort(ctx.group.end_date);
  return students
    .map(
      (s, i) =>
        `<tr><td style="text-align:center">${i + 1}</td>` +
        `<td>${esc(s.full_name)}</td>` +
        `<td>${esc(ctx.group.program_title)}</td>` +
        `<td style="text-align:center">${ctx.group.program_hours}</td>` +
        `<td>${period}</td>` +
        `<td>${esc(basis)}</td></tr>`
    )
    .join("");
}

function buildStudentListDetailRows(
  students: GenerationContext["students"]
): string {
  return students
    .map((s, i) => {
      const pp = resolvePassport(s);
      return (
        `<tr><td style="text-align:center">${i + 1}</td>` +
        `<td>${esc(s.full_name)}</td>` +
        `<td>${esc(s.email || "")}</td>` +
        `<td>${esc(pp.series)}</td>` +
        `<td>${esc(pp.number || s.passport || "")}</td>` +
        `<td>${esc(s.education || "")}</td></tr>`
      );
    })
    .join("");
}

function buildJournalRows(students: GenerationContext["students"]): string {
  return students
    .map(
      (s, i) =>
        `<tr><td style="text-align:center">${i + 1}</td>` +
        `<td>${esc(s.full_name)}</td>` +
        `<td style="text-align:center">V</td>` +
        `<td style="text-align:center">V</td>` +
        `<td style="text-align:center">V</td>` +
        `<td style="text-align:center">V</td></tr>`
    )
    .join("");
}

function buildAttestationRows(students: GenerationContext["students"]): string {
  // scores can later come from real exam results; demo values for prototype
  const demo = [96, 88, 92, 85, 90, 78];
  return students
    .map((s, i) => {
      const score = demo[i % demo.length];
      const grade = score >= 90 ? "5" : score >= 75 ? "4" : score >= 60 ? "3" : "2";
      return (
        `<tr><td style="text-align:center">${i + 1}</td>` +
        `<td>${esc(s.full_name)}</td>` +
        `<td style="text-align:center">${score}</td>` +
        `<td style="text-align:center">${grade}</td></tr>`
      );
    })
    .join("");
}

function buildRegistrationRows(
  students: GenerationContext["students"],
  ctx: GenerationContext,
  orderNum: string
): string {
  return students
    .map((s, i) => {
      const pp = resolvePassport(s);
      const passportStr = pp.series
        ? `серия ${pp.series} № ${pp.number}`
        : s.passport || "";
      return (
        `<tr><td style="text-align:center">${i + 1}</td>` +
        `<td>Удостоверение о повышении квалификации</td>` +
        `<td>${esc(ctx.group.program_title)}. Группа ${esc(ctx.group.number)}</td>` +
        `<td></td><td></td>` +
        `<td>${esc(s.full_name)}</td>` +
        `<td>${esc(s.birth_date || "")}</td>` +
        `<td style="text-align:center">${esc(s.gender || "")}</td>` +
        `<td>${esc(passportStr)}</td>` +
        `<td>${esc(s.citizenship || "Российская Федерация")}</td>` +
        `<td>${esc(orderNum)}</td>` +
        `<td>${formatDateShort(ctx.group.end_date)}</td>` +
        `<td></td><td></td></tr>`
      );
    })
    .join("");
}

function buildPassRows(
  students: GenerationContext["students"],
  ctx: GenerationContext
): string {
  const org =
    ctx.company?.name ||
    students[0]?.full_name?.split(" ").slice(-1)[0] ||
    "—";
  return students
    .map(
      (s, i) =>
        `<tr><td style="text-align:center">${i + 1}</td>` +
        `<td>${esc(s.full_name)}</td>` +
        `<td>${esc(ctx.company?.name || org)}</td>` +
        `<td>${esc(s.email || "")}</td>` +
        `<td>${esc(s.phone || "")}</td>` +
        `<td></td><td></td><td></td><td></td></tr>`
    )
    .join("");
}

function numberToWordsRough(n: number): string {
  // simple: return formatted number + "рублей" — full propis can be added later
  return `${n.toLocaleString("ru-RU")} рублей`;
}

export interface BuildVariablesOptions {
  documentNumber?: string;
  documentDate?: string;
  primaryStudentIndex?: number;
  totalPrice?: number;
  paymentDeadline?: string;
}

export function buildVariables(
  ctx: GenerationContext,
  opts: BuildVariablesOptions = {}
): Record<string, string> {
  const today = opts.documentDate || new Date().toISOString().slice(0, 10);
  const primary = ctx.students[opts.primaryStudentIndex ?? 0];
  const orderNum = opts.documentNumber || "";
  const price = opts.totalPrice ?? Number(ctx.extras?.total_price || 0);
  const days = trainingDays(ctx.group.start_date, ctx.group.end_date);

  const hasCompany = !!(ctx.company && ctx.company.name);
  const customerName = hasCompany
    ? ctx.company!.name
    : primary?.full_name || "________________";
  const customerBasis = hasCompany
    ? `в лице ${ctx.company?.director || "________________"}, действующего на основании ___________`
    : "действующий(ая) от собственного имени";
  const customerRequisites = hasCompany
    ? [
        ctx.company?.inn ? `ИНН ${ctx.company.inn}` : "",
        ctx.company?.kpp ? `КПП ${ctx.company.kpp}` : "",
        ctx.company?.ogrn ? `ОГРН ${ctx.company.ogrn}` : "",
        ctx.company?.address ? `Адрес: ${ctx.company.address}` : "",
        ctx.company?.director ? `Директор: ${ctx.company.director}` : "",
      ]
        .filter(Boolean)
        .join("<br/>")
    : [
        primary && passportString(primary) ? `Паспорт: ${passportString(primary)}` : "",
        primary?.address ? `Адрес: ${primary.address}` : "",
        primary?.phone ? `Тел.: ${primary.phone}` : "",
        primary?.email ? `E-mail: ${primary.email}` : "",
        primary?.snils ? `СНИЛС: ${primary.snils}` : "",
      ]
        .filter(Boolean)
        .join("<br/>");
  const customerSigner = hasCompany
    ? ctx.company?.director || ""
    : primary?.full_name || "";

  const contractBasisLine = hasCompany
    ? `Договор № ${orderNum || "___"} · ${ctx.company!.name}`
    : `Договор № ${orderNum || "___"}`;

  const basisForOrders = hasCompany
    ? `Договор + ${ctx.company!.name}`
    : orderNum
      ? `Договор № ${orderNum}`
      : "Заявление";

  const vars: Record<string, string> = {
    org_name: ctx.organization.name,
    org_short_name: orgShortName(ctx.organization.name),
    org_inn: ctx.organization.inn,
    org_kpp: ctx.organization.kpp,
    org_ogrn: ctx.organization.ogrn,
    org_address: ctx.organization.address,
    org_director_name: ctx.organization.director_name,
    org_director_position: ctx.organization.director_position,
    org_director_short: shortName(ctx.organization.director_name),
    org_bank_name: ctx.organization.bank_name || "",
    org_bank_bik: ctx.organization.bank_bik || "",
    org_bank_account: ctx.organization.bank_account || "",
    org_bank_corr_account: ctx.organization.bank_corr_account || "",
    org_email: ctx.organization.email || "",
    org_phone: ctx.organization.phone || "",
    org_license: ctx.organization.license || "",

    group_name: ctx.group.name,
    group_number: ctx.group.number,
    program_title: ctx.group.program_title,
    program_hours: String(ctx.group.program_hours),
    program_form: ctx.group.program_form,
    start_date: formatDateShort(ctx.group.start_date),
    end_date: formatDateShort(ctx.group.end_date),
    start_date_ru: formatDateRu(ctx.group.start_date),
    end_date_ru: formatDateRu(ctx.group.end_date),

    day1_date: days[0],
    day2_date: days[1],
    day3_date: days[2],
    day4_date: days[3],

    individual_name: primary?.full_name || "",
    individual_birth_date: primary?.birth_date || "",
    individual_gender: primary?.gender || "",
    individual_passport: primary ? passportString(primary) : "",
    individual_snils: primary?.snils || "",
    individual_citizenship: primary?.citizenship || "Российская Федерация",
    individual_email: primary?.email || "",
    individual_phone: primary?.phone || "",
    individual_education: primary?.education || "",
    individual_address: primary?.address || "",

    company_name: ctx.company?.name || "",
    company_inn: ctx.company?.inn || "",
    company_kpp: ctx.company?.kpp || "",
    company_ogrn: ctx.company?.ogrn || "",
    company_address: ctx.company?.address || "",
    company_director: ctx.company?.director || "",

    customer_name: customerName,
    customer_basis: customerBasis,
    customer_requisites: customerRequisites,
    customer_signer: customerSigner,
    contract_basis_line: contractBasisLine,

    contract_number: orderNum,
    contract_date: formatDateShort(today),
    contract_date_ru: formatDateRu(today),
    order_number: orderNum,
    order_date: formatDateShort(today),
    order_date_ru: formatDateRu(today),
    students_count: String(ctx.students.length),
    total_price: price
      ? price.toLocaleString("ru-RU", { minimumFractionDigits: 2 })
      : "",
    total_price_words: price ? numberToWordsRough(price) : "",
    payment_deadline: opts.paymentDeadline
      ? formatDateShort(opts.paymentDeadline)
      : formatDateShort(ctx.group.start_date),
    today: formatDateShort(today),
    today_ru: formatDateRu(today),
    year: String((parseDate(today) || new Date()).getFullYear()),

    students_table: buildStudentsTable(ctx.students),
    students_list_rows: buildStudentListRows(ctx.students, ctx, basisForOrders),
    student_list_detail_rows: buildStudentListDetailRows(ctx.students),
    journal_rows: buildJournalRows(ctx.students),
    attestation_rows: buildAttestationRows(ctx.students),
    registration_rows: buildRegistrationRows(ctx.students, ctx, orderNum),
    pass_rows: buildPassRows(ctx.students, ctx),
  };

  if (ctx.extras) {
    for (const [k, v] of Object.entries(ctx.extras)) {
      vars[k] = String(v);
    }
  }
  return vars;
}

export function renderTemplate(
  html: string,
  variables: Record<string, string>,
  rawKeys: string[] = [
    "students_table",
    "students_list_rows",
    "student_list_detail_rows",
    "journal_rows",
    "attestation_rows",
    "registration_rows",
    "pass_rows",
    "customer_requisites",
  ]
): string {
  const raw = new Set(rawKeys);
  return html.replace(
    /\{\{\s*(&)?\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (match, isRaw, key) => {
      if (!(key in variables)) return match;
      const val = variables[key] ?? "";
      if (isRaw || raw.has(key)) return val;
      return esc(val);
    }
  );
}

export function findMissing(
  html: string,
  variables: Record<string, string>
): string[] {
  const keys = new Set<string>();
  for (const m of html.matchAll(/\{\{\s*&?\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    keys.add(m[1]);
  }
  return [...keys].filter((k) => !variables[k]);
}
