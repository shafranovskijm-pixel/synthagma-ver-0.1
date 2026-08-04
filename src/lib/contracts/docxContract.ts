/**
 * DOCX-first договоры по клиентскому Word-шаблону (реестр contract_template_registry).
 * Здесь только чистая логика готовности данных + вызов серверного компилятора.
 * HTML-поток (GenerateContractDialog) не затрагивается.
 */
import { supabase } from "@/integrations/supabase/client";

export interface RegistryTemplate {
  id: string;
  template_key: string;
  name: string;
  counterparty_type: "individual" | "legal";
  template_format: "docx_ooxml" | "html";
  version_label: string;
  status: "draft" | "validated" | "approved" | "retired";
  source_path: string;
  template_sha256: string;
}

/** Учебные планы, физически присутствующие в шаблоне ГОРЭЛТЕХ v1 (приложения). */
export const GORELTECH_CURRICULA = [
  "Техническое обслуживание, монтаж, эксплуатация и ремонт взрывозащищенного электрооборудования",
  "Разработка и сертификация взрывозащищенного оборудования",
  "Проектирование электроустановок во взрывоопасных зонах",
] as const;

export const GORELTECH_TEMPLATE_KEY = "goreltech.company.paid_education";

export async function fetchDocxTemplates(counterparty: "legal" | "individual"): Promise<RegistryTemplate[]> {
  const { data, error } = await supabase
    .from("contract_template_registry")
    .select("id, template_key, name, counterparty_type, template_format, version_label, status, source_path, template_sha256")
    .eq("counterparty_type", counterparty)
    .eq("template_format", "docx_ooxml")
    .neq("status", "retired")
    .order("name");
  if (error) throw error;
  return (data || []) as RegistryTemplate[];
}

export interface ReadinessField {
  key: string;
  label: string;
  value: string;
  required: boolean;
}

export interface ReadinessGroup {
  id: "company" | "group" | "payment" | "students" | "appendices";
  title: string;
  fields: ReadinessField[];
  missing: string[];
  ready: boolean;
}

export interface DocxContractDraft {
  scalars: Record<string, string>;
  programs: Array<Record<string, string>>;
  students: Array<Record<string, string>>;
  curricula: string[];
  totalAmount: number;
  taxClauseChosen: boolean;
}

const empty = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

const COMPANY_FIELDS: Array<[string, string]> = [
  ["CUST_NAME", "Полное наименование заказчика"],
  ["CUST_INN", "ИНН"],
  ["CUST_KPP", "КПП"],
  ["CUST_OGRN", "ОГРН"],
  ["CUST_LEGAL_ADDR", "Юридический адрес"],
  ["CUST_POST_ADDR", "Почтовый адрес"],
  ["CUST_ACCOUNT", "Расчётный счёт"],
  ["CUST_BANK", "Банк"],
  ["CUST_BIK", "БИК"],
  ["CUST_CORR", "Корреспондентский счёт"],
  ["CUST_EMAIL", "E-mail"],
  ["CUST_PHONE", "Телефон"],
  ["CUST_REP_POS", "Должность подписанта"],
  ["CUST_REP_GEN", "Подписант (в родительном падеже)"],
  ["CUST_REP_SHORT", "Подписант (кратко: Иванов И.И.)"],
  ["CUST_AUTH", "Основание полномочий"],
];

const GROUP_FIELDS: Array<[string, string]> = [
  ["DOC_NO", "Номер договора"],
  ["DOC_DATE", "Дата договора"],
  ["TRAINING_ADDR", "Место обучения"],
  ["SCHEDULE", "Режим занятий"],
];

const PAYMENT_FIELDS: Array<[string, string]> = [
  ["PRICE_NUM", "Стоимость цифрами"],
  ["PRICE_WORDS", "Стоимость прописью"],
  ["TAX_CLAUSE", "Формулировка НДС"],
  ["PAYMENT_CLAUSE", "Порядок оплаты"],
];

const STUDENT_ROW_FIELDS: Array<[string, string]> = [
  ["STUDENT_FIO", "ФИО"],
  ["STUDENT_EDU", "Образование"],
  ["STUDENT_CONTACTS", "Контакты"],
  ["STUDENT_POSITION", "Должность"],
  ["STUDENT_PROGRAM", "Программа"],
  ["STUDENT_DATES", "Даты обучения"],
];

const PROGRAM_ROW_FIELDS: Array<[string, string]> = [
  ["PROG_TITLE", "Название программы"],
  ["PROG_FORM", "Форма обучения"],
  ["PROG_COUNT", "Количество слушателей"],
];

