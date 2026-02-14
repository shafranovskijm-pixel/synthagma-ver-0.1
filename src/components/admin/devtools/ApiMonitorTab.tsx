import { useState, useCallback } from "react";
import {
  Zap, RefreshCw, CheckCircle2, XCircle, Clock, Activity,
  TrendingUp, AlertTriangle, BarChart3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EDGE_FUNCTIONS, CATEGORY_META } from "./devToolsData";

interface FunctionStatus {
  name: string;
  status: "ok" | "error" | "slow" | "untested";
  latency?: number;
  lastTested?: string;
  errorMessage?: string;
}

export function ApiMonitorTab() {
  const [results, setResults] = useState<FunctionStatus[]>([]);
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const testFunction = useCallback(async (fnName: string): Promise<FunctionStatus> => {
    const start = performance.now();
    try {
      const { error } = await supabase.functions.invoke(fnName, {
        body: { _healthCheck: true },
      });
      const latency = Math.round(performance.now() - start);
      return {
        name: fnName,
        status: latency > 3000 ? "slow" : "ok",
        latency,
        lastTested: new Date().toLocaleTimeString("ru-RU"),
      };
    } catch (err: any) {
      return {
        name: fnName,
        status: "error",
        latency: Math.round(performance.now() - start),
        lastTested: new Date().toLocaleTimeString("ru-RU"),
        errorMessage: err?.message || "Connection failed",
      };
    }
  }, []);

  const runHealthCheck = useCallback(async () => {
    setTesting(true);
    setProgress(0);
    const allResults: FunctionStatus[] = [];
    const fns = EDGE_FUNCTIONS;
    const batchSize = 4;

    for (let i = 0; i < fns.length; i += batchSize) {
      const batch = fns.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(fn => testFunction(fn.name)));
      allResults.push(...batchResults);
      setProgress(Math.round(((i + batch.length) / fns.length) * 100));
      setResults([...allResults]);
    }

    setTesting(false);
    const okCount = allResults.filter(r => r.status === "ok").length;
    const errCount = allResults.filter(r => r.status === "error").length;
    const slowCount = allResults.filter(r => r.status === "slow").length;
    toast.success(`Проверка: ${okCount} ✓ · ${slowCount} медленных · ${errCount} ошибок`);
  }, [testFunction]);

  const filteredFunctions = selectedCategory
    ? EDGE_FUNCTIONS.filter(f => f.category === selectedCategory)
    : EDGE_FUNCTIONS;

  const getResult = (name: string) => results.find(r => r.name === name);

  const okCount = results.filter(r => r.status === "ok").length;
  const errorCount = results.filter(r => r.status === "error").length;
  const slowCount = results.filter(r => r.status === "slow").length;
  const avgLatency = results.length > 0
    ? Math.round(results.reduce((a, r) => a + (r.latency || 0), 0) / results.length)
    : 0;

  const StatusIcon = ({ status }: { status: FunctionStatus["status"] }) => {
    switch (status) {
      case "ok": return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
      case "error": return <XCircle className="w-3.5 h-3.5 text-red-500" />;
      case "slow": return <Clock className="w-3.5 h-3.5 text-yellow-500" />;
      default: return <Activity className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground font-mono">
          {EDGE_FUNCTIONS.length} функций · {results.length > 0 ? `${results.length} проверено` : "не проверено"}
        </div>
        <Button variant="default" size="sm" onClick={runHealthCheck} disabled={testing} className="gap-2 rounded-xl">
          {testing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          {testing ? "Проверка..." : "Проверить все"}
        </Button>
      </div>

      {testing && (
        <div className="space-y-1">
          <Progress value={progress} className="h-2" />
          <div className="text-xs text-muted-foreground text-center font-mono">{progress}%</div>
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
            <div className="text-2xl font-mono font-bold text-emerald-500">{okCount}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Работает</div>
          </div>
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 text-center">
            <div className="text-2xl font-mono font-bold text-yellow-500">{slowCount}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Медленные</div>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-center">
            <div className="text-2xl font-mono font-bold text-red-500">{errorCount}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Ошибки</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-2xl font-mono font-bold text-foreground">{avgLatency}<span className="text-xs">ms</span></div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Ср. латенция</div>
          </div>
        </div>
      )}

      {/* Category Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant={selectedCategory === null ? "default" : "outline"} size="sm" className="h-7 text-xs rounded-lg" onClick={() => setSelectedCategory(null)}>
          Все
        </Button>
        {Object.entries(CATEGORY_META).map(([key, meta]) => (
          <Button key={key} variant={selectedCategory === key ? "default" : "outline"} size="sm" className="h-7 text-xs rounded-lg gap-1.5" onClick={() => setSelectedCategory(key)}>
            {meta.icon}
            {meta.label}
          </Button>
        ))}
      </div>

      {/* Functions List */}
      <div className="space-y-2">
        {filteredFunctions.map((fn) => {
          const result = getResult(fn.name);
          const catMeta = CATEGORY_META[fn.category];
          return (
            <div key={fn.name} className={`rounded-xl border bg-card p-3 transition-colors ${
              result?.status === "error" ? "border-red-500/30" :
              result?.status === "slow" ? "border-yellow-500/30" :
              result?.status === "ok" ? "border-emerald-500/20" : "border-border"
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <StatusIcon status={result?.status || "untested"} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium truncate">{fn.name}</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">{catMeta?.label}</Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{fn.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {result?.latency !== undefined && (
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-muted-foreground" />
                      <span className={`font-mono text-xs ${
                        result.latency > 3000 ? "text-yellow-500" :
                        result.latency > 5000 ? "text-red-500" : "text-emerald-500"
                      }`}>
                        {result.latency}ms
                      </span>
                    </div>
                  )}
                  {result?.lastTested && (
                    <span className="text-[10px] text-muted-foreground hidden sm:block">{result.lastTested}</span>
                  )}
                </div>
              </div>
              {result?.errorMessage && (
                <div className="mt-2 text-xs text-red-500 font-mono bg-red-500/5 rounded-lg px-2 py-1.5 flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  {result.errorMessage}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
