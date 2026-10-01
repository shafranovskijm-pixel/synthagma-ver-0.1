import { supabase } from "@/integrations/supabase/client";

export interface CancelCourseAssignmentInput {
  enrollmentId: string;
  organizationId: string | null;
}

export interface CourseAssignmentCancellation {
  cancelled: true;
  enrollmentId: string;
  organizationId: string;
  userId: string;
  courseId: string;
}

export function courseAssignmentCancellationError(error: unknown): string {
  const details = error as { message?: string; code?: string } | null;
  const message = details?.message || String(error);
  if (message.includes("assignment_has_learning_history")) {
    return "Обучение уже начато или есть результаты. Отменить такое назначение нельзя: история обучения должна сохраниться.";
  }
  if (message.includes("assignment_has_dependent_records")) {
    return "У назначения есть документы или связанные записи. Отмена не выполнена, чтобы сохранить эти данные.";
  }
  if (message.includes("S022: protected enrollment/history cannot be deleted")) {
    return "Назначение защищено от удаления. Связанные данные и история сохраняются.";
  }
  if (message.includes("assignment_not_found")) return "Назначение не найдено. Обновите список курсов ученика.";
  if (message.includes("assignment_forbidden") || details?.code === "42501") {
    return "Недостаточно прав для отмены назначения в этой организации.";
  }
  if (details?.code === "PGRST202" || message.includes("Could not find the function")) {
    return "Серверная функция отмены ещё недоступна. Назначение не изменено.";
  }
  if (message.includes("assignment_verification_failed")) {
    return "Сервер не подтвердил отмену назначения. Обновите список перед повторной попыткой.";
  }
  if (details?.code === "55P03" || details?.code === "40P01") {
    return "Данные обучения сейчас обновляются. Повторите отмену после обновления списка.";
  }
  return "Не удалось подтвердить отмену назначения. Обновите список и повторите попытку.";
}

/** No direct DELETE fallback: the server checks permission, tenant and retained learning records. */
export async function cancelCourseAssignment(input: CancelCourseAssignmentInput): Promise<CourseAssignmentCancellation> {
  if (!input.enrollmentId || !input.organizationId) throw new Error("assignment_forbidden");
  const { data, error } = await supabase.rpc("cancel_course_assignment", {
    p_enrollment_id: input.enrollmentId,
    p_organization_id: input.organizationId,
  });
  if (error) throw error;
  const confirmation = data as unknown as CourseAssignmentCancellation | null;
  if (confirmation?.cancelled !== true || confirmation.enrollmentId !== input.enrollmentId ||
      confirmation.organizationId !== input.organizationId || typeof confirmation.userId !== "string" || !confirmation.userId ||
      typeof confirmation.courseId !== "string" || !confirmation.courseId) {
    throw new Error("assignment_verification_failed");
  }
  // A green RPC response alone must not turn a zero-row/no-op delete into success.
  const { data: remaining, error: readError } = await supabase.from("enrollments")
    .select("id").eq("id", input.enrollmentId).maybeSingle();
  if (readError || remaining) throw new Error("assignment_verification_failed");
  return confirmation;
}
