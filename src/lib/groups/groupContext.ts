/**
 * Контекст группы для сквозной навигации «папка группы → Журналы / ФИС ФРДО».
 *
 * Все функции чистые: URL-строится из тех же параметров, что читает TabContentRenderer,
 * а фильтрация работает по фактическим user_id участников группы (не по совпадению курса).
 */

export interface GroupContextParams {
  groupId?: string | null;
  courseId?: string | null;
  returnToGroupId?: string | null;
}

/** Ссылка на карточку ученика организации. */
export function studentDetailsPath(userId: string): string {
  return `/organization?tab=student-details&studentId=${encodeURIComponent(userId)}`;
}

/** Ссылка на карточку курса организации. */
export function courseDetailsPathForGroup(courseId: string): string {
  return `/organization?tab=course-details&courseId=${encodeURIComponent(courseId)}`;
}

/** Ссылка на папку группы (в т.ч. на конкретную вложенную папку). */
export function groupFolderPath(groupId: string, folder?: string | null): string {
  const base = `/organization?tab=students&studentsView=groups&groupId=${encodeURIComponent(groupId)}`;
  return folder ? `${base}&folder=${encodeURIComponent(folder)}` : base;
}

/** Ссылка на вкладку организации с прокинутым контекстом группы. */
export function groupContextPath(tab: "journals" | "frdo", ctx: GroupContextParams): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (ctx.groupId) params.set("groupId", ctx.groupId);
  if (ctx.courseId) params.set("courseId", ctx.courseId);
  const back = ctx.returnToGroupId ?? ctx.groupId;
  if (back) params.set("returnToGroupId", back);
  return `/organization?${params.toString()}`;
}

/** Фильтрация уже загруженных записей по участникам группы. */
export function filterByGroupMembers<T extends { user_id: string }>(
  rows: T[],
  memberUserIds: string[] | null | undefined,
): T[] {
  if (!memberUserIds) return rows;
  const set = new Set(memberUserIds);
  return rows.filter((r) => set.has(r.user_id));
}

/** Целевой путь клика по уведомлению о завершении курса. */
export function courseCompletedNotificationPath(
  n: { user_id?: string | null; related_id?: string | null },
  courseFallbackPath: (courseId: string) => string,
): string | null {
  if (n.user_id) return studentDetailsPath(n.user_id);
  if (n.related_id) return courseFallbackPath(n.related_id);
  return null;
}
