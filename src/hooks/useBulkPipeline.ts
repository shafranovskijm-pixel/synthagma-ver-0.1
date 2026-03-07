import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type MarketplacePrompts,
  getMarketplacePrompts,
} from "@/components/admin/MarketplaceSettings";

// ── Types ──

export interface PipelineCourse {
  id: string;
  course_id: string;
  course?: { id: string; title: string; description: string | null; duration: string | null };
}

export interface LogEntry {
  courseName: string;
  status: "ok" | "error" | "pending" | "active";
  message?: string;
  lessonsFilled?: number;
  testsSolved?: number;
  skippedBatches?: number;
  totalQuestions?: number;
}

export interface PipelineSummary {
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
  if (error?.context?.status === 402 || error?.status === 402) {
    throw new CreditsExhaustedError();
  }
  const msg = error?.message || String(error || "");
  if (msg.includes("402") || msg.includes("кредит") || msg.includes("баланс") || msg.includes("payment_required") || msg.includes("Not enough credits")) {
    throw new CreditsExhaustedError();
  }
}

export { CreditsExhaustedError, checkFor402 };

// ── Hook ──

interface UseBulkPipelineProps {
  courses: PipelineCourse[];
  onComplete: () => void;
}

export function useBulkPipeline({ courses, onComplete }: UseBulkPipelineProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentPhase, setCurrentPhase] = useState("");
  const [completedLog, setCompletedLog] = useState<LogEntry[]>([]);
  const stopRef = useRef(false);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [aiSessionCalls, setAiSessionCalls] = useState(0);
  const currentPhaseRef = useRef("");

  // Keep ref in sync
  const updatePhase = useCallback((phase: string) => {
    currentPhaseRef.current = phase;
    setCurrentPhase(phase);
  }, []);

  const totalCount = courses.length;
  const completedCount = completedLog.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const processCourse = useCallback(async (course: PipelineCourse): Promise<{ ok: boolean; lessonsFilled: number; testsSolved: number; skippedBatches: number; totalQuestions: number }> => {
    const courseId = course.course_id;
    const courseTitle = course.course?.title || "";
    const currentPrompts = getMarketplacePrompts();
    let lessonsFilled = 0;
    let testsSolved = 0;
    let skippedBatches = 0;
    let totalQuestions = 0;

    // 1. Fetch lessons
    updatePhase("Загрузка уроков...");
    let { data: lessons } = await supabase
      .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");

    const currentLessons = lessons || [];

    // 2. Solve existing test questions FIRST
    const testIds = currentLessons.filter(l => l.type === "test").map(l => l.id);
    if (testIds.length > 0) {
      const { data: questions } = await supabase
        .from("test_questions").select("id, lesson_id, correct_answer, explanation, question, options").in("lesson_id", testIds);
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
        updatePhase(`Решаю тесты: 0/${unanswered.length} вопросов`);
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
            updatePhase(`Решаю тесты: ${testsSolved}/${unanswered.length} — «${lessonInfo?.title || "Тест"}»`);

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
                if (error) { checkFor402(error); throw error; }
                if (data?.error) { checkFor402(data); throw new Error(data.error); }
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
                console.error(`Test solve attempt ${retries}/3 failed for lesson ${lessonId}:`, e instanceof Error ? e.message : String(e));
                if (retries < 3) {
                  const delay = retries * 5000;
                  updatePhase(`Ошибка, повтор через ${delay / 1000}с... (${retries}/3)`);
                  await new Promise(r => setTimeout(r, delay));
                } else {
                  skippedBatches++;
                }
              }
            }
            // Delay between batches
            await new Promise(r => setTimeout(r, 5000));
          }
          // Delay between lessons
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }

    // 3. Generate structure if needed
    if (currentLessons.length < 3) {
      updatePhase("Генерация структуры...");
      try {
        const { data, error } = await supabase.functions.invoke("gigachat", {
          body: {
            action: "generate_structure", courseTitle,
            existingLessons: currentLessons.map(l => ({ title: l.title, type: l.type })),
            customSystemPrompt: currentPrompts.structure || undefined,
          },
        });
        if (error) { checkFor402(error); throw error; }
        if (data?.error) { checkFor402(data); throw new Error(data.error); }
        if (data?.lessons && Array.isArray(data.lessons)) {
          const newLessons = data.lessons
            .filter((l: any) => l.type !== "test")
            .map((l: any, idx: number) => ({
              course_id: courseId,
              title: l.title,
              type: l.type || "text",
              content: null,
              order_index: currentLessons.length + idx,
            }));
          if (newLessons.length > 0) {
            await supabase.from("lessons").insert(newLessons);
          }
          setAiSessionCalls(prev => prev + 1);
        }
        await new Promise(r => setTimeout(r, 3000));
      } catch (e) {
        if (e instanceof CreditsExhaustedError) throw e;
        console.error("Structure gen failed:", e);
      }
    }

    // 4. Fill empty text lessons
    const { data: allLessons } = await supabase
      .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");

    const emptyLessons = (allLessons || []).filter(l =>
      (l.type === "text" || l.type === "practice") && (!l.content || l.content === "[]" || l.content === "" || l.content.length < 50)
    );

    for (let i = 0; i < emptyLessons.length; i++) {
      if (stopRef.current) return { ok: false, lessonsFilled, testsSolved, skippedBatches, totalQuestions };
      const lesson = emptyLessons[i];
      updatePhase(`Контент: «${lesson.title}» (${i + 1}/${emptyLessons.length})`);
      try {
        const { data, error } = await supabase.functions.invoke("gigachat", {
          body: { action: "generate_content", courseTitle, lessonTitle: lesson.title, existingContent: null, customSystemPrompt: currentPrompts.content || undefined },
        });
        if (error) { checkFor402(error); throw error; }
        if (data?.error) { checkFor402(data); throw new Error(data.error); }
        if (data?.content) {
          await supabase.from("lessons").update({ content: data.content }).eq("id", lesson.id);
          lessonsFilled++;
          setAiSessionCalls(prev => prev + 1);
        }
        await new Promise(r => setTimeout(r, 3000));
      } catch (e) {
        if (e instanceof CreditsExhaustedError) throw e;
        console.error(`Content gen failed for ${lesson.id}:`, e);
      }
    }

    // 5. Fix duplicate titles
    const titleCounts = new Map<string, Array<{ id: string; title: string }>>();
    for (const l of (allLessons || [])) {
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
    updatePhase("Валидация...");
    await supabase.from("marketplace_courses").update({ is_validated: true } as any).eq("id", course.id);

    return { ok: true, lessonsFilled, testsSolved, skippedBatches, totalQuestions };
  }, [updatePhase]);

  const handleStart = useCallback(async () => {
    stopRef.current = false;
    setIsRunning(true);
    setCompletedLog([]);
    setCurrentIndex(0);
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
          message: result.skippedBatches > 0 ? `${result.skippedBatches} батч(ей) пропущено` : undefined,
        }]);
      } catch (e: any) {
        if (e instanceof CreditsExhaustedError) {
          setCompletedLog(prev => [...prev, { courseName: name, status: "error", message: "⚠️ Кредиты ИИ исчерпаны" }]);
          totalErrors++;
          break;
        }
        const phaseInfo = currentPhaseRef.current ? ` [${currentPhaseRef.current}]` : "";
        setCompletedLog(prev => [...prev, { courseName: name, status: "error", message: (e?.message || "Ошибка") + phaseInfo }]);
        totalErrors++;
      }
    }

    const duration = Date.now() - startTime;
    setSummary({
      totalCourses: courses.length,
      successCourses: totalSuccess,
      errorCourses: totalErrors,
      totalTestsSolved: totalSolved,
      totalLessonsFilled: totalFilled,
      totalSkippedBatches: totalSkipped,
      durationMs: duration,
    });
    setIsRunning(false);
    updatePhase("");
    const mins = Math.round(duration / 60000);
    const { toast } = await import("sonner");
    toast.success(`Конвейер завершён за ${mins} мин. Решено ${totalSolved} тестов, заполнено ${totalFilled} уроков.`);
    onComplete?.();
  }, [courses, processCourse, onComplete, updatePhase]);

  const handleStop = useCallback(() => {
    stopRef.current = true;
    updatePhase("Остановка...");
  }, [updatePhase]);

  const handleTestRun = useCallback(async () => {
    if (courses.length === 0) return;
    stopRef.current = false;
    setIsTestRunning(true);
    setCompletedLog([]);
    setCurrentIndex(0);

    const course = courses[0];
    const name = course.course?.title || "Курс 1";
    const { toast } = await import("sonner");

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
      setCompletedLog([{ courseName: name, status: "error", message: e?.message || "Ошибка" }]);
      toast.error(`Тест: ошибка — ${e?.message}`);
    }

    setIsTestRunning(false);
    updatePhase("");
    onComplete?.();
  }, [courses, processCourse, onComplete, updatePhase]);

  const isBusy = isRunning || isTestRunning;

  return {
    isRunning, isTestRunning, isBusy,
    currentIndex, currentPhase, completedLog, summary,
    totalCount, completedCount, progressPercent,
    aiSessionCalls,
    handleStart, handleStop, handleTestRun,
    setQueueOpen: undefined as any, // handled by parent
  };
}
