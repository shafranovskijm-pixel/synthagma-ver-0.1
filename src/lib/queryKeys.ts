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
