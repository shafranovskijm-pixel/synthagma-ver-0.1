import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow } from "@/components/ui/table";
import {
  Search,
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  Eye,
  Download,
  LogIn,
  LogOut,
  History,
  Clock,
  User,
  FileText,
  BookOpen,
  Users,
  Building2,
  GraduationCap,
  Link,
  Settings } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

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
  user_agent: string | null;
}

interface OrgAuditLogsTabProps {
  organizationId: string;
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  create: Plus,
  update: Edit,
  delete: Trash2,
  view: Eye,
  export: Download,
  login: LogIn,
  logout: LogOut };

const ACTION_LABELS: Record<string, string> = {
  create: "Создание",
  update: "Изменение",
  delete: "Удаление",
  view: "Просмотр",
  export: "Экспорт",
  login: "Вход",
  logout: "Выход" };

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-500/10 text-green-600 border-green-500/20",
  update: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  delete: "bg-red-500/10 text-red-600 border-red-500/20",
  view: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  export: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  login: "bg-green-500/10 text-green-600 border-green-500/20",
  logout: "bg-orange-500/10 text-orange-600 border-orange-500/20" };

const ENTITY_ICONS: Record<string, React.ElementType> = {
  student: Users,
  course: BookOpen,
  enrollment: GraduationCap,
  document: FileText,
  company: Building2,
  link: Link,
  settings: Settings,
  user: User };

const ENTITY_LABELS: Record<string, string> = {
  student: "Ученик",
  course: "Курс",
  enrollment: "Зачисление",
  document: "Документ",
  company: "Компания",
  link: "Ссылка",
  settings: "Настройки",
  user: "Пользователь",
  category: "Категория",
  lesson: "Урок",
  journal: "Журнал",
  consent: "Согласие",
  library: "Библиотека" };

export function OrgAuditLogsTab({ organizationId }: OrgAuditLogsTabProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<"7" | "30" | "90" | "365" | "all">("30");

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, dateRange]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(2000);

      if (dateRange !== "all") {
        const days = parseInt(dateRange, 10);
        const since = new Date();
        since.setDate(since.getDate() - days);
        query = query.gte("created_at", since.toISOString());
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error loading audit logs:", error);
        return;
      }
      setLogs(data || []);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      !searchQuery ||
      log.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entity_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entity_type.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAction = actionFilter === "all" || log.action_type === actionFilter;
    const matchesEntity = entityFilter === "all" || log.entity_type === entityFilter;
    const matchesUser = userFilter === "all" || log.user_id === userFilter;

    return matchesSearch && matchesAction && matchesEntity && matchesUser;
  });

  const entityTypes = [...new Set(logs.map((l) => l.entity_type))];
  const actionTypes = [...new Set(logs.map((l) => l.action_type))];
  const users = Array.from(
    new Map(logs.map((l) => [l.user_id, { id: l.user_id, name: l.user_name || "Неизвестный" }])).values(),
  );

  // Stats
  const todayLogs = logs.filter(
    (l) => new Date(l.created_at).toDateString() === new Date().toDateString()
  ).length;
  const weekLogs = logs.filter((l) => {
    const logDate = new Date(l.created_at);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return logDate >= weekAgo;
  }).length;

  const exportCsv = () => {
    const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Дата", "Пользователь", "Действие", "Тип объекта", "Объект", "ID объекта"];
    const rows = filteredLogs.map((l) => [
      format(new Date(l.created_at), "dd.MM.yyyy HH:mm:ss", { locale: ru }),
      l.user_name || "",
      ACTION_LABELS[l.action_type] || l.action_type,
      ENTITY_LABELS[l.entity_type] || l.entity_type,
      l.entity_name || "",
      l.entity_id || "",
    ]);
    const csv = [header, ...rows].map((r) => r.map(escape).join(";")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ActionIcon = ({ type }: { type: string }) => {
    const Icon = ACTION_ICONS[type] || History;
    return <Icon className="w-4 h-4" />;
  };

  const EntityIcon = ({ type }: { type: string }) => {
    const Icon = ENTITY_ICONS[type] || FileText;
    return <Icon className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <History className="w-3 h-3" /> Всего записей
            </CardDescription>
            <CardTitle className="text-2xl">{logs.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> Сегодня
            </CardDescription>
            <CardTitle className="text-2xl">{todayLogs}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> За неделю
            </CardDescription>
            <CardTitle className="text-2xl">{weekLogs}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Users className="w-3 h-3" /> Типов событий
            </CardDescription>
            <CardTitle className="text-2xl">{entityTypes.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Logs Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                История действий
              </CardTitle>
              <CardDescription>
                {dateRange === "all"
                  ? "Все записи активности организации"
                  : `Активность за последние ${dateRange === "7" ? "7 дней" : dateRange === "30" ? "30 дней" : dateRange === "90" ? "90 дней" : "365 дней"}`}
                {" — показано "}{filteredLogs.length} из {logs.length}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filteredLogs.length}>
                <Download className="w-4 h-4 mr-2" />
                Экспорт CSV
              </Button>
              <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Обновить
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по пользователю или объекту..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Период" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">За 7 дней</SelectItem>
                  <SelectItem value="30">За 30 дней</SelectItem>
                  <SelectItem value="90">За 90 дней</SelectItem>
                  <SelectItem value="365">За год</SelectItem>
                  <SelectItem value="all">Всё время</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Тип действия" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все действия</SelectItem>
                  {actionTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {ACTION_LABELS[type] || type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Тип объекта" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все объекты</SelectItem>
                  {entityTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {ENTITY_LABELS[type] || type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Пользователь" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все пользователи</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Logs Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <SigmaSpinner size="lg" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Нет записей для отображения</p>
              <p className="text-sm">История действий появится после первых активностей</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
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
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          {format(new Date(log.created_at), "dd.MM.yyyy HH:mm", {
                            locale: ru })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">
                            {log.user_name || "Неизвестный"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`${ACTION_COLORS[log.action_type] || ""} gap-1`}
                        >
                          <ActionIcon type={log.action_type} />
                          {ACTION_LABELS[log.action_type] || log.action_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <EntityIcon type={log.entity_type} />
                          <span className="text-muted-foreground">
                            {ENTITY_LABELS[log.entity_type] || log.entity_type}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.entity_name || (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
