import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { markdownToBlocks, blocksToJson } from "@/components/course-builder/BlockEditor";
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

function checkFor402(error: unknown) {
  const err = error as Record<string, unknown> | null;
  if ((err?.context as Record<string, unknown>)?.status === 402 || err?.status === 402) {
    throw new CreditsExhaustedError();
  }
  const msg = (err?.message as string) || String(error || "");
  if (msg.includes("402") || msg.includes("кредит") || msg.includes("баланс") || msg.includes("payment_required") || msg.includes("Not enough credits")) {
    throw new CreditsExhaustedError();
  }
}

export { CreditsExhaustedError, checkFor402 };

// ── Resume helpers ──
const RESUME_KEY = "pipeline_completed_ids";

function getCompletedIds(): Set<string> {
  try {
    const saved = localStorage.getItem(RESUME_KEY);
    if (saved) return new Set(JSON.parse(saved));
  } catch {}
  return new Set();
}

function saveCompletedId(id: string) {
  const ids = getCompletedIds();
  ids.add(id);
  localStorage.setItem(RESUME_KEY, JSON.stringify([...ids]));
}

function clearCompletedIds() {
  localStorage.removeItem(RESUME_KEY);
}

// ── Adaptive delay ──
let lastModelProvider: "gigachat" | "lovable" | "unknown" = "unknown";

function getDelay(type: "batch" | "lesson"): number {
  if (lastModelProvider === "lovable") return type === "batch" ? 800 : 600;
  if (lastModelProvider === "gigachat") return type === "batch" ? 2000 : 1500;
  return type === "batch" ? 1500 : 1000;
}

function detectProvider(data: Record<string, unknown> | null) {
  const model = data?.model || data?.modelUsed || "";
  if (typeof model === "string") {
    const lower = model.toLowerCase();
    if (lower.includes("gemini") || lower.includes("gpt") || lower.includes("lovable")) {
      lastModelProvider = "lovable";
    } else if (lower.includes("gigachat")) {
      lastModelProvider = "gigachat";
    }
  }
}

