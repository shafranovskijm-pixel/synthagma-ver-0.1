/**
 * Server-side bulk pipeline: processes marketplace courses on backend.
 * Survives tab closure. Client polls `pipeline_runs` table for progress.
 *
 * Actions:
 *   start  — create a run and begin processing
 *   stop   — set status to 'stopping'
 *   resume — continue a partial run
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI, callAIRoundRobin } from "../_shared/gigachat-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Max runtime safety margin (leave 30s before typical edge function timeout)
const MAX_RUNTIME_MS = 240_000; // 4 min

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function userClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

// ── AI helpers ──

interface PromptSet {
  structure?: string;
  content?: string;
  answers?: string;
}

const DEFAULT_ANSWERS_PROMPT = `Ты эксперт в области промышленной безопасности, охраны труда и нормативов Ростехнадзора. 
Тебе даны тестовые вопросы с вариантами ответов. Определи правильный ответ для каждого вопроса.
Отвечай СТРОГО в формате JSON-массива:
[{"questionIndex": 0, "correctAnswer": 2, "explanation": "Согласно ФЗ-116..."}]
Отвечай ТОЛЬКО JSON-массивом, без markdown-обертки.`;

const DEFAULT_CONTENT_PROMPT = `Ты эксперт по промышленной безопасности и нормативам Ростехнадзора. Создай подробный учебный материал.
Правила:
1. Структурированный текст с заголовками (используй Markdown)
2. Ссылки на нормативные документы
3. Практические примеры
4. Минимум 500 слов
5. На русском языке`;

const VERIFY_PROMPT = `Ты эксперт-верификатор в области промышленной безопасности, охраны труда и нормативов Ростехнадзора.
Тебе даны вопросы с предыдущими ответами ИИ. НЕЗАВИСИМО проверь каждый вопрос.
Отвечай СТРОГО в формате JSON-массива:
[{"questionIndex": 0, "correctAnswer": 2, "explanation": "...", "changed": false}]
Отвечай ТОЛЬКО JSON-массивом.`;

function parseJsonResponse(text: string): any[] {
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(cleaned);
}

// Parallel execution with concurrency limit
async function processInParallel<T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<R>,
  shouldStop?: () => Promise<boolean>,
  delayMs = 1500,
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  while (i < items.length) {
    if (shouldStop && await shouldStop()) break;
    const chunk = items.slice(i, i + concurrency);
    const promises = chunk.map((item, ci) => {
      const delay = ci * delayMs; // stagger starts
      return new Promise<R>((resolve, reject) => {
        setTimeout(() => handler(item, i + ci).then(resolve, reject), delay);
      });
    });
    const chunkResults = await Promise.allSettled(promises);
    for (const r of chunkResults) {
      if (r.status === "fulfilled") results.push(r.value);
      else {
        const msg = (r.reason as any)?.message || "";
        if (msg.includes("402")) throw r.reason;
        console.error("[bulk-pipeline] Parallel task failed:", msg);
      }
    }
    i += concurrency;
    if (i < items.length) await new Promise(r => setTimeout(r, delayMs));
  }
  return results;
}

// Timeout wrapper for AI calls
const AI_CALL_TIMEOUT = 120_000; // 120s

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} (${ms / 1000}s)`)), ms)
    ),
  ]);
}

// ── Process a single course ──

async function processCourse(
  db: ReturnType<typeof serviceClient>,
  courseId: string,
  courseTitle: string,
  prompts: PromptSet,
  enableVerification: boolean,
  runId: string,
  updatePhase: (phase: string) => Promise<void>,
  shouldStop: () => Promise<boolean>,
  aiProvider?: string,
  gigachatModel?: string,
  lovableModel?: string,
  taskCounter?: { value: number },
): Promise<{ ok: boolean; testsSolved: number; lessonsFilled: number; skippedBatches: number; totalQuestions: number }> {
  let testsSolved = 0;
  let lessonsFilled = 0;
  let skippedBatches = 0;
  let totalQuestions = 0;

  // 1. Fetch lessons
  await updatePhase("Загрузка уроков...");
  const { data: lessons } = await db
    .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");
  const currentLessons = lessons || [];

  // 2. Solve test questions
  const testIds = currentLessons.filter(l => l.type === "test").map(l => l.id);
  if (testIds.length > 0) {
    const { data: questions } = await db
      .from("test_questions").select("id, lesson_id, correct_answer, explanation, question, options").in("lesson_id", testIds);

    // Suspicious detection
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
        const noExpl = qs.every((q: any) => !q.explanation);
        if (allSame && noExpl) suspiciousLessons.add(lid);
      }
    }

    const unanswered = (questions || []).filter((q: any) => {
      if (suspiciousLessons.has(q.lesson_id)) return true;
      if (q.correct_answer === null || q.correct_answer === undefined) return true;
      if (q.explanation && q.explanation.length > 20) return false;
      return true;
    });

    totalQuestions = unanswered.length;
    if (unanswered.length > 0) {
      const byLesson = new Map<string, typeof unanswered>();
      for (const q of unanswered) {
        const arr = byLesson.get(q.lesson_id) || [];
        arr.push(q);
        byLesson.set(q.lesson_id, arr);
      }

      // Process lessons in parallel (concurrency=2)
      const lessonEntries = Array.from(byLesson.entries());
      
      const solveLesson = async ([lessonId, qs]: [string, any[]]) => {
        const lessonInfo = currentLessons.find(l => l.id === lessonId);
        const batchSize = 40;
        let localSolved = 0;
        let localSkipped = 0;

        for (let i = 0; i < qs.length; i += batchSize) {
          if (await shouldStop()) return { solved: localSolved, skipped: localSkipped, stopped: true };
          const batch = qs.slice(i, i + batchSize);
          await updatePhase(`Тесты: ${testsSolved + localSolved}/${unanswered.length} — «${lessonInfo?.title || "Тест"}»`);

          let retries = 0;
          let success = false;
          while (retries < 3 && !success) {
            try {
              const questionsText = batch.map((q: any, idx: number) => {
                const opts = (q.options || []).map((o: any, j: number) => {
                  const text = typeof o === "string" ? o : (o?.text || o?.label || String(o));
                  return `  ${j + 1}) ${text}`;
                }).join("\n");
                return `Вопрос ${idx + 1}: ${q.question}\n${opts}`;
              }).join("\n\n");

              const currentTaskIdx = taskCounter ? taskCounter.value++ : undefined;
              const { text: response } = await withTimeout(
                callAI([
                  { role: "system", content: prompts.answers || DEFAULT_ANSWERS_PROMPT },
                  { role: "user", content: `Курс: "${courseTitle}"\nУрок: "${lessonInfo?.title || "Тест"}"\n\n${questionsText}` },
                ], 16384, aiProvider, gigachatModel, lovableModel, currentTaskIdx),
                AI_CALL_TIMEOUT, "callAI:answers"
              );

              const answers = parseJsonResponse(response);
              for (const ans of answers) {
                const q = batch[ans.questionIndex];
                if (q && ans.correctAnswer !== undefined) {
                  await db.from("test_questions")
                    .update({ correct_answer: ans.correctAnswer, explanation: ans.explanation || null })
                    .eq("id", q.id);
                  localSolved++;
                }
              }
              success = true;
            } catch (e: any) {
              if (e?.message?.includes("402")) throw e;
              retries++;
              console.error(`[bulk-pipeline] Test batch attempt ${retries}/3:`, e?.message);
              if (retries < 3) await new Promise(r => setTimeout(r, retries * 5000));
              else localSkipped++;
            }
          }
          await new Promise(r => setTimeout(r, 3000));
        }
        return { solved: localSolved, skipped: localSkipped, stopped: false };
      };

      const lessonResults = await processInParallel(lessonEntries, 3, solveLesson, shouldStop, 1500);
      for (const r of lessonResults) {
        testsSolved += r.solved;
        skippedBatches += r.skipped;
        if (r.stopped) return { ok: false, testsSolved, lessonsFilled, skippedBatches, totalQuestions };
      }
    }

    // 2b. Verification pass
    if (enableVerification && testsSolved > 0) {
      const { data: solvedQs } = await db
        .from("test_questions").select("id, lesson_id, correct_answer, explanation, question, options").in("lesson_id", testIds);
      const toVerify = (solvedQs || []).filter((q: any) =>
        q.correct_answer !== null && (!q.explanation || q.explanation.length < 30)
      );

      if (toVerify.length > 0) {
        await updatePhase(`Верификация: 0/${toVerify.length}`);
        let verified = 0;
        const byLesson = new Map<string, typeof toVerify>();
        for (const q of toVerify) {
          const arr = byLesson.get(q.lesson_id) || [];
          arr.push(q);
          byLesson.set(q.lesson_id, arr);
        }

        for (const [lessonId, qs] of byLesson) {
          if (await shouldStop()) break;
          const lessonInfo = currentLessons.find(l => l.id === lessonId);
          for (let i = 0; i < qs.length; i += 40) {
            const batch = qs.slice(i, i + 40);
            try {
              const questionsText = batch.map((q: any, idx: number) => {
                const opts = (q.options || []).map((o: any, j: number) => {
                  const text = typeof o === "string" ? o : (o?.text || String(o));
                  return `  ${j + 1}) ${text}`;
                }).join("\n");
                const prev = `\nПредыдущий ответ: вариант ${(q.correct_answer || 0) + 1}${q.explanation ? ` (${q.explanation})` : ""}`;
                return `Вопрос ${idx + 1}: ${q.question}\n${opts}${prev}`;
              }).join("\n\n");

              const verifyTaskIdx = taskCounter ? taskCounter.value++ : undefined;
              const { text: response } = await withTimeout(
                callAI([
                  { role: "system", content: VERIFY_PROMPT },
                  { role: "user", content: `Курс: "${courseTitle}"\nУрок: "${lessonInfo?.title || "Тест"}"\n\n${questionsText}` },
                ], 16384, aiProvider, gigachatModel, lovableModel, verifyTaskIdx),
                AI_CALL_TIMEOUT, "callAI:verify"
              );

              const answers = parseJsonResponse(response);
              for (const ans of answers) {
                const q = batch[ans.questionIndex];
                if (q && ans.correctAnswer !== undefined) {
                  const changed = ans.changed === true || ans.correctAnswer !== q.correct_answer;
                  if (changed || (ans.explanation && ans.explanation.length > (q.explanation?.length || 0))) {
                    await db.from("test_questions")
                      .update({ correct_answer: ans.correctAnswer, explanation: ans.explanation || q.explanation || null })
                      .eq("id", q.id);
                  }
                  verified++;
                }
              }
            } catch (e: any) {
              if (e?.message?.includes("402")) throw e;
              console.error(`[bulk-pipeline] Verification error:`, e?.message);
            }
            await new Promise(r => setTimeout(r, 3000));
          }
        }
      }
    }
  }

  // 3. Generate structure if needed
  if (currentLessons.length < 3) {
    await updatePhase("Генерация структуры...");
    try {
      const structTaskIdx = taskCounter ? taskCounter.value++ : undefined;
      const { text: response } = await withTimeout(
        callAI([
          { role: "system", content: prompts.structure || "Создай структуру курса из 8-15 уроков. Типы: text, test, practice. Последний урок — итоговый тест. Отвечай JSON-массивом [{title, type}]." },
          { role: "user", content: `Создай структуру курса "${courseTitle}"` },
        ], 4096, aiProvider, gigachatModel, lovableModel, structTaskIdx),
        AI_CALL_TIMEOUT, "callAI:structure"
      );
      const parsed = parseJsonResponse(response);
      if (Array.isArray(parsed)) {
        const newLessons = parsed
          .filter((l: any) => l.type !== "test")
          .map((l: any, idx: number) => ({
            course_id: courseId, title: l.title, type: l.type || "text",
            content: null, order_index: currentLessons.length + idx,
          }));
        if (newLessons.length > 0) await db.from("lessons").insert(newLessons);
      }
    } catch (e: any) {
      if (e?.message?.includes("402")) throw e;
      console.error("[bulk-pipeline] Structure gen failed:", e?.message);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  // 4. Fill empty text lessons
  const { data: allLessons } = await db
    .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");

  const emptyLessons = (allLessons || []).filter((l: any) =>
    (l.type === "text" || l.type === "practice") && (!l.content || l.content === "[]" || l.content === "" || (l.content?.length || 0) < 50)
  );

  // Process empty lessons in parallel (concurrency=2)
  const fillLesson = async (lesson: any, idx: number) => {
    await updatePhase(`Контент: «${lesson.title}» (${idx + 1}/${emptyLessons.length})`);
    try {
      const contentTaskIdx = taskCounter ? taskCounter.value++ : undefined;
      const { text: content } = await withTimeout(
        callAI([
          { role: "system", content: prompts.content || DEFAULT_CONTENT_PROMPT },
          { role: "user", content: `Напиши учебный материал для урока "${lesson.title}" курса "${courseTitle}"` },
        ], 4096, aiProvider, gigachatModel, lovableModel, contentTaskIdx),
        AI_CALL_TIMEOUT, "callAI:content"
      );
      if (content && content.length > 50) {
        await db.from("lessons").update({ content }).eq("id", lesson.id);
        return true;
      }
    } catch (e: any) {
      if (e?.message?.includes("402")) throw e;
      console.error(`[bulk-pipeline] Content gen failed:`, e?.message);
    }
    return false;
  };

  const contentResults = await processInParallel(emptyLessons, 3, fillLesson, shouldStop, 1500);
  lessonsFilled += contentResults.filter(Boolean).length;

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
        await db.from("lessons").update({ title: `${group[i].title} (${i + 1})` }).eq("id", group[i].id);
      }
    }
  }

  return { ok: true, testsSolved, lessonsFilled, skippedBatches, totalQuestions };
}

// ── Main handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user
    const userSb = userClient(authHeader);
    const { data: { user }, error: authErr } = await userSb.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await userSb.from("user_roles").select("role").eq("user_id", user.id).single();
    if (!roleData || roleData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = serviceClient();
    const body = await req.json();
    const { action } = body;

    // ── STOP ──
    if (action === "stop") {
      const { runId } = body;
      await db.from("pipeline_runs").update({ status: "stopping", updated_at: new Date().toISOString() }).eq("id", runId);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── START / RESUME ──
    if (action === "start" || action === "resume") {
      let runId: string;
      let courseEntries: Array<{ id: string; course_id: string; title: string }>;
      let startIndex = 0;
      let existingLog: any[] = [];

      if (action === "start") {
        const { courses, enableVerification, prompts, ai_provider: bodyProvider } = body;
        courseEntries = courses;

        const { data: run, error: insertErr } = await db.from("pipeline_runs").insert({
          user_id: user.id,
          status: "running",
          course_ids: courses,
          total_courses: courses.length,
          current_index: 0,
          enable_verification: enableVerification || false,
          prompts: prompts || null,
          completed_log: [],
        }).select("id").single();

        if (insertErr || !run) {
          return new Response(JSON.stringify({ error: "Failed to create run" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        runId = run.id;
      } else {
        // Resume
        const { runId: existingRunId } = body;
        runId = existingRunId;
        const { data: run } = await db.from("pipeline_runs").select("*").eq("id", runId).single();
        if (!run) {
          return new Response(JSON.stringify({ error: "Run not found" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        courseEntries = run.course_ids as any[];
        startIndex = run.current_index || 0;
        existingLog = (run.completed_log as any[]) || [];

        await db.from("pipeline_runs").update({
          status: "running", updated_at: new Date().toISOString(),
        }).eq("id", runId);
      }

      const prompts: PromptSet = body.prompts || {};
      const enableVerification = body.enableVerification || false;
      const aiProvider = body.ai_provider || "round_robin";
      const gigachatModel = body.gigachat_model;
      const lovableModel = body.lovable_model;
      const startTime = Date.now();
      let totalSolved = 0, totalFilled = 0, totalErrors = 0, totalSuccess = 0, totalSkipped = 0;
      const taskCounter = { value: 0 }; // Deterministic round-robin distribution across AI channels

      // Count existing successes from resume
      for (const entry of existingLog) {
        if (entry.status === "ok") totalSuccess++;
        else totalErrors++;
      }

      const updatePhase = async (phase: string) => {
        await db.from("pipeline_runs").update({
          current_phase: phase, updated_at: new Date().toISOString(),
        }).eq("id", runId);
      };

      const shouldStop = async (): Promise<boolean> => {
        // Check time limit
        if (Date.now() - startTime > MAX_RUNTIME_MS) return true;
        // Check if user requested stop
        const { data } = await db.from("pipeline_runs").select("status").eq("id", runId).single();
        return data?.status === "stopping";
      };

      let finalStatus = "completed";

      for (let i = startIndex; i < courseEntries.length; i++) {
        if (await shouldStop()) {
          finalStatus = Date.now() - startTime > MAX_RUNTIME_MS ? "partial" : "stopped";
          break;
        }

        const entry = courseEntries[i];
        const name = entry.title || `Курс ${i + 1}`;

        // Update current index
        await db.from("pipeline_runs").update({
          current_index: i, current_phase: `Обработка: ${name}`,
          updated_at: new Date().toISOString(),
        }).eq("id", runId);

        try {
          const result = await processCourse(
            db, entry.course_id, name, prompts, enableVerification, runId, updatePhase, shouldStop, aiProvider, gigachatModel, lovableModel, taskCounter,
          );

          if (!result.ok) {
            finalStatus = "partial";
            existingLog.push({ courseName: name, status: "error", message: "Остановлено/Таймаут" });
            totalErrors++;

            await db.from("pipeline_runs").update({
              current_index: i, completed_log: existingLog,
              updated_at: new Date().toISOString(),
            }).eq("id", runId);
            break;
          }

          totalSolved += result.testsSolved;
          totalFilled += result.lessonsFilled;
          totalSkipped += result.skippedBatches;
          totalSuccess++;

          // Mark validated
          const mcEntry = courseEntries[i] as any;
          if (mcEntry.marketplace_id) {
            await db.from("marketplace_courses").update({ is_validated: true } as any).eq("id", mcEntry.marketplace_id);
          }

          existingLog.push({
            courseName: name, status: "ok",
            testsSolved: result.testsSolved, lessonsFilled: result.lessonsFilled,
            skippedBatches: result.skippedBatches, totalQuestions: result.totalQuestions,
          });

          // Persist progress after each course
          await db.from("pipeline_runs").update({
            current_index: i + 1, completed_log: existingLog,
            updated_at: new Date().toISOString(),
          }).eq("id", runId);

        } catch (e: any) {
          const msg = e?.message || "Ошибка";
          existingLog.push({ courseName: name, status: "error", message: msg });
          totalErrors++;

          await db.from("pipeline_runs").update({
            current_index: i + 1, completed_log: existingLog,
            updated_at: new Date().toISOString(),
          }).eq("id", runId);

          if (msg.includes("402")) {
            finalStatus = "error";
            break;
          }
        }
      }

      const duration = Date.now() - startTime;
      const summary = {
        totalCourses: courseEntries.length,
        successCourses: totalSuccess,
        errorCourses: totalErrors,
        totalTestsSolved: totalSolved,
        totalLessonsFilled: totalFilled,
        totalSkippedBatches: totalSkipped,
        durationMs: duration,
      };

      await db.from("pipeline_runs").update({
        status: finalStatus,
        summary,
        current_phase: finalStatus === "partial" ? "Ожидает продолжения..." : "",
        updated_at: new Date().toISOString(),
      }).eq("id", runId);

      return new Response(JSON.stringify({ runId, status: finalStatus, summary }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[bulk-pipeline] Error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
