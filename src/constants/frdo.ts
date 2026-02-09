// FRDO constants and data for export to FIS FRDO

export const FRDO_PROGRAM_TYPES = [
  { value: "qualification_upgrade", label: "Повышение квалификации" },
  { value: "professional_retraining", label: "Профессиональная переподготовка" },
  { value: "professional_training", label: "Профессиональное обучение" },
] as const;

export const FRDO_DOCUMENT_TYPES: Record<string, string> = {
  qualification_upgrade: "Удостоверение о повышении квалификации",
  professional_retraining: "Диплом о профессиональной переподготовке",
  professional_training: "Свидетельство о профессии рабочего, должности служащего",
};

export const FRDO_TRAINING_FORMS = [
  "Очная",
  "Заочная",
  "Очно-заочная",
] as const;

export const FRDO_FINANCING_SOURCES = [
  "Платное обучение",
  "Бюджетное обучение",
] as const;

export const FRDO_EDUCATION_FORMS = [
  "в образовательной организации",
  "вне образовательной организации",
] as const;

export const FRDO_EDUCATION_LEVELS = [
  "Высшее образование",
  "Среднее профессиональное образование",
  "Среднее общее образование",
  "Основное общее образование",
] as const;

export const FRDO_DOCUMENT_STATUSES = [
  "Оригинал",
  "Дубликат",
] as const;

export const FRDO_PO_PROGRAM_TYPES = [
  "Программа профессиональной подготовки по профессии рабочего, должности служащего",
  "Программа переподготовки рабочих, служащих",
  "Программа повышения квалификации рабочих, служащих",
] as const;

export const FRDO_PROFESSIONAL_AREAS = [
  "Административно-управленческая и офисная деятельность",
  "Архитектура, проектирование, геодезия, топография и дизайн",
  "Безопасность",
  "Добыча, переработка, транспортировка нефти, газа и угля",
  "Добыча, переработка угля, руд и других полезных ископаемых",
  "Жилищно-коммунальное хозяйство",
  "Здравоохранение",
  "Издательское дело, средства массовой информации и индустрия развлечений",
  "Информация и связь",
  "Легкая и текстильная промышленность",
  "Лесное хозяйство, охота",
  "Металлургическое производство",
  "Образование и наука",
  "Обслуживание и ремонт автотранспортных средств",
  "Производство машин и оборудования",
  "Производство пищевых продуктов, включая напитки",
  "Ракетно-космическая промышленность",
  "Рыбоводство, рыболовство",
  "Сельское хозяйство",
  "Социальное обслуживание",
  "Строительство",
  "Судостроение",
  "Торговля и сфера услуг",
  "Транспорт",
  "Физическая культура и спорт",
  "Финансы и страхование",
  "Химическое, химико-технологическое производство",
  "Электроэнергетика",
  "Юриспруденция",
];

export const FRDO_SPECIALTY_GROUPS = [
  "Экономика и управление",
  "Юриспруденция",
  "Педагогика",
  "Психология",
  "Социология и социальная работа",
  "Здравоохранение и медицинские науки",
  "Информатика и вычислительная техника",
  "Техника и технологии строительства",
  "Электроника, радиотехника и системы связи",
  "Электро- и теплоэнергетика",
  "Машиностроение",
  "Химические технологии",
  "Промышленная экология и биотехнологии",
  "Техносферная безопасность и природообустройство",
  "Прикладная геология, горное дело, нефтегазовое дело и геодезия",
  "Технологии материалов",
  "Технологии легкой промышленности",
  "Фотоника, приборостроение, оптические и биотехнические системы",
  "Ядерная энергетика и технологии",
  "Сельское, лесное и рыбное хозяйство",
  "Ветеринария и зоотехния",
  "Языкознание и литературоведение",
  "История и археология",
  "Философия, этика и религиоведение",
  "Политические науки и регионоведение",
  "Средства массовой информации и информационно-библиотечное дело",
  "Сервис и туризм",
  "Культуроведение и социокультурные проекты",
  "Изобразительное и прикладные виды искусств",
  "Музыкальное искусство",
  "Театральное искусство",
  "Экранные искусства",
  "Физическая культура и спорт",
  "Военное управление",
  "Обеспечение государственной безопасности",
];

export type FRDOProgramType = typeof FRDO_PROGRAM_TYPES[number]["value"];

export interface CourseFRDOSettings {
  frdo_program_type: string | null;
  frdo_document_type: string | null;
  frdo_professional_area: string | null;
  frdo_specialty_group: string | null;
  frdo_qualification_name: string | null;
  frdo_profession_name: string | null;
  frdo_qualification_rank: string | null;
}

/**
 * Detect gender from Russian middle name (patronymic).
 * Returns "Муж" for masculine endings (ич, ыч),
 * "Жен" for feminine endings (на, вна),
 * or null if unable to determine.
 */
export function detectGenderFromMiddleName(middleName: string | null | undefined): string | null {
  if (!middleName || middleName.trim().length < 2) return null;
  
  const name = middleName.trim().toLowerCase();
  
  // Masculine: ends with "ич" or "ыч" (e.g., Иванович, Фомич, Ильич, Кузьмич)
  if (name.endsWith("ич") || name.endsWith("ыч")) {
    return "Муж";
  }
  
  // Feminine: ends with "на" (e.g., Ивановна, Сергеевна, Ильинична)
  if (name.endsWith("на")) {
    return "Жен";
  }
  
  return null;
}

/**
 * Generate document number in format YYYY/NNNNNN
 */
export function generateDocumentNumber(existingCount: number): string {
  const year = new Date().getFullYear();
  const num = (existingCount + 1).toString().padStart(6, "0");
  return `${year}/${num}`;
}

/**
 * Generate registration number in format ДОК-YYYY/NNNN
 */
export function generateRegNumber(existingCount: number): string {
  const year = new Date().getFullYear();
  const num = (existingCount + 1).toString().padStart(4, "0");
  return `ДОК-${year}/${num}`;
}
