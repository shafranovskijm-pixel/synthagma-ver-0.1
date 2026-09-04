/** Explicit operator decisions, independent of inferred test scores or auto-created certificates. */
export interface GroupCompletionDecision {
  id: string; organization_id: string; group_id: string; user_id: string;
  enrollment_id: string; enrollment_facts_revision: string; course_id: string;
  group_start_date: string | null; group_end_date: string | null;
  grade_text: string; issuance_decision: "with_document" | "without_document";
  protocol_number: string | null; protocol_date: string | null; decision_note: string | null;
  revision: number; confirmed_by: string; confirmed_at: string;
}
export interface CompletionEnrollment {
  id: string; user_id: string; course_id: string; status: string; progress: number;
  started_at: string | null; completed_at: string | null; document_facts_revision: string;
}
export interface CompletionStudent {
  user_id: string; full_name: string | null;
  enrollments: CompletionEnrollment[]; decision: GroupCompletionDecision | null;
}
export interface GroupCompletionContext {
  organization_id: string; can_manage: boolean;
  group: { id: string; organization_id: string; course_id: string | null; name: string; start_date: string | null; end_date: string | null };
  students: CompletionStudent[];
}
type Scope = { organizationId: string; groupId: string };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const revision = (value: unknown): value is string => typeof value === "string" && /^(0|[1-9]\d*)$/.test(value) && value.length <= 19 && BigInt(value) <= 9223372036854775807n;
const instant = (value: unknown): value is string => typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
export const isCompletionDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function isCompletionText(value: unknown, max: number): value is string {
  return typeof value === "string" && [...value].length <= max && [...value].every(character => {
    const code = character.codePointAt(0)!;
    return code === 9 || code === 10 || code === 13 || code >= 32 && code <= 0xd7ff || code >= 0xe000 && code <= 0xfffd || code >= 0x10000 && code <= 0x10ffff;
  });
}
const nullableDate = (value: unknown) => value === null || isCompletionDate(value);
const optionalText = (value: unknown, max: number) => value === null || isCompletionText(value, max) && value.trim().length > 0;
function fail(): never { throw new Error("Не удалось подтвердить итоговые решения этой группы. Обновите данные."); }
export function parseGroupCompletionDecision(value: unknown, scope: Scope): GroupCompletionDecision {
  if (!object(value) || !id(value.id) || value.organization_id !== scope.organizationId || value.group_id !== scope.groupId || !id(value.user_id)
    || !id(value.enrollment_id) || !id(value.course_id) || !revision(value.enrollment_facts_revision)
    || !nullableDate(value.group_start_date) || !nullableDate(value.group_end_date)
    || !isCompletionText(value.grade_text, 100) || !value.grade_text.trim()
    || !["with_document", "without_document"].includes(String(value.issuance_decision))
    || !optionalText(value.protocol_number, 200) || !nullableDate(value.protocol_date) || !optionalText(value.decision_note, 1000)
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 || !id(value.confirmed_by) || !instant(value.confirmed_at)) fail();
  return value as unknown as GroupCompletionDecision;
}
export function parseGroupCompletionContext(value: unknown, scope: Scope): GroupCompletionContext {
  if (!id(scope.organizationId) || !id(scope.groupId) || !object(value) || value.organization_id !== scope.organizationId || typeof value.can_manage !== "boolean"
    || !object(value.group) || value.group.id !== scope.groupId || value.group.organization_id !== scope.organizationId
    || !(value.group.course_id === null || id(value.group.course_id)) || typeof value.group.name !== "string"
    || !nullableDate(value.group.start_date) || !nullableDate(value.group.end_date) || !Array.isArray(value.students)) fail();
  const group = value.group;
  const studentIds = new Set<string>(), enrollmentIds = new Set<string>(), decisionIds = new Set<string>();
  const students = value.students.map(raw => {
    if (!object(raw) || !id(raw.user_id) || studentIds.has(raw.user_id) || !(raw.full_name === null || typeof raw.full_name === "string") || !Array.isArray(raw.enrollments)) fail();
    studentIds.add(raw.user_id);
    const enrollments = raw.enrollments.map(enrollment => {
      if (!object(enrollment) || !id(enrollment.id) || enrollmentIds.has(enrollment.id) || enrollment.user_id !== raw.user_id || enrollment.course_id !== group.course_id
        || !id(enrollment.course_id) || typeof enrollment.status !== "string" || !enrollment.status || typeof enrollment.progress !== "number" || !Number.isFinite(enrollment.progress)
        || !(enrollment.started_at === null || instant(enrollment.started_at)) || !(enrollment.completed_at === null || instant(enrollment.completed_at)) || !revision(enrollment.document_facts_revision)) fail();
      enrollmentIds.add(enrollment.id); return enrollment as unknown as CompletionEnrollment;
    });
    const decision = raw.decision === null ? null : parseGroupCompletionDecision(raw.decision, scope);
    if (decision && (decision.user_id !== raw.user_id || decisionIds.has(decision.id))) fail();
    if (decision) decisionIds.add(decision.id);
    return { user_id: raw.user_id, full_name: raw.full_name, enrollments, decision } as CompletionStudent;
  });
  return { organization_id: scope.organizationId, can_manage: value.can_manage, group: value.group as unknown as GroupCompletionContext["group"], students };
}
/** No reuse after non-telemetry writes/explicit resets, course/period changes or ambiguous reenrollment. */
export function isCurrentCompletionDecision(decision: GroupCompletionDecision, context: GroupCompletionContext, student: CompletionStudent): boolean {
  const enrollment = student.enrollments.length === 1 ? student.enrollments[0] : null;
  return Boolean(enrollment && ["active", "completed"].includes(enrollment.status)
    && context.students.some(item => item.user_id === student.user_id)
    && decision.organization_id === context.organization_id && decision.group_id === context.group.id && decision.user_id === student.user_id
    && decision.course_id === context.group.course_id && decision.enrollment_id === enrollment.id
    && decision.enrollment_facts_revision === enrollment.document_facts_revision
    && decision.group_start_date === context.group.start_date && decision.group_end_date === context.group.end_date);
}

