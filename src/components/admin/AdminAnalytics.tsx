import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Loader2, TrendingUp, Users, GraduationCap, BookOpen, Activity, CheckCircle, Building2, DollarSign, Calendar, Eye, Monitor, Search } from "lucide-react";
import { format, subDays, startOfDay, eachDayOfInterval, startOfWeek, startOfMonth, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { OnlineUsersWidget } from "./OnlineUsersWidget";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LoginHistoryRecord {
  user_id: string;
  logged_in_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

interface CourseAccessRecord {
  user_id: string;
  course_id: string;
  accessed_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

interface ProfileInfo {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface CourseInfo {
  id: string;
  title: string;
}

interface AnalyticsData {
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

const CHART_COLORS = [
  "hsl(217, 91%, 50%)",  // Primary blue
  "hsl(186, 94%, 42%)",  // Cyan
  "hsl(158, 64%, 42%)",  // Green  
  "hsl(256, 67%, 59%)",  // Purple
  "hsl(25, 95%, 53%)",   // Orange
  "hsl(330, 81%, 60%)",  // Pink
];

const FEATURE_LABELS: Record<string, string> = {
  courses: "Курсы",
  students: "Слушатели",
  companies: "Компании",
  documents: "Документооборот",
  journals: "Журналы",
  frdo: "ФРДО",
  marketplace: "Магазин курсов",
  library: "Библиотека",
};

function parseDevice(ua: string | null): string {
  if (!ua) return "Неизвестно";
  if (/mobile|android|iphone|ipad/i.test(ua)) return "Мобильное";
  if (/tablet/i.test(ua)) return "Планшет";
  return "ПК";
}

function parseBrowser(ua: string | null): string {
  if (!ua) return "";
  if (/edg/i.test(ua)) return "Edge";
  if (/chrome/i.test(ua)) return "Chrome";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  if (/opera|opr/i.test(ua)) return "Opera";
  return "Другой";
}

export function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7" | "30" | "90">("30");
  const [visitFilter, setVisitFilter] = useState<"all" | "platform" | "courses">("all");
  const [visitSearch, setVisitSearch] = useState("");

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
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
        supabase.from("profiles").select("user_id, full_name, email"),
        supabase.from("courses").select("id, title"),
      ]);

      setData({
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
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const periodDays = parseInt(period);
  const startDate = subDays(new Date(), periodDays);
  const dateRange = eachDayOfInterval({ start: startDate, end: new Date() });

  // Lookup maps
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

  // Process registration data by day
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

  // Process enrollment activity data
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

  // Process course completions data
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

  // Visits by day chart data
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

  // Visit summary stats
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

  // Unified visit log for table
  const visitLog = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    const periodStart = subDays(now, periodDays);

    type VisitEntry = {
      userId: string;
      name: string;
      email: string;
      time: Date;
      ip: string;
      device: string;
      browser: string;
      type: "platform" | "course";
      courseTitle: string | null;
    };

    const entries: VisitEntry[] = [];

    if (visitFilter !== "courses") {
      data.loginHistory.forEach(r => {
        const d = new Date(r.logged_in_at);
        if (d < periodStart) return;
        const p = profilesMap.get(r.user_id);
        entries.push({
          userId: r.user_id,
          name: p?.full_name || "—",
          email: p?.email || "—",
          time: d,
          ip: r.ip_address || "—",
          device: parseDevice(r.user_agent),
          browser: parseBrowser(r.user_agent),
          type: "platform",
          courseTitle: null,
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
          userId: r.user_id,
          name: p?.full_name || "—",
          email: p?.email || "—",
          time: d,
          ip: r.ip_address || "—",
          device: parseDevice(r.user_agent),
          browser: parseBrowser(r.user_agent),
          type: "course",
          courseTitle: coursesMap.get(r.course_id) || r.course_id,
        });
      });
    }

    // Search filter
    const search = visitSearch.toLowerCase();
    const filtered = search
      ? entries.filter(e => e.name.toLowerCase().includes(search) || e.email.toLowerCase().includes(search))
      : entries;

    // Sort descending
    filtered.sort((a, b) => b.time.getTime() - a.time.getTime());

    return filtered.slice(0, 200);
  }, [data, periodDays, visitFilter, visitSearch, profilesMap, coursesMap]);

  // Top active users
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
        return {
          userId,
          name: p?.full_name || "—",
          email: p?.email || "—",
          platform: s.platform,
          courses: s.courses,
          total: s.platform + s.courses,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
  }, [data, periodDays, profilesMap]);

  // Payment and revenue stats
  const paymentStats = useMemo(() => {
    if (!data) return null;

    const paidOrgs = data.organizations.filter(o => o.is_paid);
    const unpaidOrgs = data.organizations.filter(o => !o.is_paid);
    const yearlyOrgs = data.organizations.filter(o => o.tariff_type === 'yearly');
    const monthlyOrgs = data.organizations.filter(o => o.tariff_type === 'monthly');
    
    // Calculate projected revenue
    const monthlyRevenue = monthlyOrgs.reduce((sum, o) => sum + (o.monthly_price || 0), 0);
    const yearlyRevenue = yearlyOrgs.reduce((sum, o) => sum + ((o.monthly_price || 0) * 12 * 0.8), 0); // 20% discount for yearly
    const projectedMonthlyRevenue = monthlyRevenue + (yearlyRevenue / 12);
    const projectedYearlyRevenue = projectedMonthlyRevenue * 12;

    return {
      paidCount: paidOrgs.length,
      unpaidCount: unpaidOrgs.length,
      yearlyCount: yearlyOrgs.length,
      monthlyCount: monthlyOrgs.length,
      projectedMonthlyRevenue,
      projectedYearlyRevenue,
    };
  }, [data]);

  // Feature usage stats
  const featureUsageStats = useMemo(() => {
    if (!data || !data.featureUsage.length) return [];

    const usageByFeature: Record<string, number> = {};
    data.featureUsage.forEach(fu => {
      if (!usageByFeature[fu.feature_id]) {
        usageByFeature[fu.feature_id] = 0;
      }
      usageByFeature[fu.feature_id] += fu.usage_count;
    });

    return Object.entries(usageByFeature)
      .map(([feature_id, count]) => ({
        feature_id,
        name: FEATURE_LABELS[feature_id] || feature_id,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  // Summary stats
  const stats = useMemo(() => {
    if (!data) return null;

    const now = new Date();
    const periodStart = subDays(now, periodDays);

    const newUsers = data.profiles.filter(
      (p) => new Date(p.created_at) >= periodStart
    ).length;
    
    const newEnrollments = data.enrollments.filter(
      (e) => new Date(e.started_at) >= periodStart
    ).length;
    
    const completedCourses = data.enrollments.filter(
      (e) => e.completed_at && new Date(e.completed_at) >= periodStart
    ).length;
    
    const lessonsCompleted = data.lessonProgress.filter(
      (lp) => lp.completed_at && new Date(lp.completed_at) >= periodStart
    ).length;

    const activeEnrollments = data.enrollments.filter((e) => e.status === "active").length;
    const totalCompleted = data.enrollments.filter((e) => e.completed_at).length;
    const completionRate = data.enrollments.length > 0 
      ? Math.round((totalCompleted / data.enrollments.length) * 100) 
      : 0;

    const newOrgs = data.organizations.filter(
      (o) => new Date(o.created_at) >= periodStart
    ).length;

    return {
      newUsers,
      newEnrollments,
      completedCourses,
      lessonsCompleted,
      activeEnrollments,
      completionRate,
      totalUsers: data.profiles.length,
      totalCourses: data.courses.length,
      publishedCourses: data.courses.filter((c) => c.is_published).length,
      totalOrganizations: data.organizations.length,
      newOrgs,
    };
  }, [data, periodDays]);

  // AI usage by organization
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
      .map(([orgId, stats]) => ({
        orgId,
        name: orgsNameMap.get(orgId) || orgId.slice(0, 8),
        generations: stats.generations,
        tokens: stats.tokens,
      }))
      .filter(o => o.generations > 0)
      .sort((a, b) => b.generations - a.generations);
  }, [data]);

  // Enrollment status distribution
  const enrollmentStatusData = useMemo(() => {
    if (!data) return [];

    const active = data.enrollments.filter((e) => e.status === "active" && !e.completed_at).length;
    const completed = data.enrollments.filter((e) => e.completed_at).length;
    const other = data.enrollments.length - active - completed;

    return [
      { name: "В процессе", value: active, color: CHART_COLORS[0] },
      { name: "Завершено", value: completed, color: CHART_COLORS[2] },
      { name: "Другое", value: other, color: CHART_COLORS[4] },
    ].filter((item) => item.value > 0);
  }, [data]);

  // Payment status distribution
  const paymentStatusData = useMemo(() => {
    if (!data) return [];

    const paid = data.organizations.filter(o => o.is_paid).length;
    const unpaid = data.organizations.filter(o => !o.is_paid).length;

    return [
      { name: "Оплачено", value: paid, color: CHART_COLORS[2] },
      { name: "Без оплаты", value: unpaid, color: CHART_COLORS[4] },
    ].filter((item) => item.value > 0);
  }, [data]);

  // Tariff distribution
  const tariffDistributionData = useMemo(() => {
    if (!data) return [];

    const trial = data.organizations.filter(o => o.tariff_type === 'trial').length;
    const monthly = data.organizations.filter(o => o.tariff_type === 'monthly').length;
    const yearly = data.organizations.filter(o => o.tariff_type === 'yearly').length;

    return [
      { name: "Пробный", value: trial, color: CHART_COLORS[5] },
      { name: "Месячный", value: monthly, color: CHART_COLORS[0] },
      { name: "Годовой", value: yearly, color: CHART_COLORS[2] },
    ].filter((item) => item.value > 0);
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data || !stats) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Нет данных для отображения
      </div>
    );
  }

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
    return new Intl.NumberFormat('ru-RU', { 
      style: 'currency', 
      currency: 'RUB',
      maximumFractionDigits: 0 
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">Аналитика</h2>
          <p className="text-muted-foreground">Статистика и графики платформы</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 дней</SelectItem>
            <SelectItem value="30">30 дней</SelectItem>
            <SelectItem value="90">90 дней</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Payment & Revenue Stats */}
      {paymentStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card className="border-green-500/30 bg-green-500/5">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Building2 className="w-3 h-3" /> С оплатой
              </CardDescription>
              <CardTitle className="text-2xl text-green-600">{paymentStats.paidCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-orange-500/30 bg-orange-500/5">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Building2 className="w-3 h-3" /> Без оплаты
              </CardDescription>
              <CardTitle className="text-2xl text-orange-600">{paymentStats.unpaidCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Годовой тариф
              </CardDescription>
              <CardTitle className="text-2xl">{paymentStats.yearlyCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Месячный тариф
              </CardDescription>
              <CardTitle className="text-2xl">{paymentStats.monthlyCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Прогноз/мес
              </CardDescription>
              <CardTitle className="text-xl text-primary">{formatCurrency(paymentStats.projectedMonthlyRevenue)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Прогноз/год
              </CardDescription>
              <CardTitle className="text-xl text-primary">{formatCurrency(paymentStats.projectedYearlyRevenue)}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Online Users Widget */}
      <OnlineUsersWidget />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Всего организаций
            </CardDescription>
            <CardTitle className="text-2xl">{stats.totalOrganizations}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Новых орг-ций
            </CardDescription>
            <CardTitle className="text-2xl">{stats.newOrgs}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Users className="w-3 h-3" /> Новые пользователи
            </CardDescription>
            <CardTitle className="text-2xl">{stats.newUsers}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <BookOpen className="w-3 h-3" /> Новые записи
            </CardDescription>
            <CardTitle className="text-2xl">{stats.newEnrollments}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Завершено курсов
            </CardDescription>
            <CardTitle className="text-2xl">{stats.completedCourses}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Activity className="w-3 h-3" /> Активных записей
            </CardDescription>
            <CardTitle className="text-2xl">{stats.activeEnrollments}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> % завершения
            </CardDescription>
            <CardTitle className="text-2xl">{stats.completionRate}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="registrations" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="registrations">Регистрации</TabsTrigger>
          <TabsTrigger value="activity">Активность</TabsTrigger>
          <TabsTrigger value="visits">Посещения</TabsTrigger>
          <TabsTrigger value="completions">Завершения</TabsTrigger>
          <TabsTrigger value="payments">Оплаты</TabsTrigger>
          <TabsTrigger value="features">Функции</TabsTrigger>
          <TabsTrigger value="overview">Обзор</TabsTrigger>
        </TabsList>

        <TabsContent value="registrations">
          <Card>
            <CardHeader>
              <CardTitle>Регистрации пользователей и организаций</CardTitle>
              <CardDescription>
                Динамика регистраций за последние {period} дней
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[350px] w-full">
                <AreaChart data={registrationsByDay} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorOrgs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS[3]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS[3]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <ChartTooltip 
                    content={<ChartTooltipContent labelKey="fullDate" />}
                  />
                  <Area
                    type="monotone"
                    dataKey="users"
                    name="Пользователи"
                    stroke={CHART_COLORS[0]}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorUsers)"
                  />
                  <Area
                    type="monotone"
                    dataKey="organizations"
                    name="Организации"
                    stroke={CHART_COLORS[3]}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorOrgs)"
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Активность на платформе</CardTitle>
              <CardDescription>
                Записи на курсы и прохождение уроков за последние {period} дней
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[350px] w-full">
                <BarChart data={activityByDay} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <ChartTooltip 
                    content={<ChartTooltipContent labelKey="fullDate" />}
                  />
                  <Bar 
                    dataKey="enrollments" 
                    name="Записи на курсы" 
                    fill={CHART_COLORS[0]} 
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar 
                    dataKey="lessons" 
                    name="Уроки пройдены" 
                    fill={CHART_COLORS[2]} 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visits">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1"><Eye className="w-3 h-3" /> Заходы на платформу</CardDescription>
                <CardTitle className="text-2xl">{visitStats.platformTotal}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> Заходы на курсы</CardDescription>
                <CardTitle className="text-2xl">{visitStats.courseTotal}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1"><Users className="w-3 h-3" /> Уникальных пользователей</CardDescription>
                <CardTitle className="text-2xl">{visitStats.uniqueUsers}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Среднее/день</CardDescription>
                <CardTitle className="text-2xl">{visitStats.avgPerDay}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Посещения по дням</CardTitle>
              <CardDescription>Заходы на платформу и курсы за последние {period} дней</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[350px] w-full">
                <AreaChart data={visitsByDay} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPlatform" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorCourses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS[1]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS[1]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <ChartTooltip 
                    content={<ChartTooltipContent labelKey="fullDate" />}
                  />
                  <Area
                    type="monotone"
                    dataKey="platform"
                    name="Платформа"
                    stroke={CHART_COLORS[0]}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorPlatform)"
                  />
                  <Area
                    type="monotone"
                    dataKey="courses"
                    name="Курсы"
                    stroke={CHART_COLORS[1]}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCourses)"
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Журнал посещений</CardTitle>
              <CardDescription>Детализация по каждому визиту (последние 200)</CardDescription>
              <div className="flex flex-wrap gap-2 mt-3">
                <Select value={visitFilter} onValueChange={(v) => setVisitFilter(v as typeof visitFilter)}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все посещения</SelectItem>
                    <SelectItem value="platform">Только платформа</SelectItem>
                    <SelectItem value="courses">Только курсы</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по имени или email..."
                    value={visitSearch}
                    onChange={(e) => setVisitSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Имя</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Дата и время</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Курс</TableHead>
                      <TableHead>Устройство</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visitLog.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Нет данных за выбранный период
                        </TableCell>
                      </TableRow>
                    ) : (
                      visitLog.map((v, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium whitespace-nowrap">{v.name}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{v.email}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {format(v.time, "d MMM yyyy, HH:mm", { locale: ru })}
                          </TableCell>
                          <TableCell>
                            <Badge variant={v.type === "platform" ? "secondary" : "default"} className="text-xs">
                              {v.type === "platform" ? "Платформа" : "Курс"}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs">{v.courseTitle || "—"}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            <span className="flex items-center gap-1">
                              <Monitor className="w-3 h-3" />
                              {v.device} · {v.browser}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{v.ip}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Топ-20 активных пользователей</CardTitle>
              <CardDescription>По количеству посещений за {period} дней</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Имя</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">Платформа</TableHead>
                    <TableHead className="text-center">Курсы</TableHead>
                    <TableHead className="text-center">Всего</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Нет данных
                      </TableCell>
                    </TableRow>
                  ) : (
                    topUsers.map((u, i) => (
                      <TableRow key={u.userId}>
                        <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{u.email}</TableCell>
                        <TableCell className="text-center">{u.platform}</TableCell>
                        <TableCell className="text-center">{u.courses}</TableCell>
                        <TableCell className="text-center font-bold">{u.total}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completions">
          <Card>
            <CardHeader>
              <CardTitle>Завершения курсов</CardTitle>
              <CardDescription>
                Динамика завершения курсов за последние {period} дней
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[350px] w-full">
                <LineChart data={completionsByDay} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <ChartTooltip 
                    content={<ChartTooltipContent labelKey="fullDate" />}
                  />
                  <Line
                    type="monotone"
                    dataKey="completions"
                    name="Завершения"
                    stroke={CHART_COLORS[2]}
                    strokeWidth={3}
                    dot={{ fill: CHART_COLORS[2], strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Статус оплаты организаций</CardTitle>
                <CardDescription>
                  Распределение по статусу оплаты
                </CardDescription>
              </CardHeader>
              <CardContent>
                {paymentStatusData.length > 0 ? (
                  <ChartContainer config={{}} className="h-[300px] w-full">
                    <PieChart>
                      <Pie
                        data={paymentStatusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {paymentStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ChartContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Нет данных
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Распределение тарифов</CardTitle>
                <CardDescription>
                  Типы тарифов организаций
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tariffDistributionData.length > 0 ? (
                  <ChartContainer config={{}} className="h-[300px] w-full">
                    <PieChart>
                      <Pie
                        data={tariffDistributionData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {tariffDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ChartContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Нет данных
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>Популярность функций</CardTitle>
              <CardDescription>
                Какими функциями организации пользуются больше всего
              </CardDescription>
            </CardHeader>
            <CardContent>
              {featureUsageStats.length > 0 ? (
                <div className="space-y-4">
                  {featureUsageStats.map((feature, index) => (
                    <div key={feature.feature_id} className="flex items-center gap-4">
                      <div className="w-8 text-center font-bold text-muted-foreground">
                        #{index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">{feature.name}</span>
                          <span className="text-muted-foreground">{feature.count} использований</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ 
                              width: `${(feature.count / (featureUsageStats[0]?.count || 1)) * 100}%` 
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Данные об использовании функций пока не собраны
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overview">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Статусы записей на курсы</CardTitle>
                <CardDescription>
                  Распределение записей по статусу
                </CardDescription>
              </CardHeader>
              <CardContent>
                {enrollmentStatusData.length > 0 ? (
                  <ChartContainer config={{}} className="h-[300px] w-full">
                    <PieChart>
                      <Pie
                        data={enrollmentStatusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {enrollmentStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ChartContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Нет записей на курсы
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Общая статистика</CardTitle>
                <CardDescription>
                  Ключевые показатели платформы
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">Всего пользователей</span>
                  <span className="font-bold text-lg">{stats.totalUsers}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">Всего организаций</span>
                  <span className="font-bold text-lg">{stats.totalOrganizations}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">Всего курсов</span>
                  <span className="font-bold text-lg">{stats.totalCourses}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">Опубликованных курсов</span>
                  <span className="font-bold text-lg">{stats.publishedCourses}</span>
                </div>
                {paymentStats && (
                  <>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-green-500/10">
                      <span className="text-muted-foreground">Оплаченных организаций</span>
                      <span className="font-bold text-lg text-green-600">{paymentStats.paidCount}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-primary/10">
                      <span className="text-muted-foreground">Прогноз выручки/год</span>
                      <span className="font-bold text-lg text-primary">{formatCurrency(paymentStats.projectedYearlyRevenue)}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* AI Usage Widget */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                ИИ-генерации по организациям
              </CardTitle>
              <CardDescription>
                Рейтинг организаций по количеству ИИ-запросов (все время)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {aiUsageByOrg.length > 0 ? (
                <div className="space-y-6">
                  <ChartContainer config={{ generations: { label: "Генерации", color: CHART_COLORS[3] } }} className="h-[300px] w-full">
                    <BarChart data={aiUsageByOrg.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={150} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="generations" name="Генерации" fill={CHART_COLORS[3]} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartContainer>

                  <ScrollArea className="h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">#</TableHead>
                          <TableHead>Организация</TableHead>
                          <TableHead className="text-right">Генерации</TableHead>
                          <TableHead className="text-right">Токены</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {aiUsageByOrg.map((org, index) => (
                          <TableRow key={org.orgId}>
                            <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                            <TableCell className="font-medium">{org.name}</TableCell>
                            <TableCell className="text-right">{org.generations.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{org.tokens.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                  Нет данных об ИИ-генерациях
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