// ── Timeout wrapper ──
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} (${ms / 1000}s)`)), ms)
    ),
  ]);
}

const AI_CALL_TIMEOUT = 90_000; // 90s per AI call
const PARALLEL_ITEM_TIMEOUT = 120_000; // 120s per parallel item
const MAX_CLIENT_RUNTIME = 2 * 60 * 60 * 1000; // 2 hours

// ── Parallel with concurrency limit + per-item timeout ──
async function parallelMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  abortSignal?: { current: boolean }
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      if (abortSignal?.current) break;
      const i = nextIndex++;
      try {
        results[i] = await withTimeout(fn(items[i], i), PARALLEL_ITEM_TIMEOUT, `parallelMap[${i}]`);
      } catch (e) {
        if (e instanceof CreditsExhaustedError) throw e;
        if (abortSignal?.current) break;
        console.error(`[parallelMap] Item ${i} failed/timed out:`, e instanceof Error ? e.message : String(e));
        results[i] = undefined as unknown as R;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── Smart filter for already-solved questions ──
function isReliablySolved(q: { correct_answer: number | null; explanation?: string | null }): boolean {
  if (q.correct_answer === null || q.correct_answer === undefined) return false;
  // Has answer AND meaningful explanation → reliably solved
  if (q.explanation && q.explanation.length > 20) return true;
  return false;
}

// ── Hook ──

interface UseBulkPipelineProps {
  courses: PipelineCourse[];
  onComplete: () => void;
  enableVerification?: boolean;
  aiProvider?: string;
  gigachatModel?: string;
  lovableModel?: string;
}

export function useBulkPipeline({ courses, onComplete, enableVerification = false, aiProvider, gigachatModel, lovableModel }: UseBulkPipelineProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentPhase, setCurrentPhase] = useState("");
  const [completedLog, setCompletedLog] = useState<LogEntry[]>([]);
  const stopRef = useRef(false);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [aiSessionCalls, setAiSessionCalls] = useState(0);
  const currentPhaseRef = useRef("");
  const [hasResumableProgress, setHasResumableProgress] = useState(() => getCompletedIds().size > 0);

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

      const byLessonMap = new Map<string, Array<{ id: string; lesson_id: string; correct_answer: number | null; explanation: string | null; question: string; options: unknown }>>();
      for (const q of questions || []) {
        const arr = byLessonMap.get(q.lesson_id) || [];
        arr.push(q);
        byLessonMap.set(q.lesson_id, arr);
      }

      // Suspicious detection: all same answer + no explanations
      const suspiciousLessons = new Set<string>();
      for (const [lid, qs] of byLessonMap) {
        if (qs.length > 3) {
          const allSame = qs.every((q) => q.correct_answer === qs[0]?.correct_answer);
          const noExplanations = qs.every((q) => !q.explanation);
          if (allSame && noExplanations) suspiciousLessons.add(lid);
        }
      }

      // Smart filter: skip reliably solved questions
      const unanswered = (questions || []).filter((q) => {
        if (suspiciousLessons.has(q.lesson_id)) return true;
        return !isReliablySolved(q);
      });

      totalQuestions = unanswered.length;
      if (unanswered.length > 0) {
        updatePhase(`Решаю тесты: 0/${unanswered.length} вопросов`);
        const byLesson = new Map<string, typeof unanswered>();
        for (const q of unanswered) {
          const arr = byLesson.get(q.lesson_id) || [];
          arr.push(q);
          byLesson.set(q.lesson_id, arr);
        }
        const lessonEntries = Array.from(byLesson.entries());
        await parallelMap(lessonEntries, 5, async ([lessonId, qs]) => {
          if (stopRef.current) return;
          const lessonInfo = currentLessons.find((l) => l.id === lessonId);
          const batchSize = 60;
          for (let i = 0; i < qs.length; i += batchSize) {
            if (stopRef.current) return;
            const batch = qs.slice(i, i + batchSize);
            updatePhase(`Решаю тесты: ${testsSolved}/${unanswered.length} — «${lessonInfo?.title || "Тест"}»`);

            let retries = 0;
            let batchSuccess = false;
            while (retries < 3 && !batchSuccess && !stopRef.current) {
              try {
                const { data, error } = await withTimeout(
                  safeInvoke<any>("gigachat", {
                    body: {
                      action: "generate_answers", courseTitle,
                      lessonTitle: lessonInfo?.title || "Тест",
                      questions: batch.map(q => ({ question: q.question, options: q.options || [] })),
                      customSystemPrompt: currentPrompts.answers || undefined,
                      ai_provider: aiProvider,
                      gigachat_model: gigachatModel,
                      lovable_model: lovableModel,
                      stream_index: i % 3,
                    },
                  }),
                  AI_CALL_TIMEOUT, "generate_answers"
                );
                if (error) { checkFor402(error); throw error; }
                if (data?.error) { checkFor402(data); throw new Error(data.error); }
                detectProvider(data);
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
            await new Promise(r => setTimeout(r, getDelay("batch")));
          }
        });
    }

    // 2b. Verification pass — re-check answers with a second model
    if (enableVerification && testsSolved > 0 && testIds.length > 0) {
      const { data: solvedQuestions } = await supabase
        .from("test_questions").select("id, lesson_id, correct_answer, explanation, question, options").in("lesson_id", testIds);

      // Only verify questions that were just solved (have answer but short/missing explanation or were suspicious)
      const toVerify = (solvedQuestions || []).filter((q) =>
        q.correct_answer !== null && q.correct_answer !== undefined &&
        (!q.explanation || q.explanation.length < 30)
      );

      if (toVerify.length > 0) {
        updatePhase(`Верификация: 0/${toVerify.length} вопросов`);
        let verified = 0;
        let corrected = 0;

        const byLesson = new Map<string, typeof toVerify>();
        for (const q of toVerify) {
          const arr = byLesson.get(q.lesson_id) || [];
          arr.push(q);
          byLesson.set(q.lesson_id, arr);
        }

        const verifyEntries = Array.from(byLesson.entries());
        await parallelMap(verifyEntries, 5, async ([lessonId, qs]) => {
          if (stopRef.current) return;
          const lessonInfo = currentLessons.find(l => l.id === lessonId);
          const batchSize = 60;
          for (let i = 0; i < qs.length; i += batchSize) {
            if (stopRef.current) return;
            const batch = qs.slice(i, i + batchSize);
            updatePhase(`Верификация: ${verified}/${toVerify.length} — «${lessonInfo?.title || "Тест"}»`);

            try {
              const { data, error } = await withTimeout(
                safeInvoke<any>("gigachat", {
                  body: {
                    action: "verify_answers",
                    courseTitle,
                    lessonTitle: lessonInfo?.title || "Тест",
                    questions: batch.map(q => ({ question: q.question, options: q.options || [] })),
                    previousAnswers: batch.map(q => ({
                      correctAnswer: q.correct_answer,
                      explanation: q.explanation || "",
                    })),
                    ai_provider: aiProvider,
                    gigachat_model: gigachatModel,
                    lovable_model: lovableModel,
                    stream_index: i % 3,
                  },
                }),
                AI_CALL_TIMEOUT, "verify_answers"
              );
              if (error) { checkFor402(error); throw error; }
              if (data?.error) { checkFor402(data); throw new Error(data.error); }
              detectProvider(data);
              if (data?.answers && !data.parseError) {
                for (const ans of data.answers) {
                  const q = batch[ans.questionIndex];
                  if (q && ans.correctAnswer !== undefined) {
                    const changed = ans.changed === true || ans.correctAnswer !== q.correct_answer;
                    if (changed || (ans.explanation && ans.explanation.length > (q.explanation?.length || 0))) {
                      await supabase.from("test_questions")
                        .update({
                          correct_answer: ans.correctAnswer,
                          explanation: ans.explanation || q.explanation || null,
                        })
                        .eq("id", q.id);
                      if (changed) corrected++;
                    }
                    verified++;
                  }
                }
              }
              setAiSessionCalls(prev => prev + 1);
            } catch (e) {
              checkFor402(e);
              console.error(`Verification failed for lesson ${lessonId}:`, e instanceof Error ? e.message : String(e));
            }
            await new Promise(r => setTimeout(r, getDelay("batch")));
          }
        });

        if (corrected > 0) {
          console.log(`[Verification] Corrected ${corrected}/${verified} answers for course "${courseTitle}"`);
        }
      }
    }
    }

    // 3. Generate structure if needed
    if (currentLessons.length < 3) {
      updatePhase("Генерация структуры...");
      try {
        const { data, error } = await withTimeout(
            safeInvoke<any>("gigachat", {
            body: {
              action: "generate_structure", courseTitle,
              existingLessons: currentLessons.map(l => ({ title: l.title, type: l.type })),
              customSystemPrompt: currentPrompts.structure || undefined,
              ai_provider: aiProvider,
              gigachat_model: gigachatModel,
              lovable_model: lovableModel,
              stream_index: 0,
            },
          }),
          AI_CALL_TIMEOUT, "generate_structure"
        );
        if (error) { checkFor402(error); throw error; }
        if (data?.error) { checkFor402(data); throw new Error(data.error); }
        detectProvider(data);
        if (data?.lessons && Array.isArray(data.lessons)) {
          const newLessons = data.lessons
            .filter((l: Record<string, unknown>) => l.type !== "test")
            .map((l: Record<string, unknown>, idx: number) => ({
              course_id: courseId,
              title: l.title as string,
              type: (l.type as string) || "text",
              content: null,
              order_index: currentLessons.length + idx,
            }));
          if (newLessons.length > 0) {
            await supabase.from("lessons").insert(newLessons);
          }
          setAiSessionCalls(prev => prev + 1);
        }
        await new Promise(r => setTimeout(r, getDelay("lesson")));
      } catch (e) {
        if (e instanceof CreditsExhaustedError) throw e;
        console.error("Structure gen failed:", e);
      }
    }

    // 4. Fill empty text lessons — parallel with concurrency=2
    const { data: allLessons } = await supabase
      .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");

    const emptyLessons = (allLessons || []).filter(l =>
      (l.type === "text" || l.type === "practice") && (!l.content || l.content === "[]" || l.content === "" || l.content.length < 50)
    );

    // In-memory cache for content reuse within this pipeline run
    const contentCache = new Map<string, string>();

    if (emptyLessons.length > 0) {
      let filledSoFar = 0;
      await parallelMap(emptyLessons, 5, async (lesson, i) => {
        if (stopRef.current) return;
        updatePhase(`Контент: «${lesson.title}» (${filledSoFar + 1}/${emptyLessons.length})`);
        try {
          const normalizedTitle = lesson.title.toLowerCase().trim();

          // ── Step A: Check in-memory cache ──
          const cached = contentCache.get(normalizedTitle);
          if (cached) {
            await supabase.from("lessons").update({ content: cached }).eq("id", lesson.id);
            lessonsFilled++;
            filledSoFar++;
            console.log(`[cache-hit] Reused content for "${lesson.title}"`);
            return;
          }

          // ── Step B: Search Knowledge Bank (pg_trgm) ──
          try {
            const { data: kbResult } = await supabase.rpc("find_knowledge_bank_content", {
              p_title: lesson.title,
              p_min_similarity: 0.3,
            });
            if (kbResult && kbResult.length > 0 && kbResult[0].content) {
              const kbContent = kbResult[0].content;
              contentCache.set(normalizedTitle, kbContent);
              await supabase.from("lessons").update({ content: kbContent }).eq("id", lesson.id);
              lessonsFilled++;
              filledSoFar++;
              console.log(`[kb-hit] Reused from knowledge bank "${kbResult[0].title}" (score: ${kbResult[0].similarity_score?.toFixed(2)}) for "${lesson.title}"`);
              return;
            }
          } catch (e) {
            console.warn("[kb-search] Knowledge bank search failed, continuing:", e);
          }

          // ── Step C: Search DB for similar content (pg_trgm) ──
          const { data: similar } = await supabase.rpc("find_similar_lesson_content", {
            p_title: lesson.title,
            p_min_similarity: 0.4,
          });
          if (similar && similar.length > 0 && similar[0].content) {
            const reusedContent = similar[0].content;
            contentCache.set(normalizedTitle, reusedContent);
            await supabase.from("lessons").update({ content: reusedContent }).eq("id", lesson.id);
            lessonsFilled++;
            filledSoFar++;
            console.log(`[db-hit] Reused from "${similar[0].title}" (score: ${similar[0].similarity_score?.toFixed(2)}) for "${lesson.title}"`);
            return;
          }

          // ── Step D: Fallback to AI generation ──
          const { data, error } = await withTimeout(
            safeInvoke<any>("gigachat", {
              body: { action: "generate_content", courseTitle, lessonTitle: lesson.title, existingContent: null, customSystemPrompt: currentPrompts.content || undefined, ai_provider: aiProvider, gigachat_model: gigachatModel, lovable_model: lovableModel, stream_index: i % 3 },
            }),
            AI_CALL_TIMEOUT, "generate_content"
          );
          if (error) { checkFor402(error); throw error; }
          if (data?.error) { checkFor402(data); throw new Error(data.error); }
          detectProvider(data);
          if (data?.content) {
            const blocks = markdownToBlocks(data.content);
            const jsonContent = blocks.length > 0 ? blocksToJson(blocks) : data.content;
            contentCache.set(normalizedTitle, jsonContent);
            await supabase.from("lessons").update({ content: jsonContent }).eq("id", lesson.id);
            lessonsFilled++;
            filledSoFar++;
            setAiSessionCalls(prev => prev + 1);
          }
          await new Promise(r => setTimeout(r, getDelay("lesson")));
        } catch (e) {
          if (e instanceof CreditsExhaustedError) throw e;
          console.error(`Content gen failed for ${lesson.id}:`, e);
        }
      });
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

  const handleStart = useCallback(async (resume = false) => {
    stopRef.current = false;
    setIsRunning(true);
    setCompletedLog([]);
    setCurrentIndex(0);
    setSummary(null);

    const completedIds = resume ? getCompletedIds() : new Set<string>();
    if (!resume) clearCompletedIds();

    const startTime = Date.now();
    let totalSolved = 0, totalFilled = 0, totalErrors = 0, totalSuccess = 0, totalSkipped = 0;

    for (let i = 0; i < courses.length; i++) {
      if (stopRef.current) break;
      // Global 2-hour timeout
      if (Date.now() - startTime > MAX_CLIENT_RUNTIME) {
        const { toast } = await import("sonner");
        toast.warning("Конвейер работает более 2 часов — автоматическая остановка с сохранением прогресса.");
        break;
      }
      const course = courses[i];

      // Skip already completed (resume mode)
      if (completedIds.has(course.id)) {
        setCompletedLog(prev => [...prev, { courseName: course.course?.title || `Курс ${i + 1}`, status: "ok", message: "Ранее обработан" }]);
        totalSuccess++;
        continue;
      }

      setCurrentIndex(i);
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
        saveCompletedId(course.id);
        setHasResumableProgress(true);
        setCompletedLog(prev => [...prev, {
          courseName: name,
          status: "ok",
          lessonsFilled: result.lessonsFilled,
          testsSolved: result.testsSolved,
          skippedBatches: result.skippedBatches,
          totalQuestions: result.totalQuestions,
          message: result.skippedBatches > 0 ? `${result.skippedBatches} батч(ей) пропущено` : undefined,
        }]);
      } catch (e: unknown) {
        if (e instanceof CreditsExhaustedError) {
          setCompletedLog(prev => [...prev, { courseName: name, status: "error", message: "⚠️ Кредиты ИИ исчерпаны" }]);
          totalErrors++;
          break;
        }
        const phaseInfo = currentPhaseRef.current ? ` [${currentPhaseRef.current}]` : "";
        setCompletedLog(prev => [...prev, { courseName: name, status: "error", message: ((e instanceof Error ? e.message : String(e)) || "Ошибка") + phaseInfo }]);
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
    setIsRunning(false);
    setIsTestRunning(false);
    updatePhase("Остановлено");
    import("sonner").then(({ toast }) => toast.info("Конвейер остановлен"));
  }, [updatePhase]);

  const handleResetProgress = useCallback(() => {
    clearCompletedIds();
    setHasResumableProgress(false);
  }, []);

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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Ошибка";
      setCompletedLog([{ courseName: name, status: "error", message: msg }]);
      toast.error(`Тест: ошибка — ${msg}`);
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
    hasResumableProgress,
    handleStart, handleStop, handleTestRun, handleResetProgress,
    setQueueOpen: undefined as unknown as React.Dispatch<React.SetStateAction<boolean>>,
  };
}
