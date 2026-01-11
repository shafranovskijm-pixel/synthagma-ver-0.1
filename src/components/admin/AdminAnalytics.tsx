import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Loader2, TrendingUp, Users, GraduationCap, BookOpen, Activity, CheckCircle } from "lucide-react";
import { format, subDays, startOfDay, eachDayOfInterval, startOfWeek, startOfMonth, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

interface AnalyticsData {
  profiles: { created_at: string }[];
  enrollments: { started_at: string; completed_at: string | null; status: string }[];
  lessonProgress: { completed_at: string | null; completed: boolean }[];
  courses: { created_at: string; is_published: boolean }[];
  organizations: { created_at: string }[];
}

const CHART_COLORS = [
  "hsl(217, 91%, 50%)",  // Primary blue
  "hsl(186, 94%, 42%)",  // Cyan
  "hsl(158, 64%, 42%)",  // Green  
  "hsl(256, 67%, 59%)",  // Purple
  "hsl(25, 95%, 53%)",   // Orange
  "hsl(330, 81%, 60%)",  // Pink
];

export function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7" | "30" | "90">("30");

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const [profilesRes, enrollmentsRes, progressRes, coursesRes, orgsRes] = await Promise.all([
        supabase.from("profiles").select("created_at"),
        supabase.from("enrollments").select("started_at, completed_at, status"),
        supabase.from("lesson_progress").select("completed_at, completed"),
        supabase.from("courses").select("created_at, is_published"),
        supabase.from("organizations").select("created_at"),
      ]);

      setData({
        profiles: profilesRes.data || [],
        enrollments: enrollmentsRes.data || [],
        lessonProgress: progressRes.data || [],
        courses: coursesRes.data || [],
        organizations: orgsRes.data || [],
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

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
              <GraduationCap className="w-3 h-3" /> Уроков пройдено
            </CardDescription>
            <CardTitle className="text-2xl">{stats.lessonsCompleted}</CardTitle>
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
        <TabsList>
          <TabsTrigger value="registrations">Регистрации</TabsTrigger>
          <TabsTrigger value="activity">Активность</TabsTrigger>
          <TabsTrigger value="completions">Завершения</TabsTrigger>
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

        <TabsContent value="overview">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Распределение записей по статусу</CardTitle>
                <CardDescription>
                  Текущий статус всех записей на курсы
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <PieChart>
                    <Pie
                      data={enrollmentStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {enrollmentStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Общая статистика</CardTitle>
                <CardDescription>
                  Ключевые метрики платформы
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-primary" />
                    <span>Всего пользователей</span>
                  </div>
                  <span className="font-bold text-lg">{stats.totalUsers}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-5 h-5 text-primary" />
                    <span>Всего курсов</span>
                  </div>
                  <span className="font-bold text-lg">{stats.totalCourses}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>Опубликовано курсов</span>
                  </div>
                  <span className="font-bold text-lg">{stats.publishedCourses}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-cyan-500" />
                    <span>Активных записей</span>
                  </div>
                  <span className="font-bold text-lg">{stats.activeEnrollments}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-purple-500" />
                    <span>Процент завершения</span>
                  </div>
                  <span className="font-bold text-lg">{stats.completionRate}%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
