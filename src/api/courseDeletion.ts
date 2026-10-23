import { journalUuid } from '@/lib/customJournals/contract';
import { supabase } from "@/integrations/supabase/client";
import { captureCustomJournalScope, customJournalScopeCurrent } from "@/lib/customJournals/client";

/** Delete only unused courses. Never erase assignments or children to force a course deletion. */
export async function deleteUnusedCourses(courseIds: string[]): Promise<void> {
  const ids = [...new Set(courseIds)];
  if (!ids.length || ids.length > 100 || ids.some(id=>!journalUuid.safeParse(id).success)) throw new Error("Выберите от 1 до 100 курсов.");
  const access = await supabase.auth.getSession();
  const token = access.data.session?.access_token;
  if (access.error || !token) throw new Error("Текущий доступ не подтверждён.");
  const { data: courses, error: courseError } = await supabase.from("courses").select("id, organization_id")
    .in("id", ids).setHeader("Authorization", "Bearer " + token);
  const organizationId = courses?.[0]?.organization_id;
  if (courseError || !organizationId || courses.length !== ids.length ||
      new Set(courses.map(row=>row.id)).size!==ids.length || courses.some(row => !ids.includes(row.id)||row.organization_id !== organizationId)) throw new Error("Не удалось подтвердить выбранные курсы одной организации.");
  const scope = captureCustomJournalScope(organizationId, () => true);
  if (scope.actorId !== access.data.session.user.id) throw new Error("Текущий доступ изменился.");
  const { data: enrollment, error: enrollmentError } = await supabase.from("enrollments").select("id")
    .in("course_id", ids).limit(1).setHeader("Authorization", "Bearer " + token);
  if (!customJournalScopeCurrent(scope)) throw new Error("Текущий доступ изменился.");
  if (enrollmentError) throw new Error("Не удалось проверить связанные обучения. Курс не удалён.");
  if (enrollment?.length) throw new Error("У курса есть назначения или история обучения. Сначала скройте его из витрины: удалять эту историю нельзя.");
  const { data: removed, error } = await supabase.from("courses").delete().in("id", ids)
    .eq("organization_id", organizationId).select("id").setHeader("Authorization", "Bearer " + token);
  if (!customJournalScopeCurrent(scope)) throw new Error("Доступ изменился. Обновите список для проверки результата.");
  if (error) throw new Error("Курс связан с сохранёнными документами или недоступен для удаления. Его данные сохранены.");
  if (removed?.length !== ids.length || new Set(removed.map(row=>row.id)).size!==ids.length || removed.some(row => !ids.includes(row.id)))
    throw new Error("Сервер не подтвердил удаление всех выбранных курсов. Обновите список.");
}
