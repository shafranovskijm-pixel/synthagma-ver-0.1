import { AccessError, checked, requireActiveUser, requirePlatformAdmin, requireUuid, type AccessDb } from '../_shared/privileged-access.ts';
/** The original caller token, never the service client, authorizes course writes. */
export async function requireKinescopeAccess(req: Request, body: Record<string, unknown>, admin: AccessDb, caller: AccessDb): Promise<void> {
  try {
    const actor = await requireActiveUser(req, admin);
    const profile = checked<any>(await admin.from('profiles').select('blocked_at').eq('user_id', actor.userId).maybeSingle());
    if (!actor.userId || !profile || profile.blocked_at) throw new AccessError(403, 'Доступ к аккаунту ограничен.');
    if (body.action === 'upload_init') {
      const courseId = requireUuid(body.course_id, 'курс');
      const lessonId = requireUuid(body.lesson_id, 'урок');
      const allowed = checked(await caller.rpc('lesson_write_guard_allowed', { p_course_id: courseId }));
      if (allowed !== true) throw new AccessError(403, 'Недостаточно прав для изменения курса.');
      const lesson = checked<any>(await admin.from('lessons').select('id,course_id').eq('id', lessonId).maybeSingle());
      if (!lesson || lesson.course_id !== courseId) throw new AccessError(403, 'Урок не относится к выбранному курсу.');
      return;
    }
    // No authoritative provider-video ↔ tenant binding exists yet. Global existing-asset operations stay platform-admin only.
    await requirePlatformAdmin(admin, actor);
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError(503, 'Не удалось подтвердить права доступа. Повторите попытку.');
  }
}
