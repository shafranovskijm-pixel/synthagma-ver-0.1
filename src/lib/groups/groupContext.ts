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
  // tab=group-folder открывает саму папку группы по прямой ссылке
  // (tab=students показал бы только список групп).
  const base = `/organization?tab=group-folder&studentsView=groups&groupId=${encodeURIComponent(groupId)}`;
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

/** Вкладки организации, которые умеют работать в контексте группы. */
export const GROUP_CONTEXT_TABS = ["journals", "frdo"] as const;
export type GroupContextTab = (typeof GROUP_CONTEXT_TABS)[number];

export function isGroupContextTab(tab: string | null | undefined): tab is GroupContextTab {
  return !!tab && (GROUP_CONTEXT_TABS as readonly string[]).includes(tab);
}

/**
 * Чистый резолвер query-параметров при смене вкладки организации.
 *
 * Ключевое правило: вкладки `journals`/`frdo`, открытые из папки группы
 * (признак — присутствие `returnToGroupId`), СОХРАНЯЮТ groupId + courseId +
 * returnToGroupId. Любой уход на обычную вкладку полностью очищает контекст
 * группы, чтобы он не протекал в данные всей организации.
 */
export function resolveTabParams(
  prev: URLSearchParams | string,
  tab: string | null | undefined,
): URLSearchParams {
  const next = new URLSearchParams(typeof prev === "string" ? prev : prev.toString());
  if (!tab || tab === "courses") next.delete("tab");
  else next.set("tab", tab);

  const keepGroupContext = isGroupContextTab(tab) && !!next.get("returnToGroupId") && !!next.get("groupId");

  if (keepGroupContext) {
    // groupId / courseId / returnToGroupId остаются как есть
    next.delete("studentId");
    next.delete("folder");
    return next;
  }

  // Папка группы живёт внутри вкладки «Ученики» (tab=students&studentsView=groups),
  // поэтому groupId/folder сохраняются и для неё.
  const keepsGroupFolder = tab === "group-folder" || tab === "students";

  if (tab !== "course-details") next.delete("courseId");
  if (tab !== "student-details") next.delete("studentId");
  if (!keepsGroupFolder) {
    next.delete("groupId");
    next.delete("folder");
  }
  if (!keepsGroupFolder) next.delete("returnToGroupId");
  return next;
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
