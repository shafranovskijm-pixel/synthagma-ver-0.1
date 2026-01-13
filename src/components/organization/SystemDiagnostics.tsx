import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Database,
  Users,
  FileText,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Clock,
  User,
  Eye,
  Pencil,
  Trash2,
  Download,
  LogIn,
  HardDrive,
  Zap,
} from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { ru } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

interface SystemDiagnosticsProps {
  organizationId: string;
}

interface DiagnosticResult {
  id: string;
  checkType: string;
  checkName: string;
  status: "ok" | "warning" | "error";
  message: string;
  details?: Record<string, unknown>;
}

interface AuditLogEntry {
  id: string;
  user_id: string;
  user_name: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  details: unknown;
  created_at: string;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  create: <Pencil className="w-4 h-4 text-green-500" />,
  update: <Pencil className="w-4 h-4 text-blue-500" />,
  delete: <Trash2 className="w-4 h-4 text-red-500" />,
  view: <Eye className="w-4 h-4 text-muted-foreground" />,
  export: <Download className="w-4 h-4 text-purple-500" />,
  login: <LogIn className="w-4 h-4 text-green-600" />,
  logout: <LogIn className="w-4 h-4 text-orange-500" />,
};

const ACTION_LABELS: Record<string, string> = {
  create: "Создание",
  update: "Изменение",
  delete: "Удаление",
  view: "Просмотр",
  export: "Экспорт",
  login: "Вход",
  logout: "Выход",
};

