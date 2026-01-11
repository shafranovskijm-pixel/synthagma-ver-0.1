import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  ArrowLeft,
  Users,
  BookOpen,
  FileText,
  Settings,
  BarChart3,
  HardDrive,
  Sparkles,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Search,
  Building2,
  Save,
  TrendingUp,
  AlertTriangle,
  Bell
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

interface Organization {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  inn: string | null;
  contact_name: string | null;
  ai_enabled: boolean;
  created_at: string;
  storage_limit_bytes?: number;
  ai_tokens_limit?: number;
  notify_on_limit_80?: boolean;
  notify_on_limit_exceeded?: boolean;
}

interface Student {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  login: string | null;
  enrollments: {
    course_title: string;
    progress: number;
    status: string;
    started_at: string;
  }[];
}

interface Course {
  id: string;
  title: string;
  is_published: boolean;
  students_count: number;
  lessons_count: number;
}

interface OrgDocument {
  id: string;
  name: string;
  type: string;
  file_url: string | null;
  created_at: string;
}

interface UsageData {
  storage_bytes: number;
  ai_tokens_used: number;
}

interface UsageHistoryItem {
  month: string;
  month_label: string;
  ai_tokens_used: number;
  storage_bytes: number;
}

interface OrganizationDetailsViewProps {
  organization: Organization;
  onBack: () => void;
}

