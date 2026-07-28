/**
 * Типизированные ключи для React Query.
 * Гарантируют единообразие между useQuery и invalidateQueries.
 *
 * Использование:
 *   useQuery({ queryKey: qk.org.webinars(orgId), ... });
 *   qc.invalidateQueries({ queryKey: qk.org.webinars(orgId) });
 */

export const qk = {
  org: {
    root: (orgId: string) => ["org", orgId] as const,
    webinars: (orgId: string) => ["org", orgId, "webinars"] as const,
    courses: (orgId: string) => ["org", orgId, "courses"] as const,
    students: (orgId: string) => ["org", orgId, "students"] as const,
    enrollmentRequests: (orgId: string) => ["org", orgId, "enrollment-requests"] as const,
    homeworkPending: (orgId: string) => ["org", orgId, "homework-pending"] as const,
    billingUnpaid: (orgId: string) => ["org", orgId, "billing-unpaid"] as const,
    signaturesExpiring: (orgId: string) => ["org", orgId, "signatures-expiring"] as const,
    attentionWidget: (orgId: string) => ["org", orgId, "attention-widget"] as const,
    studentGroups: (orgId: string) => ["org", orgId, "student-groups"] as const,
    studentsFrdo: (orgId: string, key: string) => ["org", orgId, "students-frdo", key] as const,
    studentsList: (orgId: string, courseIdsKey: string) => ["org", orgId, "students-list", courseIdsKey] as const,
    /** Префикс для инвалидации всех students-list внутри организации. */
    studentsListAll: (orgId: string) => ["org", orgId, "students-list"] as const,
    /** Phase 3: server-side paginated students page + counters + on-demand credentials. */
    studentsPage: (
      orgId: string,
      filters: {
        search: string;
        course: string;
        group: string;
        status: string;
        docs: string;
        archive: "active" | "archive";
      },
    ) => ["org", orgId, "students-page", filters] as const,
    studentsPageAll: (orgId: string) => ["org", orgId, "students-page"] as const,
    studentsCounts: (orgId: string) => ["org", orgId, "students-counts"] as const,
    studentGroupCounts: (orgId: string) => ["org", orgId, "student-group-counts"] as const,
    studentCredentials: (orgId: string, userId: string) =>
      ["org", orgId, "student-credentials", userId] as const,
  },
  admin: {
    organizations: () => ["admin", "organizations"] as const,
    users: () => ["admin", "users"] as const,
    notifications: () => ["admin", "notifications"] as const,
    analytics: () => ["admin", "analytics"] as const,
    aiToday: () => ["admin", "ai-today"] as const,
  },
  user: {
    profile: (userId: string) => ["user", userId, "profile"] as const,
    announcements: (userId: string) => ["user", userId, "announcements-unread"] as const,
  },
  course: {
    root: (courseId: string) => ["course", courseId] as const,
    progress: (courseId: string) => ["course", courseId, "generation-progress"] as const,
  },
  platform: {
    announcements: () => ["platform", "announcements"] as const,
  },
} as const;
