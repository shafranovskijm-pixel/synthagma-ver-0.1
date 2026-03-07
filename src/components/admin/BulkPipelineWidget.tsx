import { useState, useCallback, useEffect } from "react";
import {
  Play, Square, CheckCircle2, Loader2, AlertTriangle, Brain, FileSpreadsheet,
  DollarSign, RotateCcw, Upload, Clock, ListChecks, ChevronDown, FlaskConical, Eye, BarChart3, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";
import { useBulkPipeline, type PipelineCourse } from "@/hooks/useBulkPipeline";
import { usePipelineExcelImport } from "@/hooks/usePipelineExcelImport";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  type MarketplacePrompts,
  type MarketplaceSettingsData,
  getMarketplacePrompts,
  getMarketplaceSettings,
  DEFAULT_PROMPTS,
  PROMPTS_KEY,
  SETTINGS_KEY,
} from "./MarketplaceSettings";

interface AllMarketplaceCourse {
  id: string;
  course_id: string;
  is_validated?: boolean;
  course?: { id: string; title: string };
}

interface TestStats {
  total: number;
  solved: number;
}

interface Props {
  courses: PipelineCourse[];
  allCourses?: AllMarketplaceCourse[];
  onComplete: () => void;
  customPrompts?: MarketplacePrompts;
}