function group(
  id: ReadinessGroup["id"],
  title: string,
  defs: Array<[string, string]>,
  scalars: Record<string, string>,
): ReadinessGroup {
  const fields = defs.map(([key, label]) => ({ key, label, value: scalars[key] ?? "", required: true }));
  const missing = fields.filter((f) => empty(f.value)).map((f) => f.label);
  return { id, title, fields, missing, ready: missing.length === 0 };
}

/** Проверка готовности данных — зеркало серверных blocking_rules манифеста. */
export function evaluateDocxReadiness(draft: DocxContractDraft): ReadinessGroup[] {
  const groups: ReadinessGroup[] = [
    group("company", "Заказчик и подписант", COMPANY_FIELDS, draft.scalars),
    group("group", "Договор, группа и место обучения", GROUP_FIELDS, draft.scalars),
  ];

  const payment = group("payment", "Стоимость, НДС и оплата", PAYMENT_FIELDS, draft.scalars);
  if (!draft.totalAmount || draft.totalAmount <= 0) payment.missing.push("Стоимость договора");
  if (!draft.taxClauseChosen) payment.missing.push("НДС должен быть выбран явно");
  payment.ready = payment.missing.length === 0;
  groups.push(payment);

  const studentsMissing: string[] = [];
  if (!draft.students.length) studentsMissing.push("Не выбран ни один слушатель");
  draft.students.forEach((s, i) => {
    for (const [key, label] of STUDENT_ROW_FIELDS) {
      if (empty(s[key])) studentsMissing.push(`Слушатель №${i + 1}: ${label}`);
    }
  });
  if (!draft.programs.length) studentsMissing.push("Не выбрана ни одна программа");
  draft.programs.forEach((p, i) => {
    for (const [key, label] of PROGRAM_ROW_FIELDS) {
      if (empty(p[key])) studentsMissing.push(`Программа №${i + 1}: ${label}`);
    }
  });
  const programTitles = new Set(draft.programs.map((p) => (p.PROG_TITLE || "").trim().toLowerCase()));
  draft.students.forEach((s, i) => {
    const t = (s.STUDENT_PROGRAM || "").trim().toLowerCase();
    if (t && !programTitles.has(t)) studentsMissing.push(`Слушатель №${i + 1}: программа не входит в договор`);
  });
  groups.push({
    id: "students",
    title: "Программы и слушатели",
    fields: [],
    missing: studentsMissing,
    ready: studentsMissing.length === 0,
  });

  const appendixMissing: string[] = [];
  if (!draft.curricula.length) appendixMissing.push("Выберите учебные планы (приложения)");
  for (const c of draft.curricula) {
    if (!GORELTECH_CURRICULA.some((t) => t.toLowerCase() === c.trim().toLowerCase())) {
      appendixMissing.push(`В шаблоне нет учебного плана: ${c}`);
    }
  }
  groups.push({
    id: "appendices",
    title: "Приложения (учебные планы)",
    fields: [],
    missing: appendixMissing,
    ready: appendixMissing.length === 0,
  });

  return groups;
}

export function isDocxDraftReady(groups: ReadinessGroup[]): boolean {
  return groups.every((g) => g.ready);
}

/* ------------------------------------------------------------------ *
 * Инициализация и переключение заказчика (чистые функции для тестов) *
 * ------------------------------------------------------------------ */

/** Скаляры, полностью принадлежащие выбранной компании: при смене компании сбрасываются целиком. */
export const COMPANY_SCOPED_KEYS = COMPANY_FIELDS.map(([k]) => k);

/** Скаляры договора/группы — они НЕ привязаны к компании и при её смене сохраняются. */
export const GROUP_SCOPED_KEYS = [
  "DOC_NO", "DOC_DATE", "TRAINING_ADDR", "SCHEDULE", "PROG_FORM",
  "STUDENT_DATES", "TAX_CLAUSE", "PAYMENT_CLAUSE",
];

export interface CompanyLike {
  id?: string;
  name?: string | null;
  inn?: string | null;
  kpp?: string | null;
  ogrn?: string | null;
  address?: string | null;
  email?: string | null;
  director?: string | null;
  postal_address?: string | null;
  phone?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  bank_bik?: string | null;
  bank_corr_account?: string | null;
  signatory_position?: string | null;
  signatory_name_genitive?: string | null;
  signatory_authority_clause?: string | null;
}

const shortName = (fullName: string): string => {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const [last, ...rest] = parts;
  return [last, ...rest.map((p) => `${p[0].toUpperCase()}.`)].join(" ");
};

/**
 * Полный набор company-scoped значений выбранной компании.
 * Все 16 ключей присутствуют всегда: отсутствующие данные = пустая строка,
 * чтобы реквизиты предыдущего заказчика физически не могли остаться в договоре.
 */
