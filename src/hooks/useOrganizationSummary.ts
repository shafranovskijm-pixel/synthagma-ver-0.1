/**
 * Phase 4B.1.a — React Query hook exposing the two aggregate RPCs
 * (dashboard summary + course overview) as independent queries.
 *
 * Not yet consumed by any UI — that wiring happens in 4B.1.b.
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

  isSummaryLoading: boolean;
  isCourseOverviewLoading: boolean;

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
    isSummaryLoading: summaryQuery.isLoading,
    isCourseOverviewLoading: overviewQuery.isLoading,
    summaryErrorKind: summaryQuery.error ? classifyDataError(summaryQuery.error) : null,
    courseOverviewErrorKind: overviewQuery.error ? classifyDataError(overviewQuery.error) : null,
    retrySummary: () => {
      void summaryQuery.refetch();
    },
    retryCourseOverview: () => {
      void overviewQuery.refetch();
    },
  };
}
