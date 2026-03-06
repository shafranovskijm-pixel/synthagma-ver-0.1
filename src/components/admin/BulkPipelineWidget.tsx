import { useState, useRef, useCallback, useEffect } from "react";
import {
  Play, Square, CheckCircle2, Loader2, AlertTriangle, Brain, FileSpreadsheet,
  DollarSign, RotateCcw, Upload, Clock, ListChecks, ChevronDown, FlaskConical, Eye, BarChart3, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

interface PipelineCourse {
  id: string;
  course_id: string;
  course?: { id: string; title: string; description: string | null; duration: string | null };
}

interface AllMarketplaceCourse {
  id: string;
  course_id: string;
  is_validated?: boolean;
  course?: { id: string; title: string };
}

interface LogEntry {
  courseName: string;
  status: "ok" | "error" | "pending" | "active";
  message?: string;
  lessonsFilled?: number;
  testsSolved?: number;
  skippedBatches?: number;
  totalQuestions?: number;
}

interface PipelineSummary {
  totalCourses: number;
  successCourses: number;
  errorCourses: number;
  totalTestsSolved: number;
  totalLessonsFilled: number;
  totalSkippedBatches: number;
  durationMs: number;
}

class CreditsExhaustedError extends Error {
  constructor() {
    super("Кредиты ИИ исчерпаны");
    this.name = "CreditsExhaustedError";
  }
}

function checkFor402(error: any) {
  const msg = error?.message || String(error || "");
  if (msg.includes("402") || msg.includes("кредит") || msg.includes("баланс") || msg.includes("payment_required") || msg.includes("Not enough credits")) {
    throw new CreditsExhaustedError();
  }
}

interface ExcelCourse {
  title: string;
  description?: string;
  duration?: string;
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
  const [isRunning, setIsRunning] = useState(false);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentPhase, setCurrentPhase] = useState("");
  const [completedLog, setCompletedLog] = useState<LogEntry[]>([]);
  const stopRef = useRef(false);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);

  // Collapsible sections
  const [queueOpen, setQueueOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Prompts state
  const [prompts, setPrompts] = useState<MarketplacePrompts>(getMarketplacePrompts);

  // Excel import state
  const [parsedCourses, setParsedCourses] = useState<ExcelCourse[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Settings state
  const [settings, setSettings] = useState<MarketplaceSettingsData>(getMarketplaceSettings);

  // Test stats
  const [testStatsProgress, setTestStatsProgress] = useState<TestStats>({ total: 0, solved: 0 });
  const [testStatsReady, setTestStatsReady] = useState<TestStats>({ total: 0, solved: 0 });
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // AI usage stats
  const [aiSessionCalls, setAiSessionCalls] = useState(0);
  const [aiMonthCalls, setAiMonthCalls] = useState(0);
  const [isLoadingAiStats, setIsLoadingAiStats] = useState(false);

  const totalCount = courses.length;
  const completedCount = completedLog.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // ── Load test stats ──
  const loadTestStats = useCallback(async () => {
    if (!allCourses || allCourses.length === 0) return;
    setIsLoadingStats(true);
    try {
      const courseIds = allCourses.map(c => c.course_id);
      const validatedSet = new Set(allCourses.filter(c => (c as any).is_validated === true).map(c => c.course_id));

      // Fetch test lessons in batches
      const batchSize = 200;
      const allLessons: { id: string; course_id: string }[] = [];
      for (let i = 0; i < courseIds.length; i += batchSize) {
        const batch = courseIds.slice(i, i + batchSize);
        const { data } = await supabase
          .from("lessons")
          .select("id, course_id")
          .in("course_id", batch)
          .eq("type", "test");
        if (data) allLessons.push(...data);
      }

      if (allLessons.length === 0) {
        setTestStatsProgress({ total: 0, solved: 0 });
        setTestStatsReady({ total: 0, solved: 0 });
        setIsLoadingStats(false);
        return;
      }

      // Map lesson -> course for validated check
      const lessonToCourse = new Map(allLessons.map(l => [l.id, l.course_id]));
      const lessonIds = allLessons.map(l => l.id);

      // Fetch test questions in batches
      let progressTotal = 0, progressSolved = 0, readyTotal = 0, readySolved = 0;
      for (let i = 0; i < lessonIds.length; i += batchSize) {
        const batch = lessonIds.slice(i, i + batchSize);
        const { data: questions } = await supabase
          .from("test_questions")
          .select("id, lesson_id, correct_answer")
          .in("lesson_id", batch);
        if (questions) {
          for (const q of questions) {
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
        .gte("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
      toast.success("Все курсы стали бесплатными для организаций");
      onComplete();
    } catch (e) {
      console.error(e);
      toast.error("Ошибка обновления цен");
    }
  };

  // ── Excel helpers ──
  const handleExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (rows.length < 2) { toast.error("Файл пуст"); return; }
        const header = rows[0].map((h: any) => String(h || "").toLowerCase().trim());
        const titleIdx = header.findIndex(h => h.includes("назван") || h.includes("title") || h === "курс");
        const descIdx = header.findIndex(h => h.includes("описан") || h.includes("description"));
        const durIdx = header.findIndex(h => h.includes("длительн") || h.includes("duration") || h.includes("час"));
        if (titleIdx === -1) { toast.error("Не найдена колонка «Название»"); return; }
        const parsed: ExcelCourse[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const title = String(row[titleIdx] || "").trim();
          if (!title) continue;
          parsed.push({
            title,
            description: descIdx >= 0 ? String(row[descIdx] || "").trim() : undefined,
            duration: durIdx >= 0 ? String(row[durIdx] || "").trim() : undefined,
          });
        }
        setParsedCourses(parsed);
        toast.success(`Найдено ${parsed.length} курсов`);
      } catch (err) {
        console.error(err);
        toast.error("Ошибка чтения файла");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handleCreateAll = async () => {
    if (parsedCourses.length === 0) return;
    setIsImporting(true);
    setImportProgress(0);
    setImportTotal(parsedCourses.length);
    const priceOrg = settings.freeForOrgs ? 0 : settings.defaultPriceOrg;
    const priceStudent = settings.defaultPriceStudent;
    let created = 0;
    for (const course of parsedCourses) {
      try {
        const { data: courseData, error: courseErr } = await supabase
          .from("courses")
          .insert({
            title: course.title,
            description: course.description || null,
            duration: course.duration || null,
            organization_id: "00000000-0000-0000-0000-000000000000",
            is_published: true,
          })
          .select("id")
          .single();
        if (courseErr) throw courseErr;
        await supabase.from("marketplace_courses").insert({
          course_id: courseData.id,
          organization_id: "00000000-0000-0000-0000-000000000000",
          price_student: priceStudent,
          price_organization: priceOrg,
          is_active: true,
          is_validated: false,
        } as any);
        created++;
      } catch (e) {
        console.error(`Failed to create "${course.title}":`, e);
      }
      setImportProgress(prev => prev + 1);
    }
    setIsImporting(false);
    setParsedCourses([]);
    toast.success(`Создано ${created} из ${parsedCourses.length} курсов`);
    onComplete();
  };

  // ── Pipeline logic ──
  const processCourse = useCallback(async (course: PipelineCourse): Promise<{ ok: boolean; lessonsFilled: number; testsSolved: number; skippedBatches: number; totalQuestions: number }> => {
    const courseId = course.course_id;
    const courseTitle = course.course?.title || "";
    const currentPrompts = getMarketplacePrompts();
    let lessonsFilled = 0;
    let testsSolved = 0;
    let skippedBatches = 0;
    let totalQuestions = 0;

    // 1. Fetch lessons
    setCurrentPhase("Загрузка уроков...");
    let { data: lessons } = await supabase
      .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");

    const currentLessons = lessons || [];

    // 2. Solve existing test questions FIRST (before any structure changes)
    const testIds = currentLessons.filter(l => l.type === "test").map(l => l.id);
    if (testIds.length > 0) {
      const { data: questions } = await supabase
        .from("test_questions").select("id, lesson_id, correct_answer, explanation, question, options").in("lesson_id", testIds);
      // Detect suspicious lessons: all answers identical + no explanations = likely placeholder
      const byLessonMap = new Map<string, any[]>();
      for (const q of questions || []) {
        const arr = byLessonMap.get(q.lesson_id) || [];
        arr.push(q);
        byLessonMap.set(q.lesson_id, arr);
      }
      const suspiciousLessons = new Set<string>();
      for (const [lid, qs] of byLessonMap) {
        if (qs.length > 3) {
          const allSame = qs.every((q: any) => q.correct_answer === qs[0]?.correct_answer);
          const noExplanations = qs.every((q: any) => !q.explanation);
          if (allSame && noExplanations) suspiciousLessons.add(lid);
        }
      }
      const unanswered = (questions || []).filter((q: any) =>
        q.correct_answer === null || q.correct_answer === undefined || suspiciousLessons.has(q.lesson_id)
      );

      totalQuestions = unanswered.length;
      if (unanswered.length > 0) {
        setCurrentPhase(`Решаю тесты: 0/${unanswered.length} вопросов`);
        const byLesson = new Map<string, typeof unanswered>();
        for (const q of unanswered) {
          const arr = byLesson.get(q.lesson_id) || [];
          arr.push(q);
          byLesson.set(q.lesson_id, arr);
        }
        for (const [lessonId, qs] of byLesson) {
          if (stopRef.current) return { ok: false, lessonsFilled, testsSolved, skippedBatches, totalQuestions };
          const lessonInfo = currentLessons.find(l => l.id === lessonId);
          const batchSize = 20;
          for (let i = 0; i < qs.length; i += batchSize) {
      if (stopRef.current) return { ok: false, lessonsFilled, testsSolved, skippedBatches, totalQuestions };
            const batch = qs.slice(i, i + batchSize);
            setCurrentPhase(`Решаю тесты: ${testsSolved}/${unanswered.length} — «${lessonInfo?.title || "Тест"}»`);

            let retries = 0;
            let batchSuccess = false;
            while (retries < 3 && !batchSuccess) {
              try {
                const { data, error } = await supabase.functions.invoke("gigachat", {
                  body: {
                    action: "generate_answers", courseTitle,
                    lessonTitle: lessonInfo?.title || "Тест",
                    questions: batch.map(q => ({ question: q.question, options: q.options || [] })),
                    customSystemPrompt: currentPrompts.answers || undefined,
                  },
                });
                if (error) throw error;
                if (data?.answers && !data.parseError) {
                  for (const ans of data.answers) {
                    const q = batch[ans.questionIndex];
                    if (q && ans.correctAnswer !== undefined) {
                      await supabase.from("test_questions")
                        .update({ correct_answer: ans.correctAnswer, explanation: ans.explanation || null })
                        .eq("id", q.id);
                      testsSolved++;
                    }
                  }
                }
                batchSuccess = true;
                setAiSessionCalls(prev => prev + 1);
              } catch (e) {
                checkFor402(e);
                retries++;
                const errMsg = e instanceof Error ? e.message : String(e);
                console.error(`Test solve attempt ${retries}/3 failed for lesson ${lessonId}:`, errMsg);
                if (retries < 3) {
                  const delay = retries * 5000;
                  setCurrentPhase(`Ошибка, повтор через ${delay / 1000}с... (${retries}/3)`);
                  await new Promise(r => setTimeout(r, delay));
              } else {
                  skippedBatches++;
                  console.error(`Batch skipped after 3 retries for lesson ${lessonId} (skipped: ${skippedBatches})`);
                }
              }
            }
            // Delay between batches to avoid rate limiting
            await new Promise(r => setTimeout(r, 2000));
          }
        }
        setCurrentPhase(`Тесты решены: ${testsSolved}/${unanswered.length}`);
      }
    }

    const textPracticeLessons = currentLessons.filter(l => l.type === "text" || l.type === "practice");
    const needsStructure = textPracticeLessons.length === 0 || currentLessons.length < 3;

    // 3. Generate structure if needed (no tests — filter ensures existing tests untouched)
    if (needsStructure) {
      setCurrentPhase("Генерация структуры...");
      try {
        const { data: structData, error: structErr } = await supabase.functions.invoke("generate-course-structure", {
          body: { title: courseTitle, description: "", customSystemPrompt: currentPrompts.structure || undefined },
        });
        if (structErr) { checkFor402(structErr); throw structErr; }
        const generatedLessons: Array<{ title: string; type: string }> = structData?.lessons || [];
        if (generatedLessons.length > 0) {
          setAiSessionCalls(prev => prev + 1);
          const maxOrder = currentLessons.reduce((mx, l) => Math.max(mx, l.order_index ?? 0), -1);
          const existingTitles = new Set(currentLessons.map(l => l.title.toLowerCase()));
          const newLessons = generatedLessons
            .filter(gl => !existingTitles.has(gl.title.toLowerCase()))
            .filter(gl => gl.type !== "test");
          if (newLessons.length > 0) {
            await supabase.from("lessons").insert(
              newLessons.map((gl, i) => ({
                course_id: courseId, title: gl.title, type: gl.type || "text",
                order_index: maxOrder + 1 + i, content: null,
              }))
            );
          }
          const { data: refreshed } = await supabase
            .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");
          lessons = refreshed;
        }
      } catch (e) {
        if (e instanceof CreditsExhaustedError) throw e;
        console.error("Structure generation failed:", e);
      }
    }

    const allLessons = lessons || [];

    // 4. Fill empty text/practice lessons
    const emptyLessons = allLessons.filter(l =>
      (l.type === "text" || l.type === "practice") && (!l.content || l.content === "[]" || l.content === "" || l.content.length < 50)
    );

    for (let i = 0; i < emptyLessons.length; i++) {
      if (stopRef.current) return { ok: false, lessonsFilled, testsSolved, skippedBatches, totalQuestions };
      const lesson = emptyLessons[i];
      setCurrentPhase(`Контент: "${lesson.title}" (${i + 1}/${emptyLessons.length})`);
      try {
        const { data, error } = await supabase.functions.invoke("gigachat", {
          body: { action: "generate_content", courseTitle, lessonTitle: lesson.title, existingContent: null, customSystemPrompt: currentPrompts.content || undefined },
        });
        if (error) { checkFor402(error); throw error; }
        if (data?.content) {
          await supabase.from("lessons").update({ content: data.content }).eq("id", lesson.id);
          lessonsFilled++;
          setAiSessionCalls(prev => prev + 1);
        }
      } catch (e) {
        if (e instanceof CreditsExhaustedError) throw e;
        console.error(`Content gen failed for ${lesson.id}:`, e);
      }
    }

    // 5. Fix duplicate titles
    const titleCounts = new Map<string, Array<{ id: string; title: string }>>();
    for (const l of allLessons) {
      const arr = titleCounts.get(l.title) || [];
      arr.push(l);
      titleCounts.set(l.title, arr);
    }
    for (const group of titleCounts.values()) {
      if (group.length > 1) {
        for (let i = 1; i < group.length; i++) {
          await supabase.from("lessons").update({ title: `${group[i].title} (${i + 1})` }).eq("id", group[i].id);
        }
      }
    }

    // 6. Mark as validated
    setCurrentPhase("Валидация...");
    await supabase.from("marketplace_courses").update({ is_validated: true } as any).eq("id", course.id);

    return { ok: true, lessonsFilled, testsSolved, skippedBatches, totalQuestions };
  }, []);

  const handleStart = useCallback(async () => {
    stopRef.current = false;
    setIsRunning(true);
    setCompletedLog([]);
    setCurrentIndex(0);
    setQueueOpen(true);
    setSummary(null);
    const startTime = Date.now();
    let totalSolved = 0, totalFilled = 0, totalErrors = 0, totalSuccess = 0, totalSkipped = 0;

    for (let i = 0; i < courses.length; i++) {
      if (stopRef.current) break;
      setCurrentIndex(i);
      const course = courses[i];
      const name = course.course?.title || `Курс ${i + 1}`;

      try {
        const result = await processCourse(course);
        if (!result.ok && stopRef.current) {
          setCompletedLog(prev => [...prev, { courseName: name, status: "error", message: "Остановлено" }]);
          totalErrors++;
          break;
        }
        const hasSkips = result.skippedBatches > 0;
        totalSolved += result.testsSolved;
        totalFilled += result.lessonsFilled;
        totalSkipped += result.skippedBatches;
        totalSuccess++;
        setCompletedLog(prev => [...prev, {
          courseName: name,
          status: "ok",
          lessonsFilled: result.lessonsFilled,
          testsSolved: result.testsSolved,
          skippedBatches: result.skippedBatches,
          totalQuestions: result.totalQuestions,
          message: hasSkips ? `${result.skippedBatches} батч(ей) пропущено` : undefined,
        }]);
        onComplete?.();
      } catch (e: any) {
        if (e instanceof CreditsExhaustedError) {
          console.error("Credits exhausted, stopping pipeline");
          setCompletedLog(prev => [...prev, { courseName: name, status: "error", message: "⚠️ Кредиты ИИ исчерпаны" }]);
          totalErrors++;
          toast.error("🛑 Кредиты ИИ исчерпаны. Конвейер остановлен. GigaChat недоступен (ошибка сертификата), а резервный ИИ вернул 402. Проверьте баланс Lovable AI или настройте GigaChat.", { duration: 15000 });
          break;
        }
        console.error(`Pipeline error for course ${course.course_id}:`, e);
        const phaseInfo = currentPhase ? ` [${currentPhase}]` : "";
        setCompletedLog(prev => [...prev, { courseName: name, status: "error", message: (e?.message || "Ошибка") + phaseInfo }]);
        totalErrors++;
      }
    }

    const duration = Date.now() - startTime;
    const finalSummary: PipelineSummary = {
      totalCourses: courses.length,
      successCourses: totalSuccess,
      errorCourses: totalErrors,
      totalTestsSolved: totalSolved,
      totalLessonsFilled: totalFilled,
      totalSkippedBatches: totalSkipped,
      durationMs: duration,
    };
    setSummary(finalSummary);
    setIsRunning(false);
    setCurrentPhase("");
    const mins = Math.round(duration / 60000);
    toast.success(`Конвейер завершён за ${mins} мин. Решено ${totalSolved} тестов, заполнено ${totalFilled} уроков.`);
  }, [courses, processCourse, onComplete, currentPhase]);

  const handleStop = useCallback(() => {
    stopRef.current = true;
    setCurrentPhase("Остановка...");
  }, []);

  const handleTestRun = useCallback(async () => {
    if (courses.length === 0) return;
    stopRef.current = false;
    setIsTestRunning(true);
    setCompletedLog([]);
    setCurrentIndex(0);
    setQueueOpen(true);

    const course = courses[0];
    const name = course.course?.title || "Курс 1";

    try {
      const result = await processCourse(course);
      setCompletedLog([{
        courseName: name,
        status: result.ok ? "ok" : "error",
        message: result.ok ? undefined : "Остановлено",
        lessonsFilled: result.lessonsFilled,
        testsSolved: result.testsSolved,
      }]);
      toast[result.ok ? "success" : "warning"](`Тест: ${name} — ${result.ok ? "готово" : "прервано"}`);
    } catch (e: any) {
      console.error("Test run error:", e);
      setCompletedLog([{ courseName: name, status: "error", message: e?.message || "Ошибка" }]);
      toast.error(`Тест: ошибка — ${e?.message}`);
    }

    setIsTestRunning(false);
    setCurrentPhase("");
    onComplete?.();
  }, [courses, processCourse, onComplete]);

  const isBusy = isRunning || isTestRunning;

  if (totalCount === 0 && parsedCourses.length === 0) return null;

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
            <Loader2 className={`w-4 h-4 ${isRunning ? "animate-spin" : "hidden"}`} />
            Конвейер заполнения
            {totalCount > 0 && <Badge variant="secondary" className="ml-1">{totalCount} курсов</Badge>}
          </CardTitle>
          {totalCount > 0 && (
            !isBusy ? (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={handleTestRun} className="gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5" />Тест 1 курса
                </Button>
                <Button size="sm" onClick={handleStart} className="gap-1.5">
                  <Play className="w-3.5 h-3.5" />Запустить все
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="destructive" onClick={handleStop} className="gap-1.5">
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
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={loadTestStats}
                disabled={isLoadingStats}
                title="Обновить статистику"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStats ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {isLoadingStats ? (
              <div className="text-xs text-muted-foreground">Загрузка...</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {/* In progress */}
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
                {/* Ready */}
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
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={loadAiStats}
              disabled={isLoadingAiStats}
              title="Обновить"
            >
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
              {parsedCourses.length > 0 && <Badge variant="secondary" className="text-[10px]">{parsedCourses.length}</Badge>}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-3 mt-2">
              <div className="border-2 border-dashed rounded-xl p-4 text-center space-y-2">
                <FileSpreadsheet className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-xs text-muted-foreground">Колонки: «Название» (обязательно), «Описание», «Длительность»</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelFile} />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="rounded-xl">
                  <Upload className="w-3.5 h-3.5 mr-1.5" />Выбрать файл
                </Button>
              </div>

              {parsedCourses.length > 0 && (
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
                        {parsedCourses.map((c, i) => (
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
                  {isImporting && (
                    <div className="space-y-1">
                      <Progress value={(importProgress / importTotal) * 100} className="h-2" />
                      <p className="text-[10px] text-muted-foreground text-center">{importProgress} / {importTotal}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setParsedCourses([])} className="flex-1 rounded-xl">Очистить</Button>
                    <Button size="sm" onClick={handleCreateAll} disabled={isImporting} className="flex-1 rounded-xl">
                      {isImporting ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Создание...</> : <>Создать все ({parsedCourses.length})</>}
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