export function companyScalars(company: CompanyLike | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of COMPANY_SCOPED_KEYS) out[key] = "";
  if (!company) return out;
  out.CUST_NAME = company.name || "";
  out.CUST_INN = company.inn || "";
  out.CUST_KPP = company.kpp || "";
  out.CUST_OGRN = company.ogrn || "";
  out.CUST_LEGAL_ADDR = company.address || "";
  out.CUST_POST_ADDR = company.postal_address || company.address || "";
  out.CUST_EMAIL = company.email || "";
  out.CUST_PHONE = company.phone || "";
  out.CUST_BANK = company.bank_name || "";
  out.CUST_ACCOUNT = company.bank_account || "";
  out.CUST_BIK = company.bank_bik || "";
  out.CUST_CORR = company.bank_corr_account || "";
  out.CUST_REP_SHORT = company.director ? shortName(company.director) : "";
  out.CUST_REP_POS = company.signatory_position || (company.director ? "Генеральный директор" : "");
  out.CUST_REP_GEN = company.signatory_name_genitive || "";
  out.CUST_AUTH = company.signatory_authority_clause || (company.director ? "Уставе" : "");
  return out;
}

/** Источник значения поля — показывается в мастере, чтобы данные не «придумывались». */
export type FieldSource = "company" | "group" | "profile" | "frdo" | "manual" | "numbering";

export const FIELD_SOURCE_LABELS: Record<FieldSource, string> = {
  company: "Карточка компании",
  group: "Настройки группы",
  profile: "Профиль ученика",
  frdo: "Данные ФИС ФРДО",
  manual: "Заполняется вручную",
  numbering: "Автонумерация Синтагмы",
};

/** Карта «поле договора → источник истины в Синтагме». */
export const DOCX_FIELD_SOURCES: Record<string, FieldSource> = {
  CUST_NAME: "company",
  CUST_INN: "company",
  CUST_KPP: "company",
  CUST_OGRN: "company",
  CUST_LEGAL_ADDR: "company",
  CUST_POST_ADDR: "company",
  CUST_ACCOUNT: "company",
  CUST_BANK: "company",
  CUST_BIK: "company",
  CUST_CORR: "company",
  CUST_EMAIL: "company",
  CUST_PHONE: "company",
  CUST_REP_POS: "company",
  CUST_REP_GEN: "company",
  CUST_REP_SHORT: "company",
  CUST_AUTH: "company",
  DOC_NO: "numbering",
  DOC_DATE: "manual",
  TRAINING_ADDR: "group",
  SCHEDULE: "group",
  STUDENT_DATES: "group",
  PROG_FORM: "group",
  TAX_CLAUSE: "manual",
  PAYMENT_CLAUSE: "manual",
};

export function fieldSourceLabel(key: string): string {
  const src = DOCX_FIELD_SOURCES[key] || "manual";
  return FIELD_SOURCE_LABELS[src];
}


/** Атомарная замена всех company-scoped значений при смене компании. */
export function applyCompanySelection(
  prev: Record<string, string>,
  company: CompanyLike | null | undefined,
): Record<string, string> {
  const next: Record<string, string> = { ...prev };
  for (const [key, value] of Object.entries(companyScalars(company))) next[key] = value;
  return next;
}

export interface GroupLike {
  group_number?: string | null;
  program_form?: string | null;
  program_hours?: number | null;
  program_title?: string | null;
  default_price?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  training_address?: string | null;
  schedule_text?: string | null;
}

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** «03» августа 2026 г. — формат даты договора из исходного Word-файла. */
export function formatContractDateRu(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return "";
  return `«${m[3]}» ${MONTHS_RU[Number(m[2]) - 1]} ${m[1]} г.`;
}

const ddmmyyyy = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
};

/** Даты обучения слушателей из дат группы. */
export function groupDatesText(start?: string | null, end?: string | null): string {
  const a = ddmmyyyy(start || "");
  const b = ddmmyyyy(end || "");
  if (a && b) return `${a} — ${b}`;
  return a || b || "";
}

/**
 * Режим занятий: приоритет — поле группы «Режим занятий», затем вывод
 * из формы обучения и объёма часов.
 */
export function groupScheduleText(group: GroupLike | null | undefined): string {
  if (!group) return "";
  if (group.schedule_text && group.schedule_text.trim()) return group.schedule_text.trim();
  const parts: string[] = [];
  if (group.program_form) parts.push(`Форма обучения: ${group.program_form}`);
  if (group.program_hours) parts.push(`объём ${group.program_hours} ч.`);
  return parts.join(", ");
}

