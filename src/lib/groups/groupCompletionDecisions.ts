import { supabase } from "@/integrations/supabase/client";
import {
  isCurrentCompletionDecision, isCompletionDate, isCompletionText, parseGroupCompletionContext, parseGroupCompletionDecision,
  type CompletionStudent, type GroupCompletionContext, type GroupCompletionDecision,
} from "../../../supabase/functions/_shared/docx-ooxml/groupCompletionDecisions";

export { isCurrentCompletionDecision };
export type { CompletionStudent, GroupCompletionContext, GroupCompletionDecision };
export interface CompletionScope { organizationId: string; groupId: string }
type Reply = { data: unknown; error: unknown };
export interface GroupCompletionDecisionsClient {
  rpc(name: "read_group_completion_decisions" | "save_group_completion_decision", args: Record<string, unknown>): PromiseLike<Reply>;
}
const defaultClient = supabase as unknown as GroupCompletionDecisionsClient;

export class GroupCompletionDecisionsError extends Error {
  constructor(message: string, readonly requiresReload = false) { super(message); this.name = "GroupCompletionDecisionsError"; }
}
function failure(): never { throw new GroupCompletionDecisionsError("Не удалось подтвердить итоговые решения группы. Обновите данные."); }
function checkError(error: unknown): void {
  if (!error) return;
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(code)) {
    throw new GroupCompletionDecisionsError("Бета: итоговые решения пока недоступны — серверное обновление не установлено.");
  }
  if (["40001", "23505"].includes(code)) throw new GroupCompletionDecisionsError("Данные изменились в другой вкладке или другим сотрудником. Обновите данные.");
  failure();
}

/** An ambiguous enrollment is never resolved by picking the first/best/latest one. */
export function completionEnrollment(student: CompletionStudent, context: GroupCompletionContext) {
  if (!context.group.course_id || student.enrollments.length !== 1) return null;
  const enrollment = student.enrollments[0];
  return enrollment.user_id === student.user_id && enrollment.course_id === context.group.course_id && ["active", "completed"].includes(enrollment.status) ? enrollment : null;
}

export async function fetchGroupCompletionDecisions(scope: CompletionScope, client: GroupCompletionDecisionsClient = defaultClient): Promise<GroupCompletionContext> {
  if (!scope.organizationId || !scope.groupId) failure();
  try {
    const result = await client.rpc("read_group_completion_decisions", { p_organization_id: scope.organizationId, p_group_id: scope.groupId });
    checkError(result.error);
    return parseGroupCompletionContext(result.data, scope);
  } catch (error) { if (error instanceof GroupCompletionDecisionsError) throw error; failure(); }
}

export interface SaveCompletionDecision extends CompletionScope {
  actorId: string; context: GroupCompletionContext; userId: string; gradeText: string;
  issuanceDecision: "with_document" | "without_document";
  protocolNumber: string | null; protocolDate: string | null; decisionNote: string | null;
}
const decisionKeys: (keyof GroupCompletionDecision)[] = [
  "id", "organization_id", "group_id", "user_id", "enrollment_id", "enrollment_facts_revision", "course_id",
  "group_start_date", "group_end_date", "grade_text", "issuance_decision", "protocol_number", "protocol_date",
  "decision_note", "revision", "confirmed_by", "confirmed_at",
];

/** Only returns success after a second, scoped server read confirms the exact saved decision. */
export async function saveGroupCompletionDecision(input: SaveCompletionDecision, client: GroupCompletionDecisionsClient = defaultClient): Promise<GroupCompletionContext> {
  let context: GroupCompletionContext;
  try { context = parseGroupCompletionContext(input.context, input); } catch { failure(); }
  const student = context.students.find(item => item.user_id === input.userId);
  const enrollment = student && completionEnrollment(student, context);
  const grade = input.gradeText.trim(), protocol = input.protocolNumber?.trim() || null, note = input.decisionNote?.trim() || null;
  if (!input.actorId || !context.can_manage || !student || !enrollment || !grade || !isCompletionText(grade, 100)
    || !["with_document", "without_document"].includes(input.issuanceDecision)
    || protocol !== null && !isCompletionText(protocol, 200) || note !== null && !isCompletionText(note, 1000)
    || input.protocolDate !== null && !isCompletionDate(input.protocolDate)) failure();
  const prior = student.decision;
  try {
    const result = await client.rpc("save_group_completion_decision", {
      p_organization_id: input.organizationId, p_group_id: input.groupId, p_user_id: input.userId,
      p_expected_enrollment_id: enrollment.id, p_expected_enrollment_revision: enrollment.document_facts_revision,
      p_expected_course_id: context.group.course_id, p_expected_start_date: context.group.start_date, p_expected_end_date: context.group.end_date,
      p_expected_decision_revision: prior?.revision ?? null, p_grade_text: grade, p_issuance_decision: input.issuanceDecision,
      p_protocol_number: protocol, p_protocol_date: input.protocolDate, p_decision_note: note,
    });
    checkError(result.error);
    const saved = parseGroupCompletionDecision(result.data, input);
    if (saved.user_id !== input.userId || saved.grade_text !== grade || saved.issuance_decision !== input.issuanceDecision
      || saved.protocol_number !== protocol || saved.protocol_date !== input.protocolDate || saved.decision_note !== note
      || saved.confirmed_by !== input.actorId || saved.revision !== (prior?.revision ?? 0) + 1
      || prior && saved.id !== prior.id || !isCurrentCompletionDecision(saved, context, student)) failure();
    const fresh = await fetchGroupCompletionDecisions(input, client);
    const freshStudent = fresh.students.find(item => item.user_id === input.userId);
    const confirmed = freshStudent?.decision;
    if (!fresh.can_manage || !freshStudent || !confirmed || !isCurrentCompletionDecision(confirmed, fresh, freshStudent)
      || decisionKeys.some(key => confirmed[key] !== saved[key])) failure();
    return fresh;
  } catch (error) {
    throw new GroupCompletionDecisionsError(
      error instanceof GroupCompletionDecisionsError
        ? `${error.message} Сохранение могло произойти; перечитайте решения перед повтором.`
        : "Сохранение не подтверждено. Перечитайте решения перед повтором.", true);
  }
}
