import { FactReadError, readExactFactPages, type FactPage } from "./groupDocumentFactsSource.ts";

/** Raw operator-entered cell text, not an attendance status or inferred progress. */
export interface GroupClassJournalMarkRow {
  id: string;
  organization_id: string;
  group_id: string;
  user_id: string;
  slot: number;
  course_id: string | null;
  source_date: string;
  mark: string;
  revision: number;
  updated_at: string;
  updated_by: string;
}

export const GROUP_CLASS_JOURNAL_MARKS_SELECT =
  "id, organization_id, group_id, user_id, slot, course_id, source_date, mark, revision, updated_at, updated_by";

export interface GroupClassJournalMarksIssue {
  source: "group_class_journal_marks";
  code: string;
  message: string;
  userId?: string;
  slot?: number;
}

export interface GroupClassJournalMarksSource {
  rows: GroupClassJournalMarkRow[];
  sourceAvailable: boolean;
  sourceIssues: GroupClassJournalMarksIssue[];
}

interface MarksScope { organizationId: string; groupId: string }
export interface GroupClassJournalMarksReader {
  marks: (request: MarksScope & { from: number; to: number }) => PromiseLike<FactPage<GroupClassJournalMarkRow>>;
}

const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const nullableId = (value: unknown): value is string | null => value === null || nonempty(value);
function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validMark(value: unknown): value is string {
  if (typeof value !== "string" || [...value].length > 12) return false;
  return [...value].every((character) => {
    const point = character.codePointAt(0)!;
    return point === 9 || point === 10 || point === 13
      || (point >= 0x20 && point <= 0xd7ff)
      || (point >= 0xe000 && point <= 0xfffd)
      || (point >= 0x10000 && point <= 0x10ffff);
  });
}
function validRow(row: unknown): row is GroupClassJournalMarkRow {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const value = row as Record<string, unknown>;
  return nonempty(value.id) && nonempty(value.organization_id) && nonempty(value.group_id)
    && nonempty(value.user_id) && nullableId(value.course_id)
    && Number.isInteger(value.slot) && Number(value.slot) >= 1 && Number(value.slot) <= 4
    && validDate(value.source_date) && validMark(value.mark)
    && Number.isSafeInteger(value.revision) && Number(value.revision) >= 1
    && nonempty(value.updated_by) && nonempty(value.updated_at)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value.updated_at)
    && validDate(value.updated_at.slice(0, 10))
    && Number.isFinite(Date.parse(value.updated_at));
}

function issue(code: string, message: string): GroupClassJournalMarksIssue {
  return { source: "group_class_journal_marks", code, message };
}
function unavailable(code: string): GroupClassJournalMarksSource {
  return {
    rows: [], sourceAvailable: false,
    sourceIssues: [issue(code,
      "Не удалось полностью подтвердить сохранённые отметки журнала группы. Все отметки оставлены пустыми; перечитайте журнал и повторите формирование.")],
  };
}
function validateRows(rows: readonly GroupClassJournalMarkRow[], scope: MarksScope): string | null {
  const ids = new Set<string>();
  const cells = new Set<string>();
  for (const row of rows) {
    if (!validRow(row)) return "malformed_mark";
    if (row.organization_id !== scope.organizationId || row.group_id !== scope.groupId) return "scope_mismatch";
    const cell = `${row.user_id}:${row.slot}`;
    if (ids.has(row.id) || cells.has(cell)) return "duplicate_mark";
    ids.add(row.id); cells.add(cell);
  }
  return null;
}

/** No service-role fallback and no partial success when a page cannot be verified. */
export async function loadGroupClassJournalMarks(
  scope: MarksScope & { fillMode: "blank" | "data" },
  reader: GroupClassJournalMarksReader,
): Promise<GroupClassJournalMarksSource> {
  if (scope.fillMode === "blank") return { rows: [], sourceAvailable: true, sourceIssues: [] };
  if (!nonempty(scope.organizationId) || !nonempty(scope.groupId)) return unavailable("scope_mismatch");
  try {
    const rows = await readExactFactPages((from, to) => reader.marks({
      organizationId: scope.organizationId, groupId: scope.groupId, from, to,
    }), (row) => validRow(row) && row.organization_id === scope.organizationId && row.group_id === scope.groupId);
    const invalid = validateRows(rows, scope);
    return invalid ? unavailable(invalid) : { rows, sourceAvailable: true, sourceIssues: [] };
  } catch (error) {
    return unavailable(error instanceof FactReadError ? error.code : "read_failed");
  }
}

export interface GroupClassJournalMarksSnapshot {
  organization: { id: string };
  group: { id: string; organization_id: string; course_id: string | null; training_dates: readonly string[] | null };
  profiles: readonly {
    user_id: string; full_name: string | null; organization_id: string | null;
    student_group_id: string | null; archived_at: string | null;
  }[];
  source: GroupClassJournalMarksSource;
}
export interface GroupClassJournalMarksResult {
  students: Array<Record<string, string>>;
  studentSources: Array<{ user_id: string; full_name: string }>;
  markSources: GroupClassJournalMarkRow[];
  attendanceSource: "saved_manual_marks" | "blank_mode" | "no_matching_marks_blank" | "unavailable_blank";
  issues: GroupClassJournalMarksIssue[];
}

