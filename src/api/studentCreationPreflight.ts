import { supabase } from "@/integrations/supabase/client";
import { captureOfflineContext, isOfflineActorCurrent } from "@/utils/courseCache";
export interface ExistingStudentForCreation {
  user_id: string; full_name: string; login: string | null;
  courses: Array<{ id: string; title: string }>;
}
const exactPattern = (value: string) => value.replace(/[\\%_]/g, character => "\\" + character);
const failed = () => new Error("Не удалось проверить существующего ученика. Данные не отправлены. Повторите проверку или откройте список учеников.");
/** Ordinary caller/RLS only. This preflight never creates, updates or assigns anything. */
export async function checkExistingStudentForCreation(organizationId: string, input: { login: string; email: string }, current: () => boolean): Promise<ExistingStudentForCreation | null> {
  const actor = captureOfflineContext();
  const assertCurrent = () => { if (!actor || !isOfflineActorCurrent(actor.actorId, actor.revision) || !current()) throw failed(); };
  assertCurrent();
  const login = input.login, email = input.email.trim().toLowerCase();
  if (!login && !email) return null;
  const candidates: Array<{ user_id: string; organization_id: string; full_name: string | null; login: string | null; email: string | null }> = [];
  for (const [column, value] of [["login", login], ["email", email]] as const) {
    if (!value) continue;
    assertCurrent();
    const { data, error } = await supabase.from("profiles").select("user_id, organization_id, full_name, login, email").eq("organization_id", organizationId).ilike(column, exactPattern(value)).limit(2);
    assertCurrent();
    if (error || !Array.isArray(data) || data.some(row => row.organization_id !== organizationId || typeof row.user_id !== "string" || !row.user_id)) throw failed();
    candidates.push(...data);
  }
  const ids = [...new Set(candidates.map(row => row.user_id))];
  if (ids.length > 1) throw new Error("Логин и email относятся к разным ученикам. Проверьте данные в списке учеников; изменения не отправлены.");
  if (!ids.length) return null;
  const found = candidates.find(row => row.user_id === ids[0])!;
  if (login && found.login?.toLowerCase() !== login.toLowerCase()) throw new Error("Логин и email не совпадают с карточкой ученика. Проверьте данные; изменения не отправлены.");
  if (email && found.email && found.email.toLowerCase() !== email) throw new Error("Логин и email не совпадают с карточкой ученика. Проверьте данные; изменения не отправлены.");
  const { data, error } = await supabase.from("enrollments").select("course_id, courses!inner(id, title, organization_id)").eq("user_id", found.user_id).eq("courses.organization_id", organizationId).neq("status", "cancelled").limit(1001);
  assertCurrent();
  if (error || !Array.isArray(data) || data.length > 1000) throw failed();
  const courses: ExistingStudentForCreation["courses"] = [];
  for (const row of data) {
    const course = row.courses as { id: string; title: string; organization_id: string } | null;
    if (!course || Array.isArray(course) || course.organization_id !== organizationId || course.id !== row.course_id || typeof course.title !== "string") throw failed();
    if (!courses.some(item => item.id === course.id)) courses.push({ id: course.id, title: course.title });
  }
  courses.sort((a, b) => a.id.localeCompare(b.id));
  return { user_id: found.user_id, full_name: found.full_name || "Ученик", login: found.login, courses };
}
