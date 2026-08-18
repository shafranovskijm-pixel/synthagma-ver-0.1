/**
 * Чистая логика двух сценариев договора:
 *  - individual — договор с физическим лицом (по одному документу на каждого ученика);
 *  - legal      — один договор с компанией-заказчиком со списком слушателей.
 *
 * Файл не содержит обращений к БД и UI, чтобы логику можно было покрыть тестами.
 */

export type ContractScenario = "individual" | "legal";

/** Тип шаблона: сценарный либо универсальный. */
export type TemplateCounterpartyType = ContractScenario | "any";

export interface ScenarioStudent {
  user_id: string;
  full_name: string;
  email?: string | null;
  passport?: string | null;
  address?: string | null;
  phone?: string | null;
}

export interface ScenarioCompany {
  id: string;
  name: string;
  inn?: string | null;
  kpp?: string | null;
  ogrn?: string | null;
  address?: string | null;
  director?: string | null;
}

export interface ScenarioOrg {
  name?: string | null;
  inn?: string | null;
  legal_address?: string | null;
  director_name?: string | null;
  director_position?: string | null;
}

export interface ScenarioInput {
  org: ScenarioOrg | null;
  students: ScenarioStudent[];
  company?: ScenarioCompany | null;
  /** Название программы обучения. */
  programTitle?: string;
  /** Стоимость договора (строкой из инпута). */
  price?: string;
  date?: string;
  templateId?: string;
}

export interface MissingField {
  key: string;
  label: string;
  /** true — без этого поля генерация запрещена. */
  blocking: boolean;
}

/** Подходит ли шаблон выбранному сценарию. */
export function templateMatchesScenario(
  templateType: string | null | undefined,
  scenario: ContractScenario,
): boolean {
  const t = (templateType || "any") as TemplateCounterpartyType;
  return t === "any" || t === scenario;
}

/** Выбор шаблона по умолчанию для сценария: сначала сценарный, затем универсальный. */
export function pickDefaultTemplate<T extends { id: string; is_default?: boolean | null; counterparty_type?: string | null }>(
  templates: T[],
  scenario: ContractScenario,
): T | undefined {
  const usable = templates.filter(t => templateMatchesScenario(t.counterparty_type, scenario));
  return (
    usable.find(t => t.is_default && t.counterparty_type === scenario) ||
    usable.find(t => t.is_default) ||
    usable.find(t => t.counterparty_type === scenario) ||
    usable[0]
  );
}

const ORG_REQUIRED: Array<{ key: keyof ScenarioOrg; label: string }> = [
  { key: "name", label: "название учебного центра" },
  { key: "inn", label: "ИНН учебного центра" },
  { key: "legal_address", label: "адрес учебного центра" },
  { key: "director_name", label: "руководитель учебного центра" },
  { key: "director_position", label: "должность руководителя учебного центра" },
];

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

/**
 * Проверка обязательных полей перед генерацией.
 * Возвращает список незаполненных полей: blocking=true блокирует генерацию.
 */
export function validateScenario(scenario: ContractScenario, input: ScenarioInput): MissingField[] {
  const missing: MissingField[] = [];

  for (const f of ORG_REQUIRED) {
    if (isBlank(input.org?.[f.key])) {
      missing.push({ key: `org_${String(f.key)}`, label: f.label, blocking: true });
    }
  }

  if (!input.templateId) {
    missing.push({ key: "template", label: "шаблон договора", blocking: true });
  }

  if (input.students.length === 0) {
    missing.push({
      key: "students",
      label: scenario === "individual" ? "обучающиеся (физлица)" : "список слушателей",
      blocking: true,
    });
  }

  if (scenario === "individual") {
    input.students.forEach(s => {
      if (isBlank(s.full_name)) {
        missing.push({ key: `student_${s.user_id}_name`, label: "ФИО ученика", blocking: true });
      }
      if (isBlank(s.passport)) {
        missing.push({ key: `student_${s.user_id}_passport`, label: `паспорт: ${s.full_name || s.user_id}`, blocking: false });
      }
      if (isBlank(s.address)) {
        missing.push({ key: `student_${s.user_id}_address`, label: `адрес: ${s.full_name || s.user_id}`, blocking: false });
      }
      if (isBlank(s.phone)) {
        missing.push({ key: `student_${s.user_id}_phone`, label: `телефон: ${s.full_name || s.user_id}`, blocking: false });
      }
    });
  } else {
    if (!input.company) {
      missing.push({ key: "company", label: "компания-заказчик", blocking: true });
    } else {
      if (isBlank(input.company.name)) missing.push({ key: "company_name", label: "название компании", blocking: true });
      if (isBlank(input.company.inn)) missing.push({ key: "company_inn", label: "ИНН компании", blocking: true });
      if (isBlank(input.company.address)) missing.push({ key: "company_address", label: "адрес компании", blocking: true });
      if (isBlank(input.company.director)) missing.push({ key: "company_director", label: "подписант компании", blocking: true });
    }
  }

  if (isBlank(input.programTitle)) {
    missing.push({ key: "program_title", label: "программа обучения", blocking: false });
  }
  if (isBlank(input.price) || Number(input.price) <= 0) {
    missing.push({ key: "price", label: "стоимость договора", blocking: false });
  }

  return missing;
}

