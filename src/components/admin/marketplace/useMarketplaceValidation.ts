import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { markdownToBlocks, blocksToJson } from "@/components/course-builder/BlockEditor";
import type { ValidationRules, AiPrompts } from "../MarketplaceSettingsTab";

interface UseMarketplaceValidationProps {
  courses: any[];
  dbCategories: any[];
  fetchData: () => void;
  aiProvider: string;
  gigachatModel?: string;
  aiPrompts: AiPrompts;
  valRules: ValidationRules;
}

export function useMarketplaceValidation({
  courses, dbCategories, fetchData, aiProvider, gigachatModel, aiPrompts, valRules,
}: UseMarketplaceValidationProps) {
  const [validatedCourses, setValidatedCourses] = useState<Record<string, 'ok' | 'error'>>({});
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [bulkValidatingGroup, setBulkValidatingGroup] = useState<string | null>(null);
  const [bulkValidateProgress, setBulkValidateProgress] = useState("");
  const [bulkFixing, setBulkFixing] = useState(false);
  const [validationReport, setValidationReport] = useState<{ courseId: string; title: string; issues: string[] }[] | null>(null);
  const [validationReportOk, setValidationReportOk] = useState(0);
  const autoFixCycleCount = useRef<Map<string, number>>(new Map());
  const autoFixCriticalError = useRef<Set<string>>(new Set());

  useEffect(() => {
    setValidatedCourses(prev => {
      const init = { ...prev };
      courses.forEach((c: any) => {
        if (c.is_validated && !init[c.course_id]) init[c.course_id] = 'ok';
      });
      return init;
    });
  }, [courses]);

  const autoFixCourse = async (courseId: string, courseTitle: string) => {
    const toastId = toast.loading("Анализирую курс...", { duration: Infinity });
    let hadCriticalError = false;

    const checkCriticalError = (error: any) => {
      const msg = String(error?.message || error || "");
      if (msg.includes("402") || msg.includes("429") || msg.includes("Insufficient") || msg.includes("rate limit") || msg.includes("MODERATION")) {
        hadCriticalError = true;
        autoFixCriticalError.current.add(courseId);
      }
    };

    let programType: string | undefined;
    try {
      const { data: courseData } = await supabase.from("courses").select("category_id").eq("id", courseId).single();
      if (courseData?.category_id) {
        const cat = dbCategories.find(c => c.id === courseData.category_id);
        if (cat?.parent_type) programType = cat.parent_type;
      }
    } catch {}

    try {
      let { data: lessons } = await supabase
        .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");

      const currentLessons = lessons || [];
      const textPracticeLessons = currentLessons.filter(l => l.type === "text" || l.type === "practice");
      const testLessons = currentLessons.filter(l => l.type === "test");
      const needsStructure = textPracticeLessons.length === 0 || currentLessons.length < valRules.minLessons || (valRules.requireTest && testLessons.length === 0);

      if (needsStructure) {
        toast.loading("Генерирую структуру курса...", { id: toastId });
        try {
          const { data: structData, error: structErr } = await safeInvoke<any>("generate-course-structure", {
            body: { title: courseTitle, description: "" },
          });
          if (structErr) throw structErr;
          const generatedLessons: Array<{ title: string; type: string }> = structData?.lessons || [];
          if (generatedLessons.length > 0) {
            const maxOrder = currentLessons.reduce((mx, l) => Math.max(mx, l.order_index ?? 0), -1);
            const existingTitles = new Set(currentLessons.map(l => l.title.toLowerCase()));
            const newLessons = generatedLessons.filter(gl => !existingTitles.has(gl.title.toLowerCase()));
            if (newLessons.length > 0) {
              const toInsert = newLessons.map((gl, i) => ({
                course_id: courseId, title: gl.title, type: gl.type || "text",
                order_index: maxOrder + 1 + i, content: null,
              }));
              await supabase.from("lessons").insert(toInsert);
            }
            const { data: refreshed } = await supabase
              .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");
            lessons = refreshed;
          }
        } catch (e) {
          console.error("Structure generation failed:", e);
          checkCriticalError(e);
        }
      }

      let allLessons = lessons || [];

      if (valRules.requireTest && allLessons.filter(l => l.type === "test").length === 0) {
        toast.loading("Создаю тестовый урок...", { id: toastId });
        const maxOrder = allLessons.reduce((mx, l) => Math.max(mx, l.order_index ?? 0), -1);
        await supabase.from("lessons").insert({
          course_id: courseId, title: "Итоговый тест", type: "test",
          order_index: maxOrder + 1, content: null,
        });
        const { data: refreshed2 } = await supabase
          .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");
        allLessons = refreshed2 || allLessons;
      }

      const emptyLessons = allLessons.filter(l =>
        (l.type === "text" || l.type === "practice") && (!l.content || l.content === "[]" || l.content === "" || l.content.length < valRules.minContentLength)
      );

      const testIds = allLessons.filter(l => l.type === "test").map(l => l.id);
      let allQuestions: Array<{ id: string; lesson_id: string; correct_answer: number | null; explanation?: string | null; question: string; options: any }> = [];
      if (testIds.length) {
        const { data: questions } = await supabase
          .from("test_questions").select("id, lesson_id, correct_answer, explanation, question, options").in("lesson_id", testIds);
        allQuestions = (questions || []) as typeof allQuestions;
      }

      const testQuestionsByLesson = new Set(allQuestions.map(q => q.lesson_id));
      const emptyTests = allLessons.filter(l => l.type === "test" && !testQuestionsByLesson.has(l.id));
      const unansweredQuestions = allQuestions.filter(q => q.correct_answer === null || q.correct_answer === undefined);

      const titleCounts = new Map<string, Array<{ id: string; title: string }>>();
      for (const l of allLessons) {
        const arr = titleCounts.get(l.title) || [];
        arr.push(l);
        titleCounts.set(l.title, arr);
      }
      const duplicateGroups = [...titleCounts.values()].filter(g => g.length > 1);

      const allTextLessonsEarly = allLessons.filter(l => l.type === "text" || l.type === "practice");
      const lessonsNeedingMediaEarly: typeof allTextLessonsEarly = [];
      const freshLessonsEarly = await Promise.all(
        allTextLessonsEarly.map(async (lesson) => {
          const { data } = await supabase.from("lessons").select("content").eq("id", lesson.id).single();
          return { lesson, content: data?.content };
        })
      );
      for (const { lesson, content } of freshLessonsEarly) {
        if (!content || content === "[]") continue;
        try {
          const blocks = JSON.parse(content);
          if (!Array.isArray(blocks) || blocks.length < 3) continue;
          const hasMedia = blocks.some((b: any) => b.type === "image" || b.type === "slider");
          if (!hasMedia) lessonsNeedingMediaEarly.push({ ...lesson, content });
        } catch { continue; }
      }

      const totalTasks = emptyLessons.length + (unansweredQuestions.length > 0 ? 1 : 0) + (duplicateGroups.length > 0 ? 1 : 0) + emptyTests.length + (lessonsNeedingMediaEarly.length > 0 ? 1 : 0);
      if (totalTasks === 0 && !needsStructure) { toast.info("Нечего исправлять", { id: toastId, duration: 3000 }); return; }
      if (totalTasks === 0) { toast.success("Структура создана! Повторная проверка...", { id: toastId, duration: 3000 }); setTimeout(() => handleValidateCourse(courseId), 1000); return; }

      let completed = 0;
      const CONCURRENCY = 3;

      // Generate content for empty lessons
      for (let i = 0; i < emptyLessons.length; i += CONCURRENCY) {
        const chunk = emptyLessons.slice(i, i + CONCURRENCY);
        const promises = chunk.map(async (lesson, idxInChunk) => {
          completed++;
          const streamIndex = i + idxInChunk;
          toast.loading(`Генерирую контент: "${lesson.title}" (${completed}/${totalTasks})`, { id: toastId });
          const startMs = Date.now();
          try {
            const { data, error } = await safeInvoke<any>("gigachat", {
              body: {
                action: "generate_content", courseTitle, lessonTitle: lesson.title, lessonType: lesson.type,
                existingContent: null, ai_provider: aiProvider, stream_index: streamIndex,
                ...(programType ? { programType } : {}),
                ...(aiProvider === "gigachat" && gigachatModel ? { gigachat_model: gigachatModel } : {}),
                ...(aiPrompts.content ? { customSystemPrompt: aiPrompts.content } : {}),
              },
            });
            if (error) throw error;
            let itemsCount = 0;
            if (data?.content) {
              const blocks = markdownToBlocks(data.content);
              itemsCount = blocks.length;
              const jsonContent = blocks.length > 0 ? blocksToJson(blocks) : data.content;
              await supabase.from("lessons").update({ content: jsonContent }).eq("id", lesson.id);
            }
            await supabase.from("generation_history").insert({
              course_id: courseId, course_title: courseTitle, action: "content",
              details: `Auto-fix: "${lesson.title}"`, items_count: itemsCount,
              stream_index: streamIndex, duration_ms: Date.now() - startMs,
            });
          } catch (e) {
            console.error(`Failed to generate content for lesson ${lesson.id}:`, e);
            checkCriticalError(e);
          }
        });
        await Promise.allSettled(promises);
      }
      if (hadCriticalError) throw new Error("Critical API error during content generation");

      // Generate questions for empty tests
      if (emptyTests.length > 0) {
        for (let i = 0; i < emptyTests.length; i += CONCURRENCY) {
          const chunk = emptyTests.slice(i, i + CONCURRENCY);
          const promises = chunk.map(async (test, idxInChunk) => {
            completed++;
            const streamIndex = i + idxInChunk;
            toast.loading(`Генерирую вопросы: "${test.title}" (${completed}/${totalTasks})`, { id: toastId });
            const startMs = Date.now();
            try {
              const { data, error } = await safeInvoke<any>("gigachat", {
                body: {
                  action: "generate_questions", courseTitle, lessonTitle: test.title,
                  ai_provider: aiProvider, stream_index: streamIndex,
                  ...(programType ? { programType } : {}),
                  ...(aiProvider === "gigachat" && gigachatModel ? { gigachat_model: gigachatModel } : {}),
                  ...(aiPrompts.questions ? { customSystemPrompt: aiPrompts.questions } : {}),
                },
              });
              if (error) throw error;
              let itemsCount = 0;
              if (data?.questions && !data.parseError && data.questions.length > 0) {
                itemsCount = data.questions.length;
                const toInsert = data.questions.map((q: any, idx: number) => ({
                  lesson_id: test.id, question: q.question, options: q.options,
                  correct_answer: q.correctAnswer ?? null, explanation: q.explanation || null, order_index: idx,
                }));
                await supabase.from("test_questions").insert(toInsert);
              }
              await supabase.from("generation_history").insert({
                course_id: courseId, course_title: courseTitle, action: "questions",
                details: `Auto-fix: "${test.title}"`, items_count: itemsCount,
                stream_index: streamIndex, duration_ms: Date.now() - startMs,
              });
            } catch (e) {
              console.error(`Failed to generate questions for test ${test.id}:`, e);
              checkCriticalError(e);
            }
          });
          await Promise.allSettled(promises);
        }
      }

      // Solve unanswered test questions
      if (unansweredQuestions.length > 0) {
        completed++;
        toast.loading(`Решаю тесты: ${unansweredQuestions.length} вопросов (${completed}/${totalTasks})`, { id: toastId });
        const byLesson = new Map<string, typeof unansweredQuestions>();
        for (const q of unansweredQuestions) {
          const arr = byLesson.get(q.lesson_id) || [];
          arr.push(q);
          byLesson.set(q.lesson_id, arr);
        }
        const lessonEntries = Array.from(byLesson.entries());
        for (let i = 0; i < lessonEntries.length; i += CONCURRENCY) {
          const chunk = lessonEntries.slice(i, i + CONCURRENCY);
          const promises = chunk.map(async ([lessonId, questions], idxInChunk) => {
            const lessonInfo = lessons?.find(l => l.id === lessonId);
            const streamIndex = i + idxInChunk;
            const batchSize = 20;
            const startMs = Date.now();
            let answeredCount = 0;
            for (let j = 0; j < questions.length; j += batchSize) {
              const batch = questions.slice(j, j + batchSize);
              try {
                const { data, error } = await safeInvoke<any>("gigachat", {
                  body: {
                    action: "generate_answers", courseTitle, lessonTitle: lessonInfo?.title || "Тест",
                    questions: batch.map(q => ({ question: q.question, options: q.options || [] })),
                    ai_provider: aiProvider, stream_index: streamIndex,
                    ...(aiProvider === "gigachat" && gigachatModel ? { gigachat_model: gigachatModel } : {}),
                    ...(aiPrompts.answers ? { customSystemPrompt: aiPrompts.answers } : {}),
                  },
                });
                if (error) throw error;
                if (data?.answers && !data.parseError) {
                  for (const ans of data.answers) {
                    const q = batch[ans.questionIndex];
                    if (q && ans.correctAnswer !== undefined) {
                      answeredCount++;
                      await supabase.from("test_questions")
                        .update({ correct_answer: ans.correctAnswer, explanation: ans.explanation || null })
                        .eq("id", q.id);
                    }
                  }
                }
              } catch (e) {
                console.error(`Failed to solve test batch for lesson ${lessonId}:`, e);
                checkCriticalError(e);
              }
            }
            await supabase.from("generation_history").insert({
              course_id: courseId, course_title: courseTitle, action: "answers",
              details: `Auto-fix: "${lessonInfo?.title || "Тест"}"`, items_count: answeredCount,
              stream_index: streamIndex, duration_ms: Date.now() - startMs,
            }).then(() => {}, () => {});
          });
          await Promise.allSettled(promises);
        }
      }
      if (hadCriticalError) throw new Error("Critical API error during test generation");

      // Enrich with images
      const allTextLessonsPost = allLessons.filter(l => l.type === "text" || l.type === "practice");
      const lessonsNeedingMedia: typeof allTextLessonsPost = [];
      const freshLessonsPost = await Promise.all(
        allTextLessonsPost.map(async (lesson) => {
          const { data } = await supabase.from("lessons").select("content").eq("id", lesson.id).single();
          return { lesson, content: data?.content };
        })
      );
      for (const { lesson, content } of freshLessonsPost) {
        if (!content || content === "[]") continue;
        try {
          const blocks = JSON.parse(content);
          if (!Array.isArray(blocks) || blocks.length < 3) continue;
          const hasMedia = blocks.some((b: any) => b.type === "image" || b.type === "slider");
          if (!hasMedia) lessonsNeedingMedia.push({ ...lesson, content });
        } catch { continue; }
      }

      const mediaLimit = programType === "Рабочие профессии" ? 9 : 3;
      const lessonsToEnrich = lessonsNeedingMedia.slice(0, mediaLimit);

      if (lessonsToEnrich.length > 0) {
        let enrichedCount = 0;
        toast.loading(`Анализирую уроки: 0/${lessonsToEnrich.length}...`, { id: toastId });
        type AnalysisResult = {
          lesson: typeof lessonsToEnrich[0];
          streamIndex: number;
          blocks: any[];
          imageVisual: { prompt: string; after_block_index: number; format: "image" | "slider"; slides?: string[] };
          startMs: number;
        };
        const analysisResults: AnalysisResult[] = [];
        let analyzedCount = 0;
        const ANALYSIS_BATCH_SIZE = CONCURRENCY;
        const ANALYSIS_COOLDOWN_MS = 5000;

        for (let batchStart = 0; batchStart < lessonsToEnrich.length; batchStart += ANALYSIS_BATCH_SIZE) {
          const batch = lessonsToEnrich.slice(batchStart, batchStart + ANALYSIS_BATCH_SIZE);
          if (batchStart > 0) await new Promise(r => setTimeout(r, ANALYSIS_COOLDOWN_MS));
          const batchPromises = batch.map(async (lesson, idxInBatch) => {
            const idx = batchStart + idxInBatch;
            const streamIndex = idx;
            const startMs = Date.now();
            try {
              const { data: freshData } = await supabase.from("lessons").select("content").eq("id", lesson.id).single();
              const contentStr = freshData?.content || lesson.content;
              if (!contentStr || contentStr === "[]") return;
              const blocks = JSON.parse(contentStr);
              if (!Array.isArray(blocks) || blocks.length < 3) return;
              const textForAnalysis = blocks
                .filter((b: any) => b.type === "paragraph" || b.type === "heading")
                .map((b: any) => b.content || "")
                .join("\n")
                .slice(0, 1500);
              analyzedCount++;
              toast.loading(`Анализирую уроки: ${analyzedCount}/${lessonsToEnrich.length}...`, { id: toastId });

              const { data: analysisData, error: analysisErr } = await safeInvoke<any>("gigachat", {
                body: {
                  action: "analyze_visuals", courseTitle, lessonTitle: lesson.title,
                  lessonContent: textForAnalysis, maxVisuals: 1,
                  ai_provider: aiProvider, stream_index: streamIndex,
                  ...(aiProvider === "gigachat" && gigachatModel ? { gigachat_model: gigachatModel } : {}),
                },
              });
              if (analysisErr || !analysisData?.visuals || analysisData.visuals.length === 0) return;
              const visuals = analysisData.visuals as Array<{
                prompt: string; after_block_index: number; format: "image" | "slider"; slides?: string[];
              }>;
              const imageVisual = visuals.find(v => v.format === "image");
              if (imageVisual) {
                analysisResults.push({ lesson, streamIndex, blocks, imageVisual, startMs });
              }
            } catch (e) {
              console.error(`Enrichment analysis error for ${lesson.id}:`, e);
              checkCriticalError(e);
            }
          });
          await Promise.allSettled(batchPromises);
        }

        if (analysisResults.length > 0) {
          let successCount = 0;
          let skipCount = 0;
          const totalLessons = analysisResults.length;
          toast.loading(`Генерирую изображения: 0/${totalLessons}...`, { id: toastId });
          const BATCH_SIZE = 2;
          const BATCH_COOLDOWN_MS = 30000;
          type PendingItem = typeof analysisResults[0];
          let pending: PendingItem[] = [...analysisResults];
          const MAX_WAVES = 3;

          for (let wave = 0; wave < MAX_WAVES && pending.length > 0; wave++) {
            if (wave > 0) {
              const waveCooldown = 20000 * wave;
              toast.loading(`Повторная генерация (волна ${wave + 1}): ${pending.length} изображений...`, { id: toastId });
              await new Promise(r => setTimeout(r, waveCooldown));
            }
            const isLastWave = wave === MAX_WAVES - 1;
            const failedThisWave: PendingItem[] = [];

            for (let batchStart = 0; batchStart < pending.length; batchStart += BATCH_SIZE) {
              if (successCount >= mediaLimit) break;
              const batch = pending.slice(batchStart, batchStart + BATCH_SIZE);
              if (batchStart > 0) await new Promise(r => setTimeout(r, BATCH_COOLDOWN_MS));
              const batchPromises = batch.map(async (item) => {
                if (successCount >= mediaLimit) return;
                const { lesson, streamIndex, blocks, imageVisual, startMs } = item;
                try {
                  let imgUrl: string | null = null;
                  let lastImgErr: any = null;
                  const { data: imgData, error: imgErr } = await safeInvoke<any>("generate-image", {
                    body: { prompt: imageVisual.prompt, provider: "gigachat", slotIndex: streamIndex },
                  });
                  if (!imgErr && imgData?.url) { imgUrl = imgData.url; } else { lastImgErr = imgErr; }

                  let insertedCount = 0;
                  if (imgUrl) {
                    const insertIdx = Math.min(imageVisual.after_block_index + 1, blocks.length);
                    blocks.splice(insertIdx, 0, {
                      id: crypto.randomUUID(), type: "image", content: imageVisual.prompt,
                      imageSrc: imgUrl, imageAlt: imageVisual.prompt,
                    });
                    insertedCount++;
                    await supabase.from("lessons").update({ content: JSON.stringify(blocks) }).eq("id", lesson.id);
                    enrichedCount += insertedCount;
                    successCount++;
                    toast.loading(`Генерирую изображения: ${successCount + skipCount}/${totalLessons}...`, { id: toastId });
                  } else {
                    if (isLastWave) { skipCount++; toast.loading(`Генерирую изображения: ${successCount + skipCount}/${totalLessons}...`, { id: toastId }); }
                    else { failedThisWave.push(item); }
                  }
                  const errDetail = lastImgErr ? ` [err: ${lastImgErr?.message?.slice(0, 60)}]` : "";
                  await supabase.from("generation_history").insert({
                    course_id: courseId, course_title: courseTitle, action: "media",
                    details: `Wave ${wave + 1}: "${lesson.title}" (+${insertedCount} img)${errDetail}`,
                    items_count: insertedCount, stream_index: streamIndex, duration_ms: Date.now() - startMs,
                  }).then(() => {}, () => {});
                } catch (e) {
                  console.error(`Auto-fix enrichment error for ${lesson.id}:`, e);
                  checkCriticalError(e);
                  if (isLastWave) { skipCount++; } else { failedThisWave.push(item); }
                }
              });
              await Promise.allSettled(batchPromises);
            }
            if (successCount >= mediaLimit) break;
            pending = failedThisWave;
            if (pending.length === 0) break;
          }

          if (pending.length > 0) {
            await supabase.from("generation_history").insert({
              course_id: courseId, course_title: courseTitle, action: "media",
              details: `${pending.length} изображений не удалось сгенерировать после ${MAX_WAVES} волн`,
              items_count: 0,
            }).then(() => {}, () => {});
          }
        }
      } else if (allTextLessonsPost.length > 0) {
        await supabase.from("generation_history").insert({
          course_id: courseId, course_title: courseTitle, action: "media",
          details: "Все уроки уже содержат изображения — пропуск", items_count: 0,
        }).then(() => {}, () => {});
      }

      // Remove duplicates
      if (duplicateGroups.length > 0) {
        completed++;
        toast.loading(`Удаляю дубликаты (${completed}/${totalTasks})`, { id: toastId });
        const idsToDelete: string[] = [];
        for (const group of duplicateGroups) {
          for (let i = 1; i < group.length; i++) idsToDelete.push(group[i].id);
        }
        if (idsToDelete.length > 0) {
          await supabase.from("test_questions").delete().in("lesson_id", idsToDelete);
          await supabase.from("lesson_progress").delete().in("lesson_id", idsToDelete);
          await supabase.from("lesson_attachments").delete().in("lesson_id", idsToDelete);
          await supabase.from("lessons").delete().in("id", idsToDelete);
        }
      }

      if (hadCriticalError) {
        toast.warning("Автоисправление прервано: ошибка API (402/429). Оставшиеся проблемы требуют ручного запуска.", { id: toastId, duration: 8000 });
        return;
      }

      toast.success(`Курс исправлен! Повторная проверка...`, { id: toastId, duration: 3000 });
      const prevCycles = autoFixCycleCount.current.get(courseId) || 0;
      autoFixCycleCount.current.set(courseId, prevCycles + 1);
      setTimeout(() => handleValidateCourse(courseId, true), 1000);
    } catch (e: any) {
      console.error("Auto-fix error:", e);
      checkCriticalError(e);
      if (hadCriticalError) {
        toast.warning("Автоисправление прервано: ошибка API. Запустите вручную позже.", { id: toastId, duration: 8000 });
      } else {
        toast.error("Ошибка автоисправления", { id: toastId, duration: 5000 });
      }
    }
  };

  const handleValidateCourse = async (courseId: string, isAutoRetry = false) => {
    if (!isAutoRetry) {
      autoFixCycleCount.current.delete(courseId);
      autoFixCriticalError.current.delete(courseId);
    }
    setValidatingId(courseId);
    try {
      const { data: lessons } = await supabase
        .from("lessons").select("id, title, type, content").eq("course_id", courseId);
      const issues: string[] = [];

      if (!lessons?.length) {
        issues.push("Нет уроков");
      } else {
        const textLessons = lessons.filter(l => l.type === "text" || l.type === "practice");
        const testLessons = lessons.filter(l => l.type === "test");
        if (valRules.requireText && textLessons.length === 0) issues.push("Нет учебных уроков (текст/практика)");
        if (valRules.requireTest && testLessons.length === 0) issues.push("Нет тестов");
        if (lessons.length < valRules.minLessons) issues.push(`Слишком мало уроков (${lessons.length}, нужно минимум ${valRules.minLessons})`);
        const emptyLessons = textLessons.filter(l => !l.content || l.content === "[]" || l.content === "" || l.content.length < valRules.minContentLength);
        if (emptyLessons.length) issues.push(`${emptyLessons.length} уроков без контента`);
        const filledLessons = textLessons.filter(l => l.content && l.content !== "[]" && l.content !== "" && l.content.length >= valRules.minContentLength);
        if (textLessons.length > 0 && filledLessons.length === 0) issues.push("Ни один урок не содержит учебного материала");
        if (filledLessons.length > 0) {
          let hasAnyImage = false;
          for (const l of filledLessons) {
            try {
              const blocks = JSON.parse(l.content!);
              if (Array.isArray(blocks) && blocks.some((b: any) => b.type === "image" || b.type === "slider")) { hasAnyImage = true; break; }
            } catch {}
          }
          if (!hasAnyImage) issues.push("Нет изображений в уроках");
        }
        if (valRules.checkDuplicateTitles) {
          const titles = lessons.map(l => l.title);
          const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
          if (dupes.length) issues.push(`Дубликаты: ${[...new Set(dupes)].join(", ")}`);
        }
        const testIds = testLessons.map(l => l.id);
        if (testIds.length) {
          const { data: questions } = await supabase
            .from("test_questions").select("id, lesson_id, correct_answer").in("lesson_id", testIds);
          const testsWithNoQ = testIds.filter(id => !questions?.some(q => q.lesson_id === id));
          const unansweredQuestions = questions?.filter(q => q.correct_answer === null || q.correct_answer === undefined) || [];
          if (testsWithNoQ.length) issues.push(`${testsWithNoQ.length} тестов без вопросов`);
          if (unansweredQuestions.length) issues.push(`${unansweredQuestions.length} вопросов без ответа`);
        }
      }

      const isOk = issues.length === 0;
      setValidatedCourses(prev => ({ ...prev, [courseId]: isOk ? 'ok' : 'error' }));
      const mpCourse = courses.find((c: any) => c.course_id === courseId);
      if (mpCourse) {
        await supabase.from("marketplace_courses").update({ is_validated: isOk } as any).eq("id", mpCourse.id);
      }

      if (issues.length > 0) {
        const mpItem = courses.find((c: any) => c.course_id === courseId);
        const title = mpItem?.course?.title || "";
        const cycles = autoFixCycleCount.current.get(courseId) || 0;
        const hadCritical = autoFixCriticalError.current.has(courseId);
        if (hadCritical) {
          toast.warning(`Проблемы: ${issues.join(" • ")}. Автоисправление остановлено — ошибка API (402/429). Запустите вручную.`, { duration: 8000 });
        } else if (cycles >= 2) {
          toast.warning(`Проблемы: ${issues.join(" • ")}. Лимит автоисправлений (${cycles}) достигнут. Запустите вручную.`, { duration: 8000 });
        } else {
          toast.info(`Найдены проблемы: ${issues.join(" • ")}. Запускаю исправление (${cycles + 1}/2)...`, { duration: 6000 });
          autoFixCourse(courseId, title);
        }
      } else {
        toast.success("Курс готов ✅");
      }
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error("Ошибка проверки");
    } finally {
      setValidatingId(null);
    }
  };

  const handleBulkValidate = async (group: any) => {
    if (bulkValidatingGroup) return;
    setBulkValidatingGroup(group.category);
    let okCount = 0;
    let errCount = 0;
    const total = group.courses.length;
    const failedCourses: { courseId: string; title: string; issues: string[] }[] = [];

    const validateOne = async (item: any) => {
      try {
        const { data: lessons } = await supabase
          .from("lessons").select("id, title, type, content").eq("course_id", item.course_id);
        const issues: string[] = [];
        if (!lessons?.length) {
          issues.push("Нет уроков");
        } else {
          const textLessons = lessons.filter(l => l.type === "text" || l.type === "practice");
          const testLessons = lessons.filter(l => l.type === "test");
          if (valRules.requireText && textLessons.length === 0) issues.push("Нет учебных уроков");
          if (valRules.requireTest && testLessons.length === 0) issues.push("Нет тестов");
          if (lessons.length < valRules.minLessons) issues.push("Мало уроков");
          const emptyLessons = textLessons.filter(l => !l.content || l.content === "[]" || l.content === "" || l.content.length < valRules.minContentLength);
          if (emptyLessons.length) issues.push(`${emptyLessons.length} без контента`);
          if (valRules.checkDuplicateTitles) {
            const titles = lessons.map(l => l.title);
            const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
            if (dupes.length) issues.push("Дубликаты");
          }
          const testIds = testLessons.map(l => l.id);
          if (testIds.length) {
            const { data: questions } = await supabase
              .from("test_questions").select("id, lesson_id, correct_answer").in("lesson_id", testIds);
            const testsWithNoQ = testIds.filter(id => !questions?.some(q => q.lesson_id === id));
            const unanswered = questions?.filter(q => q.correct_answer === null || q.correct_answer === undefined) || [];
            if (testsWithNoQ.length) issues.push(`${testsWithNoQ.length} тестов без вопросов`);
            if (unanswered.length) issues.push(`${unanswered.length} без ответа`);
          }
        }
        const isOk = issues.length === 0;
        setValidatedCourses(prev => ({ ...prev, [item.course_id]: isOk ? 'ok' : 'error' }));
        await supabase.from("marketplace_courses").update({ is_validated: isOk } as any).eq("id", item.id);
        return { ok: isOk, courseId: item.course_id, title: item.course?.title || "", issues };
      } catch (e) {
        console.error("Bulk validate error for", item.course_id, e);
        setValidatedCourses(prev => ({ ...prev, [item.course_id]: 'error' }));
        return { ok: false, courseId: item.course_id, title: item.course?.title || "", issues: ["Ошибка проверки"] };
      }
    };

    const CHUNK_SIZE = 5;
    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = group.courses.slice(i, i + CHUNK_SIZE);
      setBulkValidateProgress(`${Math.min(i + CHUNK_SIZE, total)}/${total}...`);
      const results = await Promise.all(chunk.map(validateOne));
      for (const r of results) {
        if (r.ok) okCount++; else { errCount++; failedCourses.push({ courseId: r.courseId, title: r.title, issues: r.issues }); }
      }
    }

    setBulkValidatingGroup(null);
    setBulkValidateProgress("");
    setValidationReportOk(okCount);
    setValidationReport(errCount > 0 ? failedCourses : null);

    if (errCount > 0) {
      toast.info(`Проверено ${total}: ✅ ${okCount}, ❌ ${errCount}. Запускаю авто-исправление...`);
      handleBulkAutoFix(failedCourses.map(r => ({ courseId: r.courseId, title: r.title })));
    } else {
      toast.success(`Проверено ${total}: ✅ ${okCount} готово`);
    }
  };

  const handleBulkAutoFix = async (coursesToFix: { courseId: string; title: string }[]) => {
    if (bulkFixing) return;
    setBulkFixing(true);
    const total = coursesToFix.length;
    let fixed = 0;
    let failed = 0;

    for (let i = 0; i < total; i++) {
      const { courseId, title } = coursesToFix[i];
      toast.loading(`Исправляю ${i + 1}/${total}: ${title.slice(0, 40)}...`, { id: "bulk-fix-progress", duration: Infinity });
      try {
        await autoFixCourse(courseId, title);
        fixed++;
      } catch (e) {
        console.error("Bulk fix error for", courseId, e);
        failed++;
      }
    }

    toast.dismiss("bulk-fix-progress");
    setBulkFixing(false);
    toast.success(`Исправление завершено: ✅ ${fixed} исправлено${failed > 0 ? `, ❌ ${failed} с ошибками` : ""}`, { duration: 10000 });
    fetchData();
  };

  return {
    validatedCourses,
    validatingId,
    bulkValidatingGroup,
    bulkValidateProgress,
    bulkFixing,
    validationReport,
    validationReportOk,
    setValidationReport,
    handleValidateCourse,
    handleBulkValidate,
  };
}
