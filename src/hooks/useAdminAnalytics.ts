import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfDay, eachDayOfInterval } from "date-fns";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

const ADMIN_ANALYTICS_KEY = ["admin", "analytics"] as const;

export interface LoginHistoryRecord {
  user_id: string;
  logged_in_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

export interface CourseAccessRecord {
  user_id: string;
  course_id: string;
  accessed_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

export interface ProfileInfo {
  user_id: string;
  full_name: string | null;
  email: string | null;
  login: string | null;
  organization_id: string | null;
}

export interface CourseInfo {
  id: string;
  title: string;
}

export interface AnalyticsData {
  profiles: { created_at: string }[];
  enrollments: { started_at: string; completed_at: string | null; status: string }[];
  lessonProgress: { completed_at: string | null; completed: boolean }[];
  courses: { created_at: string; is_published: boolean }[];
  organizations: { 
    id: string;
    name: string;
    created_at: string; 
    is_paid: boolean;
    paid_until: string | null;
    tariff_type: string;
    monthly_price: number;
  }[];
  featureUsage: { feature_id: string; usage_count: number; organization_id: string }[];
  aiUsage: { organization_id: string; ai_generations_count: number; ai_tokens_used: number; month_start: string }[];
  aiUserLog: { user_id: string; organization_id: string; function_name: string; created_at: string }[];
  loginHistory: LoginHistoryRecord[];
  courseAccessLog: CourseAccessRecord[];
  profilesInfo: ProfileInfo[];
  coursesInfo: CourseInfo[];
}

export const CHART_COLORS = [
  "hsl(217, 91%, 50%)",
  "hsl(186, 94%, 42%)",
  "hsl(158, 64%, 42%)",
  "hsl(256, 67%, 59%)",
  "hsl(25, 95%, 53%)",
  "hsl(330, 81%, 60%)",
];

export const FEATURE_LABELS: Record<string, string> = {
  courses: "Курсы",
  students: "Слушатели",
  companies: "Компании",
  documents: "Документооборот",
  journals: "Журналы",
  frdo: "ФРДО",
  marketplace: "Магазин курсов",
  library: "Библиотека",
};

export function parseDevice(ua: string | null): string {
  if (!ua) return "Неизвестно";
  if (/mobile|android|iphone|ipad/i.test(ua)) return "Мобильное";
  if (/tablet/i.test(ua)) return "Планшет";
  return "ПК";
}

export function parseBrowser(ua: string | null): string {
  if (!ua) return "";
  if (/edg/i.test(ua)) return "Edge";
  if (/chrome/i.test(ua)) return "Chrome";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  if (/opera|opr/i.test(ua)) return "Opera";
  return "Другой";
}

async function fetchAnalytics(): Promise<AnalyticsData> {
  const [profilesRes, enrollmentsRes, progressRes, coursesRes, orgsRes, featureUsageRes, aiUsageRes, aiUserLogRes, loginHistoryRes, courseAccessRes, profilesInfoRes, coursesInfoRes] = await Promise.all([
    supabase.from("profiles").select("created_at"),
    supabase.from("enrollments").select("started_at, completed_at, status"),
    supabase.from("lesson_progress").select("completed_at, completed"),
    supabase.from("courses").select("created_at, is_published"),
    supabase.from("organizations").select("id, name, created_at, is_paid, paid_until, tariff_type, monthly_price"),
    supabase.from("organization_feature_usage").select("feature_id, usage_count, organization_id"),
    supabase.from("organization_usage").select("organization_id, ai_generations_count, ai_tokens_used, month_start"),
    supabase.from("ai_usage_log").select("user_id, organization_id, function_name, created_at").order("created_at", { ascending: false }).limit(1000),
    supabase.from("student_login_history").select("user_id, logged_in_at, ip_address, user_agent"),
    supabase.from("course_access_log").select("user_id, course_id, accessed_at, ip_address, user_agent"),
    supabase.from("profiles").select("user_id, full_name, email, login, organization_id"),
    supabase.from("courses").select("id, title"),
  ]);

  return {
    profiles: profilesRes.data || [],
    enrollments: enrollmentsRes.data || [],
    lessonProgress: progressRes.data || [],
    courses: coursesRes.data || [],
    organizations: orgsRes.data || [],
    featureUsage: featureUsageRes.data || [],
    aiUsage: (aiUsageRes.data || []) as any,
    aiUserLog: (aiUserLogRes.data || []) as any,
    loginHistory: (loginHistoryRes.data || []) as LoginHistoryRecord[],
    courseAccessLog: (courseAccessRes.data || []) as CourseAccessRecord[],
    profilesInfo: (profilesInfoRes.data || []) as ProfileInfo[],
    coursesInfo: (coursesInfoRes.data || []) as CourseInfo[],
  };
}

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
  const startDate = subDays(new Date(), periodDays);
  const dateRange = eachDayOfInterval({ start: startDate, end: new Date() });

