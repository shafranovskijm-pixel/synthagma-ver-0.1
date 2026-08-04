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
