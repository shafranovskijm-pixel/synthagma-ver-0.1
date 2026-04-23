import { subDays, startOfDay, format } from "date-fns";
import { ru } from "date-fns/locale";
import { CHART_COLORS, FEATURE_LABELS, parseBrowser, parseDevice } from "./constants";
import type { AnalyticsData, ProfileInfo } from "./types";

export function buildLookupMaps(data: AnalyticsData) {
  const profilesMap = new Map<string, ProfileInfo>();
  data.profilesInfo.forEach(p => profilesMap.set(p.user_id, p));
  const coursesMap = new Map<string, string>();
  data.coursesInfo.forEach(c => coursesMap.set(c.id, c.title));
  const orgsMap = new Map<string, string>();
  data.organizations.forEach(o => orgsMap.set(o.id, o.name));
  return { profilesMap, coursesMap, orgsMap };
}

const fmt = (date: Date) => format(date, "d MMM", { locale: ru });
const fmtFull = (date: Date) => format(date, "d MMMM yyyy", { locale: ru });

export function selectRegistrationsByDay(data: AnalyticsData, dateRange: Date[]) {
  return dateRange.map((date) => {
    const dayStart = startOfDay(date);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const usersCount = data.profiles.filter((p) => {
      const d = new Date(p.created_at); return d >= dayStart && d < dayEnd;
    }).length;
    const orgsCount = data.organizations.filter((o) => {
      const d = new Date(o.created_at); return d >= dayStart && d < dayEnd;
    }).length;
    return { date: fmt(date), fullDate: fmtFull(date), users: usersCount, organizations: orgsCount };
  });
}

export function selectActivityByDay(data: AnalyticsData, dateRange: Date[]) {
  return dateRange.map((date) => {
    const dayStart = startOfDay(date);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const enrollmentsCount = data.enrollments.filter((e) => {
      const d = new Date(e.started_at); return d >= dayStart && d < dayEnd;
    }).length;
    const lessonsCompleted = data.lessonProgress.filter((lp) => {
      if (!lp.completed_at) return false;
      const d = new Date(lp.completed_at); return d >= dayStart && d < dayEnd;
    }).length;
    return { date: fmt(date), fullDate: fmtFull(date), enrollments: enrollmentsCount, lessons: lessonsCompleted };
  });
}

export function selectCompletionsByDay(data: AnalyticsData, dateRange: Date[]) {
  return dateRange.map((date) => {
    const dayStart = startOfDay(date);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const completedCount = data.enrollments.filter((e) => {
      if (!e.completed_at) return false;
      const d = new Date(e.completed_at); return d >= dayStart && d < dayEnd;
    }).length;
    return { date: fmt(date), fullDate: fmtFull(date), completions: completedCount };
  });
}

export function selectVisitsByDay(data: AnalyticsData, dateRange: Date[], periodDays: number) {
  const periodStart = subDays(new Date(), periodDays);
  return dateRange.map((date) => {
    const dayStart = startOfDay(date);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const platformVisits = data.loginHistory.filter((r) => {
      const d = new Date(r.logged_in_at); return d >= dayStart && d < dayEnd && d >= periodStart;
    }).length;
    const courseVisits = data.courseAccessLog.filter((r) => {
      if (!r.accessed_at) return false;
      const d = new Date(r.accessed_at); return d >= dayStart && d < dayEnd && d >= periodStart;
    }).length;
    return { date: fmt(date), fullDate: fmtFull(date), platform: platformVisits, courses: courseVisits };
  });
}

export function selectVisitStats(data: AnalyticsData, periodDays: number) {
  const periodStart = subDays(new Date(), periodDays);
  const platformTotal = data.loginHistory.filter(r => new Date(r.logged_in_at) >= periodStart).length;
  const courseTotal = data.courseAccessLog.filter(r => r.accessed_at && new Date(r.accessed_at) >= periodStart).length;
  const uniqueUsers = new Set([
    ...data.loginHistory.filter(r => new Date(r.logged_in_at) >= periodStart).map(r => r.user_id),
    ...data.courseAccessLog.filter(r => r.accessed_at && new Date(r.accessed_at) >= periodStart).map(r => r.user_id),
  ]).size;
  const avgPerDay = periodDays > 0 ? Math.round((platformTotal + courseTotal) / periodDays) : 0;
  return { platformTotal, courseTotal, uniqueUsers, avgPerDay };
}

export type VisitEntry = {
  userId: string; name: string; email: string; time: Date; ip: string;
  device: string; browser: string; type: "platform" | "course";
  courseTitle: string | null; orgName: string | null;
};

