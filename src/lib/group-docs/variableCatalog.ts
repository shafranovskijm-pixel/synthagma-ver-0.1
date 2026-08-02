/**
 * Каталог переменных документов группы.
 *
 * АУДИТ ДЛЯ КЛИЕНТА (как удобнее заполнять):
 * 1. organization.*  → один раз в профиле учебного центра
 * 2. group.*         → из карточки группы (программа, даты, часы)
 * 3. student.*       → из списка обучающихся группы
 * 4. company.*       → из заказчика / сделки (если юрлицо)
 * 5. computed / table → НЕ вводит клиент, считается при генерации
 *
 * Ручной ввод при генерации обычно только: стоимость, иногда номер/дата.
 * Всё остальное — «одна кнопка» из уже введённых данных.
 */

export type VariableSource =
  | "organization"
  | "group"
  | "student"
  | "company"
  | "computed"
  | "table";

export interface VariableDef {
  key: string;
  label: string;
  source: VariableSource;
  description?: string;
  usedIn?: string[];
}

export const VARIABLE_CATALOG: VariableDef[] = [
  { key: "org_name", label: "Название организации", source: "organization" },
  { key: "org_inn", label: "ИНН", source: "organization" },
  { key: "org_kpp", label: "КПП", source: "organization" },
  { key: "org_ogrn", label: "ОГРН", source: "organization" },
  { key: "org_address", label: "Адрес", source: "organization" },
  { key: "org_director_name", label: "ФИО директора", source: "organization" },
  { key: "org_director_position", label: "Должность директора", source: "organization" },
  { key: "org_bank_name", label: "Банк", source: "organization" },
  { key: "org_bank_bik", label: "БИК", source: "organization" },
  { key: "org_bank_account", label: "Р/с", source: "organization" },
  { key: "org_bank_corr_account", label: "К/с", source: "organization" },
  { key: "org_email", label: "Email", source: "organization" },
  { key: "org_phone", label: "Телефон", source: "organization" },
  { key: "org_license", label: "Лицензия", source: "organization" },
  { key: "group_name", label: "Название группы", source: "group" },
  { key: "group_number", label: "Номер группы", source: "group" },
  { key: "program_title", label: "Программа обучения", source: "group" },
  { key: "program_hours", label: "Часов", source: "group" },
  { key: "program_form", label: "Форма обучения", source: "group" },
  { key: "start_date", label: "Дата начала", source: "group" },
  { key: "end_date", label: "Дата окончания", source: "group" },
  { key: "start_date_ru", label: "Дата начала (рус.)", source: "computed" },
  { key: "end_date_ru", label: "Дата окончания (рус.)", source: "computed" },
  { key: "individual_name", label: "ФИО обучающегося", source: "student" },
  { key: "individual_birth_date", label: "Дата рождения", source: "student" },
  { key: "individual_gender", label: "Пол", source: "student" },
  { key: "individual_passport", label: "Паспорт", source: "student" },
  { key: "individual_snils", label: "СНИЛС", source: "student" },
  { key: "individual_citizenship", label: "Гражданство", source: "student" },
  { key: "individual_email", label: "Email ученика", source: "student" },
  { key: "individual_phone", label: "Телефон ученика", source: "student" },
  { key: "individual_education", label: "Образование", source: "student" },
  { key: "individual_address", label: "Адрес ученика", source: "student" },
  { key: "company_name", label: "Название заказчика", source: "company" },
  { key: "company_inn", label: "ИНН заказчика", source: "company" },
  { key: "company_kpp", label: "КПП заказчика", source: "company" },
  { key: "company_ogrn", label: "ОГРН заказчика", source: "company" },
  { key: "company_address", label: "Адрес заказчика", source: "company" },
  { key: "company_director", label: "Директор заказчика", source: "company" },
  { key: "contract_number", label: "Номер договора", source: "computed" },
  { key: "contract_date", label: "Дата договора", source: "computed" },
  { key: "contract_date_ru", label: "Дата договора (рус.)", source: "computed" },
  { key: "order_number", label: "Номер приказа", source: "computed" },
  { key: "order_date", label: "Дата приказа", source: "computed" },
  { key: "order_date_ru", label: "Дата приказа (рус.)", source: "computed" },
  { key: "students_count", label: "Количество учеников", source: "computed" },
  { key: "total_price", label: "Стоимость", source: "computed" },
  { key: "total_price_words", label: "Стоимость прописью", source: "computed" },
  { key: "today", label: "Сегодня", source: "computed" },
  { key: "today_ru", label: "Сегодня (рус.)", source: "computed" },
  { key: "year", label: "Год", source: "computed" },
  { key: "students_table", label: "Таблица учеников", source: "table" },
  { key: "students_list_rows", label: "Строки списка", source: "table" },
  { key: "registration_rows", label: "Строки книги регистрации", source: "table" },
  { key: "org_short_name", label: "Краткое название орг.", source: "organization" },
  { key: "org_director_short", label: "Директор (кратко)", source: "computed" },
  { key: "customer_name", label: "Заказчик (итог)", source: "computed" },
  { key: "customer_basis", label: "Основание заказчика", source: "computed" },
  { key: "customer_requisites", label: "Реквизиты заказчика", source: "computed" },
  { key: "customer_signer", label: "Подписант заказчика", source: "computed" },
  { key: "contract_basis_line", label: "Строка основания", source: "computed" },
  { key: "payment_deadline", label: "Срок оплаты", source: "computed" },
  { key: "day1_date", label: "День 1", source: "computed" },
  { key: "day2_date", label: "День 2", source: "computed" },
  { key: "day3_date", label: "День 3", source: "computed" },
  { key: "day4_date", label: "День 4", source: "computed" },
  { key: "student_list_detail_rows", label: "Строки списка (деталь)", source: "table" },
  { key: "pass_rows", label: "Строки пропуска", source: "table" },
];
