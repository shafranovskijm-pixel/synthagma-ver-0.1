// Shared variable categories for template editor
export interface VariableCategory {
  color: string;
  borderColor: string;
  label: string;
  keys: { key: string; label: string }[];
}

export const VARIABLE_CATEGORIES: Record<string, VariableCategory> = {
  contract: {
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
    borderColor: "border-blue-400",
    label: "Договор",
    keys: [
      { key: "contract_number", label: "Номер договора" },
      { key: "contract_date", label: "Дата договора" },
      { key: "contract_valid_until", label: "Срок действия (1 год)" },
      { key: "additional_terms", label: "Дополнительные условия" },
    ],
  },
  organization: {
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
    borderColor: "border-emerald-400",
    label: "Организация",
    keys: [
      { key: "org_name", label: "Название организации" },
      { key: "org_director_position", label: "Должность руководителя" },
      { key: "org_director_name", label: "ФИО руководителя (имен.)" },
      { key: "org_director_name_genitive", label: "ФИО руководителя (род.)" },
      { key: "org_director_acting", label: "действующего/действующей" },
      { key: "org_inn", label: "ИНН организации" },
      { key: "org_kpp", label: "КПП организации" },
      { key: "org_ogrn", label: "ОГРН организации" },
      { key: "org_address", label: "Адрес организации" },
      { key: "org_bank_name", label: "Название банка" },
      { key: "org_bank_bik", label: "БИК банка" },
      { key: "org_bank_account", label: "Расчётный счёт" },
      { key: "org_bank_corr_account", label: "Корр. счёт" },
    ],
  },
  company: {
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
    borderColor: "border-amber-400",
    label: "Заказчик",
    keys: [
      { key: "company_name", label: "Название компании" },
      { key: "company_director", label: "Руководитель компании" },
      { key: "company_inn", label: "ИНН компании" },
      { key: "company_kpp", label: "КПП компании" },
      { key: "company_ogrn", label: "ОГРН компании" },
      { key: "company_address", label: "Адрес компании" },
    ],
  },
  course: {
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
    borderColor: "border-purple-400",
    label: "Курс",
    keys: [
      { key: "course_title", label: "Название курса" },
      { key: "course_duration", label: "Длительность курса" },
      { key: "course_hours", label: "Кол-во часов" },
      { key: "service_start_date", label: "Дата начала" },
      { key: "service_end_date", label: "Дата окончания" },
    ],
  },
  individual: {
    color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-300",
    borderColor: "border-cyan-400",
    label: "Физ. лицо",
    keys: [
      { key: "individual_name", label: "ФИО физ. лица" },
      { key: "individual_passport", label: "Паспортные данные" },
      { key: "individual_address", label: "Адрес физ. лица" },
      { key: "individual_phone", label: "Телефон физ. лица" },
      { key: "individual_email", label: "E-mail физ. лица" },
    ],
  },
  payment: {
    color: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300",
    borderColor: "border-rose-400",
    label: "Оплата",
    keys: [
      { key: "students_count", label: "Количество обучающихся" },
      { key: "price", label: "Цена за 1 человека" },
      { key: "total_price", label: "Общая сумма" },
      { key: "total_price_words", label: "Сумма прописью" },
      { key: "programs_table", label: "Таблица программ" },
      { key: "programs_list", label: "Список программ" },
    ],
  },
};

export const ALL_KNOWN_KEYS = Object.values(VARIABLE_CATEGORIES).flatMap(c => c.keys.map(k => k.key));

export const REQUIRED_KEYS = [
  "contract_number", "contract_date", "org_name",
];

// At least one of these should be present
export const COUNTERPARTY_KEYS = ["company_name", "individual_name"];

export function getVariableCategoryByKey(variableName: string) {
  for (const [, category] of Object.entries(VARIABLE_CATEGORIES)) {
    if (category.keys.some(k => k.key === variableName)) {
      return category;
    }
  }
  return null;
}
