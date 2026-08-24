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

export type GroupDocumentStatus = "ready" | "beta" | "planned";

/** Папка UI, в которой отображается документ. */
export type GroupDocumentFolder = "contracts" | "docs";
export type GroupDocumentOrientation = "portrait" | "landscape";
export type GroupDocumentLayout = "docx_ooxml" | "legacy_html";

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
  orientation: GroupDocumentOrientation;
  layout: GroupDocumentLayout;
  /** Короткое пояснение для UI. */
  hint?: string;
}

export const GROUP_DOCUMENT_TYPES: GroupDocumentType[] = [
  {
    key: "contract",
    title: "Договоры",
    folder: "contracts",
    status: "beta",
    orientation: "portrait",
    layout: "docx_ooxml",
    hint: "Word-договоры формируются; юридический текст шаблона ГОРЭЛТЕХ ожидает согласования",
  },
  {
    key: "enrollment_order",
    title: "Приказ о зачислении",
    folder: "docs",
    status: "beta",
    orientation: "landscape",
    layout: "legacy_html",
    hint: "Приказ о зачислении слушателей группы на обучение",
  },
  {
    key: "expulsion_order",
    title: "Приказ об отчислении",
    folder: "docs",
    status: "beta",
    orientation: "landscape",
    layout: "legacy_html",
    hint: "Приказ об отчислении / завершении обучения",
  },
  {
    key: "student_list",
    title: "Список обучающихся",
    folder: "docs",
    status: "beta",
    orientation: "portrait",
    layout: "legacy_html",
    hint: "Поимённый список слушателей группы",
  },
  {
    key: "class_journal",
    title: "Журнал учёта занятий",
    folder: "docs",
    status: "ready",
    orientation: "portrait",
    layout: "docx_ooxml",
    hint: "Журнал учёта учебных занятий и посещаемости",
  },
  {
    key: "schedule",
    title: "Расписание",
    folder: "docs",
    status: "beta",
    orientation: "portrait",
    layout: "legacy_html",
    hint: "Расписание занятий группы",
  },
  {
    key: "attestation_sheet",
    title: "Итоговая ведомость",
    folder: "docs",
    status: "beta",
    orientation: "portrait",
    layout: "legacy_html",
    hint: "Итоговая ведомость результатов аттестации",
  },
  {
    key: "registration_book",
    title: "Книга регистрации выдачи документов",
    folder: "docs",
    status: "beta",
    orientation: "landscape",
    layout: "legacy_html",
    hint: "Регистрация выданных документов об обучении (данные для ФИС ФРДО)",
  },
  {
    key: "title_page",
    title: "Титульный лист группы",
    folder: "docs",
    status: "beta",
    orientation: "portrait",
    layout: "legacy_html",
    hint: "Титульный лист дела группы",
  },
  {
    key: "pass",
    title: "Пропуск",
    folder: "docs",
    status: "beta",
    orientation: "portrait",
    layout: "legacy_html",
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
