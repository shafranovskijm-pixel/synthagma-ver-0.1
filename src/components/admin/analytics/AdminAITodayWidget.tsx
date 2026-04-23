import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Zap, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface TodayStats {
  generations: number;
  tokens: number;
  topOrgs: { name: string; count: number; tokens: number }[];
}

/**
 * Виджет «Активность ИИ за 24 часа» для админ-дашборда.
 * Показывает: всего генераций, израсходовано токенов, топ-3 организации по нагрузке.
 * Источник — таблица `ai_usage_log`.
 */
export function AdminAITodayWidget() {
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [logRes, orgsRes] = await Promise.all([
        supabase
          .from("ai_usage_log")
          .select("organization_id, tokens_used")
          .gte("created_at", since),
        supabase.from("organizations").select("id, name"),
      ]);

      if (cancelled) return;

      const log = logRes.data || [];
      const orgs = new Map((orgsRes.data || []).map((o) => [o.id, o.name]));

      const generations = log.length;
      const tokens = log.reduce((sum, r) => sum + (r.tokens_used || 0), 0);

      const byOrg = new Map<string, { count: number; tokens: number }>();
      for (const r of log) {
        const cur = byOrg.get(r.organization_id) || { count: 0, tokens: 0 };
        cur.count += 1;
        cur.tokens += r.tokens_used || 0;
        byOrg.set(r.organization_id, cur);
      }

      const topOrgs = Array.from(byOrg.entries())
        .map(([id, v]) => ({ name: orgs.get(id) || "—", count: v.count, tokens: v.tokens }))
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 3);

      setStats({ generations, tokens, topOrgs });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          ИИ-активность за 24 часа
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Генераций
                </div>
                <div className="text-2xl font-semibold tabular-nums mt-1">
                  {stats.generations.toLocaleString("ru-RU")}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Токенов
                </div>
                <div className="text-2xl font-semibold tabular-nums mt-1">
                  {stats.tokens.toLocaleString("ru-RU")}
                </div>
              </div>
            </div>

            {stats.topOrgs.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-2">Топ организаций по нагрузке</div>
                <div className="space-y-1.5">
                  {stats.topOrgs.map((o, i) => (
                    <div
                      key={o.name + i}
                      className="flex items-center justify-between text-sm rounded-md bg-muted/40 px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground tabular-nums w-4">
                          {i + 1}.
                        </span>
                        <span className="truncate">{o.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {o.count} ген. · {o.tokens.toLocaleString("ru-RU")} ток.
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.generations === 0 && (
              <div className="text-xs text-muted-foreground text-center py-2">
                За последние 24 часа ИИ-генераций не было
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
