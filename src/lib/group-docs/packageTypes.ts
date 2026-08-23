/**
 * Чистая логика «пакета документов группы».
 *
 * Договор НИКОГДА не входит в пакет docs: он создаётся только через
 * GenerateContractDialog (сценарии «Физическое лицо» / «Компания»).
 */
import { GROUP_DOCUMENT_TYPES } from "./groupDocuments";
import type { DocType } from "./schema";
import type { DocumentFillMode } from "./factualData";

export type ContractScenarioKind = "individual" | "legal";

/** Типы документов пакета: только folder=docs, без contract, каждый ровно один раз. */
export function buildPackageDocTypes(): DocType[] {
  const seen = new Set<string>();
  const out: DocType[] = [];
  for (const t of GROUP_DOCUMENT_TYPES) {
    if (t.folder !== "docs") continue;
    if (t.key === "contract") continue;
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    out.push(t.key as DocType);
  }
  return out;
}

export const PACKAGE_DOC_TYPES: DocType[] = buildPackageDocTypes();

/** Честное описание того, что будет создано. */
export function describePackagePlan(scenario: ContractScenarioKind, studentCount: number): string {
  const docs = PACKAGE_DOC_TYPES.length;
  return scenario === "individual"
    ? `${studentCount} договор(ов) + ${docs} документов группы`
    : `1 договор + ${docs} документов группы`;
}

/** Текст итогового toast после успешной генерации пакета. */
export function packageResultMessage(
  scenario: ContractScenarioKind,
  contractCount: number,
  docCount: number,
): string {
  const contracts = scenario === "individual"
    ? `договоров: ${contractCount}`
    : `договор: 1`;
  return `Пакет сформирован — ${contracts}, документов группы: ${docCount}`;
}

/**
 * Оркестрация: остальные документы генерируются РОВНО ОДИН РАЗ и только
 * если договоры были успешно созданы.
 */
export interface PackageOrchestrationState {
  contractsDone: boolean;
  contractCount: number;
  docsGenerated: boolean;
}

export function shouldGeneratePackageDocs(st: PackageOrchestrationState): boolean {
  return st.contractsDone && st.contractCount > 0 && !st.docsGenerated;
}

export type DocumentRequirementProfile = "generic" | "goreltech";

/**
 * Требования универсальных HTML-макетов. Это исходное поведение Синтагмы:
 * клиентский пакет ГОРЭЛТЕХ не должен менять блокировки других организаций.
 */
export const GENERIC_DOC_REQUIRED_KEYS: Record<string, string[]> = {
  enrollment_order: ["org_name", "org_director_name", "group_number", "program_title", "program_hours", "start_date"],
  expulsion_order: ["org_name", "org_director_name", "group_number", "program_title", "end_date"],
  student_list: ["org_name", "group_number", "program_title", "students"],
  class_journal: ["org_name", "org_director_name", "group_number", "program_title", "program_hours", "instructor_name", "training_dates_4", "students"],
  schedule: ["group_number", "program_title", "start_date", "end_date"],
  attestation_sheet: ["org_name", "group_number", "program_title", "students"],
  registration_book: ["org_name", "program_title", "students"],
  title_page: ["org_name", "group_number", "program_title"],
  pass: ["org_name", "group_number", "students"],
};

/** Поля, которые действительно печатаются в оригинальных Word-шаблонах ГОРЭЛТЕХ. */
export const GORELTECH_DOC_REQUIRED_KEYS: Record<string, string[]> = {
  enrollment_order: ["org_name", "group_number", "program_title", "program_hours", "start_date", "end_date", "students"],
  expulsion_order: ["org_name", "group_number", "program_title", "program_hours", "start_date", "end_date", "students"],
  student_list: ["org_name", "group_number", "program_title", "students"],
  class_journal: ["org_name", "group_number", "program_title", "program_hours", "instructor_name", "training_dates_4", "students"],
  schedule: ["program_title", "program_hours", "instructor_name"],
  attestation_sheet: ["org_name", "group_number", "program_title", "program_hours", "start_date", "end_date", "instructor_name", "students"],
  registration_book: ["org_name", "group_number", "program_title", "start_date", "end_date", "students"],
  title_page: ["org_name", "group_number", "program_title", "start_date", "end_date"],
  pass: ["org_name", "group_number", "program_title", "program_hours", "start_date", "end_date", "students"],
};

/** Совместимость: общий профиль остаётся профилем по умолчанию. */
export const DOC_REQUIRED_KEYS = GENERIC_DOC_REQUIRED_KEYS;

export const REQUIRED_KEY_LABELS: Record<string, string> = {
  org_name: "название учебного центра",
  org_director_name: "руководитель учебного центра",
  group_number: "номер группы",
  program_title: "название программы",
  program_hours: "объём часов",
  start_date: "дата начала обучения",
  end_date: "дата окончания обучения",
  students: "ученики в группе",
  instructor_name: "преподаватель",
  training_dates_4: "4 даты занятий",
};

export interface DocRequirementSource {
  org_name?: string | null;
  org_director_name?: string | null;
  group_number?: string | null;
  program_title?: string | null;
  program_hours?: number | string | null;
  start_date?: string | null;
  end_date?: string | null;
  students_count?: number;
  instructor_name?: string | null;
  training_dates_count?: number;
}

/** Незаполненные обязательные поля конкретного документа (человеческие подписи). */
export function missingDocRequirements(
  docType: string,
  src: DocRequirementSource,
  mode: DocumentFillMode = "data",
  profile: DocumentRequirementProfile = "generic",
): string[] {
  const requirements = profile === "goreltech"
    ? GORELTECH_DOC_REQUIRED_KEYS
    : GENERIC_DOC_REQUIRED_KEYS;
  const keys = (requirements[docType] || []).filter(
    (key) => !(mode === "blank" && key === "training_dates_4"),
  );
  const out: string[] = [];
  for (const key of keys) {
    const value = key === "students"
      ? (src.students_count || 0)
      : key === "training_dates_4"
        ? (src.training_dates_count || 0)
        : (src as Record<string, unknown>)[key];
    const blank = key === "training_dates_4"
      ? value !== 4
      : key === "students"
      ? !value
      : value === null || value === undefined || String(value).trim() === "" || String(value) === "0";
    if (blank) out.push(REQUIRED_KEY_LABELS[key] || key);
  }
  return out;
}

/**
 * Объединяет требования только для реально формируемых документов пакета.
 * Порядок стабилен, одинаковые человекочитаемые причины не дублируются.
 */
export function missingPackageRequirements(
  docTypes: readonly string[],
  src: DocRequirementSource,
  mode: DocumentFillMode = "data",
  profile: DocumentRequirementProfile = "generic",
): string[] {
  const missing = new Set<string>();
  for (const docType of docTypes) {
    for (const label of missingDocRequirements(docType, src, mode, profile)) {
      missing.add(label);
    }
  }
  return Array.from(missing);
}