export function blockingMissing(missing: MissingField[]): MissingField[] {
  return missing.filter(m => m.blocking);
}

export interface ContractJob {
  /** Ключ для пути в storage. */
  key: string;
  /** Ученик-подписант (только для сценария физлица). */
  studentUserId: string | null;
  companyId: string | null;
  /** Слушатели, попадающие в {{students_table}}. */
  students: ScenarioStudent[];
  /** Название документа без номера. */
  label: string;
}

/**
 * Раскладывает выбор пользователя на конкретные документы:
 *  - individual → N документов (по одному на ученика);
 *  - legal      → 1 документ со всеми слушателями.
 */
export function planContractJobs(scenario: ContractScenario, input: ScenarioInput): ContractJob[] {
  if (scenario === "individual") {
    return input.students.map(s => ({
      key: s.user_id,
      studentUserId: s.user_id,
      companyId: null,
      students: [s],
      label: `Договор — ${s.full_name}`,
    }));
  }
  const company = input.company;
  return [
    {
      key: `company_${company?.id || "unknown"}`,
      studentUserId: null,
      companyId: company?.id || null,
      students: input.students,
      label: `Договор — ${company?.name || "заказчик"}`,
    },
  ];
}

/** Человеческие названия переменных шаблона — для явного показа пропусков перед генерацией. */
export const VARIABLE_LABELS: Record<string, string> = {
  org_name: "название учебного центра",
  org_inn: "ИНН учебного центра",
  org_kpp: "КПП учебного центра",
  org_ogrn: "ОГРН учебного центра",
  org_address: "адрес учебного центра",
  org_director_name: "руководитель учебного центра",
  org_director_position: "должность руководителя",
  org_director_authority: "формулировка полномочий руководителя",
  org_director_acting: "согласованная форма «действующего/действующей»",
  org_bank_name: "банк учебного центра",
  org_bank_bik: "БИК банка",
  org_bank_account: "расчётный счёт",
  org_bank_corr_account: "корр. счёт",
  org_email: "email учебного центра",
  org_phone: "телефон учебного центра",
  company_name: "название компании",
  company_inn: "ИНН компании",
  company_kpp: "КПП компании",
  company_ogrn: "ОГРН компании",
  company_address: "адрес компании",
  company_director: "подписант компании",
  individual_name: "ФИО обучающегося",
  individual_passport: "паспорт обучающегося",
  individual_address: "адрес обучающегося",
  individual_phone: "телефон обучающегося",
  individual_email: "email обучающегося",
  contract_number: "номер договора",
  contract_date: "дата договора",
  course_title: "программа обучения",
  course_hours: "объём часов",
  program_title: "программа обучения",
  program_hours: "объём часов",
  program_form: "форма обучения",
  total_price: "стоимость",
  total_price_words: "стоимость прописью",
  price: "стоимость",
};

export interface VariableGap {
  key: string;
  label: string;
}

/**
 * Переменные, которые есть в выбранном шаблоне, но не заполнены значениями.
 * Показываются пользователю перед генерацией (банковские реквизиты и прочее).
 */
export function templateVariableGaps(
  templateVars: string[],
  values: Record<string, unknown>,
): VariableGap[] {
  return templateVars
    .filter(k => isBlank(values[k]))
    .map(k => ({ key: k, label: VARIABLE_LABELS[k] || k }));
}

/** Плейсхолдеры, жёстко привязанные к сценарию. */
export const SCENARIO_PLACEHOLDERS: Record<ContractScenario, string[]> = {
  individual: ["individual_name", "individual_passport", "individual_address", "individual_phone", "individual_email"],
  legal: ["company_name", "company_inn", "company_kpp", "company_ogrn", "company_address", "company_director"],
};

/** Плейсхолдеры чужого сценария внутри шаблона — такой шаблон нельзя использовать. */
export function crossScenarioPlaceholders(templateVars: string[], scenario: ContractScenario): string[] {
  const other: ContractScenario = scenario === "individual" ? "legal" : "individual";
  const foreign = new Set(SCENARIO_PLACEHOLDERS[other]);
  return templateVars.filter(v => foreign.has(v));
}

/**
 * Шаблон пригоден для сценария: тип совпадает (или any) И
 * в теле нет плейсхолдеров противоположного сценария.
 */
export function templateUsableForScenario(
  templateType: string | null | undefined,
  templateVars: string[],
  scenario: ContractScenario,
): boolean {
  if (!templateMatchesScenario(templateType, scenario)) return false;
  return crossScenarioPlaceholders(templateVars, scenario).length === 0;
}
