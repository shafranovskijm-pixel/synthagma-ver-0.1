import { useState, useMemo } from "react";
import {
  FolderTree, RefreshCw, Lightbulb, HelpCircle, BarChart3,
  FileCode2, Package, Activity, CheckCircle2, AlertTriangle as AlertTriangleIcon,
  Circle, Search,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CODE_TREE, TOTAL_FILES, TOTAL_LINES, SEVERITY_CONFIG,
  LARGEST_FILES, KEY_DEPENDENCIES, QUALITY_METRICS,
  CONTEXT_COMPONENTS,
  type CodeAnalysisItem, type LargeFile,
} from "./devToolsData";

/* ── Tiny presentational helpers ── */

function FileStatusIcon({ status }: { status: LargeFile["status"] }) {
  if (status === "optimized") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (status === "needs-work") return <AlertTriangleIcon className="w-3.5 h-3.5 text-yellow-500" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground" />;
}

const qualityColor = (s: string) =>
  s === "good" ? "text-emerald-500" : s === "warning" ? "text-yellow-500" : "text-red-500";

const barColor = (s: string) =>
  s === "good" ? "bg-emerald-500" : s === "warning" ? "bg-yellow-500" : "bg-red-500";

/* ── Sub-sections ── */

function TreeSection({ items, searchQuery }: { items: typeof CODE_TREE; searchQuery: string }) {
  const filtered = useMemo(() => {
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(g => g.folder.toLowerCase().includes(q) || g.subfolders.some(sf => sf.name.toLowerCase().includes(q)));
  }, [items, searchQuery]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-secondary/20 p-3 flex items-start gap-2.5">
        <BarChart3 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Процент (%) = доля строк кода</span> от общего объёма (~{TOTAL_LINES.toLocaleString()} строк).
        </div>
      </div>
      {filtered.map((group) => {
        const pct = Math.round((group.totalLines / TOTAL_LINES) * 100);
        return (
          <details key={group.folder} className="rounded-xl border border-border bg-card overflow-hidden">
            <summary className="p-4 cursor-pointer list-none flex items-center justify-between hover:bg-secondary/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: group.color }}>{group.icon}</div>
                <div>
                  <div className="font-mono text-sm font-medium">{group.folder}</div>
                  <div className="text-xs text-muted-foreground">{group.totalFiles} файлов · ~{group.totalLines.toLocaleString()} строк</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-24 hidden sm:block"><Progress value={pct} className="h-2" /></div>
                <Badge variant="outline" className={`font-mono text-xs ${pct > 40 ? "border-yellow-500/50 text-yellow-500" : ""}`}>{pct}%</Badge>
              </div>
            </summary>
            <div className="px-4 pb-4 space-y-1.5 border-t border-border pt-3">
              {group.subfolders.map((sf) => (
                <div key={sf.name} className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg hover:bg-secondary/30 transition-colors">
                  <span className="font-mono text-muted-foreground flex items-center gap-2"><FolderTree className="w-3 h-3" />{sf.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{sf.files} файлов</span>
                    <Badge variant="outline" className="font-mono text-[10px] h-5">~{sf.lines}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function FilesSection({ searchQuery }: { searchQuery: string }) {
  const filtered = useMemo(() => {
    if (!searchQuery) return LARGEST_FILES;
    const q = searchQuery.toLowerCase();
    return LARGEST_FILES.filter(f => f.path.toLowerCase().includes(q) || f.note?.toLowerCase().includes(q));
  }, [searchQuery]);

  const maxLines = LARGEST_FILES[0]?.lines || 1;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-secondary/20 p-3 flex items-start gap-2.5">
        <FileCode2 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Топ-{LARGEST_FILES.length} крупнейших файлов</span> — мониторинг размера после рефакторинга.
        </div>
      </div>
      <div className="space-y-2">
        {filtered.map((file, idx) => {
          const barWidth = Math.min(100, Math.round((file.lines / maxLines) * 100));
          return (
            <div key={file.path} className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono text-muted-foreground w-5 shrink-0">#{idx + 1}</span>
                  <FileStatusIcon status={file.status} />
                  <span className="text-xs font-mono truncate">{file.path}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="font-mono text-[10px] h-5">{file.lines} строк</Badge>
                  {file.status === "optimized" && <Badge className="text-[10px] h-5 bg-emerald-500/10 text-emerald-500 border-emerald-500/30">Оптимизирован</Badge>}
                  {file.status === "needs-work" && <Badge className="text-[10px] h-5 bg-yellow-500/10 text-yellow-500 border-yellow-500/30">Требует работы</Badge>}
                </div>
              </div>
              <div className="relative h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                    file.status === "optimized" ? "bg-emerald-500" : file.status === "needs-work" ? "bg-yellow-500" : "bg-muted-foreground/40"
                  }`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              {file.note && <div className="text-[11px] text-muted-foreground pl-7">{file.note}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DepsSection({ searchQuery }: { searchQuery: string }) {
  const filtered = useMemo(() => {
    if (!searchQuery) return KEY_DEPENDENCIES;
    const q = searchQuery.toLowerCase();
    return KEY_DEPENDENCIES.filter(d => d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q));
  }, [searchQuery]);

  const totalSize = KEY_DEPENDENCIES.reduce((a, d) => a + d.sizeKb, 0);
  const maxSize = Math.max(...KEY_DEPENDENCIES.map(d => d.sizeKb));

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-secondary/20 p-3 flex items-start gap-2.5">
        <Package className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Ключевые зависимости</span> — суммарный размер: ~{(totalSize / 1024).toFixed(1)} MB.
        </div>
      </div>
      <div className="grid gap-2">
        {[...filtered].sort((a, b) => b.sizeKb - a.sizeKb).map((dep) => {
          const barWidth = Math.min(100, Math.round((dep.sizeKb / maxSize) * 100));
          const strategyBadge = dep.loadStrategy === "dynamic"
            ? <Badge className="text-[10px] h-4 px-1.5 bg-emerald-500/10 text-emerald-500 border-emerald-500/30">dynamic</Badge>
            : dep.loadStrategy === "lazy"
            ? <Badge className="text-[10px] h-4 px-1.5 bg-sky-500/10 text-sky-500 border-sky-500/30">lazy</Badge>
            : <Badge variant="outline" className="text-[10px] h-4 px-1.5">static</Badge>;
          return (
            <div key={dep.name} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono font-medium truncate">{dep.name}</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono shrink-0">{dep.category}</Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono text-muted-foreground">{dep.sizeKb >= 1000 ? `${(dep.sizeKb / 1024).toFixed(1)} MB` : `${dep.sizeKb} KB`}</span>
                  {strategyBadge}
                </div>
              </div>
              <div className="relative h-1 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full ${
                    dep.loadStrategy === "dynamic" ? "bg-emerald-500" : dep.loadStrategy === "lazy" ? "bg-sky-500" : "bg-muted-foreground/30"
                  }`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QualitySection() {
  const contextCoverage = Math.round(
    (CONTEXT_COMPONENTS.filter(c => c.migrated).length / CONTEXT_COMPONENTS.length) * 100
  );

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-secondary/20 p-3 flex items-start gap-2.5">
        <Activity className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Метрики качества кода</span> — автоматический анализ ключевых показателей.
        </div>
      </div>

      <div className="grid gap-2">
        {QUALITY_METRICS.map((m) => {
          const pct = Math.min(100, Math.round((m.value / m.max) * 100));
          return (
            <div key={m.label} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">{m.label}</span>
                <span className={`text-sm font-mono font-bold ${qualityColor(m.status)}`}>
                  {m.value} <span className="text-[10px] font-normal text-muted-foreground">{m.unit}</span>
                </span>
              </div>
              <div className="relative h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${barColor(m.status)}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Context Coverage */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Context Coverage — {contextCoverage}%
        </h4>
        <div className="relative h-2 bg-secondary rounded-full overflow-hidden mb-3">
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all" style={{ width: `${contextCoverage}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {CONTEXT_COMPONENTS.map(c => (
            <div key={c.name} className="flex items-center gap-2 text-xs">
              {c.migrated ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Circle className="w-3 h-3 text-muted-foreground" />}
              <span className={c.migrated ? "text-foreground" : "text-muted-foreground"}>{c.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Architecture Summary */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h4 className="font-medium text-sm">Архитектурный профиль</h4>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="bg-secondary/30 rounded-lg p-3 space-y-1">
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Паттерны</div>
            <div>Custom Hooks (123)</div>
            <div>Lazy Routes (61)</div>
            <div>ErrorBoundary</div>
            <div>Dynamic Import</div>
            <div>Context API</div>
          </div>
          <div className="bg-secondary/30 rounded-lg p-3 space-y-1">
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Стек</div>
            <div>React 18 + Vite 5</div>
            <div>TanStack Query</div>
            <div>Tailwind + Radix</div>
            <div>Supabase + Deno</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ── */

export function CodeMapTab() {
  const [showCodeAnalysis, setShowCodeAnalysis] = useState(false);
  const [codeLastUpdated, setCodeLastUpdated] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("tree");
  const [searchQuery, setSearchQuery] = useState("");

  const codeAnalysisItems = useMemo<CodeAnalysisItem[]>(() => {
    const items: CodeAnalysisItem[] = [];
    CODE_TREE.forEach(group => {
      const pct = Math.round((group.totalLines / TOTAL_LINES) * 100);
      if (pct > 40) {
        items.push({
          id: `large-dir-${group.folder}`, severity: "warn",
          title: `${group.folder} занимает ${pct}% кодовой базы`, category: "Архитектура",
          detail: `${group.totalFiles} файлов, ~${group.totalLines.toLocaleString()} строк.`,
          suggestion: "Рассмотрите выделение подмодулей."
        });
      }
    });
    const avg = Math.round(TOTAL_LINES / TOTAL_FILES);
    if (avg > 150) {
      items.push({
        id: "avg-file-size", severity: "info",
        title: `Средний размер файла: ~${avg} строк`, category: "Качество",
        detail: "Оптимальный размер — 100-200 строк.",
      });
    }
    return items;
  }, []);

  const optimizedFiles = LARGEST_FILES.filter(f => f.status === "optimized").length;
  const contextCoverage = Math.round(
    (CONTEXT_COMPONENTS.filter(c => c.migrated).length / CONTEXT_COMPONENTS.length) * 100
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground font-mono">
          {TOTAL_FILES} файлов · ~{TOTAL_LINES.toLocaleString()} строк
          {codeLastUpdated && <span className="ml-2 text-xs">· обновлено: {codeLastUpdated}</span>}
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg">
                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                <p className="font-medium mb-1">Что означает процент?</p>
                <p>Доля строк кода этой папки от общего объёма проекта.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="outline" size="sm" onClick={() => { setCodeLastUpdated(new Date().toLocaleTimeString("ru-RU")); toast.success("Обновлено"); }} className="gap-2 rounded-xl">
            <RefreshCw className="w-3 h-3" />
            Обновить
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCodeAnalysis(!showCodeAnalysis)} className="gap-2 rounded-xl">
            <Lightbulb className="w-3 h-3" />
            Анализ
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Поиск файлов, папок, зависимостей..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-8 text-xs rounded-xl bg-secondary/30 border-border"
        />
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { value: TOTAL_FILES, label: "Файлов" },
          { value: `${Math.round(TOTAL_LINES / 1000)}K`, label: "Строк кода" },
          { value: `${optimizedFiles}/${LARGEST_FILES.length}`, label: "Оптимизировано", color: "text-emerald-500" },
          { value: `${contextCoverage}%`, label: "Context Coverage" },
        ].map(m => (
          <div key={m.label} className="rounded-xl border border-border bg-card p-3 text-center">
            <div className={`text-lg font-mono font-bold ${m.color || "text-foreground"}`}>{m.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Section Tabs */}
      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList className="w-full grid grid-cols-4 h-9">
          <TabsTrigger value="tree" className="text-xs gap-1.5"><FolderTree className="w-3 h-3" />Дерево</TabsTrigger>
          <TabsTrigger value="files" className="text-xs gap-1.5"><FileCode2 className="w-3 h-3" />Файлы</TabsTrigger>
          <TabsTrigger value="deps" className="text-xs gap-1.5"><Package className="w-3 h-3" />Зависимости</TabsTrigger>
          <TabsTrigger value="quality" className="text-xs gap-1.5"><Activity className="w-3 h-3" />Качество</TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="mt-3"><TreeSection items={CODE_TREE} searchQuery={searchQuery} /></TabsContent>
        <TabsContent value="files" className="mt-3"><FilesSection searchQuery={searchQuery} /></TabsContent>
        <TabsContent value="deps" className="mt-3"><DepsSection searchQuery={searchQuery} /></TabsContent>
        <TabsContent value="quality" className="mt-3"><QualitySection /></TabsContent>
      </Tabs>

      {/* Code Analysis Panel */}
      {showCodeAnalysis && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-500" />
            Рекомендации по коду ({codeAnalysisItems.length})
          </h4>
          {codeAnalysisItems.map((item) => {
            const cfg = SEVERITY_CONFIG[item.severity];
            return (
              <div key={item.id} className={`rounded-xl border p-3 ${cfg.border} ${cfg.bg}`}>
                <div className="flex items-start gap-2.5">
                  <div className={`mt-0.5 shrink-0 ${cfg.color}`}>{cfg.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{item.title}</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">{item.category}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{item.detail}</div>
                    {item.suggestion && <div className="text-xs text-primary mt-1.5 font-medium">💡 {item.suggestion}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
