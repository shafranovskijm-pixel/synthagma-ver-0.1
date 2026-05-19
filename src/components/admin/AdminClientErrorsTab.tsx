import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Activity, AlertCircle, Globe, RefreshCw, Search } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

type Row = {
  id: string;
  occurred_at: string;
  method: string | null;
  url_host: string | null;
  url_path: string | null;
  status: number | null;
  error_kind: string;
  error_message: string | null;
  response_snippet: string | null;
  response_content_type: string | null;
  duration_ms: number | null;
  user_id: string | null;
  organization_id: string | null;
  page_url: string | null;
  page_route: string | null;
  user_agent: string | null;
  proxy_used: boolean;
  app_version: string | null;
  client_ip: string | null;
  occurrence_count: number;
};

const ERROR_KIND_LABELS: Record<string, { label: string; color: string }> = {
  http_4xx: { label: "4xx", color: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300" },
  http_5xx: { label: "5xx", color: "bg-red-500/20 text-red-700 dark:text-red-300" },
  cors_error: { label: "CORS", color: "bg-orange-500/20 text-orange-700 dark:text-orange-300" },
  network_error: { label: "Сеть", color: "bg-rose-500/20 text-rose-700 dark:text-rose-300" },
  timeout: { label: "Таймаут", color: "bg-amber-500/20 text-amber-700 dark:text-amber-300" },
  aborted: { label: "Отменено", color: "bg-muted text-muted-foreground" },
  unknown: { label: "Прочее", color: "bg-muted text-muted-foreground" },
};

export function AdminClientErrorsTab() {
  const [period, setPeriod] = useState<"24h" | "7d" | "30d">("24h");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [hostFilter, setHostFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);

  const since = useMemo(() => {
    const now = new Date();
    const map = { "24h": 1, "7d": 7, "30d": 30 } as const;
    const d = new Date(now);
    d.setDate(now.getDate() - map[period]);
    return d.toISOString();
  }, [period]);

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["client-error-logs", period, kindFilter, hostFilter],
    queryFn: async () => {
      let q = supabase
        .from("client_error_logs")
        .select("*")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (kindFilter !== "all") q = q.eq("error_kind", kindFilter);
      if (hostFilter !== "all") q = q.eq("url_host", hostFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.url_path?.toLowerCase().includes(s) ||
        r.url_host?.toLowerCase().includes(s) ||
        r.error_message?.toLowerCase().includes(s)
    );
  }, [rows, search]);

  const hosts = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.url_host && set.add(r.url_host));
    return Array.from(set).sort();
  }, [rows]);

  const stats = useMemo(() => {
    const total = rows.reduce((a, r) => a + (r.occurrence_count || 1), 0);
    const users = new Set(rows.filter((r) => r.user_id).map((r) => r.user_id)).size;
    const topPath = rows.reduce<Record<string, number>>((acc, r) => {
      const k = `${r.url_host || ""}${r.url_path || ""}`;
      acc[k] = (acc[k] || 0) + (r.occurrence_count || 1);
      return acc;
    }, {});
    const topEntry = Object.entries(topPath).sort((a, b) => b[1] - a[1])[0];
    return { total, users, topEndpoint: topEntry?.[0] || "—", topCount: topEntry?.[1] || 0 };
  }, [rows]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" /> Ошибки клиентов
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Автоматический сбор сетевых ошибок (CORS, 4xx/5xx, сбои сети) со всех устройств. Хранятся 30 дней.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Обновить
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Всего ошибок</div>
          <div className="text-3xl font-semibold mt-1">{stats.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Уникальных пользователей</div>
          <div className="text-3xl font-semibold mt-1">{stats.users}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Топ-endpoint ({stats.topCount})</div>
          <div className="text-sm font-mono mt-1 truncate" title={stats.topEndpoint}>
            {stats.topEndpoint}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24 часа</SelectItem>
              <SelectItem value="7d">7 дней</SelectItem>
              <SelectItem value="30d">30 дней</SelectItem>
            </SelectContent>
          </Select>

          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Тип ошибки" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {Object.entries(ERROR_KIND_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={hostFilter} onValueChange={setHostFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Хост" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все хосты</SelectItem>
              {hosts.map((h) => (
                <SelectItem key={h} value={h}>{h}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по URL / тексту ошибки"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-medium">Время</th>
                <th className="text-left p-3 font-medium">Тип</th>
                <th className="text-left p-3 font-medium">Статус</th>
                <th className="text-left p-3 font-medium">URL</th>
                <th className="text-left p-3 font-medium">Ошибка</th>
                <th className="text-left p-3 font-medium">×</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Загрузка…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-muted-foreground">
                    <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    Ошибок за выбранный период не зафиксировано.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const meta = ERROR_KIND_LABELS[r.error_kind] || ERROR_KIND_LABELS.unknown;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className="border-t border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <td className="p-3 whitespace-nowrap text-muted-foreground">
                        {format(new Date(r.occurred_at), "dd.MM HH:mm:ss", { locale: ru })}
                      </td>
                      <td className="p-3">
                        <Badge className={meta.color + " border-none"}>{meta.label}</Badge>
                      </td>
                      <td className="p-3 font-mono">{r.status ?? "—"}</td>
                      <td className="p-3 max-w-[420px] truncate font-mono text-xs" title={`${r.method} ${r.url_host}${r.url_path}`}>
                        <span className="text-muted-foreground mr-1">{r.method}</span>
                        <span className="text-muted-foreground">{r.url_host}</span>
                        <span>{r.url_path}</span>
                      </td>
                      <td className="p-3 max-w-[260px] truncate text-muted-foreground" title={r.error_message || ""}>
                        {r.error_message || "—"}
                      </td>
                      <td className="p-3 text-muted-foreground">{r.occurrence_count > 1 ? `×${r.occurrence_count}` : ""}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" /> Детали ошибки
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <Section label="Время">
                  {format(new Date(selected.occurred_at), "dd.MM.yyyy HH:mm:ss", { locale: ru })}
                </Section>
                <Section label="Тип / статус">
                  <Badge className={(ERROR_KIND_LABELS[selected.error_kind] || ERROR_KIND_LABELS.unknown).color + " border-none"}>
                    {(ERROR_KIND_LABELS[selected.error_kind] || ERROR_KIND_LABELS.unknown).label}
                  </Badge>{" "}
                  <span className="font-mono">{selected.status ?? "—"}</span>
                </Section>
                <Section label="Запрос">
                  <div className="font-mono text-xs break-all">
                    {selected.method} {selected.url_host}{selected.url_path}
                  </div>
                </Section>
                <Section label="Длительность">
                  {selected.duration_ms != null ? `${selected.duration_ms} мс` : "—"}
                </Section>
                <Section label="Через прокси">
                  {selected.proxy_used ? "Да" : "Нет"}
                </Section>
                <Section label="Страница">
                  <div className="font-mono text-xs break-all">{selected.page_url || "—"}</div>
                </Section>
                <Section label="Пользователь">
                  <div className="font-mono text-xs">{selected.user_id || "анонимный"}</div>
                </Section>
                <Section label="Организация">
                  <div className="font-mono text-xs">{selected.organization_id || "—"}</div>
                </Section>
                <Section label="User-Agent">
                  <div className="text-xs text-muted-foreground break-words">{selected.user_agent || "—"}</div>
                </Section>
                <Section label="IP клиента">
                  <div className="font-mono text-xs">{selected.client_ip || "—"}</div>
                </Section>
                <Section label="Версия клиента">
                  <div className="font-mono text-xs">{selected.app_version || "—"}</div>
                </Section>
                {selected.error_message && (
                  <Section label="Сообщение ошибки">
                    <pre className="text-xs bg-muted/50 p-3 rounded whitespace-pre-wrap break-words">
                      {selected.error_message}
                    </pre>
                  </Section>
                )}
                {selected.response_snippet && (
                  <Section label={`Response (${selected.response_content_type || "?"})`}>
                    <pre className="text-xs bg-muted/50 p-3 rounded whitespace-pre-wrap break-words max-h-64 overflow-auto">
                      {selected.response_snippet}
                    </pre>
                  </Section>
                )}
                {selected.occurrence_count > 1 && (
                  <Section label="Повторов в окне 10с">
                    ×{selected.occurrence_count}
                  </Section>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}
