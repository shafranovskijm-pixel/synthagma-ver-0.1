/**
 * Единая конфигурация типов документов группы.
 *
 * Фундамент системы «Документы группы»: все документы, которые генерируются
 * внутри папки группы, описываются здесь. Это позволяет:
 *  - показывать одинаковые названия в UI (папки, списки, бейджи);
 *  - постепенно включать новые типы (status: planned → ready);
 *  - сохранять связь документа с группой и данными для ФИС ФРДО.
 *
 * ВАЖНО: конфигурация не меняет схему БД. Договоры продолжают храниться
 * в `org_contracts` (с обязательным `student_group_id`), остальные типы
 * будут подключаться к уже существующим таблицам документов/журналов.
 */

export type GroupDocumentStatus = "ready" | "planned";

/** Папка UI, в которой отображается документ. */
export type GroupDocumentFolder = "contracts" | "docs";

export type GroupDocumentTypeKey =
  | "contract"
  | "enrollment_order"
  | "expulsion_order"
  | "student_list"
  | "class_journal"
  | "schedule"
  | "attestation_sheet"
  | "registration_book"
  | "title_page"
  | "pass";

export interface GroupDocumentType {
  key: GroupDocumentTypeKey;
  title: string;
  folder: GroupDocumentFolder;
  status: GroupDocumentStatus;
  /** Короткое пояснение для UI. */
  hint?: string;
}

export const GROUP_DOCUMENT_TYPES: GroupDocumentType[] = [
  {
    key: "contract",
    title: "Договоры",
    folder: "contracts",
    status: "ready",
    hint: "Договоры с учениками и организациями-заказчиками группы",
  },
  {
    key: "enrollment_order",
    title: "Приказ о зачислении",
    folder: "docs",
    status: "planned",
    hint: "Приказ о зачислении слушателей группы на обучение",
  },
  {
    key: "expulsion_order",
    title: "Приказ об отчислении",
    folder: "docs",
    status: "planned",
    hint: "Приказ об отчислении / завершении обучения",
  },
  {
    key: "student_list",
    title: "Список обучающихся",
    folder: "docs",
    status: "planned",
    hint: "Поимённый список слушателей группы",
  },
  {
    key: "class_journal",
    title: "Журнал учёта занятий",
    folder: "docs",
    status: "planned",
    hint: "Журнал учёта учебных занятий и посещаемости",
  },
  {
    key: "schedule",
    title: "Расписание",
    folder: "docs",
    status: "planned",
    hint: "Расписание занятий группы",
  },
  {
    key: "attestation_sheet",
    title: "Итоговая ведомость",
    folder: "docs",
    status: "planned",
    hint: "Итоговая ведомость результатов аттестации",
  },
  {
    key: "registration_book",
    title: "Книга регистрации выдачи документов",
    folder: "docs",
    status: "planned",
    hint: "Регистрация выданных документов об обучении (данные для ФИС ФРДО)",
  },
  {
    key: "title_page",
    title: "Титульный лист группы",
    folder: "docs",
    status: "planned",
    hint: "Титульный лист дела группы",
  },
  {
    key: "pass",
    title: "Пропуск",
    folder: "docs",
    status: "planned",
    hint: "Пропуски слушателей на территорию обучения",
  },
];

export const GROUP_DOCUMENT_TYPE_MAP: Record<GroupDocumentTypeKey, GroupDocumentType> =
  GROUP_DOCUMENT_TYPES.reduce((acc, t) => {
    acc[t.key] = t;
    return acc;
  }, {} as Record<GroupDocumentTypeKey, GroupDocumentType>);

export function getGroupDocumentTypes(folder: GroupDocumentFolder): GroupDocumentType[] {
  return GROUP_DOCUMENT_TYPES.filter(t => t.folder === folder);
}

export function getGroupDocumentType(key: GroupDocumentTypeKey): GroupDocumentType {
  return GROUP_DOCUMENT_TYPE_MAP[key];
}