export function SystemDiagnostics({ organizationId }: SystemDiagnosticsProps) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logActionFilter, setLogActionFilter] = useState("all");
  const [logEntityFilter, setLogEntityFilter] = useState("all");

  // Load audit logs
  useEffect(() => {
    loadAuditLogs();
  }, [organizationId]);

  const loadAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, user_id, user_name, action_type, entity_type, entity_id, entity_name, details, created_at")
        .eq("organization_id", organizationId)
        .gte("created_at", subDays(new Date(), 30).toISOString())
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      setAuditLogs(data || []);
    } catch (error) {
      console.error("Error loading audit logs:", error);
    } finally {
      setLoadingLogs(false);
    }
  };

  // Run all diagnostics
  const runDiagnostics = async () => {
    setRunning(true);
    setResults([]);

    const newResults: DiagnosticResult[] = [];

    try {
      // 1. Health check - Database connection
      newResults.push(await checkDatabaseConnection());

      // 2. Check data integrity - Profiles
      newResults.push(await checkProfilesIntegrity());

      // 3. Check enrollments integrity
      newResults.push(await checkEnrollmentsIntegrity());

      // 4. Check orphan documents
      newResults.push(await checkOrphanDocuments());

      // 5. Check courses integrity
      newResults.push(await checkCoursesIntegrity());

      // 6. Check education documents
      newResults.push(await checkEducationDocuments());

      // 7. Check duplicate records
      newResults.push(await checkDuplicateRecords());

      // 8. Check storage buckets
      newResults.push(await checkStorageBuckets());

      // Save results to database
      const recordsToInsert = newResults.map((r) => ({
        organization_id: organizationId,
        check_type: r.checkType,
        check_name: r.checkName,
        status: r.status,
        message: r.message,
        details: r.details ? JSON.parse(JSON.stringify(r.details)) : null,
      }));

      const { error } = await supabase.from("system_diagnostics").insert(recordsToInsert);

      if (error) console.error("Error saving diagnostics:", error);

      setResults(newResults);
      setLastRun(new Date());

      const errors = newResults.filter((r) => r.status === "error").length;
      const warnings = newResults.filter((r) => r.status === "warning").length;

      if (errors > 0) {
        toast.error(`Обнаружено ${errors} ошибок`);
      } else if (warnings > 0) {
        toast.warning(`Обнаружено ${warnings} предупреждений`);
      } else {
        toast.success("Все проверки пройдены успешно");
      }
    } catch (error) {
      console.error("Diagnostics error:", error);
      toast.error("Ошибка при выполнении диагностики");
    } finally {
      setRunning(false);
    }
  };

  // Individual check functions
  const checkDatabaseConnection = async (): Promise<DiagnosticResult> => {
    try {
      const start = Date.now();
      const { error } = await supabase.from("organizations").select("id").eq("id", organizationId).single();
      const latency = Date.now() - start;

      if (error) throw error;

      return {
        id: crypto.randomUUID(),
        checkType: "health",
        checkName: "Подключение к базе данных",
        status: latency > 1000 ? "warning" : "ok",
        message: latency > 1000 ? `Высокая задержка: ${latency}мс` : `Подключение активно (${latency}мс)`,
        details: { latency },
      };
    } catch (error) {
      return {
        id: crypto.randomUUID(),
        checkType: "health",
        checkName: "Подключение к базе данных",
        status: "error",
        message: "Ошибка подключения к базе данных",
        details: { error: String(error) },
      };
    }
  };

  const checkProfilesIntegrity = async (): Promise<DiagnosticResult> => {
    try {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email")
        .eq("organization_id", organizationId);

      if (error) throw error;

      const issues: string[] = [];
      const profilesWithoutName = profiles?.filter((p) => !p.full_name && !p.email) || [];
      
      if (profilesWithoutName.length > 0) {
        issues.push(`${profilesWithoutName.length} профилей без имени и email`);
      }

      return {
        id: crypto.randomUUID(),
        checkType: "data_integrity",
        checkName: "Целостность профилей",
        status: issues.length > 0 ? "warning" : "ok",
        message: issues.length > 0 ? issues.join("; ") : `Все ${profiles?.length || 0} профилей корректны`,
        details: { total: profiles?.length, issues },
      };
    } catch (error) {
      return {
        id: crypto.randomUUID(),
        checkType: "data_integrity",
        checkName: "Целостность профилей",
        status: "error",
        message: "Ошибка проверки профилей",
        details: { error: String(error) },
      };
    }
  };

  const checkEnrollmentsIntegrity = async (): Promise<DiagnosticResult> => {
    try {
      const { data: courses } = await supabase
        .from("courses")
        .select("id")
        .eq("organization_id", organizationId);

      if (!courses || courses.length === 0) {
        return {
          id: crypto.randomUUID(),
          checkType: "data_integrity",
          checkName: "Целостность записей на курсы",
          status: "ok",
          message: "Курсы отсутствуют",
        };
      }

      const courseIds = courses.map((c) => c.id);
      const { data: enrollments, error } = await supabase
        .from("enrollments")
        .select("id, user_id, course_id, status, completed_at")
        .in("course_id", courseIds);

      if (error) throw error;

      const issues: string[] = [];
      const completedWithoutDate = enrollments?.filter((e) => e.status === "completed" && !e.completed_at) || [];
      
      if (completedWithoutDate.length > 0) {
        issues.push(`${completedWithoutDate.length} завершённых без даты завершения`);
      }

      return {
        id: crypto.randomUUID(),
        checkType: "data_integrity",
        checkName: "Целостность записей на курсы",
        status: issues.length > 0 ? "warning" : "ok",
        message: issues.length > 0 ? issues.join("; ") : `Все ${enrollments?.length || 0} записей корректны`,
        details: { total: enrollments?.length, issues },
      };
    } catch (error) {
      return {
        id: crypto.randomUUID(),
        checkType: "data_integrity",
        checkName: "Целостность записей на курсы",
        status: "error",
        message: "Ошибка проверки записей",
        details: { error: String(error) },
      };
    }
  };

  const checkOrphanDocuments = async (): Promise<DiagnosticResult> => {
    try {
      const { data: documents, error } = await supabase
        .from("education_document_records")
        .select("id, enrollment_id")
        .eq("organization_id", organizationId)
        .not("enrollment_id", "is", null);

      if (error) throw error;

      if (!documents || documents.length === 0) {
        return {
          id: crypto.randomUUID(),
          checkType: "data_integrity",
          checkName: "Связи документов с записями",
          status: "ok",
          message: "Нет документов со связями",
        };
      }

      const enrollmentIds = documents.map((d) => d.enrollment_id).filter(Boolean);
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("id")
        .in("id", enrollmentIds);

      const existingIds = new Set(enrollments?.map((e) => e.id) || []);
      const orphans = documents.filter((d) => d.enrollment_id && !existingIds.has(d.enrollment_id));

      return {
        id: crypto.randomUUID(),
        checkType: "data_integrity",
        checkName: "Связи документов с записями",
        status: orphans.length > 0 ? "warning" : "ok",
        message: orphans.length > 0 
          ? `${orphans.length} документов ссылаются на удалённые записи` 
          : "Все связи корректны",
        details: { orphans: orphans.length },
      };
    } catch (error) {
      return {
        id: crypto.randomUUID(),
        checkType: "data_integrity",
        checkName: "Связи документов с записями",
        status: "error",
        message: "Ошибка проверки связей",
        details: { error: String(error) },
      };
    }
  };

  const checkCoursesIntegrity = async (): Promise<DiagnosticResult> => {
    try {
      const { data: courses, error } = await supabase
        .from("courses")
        .select("id, title, lessons(count)")
        .eq("organization_id", organizationId);

      if (error) throw error;

      const issues: string[] = [];
      const emptyCoursesCount = courses?.filter((c) => !c.lessons || (c.lessons as unknown as { count: number }[])[0]?.count === 0).length || 0;
      const noTitleCount = courses?.filter((c) => !c.title?.trim()).length || 0;

      if (emptyCoursesCount > 0) {
        issues.push(`${emptyCoursesCount} курсов без уроков`);
      }
      if (noTitleCount > 0) {
        issues.push(`${noTitleCount} курсов без названия`);
      }

      return {
        id: crypto.randomUUID(),
        checkType: "business_logic",
        checkName: "Структура курсов",
        status: issues.length > 0 ? "warning" : "ok",
        message: issues.length > 0 ? issues.join("; ") : `Все ${courses?.length || 0} курсов корректны`,
        details: { total: courses?.length, emptyCoursesCount, noTitleCount },
      };
    } catch (error) {
      return {
        id: crypto.randomUUID(),
        checkType: "business_logic",
        checkName: "Структура курсов",
        status: "error",
        message: "Ошибка проверки курсов",
        details: { error: String(error) },
      };
    }
  };

  const checkEducationDocuments = async (): Promise<DiagnosticResult> => {
    try {
      const { data: documents, error } = await supabase
        .from("education_document_records")
        .select("id, reg_number, document_number, full_name")
        .eq("organization_id", organizationId);

      if (error) throw error;

      const issues: string[] = [];
      const noRegNumber = documents?.filter((d) => !d.reg_number?.trim()).length || 0;
      const noDocNumber = documents?.filter((d) => !d.document_number?.trim()).length || 0;
      const noFullName = documents?.filter((d) => !d.full_name?.trim()).length || 0;

      if (noRegNumber > 0) issues.push(`${noRegNumber} без рег. номера`);
      if (noDocNumber > 0) issues.push(`${noDocNumber} без номера документа`);
      if (noFullName > 0) issues.push(`${noFullName} без ФИО`);

      return {
        id: crypto.randomUUID(),
        checkType: "business_logic",
        checkName: "Журнал документов об образовании",
        status: issues.length > 0 ? "error" : "ok",
        message: issues.length > 0 ? issues.join("; ") : `Все ${documents?.length || 0} записей корректны`,
        details: { total: documents?.length, issues },
      };
    } catch (error) {
      return {
        id: crypto.randomUUID(),
        checkType: "business_logic",
        checkName: "Журнал документов об образовании",
        status: "error",
        message: "Ошибка проверки журнала",
        details: { error: String(error) },
      };
    }
  };

  const checkDuplicateRecords = async (): Promise<DiagnosticResult> => {
    try {
      const { data: documents } = await supabase
        .from("education_document_records")
        .select("id, document_number")
        .eq("organization_id", organizationId);

      const docNumbers = documents?.map((d) => d.document_number) || [];
      const duplicates = docNumbers.filter((n, i) => docNumbers.indexOf(n) !== i);
      const uniqueDuplicates = [...new Set(duplicates)];

      return {
        id: crypto.randomUUID(),
        checkType: "data_integrity",
        checkName: "Дубликаты номеров документов",
        status: uniqueDuplicates.length > 0 ? "warning" : "ok",
        message: uniqueDuplicates.length > 0 
          ? `Найдено ${uniqueDuplicates.length} дублирующихся номеров` 
          : "Дубликаты не обнаружены",
        details: { duplicates: uniqueDuplicates },
      };
    } catch (error) {
      return {
        id: crypto.randomUUID(),
        checkType: "data_integrity",
        checkName: "Дубликаты номеров документов",
        status: "error",
        message: "Ошибка проверки дубликатов",
        details: { error: String(error) },
      };
    }
  };

  const checkStorageBuckets = async (): Promise<DiagnosticResult> => {
    try {
      const { data: buckets, error } = await supabase.storage.listBuckets();
      
      if (error) throw error;

      const requiredBuckets = ["course-files", "student-documents", "org-documents"];
      const existingBuckets = buckets?.map((b) => b.name) || [];
      const missingBuckets = requiredBuckets.filter((b) => !existingBuckets.includes(b));

      return {
        id: crypto.randomUUID(),
        checkType: "health",
        checkName: "Хранилище файлов",
        status: missingBuckets.length > 0 ? "warning" : "ok",
        message: missingBuckets.length > 0 
          ? `Отсутствуют бакеты: ${missingBuckets.join(", ")}` 
          : `Все ${requiredBuckets.length} бакетов доступны`,
        details: { existing: existingBuckets, missing: missingBuckets },
      };
    } catch (error) {
      return {
        id: crypto.randomUUID(),
        checkType: "health",
        checkName: "Хранилище файлов",
        status: "warning",
        message: "Не удалось проверить хранилище",
        details: { error: String(error) },
      };
    }
  };

  // Filter audit logs
  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      !logSearch ||
      log.user_name?.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.entity_name?.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.entity_type?.toLowerCase().includes(logSearch.toLowerCase());

    const matchesAction = logActionFilter === "all" || log.action_type === logActionFilter;
    const matchesEntity = logEntityFilter === "all" || log.entity_type === logEntityFilter;

    return matchesSearch && matchesAction && matchesEntity;
  });

  // Get unique entity types for filter
  const entityTypes = [...new Set(auditLogs.map((l) => l.entity_type))];

  // Stats
  const stats = {
    ok: results.filter((r) => r.status === "ok").length,
    warning: results.filter((r) => r.status === "warning").length,
    error: results.filter((r) => r.status === "error").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Самодиагностика системы
          </h2>
          <p className="text-sm text-muted-foreground">
            Проверка целостности данных, бизнес-логики и мониторинг действий
          </p>
        </div>
      </div>

      <Tabs defaultValue="diagnostics" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:inline-grid">
          <TabsTrigger value="diagnostics" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Диагностика
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Аудит действий
          </TabsTrigger>
        </TabsList>

        {/* Diagnostics Tab */}
        <TabsContent value="diagnostics" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Запуск проверок</CardTitle>
                  <CardDescription>
                    {lastRun
                      ? `Последний запуск: ${format(lastRun, "dd.MM.yyyy HH:mm", { locale: ru })}`
                      : "Проверки ещё не запускались"}
                  </CardDescription>
                </div>
                <Button onClick={runDiagnostics} disabled={running} className="rounded-xl">
                  {running ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Выполняется...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Запустить диагностику
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
          </Card>

          {results.length > 0 && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold text-green-700">{stats.ok}</p>
                      <p className="text-sm text-green-600">Успешно</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-yellow-200 bg-yellow-50/50 dark:bg-yellow-950/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertTriangle className="w-8 h-8 text-yellow-600" />
                    <div>
                      <p className="text-2xl font-bold text-yellow-700">{stats.warning}</p>
                      <p className="text-sm text-yellow-600">Предупреждения</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <XCircle className="w-8 h-8 text-red-600" />
                    <div>
                      <p className="text-2xl font-bold text-red-700">{stats.error}</p>
                      <p className="text-sm text-red-600">Ошибки</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Results list */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Результаты проверок</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {results.map((result) => (
                      <div
                        key={result.id}
                        className={`p-4 rounded-xl border ${
                          result.status === "ok"
                            ? "border-green-200 bg-green-50/50 dark:bg-green-950/20"
                            : result.status === "warning"
                            ? "border-yellow-200 bg-yellow-50/50 dark:bg-yellow-950/20"
                            : "border-red-200 bg-red-50/50 dark:bg-red-950/20"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {result.status === "ok" && <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />}
                          {result.status === "warning" && <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />}
                          {result.status === "error" && <XCircle className="w-5 h-5 text-red-600 mt-0.5" />}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{result.checkName}</span>
                              <Badge variant="outline" className="text-xs">
                                {result.checkType === "health" && "Health"}
                                {result.checkType === "data_integrity" && "Данные"}
                                {result.checkType === "business_logic" && "Логика"}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{result.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Журнал действий</CardTitle>
                  <CardDescription>История операций за последние 30 дней</CardDescription>
                </div>
                <Button variant="outline" onClick={loadAuditLogs} disabled={loadingLogs} className="rounded-xl">
                  {loadingLogs ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex flex-col md:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по пользователю или объекту..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="pl-9 rounded-xl"
                  />
                </div>
                <Select value={logActionFilter} onValueChange={setLogActionFilter}>
                  <SelectTrigger className="w-full md:w-40 rounded-xl">
                    <SelectValue placeholder="Действие" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все действия</SelectItem>
                    <SelectItem value="create">Создание</SelectItem>
                    <SelectItem value="update">Изменение</SelectItem>
                    <SelectItem value="delete">Удаление</SelectItem>
                    <SelectItem value="view">Просмотр</SelectItem>
                    <SelectItem value="export">Экспорт</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={logEntityFilter} onValueChange={setLogEntityFilter}>
                  <SelectTrigger className="w-full md:w-40 rounded-xl">
                    <SelectValue placeholder="Объект" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все объекты</SelectItem>
                    {entityTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Log entries */}
              {loadingLogs ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Записи в журнале отсутствуют</p>
                  <p className="text-sm">Действия пользователей будут отображаться здесь</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">Дата и время</TableHead>
                        <TableHead>Пользователь</TableHead>
                        <TableHead>Действие</TableHead>
                        <TableHead>Объект</TableHead>
                        <TableHead>Название</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-muted-foreground text-sm">
                            {format(parseISO(log.created_at), "dd.MM.yyyy HH:mm", { locale: ru })}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span className="truncate max-w-[150px]">{log.user_name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {ACTION_ICONS[log.action_type] || <Zap className="w-4 h-4" />}
                              <span>{ACTION_LABELS[log.action_type] || log.action_type}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{log.entity_type}</Badge>
                          </TableCell>
                          <TableCell className="truncate max-w-[200px]">
                            {log.entity_name || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
