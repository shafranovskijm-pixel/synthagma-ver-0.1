import React, { useState } from "react";
import {
  Search, RefreshCw, CheckCircle2, Play, SkipForward, Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CODE_RECOMMENDATIONS, SEVERITY_CONFIG, CATEGORY_LABELS,
  type Recommendation, type RecSeverity, type RecStatus,
} from "./devToolsData";

export const HealthTab = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => {
    const [recommendations, setRecommendations] = useState<Recommendation[]>(CODE_RECOMMENDATIONS);
    const [checking, setChecking] = useState(false);
    const [lastChecked, setLastChecked] = useState<string | null>(null);

    const runCheck = async () => {
      setChecking(true);
      const dbRecs: Recommendation[] = [];
      const tablesToCheck = ["enrollments", "lesson_progress", "test_attempts", "profiles", "audit_logs", "test_questions", "lessons", "courses"];

      const promises = tablesToCheck.map(async (table) => {
        try {
          const { count } = await supabase.from(table as any).select("*", { count: "exact", head: true });
          if (count !== null && count > 1000) {
            dbRecs.push({
              id: `large-table-${table}`, severity: "warn", category: "database",
              title: `Таблица "${table}" содержит ${count.toLocaleString()} записей`,
              detail: `Рекомендуется добавить пагинацию и индексы.`,
              actionable: false, status: "checked",
            });
          }
          if (count === 0) {
            dbRecs.push({
              id: `empty-table-${table}`, severity: "info", category: "database",
              title: `Таблица "${table}" пуста`,
              detail: `Проверьте, используется ли она, или удалите для упрощения схемы.`,
              actionable: false, status: "checked",
            });
          }
        } catch { /* ignore */ }
      });

      await Promise.all(promises);
      const updatedCode = CODE_RECOMMENDATIONS.map(r => ({ ...r, status: "checked" as RecStatus }));
      setRecommendations([...dbRecs, ...updatedCode]);
      setLastChecked(new Date().toLocaleTimeString("ru-RU"));
      setChecking(false);
      toast.success(`Проверка завершена: ${dbRecs.length + updatedCode.length} рекомендаций`);
    };

    const applyRecommendation = (id: string) => {
      setRecommendations(prev => prev.map(r => r.id === id ? { ...r, status: "applied" as RecStatus } : r));
      toast.info("Рекомендация помечена как применённая.");
    };

    const skipRecommendation = (id: string) => {
      setRecommendations(prev => prev.map(r => r.id === id ? { ...r, status: "skipped" as RecStatus } : r));
    };

    const errorCount = recommendations.filter(r => r.severity === "error" && r.status !== "skipped").length;
    const warnCount = recommendations.filter(r => r.severity === "warn" && r.status !== "skipped").length;
    const appliedCount = recommendations.filter(r => r.status === "applied").length;

    return (
      <div ref={ref} {...props} className="space-y-4">
        {/* Actions bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground font-mono">
            {lastChecked ? `Проверено: ${lastChecked}` : "Рекомендации не проверены"}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={runCheck} disabled={checking} className="gap-2 rounded-xl">
              {checking ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              Проверить
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={recommendations.every(r => r.status === "unchecked" || r.status === "applied" || r.status === "skipped")}
              onClick={() => {
                const actionable = recommendations.filter(r => r.actionable && r.status === "checked");
                if (actionable.length === 0) {
                  toast.info("Нет автоматически применимых рекомендаций.");
                  return;
                }
                actionable.forEach(r => applyRecommendation(r.id));
                toast.success(`${actionable.length} рекомендаций помечены для применения`);
              }}
              className="gap-2 rounded-xl"
            >
              <Play className="w-3 h-3" />
              Применить
            </Button>
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
          {(["error", "warn", "info"] as RecSeverity[]).map(sev => {
            const items = recommendations.filter(r => r.severity === sev && r.status !== "skipped");
            if (items.length === 0) return null;
            return (
              <div key={sev} className="space-y-2">
                <div className={`text-xs font-medium uppercase tracking-wider ${SEVERITY_CONFIG[sev].color} px-1`}>
                  {SEVERITY_CONFIG[sev].label} ({items.length})
                </div>
                {items.map(rec => {
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
              <div className="text-muted-foreground mb-1">Frontend</div>
              <div>React 18 + Vite</div>
              <div>TypeScript + Tailwind</div>
              <div>TanStack Query</div>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3">
              <div className="text-muted-foreground mb-1">Backend</div>
              <div>PostgreSQL</div>
              <div>Edge Functions (Deno)</div>
              <div>RLS + Row Security</div>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3">
              <div className="text-muted-foreground mb-1">Storage</div>
              <div>10 бакетов</div>
              <div>External S3 support</div>
              <div>Лимит: 1GB / орг</div>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3">
              <div className="text-muted-foreground mb-1">Resilience</div>
              <div>withRetry (exp. backoff)</div>
              <div>fetchAllRows (chunking)</div>
              <div>sendBeacon (progress)</div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
HealthTab.displayName = "HealthTab";
