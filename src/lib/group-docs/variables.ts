import type { DocType, GenerationContext } from "./schema";
import { VARIABLE_CATALOG } from "./variableCatalog";
import { resolveGroupDocumentClientProfile } from "./clientProfile";
import {
  ATTESTATION_SOURCE_LABEL,
  JOURNAL_SOURCE_LABEL,
  LEGACY_LAYOUT_NOTICE,
  REGISTRATION_SOURCE_LABEL,
  SCHEDULE_EMPTY_NOTICE,
  SCHEDULE_SOURCE_LABEL,
  buildAttestationBlankRows,
  buildAttestationRowsFromFacts,
  buildJournalBlankRows,
  buildJournalHead,
  buildJournalRowsFromFacts,
  buildRegistrationBlankRows,
  buildRegistrationRowsFromFacts,
  buildScheduleBlankRows,
  buildScheduleRowsFromFacts,
  emptyFactualData,
  journalDateColumns,
  type DocumentFillMode,
  type GroupFactualData,
} from "./factualData";
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

function shortInstructorNames(value: string): string {
  return value
    .split(/[;\n]+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map(shortName)
    .join("; ");
}

/**
 * Город для титульного листа берётся только из адреса организации.
 * Если адрес не содержит явного города, оставляем поле пустым для ручного заполнения.
 */
function organizationCity(address: string): string {
  const normalized = String(address || "").replace(/\s+/g, " ").trim();
  const match = normalized.match(/(?:^|,\s*)(?:г\.?|город)\s*([^,]+)/i);
  return match?.[1]?.trim() || "";
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

/**
 * Журнал / ведомость / книга регистрации собираются в factualData.ts
 * строго из snapshot Supabase. Здесь запрещено любое подставление
 * отметок, баллов, оценок и номеров документов.
 */


function buildPassRows(
  students: GenerationContext["students"],
  ctx: GenerationContext
): string {
  const org = ctx.company?.name || "";
  return students
    .map(
      (s, i) =>
        `<tr><td style="text-align:center">${i + 1}</td>` +
        `<td>${esc(s.full_name)}</td>` +
        `<td>${esc(org)}</td>` +
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
  /** "blank" — рабочий бланк, "data" — заполнение по данным Синтагмы. */
  mode?: DocumentFillMode;
  /** Snapshot фактических данных Supabase (обязателен для mode="data"). */
  factual?: GroupFactualData | null;
  /** Тип документа нужен для выбора подписанта именно этого бланка. */
  docType?: DocType;
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
  const dataMode = opts.mode === "data";
  const factual = opts.factual || emptyFactualData();
  const journalDates = journalDateColumns(factual.lessonCompletions);
  const clientProfile = resolveGroupDocumentClientProfile(ctx.organization);
  const signatoryPositionKey = opts.docType
    ? `signatory_position_${opts.docType}`
    : "";
  const signatoryNameKey = opts.docType ? `signatory_name_${opts.docType}` : "";
  const hasSignatoryPosition = Boolean(
    signatoryPositionKey
      && Object.prototype.hasOwnProperty.call(ctx.extras || {}, signatoryPositionKey),
  );
  const hasSignatoryName = Boolean(
    signatoryNameKey
      && Object.prototype.hasOwnProperty.call(ctx.extras || {}, signatoryNameKey),
  );
  const signatoryPosition = hasSignatoryPosition
    ? String(ctx.extras?.[signatoryPositionKey] ?? "")
    : String(ctx.organization.director_position || "");
  const signatoryName = hasSignatoryName
    ? String(ctx.extras?.[signatoryNameKey] ?? "")
    : String(ctx.organization.director_name || "");

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

  const explicitContractBasis = String(ctx.extras?.contract_basis || "").trim();
  // В оригинале клиента графа «На основании» заполняется вручную.
  // Автоподстановка разрешена только когда основание явно передано вызывающим кодом.
  const basisForOrders = clientProfile.key === "goreltech" ? "" : explicitContractBasis;

  const instructorName = String(ctx.group.instructor_name || "").trim();
  const responsiblePersonName = String(ctx.extras?.responsible_person_name || "").trim()
    || clientProfile.responsiblePersonFallback;
  const expulsionOutcome = String(ctx.extras?.expulsion_outcome || "").trim()
    || clientProfile.expulsionOutcomeFallback
    || "____________________________";
  const orgTitleHeaderHtml = clientProfile.key === "goreltech"
    ? `<p>Учебный центр Общества с ограниченной ответственностью<br/>«Инжиниринговый центр «ГОРЭЛТЕХ»</p><p>(${esc(clientProfile.shortName)})</p>`
    : `<p>${esc(ctx.organization.name)}</p>`;

  const vars: Record<string, string> = {
    org_name: ctx.organization.name,
    org_short_name: clientProfile.shortName,
    org_title_header_html: orgTitleHeaderHtml,
    org_inn: ctx.organization.inn,
    org_kpp: ctx.organization.kpp,
    org_ogrn: ctx.organization.ogrn,
    org_address: ctx.organization.address,
    org_city: organizationCity(ctx.organization.address) || clientProfile.cityFallback,
    org_director_name: ctx.organization.director_name,
    // Должность не выводится из клиентского профиля: пустая карточка должна
    // остаться пустой, пока организация явно не выберет подписанта.
    org_director_position: ctx.organization.director_position || "",
    org_director_short: shortName(ctx.organization.director_name),
    signatory_position: signatoryPosition,
    signatory_name: signatoryName,
    signatory_short: shortName(signatoryName),
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
    // Режим занятий берётся ТОЛЬКО из настроек группы: legacy-договор не
    // утверждает несуществующее время обучения.
    schedule_text: ctx.group.schedule_text
      ? `Режим занятий: ${ctx.group.schedule_text}.`
      : "Режим занятий в настройках группы не задан.",
    instructor_name: instructorName,
    instructor_short: instructorName ? shortInstructorNames(instructorName) : "",
    responsible_person_name: responsiblePersonName || "____________________________",
    expulsion_outcome: expulsionOutcome,
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
    // Fail-closed: гражданство только из данных ученика (ФРДО), без подстановки «РФ».
    individual_citizenship: primary?.citizenship || "",
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
    journal_head: dataMode
      ? buildJournalHead(journalDates)
      : buildJournalHead([]),
    journal_rows: dataMode
      ? buildJournalRowsFromFacts(ctx.students, factual.lessonCompletions, journalDates)
      : buildJournalBlankRows(ctx.students),
    journal_source_note: dataMode
      ? JOURNAL_SOURCE_LABEL
      : "Рабочий бланк: отметки заполняются вручную.",
    attestation_rows: dataMode
      ? buildAttestationRowsFromFacts(ctx.students, factual.attestation)
      : buildAttestationBlankRows(ctx.students),
    attestation_source_note: dataMode
      ? ATTESTATION_SOURCE_LABEL
      : "Рабочий бланк: результаты заполняются вручную.",
    registration_rows: dataMode
      ? buildRegistrationRowsFromFacts(
          factual.registration,
          ctx.group.end_date,
          ctx.group.program_title,
          ctx.group.number,
          ctx.group.start_date,
          ctx.organization.name,
        )
      : buildRegistrationBlankRows(
          ctx.students,
          ctx.group.end_date,
          ctx.group.program_title,
          ctx.group.number,
          ctx.group.start_date,
        ),
    registration_source_note: dataMode
      ? REGISTRATION_SOURCE_LABEL
      : "Рабочий бланк: номера документов заполняются вручную.",
    schedule_rows: dataMode
      ? buildScheduleRowsFromFacts(factual.schedule)
      : buildScheduleBlankRows(),
    schedule_notice:
      dataMode && factual.schedule.length === 0
        ? SCHEDULE_EMPTY_NOTICE
        : dataMode
          ? SCHEDULE_SOURCE_LABEL
          : "Рабочий бланк: занятия заполняются вручную.",
    layout_notice: LEGACY_LAYOUT_NOTICE,
    fill_mode: dataMode ? "Заполнено по данным Синтагмы" : "Рабочий бланк",
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
    "journal_head",
    "journal_rows",
    "schedule_rows",
    "attestation_rows",
    "registration_rows",
    "pass_rows",
    "customer_requisites",
    "org_title_header_html",
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
