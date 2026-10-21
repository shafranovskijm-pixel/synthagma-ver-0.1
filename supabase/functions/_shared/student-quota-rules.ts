/** Canonical student-quota wording. Business and release rules: docs/BILLING_RULES.md. */
export const STUDENT_MONTHLY_QUOTA_LABEL = "Учеников в месяц";
export const STUDENT_MONTHLY_QUOTA_DESCRIPTION = "Учитываются уникальные ученики, которым назначен хотя бы один курс в текущем календарном месяце по московскому времени. Несколько курсов одному ученику занимают одно место за месяц. Создание профиля и хранение личного дела место не расходуют.";
export const STUDENT_RECORDS_STORAGE_LABEL = "Хранение личных дел — без ограничений";
export const STUDENT_RECORDS_STORAGE_DESCRIPTION = "Количество сохранённых учеников и личных дел не ограничено тарифом. Объём файлового хранилища определяется отдельно по тарифу.";
export const STUDENT_QUOTA_SUPPORT_CONTEXT = [
  "ПРАВИЛА ТАРИФА: УЧЕНИКИ И ЛИЧНЫЕ ДЕЛА",
  STUDENT_MONTHLY_QUOTA_DESCRIPTION,
  STUDENT_RECORDS_STORAGE_LABEL + ". " + STUDENT_RECORDS_STORAGE_DESCRIPTION,
  "Лимит завершённых обучений — отдельный показатель: один ученик завершил один курс — одно обучение.",
  "Актуальные цены и числовые лимиты смотри на странице тарифов платформы. Не выдумывай индивидуальные условия.",
  "При действующем соглашении о постоплате тарифные лимиты доступа не применяются. Расчёт счёта выполняется отдельно по согласованному договору после сверки фактического использования; не подменяй договорный расчёт количеством сохранённых профилей или назначений курсов.",
].join("\n");

export const STUDENT_ASSIGNMENT_QUOTA_ERROR_CODE = "STUDENT_ASSIGNMENT_LIMIT_EXCEEDED";
export const STUDENT_ASSIGNMENT_QUOTA_LIMIT_MESSAGE = "Достигнут месячный лимит учеников, которым назначаются курсы. Уже учтённым в этом месяце ученикам можно назначать другие курсы; создание и хранение личных дел остаются доступными.";
export const TRAINING_COMPLETION_QUOTA_ERROR_CODE = "TRAINING_COMPLETION_LIMIT_EXCEEDED";
export const TRAINING_COMPLETION_QUOTA_LIMIT_MESSAGE = "Достигнут месячный лимит завершённых обучений. Обратитесь к администратору организации.";
