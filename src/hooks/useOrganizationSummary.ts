/**
 * Phase 4B.1.a / 4B.1.c.2.a — React Query hook exposing the two aggregate
 * RPCs (dashboard summary + course overview) as independent queries.
 *
 * Semantics (see phase 4B.1.c.2.a):
 *  • hasSummaryData / hasCourseOverviewData — strict "server responded at
 *    least once". An empty array from course overview still counts as data.
 *  • isSummaryLoading / isCourseOverviewLoading — waiting for the FIRST
 *    payload only. A background refetch with existing data must NOT
 *    replace the UI with a skeleton.
 *  • summaryErrorKind / courseOverviewErrorKind — only exposed when we
 *    have no usable data. If React Query still has cached data from a
 *    previous success, we suppress the error and keep showing it.
 *  • retry policy unchanged — at most 2 attempts for transient network
 *    errors only; 401/403/42501 are never retried.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  fetchOrganizationCourseOverview,
  fetchOrganizationDashboardSummary,
  type OrganizationCourseOverviewRow,
  type OrganizationDashboardSummary,
} from "@/api/organizationSummary";
import { qk } from "@/lib/queryKeys";
import { classifyDataError, isTransientNetworkError, type UserFacingErrorKind } from "@/utils/isTransientNetworkError";

const STALE_TIME = 30_000;
const GC_TIME = 5 * 60_000;

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  return isTransientNetworkError(error);
}

export interface UseOrganizationSummaryResult {
  summary: OrganizationDashboardSummary | undefined;
  courseOverviewRows: OrganizationCourseOverviewRow[];
  courseOverviewMap: Map<string, OrganizationCourseOverviewRow>;

  /** Strict "server responded at least once" flags. */
  hasSummaryData: boolean;
  hasCourseOverviewData: boolean;

  /** Waiting for the FIRST payload only. Background refetch does not count. */
  isSummaryLoading: boolean;
  isCourseOverviewLoading: boolean;

  /** Only set when we have no usable data to display. */
  summaryErrorKind: UserFacingErrorKind | null;
  courseOverviewErrorKind: UserFacingErrorKind | null;

  retrySummary: () => void;
  retryCourseOverview: () => void;
}

export function useOrganizationSummary(
  organizationId: string | null,
): UseOrganizationSummaryResult {
  const summaryQuery = useQuery({
    queryKey: organizationId ? qk.org.dashboardSummary(organizationId) : ["org", "none", "dashboard-summary"],
    queryFn: () => fetchOrganizationDashboardSummary(organizationId as string),
    enabled: !!organizationId,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    retry: shouldRetry,
  });

  const overviewQuery = useQuery({
    queryKey: organizationId ? qk.org.courseOverview(organizationId) : ["org", "none", "course-overview"],
    queryFn: () => fetchOrganizationCourseOverview(organizationId as string),
    enabled: !!organizationId,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    retry: shouldRetry,
  });

  // "Have data" is defined by React Query's `data !== undefined`. An empty
  // course overview array is a legitimate server response — we must NOT
  // downgrade it to "no data" via rows.length checks.
  const hasSummaryData = summaryQuery.data !== undefined;
  const hasCourseOverviewData = overviewQuery.data !== undefined;

  // First-load semantics: waiting for the initial payload.
  // React Query v5: isLoading === (isPending && isFetching), which is
  // exactly what "first load, no cached data yet" means.
  const isSummaryLoading = summaryQuery.isLoading && !hasSummaryData;
  const isCourseOverviewLoading = overviewQuery.isLoading && !hasCourseOverviewData;

  // Only surface an error if we have no usable data. If a background refetch
  // failed but we still hold cached data, keep showing that data.
  const summaryErrorKind: UserFacingErrorKind | null =
    summaryQuery.isError && !hasSummaryData ? classifyDataError(summaryQuery.error) : null;
  const courseOverviewErrorKind: UserFacingErrorKind | null =
    overviewQuery.isError && !hasCourseOverviewData ? classifyDataError(overviewQuery.error) : null;

  const courseOverviewRows = overviewQuery.data ?? [];
  const courseOverviewMap = useMemo(() => {
    const map = new Map<string, OrganizationCourseOverviewRow>();
    for (const row of courseOverviewRows) {
      map.set(row.courseId, row);
    }
    return map;
  }, [courseOverviewRows]);

  return {
    summary: summaryQuery.data,
    courseOverviewRows,
    courseOverviewMap,
    hasSummaryData,
    hasCourseOverviewData,
    isSummaryLoading,
    isCourseOverviewLoading,
    summaryErrorKind,
    courseOverviewErrorKind,
    retrySummary: () => {
      void summaryQuery.refetch();
    },
    retryCourseOverview: () => {
      void overviewQuery.refetch();
    },
  };
}
