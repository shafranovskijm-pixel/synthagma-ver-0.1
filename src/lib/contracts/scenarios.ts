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
    });
  } else {
    if (!input.company) {
      missing.push({ key: "company", label: "компания-заказчик", blocking: true });
    } else {
      if (isBlank(input.company.name)) missing.push({ key: "company_name", label: "название компании", blocking: true });
      if (isBlank(input.company.inn)) missing.push({ key: "company_inn", label: "ИНН компании", blocking: true });
      if (isBlank(input.company.address)) missing.push({ key: "company_address", label: "адрес компании", blocking: false });
      if (isBlank(input.company.director)) missing.push({ key: "company_director", label: "подписант компании", blocking: false });
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
