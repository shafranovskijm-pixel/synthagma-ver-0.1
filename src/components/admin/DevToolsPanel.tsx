import { useState } from "react";
import {
  Database, Code2, Zap, HeartPulse, Terminal, FileCode, Radio,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DatabaseMap } from "./DatabaseMap";
import { CodeMapTab } from "./devtools/CodeMapTab";
import { HealthTab } from "./devtools/HealthTab";
import { ApiMonitorTab } from "./devtools/ApiMonitorTab";
import {
  EDGE_FUNCTIONS, CATEGORY_META, TOTAL_FILES, TOTAL_LINES,
  CODE_RECOMMENDATIONS,
} from "./devtools/devToolsData";

export function DevToolsPanel() {
  const [activeTab, setActiveTab] = useState("database");

  const errorCount = CODE_RECOMMENDATIONS.filter(r => r.severity === "error" && r.status !== "skipped" && r.status !== "applied").length;

  const metricCards = [
    { label: "Таблиц", value: "65", icon: <Database className="w-5 h-5" />, colorClass: "bg-violet-500", bgClass: "bg-violet-500" },
    { label: "Edge-функций", value: "63", icon: <Zap className="w-5 h-5" />, colorClass: "bg-emerald-500", bgClass: "bg-emerald-500" },
    { label: "Компонентов", value: `~${TOTAL_FILES}`, icon: <Code2 className="w-5 h-5" />, colorClass: "bg-sky-500", bgClass: "bg-sky-500" },
    { label: "Строк кода", value: `~${(TOTAL_LINES / 1000).toFixed(1)}k`, icon: <FileCode className="w-5 h-5" />, colorClass: "bg-amber-500", bgClass: "bg-amber-500" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Terminal className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold">Developer Tools</h2>
          <p className="text-sm text-muted-foreground font-mono">SYNTHAGMA // v1.0.0</p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metricCards.map((m) => (
          <div key={m.label} className="relative overflow-hidden rounded-xl border border-border bg-card p-4 group hover:border-primary/40 transition-colors">
            <div className={`absolute top-0 right-0 w-20 h-20 rounded-full opacity-[0.07] blur-[20px] ${
              m.colorClass
            }`} />
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${m.bgClass}`}>
                {m.icon}
              </div>
            </div>
            <div className="font-mono text-2xl font-bold">{m.value}</div>
            <div className="text-xs text-muted-foreground">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-secondary/50 rounded-xl p-1 h-auto flex-wrap">
          <TabsTrigger value="database" className="rounded-lg gap-2 data-[state=active]:bg-card text-xs sm:text-sm">
            <Database className="w-4 h-4" /> База данных
          </TabsTrigger>
          <TabsTrigger value="code" className="rounded-lg gap-2 data-[state=active]:bg-card text-xs sm:text-sm">
            <Code2 className="w-4 h-4" /> Карта кода
          </TabsTrigger>
          <TabsTrigger value="functions" className="rounded-lg gap-2 data-[state=active]:bg-card text-xs sm:text-sm">
            <Zap className="w-4 h-4" /> Edge-функции
          </TabsTrigger>
          <TabsTrigger value="api-monitor" className="rounded-lg gap-2 data-[state=active]:bg-card text-xs sm:text-sm">
            <Radio className="w-4 h-4" /> API Monitor
          </TabsTrigger>
          <TabsTrigger value="health" className="rounded-lg gap-2 data-[state=active]:bg-card text-xs sm:text-sm">
            <HeartPulse className="w-4 h-4" /> Здоровье
            {errorCount > 0 && <Badge variant="destructive" className="text-[10px] h-4 px-1.5 ml-1">{errorCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="database" className="mt-0">
          <DatabaseMap />
        </TabsContent>

        <TabsContent value="code" className="mt-0">
          <CodeMapTab />
        </TabsContent>

        {/* Edge Functions Tab */}
        <TabsContent value="functions" className="mt-0 space-y-4">
          <div className="text-sm text-muted-foreground font-mono">{EDGE_FUNCTIONS.length} функций в 5 категориях</div>
          {Object.entries(CATEGORY_META).map(([catKey, catMeta]) => {
            const fns = EDGE_FUNCTIONS.filter((f) => f.category === catKey);
            return (
              <div key={catKey} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="p-3 flex items-center gap-2 border-b border-border bg-secondary/20">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center text-white ${catMeta.bgClass}`}>{catMeta.icon}</div>
                  <span className="font-medium text-sm">{catMeta.label}</span>
                  <Badge variant="outline" className="ml-auto font-mono text-xs">{fns.length}</Badge>
                </div>
                <div className="divide-y divide-border">
                  {fns.map((fn) => (
                    <div key={fn.name} className="px-4 py-2.5 flex items-center justify-between hover:bg-secondary/20 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="font-mono text-xs">{fn.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground hidden sm:block">{fn.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="api-monitor" className="mt-0">
          <ApiMonitorTab />
        </TabsContent>

        <TabsContent value="health" className="mt-0">
          <HealthTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