export function OrganizationDetailsView({ organization, onBack }: OrganizationDetailsViewProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [documents, setDocuments] = useState<OrgDocument[]>([]);
  const [usage, setUsage] = useState<UsageData>({ storage_bytes: 0, ai_tokens_used: 0 });
  const [usageHistory, setUsageHistory] = useState<UsageHistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [settings, setSettings] = useState({
    ai_enabled: organization.ai_enabled,
    name: organization.name,
    email: organization.email,
    phone: organization.phone || "",
    inn: organization.inn || "",
    contact_name: organization.contact_name || "",
    storage_limit_bytes: organization.storage_limit_bytes || 1073741824,
    ai_tokens_limit: organization.ai_tokens_limit || 100000,
    notify_on_limit_80: organization.notify_on_limit_80 ?? true,
    notify_on_limit_exceeded: organization.notify_on_limit_exceeded ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Calculate limit warnings
  const storageLimitPercent = (usage.storage_bytes / settings.storage_limit_bytes) * 100;
  const tokensLimitPercent = (usage.ai_tokens_used / settings.ai_tokens_limit) * 100;
  const isStorageWarning = storageLimitPercent >= 80;
  const isStorageExceeded = storageLimitPercent >= 100;
  const isTokensWarning = tokensLimitPercent >= 80;
  const isTokensExceeded = tokensLimitPercent >= 100;

  // Stats
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalCourses: 0,
    completedEnrollments: 0,
    averageProgress: 0,
  });

  useEffect(() => {
    fetchAllData();
  }, [organization.id]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchStudents(),
        fetchCourses(),
        fetchDocuments(),
        fetchUsage(),
        fetchUsageHistory(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      // Get all profiles for this organization - admin has access via RLS
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, login")
        .eq("organization_id", organization.id);

      if (error) {
        console.error("Error fetching students:", error);
        return;
      }

      console.log("Fetched profiles for org:", organization.id, profiles);

      if (!profiles || profiles.length === 0) {
        setStudents([]);
        setStats(prev => ({ ...prev, totalStudents: 0 }));
        return;
      }

      // Get courses for this organization first
      const { data: orgCourses } = await supabase
        .from("courses")
        .select("id, title")
        .eq("organization_id", organization.id);

      const courseIds = (orgCourses || []).map(c => c.id);
      const coursesMap: Record<string, string> = Object.fromEntries(
        (orgCourses || []).map(c => [c.id, c.title])
      );

      // Get enrollments for these courses
      let enrollments: any[] = [];
      if (courseIds.length > 0) {
        const { data: enrollmentsData, error: enrollError } = await supabase
          .from("enrollments")
          .select("user_id, course_id, progress, status, started_at")
          .in("course_id", courseIds);

        if (enrollError) {
          console.error("Error fetching enrollments:", enrollError);
        } else {
          enrollments = enrollmentsData || [];
        }
      }

      // Combine data
      const studentsWithEnrollments = profiles.map(profile => ({
        ...profile,
        enrollments: enrollments
          .filter(e => e.user_id === profile.user_id)
          .map(e => ({
            course_title: coursesMap[e.course_id] || "Неизвестный курс",
            progress: e.progress,
            status: e.status,
            started_at: e.started_at,
          })),
      }));

      setStudents(studentsWithEnrollments);

      // Calculate stats
      const totalEnrollments = enrollments.length;
      const completedEnrollments = enrollments.filter(e => e.status === "completed").length;
      const avgProgress = totalEnrollments > 0
        ? enrollments.reduce((sum, e) => sum + (e.progress || 0), 0) / totalEnrollments
        : 0;

      setStats(prev => ({
        ...prev,
        totalStudents: profiles.length,
        completedEnrollments,
        averageProgress: Math.round(avgProgress),
      }));
    } catch (err) {
      console.error("Error in fetchStudents:", err);
    }
  };

  const fetchCourses = async () => {
    const { data: coursesData, error } = await supabase
      .from("courses")
      .select("id, title, is_published")
      .eq("organization_id", organization.id);

    if (error) {
      console.error("Error fetching courses:", error);
      return;
    }

    // Get lessons count and students count for each course
    const coursesWithStats = await Promise.all(
      (coursesData || []).map(async (course) => {
        const [lessonsResult, enrollmentsResult] = await Promise.all([
          supabase.from("lessons").select("id", { count: "exact" }).eq("course_id", course.id),
          supabase.from("enrollments").select("id", { count: "exact" }).eq("course_id", course.id),
        ]);

        return {
          ...course,
          lessons_count: lessonsResult.count || 0,
          students_count: enrollmentsResult.count || 0,
        };
      })
    );

    setCourses(coursesWithStats);
    setStats(prev => ({ ...prev, totalCourses: coursesData?.length || 0 }));
  };

  const fetchDocuments = async () => {
    const { data, error } = await supabase
      .from("org_documents")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching documents:", error);
      return;
    }

    setDocuments(data || []);
  };

  const fetchUsage = async () => {
    // Get current month usage
    const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
    
    const { data, error } = await supabase
      .from("organization_usage")
      .select("storage_bytes, ai_tokens_used")
      .eq("organization_id", organization.id)
      .eq("month_start", currentMonth)
      .maybeSingle();

    if (error) {
      console.error("Error fetching usage:", error);
    }

    if (data) {
      setUsage(data);
    } else {
      // Calculate storage from documents
      const { data: docsData } = await supabase
        .from("org_documents")
        .select("file_url")
        .eq("organization_id", organization.id);

      // Estimate storage (we'll track this more accurately later)
      const totalDocs = docsData?.length || 0;
      const estimatedBytes = totalDocs * 500 * 1024; // Estimate 500KB per doc

      setUsage({
        storage_bytes: estimatedBytes,
        ai_tokens_used: 0,
      });
    }
  };

  const fetchUsageHistory = async () => {
    // Get last 6 months of usage
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const startDate = sixMonthsAgo.toISOString().slice(0, 7) + "-01";

    const { data, error } = await supabase
      .from("organization_usage")
      .select("month_start, ai_tokens_used, storage_bytes")
      .eq("organization_id", organization.id)
      .gte("month_start", startDate)
      .order("month_start", { ascending: true });

    if (error) {
      console.error("Error fetching usage history:", error);
      return;
    }

    // Generate all months in range
    const months: UsageHistoryItem[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = date.toISOString().slice(0, 10);
      const existingData = data?.find(d => d.month_start === monthStr);
      
      months.push({
        month: monthStr,
        month_label: format(date, "MMM yy", { locale: ru }),
        ai_tokens_used: existingData?.ai_tokens_used || 0,
        storage_bytes: existingData?.storage_bytes || 0,
      });
    }

    setUsageHistory(months);
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          name: settings.name,
          email: settings.email,
          phone: settings.phone || null,
          inn: settings.inn || null,
          contact_name: settings.contact_name || null,
          ai_enabled: settings.ai_enabled,
          storage_limit_bytes: settings.storage_limit_bytes,
          ai_tokens_limit: settings.ai_tokens_limit,
          notify_on_limit_80: settings.notify_on_limit_80,
          notify_on_limit_exceeded: settings.notify_on_limit_exceeded,
        })
        .eq("id", organization.id);

      if (error) throw error;
      toast.success("Настройки сохранены");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Ошибка сохранения настроек");
    } finally {
      setIsSaving(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Б";
    const k = 1024;
    const sizes = ["Б", "КБ", "МБ", "ГБ"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000000) {
      return (tokens / 1000000).toFixed(2) + "M";
    } else if (tokens >= 1000) {
      return (tokens / 1000).toFixed(1) + "K";
    }
    return tokens.toString();
  };

  const filteredStudents = students.filter(s => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (s.full_name?.toLowerCase() || "").includes(query) ||
      (s.email?.toLowerCase() || "").includes(query) ||
      (s.login?.toLowerCase() || "").includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-display font-bold">{organization.name}</h2>
            <p className="text-muted-foreground">{organization.email}</p>
          </div>
        </div>
      </div>

      {/* Limit Warnings */}
      {(isStorageExceeded || isTokensExceeded) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Лимит превышен!</AlertTitle>
          <AlertDescription>
            {isStorageExceeded && "Лимит хранилища превышен. "}
            {isTokensExceeded && "Лимит ИИ токенов превышен. "}
            Увеличьте лимиты в настройках организации.
          </AlertDescription>
        </Alert>
      )}

      {!isStorageExceeded && !isTokensExceeded && (isStorageWarning || isTokensWarning) && (
        <Alert className="border-yellow-500 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <AlertTitle className="text-yellow-600">Приближение к лимиту</AlertTitle>
          <AlertDescription className="text-yellow-600">
            {isStorageWarning && `Хранилище: ${storageLimitPercent.toFixed(0)}% использовано. `}
            {isTokensWarning && `ИИ токены: ${tokensLimitPercent.toFixed(0)}% использовано. `}
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Users className="w-3 h-3" /> Учеников
            </CardDescription>
            <CardTitle className="text-2xl">{stats.totalStudents}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <BookOpen className="w-3 h-3" /> Курсов
            </CardDescription>
            <CardTitle className="text-2xl">{stats.totalCourses}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Завершено
            </CardDescription>
            <CardTitle className="text-2xl">{stats.completedEnrollments}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Средний прогресс
            </CardDescription>
            <CardTitle className="text-2xl">{stats.averageProgress}%</CardTitle>
          </CardHeader>
        </Card>
        <Card className={isStorageExceeded ? "border-destructive" : isStorageWarning ? "border-yellow-500" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <HardDrive className={`w-3 h-3 ${isStorageExceeded ? "text-destructive" : isStorageWarning ? "text-yellow-500" : ""}`} /> 
              Хранилище
              {isStorageExceeded && <AlertTriangle className="w-3 h-3 text-destructive" />}
            </CardDescription>
            <CardTitle className={`text-2xl ${isStorageExceeded ? "text-destructive" : isStorageWarning ? "text-yellow-600" : ""}`}>
              {formatBytes(usage.storage_bytes)}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              из {formatBytes(settings.storage_limit_bytes)}
            </p>
          </CardHeader>
        </Card>
        <Card className={isTokensExceeded ? "border-destructive" : isTokensWarning ? "border-yellow-500" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Sparkles className={`w-3 h-3 ${isTokensExceeded ? "text-destructive" : isTokensWarning ? "text-yellow-500" : ""}`} /> 
              ИИ токены
              {isTokensExceeded && <AlertTriangle className="w-3 h-3 text-destructive" />}
            </CardDescription>
            <CardTitle className={`text-2xl ${isTokensExceeded ? "text-destructive" : isTokensWarning ? "text-yellow-600" : ""}`}>
              {formatTokens(usage.ai_tokens_used)}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              из {formatTokens(settings.ai_tokens_limit)}
            </p>
          </CardHeader>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-2xl grid-cols-5">
          <TabsTrigger value="overview" className="flex items-center gap-1">
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">Обзор</span>
          </TabsTrigger>
          <TabsTrigger value="students" className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Ученики</span>
          </TabsTrigger>
          <TabsTrigger value="courses" className="flex items-center gap-1">
            <BookOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Курсы</span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-1">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Документы</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-1">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Настройки</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Usage Charts */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Использование ИИ токенов
                </CardTitle>
                <CardDescription>Последние 6 месяцев</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={usageHistory}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="month_label" 
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => formatTokens(value)}
                        className="text-muted-foreground"
                      />
                      <Tooltip 
                        formatter={(value: number) => [formatTokens(value), "Токены"]}
                        labelClassName="text-foreground"
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar 
                        dataKey="ai_tokens_used" 
                        fill="hsl(var(--primary))" 
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-primary" />
                  Использование хранилища
                </CardTitle>
                <CardDescription>Последние 6 месяцев</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={usageHistory}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="month_label" 
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => formatBytes(value)}
                        className="text-muted-foreground"
                      />
                      <Tooltip 
                        formatter={(value: number) => [formatBytes(value), "Хранилище"]}
                        labelClassName="text-foreground"
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="storage_bytes" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Recent Students */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Недавние ученики</CardTitle>
              </CardHeader>
              <CardContent>
                {students.slice(0, 5).map((student) => (
                  <div key={student.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium">{student.full_name || "Без имени"}</p>
                      <p className="text-sm text-muted-foreground">{student.email}</p>
                    </div>
                    <Badge variant="secondary">
                      {student.enrollments.length} курсов
                    </Badge>
                  </div>
                ))}
                {students.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">Нет учеников</p>
                )}
              </CardContent>
            </Card>

            {/* Recent Courses */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Курсы</CardTitle>
              </CardHeader>
              <CardContent>
                {courses.slice(0, 5).map((course) => (
                  <div key={course.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-muted-foreground" />
                      <p className="font-medium">{course.title}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={course.is_published ? "default" : "secondary"}>
                        {course.is_published ? "Опубликован" : "Черновик"}
                      </Badge>
                      <Badge variant="outline">{course.students_count} уч.</Badge>
                    </div>
                  </div>
                ))}
                {courses.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">Нет курсов</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Usage Limits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Использование ресурсов (текущий месяц)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Хранилище</span>
                    <span className="text-sm font-medium">{formatBytes(usage.storage_bytes)} / 1 ГБ</span>
                  </div>
                  <Progress value={(usage.storage_bytes / (1024 * 1024 * 1024)) * 100} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">ИИ токены (месяц)</span>
                    <span className="text-sm font-medium">{formatTokens(usage.ai_tokens_used)} / 100K</span>
                  </div>
                  <Progress value={(usage.ai_tokens_used / 100000) * 100} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Students Tab */}
        <TabsContent value="students" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск учеников..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Badge variant="outline" className="text-sm">
              Всего: {students.length}
            </Badge>
          </div>

          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ученик</TableHead>
                      <TableHead>Логин</TableHead>
                      <TableHead>Курсы</TableHead>
                      <TableHead>Прогресс</TableHead>
                      <TableHead>Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{student.full_name || "Без имени"}</p>
                            <p className="text-sm text-muted-foreground">{student.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {student.login || "—"}
                        </TableCell>
                        <TableCell>
                          {student.enrollments.length > 0 ? (
                            <div className="space-y-1">
                              {student.enrollments.slice(0, 2).map((e, i) => (
                                <Badge key={i} variant="secondary" className="text-xs mr-1">
                                  {e.course_title}
                                </Badge>
                              ))}
                              {student.enrollments.length > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{student.enrollments.length - 2}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Не записан</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {student.enrollments.length > 0 ? (
                            <div className="space-y-1">
                              {student.enrollments.slice(0, 2).map((e, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <Progress value={e.progress} className="h-1.5 w-16" />
                                  <span className="text-xs text-muted-foreground">{e.progress}%</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {student.enrollments.length > 0 ? (
                            <div className="space-y-1">
                              {student.enrollments.slice(0, 2).map((e, i) => (
                                <Badge
                                  key={i}
                                  variant={
                                    e.status === "completed" ? "default" :
                                    e.status === "in_progress" ? "secondary" : "outline"
                                  }
                                  className="text-xs"
                                >
                                  {e.status === "completed" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                                  {e.status === "in_progress" && <Clock className="w-3 h-3 mr-1" />}
                                  {e.status === "active" && <Clock className="w-3 h-3 mr-1" />}
                                  {e.status === "not_started" && <XCircle className="w-3 h-3 mr-1" />}
                                  {e.status === "completed" ? "Завершён" :
                                   e.status === "in_progress" || e.status === "active" ? "В процессе" : "Не начат"}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-xs">Не записан</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredStudents.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          {searchQuery ? "Ничего не найдено" : "Нет учеников в этой организации"}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Courses Tab */}
        <TabsContent value="courses" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Курс</TableHead>
                    <TableHead className="text-center">Уроков</TableHead>
                    <TableHead className="text-center">Учеников</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courses.map((course) => (
                    <TableRow key={course.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-primary" />
                          <span className="font-medium">{course.title}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{course.lessons_count}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{course.students_count}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={course.is_published ? "default" : "outline"}>
                          {course.is_published ? "Опубликован" : "Черновик"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {courses.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Нет курсов
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Дата</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{doc.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{doc.type}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(doc.created_at), "d MMM yyyy", { locale: ru })}
                      </TableCell>
                    </TableRow>
                  ))}
                  {documents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        Нет документов
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Настройки организации</CardTitle>
              <CardDescription>Управление параметрами организации</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Название организации</Label>
                  <Input
                    value={settings.name}
                    onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={settings.email}
                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Телефон</Label>
                  <Input
                    value={settings.phone}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>ИНН</Label>
                  <Input
                    value={settings.inn}
                    onChange={(e) => setSettings({ ...settings, inn: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Контактное лицо</Label>
                  <Input
                    value={settings.contact_name}
                    onChange={(e) => setSettings({ ...settings, contact_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="border-t pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>ИИ-помощник</Label>
                    <p className="text-sm text-muted-foreground">
                      Разрешить использование ИИ-помощника для учеников
                    </p>
                  </div>
                  <Switch
                    checked={settings.ai_enabled}
                    onCheckedChange={(checked) => setSettings({ ...settings, ai_enabled: checked })}
                  />
                </div>
              </div>

              <Button onClick={saveSettings} disabled={isSaving} className="w-full md:w-auto">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Сохранить настройки
              </Button>
            </CardContent>
          </Card>

          {/* Limits Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="w-5 h-5" />
                Лимиты ресурсов
              </CardTitle>
              <CardDescription>Установите ограничения на использование ресурсов организацией</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Лимит хранилища (ГБ)</Label>
                    <Input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={(settings.storage_limit_bytes / (1024 * 1024 * 1024)).toFixed(1)}
                      onChange={(e) => setSettings({ 
                        ...settings, 
                        storage_limit_bytes: Math.round(parseFloat(e.target.value || "1") * 1024 * 1024 * 1024)
                      })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Текущее использование: {formatBytes(usage.storage_bytes)} ({storageLimitPercent.toFixed(1)}%)
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Лимит ИИ токенов (в месяц)</Label>
                    <Input
                      type="number"
                      min="1000"
                      step="1000"
                      value={settings.ai_tokens_limit}
                      onChange={(e) => setSettings({ 
                        ...settings, 
                        ai_tokens_limit: parseInt(e.target.value || "100000")
                      })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Текущее использование: {formatTokens(usage.ai_tokens_used)} ({tokensLimitPercent.toFixed(1)}%)
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6 space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Bell className="w-4 h-4" />
                  Уведомления
                </h4>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Предупреждение при 80%</Label>
                    <p className="text-sm text-muted-foreground">
                      Показывать предупреждение при достижении 80% лимита
                    </p>
                  </div>
                  <Switch
                    checked={settings.notify_on_limit_80}
                    onCheckedChange={(checked) => setSettings({ ...settings, notify_on_limit_80: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Уведомление о превышении</Label>
                    <p className="text-sm text-muted-foreground">
                      Показывать уведомление при превышении лимита
                    </p>
                  </div>
                  <Switch
                    checked={settings.notify_on_limit_exceeded}
                    onCheckedChange={(checked) => setSettings({ ...settings, notify_on_limit_exceeded: checked })}
                  />
                </div>
              </div>

              <Button onClick={saveSettings} disabled={isSaving} className="w-full md:w-auto">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Сохранить лимиты
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
