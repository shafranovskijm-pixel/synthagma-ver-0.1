import { useState, useMemo } from "react";
import { FolderTree, RefreshCw, Lightbulb, HelpCircle, BarChart3 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  CODE_TREE, TOTAL_FILES, TOTAL_LINES, SEVERITY_CONFIG,
  type CodeAnalysisItem,
} from "./devToolsData";

export function CodeMapTab() {
  const [showCodeAnalysis, setShowCodeAnalysis] = useState(false);
  const [codeLastUpdated, setCodeLastUpdated] = useState<string | null>(null);

  const codeAnalysisItems = useMemo<CodeAnalysisItem[]>(() => {
    const items: CodeAnalysisItem[] = [];

    CODE_TREE.forEach(group => {
      const pct = Math.round((group.totalLines / TOTAL_LINES) * 100);
      if (pct > 40) {
        items.push({
          id: `large-dir-${group.folder}`,
          severity: "warn",
          title: `${group.folder} занимает ${pct}% кодовой базы`,
          category: "Архитектура",
          detail: `${group.totalFiles} файлов, ~${group.totalLines.toLocaleString()} строк — высокая концентрация кода.`,
          suggestion: "Рассмотрите выделение подмодулей или вынос логики в отдельные пакеты."
        });
      }
      group.subfolders.forEach(sf => {
        if (sf.lines > 5000) {
          items.push({
            id: `large-subfolder-${sf.name}`,
            severity: "warn",
            title: `Подпапка ${sf.name} содержит ~${sf.lines} строк`,
            category: "Декомпозиция",
            detail: `${sf.files} файлов — среднем ${Math.round(sf.lines / sf.files)} строк на файл.`,
            suggestion: sf.lines / sf.files > 300 ? "Файлы слишком крупные, разбейте на подкомпоненты." : "Много файлов, рассмотрите группировку по доменам."
          });
        }
      });
    });

    const avgLinesPerFile = Math.round(TOTAL_LINES / TOTAL_FILES);
    if (avgLinesPerFile > 150) {
      items.push({
        id: "avg-file-size",
        severity: "info",
        title: `Средний размер файла: ~${avgLinesPerFile} строк`,
        category: "Качество",
        detail: "Оптимальный размер файла — 100-200 строк.",
        suggestion: avgLinesPerFile > 250 ? "Много крупных файлов — активно декомпозируйте." : "В целом нормально, но следите за ростом."
      });
    }

    const hooksGroup = CODE_TREE.find(g => g.folder === "src/hooks/");
    if (hooksGroup && hooksGroup.totalFiles > 40) {
      items.push({
        id: "too-many-hooks",
        severity: "info",
        title: `${hooksGroup.totalFiles} хуков в проекте`,
        category: "Организация",
        detail: "Большое количество хуков. Некоторые могут дублировать логику.",
        suggestion: "Сгруппируйте хуки по доменам или объедините похожие."
      });
    }

    const componentsGroup = CODE_TREE.find(g => g.folder === "src/components/");
    const uiSubfolder = componentsGroup?.subfolders.find(sf => sf.name === "ui/");
    if (uiSubfolder && uiSubfolder.files > 40) {
      items.push({
        id: "many-ui-components",
        severity: "info",
        title: `${uiSubfolder.files} UI-компонентов`,
        category: "Библиотека",
        detail: "Большая UI-библиотека. Убедитесь, что все компоненты используются.",
        suggestion: "Проверьте, нет ли неиспользуемых компонентов."
      });
    }

    return items;
  }, []);

  const refreshCodeMap = () => {
    setCodeLastUpdated(new Date().toLocaleTimeString("ru-RU"));
    toast.success("Карта кода актуализирована");
  };

  return (
    <div className="space-y-4">
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
                <p>Процент показывает <strong>долю строк кода</strong> этой папки от общего объёма проекта.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="outline" size="sm" onClick={refreshCodeMap} className="gap-2 rounded-xl">
            <RefreshCw className="w-3 h-3" />
            Обновить
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCodeAnalysis(!showCodeAnalysis)} className="gap-2 rounded-xl">
            <Lightbulb className="w-3 h-3" />
            Анализ
          </Button>
        </div>
      </div>

      {/* Percentage Legend */}
      <div className="rounded-xl border border-border bg-secondary/20 p-3 flex items-start gap-2.5">
        <BarChart3 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Процент (%) = доля строк кода</span> от общего объёма проекта (~{TOTAL_LINES.toLocaleString()} строк). Высокий процент может указывать на необходимость декомпозиции.
        </div>
      </div>

      {/* Code Analysis Panel */}
      {showCodeAnalysis && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-500" />
            Рекомендации по коду ({codeAnalysisItems.length})
          </h4>
          {codeAnalysisItems.map((item) => {
            const sevCfg = SEVERITY_CONFIG[item.severity];
            return (
              <div key={item.id} className={`rounded-xl border p-3 ${sevCfg.border} ${sevCfg.bg}`}>
                <div className="flex items-start gap-2.5">
                  <div className={`mt-0.5 shrink-0 ${sevCfg.color}`}>{sevCfg.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{item.title}</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">{item.category}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{item.detail}</div>
                    {item.suggestion && (
                      <div className="text-xs text-primary mt-1.5 font-medium">💡 {item.suggestion}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-3">
        {CODE_TREE.map((group) => {
          const pct = Math.round((group.totalLines / TOTAL_LINES) * 100);
          const isLarge = pct > 40;
          return (
            <details key={group.folder} className="rounded-xl border border-border bg-card overflow-hidden group">
              <summary className="p-4 cursor-pointer list-none flex items-center justify-between hover:bg-secondary/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: group.color }}>
                    {group.icon}
                  </div>
                  <div>
                    <div className="font-mono text-sm font-medium">{group.folder}</div>
                    <div className="text-xs text-muted-foreground">{group.totalFiles} файлов · ~{group.totalLines.toLocaleString()} строк</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 hidden sm:block"><Progress value={pct} className="h-2" /></div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge variant="outline" className={`font-mono text-xs ${isLarge ? "border-yellow-500/50 text-yellow-500" : ""}`}>{pct}%</Badge>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-xs">
                        {pct}% от всего кода ({group.totalLines.toLocaleString()} из {TOTAL_LINES.toLocaleString()} строк)
                        {isLarge && " — рекомендуется декомпозиция"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </summary>
              <div className="px-4 pb-4 space-y-1.5 border-t border-border pt-3">
                {group.subfolders.map((sf) => (
                  <div key={sf.name} className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg hover:bg-secondary/30 transition-colors">
                    <span className="font-mono text-muted-foreground flex items-center gap-2">
                      <FolderTree className="w-3 h-3" />{sf.name}
                    </span>
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
    </div>
  );
}
