import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Loader2, TrendingUp, Users, GraduationCap, BookOpen, Activity, CheckCircle, Building2, DollarSign, Calendar } from "lucide-react";
import { format, subDays, startOfDay, eachDayOfInterval, startOfWeek, startOfMonth, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";

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

export function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7" | "30" | "90">("30");

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const [profilesRes, enrollmentsRes, progressRes, coursesRes, orgsRes, featureUsageRes] = await Promise.all([
        supabase.from("profiles").select("created_at"),
        supabase.from("enrollments").select("started_at, completed_at, status"),
        supabase.from("lesson_progress").select("completed_at, completed"),
        supabase.from("courses").select("created_at, is_published"),
        supabase.from("organizations").select("id, name, created_at, is_paid, paid_until, tariff_type, monthly_price"),
        supabase.from("organization_feature_usage").select("feature_id, usage_count, organization_id"),
      ]);

      setData({
        profiles: profilesRes.data || [],
        enrollments: enrollmentsRes.data || [],
        lessonProgress: progressRes.data || [],
        courses: coursesRes.data || [],
        organizations: orgsRes.data || [],
        featureUsage: featureUsageRes.data || [],
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