/**
 * Учебный план шаблона, соответствующий названию программы группы.
 * Возвращает null, если однозначного совпадения нет — тогда выбор делает пользователь.
 */
export function matchGroupCurriculum(programTitle?: string | null): string | null {
  const t = String(programTitle || "").trim().toLowerCase();
  if (!t) return null;
  const exact = GORELTECH_CURRICULA.find((c) => c.toLowerCase() === t);
  if (exact) return exact;
  const partial = GORELTECH_CURRICULA.filter((c) => c.toLowerCase().includes(t) || t.includes(c.toLowerCase()));
  return partial.length === 1 ? partial[0] : null;
}

export interface ProfileLike {
  full_name?: string | null;
  email?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  city?: string | null;
  region?: string | null;
  job_position?: string | null;
}

export interface FrdoLike {
  education_level?: string | null;
}

export interface StudentSources {
  user_id: string;
  full_name?: string | null;
  email?: string | null;
  profile?: ProfileLike | null;
  frdo?: FrdoLike | null;
  program?: string | null;
}

export interface StudentDraftRow {
  user_id: string;
  fio: string;
  edu: string;
  contacts: string;
  position: string;
  address: string;
  program: string;
}

/** Строка слушателя, собранная только из данных Синтагмы (без выдуманных значений). */
export function studentRowFromSources(src: StudentSources): StudentDraftRow {
  const p = src.profile || {};
  const contacts = [src.email || p.contact_email || p.email || "", p.phone || ""].filter(Boolean).join(", ");
  const address = [p.region || "", p.city || ""].filter(Boolean).join(", ");
  return {
    user_id: src.user_id,
    fio: src.full_name || p.full_name || "",
    edu: (src.frdo?.education_level || "").trim(),
    contacts,
    position: (p.job_position || "").trim(),
    address,
    program: src.program || "",
  };
}

export const DEFAULT_PAYMENT_CLAUSE =
  "Оплата производится в течение 5 (пяти) банковских дней с даты выставления счёта.";

/**
 * Начальное состояние диалога. Вызывается при каждом открытии, поэтому
 * повторная генерация всегда начинается с чистых данных группы и компании.
 * DOC_NO не берётся из номера группы: он резервируется автонумерацией.
 */
export function initialDocxScalars(group: GroupLike | null | undefined, dateIso: string): Record<string, string> {
  return {
    ...companyScalars(null),
    DOC_NO: "",
    DOC_DATE: formatContractDateRu(dateIso),
    TRAINING_ADDR: group?.training_address || "",
    SCHEDULE: groupScheduleText(group),
    PROG_FORM: group?.program_form || "Очная",
    STUDENT_DATES: groupDatesText(group?.start_date, group?.end_date),
    TAX_CLAUSE: "",
    PAYMENT_CLAUSE: DEFAULT_PAYMENT_CLAUSE,
  };
}


export interface GenerateDocxParams {
  templateKey: string;
  organizationId: string;
  groupId: string | null;
  companyId: string;
  studentUserIds: string[];
  studentsMeta: Array<{ user_id: string; full_name: string }>;
  contractName: string;
  contractNumber: string;
  contractDate: string;
  draft: DocxContractDraft;
}

export interface GenerateDocxResult {
  contractId: string;
  docxSha256: string;
  keptCurricula: string[];
  pdfStatus: "unavailable" | "pending" | "ready";
}

/** Серверная компиляция DOCX. Ошибки валидации возвращаются как список issues. */
export async function generateDocxContract(params: GenerateDocxParams): Promise<GenerateDocxResult> {
  const { data, error } = await supabase.functions.invoke("compile-docx-contract", {
    body: {
      templateKey: params.templateKey,
      organizationId: params.organizationId,
      groupId: params.groupId,
      companyId: params.companyId,
      studentUserIds: params.studentUserIds,
      studentsMeta: params.studentsMeta,
      contractName: params.contractName,
      contractNumber: params.contractNumber,
      contractDate: params.contractDate,
      totalAmount: params.draft.totalAmount,
      taxClauseExplicit: true,
      scalars: params.draft.scalars,
      programs: params.draft.programs,
      students: params.draft.students,
      curricula: params.draft.curricula,
    },
  });
  if (error) throw new Error(error.message || "Не удалось сформировать договор");
  const payload = data as any;
  if (payload?.error) {
    const issues: string[] = (payload.issues || []).map((i: any) => i.message);
    throw new Error([payload.error, ...issues].join(": "));
  }
  return {
    contractId: payload.contract.id,
    docxSha256: payload.docx_sha256,
    keptCurricula: payload.kept_curricula || [],
    pdfStatus: payload.pdf_status || "unavailable",
  };
}