/** Saved artifact provenance only; this does not label a draft as signed or currently valid. */
export function inspectExpulsionDecisionSnapshot(value: unknown): { confirmed: number; total: number } | null {
  if (!object(value) || value.decision_source !== "operator_confirmed_sql_snapshot_v1" || !Array.isArray(value.rows) || value.rows.length
    || !object(value.rows_by_source) || !Array.isArray(value.decision_sources) || value.decision_sources.length === 0
    || !Array.isArray(value.row_sources) || value.row_sources.length !== value.decision_sources.length
    || !object(value.decision_coverage)) return null;
  const sourceRows = value.row_sources;
  const coverage = value.decision_coverage;
  const ids = new Set<string>(), decisions = new Set<string>();
  for (const [index, source] of value.decision_sources.entries()) {
    const row = sourceRows[index];
    if (!object(source) || !id(source.userId) || !id(source.enrollmentId) || !id(source.decisionId) || !id(source.confirmedBy)
      || !instant(source.confirmedAt) || !revision(source.enrollmentFactsRevision) || !Number.isSafeInteger(source.decisionRevision) || Number(source.decisionRevision) < 1
      || !["with_document", "without_document"].includes(String(source.issuanceDecision)) || ids.has(source.userId) || decisions.has(source.decisionId)
      || !object(row) || row.userId !== source.userId || row.enrollmentId !== source.enrollmentId) return null;
    ids.add(source.userId); decisions.add(source.decisionId);
  }
  for (const [key, outcome] of [["expulsion_with_issuance", "with_document"], ["expulsion_without_issuance", "without_document"]]) {
    const rows = value.rows_by_source[key];
    if (!Array.isArray(rows) || rows.length !== value.decision_sources.filter(source => source.issuanceDecision === outcome).length
      || rows.some((row, index) => !object(row) || row.N !== String(index + 1) || !isCompletionText(row.STUDENT_NAME, 1000) || !row.STUDENT_NAME.trim()
        || ["STUDENT_PROGRAM", "STUDENT_HOURS", "STUDENT_PERIOD", "STUDENT_BASIS"].some(token => !isCompletionText(row[token], 10000)))) return null;
  }
  if (coverage.confirmed !== ids.size || !Number.isSafeInteger(coverage.total) || Number(coverage.total) < ids.size
    || !Array.isArray(coverage.omitted) || coverage.omitted.length !== Number(coverage.total) - ids.size) return null;
  for (const omitted of coverage.omitted) {
    if (!object(omitted) || !id(omitted.userId) || ids.has(omitted.userId) || typeof omitted.fullName !== "string") return null;
    ids.add(omitted.userId);
  }
  return { confirmed: Number(coverage.confirmed), total: Number(coverage.total) };
}
