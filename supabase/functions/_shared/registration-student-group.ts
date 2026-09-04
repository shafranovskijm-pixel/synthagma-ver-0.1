type ReadResult = { data: unknown; error: unknown };
type GroupPreflightReader = (table: "student_groups" | "courses", id: string) => PromiseLike<ReadResult>;
export type RegistrationGroupRejection = {
  status: 400 | 403 | 404 | 500;
  code: string;
  error: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const readFailure = (course = false): RegistrationGroupRejection => ({
  status: 500,
  code: course ? "GROUP_COURSE_PREFLIGHT_FAILED" : "GROUP_PREFLIGHT_FAILED",
  error: course ? "Не удалось проверить курс выбранной группы." : "Не удалось проверить выбранную группу.",
});

/** Read-only guard before auth/profile writes, for both caller and token scopes.
 * This is not a transactional DB constraint: concurrent group/course changes
 * must ultimately be guarded inside the profile-claim transaction as well.
 */
export async function preflightRegistrationStudentGroup(
  read: GroupPreflightReader,
  organizationId: string,
  groupId: unknown,
): Promise<RegistrationGroupRejection | null> {
  if (groupId === null || groupId === undefined || groupId === "") return null;
  if (typeof groupId !== "string" || !UUID.test(groupId)) {
    return { status: 400, code: "INVALID_STUDENT_GROUP_ID", error: "Некорректный идентификатор группы." };
  }

  let group: unknown;
  try {
    const result = await read("student_groups", groupId);
    if (result.error) return readFailure();
    group = result.data;
  } catch {
    return readFailure();
  }
  if (group === null) {
    return { status: 404, code: "STUDENT_GROUP_NOT_FOUND", error: "Выбранная группа не найдена. Обновите список групп." };
  }
  if (!record(group) || typeof group.id !== "string" || group.id.toLowerCase() !== groupId.toLowerCase()
    || typeof group.organization_id !== "string") return readFailure();
  if (group.organization_id !== organizationId) {
    return { status: 403, code: "STUDENT_GROUP_ORGANIZATION_MISMATCH", error: "Группа не принадлежит выбранной организации." };
  }
  if (group.course_id === null) return null;
  if (typeof group.course_id !== "string" || !UUID.test(group.course_id)) return readFailure(true);

  // The profile trigger can enroll the student into this course even when the
  // form's independent course_id is empty; validate both sources, not just it.
  let course: unknown;
  try {
    const result = await read("courses", group.course_id);
    if (result.error) return readFailure(true);
    course = result.data;
  } catch {
    return readFailure(true);
  }
  if (course === null) {
    return { status: 404, code: "GROUP_COURSE_NOT_FOUND", error: "Курс выбранной группы не найден. Проверьте настройки группы." };
  }
  if (!record(course) || typeof course.id !== "string" || course.id.toLowerCase() !== group.course_id.toLowerCase()
    || typeof course.organization_id !== "string") return readFailure(true);
  if (course.organization_id !== organizationId) {
    return { status: 403, code: "GROUP_COURSE_ORGANIZATION_MISMATCH", error: "Курс выбранной группы не принадлежит организации." };
  }
  return null;
}