export function selectVisitLog(
  data: AnalyticsData, periodDays: number,
  visitFilter: "all" | "platform" | "courses", visitSearch: string,
  profilesMap: Map<string, ProfileInfo>, coursesMap: Map<string, string>, orgsMap: Map<string, string>,
): VisitEntry[] {
  const periodStart = subDays(new Date(), periodDays);
  const entries: VisitEntry[] = [];
  if (visitFilter !== "courses") {
    data.loginHistory.forEach(r => {
      const d = new Date(r.logged_in_at);
      if (d < periodStart) return;
      const p = profilesMap.get(r.user_id);
      entries.push({
        userId: r.user_id, name: p?.full_name || "—", email: p?.email || p?.login || "—",
        time: d, ip: r.ip_address || "—", device: parseDevice(r.user_agent),
        browser: parseBrowser(r.user_agent), type: "platform", courseTitle: null,
        orgName: p?.organization_id ? orgsMap.get(p.organization_id) || null : null,
      });
    });
  }
  if (visitFilter !== "platform") {
    data.courseAccessLog.forEach(r => {
      if (!r.accessed_at) return;
      const d = new Date(r.accessed_at);
      if (d < periodStart) return;
      const p = profilesMap.get(r.user_id);
      entries.push({
        userId: r.user_id, name: p?.full_name || "—", email: p?.email || p?.login || "—",
        time: d, ip: r.ip_address || "—", device: parseDevice(r.user_agent),
        browser: parseBrowser(r.user_agent), type: "course",
        courseTitle: coursesMap.get(r.course_id) || r.course_id,
        orgName: p?.organization_id ? orgsMap.get(p.organization_id) || null : null,
      });
    });
  }
  const search = visitSearch.toLowerCase();
  const filtered = search
    ? entries.filter(e => e.name.toLowerCase().includes(search) || e.email.toLowerCase().includes(search))
    : entries;
  filtered.sort((a, b) => b.time.getTime() - a.time.getTime());
  return filtered.slice(0, 200);
}