/** Match by tenant/group/user/slot/course/date. Never map status words to glyphs. */
export function buildGroupClassJournalMarks(params: {
  snapshot: GroupClassJournalMarksSnapshot;
  fillMode: "blank" | "data";
}): GroupClassJournalMarksResult {
  const { organization, group, source } = params.snapshot;
  const scope = { organizationId: organization.id, groupId: group.id };
  // Retain the server roster order and blank rows for every current participant.
  const profiles = params.snapshot.profiles.filter((profile) => profile.organization_id === organization.id
    && profile.student_group_id === group.id && profile.archived_at === null);
  const result: GroupClassJournalMarksResult = {
    students: profiles.map((profile) => ({
      STUDENT_NAME: profile.full_name ?? "", MARK_1: "", MARK_2: "", MARK_3: "", MARK_4: "",
    })),
    studentSources: profiles.map((profile) => ({ user_id: profile.user_id, full_name: profile.full_name ?? "" })),
    markSources: [], attendanceSource: "blank_mode", issues: [],
  };
  if (params.fillMode === "blank") return result;
  const invalidRoster = profiles.length !== params.snapshot.profiles.length
    || profiles.some((profile) => !nonempty(profile.user_id))
    || new Set(profiles.map((profile) => profile.user_id)).size !== profiles.length;
  const invalid = !nonempty(organization.id) || !nonempty(group.id)
    || group.organization_id !== organization.id || !nullableId(group.course_id)
    ? "scope_mismatch" : invalidRoster ? "roster_mismatch" : validateRows(source.rows, scope);
  if (!source.sourceAvailable || source.sourceIssues.length || invalid) {
    result.attendanceSource = "unavailable_blank";
    result.issues = source.sourceIssues.length ? [...source.sourceIssues] : unavailable(invalid || "read_failed").sourceIssues;
    return result;
  }
  const positions = new Map(profiles.map((profile, index) => [profile.user_id, index]));
  const dates = group.training_dates ?? [];
  const matchedCells = new Set<string>();
  let staleCourse = 0, staleDate = 0, inactiveStudent = 0;
  for (const row of source.rows) {
    const position = positions.get(row.user_id);
    if (position === undefined) { inactiveStudent++; continue; }
    if (row.course_id !== group.course_id) { staleCourse++; continue; }
    const date = dates[row.slot - 1];
    if (!validDate(date) || row.source_date !== date) { staleDate++; continue; }
    result.students[position][`MARK_${row.slot}`] = row.mark;
    matchedCells.add(`${row.user_id}:${row.slot}`);
    // Select only the stored contract fields, preserving raw mark and provenance.
    result.markSources.push({
      id: row.id, organization_id: row.organization_id, group_id: row.group_id,
      user_id: row.user_id, slot: row.slot, course_id: row.course_id,
      source_date: row.source_date, mark: row.mark, revision: row.revision,
      updated_at: row.updated_at, updated_by: row.updated_by,
    });
  }
  if (staleCourse) result.issues.push(issue("stale_course", `Отметки другого курса не перенесены в текущий журнал: ${staleCourse}.`));
  if (staleDate) result.issues.push(issue("stale_date", `Отметки для прежних или неподтверждённых дат колонок оставлены пустыми: ${staleDate}.`));
  if (inactiveStudent) result.issues.push(issue("inactive_student", `Отметки участников вне текущего состава группы не использованы: ${inactiveStudent}.`));
  const missing = profiles.length * 4 - matchedCells.size;
  if (missing) result.issues.push(issue("missing_marks", `Нет подтверждённых отметок для ${missing} ячеек журнала. Они оставлены пустыми; посещаемость не выводится из прогресса курса.`));
  result.attendanceSource = result.markSources.length ? "saved_manual_marks" : "no_matching_marks_blank";
  return result;
}

export function describeGroupClassJournalMarks(source: GroupClassJournalMarksResult["attendanceSource"]): string {
  switch (source) {
    case "saved_manual_marks": return "Отметки перенесены дословно из сохранённого журнала этой группы при совпадении участника, курса и даты колонки. Ячейки без подтверждённой записи оставлены пустыми.";
    case "blank_mode": return "Выбран пустой бланк: сохранённые отметки не запрашивались и не переносились.";
    case "no_matching_marks_blank": return "Для текущего состава, курса и дат группы не найдены подтверждённые отметки. Ячейки оставлены пустыми для ручного внесения.";
    case "unavailable_blank": return "Сохранённые отметки не удалось полностью проверить. Они не использованы; все ячейки отметок оставлены пустыми.";
  }
}
