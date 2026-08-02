/**
 * Единая конфигурация типов документов группы.
 * Фундамент для интеграции в Синтагму.
 */

export type GroupDocumentStatus = "ready" | "planned";
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
  hint?: string;
}

export const GROUP_DOCUMENT_TYPES: GroupDocumentType[] = [
  {
    key: "contract",
    title: "Договоры",
    folder: "contracts",
    status: "ready",
    hint: "Договоры с учениками и организациями-заказчиками",
  },
  {
    key: "enrollment_order",
    title: "Приказ о зачислении",
    folder: "docs",
    status: "ready",
    hint: "Приказ о зачислении слушателей группы",
  },
  {
    key: "expulsion_order",
    title: "Приказ об отчислении",
    folder: "docs",
    status: "ready",
    hint: "Приказ об отчислении / завершении обучения",
  },
  {
    key: "student_list",
    title: "Список обучающихся",
    folder: "docs",
    status: "ready",
    hint: "Поимённый список слушателей группы",
  },
  {
    key: "class_journal",
    title: "Журнал учёта занятий",
    folder: "docs",
    status: "ready",
    hint: "Журнал учёта учебных занятий и посещаемости",
  },
  {
    key: "schedule",
    title: "Расписание",
    folder: "docs",
    status: "ready",
    hint: "Расписание занятий группы",
  },
  {
    key: "attestation_sheet",
    title: "Итоговая ведомость",
    folder: "docs",
    status: "ready",
    hint: "Итоговая ведомость результатов аттестации",
  },
  {
    key: "registration_book",
    title: "Книга регистрации выдачи документов",
    folder: "docs",
    status: "ready",
    hint: "Книга регистрации выдачи документов о квалификации (ФРДО)",
  },
  {
    key: "title_page",
    title: "Титульный лист группы",
    folder: "docs",
    status: "ready",
    hint: "Титульный лист группы",
  },
  {
    key: "pass",
    title: "Пропуск",
    folder: "docs",
    status: "ready",
    hint: "Пропуск на обучение",
  },
];

export const GROUP_DOCUMENT_TYPE_MAP = GROUP_DOCUMENT_TYPES.reduce(
  (acc, t) => {
    acc[t.key] = t;
    return acc;
  },
  {} as Record<GroupDocumentTypeKey, GroupDocumentType>
);

export function getGroupDocumentTypes(folder: GroupDocumentFolder) {
  return GROUP_DOCUMENT_TYPES.filter((t) => t.folder === folder);
}