  const profilesMap = useMemo(() => {
    if (!data) return new Map<string, ProfileInfo>();
    const map = new Map<string, ProfileInfo>();
    data.profilesInfo.forEach(p => map.set(p.user_id, p));
    return map;
  }, [data]);

  const coursesMap = useMemo(() => {
    if (!data) return new Map<string, string>();
    const map = new Map<string, string>();
    data.coursesInfo.forEach(c => map.set(c.id, c.title));
    return map;
  }, [data]);

  const orgsMap = useMemo(() => {
    if (!data) return new Map<string, string>();
    const map = new Map<string, string>();
    data.organizations.forEach(o => map.set(o.id, o.name));
    return map;
  }, [data]);

  const registrationsByDay = useMemo(() => {
    if (!data) return [];
    return dateRange.map((date) => {
      const dayStart = startOfDay(date);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const usersCount = data.profiles.filter((p) => {
        const createdAt = new Date(p.created_at);
        return createdAt >= dayStart && createdAt < dayEnd;
      }).length;
      const orgsCount = data.organizations.filter((o) => {
        const createdAt = new Date(o.created_at);
        return createdAt >= dayStart && createdAt < dayEnd;
      }).length;
      return {
        date: format(date, "d MMM", { locale: ru }),
        fullDate: format(date, "d MMMM yyyy", { locale: ru }),
        users: usersCount,
        organizations: orgsCount,
      };
    });
  }, [data, dateRange]);

  const activityByDay = useMemo(() => {
    if (!data) return [];
    return dateRange.map((date) => {
      const dayStart = startOfDay(date);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const enrollmentsCount = data.enrollments.filter((e) => {
        const startedAt = new Date(e.started_at);
        return startedAt >= dayStart && startedAt < dayEnd;
      }).length;
      const lessonsCompleted = data.lessonProgress.filter((lp) => {
        if (!lp.completed_at) return false;
        const completedAt = new Date(lp.completed_at);
        return completedAt >= dayStart && completedAt < dayEnd;
      }).length;
      return {
        date: format(date, "d MMM", { locale: ru }),
        fullDate: format(date, "d MMMM yyyy", { locale: ru }),
        enrollments: enrollmentsCount,
        lessons: lessonsCompleted,
      };
    });
  }, [data, dateRange]);

  const completionsByDay = useMemo(() => {
    if (!data) return [];
    return dateRange.map((date) => {
      const dayStart = startOfDay(date);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const completedCount = data.enrollments.filter((e) => {
        if (!e.completed_at) return false;
        const completedAt = new Date(e.completed_at);
        return completedAt >= dayStart && completedAt < dayEnd;
      }).length;
      return {
        date: format(date, "d MMM", { locale: ru }),
        fullDate: format(date, "d MMMM yyyy", { locale: ru }),
        completions: completedCount,
      };
    });
  }, [data, dateRange]);