export function BulkPipelineWidget({ courses, allCourses, onComplete }: Props) {
  const pipeline = useBulkPipeline({ courses, onComplete });
  const excelImport = usePipelineExcelImport({ onComplete });

  // Collapsible sections
  const [queueOpen, setQueueOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Prompts state
  const [prompts, setPrompts] = useState<MarketplacePrompts>(getMarketplacePrompts);

  // Settings state
  const [settings, setSettings] = useState<MarketplaceSettingsData>(getMarketplaceSettings);

  // Test stats
  const [testStatsProgress, setTestStatsProgress] = useState<TestStats>({ total: 0, solved: 0 });
  const [testStatsReady, setTestStatsReady] = useState<TestStats>({ total: 0, solved: 0 });
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // AI usage stats
  const [aiMonthCalls, setAiMonthCalls] = useState(0);
  const [isLoadingAiStats, setIsLoadingAiStats] = useState(false);

  // ── Load test stats (parallelized batches) ──
  const loadTestStats = useCallback(async () => {
    if (!allCourses || allCourses.length === 0) return;
    setIsLoadingStats(true);
    try {
      const courseIds = allCourses.map(c => c.course_id);
      const validatedSet = new Set(allCourses.filter(c => (c as any).is_validated === true).map(c => c.course_id));

      // Fetch test lessons in parallel batches
      const batchSize = 200;
      const lessonBatches: Promise<{ id: string; course_id: string }[]>[] = [];
      for (let i = 0; i < courseIds.length; i += batchSize) {
        const batch = courseIds.slice(i, i + batchSize);
        lessonBatches.push(
          Promise.resolve(supabase.from("lessons").select("id, course_id").in("course_id", batch).eq("type", "test"))
            .then(({ data }) => data || [])
        );
      }
      const allLessons = (await Promise.all(lessonBatches)).flat();

      if (allLessons.length === 0) {
        setTestStatsProgress({ total: 0, solved: 0 });
        setTestStatsReady({ total: 0, solved: 0 });
        setIsLoadingStats(false);
        return;
      }

      const lessonToCourse = new Map(allLessons.map(l => [l.id, l.course_id]));
      const lessonIds = allLessons.map(l => l.id);

      // Fetch test questions in parallel batches
      const questionBatches: Promise<{ id: string; lesson_id: string; correct_answer: number | null }[]>[] = [];
      for (let i = 0; i < lessonIds.length; i += batchSize) {
        const batch = lessonIds.slice(i, i + batchSize);
        questionBatches.push(
          Promise.resolve(supabase.from("test_questions").select("id, lesson_id, correct_answer").in("lesson_id", batch))
            .then(({ data }) => data || [])
        );
      }
      const allQuestions = (await Promise.all(questionBatches)).flat();

      let progressTotal = 0, progressSolved = 0, readyTotal = 0, readySolved = 0;
      for (const q of allQuestions) {
        const courseId = lessonToCourse.get(q.lesson_id);
        const isValidated = courseId ? validatedSet.has(courseId) : false;
        const isSolved = q.correct_answer !== null && q.correct_answer !== undefined && q.correct_answer >= 0;
        if (isValidated) {
          readyTotal++;
          if (isSolved) readySolved++;
        } else {
          progressTotal++;
          if (isSolved) progressSolved++;
        }
      }

      setTestStatsProgress({ total: progressTotal, solved: progressSolved });
      setTestStatsReady({ total: readyTotal, solved: readySolved });
    } catch (e) {
      console.error("Failed to load test stats:", e);
    }
    setIsLoadingStats(false);
  }, [allCourses]);

  const loadAiStats = useCallback(async () => {
    setIsLoadingAiStats(true);
    try {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("ai_usage_log")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart.toISOString());
      setAiMonthCalls(count || 0);
    } catch (e) {
      console.error("Failed to load AI stats:", e);
    }
    setIsLoadingAiStats(false);
  }, []);

  useEffect(() => {
    loadTestStats();
    loadAiStats();
  }, [loadTestStats, loadAiStats]);

  // ── Prompts helpers ──
  const savePrompts = (newPrompts: MarketplacePrompts) => {
    setPrompts(newPrompts);
    localStorage.setItem(PROMPTS_KEY, JSON.stringify(newPrompts));
    toast.success("Промты сохранены");
  };

  const resetPrompt = (key: keyof MarketplacePrompts) => {
    const updated = { ...prompts, [key]: DEFAULT_PROMPTS[key] };
    setPrompts(updated);
    localStorage.setItem(PROMPTS_KEY, JSON.stringify(updated));
    toast.info("Промт сброшен к дефолту");
  };

  // ── Settings helpers ──
  const saveSettings = (newSettings: MarketplaceSettingsData) => {
    setSettings(newSettings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    toast.success("Настройки сохранены");
  };

  const applyFreePricing = async () => {
    try {
      const { error } = await supabase
        .from("marketplace_courses")
        .update({ price_organization: 0 } as any)
        .gte("id", MARKETPLACE_ORG_ID);
      if (error) throw error;
      toast.success("Все курсы стали бесплатными для организаций");
      onComplete();
    } catch (e) {
      console.error(e);
      toast.error("Ошибка обновления цен");
    }
  };

  const { isBusy, totalCount, completedCount, progressPercent, currentIndex, currentPhase, completedLog, summary, aiSessionCalls } = pipeline;

  const handleStartWithQueue = useCallback(() => {
    setQueueOpen(true);
    pipeline.handleStart();
  }, [pipeline.handleStart]);

  const handleTestRunWithQueue = useCallback(() => {
    setQueueOpen(true);
    pipeline.handleTestRun();
  }, [pipeline.handleTestRun]);

  if (totalCount === 0 && excelImport.parsedCourses.length === 0) return null;

  const currentCourseName = isBusy ? (courses[currentIndex]?.course?.title || "") : "";

  const promptSections: Array<{ key: keyof MarketplacePrompts; label: string; desc: string }> = [
    { key: "structure", label: "Генерация структуры", desc: "Промт для создания списка уроков курса" },
    { key: "content", label: "Генерация контента", desc: "Промт для заполнения текстовых уроков" },
    { key: "answers", label: "Решение тестов", desc: "Промт для определения правильных ответов" },
  ];

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Loader2 className={`w-4 h-4 ${pipeline.isRunning ? "animate-spin" : "hidden"}`} />
            Конвейер заполнения
            {totalCount > 0 && <Badge variant="secondary" className="ml-1">{totalCount} курсов</Badge>}
          </CardTitle>
          {totalCount > 0 && (
            !isBusy ? (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={handleTestRunWithQueue} className="gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5" />Тест 1 курса
                </Button>
                <Button size="sm" onClick={handleStartWithQueue} className="gap-1.5">
                  <Play className="w-3.5 h-3.5" />Запустить все
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="destructive" onClick={pipeline.handleStop} className="gap-1.5">
                <Square className="w-3.5 h-3.5" />Стоп
              </Button>
            )
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress */}
        {totalCount > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{completedCount} / {totalCount} готово</span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        )}

        {/* Test stats widget */}
        {allCourses && allCourses.length > 0 && (
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BarChart3 className="w-4 h-4 text-primary" />
                Статистика тестов
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={loadTestStats} disabled={isLoadingStats} title="Обновить статистику">
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStats ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {isLoadingStats ? (
              <div className="text-xs text-muted-foreground">Загрузка...</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-600 bg-yellow-500/10">В работе</Badge>
                    <span className="text-xs text-muted-foreground">{testStatsProgress.total.toLocaleString()} вопр.</span>
                  </div>
                  <Progress value={testStatsProgress.total > 0 ? (testStatsProgress.solved / testStatsProgress.total) * 100 : 0} className="h-1.5" />
                  <div className="text-xs text-muted-foreground">
                    {testStatsProgress.solved.toLocaleString()} решено
                    {testStatsProgress.total > 0 && ` (${Math.round((testStatsProgress.solved / testStatsProgress.total) * 100)}%)`}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-xs border-green-500/30 text-green-600 bg-green-500/10">Готово</Badge>
                    <span className="text-xs text-muted-foreground">{testStatsReady.total.toLocaleString()} вопр.</span>
                  </div>
                  <Progress value={testStatsReady.total > 0 ? (testStatsReady.solved / testStatsReady.total) * 100 : 0} className="h-1.5" />
                  <div className="text-xs text-muted-foreground">
                    {testStatsReady.solved.toLocaleString()} решено
                    {testStatsReady.total > 0 && ` (${Math.round((testStatsReady.solved / testStatsReady.total) * 100)}%)`}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Usage Widget */}
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Brain className="w-4 h-4 text-primary" />
              Расход ИИ
            </div>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={loadAiStats} disabled={isLoadingAiStats} title="Обновить">
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAiStats ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
            <span>🧠 Сессия: <strong className="text-foreground">{aiSessionCalls}</strong> вызовов</span>
            <span>📅 За месяц: <strong className="text-foreground">{aiMonthCalls.toLocaleString()}</strong></span>
          </div>
        </div>

        {/* Current status */}
        {isBusy && currentCourseName && (
          <div className="text-sm space-y-0.5">
            <p className="font-medium truncate">▶ {currentCourseName}</p>
            <p className="text-muted-foreground text-xs truncate">{currentPhase}</p>
          </div>
        )}

        {/* Summary card after completion */}
        {summary && !isBusy && (
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Итоги конвейера
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">Курсов обработано:</span>
              <span className="font-medium">{summary.totalCourses}</span>
              <span className="text-muted-foreground">Успешно:</span>
              <span className="font-medium text-green-600">{summary.successCourses}</span>
              <span className="text-muted-foreground">С ошибками:</span>
              <span className="font-medium text-destructive">{summary.errorCourses}</span>
              <span className="text-muted-foreground">Тестов решено:</span>
              <span className="font-medium">{summary.totalTestsSolved.toLocaleString()}</span>
              <span className="text-muted-foreground">Уроков заполнено:</span>
              <span className="font-medium">{summary.totalLessonsFilled}</span>
              {summary.totalSkippedBatches > 0 && (
                <>
                  <span className="text-muted-foreground">Батчей пропущено:</span>
                  <span className="font-medium text-yellow-600">{summary.totalSkippedBatches}</span>
                </>
              )}
              <span className="text-muted-foreground">Время работы:</span>
              <span className="font-medium">{Math.round(summary.durationMs / 60000)} мин</span>
            </div>
          </div>
        )}

        {/* ── Section: Queue ── */}
        {totalCount > 0 && (
          <Collapsible open={queueOpen} onOpenChange={setQueueOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-1 text-sm hover:bg-secondary/30 rounded-md transition-colors">
              <div className="flex items-center gap-2">
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${!queueOpen ? "-rotate-90" : ""}`} />
                <ListChecks className="w-4 h-4 text-primary" />
                <span className="font-medium">Очередь курсов ({totalCount})</span>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="max-h-60 mt-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8 text-xs">#</TableHead>
                      <TableHead className="text-xs">Название</TableHead>
                      <TableHead className="w-16 text-xs">Статус</TableHead>
                      <TableHead className="text-xs">Детали</TableHead>
                      <TableHead className="w-10 text-xs"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {courses.map((c, i) => {
                      const log = completedLog[i];
                      const isActive = isBusy && i === currentIndex;
                      const isPending = !log && !isActive;
                      return (
                        <TableRow key={c.id} className={isActive ? "bg-primary/10" : ""}>
                          <TableCell className="text-xs text-muted-foreground py-1.5">{i + 1}</TableCell>
                          <TableCell className="text-xs py-1.5 truncate max-w-[200px]">{c.course?.title || "—"}</TableCell>
                          <TableCell className="py-1.5">
                            {isActive && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                            {log?.status === "ok" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                            {log?.status === "error" && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                            {isPending && <Clock className="w-3.5 h-3.5 text-muted-foreground" />}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground py-1.5">
                            {log?.status === "ok" && (
                              <span>
                                {log.testsSolved || 0}/{log.totalQuestions || 0} тестов, {log.lessonsFilled || 0} уроков
                                {(log.skippedBatches ?? 0) > 0 && (
                                  <span className="text-yellow-600 ml-1">⚠ {log.skippedBatches} пропущено</span>
                                )}
                              </span>
                            )}
                            {log?.status === "error" && <span className="text-destructive">{log.message}</span>}
                            {isActive && <span className="text-primary">{currentPhase}</span>}
                          </TableCell>
                          <TableCell className="py-1.5">
                            <button
                              onClick={() => window.open(`/course-builder/${c.course_id}`, '_blank')}
                              className="p-1 rounded hover:bg-secondary/50 transition-colors"
                              title="Открыть в конструкторе"
                            >
                              <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* ── Section: Prompts ── */}
        <Collapsible open={promptsOpen} onOpenChange={setPromptsOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-1 text-sm hover:bg-secondary/30 rounded-md transition-colors">
            <div className="flex items-center gap-2">
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${!promptsOpen ? "-rotate-90" : ""}`} />
              <Brain className="w-4 h-4 text-primary" />
              <span className="font-medium">Промты ИИ</span>
              <Badge variant="outline" className="text-[10px]">3 промта</Badge>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-4 mt-2">
              {promptSections.map(({ key, label, desc }) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-medium">{label}</Label>
                      <p className="text-[10px] text-muted-foreground">{desc}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => resetPrompt(key)} className="gap-1 text-[10px] h-6 px-2">
                      <RotateCcw className="w-3 h-3" />Сброс
                    </Button>
                  </div>
                  <Textarea
                    value={prompts[key]}
                    onChange={(e) => setPrompts(prev => ({ ...prev, [key]: e.target.value }))}
                    rows={4}
                    className="rounded-xl text-[11px] font-mono"
                  />
                </div>
              ))}
              <Button size="sm" onClick={() => savePrompts(prompts)} className="w-full rounded-xl">
                Сохранить промты
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* ── Section: Excel Import ── */}
        <Collapsible open={excelOpen} onOpenChange={setExcelOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-1 text-sm hover:bg-secondary/30 rounded-md transition-colors">
            <div className="flex items-center gap-2">
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${!excelOpen ? "-rotate-90" : ""}`} />
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              <span className="font-medium">Быстрый импорт из Excel</span>
              {excelImport.parsedCourses.length > 0 && <Badge variant="secondary" className="text-[10px]">{excelImport.parsedCourses.length}</Badge>}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-3 mt-2">
              <div className="border-2 border-dashed rounded-xl p-4 text-center space-y-2">
                <FileSpreadsheet className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-xs text-muted-foreground">Колонки: «Название» (обязательно), «Описание», «Длительность»</p>
                <input ref={excelImport.fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={excelImport.handleExcelFile} />
                <Button variant="outline" size="sm" onClick={() => excelImport.fileRef.current?.click()} className="rounded-xl">
                  <Upload className="w-3.5 h-3.5 mr-1.5" />Выбрать файл
                </Button>
              </div>

              {excelImport.parsedCourses.length > 0 && (
                <>
                  <ScrollArea className="max-h-40 border rounded-xl">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8 text-xs">#</TableHead>
                          <TableHead className="text-xs">Название</TableHead>
                          <TableHead className="text-xs">Описание</TableHead>
                          <TableHead className="w-20 text-xs">Часы</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {excelImport.parsedCourses.map((c, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-[10px] text-muted-foreground py-1">{i + 1}</TableCell>
                            <TableCell className="text-xs py-1">{c.title}</TableCell>
                            <TableCell className="text-[10px] text-muted-foreground truncate max-w-[150px] py-1">{c.description || "—"}</TableCell>
                            <TableCell className="text-[10px] py-1">{c.duration || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                  {excelImport.isImporting && (
                    <div className="space-y-1">
                      <Progress value={(excelImport.importProgress / excelImport.importTotal) * 100} className="h-2" />
                      <p className="text-[10px] text-muted-foreground text-center">{excelImport.importProgress} / {excelImport.importTotal}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => excelImport.setParsedCourses([])} className="flex-1 rounded-xl">Очистить</Button>
                    <Button size="sm" onClick={excelImport.handleCreateAll} disabled={excelImport.isImporting} className="flex-1 rounded-xl">
                      {excelImport.isImporting ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Создание...</> : <>Создать все ({excelImport.parsedCourses.length})</>}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* ── Section: Access Settings ── */}
        <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-1 text-sm hover:bg-secondary/30 rounded-md transition-colors">
            <div className="flex items-center gap-2">
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${!settingsOpen ? "-rotate-90" : ""}`} />
              <DollarSign className="w-4 h-4 text-amber-600" />
              <span className="font-medium">Настройки доступа</span>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-3 mt-2">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-secondary/50">
                <div>
                  <p className="text-xs font-medium">Бесплатные курсы для организаций</p>
                  <p className="text-[10px] text-muted-foreground">Все курсы будут доступны бесплатно</p>
                </div>
                <Switch
                  checked={settings.freeForOrgs}
                  onCheckedChange={(v) => {
                    const updated = { ...settings, freeForOrgs: v };
                    if (v) updated.defaultPriceOrg = 0;
                    saveSettings(updated);
                  }}
                />
              </div>
              {settings.freeForOrgs && (
                <Button variant="outline" size="sm" className="w-full rounded-xl text-xs" onClick={applyFreePricing}>
                  Применить ко всем существующим курсам
                </Button>
              )}
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px]">Цена для студентов (₽)</Label>
                  <Input
                    type="number"
                    value={settings.defaultPriceStudent}
                    onChange={(e) => setSettings(prev => ({ ...prev, defaultPriceStudent: parseInt(e.target.value) || 0 }))}
                    className="rounded-xl h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Цена для организаций (₽)</Label>
                  <Input
                    type="number"
                    value={settings.freeForOrgs ? 0 : settings.defaultPriceOrg}
                    disabled={settings.freeForOrgs}
                    onChange={(e) => setSettings(prev => ({ ...prev, defaultPriceOrg: parseInt(e.target.value) || 0 }))}
                    className="rounded-xl h-8 text-xs"
                  />
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => saveSettings(settings)} className="w-full rounded-xl">
                Сохранить настройки
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
