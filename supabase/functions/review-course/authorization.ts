import {
  AccessError,
  checked,
  readObject,
  requireActiveUser,
  requireUuid,
  type AccessDb,
} from "../_shared/privileged-access.ts";

/** Require the same active caller and course-write authority as lesson editing. */
export async function requireReviewCourseAccess(
  req: Request,
  serviceDb: AccessDb,
  callerDb: Pick<AccessDb, "rpc">,
): Promise<string> {
  try {
    // Deliberately do not enable the internal-service-key bypass.
    await requireActiveUser(req, serviceDb);
    const body = await readObject(req);
    const courseId = requireUuid(body.courseId, "идентификатор курса");
    // This client must carry the unchanged original caller token, never the service key.
    const allowed = checked(await callerDb.rpc("lesson_write_guard_allowed", {
      p_course_id: courseId,
    }));
    if (allowed !== true) throw new AccessError(403, "Нет прав на проверку этого курса");
    return courseId;
  } catch (error: unknown) {
    if (error instanceof AccessError) throw error;
    throw new AccessError(503, "Не удалось подтвердить права доступа. Повторите попытку.");
  }
}
