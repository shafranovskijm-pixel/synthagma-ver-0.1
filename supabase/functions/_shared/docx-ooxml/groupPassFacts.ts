import type { GroupDocumentFactsProfile } from "./groupDocumentFacts.ts";
import type { loadGroupContractFacts } from "./groupContractFacts.ts";
import {
  buildGroupClassJournalMarks,
  type GroupClassJournalMarkRow,
  type GroupClassJournalMarksResult,
  type GroupClassJournalMarksSource,
} from "./groupClassJournalMarks.ts";

export interface GroupPassFactsSnapshot {
  organization: { id: string };
  group: { id: string; organization_id: string; course_id: string | null; training_dates: unknown; start_date: string | null; end_date: string | null };
  profiles: readonly (GroupDocumentFactsProfile & { phone: string | null; company_id: string | null })[];
  companies: readonly { id: string; organization_id: string; name: string | null }[];
  /** Same caller-RLS read used by the group's original journal, never browser cells. */
  journalMarksSource?: GroupClassJournalMarksSource;
  contractFacts?: Awaited<ReturnType<typeof loadGroupContractFacts>>;
}
export interface GroupPassFactsResult {
  docType: "pass";
  rows: Array<Record<string, string>>;
  rowSources: Array<{ userId: string; companyId: string | null }>;
  scalars: Record<string, string>;
  attendanceSource: GroupClassJournalMarksResult["attendanceSource"];
  markSources: GroupClassJournalMarkRow[];
  contractSources: Awaited<ReturnType<typeof loadGroupContractFacts>>["sources"];
  contractCoverage: { coveredStudentUserIds: string[]; missingStudentUserIds: string[] };
  issues: Array<{ docType: "pass"; code: string; field: string; message: string; severity: "error" | "warning"; userId?: string }>;
}
const text = (value: string | null | undefined) => typeof value === "string" ? value.trim() : "";
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Contacts and saved manual cells are facts; never infer marks or a contract number. */
export function buildGroupPassFactRows(input: { snapshot: GroupPassFactsSnapshot; fillMode: "data" | "blank" }): GroupPassFactsResult {
  const { organization, group, profiles, companies } = input.snapshot;
  const result: GroupPassFactsResult = {
    docType: "pass", rows: [], rowSources: [],
    scalars: { DAY1_DATE: "", DAY2_DATE: "", DAY3_DATE: "", DAY4_DATE: "", CONTRACT_BASIS_LINE: "", STUDENTS_COUNT: "" },
    attendanceSource: input.fillMode === "blank" ? "blank_mode" : "unavailable_blank", markSources: [], issues: [],
    contractSources: [], contractCoverage: { coveredStudentUserIds: [], missingStudentUserIds: [] },
  };
  const issue = (code: string, field: string, message: string, severity: "error" | "warning" = "warning", userId?: string) => {
    result.issues.push({ docType: "pass", code, field, message, severity, ...(userId ? { userId } : {}) });
  };
  if (!text(organization.id) || !text(group.id) || group.organization_id !== organization.id) {
    issue("group_scope_mismatch", "group", "Группа не подтверждена в организации.", "error");
    return result;
  }
  if (input.fillMode !== "blank") {
    const contract = input.snapshot.contractFacts;
    if (!contract) issue("contract_source_missing", "CONTRACT_BASIS_LINE", "Связанный договор не подтверждён; основание оставлено пустым.");
    else {
      result.scalars.CONTRACT_BASIS_LINE = contract.line;
      result.contractSources = contract.sources;
      result.contractCoverage = { coveredStudentUserIds: contract.coveredStudentUserIds, missingStudentUserIds: contract.missingStudentUserIds };
      for (const contractIssue of contract.issues) issue(contractIssue.code, contractIssue.field, contractIssue.message, contractIssue.severity);
    }
  }
  const dates = group.training_dates;
  let confirmedTrainingDates: string[] | null = null;
  const start = text(group.start_date);
  const end = text(group.end_date);
  const invalidPeriod = Boolean((start && !validDate(start)) || (end && !validDate(end)) || (start && end && start > end));
  if (!Array.isArray(dates)) {
    issue("training_dates_invalid_format", "training_dates", "Сохранённые даты занятий имеют некорректный формат; исправьте их в настройках группы.");
  } else if (dates.length === 0) issue("training_dates_missing", "training_dates", "Даты занятий не заполнены.");
  else if (dates.length > 4 || dates.some((d, i) => typeof d !== "string" || !validDate(d) || (i > 0 && d <= dates[i - 1]))) {
    issue("training_dates_invalid", "training_dates", "Даты некорректны, повторяются, нарушен порядок либо их больше четырёх; даты не подставлены.");
  } else if (invalidPeriod) {
    issue("invalid_group_period", "group.start_date/end_date", "Период группы некорректен; даты занятий в пропуске требуют уточнения и оставлены пустыми.");
  } else if (dates.some(d => (start && d < start) || (end && d > end))) {
    issue("training_dates_outside_period", "training_dates", "Даты занятий выходят за сохранённый период группы; они не перенесены и не подставлены в пропуск.");
  } else {
    if (!start || !end) issue("group_period_incomplete", "group.start_date/end_date", "Период группы заполнен не полностью. Сохранённые даты занятий показаны, но их соответствие всему периоду не подтверждено.");
    confirmedTrainingDates = dates as string[];
    dates.forEach((date, i) => {
      const [year, month, day] = date.split("-");
      // Explicit text newline, not raw XML: the compiler emits a safe w:br.
      // The narrow portrait columns retain every digit of the confirmed date.
      result.scalars[`DAY${i + 1}_DATE`] = `${day}.${month}.\n${year}`;
    });
  }
  const userCounts = new Map<string, number>();
  profiles.forEach(p => userCounts.set(p.user_id, (userCounts.get(p.user_id) || 0) + 1));
  for (const p of profiles) {
    if (!text(p.user_id) || userCounts.get(p.user_id) !== 1 || p.organization_id !== organization.id || p.student_group_id !== group.id || p.archived_at !== null) {
      issue("profile_scope_or_duplicate", "profiles", "Ученик не подтверждён в активном составе группы либо дублируется.", "error", p.user_id);
      continue;
    }
    let companyName = "";
    let companyId: string | null = null;
    if (p.company_id) {
      const matches = companies.filter(c => c.id === p.company_id);
      if (matches.length === 1 && matches[0].organization_id === organization.id && text(matches[0].name)) {
        companyName = text(matches[0].name); companyId = matches[0].id;
      } else issue("company_unconfirmed", "company_id", "Компания ученика не подтверждена в организации.", "warning", p.user_id);
    }
    if (!text(p.full_name)) issue("student_name_missing", "full_name", "ФИО ученика не заполнено.", "warning", p.user_id);
    result.rows.push({ N: String(result.rows.length + 1), STUDENT_NAME: text(p.full_name), COMPANY: companyName, EMAIL: text(p.email), PHONE: text(p.phone), DAY_1: "", DAY_2: "", DAY_3: "", DAY_4: "" });
    result.rowSources.push({ userId: p.user_id, companyId });
  }
  result.scalars.STUDENTS_COUNT = String(result.rows.length);
  if (input.fillMode !== "blank") {
    const source = input.snapshot.journalMarksSource;
    if (!source) {
      issue("attendance_source_missing", "DAY_1", "Сохранённые ручные отметки журнала группы не подтверждены; ячейки пропуска оставлены пустыми.");
    } else if (!confirmedTrainingDates) {
      // A mark must never appear under an empty/rejected date header. The pass
      // retains its existing four-date/period validation, without truncation.
      issue("attendance_dates_unconfirmed", "training_dates", "Даты колонок пропуска не подтверждены; сохранённые отметки не перенесены.");
    } else {
      const marks = buildGroupClassJournalMarks({
        snapshot: { organization, group: { ...group, training_dates: confirmedTrainingDates }, profiles, source },
        fillMode: input.fillMode,
      });
      result.attendanceSource = marks.attendanceSource;
      const marksByUser = new Map(marks.studentSources.map((student, index) => [student.user_id, marks.students[index]]));
      for (const [index, row] of result.rows.entries()) {
        const studentMarks = marksByUser.get(result.rowSources[index].userId);
        for (let slot = 1; slot <= 4; slot++) row[`DAY_${slot}`] = studentMarks?.[`MARK_${slot}`] ?? "";
      }
      result.markSources = marks.markSources;
      for (const markIssue of marks.issues) issue(markIssue.code, markIssue.slot ? `DAY_${markIssue.slot}` : "attendance",
        `Посещаемость пропуска: ${markIssue.message}`, "warning", markIssue.userId);
    }
  }
  return result;
}
