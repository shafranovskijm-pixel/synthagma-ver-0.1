import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { eachDayOfInterval, subDays } from "date-fns";
import { ADMIN_ANALYTICS_KEY, fetchAnalytics } from "./admin-analytics/fetcher";
import {
  buildLookupMaps, selectRegistrationsByDay, selectActivityByDay, selectCompletionsByDay,
  selectVisitsByDay, selectVisitStats, selectVisitLog, selectTopUsers, selectPaymentStats,
  selectFeatureUsageStats, selectStats, selectAiUsageByOrg, selectAiUserStats,
  selectEnrollmentStatusData, selectPaymentStatusData, selectTariffDistributionData,
  CHART_CONFIG, formatCurrency,
} from "./admin-analytics/selectors";

export type {
  AnalyticsData, LoginHistoryRecord, CourseAccessRecord, ProfileInfo, CourseInfo,
} from "./admin-analytics/types";
export { CHART_COLORS, FEATURE_LABELS, parseDevice, parseBrowser } from "./admin-analytics/constants";

export function useAdminAnalytics() {
  const [period, setPeriod] = useState<"7" | "30" | "90">("30");
  const [visitFilter, setVisitFilter] = useState<"all" | "platform" | "courses">("all");
  const [visitSearch, setVisitSearch] = useState("");

  const { data: data = null, isLoading: loading } = useQuery({
    queryKey: ADMIN_ANALYTICS_KEY,
    queryFn: fetchAnalytics,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const periodDays = parseInt(period);
  const dateRange = useMemo(
    () => eachDayOfInterval({ start: subDays(new Date(), periodDays), end: new Date() }),
    [periodDays]
  );

  const { profilesMap, coursesMap, orgsMap } = useMemo(
    () => data ? buildLookupMaps(data) : { profilesMap: new Map(), coursesMap: new Map(), orgsMap: new Map() },
    [data]
  );

  const registrationsByDay = useMemo(() => data ? selectRegistrationsByDay(data, dateRange) : [], [data, dateRange]);
  const activityByDay = useMemo(() => data ? selectActivityByDay(data, dateRange) : [], [data, dateRange]);
  const completionsByDay = useMemo(() => data ? selectCompletionsByDay(data, dateRange) : [], [data, dateRange]);
  const visitsByDay = useMemo(() => data ? selectVisitsByDay(data, dateRange, periodDays) : [], [data, dateRange, periodDays]);
  const visitStats = useMemo(() => data ? selectVisitStats(data, periodDays) : null, [data, periodDays]);
  const visitLog = useMemo(
    () => data ? selectVisitLog(data, periodDays, visitFilter, visitSearch, profilesMap, coursesMap, orgsMap) : [],
    [data, periodDays, visitFilter, visitSearch, profilesMap, coursesMap, orgsMap]
  );
  const topUsers = useMemo(() => data ? selectTopUsers(data, periodDays, profilesMap) : [], [data, periodDays, profilesMap]);
  const paymentStats = useMemo(() => data ? selectPaymentStats(data) : null, [data]);
  const featureUsageStats = useMemo(() => data ? selectFeatureUsageStats(data) : [], [data]);
  const stats = useMemo(() => data ? selectStats(data, periodDays) : null, [data, periodDays]);
  const aiUsageByOrg = useMemo(() => data ? selectAiUsageByOrg(data) : [], [data]);
  const aiUserStats = useMemo(() => data ? selectAiUserStats(data, profilesMap) : [], [data, profilesMap]);
  const enrollmentStatusData = useMemo(() => data ? selectEnrollmentStatusData(data) : [], [data]);
  const paymentStatusData = useMemo(() => data ? selectPaymentStatusData(data) : [], [data]);
  const tariffDistributionData = useMemo(() => data ? selectTariffDistributionData(data) : [], [data]);

  return {
    data, loading, period, setPeriod, visitFilter, setVisitFilter, visitSearch, setVisitSearch,
    registrationsByDay, activityByDay, completionsByDay, visitsByDay, visitStats, visitLog,
    topUsers, paymentStats, featureUsageStats, stats, aiUsageByOrg, aiUserStats,
    enrollmentStatusData, paymentStatusData, tariffDistributionData,
    chartConfig: CHART_CONFIG, formatCurrency,
    profilesMap, coursesMap, orgsMap,
  };
}
