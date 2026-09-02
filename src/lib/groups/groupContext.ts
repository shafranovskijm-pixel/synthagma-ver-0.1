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

/**
 * Ссылка на карточку ученика организации.
 * Если передан контекст группы, returnToGroupId сохраняется, чтобы после правки
 * оператор вернулся ровно в ту папку группы, из которой ушёл.
 */
export function studentDetailsPath(userId: string, ctx?: GroupContextParams): string {
  const params = new URLSearchParams();
  params.set("tab", "student-details");
  params.set("studentId", userId);
  const back = ctx?.returnToGroupId ?? ctx?.groupId;
  // courseId сюда не прокидывается: карточка ученика показывает все его курсы,
  // а групповой фильтр не должен ограничивать/подменять её данные.
  if (back) params.set("returnToGroupId", back);
  return `/organization?${params.toString()}`;
}

/**
 * Ссылка на раздел «Компании»; при companyId сразу открывается карточка этой компании.
 * Внутренний ключ вкладки — "organizations" (именно его монтирует TabContentRenderer),
 * поэтому tab=companies давал бы пустую страницу.
 */
export function companiesPath(companyId?: string | null): string {
  const params = new URLSearchParams();
  params.set("tab", "organizations");
  if (companyId) params.set("companyId", companyId);
  return `/organization?${params.toString()}`;
}

/** Ссылка на карточку курса организации. */
export function courseDetailsPathForGroup(courseId: string): string {
  return `/organization?tab=course-details&courseId=${encodeURIComponent(courseId)}`;
}

/** Ссылка на папку группы (в т.ч. на конкретную вложенную папку). */
export function groupFolderPath(
  groupId: string,
  folder?: string | null,
  opts?: { settings?: boolean; addStudents?: boolean },
): string {
  // tab=group-folder открывает саму папку группы по прямой ссылке
  // (tab=students показал бы только список групп).
  const base = `/organization?tab=group-folder&studentsView=groups&groupId=${encodeURIComponent(groupId)}`;
  const withFolder = folder ? `${base}&folder=${encodeURIComponent(folder)}` : base;
  const withSettings = opts?.settings ? `${withFolder}&groupSettings=1` : withFolder;
  return opts?.addStudents ? `${withSettings}&addStudents=1` : withSettings;
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
  if (!tab || tab === "home") next.delete("tab");
  else next.set("tab", tab);

  // Entity/view parameters belong only to their own workspace. Keeping them
  // while switching sections makes a copied or newly opened URL restore data
  // from the previous window.
  // A canonical Companies deep link keeps its companyId. Top-level sidebar
  // navigation explicitly clears it in useTabNavigation.setActiveTab.
  if (tab !== "organizations") next.delete("companyId");
  if (tab !== "students" && tab !== "group-folder") next.delete("studentsView");
  if (tab !== "students") {
    next.delete("createGroup");
    next.delete("groupCourseId");
  }
  if (tab !== "group-folder") {
    next.delete("groupSettings");
    next.delete("addStudents");
  }
  if (tab !== "documents") {
    next.delete("documentView");
    next.delete("counterpartyView");
    next.delete("journal");
    next.delete("educationRecordId");
    next.delete("educationEnrollmentId");
  }

  const keepGroupContext = isGroupContextTab(tab) && !!next.get("returnToGroupId") && !!next.get("groupId");

  if (keepGroupContext) {
    // groupId / courseId / returnToGroupId остаются как есть
    next.delete("studentId");
    next.delete("folder");
    return next;
  }

  // Group folders now have their own canonical workspace tab. A clean switch
  // to Students must not inherit the group/folder from another window.
  const keepsGroupFolder = tab === "group-folder";

  // Карточка ученика, открытая из папки группы, сохраняет ТОЛЬКО обратный путь.
  // Фильтры groupId/courseId/folder при этом снимаются, чтобы контекст группы
  // не подмешивался в данные карточки.
  const keepsReturnOnly = tab === "student-details" && !!next.get("returnToGroupId");

  if (tab !== "course-details") next.delete("courseId");
  if (tab !== "student-details") next.delete("studentId");
  if (!keepsGroupFolder) {
    next.delete("groupId");
    next.delete("folder");
  }
  if (!keepsGroupFolder && !keepsReturnOnly) next.delete("returnToGroupId");
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