export function selectTopUsers(data: AnalyticsData, periodDays: number, profilesMap: Map<string, ProfileInfo>) {
  const periodStart = subDays(new Date(), periodDays);
  const userStats = new Map<string, { platform: number; courses: number }>();
  data.loginHistory.forEach(r => {
    if (new Date(r.logged_in_at) < periodStart) return;
    const s = userStats.get(r.user_id) || { platform: 0, courses: 0 };
    s.platform++; userStats.set(r.user_id, s);
  });
  data.courseAccessLog.forEach(r => {
    if (!r.accessed_at || new Date(r.accessed_at) < periodStart) return;
    const s = userStats.get(r.user_id) || { platform: 0, courses: 0 };
    s.courses++; userStats.set(r.user_id, s);
  });
  return Array.from(userStats.entries())
    .map(([userId, s]) => {
      const p = profilesMap.get(userId);
      return { userId, name: p?.full_name || "—", email: p?.email || p?.login || "—", platform: s.platform, courses: s.courses, total: s.platform + s.courses };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);
}

export function selectPaymentStats(data: AnalyticsData) {
  const paidOrgs = data.organizations.filter(o => o.is_paid);
  const unpaidOrgs = data.organizations.filter(o => !o.is_paid);
  const yearlyOrgs = data.organizations.filter(o => o.tariff_type === 'yearly');
  const monthlyOrgs = data.organizations.filter(o => o.tariff_type === 'monthly');
  const monthlyRevenue = monthlyOrgs.reduce((sum, o) => sum + (o.monthly_price || 0), 0);
  const yearlyRevenue = yearlyOrgs.reduce((sum, o) => sum + ((o.monthly_price || 0) * 12 * 0.8), 0);
  const projectedMonthlyRevenue = monthlyRevenue + (yearlyRevenue / 12);
  const projectedYearlyRevenue = projectedMonthlyRevenue * 12;
  return {
    paidCount: paidOrgs.length, unpaidCount: unpaidOrgs.length,
    yearlyCount: yearlyOrgs.length, monthlyCount: monthlyOrgs.length,
    projectedMonthlyRevenue, projectedYearlyRevenue,
  };
}

export function selectFeatureUsageStats(data: AnalyticsData) {
  if (!data.featureUsage.length) return [];
  const usageByFeature: Record<string, number> = {};
  data.featureUsage.forEach(fu => {
    if (!usageByFeature[fu.feature_id]) usageByFeature[fu.feature_id] = 0;
    usageByFeature[fu.feature_id] += fu.usage_count;
  });
  return Object.entries(usageByFeature)
    .map(([feature_id, count]) => ({ feature_id, name: FEATURE_LABELS[feature_id] || feature_id, count }))
    .sort((a, b) => b.count - a.count);
}

export function selectStats(data: AnalyticsData, periodDays: number) {
  const periodStart = subDays(new Date(), periodDays);
  const newUsers = data.profiles.filter(p => new Date(p.created_at) >= periodStart).length;
  const newEnrollments = data.enrollments.filter(e => new Date(e.started_at) >= periodStart).length;
  const completedCourses = data.enrollments.filter(e => e.completed_at && new Date(e.completed_at) >= periodStart).length;
  const lessonsCompleted = data.lessonProgress.filter(lp => lp.completed_at && new Date(lp.completed_at) >= periodStart).length;
  const activeEnrollments = data.enrollments.filter(e => e.status === "active").length;
  const totalCompleted = data.enrollments.filter(e => e.completed_at).length;
  const completionRate = data.enrollments.length > 0 ? Math.round((totalCompleted / data.enrollments.length) * 100) : 0;
  const newOrgs = data.organizations.filter(o => new Date(o.created_at) >= periodStart).length;
  return {
    newUsers, newEnrollments, completedCourses, lessonsCompleted, activeEnrollments,
    completionRate, totalUsers: data.profiles.length, totalCourses: data.courses.length,
    publishedCourses: data.courses.filter(c => c.is_published).length,
    totalOrganizations: data.organizations.length, newOrgs,
  };
}

export function selectAiUsageByOrg(data: AnalyticsData) {
  if (!data.aiUsage.length) return [];
  const orgMap = new Map<string, { generations: number; tokens: number }>();
  data.aiUsage.forEach(u => {
    const existing = orgMap.get(u.organization_id) || { generations: 0, tokens: 0 };
    existing.generations += u.ai_generations_count || 0;
    existing.tokens += u.ai_tokens_used || 0;
    orgMap.set(u.organization_id, existing);
  });
  const orgsNameMap = new Map(data.organizations.map(o => [o.id, o.name]));
  return Array.from(orgMap.entries())
    .map(([orgId, s]) => ({ orgId, name: orgsNameMap.get(orgId) || orgId.slice(0, 8), generations: s.generations, tokens: s.tokens }))
    .filter(o => o.generations > 0)
    .sort((a, b) => b.generations - a.generations);
}

export function selectAiUserStats(data: AnalyticsData, profilesMap: Map<string, ProfileInfo>) {
  if (!data.aiUserLog.length) return [];
  const userMap = new Map<string, { orgId: string; count: number }>();
  data.aiUserLog.forEach(log => {
    const key = `${log.user_id}_${log.organization_id}`;
    const existing = userMap.get(key) || { orgId: log.organization_id, count: 0 };
    existing.count++;
    userMap.set(key, existing);
  });
  const orgsNameMap = new Map(data.organizations.map(o => [o.id, o.name]));
  return Array.from(userMap.entries())
    .map(([key, s]) => {
      const userId = key.split("_")[0];
      const profile = profilesMap.get(userId);
      return { key, userId, userName: profile?.full_name || profile?.email || userId.slice(0, 8), orgName: orgsNameMap.get(s.orgId) || s.orgId.slice(0, 8), count: s.count };
    })
    .sort((a, b) => b.count - a.count);
}

export function selectEnrollmentStatusData(data: AnalyticsData) {
  const active = data.enrollments.filter(e => e.status === "active" && !e.completed_at).length;
  const completed = data.enrollments.filter(e => e.completed_at).length;
  const other = data.enrollments.length - active - completed;
  return [
    { name: "В процессе", value: active, color: CHART_COLORS[0] },
    { name: "Завершено", value: completed, color: CHART_COLORS[2] },
    { name: "Другое", value: other, color: CHART_COLORS[4] },
  ].filter(item => item.value > 0);
}

export function selectPaymentStatusData(data: AnalyticsData) {
  const paid = data.organizations.filter(o => o.is_paid).length;
  const unpaid = data.organizations.filter(o => !o.is_paid).length;
  return [
    { name: "Оплачено", value: paid, color: CHART_COLORS[2] },
    { name: "Без оплаты", value: unpaid, color: CHART_COLORS[4] },
  ].filter(item => item.value > 0);
}

export function selectTariffDistributionData(data: AnalyticsData) {
  const trial = data.organizations.filter(o => o.tariff_type === 'trial').length;
  const monthly = data.organizations.filter(o => o.tariff_type === 'monthly').length;
  const yearly = data.organizations.filter(o => o.tariff_type === 'yearly').length;
  return [
    { name: "Пробный", value: trial, color: CHART_COLORS[5] },
    { name: "Месячный", value: monthly, color: CHART_COLORS[0] },
    { name: "Годовой", value: yearly, color: CHART_COLORS[2] },
  ].filter(item => item.value > 0);
}

export const CHART_CONFIG = {
  users: { label: "Пользователи", color: CHART_COLORS[0] },
  organizations: { label: "Организации", color: CHART_COLORS[3] },
  enrollments: { label: "Записи на курсы", color: CHART_COLORS[0] },
  lessons: { label: "Уроки", color: CHART_COLORS[2] },
  completions: { label: "Завершения", color: CHART_COLORS[2] },
  platform: { label: "Платформа", color: CHART_COLORS[0] },
  courses: { label: "Курсы", color: CHART_COLORS[1] },
};

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);
