import { supabase } from "@/integrations/supabase/client";

interface LogStudentDeletionInput {
  userId: string;
  fullName?: string | null;
  login?: string | null;
  email?: string | null;
  organizationId?: string | null;
  deletionType?: "soft" | "hard" | "archive";
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Записывает событие удаления/архивации ученика в журнал student_deletion_log.
 * Никогда не бросает исключений — операции удаления должны продолжать работать,
 * даже если запись в журнал не удалась.
 */
export async function logStudentDeletion(input: LogStudentDeletionInput): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const actor = userData?.user;
    if (!actor) return;

    let actorName: string | null = null;
    let actorEmail: string | null = actor.email ?? null;
    try {
      const { data: actorProfile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", actor.id)
        .maybeSingle();
      if (actorProfile) {
        actorName = actorProfile.full_name ?? null;
        actorEmail = actorProfile.email ?? actorEmail;
      }
    } catch {
      // ignore — profile lookup is optional
    }

    let orgId = input.organizationId ?? null;
    let studentName = input.fullName ?? null;
    let studentLogin = input.login ?? null;
    let studentEmail = input.email ?? null;

    if (!orgId || !studentName || !studentLogin) {
      try {
        const { data: studentProfile } = await supabase
          .from("profiles")
          .select("organization_id, full_name, login, email")
          .eq("user_id", input.userId)
          .maybeSingle();
        if (studentProfile) {
          orgId = orgId ?? studentProfile.organization_id ?? null;
          studentName = studentName ?? studentProfile.full_name ?? null;
          studentLogin = studentLogin ?? studentProfile.login ?? null;
          studentEmail = studentEmail ?? studentProfile.email ?? null;
        }
      } catch {
        // ignore — best effort lookup
      }
    }

    await supabase.from("student_deletion_log" as any).insert({
      student_id: input.userId,
      student_full_name: studentName,
      student_login: studentLogin,
      student_email: studentEmail,
      organization_id: orgId,
      deleted_by: actor.id,
      deleted_by_name: actorName,
      deleted_by_email: actorEmail,
      deletion_type: input.deletionType ?? "soft",
      reason: input.reason ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (err) {
    console.error("[logStudentDeletion] failed to log deletion:", err);
  }
}
