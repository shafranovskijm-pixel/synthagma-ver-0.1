/**
 * Phase 4B.1.c.2.b — targeted React Query invalidations after mutations.
 *
 * A single mutation should touch only the query keys that actually change,
 * so the dashboard never re-fetches base courses/categories/companies
 * (loaded once by useOrganizationDataLoader) or overwrites unrelated
 * cached data.
 *
 * All helpers are fire-and-forget: they schedule background refetches but
 * do not await them. They never construct new QueryClients or new query
 * keys — everything routes through the canonical `qk` map.
 */
import type { QueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";

/** Paginated student list only (no counts, no aggregates). */
export function invalidateOrganizationStudentRows(
  qc: QueryClient,
  organizationId: string | null | undefined,
) {
  if (!organizationId) return;
  qc.invalidateQueries({ queryKey: qk.org.studentsPageAll(organizationId) });
}

/** Active/archived + per-group counters. */
export function invalidateOrganizationStudentCounters(
  qc: QueryClient,
  organizationId: string | null | undefined,
) {
  if (!organizationId) return;
  qc.invalidateQueries({ queryKey: qk.org.studentsCounts(organizationId) });
  qc.invalidateQueries({ queryKey: qk.org.studentGroupCounts(organizationId) });
}

/** Aggregate RPCs powering the dashboard summary + per-course overview. */
export function invalidateOrganizationAggregates(
  qc: QueryClient,
  organizationId: string | null | undefined,
) {
  if (!organizationId) return;
  qc.invalidateQueries({ queryKey: qk.org.dashboardSummary(organizationId) });
  qc.invalidateQueries({ queryKey: qk.org.courseOverview(organizationId) });
}

/**
 * Course overview only — lesson counts / per-course student counts.
 * Used after leaving the course editor so returning to the list refreshes
 * lessonsCount without touching studentsPage, counts or the base loader.
 */
export function invalidateOrganizationCourseOverview(
  qc: QueryClient,
  organizationId: string | null | undefined,
) {
  if (!organizationId) return;
  qc.invalidateQueries({ queryKey: qk.org.courseOverview(organizationId) });
}


/**
 * Enrollment created/removed: profile set + group membership don't change,
 * so we skip counts/groupCounts. Rows change (enrolled course label,
 * status, progress), summary changes (enrolled/completed stats), course
 * overview changes (studentsCount per course).
 */
export function invalidateOrganizationEnrollmentData(
  qc: QueryClient,
  organizationId: string | null | undefined,
) {
  if (!organizationId) return;
  qc.invalidateQueries({ queryKey: qk.org.studentsPageAll(organizationId) });
  qc.invalidateQueries({ queryKey: qk.org.dashboardSummary(organizationId) });
  qc.invalidateQueries({ queryKey: qk.org.courseOverview(organizationId) });
}

/**
 * Student profile added / archived / restored / hard-deleted: everything
 * downstream must recompute — rows, org-wide counts, per-group counts,
 * summary and (since enrollments follow the profile) course overview.
 */
export function invalidateOrganizationStudentPopulation(
  qc: QueryClient,
  organizationId: string | null | undefined,
) {
  if (!organizationId) return;
  qc.invalidateQueries({ queryKey: qk.org.studentsPageAll(organizationId) });
  qc.invalidateQueries({ queryKey: qk.org.studentsCounts(organizationId) });
  qc.invalidateQueries({ queryKey: qk.org.studentGroupCounts(organizationId) });
  qc.invalidateQueries({ queryKey: qk.org.dashboardSummary(organizationId) });
  qc.invalidateQueries({ queryKey: qk.org.courseOverview(organizationId) });
}

/**
 * Identity document added / removed. Rows carry has_passport/has_snils/
 * has_education flags; summary carries documents stats. Course overview
 * is NOT affected.
 */
export function invalidateOrganizationDocumentData(
  qc: QueryClient,
  organizationId: string | null | undefined,
) {
  if (!organizationId) return;
  qc.invalidateQueries({ queryKey: qk.org.studentsPageAll(organizationId) });
  qc.invalidateQueries({ queryKey: qk.org.dashboardSummary(organizationId) });
}
