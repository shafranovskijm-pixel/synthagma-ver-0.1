import {
  expandRepeaterTable,
  numberStudents,
  parseBodyElements,
  type ManifestVariable,
} from "./compile.ts";
import { findUnresolvedTokens, replaceTokens } from "./xml.ts";

export interface ClassJournalManifest {
  schema_version: number;
  template_id: string;
  template_version: string;
  scenario: string;
  source_sha256: string;
  template_sha256: string;
  variables: ManifestVariable[];
  repeaters: Record<
    string,
    {
      table_index: number;
      header_rows: number;
      prototype_row: number;
      strategy: string;
    }
  >;
  constraints?: {
    training_dates_exact_count?: number;
    attendance_default?: string;
    no_inferred_instructor?: boolean;
    no_silent_date_truncation?: boolean;
  };
}

export interface ClassJournalSnapshot {
  scalars: Record<string, string>;
  students: Array<Record<string, string>>;
}

export interface ClassJournalIssue {
  code: string;
  token?: string;
  message: string;
}

const isEmpty = (value: unknown) =>
  value === null || value === undefined || String(value).trim() === "";

export function validateClassJournalSnapshot(
  manifest: ClassJournalManifest,
  snapshot: ClassJournalSnapshot,
): ClassJournalIssue[] {
  const issues: ClassJournalIssue[] = [];
  for (const variable of manifest.variables.filter((item) => !item.scope)) {
    const key = variable.token.slice(2, -2);
    if (variable.required && isEmpty(snapshot.scalars[key])) {
      issues.push({
        code: "missing_scalar",
        token: variable.token,
        message: `Не заполнено обязательное поле журнала: ${variable.key}`,
      });
    }
  }

  const expectedDates = manifest.constraints?.training_dates_exact_count ?? 4;
  const presentDates = Array.from({ length: expectedDates }, (_, index) =>
    snapshot.scalars[`DATE_${index + 1}`],
  ).filter((value) => !isEmpty(value));
  if (presentDates.length !== expectedDates) {
    issues.push({
      code: "invalid_training_dates_count",
      message: `Для формы журнала клиента нужно указать ровно ${expectedDates} даты занятий`,
    });
  }

  if (!snapshot.students.length) {
    issues.push({ code: "no_students", message: "В группе нет слушателей" });
  }
  snapshot.students.forEach((student, index) => {
    if (isEmpty(student.STUDENT_NAME)) {
      issues.push({
        code: "missing_student_name",
        token: "[[STUDENT_NAME]]",
        message: `Слушатель №${index + 1}: не заполнено ФИО`,
      });
    }
  });
  return issues;
}

export function compileClassJournalXml(params: {
  documentXml: string;
  manifest: ClassJournalManifest;
  snapshot: ClassJournalSnapshot;
}): string {
  const issues = validateClassJournalSnapshot(params.manifest, params.snapshot);
  if (issues.length) {
    throw new Error(`Журнал не может быть сформирован: ${issues.map((issue) => issue.message).join("; ")}`);
  }

  const parsed = parseBodyElements(params.documentXml);
  const repeater = params.manifest.repeaters.students;
  const target = parsed.elements.find((element) => element.tableIndex === repeater.table_index);
  if (!target) throw new Error(`Таблица слушателей №${repeater.table_index} не найдена`);

  const students = numberStudents(
    params.snapshot.students.map((student) => ({
      MARK_1: "",
      MARK_2: "",
      MARK_3: "",
      MARK_4: "",
      ...student,
    })),
  );
  target.xml = expandRepeaterTable(
    target.xml,
    repeater.prototype_row,
    students,
    repeater.header_rows,
  );

  const documentXml = replaceTokens(
    parsed.prefix + parsed.elements.map((element) => element.xml).join("") + parsed.suffix,
    params.snapshot.scalars,
  );
  const unresolved = findUnresolvedTokens(documentXml);
  if (unresolved.length) {
    throw new Error(`В журнале остались незаполненные токены: ${unresolved.join(", ")}`);
  }
  return documentXml;
}

export function formatJournalDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return "";
  return `${match[3]}.${match[2]}.${match[1]}`;
}

/** «Дроздов Дмитрий Викторович» → «Д.В. Дроздов» (как в файле клиента). */
export function initialsFirstNameRu(value: string): string {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const [surname, first = "", middle = ""] = parts;
  const initials = `${first ? `${first[0].toUpperCase()}.` : ""}${middle ? `${middle[0].toUpperCase()}.` : ""}`;
  return [initials, surname].filter(Boolean).join(" ");
}