  const visitsByDay = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    const periodStart = subDays(now, periodDays);
    return dateRange.map((date) => {
      const dayStart = startOfDay(date);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const platformVisits = data.loginHistory.filter((r) => {
        const d = new Date(r.logged_in_at);
        return d >= dayStart && d < dayEnd && d >= periodStart;
      }).length;
      const courseVisits = data.courseAccessLog.filter((r) => {
        if (!r.accessed_at) return false;
        const d = new Date(r.accessed_at);
        return d >= dayStart && d < dayEnd && d >= periodStart;
      }).length;
      return {
        date: format(date, "d MMM", { locale: ru }),
        fullDate: format(date, "d MMMM yyyy", { locale: ru }),
        platform: platformVisits,
        courses: courseVisits,
      };
    });
  }, [data, dateRange, periodDays]);

  const visitStats = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const periodStart = subDays(now, periodDays);
    const platformTotal = data.loginHistory.filter(r => new Date(r.logged_in_at) >= periodStart).length;
    const courseTotal = data.courseAccessLog.filter(r => r.accessed_at && new Date(r.accessed_at) >= periodStart).length;
    const uniqueUsers = new Set([
      ...data.loginHistory.filter(r => new Date(r.logged_in_at) >= periodStart).map(r => r.user_id),
      ...data.courseAccessLog.filter(r => r.accessed_at && new Date(r.accessed_at) >= periodStart).map(r => r.user_id),
    ]).size;
    const avgPerDay = periodDays > 0 ? Math.round((platformTotal + courseTotal) / periodDays) : 0;
    return { platformTotal, courseTotal, uniqueUsers, avgPerDay };
  }, [data, periodDays]);

  const visitLog = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    const periodStart = subDays(now, periodDays);
    type VisitEntry = {
      userId: string; name: string; email: string; time: Date; ip: string;
      device: string; browser: string; type: "platform" | "course";
      courseTitle: string | null; orgName: string | null;
    };
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
  }, [data, periodDays, visitFilter, visitSearch, profilesMap, coursesMap, orgsMap]);

  const topUsers = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    const periodStart = subDays(now, periodDays);
    const userStats = new Map<string, { platform: number; courses: number }>();
    data.loginHistory.forEach(r => {
      if (new Date(r.logged_in_at) < periodStart) return;
      const s = userStats.get(r.user_id) || { platform: 0, courses: 0 };
      s.platform++;
      userStats.set(r.user_id, s);
    });
    data.courseAccessLog.forEach(r => {
      if (!r.accessed_at || new Date(r.accessed_at) < periodStart) return;
      const s = userStats.get(r.user_id) || { platform: 0, courses: 0 };
      s.courses++;
      userStats.set(r.user_id, s);
    });
    return Array.from(userStats.entries())
      .map(([userId, s]) => {
        const p = profilesMap.get(userId);
        return { userId, name: p?.full_name || "—", email: p?.email || p?.login || "—", platform: s.platform, courses: s.courses, total: s.platform + s.courses };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
  }, [data, periodDays, profilesMap]);

  const paymentStats = useMemo(() => {
    if (!data) return null;
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
  }, [data]);

  const featureUsageStats = useMemo(() => {
    if (!data || !data.featureUsage.length) return [];
    const usageByFeature: Record<string, number> = {};
    data.featureUsage.forEach(fu => {
      if (!usageByFeature[fu.feature_id]) usageByFeature[fu.feature_id] = 0;
      usageByFeature[fu.feature_id] += fu.usage_count;
    });
    return Object.entries(usageByFeature)
      .map(([feature_id, count]) => ({ feature_id, name: FEATURE_LABELS[feature_id] || feature_id, count }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const periodStart = subDays(now, periodDays);
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
  }, [data, periodDays]);

  const aiUsageByOrg = useMemo(() => {
    if (!data || !data.aiUsage.length) return [];
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
  }, [data]);

  const aiUserStats = useMemo(() => {
    if (!data || !data.aiUserLog.length) return [];
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
  }, [data, profilesMap]);

  const enrollmentStatusData = useMemo(() => {
    if (!data) return [];
    const active = data.enrollments.filter(e => e.status === "active" && !e.completed_at).length;
    const completed = data.enrollments.filter(e => e.completed_at).length;
    const other = data.enrollments.length - active - completed;
    return [
      { name: "В процессе", value: active, color: CHART_COLORS[0] },
      { name: "Завершено", value: completed, color: CHART_COLORS[2] },
      { name: "Другое", value: other, color: CHART_COLORS[4] },
    ].filter(item => item.value > 0);
  }, [data]);

  const paymentStatusData = useMemo(() => {
    if (!data) return [];
    const paid = data.organizations.filter(o => o.is_paid).length;
    const unpaid = data.organizations.filter(o => !o.is_paid).length;
    return [
      { name: "Оплачено", value: paid, color: CHART_COLORS[2] },
      { name: "Без оплаты", value: unpaid, color: CHART_COLORS[4] },
    ].filter(item => item.value > 0);
  }, [data]);

  const tariffDistributionData = useMemo(() => {
    if (!data) return [];
    const trial = data.organizations.filter(o => o.tariff_type === 'trial').length;
    const monthly = data.organizations.filter(o => o.tariff_type === 'monthly').length;
    const yearly = data.organizations.filter(o => o.tariff_type === 'yearly').length;
    return [
      { name: "Пробный", value: trial, color: CHART_COLORS[5] },
      { name: "Месячный", value: monthly, color: CHART_COLORS[0] },
      { name: "Годовой", value: yearly, color: CHART_COLORS[2] },
    ].filter(item => item.value > 0);
  }, [data]);

  const chartConfig = {
    users: { label: "Пользователи", color: CHART_COLORS[0] },
    organizations: { label: "Организации", color: CHART_COLORS[3] },
    enrollments: { label: "Записи на курсы", color: CHART_COLORS[0] },
    lessons: { label: "Уроки", color: CHART_COLORS[2] },
    completions: { label: "Завершения", color: CHART_COLORS[2] },
    platform: { label: "Платформа", color: CHART_COLORS[0] },
    courses: { label: "Курсы", color: CHART_COLORS[1] },
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);
  };

  return {
    data, loading, period, setPeriod, visitFilter, setVisitFilter, visitSearch, setVisitSearch,
    registrationsByDay, activityByDay, completionsByDay, visitsByDay, visitStats, visitLog,
    topUsers, paymentStats, featureUsageStats, stats, aiUsageByOrg, aiUserStats,
    enrollmentStatusData, paymentStatusData, tariffDistributionData, chartConfig, formatCurrency,
    profilesMap, coursesMap, orgsMap,
  };
}
