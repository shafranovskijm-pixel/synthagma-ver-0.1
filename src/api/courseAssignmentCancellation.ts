import type { PreparedIssuanceMutation } from "@/lib/educationIssuance/client";
import { normalizeIssuanceError } from "@/lib/educationIssuance/client";

export interface CancelCourseAssignmentInput {
  enrollmentId: string; organizationId: string | null;
  /** Created only after the operator reviews the server preview and explicit basis/date. */
  operation?: PreparedIssuanceMutation;
}
export interface CourseAssignmentCancellation {
  withdrawn: true; enrollmentId: string; organizationId: string; userId: string; courseId: string;
}
export function courseAssignmentCancellationError(error: unknown): string {
  if (error instanceof Error && error.message === "withdrawal_confirmation_required")
    return "Откройте «Прекратить обучение»: укажите основание и дату, проверьте решение на сервере и подтвердите его. История не удаляется.";
  return normalizeIssuanceError(error).message;
}
/** Compatibility boundary: never call the old physical cancellation RPC or infer a legal basis. */
export async function cancelCourseAssignment(input: CancelCourseAssignmentInput): Promise<CourseAssignmentCancellation> {
  const operation = input.operation;
  if (!input.organizationId || !operation || operation.action.action !== "withdraw_enrollments" ||
      operation.action.intent.enrollment_ids.length !== 1 || operation.action.intent.enrollment_ids[0] !== input.enrollmentId)
    throw new Error("withdrawal_confirmation_required");
  const result = await operation.run();
  const row = result.withdrawals[0];
  if (result.organization_id !== input.organizationId || result.withdrawals.length !== 1 ||
      row.ref.enrollment_id !== input.enrollmentId || row.state !== "withdrawn")
    throw new Error("Сервер не подтвердил сохранённое прекращение обучения.");
  return { withdrawn: true, enrollmentId: row.ref.enrollment_id, organizationId: row.ref.organization_id,
    userId: row.ref.user_id, courseId: row.ref.course_id };
}
