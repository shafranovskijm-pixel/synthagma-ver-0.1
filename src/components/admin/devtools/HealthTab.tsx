import { useState, useEffect } from "react";
import {
  Search, RefreshCw, CheckCircle2, Play, SkipForward, Terminal, Database, HardDrive, Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CODE_RECOMMENDATIONS, SEVERITY_CONFIG, CATEGORY_LABELS,
  type Recommendation, type RecSeverity, type RecStatus,
} from "./devToolsData";

type LiveMetric = {
  label: string;
  value: string;
  hint?: string;
  tone: "ok" | "warn" | "error" | "info";
};

const TONE_STYLES: Record<LiveMetric["tone"], string> = {
  ok: "border-emerald-500/20 bg-emerald-500/5 text-emerald-500",
  warn: "border-yellow-500/20 bg-yellow-500/5 text-yellow-500",
  error: "border-red-500/20 bg-red-500/5 text-red-500",
  info: "border-sky-500/20 bg-sky-500/5 text-sky-500",
};

const TABLES_TO_CHECK = [
  "enrollments", "lesson_progress", "test_attempts", "profiles",
  "audit_logs", "test_questions", "lessons", "courses",
  "organizations", "companies", "ai_usage_log",
] as const;

export function HealthTab() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>(CODE_RECOMMENDATIONS);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<LiveMetric[]>([]);

  const loadMetrics = async () => {
    const result: LiveMetric[] = [];

    // Per-table size summary
    const sizes = await Promise.all(
      TABLES_TO_CHECK.map(async (t) => {
        const { count } = await supabase.from(t as any).select("*", { count: "exact", head: true });
        return { table: t, count: count ?? 0 };
      })
    );

    const totalRows = sizes.reduce((s, x) => s + x.count, 0);
    const biggest = [...sizes].sort((a, b) => b.count - a.count).slice(0, 3);
    const empty = sizes.filter((s) => s.count === 0);

    result.push({
      label: "Всего записей в ключевых таблицах",
      value: totalRows.toLocaleString("ru-RU"),
      tone: totalRows > 100_000 ? "warn" : "ok",
      hint: `${TABLES_TO_CHECK.length} таблиц проверено`,
    });

    for (const b of biggest) {
      result.push({
        label: `Таблица ${b.table}`,
        value: b.count.toLocaleString("ru-RU") + " строк",
        tone: b.count > 10_000 ? "warn" : "info",
        hint: b.count > 10_000 ? "Нужны индексы и пагинация" : "В пределах нормы",
      });
    }

    if (empty.length > 0) {
      result.push({
        label: "Пустых таблиц",
        value: String(empty.length),
        tone: "info",
        hint: empty.map((e) => e.table).join(", "),
      });
    }

    // Last 24h activity
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ count: enrollments24h }, { count: completions24h }, { count: lessons24h }] = await Promise.all([
      supabase.from("enrollments").select("*", { count: "exact", head: true }).gte("started_at", since),
      supabase.from("enrollments").select("*", { count: "exact", head: true }).eq("status", "completed").gte("completed_at", since),
      supabase.from("lesson_progress").select("*", { count: "exact", head: true }).gte("updated_at", since),
    ]);

    result.push({
      label: "Зачислений за 24ч",
      value: String(enrollments24h ?? 0),
      tone: "ok",
    });
    result.push({
      label: "Завершений за 24ч",
      value: String(completions24h ?? 0),
      tone: "ok",
    });
    result.push({
      label: "Активность по урокам за 24ч",
      value: String(lessons24h ?? 0),
      tone: "ok",
    });

    setMetrics(result);
  };

  useEffect(() => {
    loadMetrics().catch(() => {});
  }, []);

  const runCheck = async () => {
    setChecking(true);
    try {
      await loadMetrics();

      const dbRecs: Recommendation[] = [];
      const sizes = await Promise.all(
        TABLES_TO_CHECK.map(async (t) => {
          const { count } = await supabase.from(t as any).select("*", { count: "exact", head: true });
          return { table: t, count: count ?? 0 };
        })
      );

      for (const { table, count } of sizes) {
        if (count > 10_000) {
          dbRecs.push({
            id: `large-table-${table}`, severity: "warn", category: "database",
            title: `Таблица "${table}" содержит ${count.toLocaleString("ru-RU")} записей`,
            detail: `Рекомендуется проверить индексы и добавить пагинацию в UI.`,
            actionable: false, status: "checked",
          });
        }
        if (count === 0) {
          dbRecs.push({
            id: `empty-table-${table}`, severity: "info", category: "database",
            title: `Таблица "${table}" пуста`,
            detail: `Проверьте, используется ли она.`,
            actionable: false, status: "checked",
          });
        }
      }

      const updatedCode = CODE_RECOMMENDATIONS.map((r) => ({
        ...r,
        status: r.status === "applied" ? ("applied" as RecStatus) : ("checked" as RecStatus),
      }));
      setRecommendations([...dbRecs, ...updatedCode]);
      setLastChecked(new Date().toLocaleTimeString("ru-RU"));
      toast.success(`Проверка завершена: ${dbRecs.length + updatedCode.length} рекомендаций`);
    } catch (e: any) {
      toast.error(`Ошибка проверки: ${e?.message ?? "unknown"}`);
    } finally {
      setChecking(false);
    }
  };

  const applyRecommendation = (id: string) => {
    setRecommendations((prev) => prev.map((r) => (r.id === id ? { ...r, status: "applied" as RecStatus } : r)));
    toast.info("Рекомендация помечена как применённая.");
  };

  const skipRecommendation = (id: string) => {
    setRecommendations((prev) => prev.map((r) => (r.id === id ? { ...r, status: "skipped" as RecStatus } : r)));
  };

  const errorCount = recommendations.filter((r) => r.severity === "error" && r.status !== "skipped" && r.status !== "applied").length;
  const warnCount = recommendations.filter((r) => r.severity === "warn" && r.status !== "skipped" && r.status !== "applied").length;
  const appliedCount = recommendations.filter((r) => r.status === "applied").length;

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground font-mono">
          {lastChecked ? `Проверено: ${lastChecked}` : "Метрики загружены при открытии"}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={runCheck} disabled={checking} className="gap-2 rounded-xl">
            {checking ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            Перепроверить
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={recommendations.every((r) => r.status === "unchecked" || r.status === "applied" || r.status === "skipped")}
            onClick={() => {
              const actionable = recommendations.filter((r) => r.actionable && r.status === "checked");
              if (actionable.length === 0) {
                toast.info("Нет автоматически применимых рекомендаций.");
                return;
              }
              actionable.forEach((r) => applyRecommendation(r.id));
              toast.success(`${actionable.length} рекомендаций помечены для применения`);
            }}
            className="gap-2 rounded-xl"
          >
            <Play className="w-3 h-3" />
            Применить
          </Button>
        </div>
      </div>

      {/* Live DB metrics */}
      <div>
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wider">
          <Activity className="w-3 h-3" /> Живые метрики БД
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {metrics.length === 0 && (
            <div className="col-span-full text-xs text-muted-foreground font-mono p-3 border border-dashed rounded-xl">
              Загрузка метрик…
            </div>
          )}
          {metrics.map((m, i) => (
            <div key={i} className={`rounded-xl border p-3 ${TONE_STYLES[m.tone]}`}>
              <div className="text-xs opacity-70">{m.label}</div>
              <div className="font-mono text-lg font-bold mt-1">{m.value}</div>
              {m.hint && <div className="text-[10px] opacity-60 mt-1 line-clamp-2">{m.hint}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-center">
          <div className="text-2xl font-mono font-bold text-red-500">{errorCount}</div>
          <div className="text-xs text-muted-foreground">Критичных</div>
        </div>
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 text-center">
          <div className="text-2xl font-mono font-bold text-yellow-500">{warnCount}</div>
          <div className="text-xs text-muted-foreground">Предупреждений</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
          <div className="text-2xl font-mono font-bold text-emerald-500">{appliedCount}</div>
          <div className="text-xs text-muted-foreground">Применено</div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="space-y-2">
        {(["error", "warn", "info"] as RecSeverity[]).map((sev) => {
          const items = recommendations.filter((r) => r.severity === sev && r.status !== "skipped");
          if (items.length === 0) return null;
          return (
            <div key={sev} className="space-y-2">
              <div className={`text-xs font-medium uppercase tracking-wider ${SEVERITY_CONFIG[sev].color} px-1`}>
                {SEVERITY_CONFIG[sev].label} ({items.length})
              </div>
              {items.map((rec) => {
                const cfg = SEVERITY_CONFIG[rec.severity];
                return (
                  <div key={rec.id} className={`rounded-xl border p-4 ${cfg.border} ${cfg.bg} ${rec.status === "applied" ? "opacity-60" : ""}`}>
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 shrink-0 ${cfg.color}`}>{cfg.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{rec.title}</span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">{CATEGORY_LABELS[rec.category]}</Badge>
                          {rec.status === "checked" && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Проверено</Badge>}
                          {rec.status === "applied" && <Badge className="text-[10px] h-4 px-1.5 bg-emerald-500">Применено</Badge>}
                          {rec.actionable && rec.status !== "applied" && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-primary/40 text-primary">Автоматизируемо</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1.5">{rec.detail}</div>
                      </div>
                      {rec.status === "checked" && (
                        <div className="flex items-center gap-1 shrink-0">
                          {rec.actionable && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => applyRecommendation(rec.id)} title="Применить">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => skipRecommendation(rec.id)} title="Пропустить">
                            <SkipForward className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Architecture overview */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          Архитектура проекта
        </h4>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="bg-secondary/30 rounded-lg p-3">
            <div className="text-muted-foreground mb-1 flex items-center gap-1"><Database className="w-3 h-3" /> Frontend</div>
            <div>React 18 + Vite</div>
            <div>TypeScript + Tailwind</div>
            <div>TanStack Query</div>
          </div>
          <div className="bg-secondary/30 rounded-lg p-3">
            <div className="text-muted-foreground mb-1 flex items-center gap-1"><Database className="w-3 h-3" /> Backend</div>
            <div>PostgreSQL</div>
            <div>Edge Functions (Deno)</div>
            <div>RLS + Row Security</div>
          </div>
          <div className="bg-secondary/30 rounded-lg p-3">
            <div className="text-muted-foreground mb-1 flex items-center gap-1"><HardDrive className="w-3 h-3" /> Storage</div>
            <div>Supabase + Kinescope</div>
            <div>Лимиты по тарифу</div>
            <div>Защита от листинга</div>
          </div>
          <div className="bg-secondary/30 rounded-lg p-3">
            <div className="text-muted-foreground mb-1 flex items-center gap-1"><Activity className="w-3 h-3" /> Resilience</div>
            <div>safeInvoke (exp. backoff)</div>
            <div>fetchAllRows (chunking)</div>
            <div>manualChunks split</div>
          </div>
        </div>
      </div>
    </div>
  );
}
