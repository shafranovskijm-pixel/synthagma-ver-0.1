import { fetchCourseReviewSnapshot } from "@/api/courseReviewer";
import { safeInternalNext } from "@/utils/authReturn";

// Existing CSZ inspection account and its explicitly granted 178-hour course.
// These identifiers select a landing page only; the RPC remains the authority
// for the current user's unexpired, unrevoked, course-scoped access.
const LICENSE_REVIEWER_USER_ID = "5061292a-7614-489e-b908-3a7160103809";
const LICENSE_REVIEW_COURSE_ID = "7630559a-6caf-42e7-97f9-1cd0e4598c39";

export async function resolveLoginDestination(
  userId: string,
  userRole: string,
  nextRaw: string | null,
): Promise<string> {
  const next = safeInternalNext(nextRaw);
  if (next) return next;

  if (userRole === "admin") return "/admin";
  if (userRole === "organization") return "/organization";
  if (userRole === "company") return "/company";
  if (userRole === "sales_manager") return "/sales";

  if (userRole === "student" && userId === LICENSE_REVIEWER_USER_ID) {
    try {
      const snapshot = await fetchCourseReviewSnapshot(LICENSE_REVIEW_COURSE_ID);
      if (snapshot.course.id === LICENSE_REVIEW_COURSE_ID) {
        return `/review/course/${LICENSE_REVIEW_COURSE_ID}`;
      }
    } catch {
      // An absent/revoked/expired grant or a failed read grants no new access.
    }
  }

  return "/student";
}
