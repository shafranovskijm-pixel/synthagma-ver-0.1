import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { markdownToBlocks, blocksToJson } from "@/components/course-builder/BlockEditor";
import type { ValidationRules, AiPrompts } from "../MarketplaceSettingsTab";
import {
  checkCriticalError, validateCourseIssues, validateCourseIssuesSimple,
  generateContentForLesson, generateQuestionsForTest,
  type ValidationRulesConfig,
} from "./validationHelpers";

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
      courses.forEach((c: any) => { if (c.is_validated && !init[c.course_id]) init[c.course_id] = 'ok'; });
      return init;
    });
  }, [courses]);

  const getProgramType = async (courseId: string): Promise<string | undefined> => {
    try {
      const { data: courseData } = await supabase.from("courses").select("category_id").eq("id", courseId).single();
      if (courseData?.category_id) {
        const cat = dbCategories.find(c => c.id === courseData.category_id);
        if (cat?.parent_type) return cat.parent_type;
      }
    } catch {}
    return undefined;
  };

  const autoFixCourse = async (courseId: string, courseTitle: string) => {
    const toastId = toast.loading("Анализирую курс...", { duration: Infinity });
    let hadCriticalError = false;
    const markCritical = (e: any) => { if (checkCriticalError(e)) { hadCriticalError = true; autoFixCriticalError.current.add(courseId); } };

    const programType = await getProgramType(courseId);
    const CONCURRENCY = 3;

    try {
      let { data: lessons } = await supabase.from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");
      let allLessons = lessons || [];

      // Generate structure if needed
      const textPracticeLessons = allLessons.filter(l => l.type === "text" || l.type === "practice");
      const needsStructure = textPracticeLessons.length === 0 || allLessons.length < valRules.minLessons || (valRules.requireTest && allLessons.filter(l => l.type === "test").length === 0);
      if (needsStructure) {
        toast.loading("Генерирую структуру курса...", { id: toastId });
        try {
          const { data: structData, error: structErr } = await safeInvoke<any>("generate-course-structure", { body: { title: courseTitle, description: "" } });
          if (structErr) throw structErr;
          const generated: Array<{ title: string; type: string }> = structData?.lessons || [];
          if (generated.length > 0) {
            const maxOrder = allLessons.reduce((mx, l) => Math.max(mx, l.order_index ?? 0), -1);
            const existingTitles = new Set(allLessons.map(l => l.title.toLowerCase()));
            const newLessons = generated.filter(gl => !existingTitles.has(gl.title.toLowerCase()));
            if (newLessons.length > 0) await supabase.from("lessons").insert(newLessons.map((gl, i) => ({ course_id: courseId, title: gl.title, type: gl.type || "text", order_index: maxOrder + 1 + i, content: null })));
            const { data: refreshed } = await supabase.from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");
            allLessons = refreshed || allLessons;
          }
        } catch (e) { console.error("Structure generation failed:", e); markCritical(e); }
      }

      // Ensure test exists
      if (valRules.requireTest && allLessons.filter(l => l.type === "test").length === 0) {
        toast.loading("Создаю тестовый урок...", { id: toastId });
        const maxOrder = allLessons.reduce((mx, l) => Math.max(mx, l.order_index ?? 0), -1);
        await supabase.from("lessons").insert({ course_id: courseId, title: "Итоговый тест", type: "test", order_index: maxOrder + 1, content: null });
        const { data: refreshed2 } = await supabase.from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");
        allLessons = refreshed2 || allLessons;
      }

      const emptyLessons = allLessons.filter(l => (l.type === "text" || l.type === "practice") && (!l.content || l.content === "[]" || l.content === "" || l.content.length < valRules.minContentLength));
      const testIds = allLessons.filter(l => l.type === "test").map(l => l.id);
      let allQuestions: Array<{ id: string; lesson_id: string; correct_answer: number | null; explanation?: string | null; question: string; options: any }> = [];
      if (testIds.length) { const { data: q } = await supabase.from("test_questions").select("id, lesson_id, correct_answer, explanation, question, options").in("lesson_id", testIds); allQuestions = (q || []) as typeof allQuestions; }

      const emptyTests = allLessons.filter(l => l.type === "test" && !allQuestions.some(q => q.lesson_id === l.id));
      const unansweredQuestions = allQuestions.filter(q => q.correct_answer === null || q.correct_answer === undefined);

      // Check duplicates
      const titleCounts = new Map<string, Array<{ id: string; title: string }>>();
      for (const l of allLessons) { const arr = titleCounts.get(l.title) || []; arr.push(l); titleCounts.set(l.title, arr); }
      const duplicateGroups = [...titleCounts.values()].filter(g => g.length > 1);

      // Check media needs
      const allTextLessons = allLessons.filter(l => l.type === "text" || l.type === "practice");
      const lessonsNeedingMedia: typeof allTextLessons = [];
      const freshLessons = await Promise.all(allTextLessons.map(async (lesson) => { const { data } = await supabase.from("lessons").select("content").eq("id", lesson.id).single(); return { lesson, content: data?.content }; }));
      for (const { lesson, content } of freshLessons) {
        if (!content || content === "[]") continue;
        try { const blocks = JSON.parse(content); if (!Array.isArray(blocks) || blocks.length < 3) continue; if (!blocks.some((b: any) => b.type === "image" || b.type === "slider")) lessonsNeedingMedia.push({ ...lesson, content }); } catch { continue; }
      }

      const totalTasks = emptyLessons.length + (unansweredQuestions.length > 0 ? 1 : 0) + (duplicateGroups.length > 0 ? 1 : 0) + emptyTests.length + (lessonsNeedingMedia.length > 0 ? 1 : 0);
      if (totalTasks === 0 && !needsStructure) { toast.info("Нечего исправлять", { id: toastId, duration: 3000 }); return; }
      if (totalTasks === 0) { toast.success("Структура создана! Повторная проверка...", { id: toastId, duration: 3000 }); setTimeout(() => handleValidateCourse(courseId), 1000); return; }

      let completed = 0;

      // Generate content for empty lessons
      for (let i = 0; i < emptyLessons.length; i += CONCURRENCY) {
        const chunk = emptyLessons.slice(i, i + CONCURRENCY);
        await Promise.allSettled(chunk.map(async (lesson, idx) => {
          completed++;
          toast.loading(`Генерирую контент: "${lesson.title}" (${completed}/${totalTasks})`, { id: toastId });
          try { await generateContentForLesson(lesson, courseId, courseTitle, i + idx, aiProvider, gigachatModel, aiPrompts.content, programType); } catch (e) { console.error(`Failed content for ${lesson.id}:`, e); markCritical(e); }
        }));
      }
      if (hadCriticalError) throw new Error("Critical API error during content generation");

      // Generate questions for empty tests
      for (let i = 0; i < emptyTests.length; i += CONCURRENCY) {
        const chunk = emptyTests.slice(i, i + CONCURRENCY);
        await Promise.allSettled(chunk.map(async (test, idx) => {
          completed++;
          toast.loading(`Генерирую вопросы: "${test.title}" (${completed}/${totalTasks})`, { id: toastId });
          try { await generateQuestionsForTest(test, courseId, courseTitle, i + idx, aiProvider, gigachatModel, aiPrompts.questions, programType); } catch (e) { console.error(`Failed questions for ${test.id}:`, e); markCritical(e); }
        }));
      }

      // Solve unanswered questions
      if (unansweredQuestions.length > 0) {
        completed++;
        toast.loading(`Решаю тесты: ${unansweredQuestions.length} вопросов (${completed}/${totalTasks})`, { id: toastId });
        const byLesson = new Map<string, typeof unansweredQuestions>();
        for (const q of unansweredQuestions) { const arr = byLesson.get(q.lesson_id) || []; arr.push(q); byLesson.set(q.lesson_id, arr); }
        const entries = Array.from(byLesson.entries());
        for (let i = 0; i < entries.length; i += CONCURRENCY) {
          const chunk = entries.slice(i, i + CONCURRENCY);
          await Promise.allSettled(chunk.map(async ([lessonId, questions], idx) => {
            const lessonInfo = allLessons.find(l => l.id === lessonId);
            const batchSize = 20; const startMs = Date.now(); let answeredCount = 0;
            for (let j = 0; j < questions.length; j += batchSize) {
              const batch = questions.slice(j, j + batchSize);
              try {
                const { data, error } = await safeInvoke<any>("gigachat", { body: { action: "generate_answers", courseTitle, lessonTitle: lessonInfo?.title || "Тест", questions: batch.map(q => ({ question: q.question, options: q.options || [] })), ai_provider: aiProvider, stream_index: i + idx, ...(aiProvider === "gigachat" && gigachatModel ? { gigachat_model: gigachatModel } : {}), ...(aiPrompts.answers ? { customSystemPrompt: aiPrompts.answers } : {}) } });
                if (error) throw error;
                if (data?.answers && !data.parseError) { for (const ans of data.answers) { const q = batch[ans.questionIndex]; if (q && ans.correctAnswer !== undefined) { answeredCount++; await supabase.from("test_questions").update({ correct_answer: ans.correctAnswer, explanation: ans.explanation || null }).eq("id", q.id); } } }
              } catch (e) { console.error(`Failed solving for ${lessonId}:`, e); markCritical(e); }
            }
            await supabase.from("generation_history").insert({ course_id: courseId, course_title: courseTitle, action: "answers", details: `Auto-fix: "${lessonInfo?.title || "Тест"}"`, items_count: answeredCount, stream_index: i + idx, duration_ms: Date.now() - startMs }).then(() => {}, () => {});
          }));
        }
      }
      if (hadCriticalError) throw new Error("Critical API error during test generation");

      // Enrich with images (uses same logic but with fresh content check)
      const mediaLimit = programType === "Рабочие профессии" ? 9 : 3;
      const freshPost = await Promise.all(allTextLessons.map(async (lesson) => { const { data } = await supabase.from("lessons").select("content").eq("id", lesson.id).single(); return { lesson, content: data?.content }; }));
      const postMediaNeeded: typeof allTextLessons = [];
      for (const { lesson, content } of freshPost) {
        if (!content || content === "[]") continue;
        try { const blocks = JSON.parse(content); if (!Array.isArray(blocks) || blocks.length < 3) continue; if (!blocks.some((b: any) => b.type === "image" || b.type === "slider")) postMediaNeeded.push({ ...lesson, content }); } catch { continue; }
      }
      const lessonsToEnrich = postMediaNeeded.slice(0, mediaLimit);

      if (lessonsToEnrich.length > 0) {
        let enrichedCount = 0; let successCount = 0; let skipCount = 0;
        toast.loading(`Анализирую уроки: 0/${lessonsToEnrich.length}...`, { id: toastId });
        type AnalysisResult = { lesson: typeof lessonsToEnrich[0]; streamIndex: number; blocks: any[]; imageVisual: { prompt: string; after_block_index: number; format: "image" | "slider"; slides?: string[] }; startMs: number };
        const analysisResults: AnalysisResult[] = [];
        for (let b = 0; b < lessonsToEnrich.length; b += CONCURRENCY) {
          const batch = lessonsToEnrich.slice(b, b + CONCURRENCY);
          if (b > 0) await new Promise(r => setTimeout(r, 5000));
          await Promise.allSettled(batch.map(async (lesson, idx) => {
            try {
              const { data: freshData } = await supabase.from("lessons").select("content").eq("id", lesson.id).single();
              const contentStr = freshData?.content || lesson.content;
              if (!contentStr || contentStr === "[]") return;
              const blocks = JSON.parse(contentStr);
              if (!Array.isArray(blocks) || blocks.length < 3) return;
              const textForAnalysis = blocks.filter((bl: any) => bl.type === "paragraph" || bl.type === "heading").map((bl: any) => bl.content || "").join("\n").slice(0, 1500);
              const { data: analysisData, error: analysisErr } = await safeInvoke<any>("gigachat", { body: { action: "analyze_visuals", courseTitle, lessonTitle: lesson.title, lessonContent: textForAnalysis, maxVisuals: 1, ai_provider: aiProvider, stream_index: b + idx, ...(aiProvider === "gigachat" && gigachatModel ? { gigachat_model: gigachatModel } : {}) } });
              if (analysisErr || !analysisData?.visuals?.length) return;
              const imageVisual = analysisData.visuals.find((v: any) => v.format === "image");
              if (imageVisual) analysisResults.push({ lesson, streamIndex: b + idx, blocks, imageVisual, startMs: Date.now() });
            } catch (e) { console.error(`Analysis error for ${lesson.id}:`, e); markCritical(e); }
          }));
        }

        if (analysisResults.length > 0) {
          const BATCH_SIZE = 2; const MAX_WAVES = 3;
          let pending = [...analysisResults];
          for (let wave = 0; wave < MAX_WAVES && pending.length > 0; wave++) {
            if (wave > 0) await new Promise(r => setTimeout(r, 20000 * wave));
            const failedThisWave: AnalysisResult[] = [];
            for (let bs = 0; bs < pending.length; bs += BATCH_SIZE) {
              if (successCount >= mediaLimit) break;
              const batch = pending.slice(bs, bs + BATCH_SIZE);
              if (bs > 0) await new Promise(r => setTimeout(r, 30000));
              await Promise.allSettled(batch.map(async (item) => {
                if (successCount >= mediaLimit) return;
                try {
                  const { data: imgData, error: imgErr } = await safeInvoke<any>("generate-image", { body: { prompt: item.imageVisual.prompt, provider: "gigachat", slotIndex: item.streamIndex } });
                  if (!imgErr && imgData?.url) {
                    const insertIdx = Math.min(item.imageVisual.after_block_index + 1, item.blocks.length);
                    item.blocks.splice(insertIdx, 0, { id: crypto.randomUUID(), type: "image", content: item.imageVisual.prompt, imageSrc: imgData.url, imageAlt: item.imageVisual.prompt });
                    await supabase.from("lessons").update({ content: JSON.stringify(item.blocks) }).eq("id", item.lesson.id);
                    successCount++;
                  } else { if (wave === MAX_WAVES - 1) skipCount++; else failedThisWave.push(item); }
                  await supabase.from("generation_history").insert({ course_id: courseId, course_title: courseTitle, action: "media", details: `Wave ${wave + 1}: "${item.lesson.title}"`, items_count: imgData?.url ? 1 : 0, stream_index: item.streamIndex, duration_ms: Date.now() - item.startMs }).then(() => {}, () => {});
                } catch (e) { console.error(`Enrichment error:`, e); markCritical(e); if (wave === MAX_WAVES - 1) skipCount++; else failedThisWave.push(item); }
              }));
            }
            if (successCount >= mediaLimit) break;
            pending = failedThisWave;
          }
        }
      }

      // Remove duplicates
      if (duplicateGroups.length > 0) {
        completed++;
        toast.loading(`Удаляю дубликаты (${completed}/${totalTasks})`, { id: toastId });
        const idsToDelete: string[] = [];
        for (const group of duplicateGroups) for (let i = 1; i < group.length; i++) idsToDelete.push(group[i].id);
        if (idsToDelete.length > 0) {
          await supabase.from("test_questions").delete().in("lesson_id", idsToDelete);
          await supabase.from("lesson_progress").delete().in("lesson_id", idsToDelete);
          await supabase.from("lesson_attachments").delete().in("lesson_id", idsToDelete);
          await supabase.from("lessons").delete().in("id", idsToDelete);
        }
      }

      if (hadCriticalError) { toast.warning("Автоисправление прервано: ошибка API (402/429).", { id: toastId, duration: 8000 }); return; }
      toast.success(`Курс исправлен! Повторная проверка...`, { id: toastId, duration: 3000 });
      const prevCycles = autoFixCycleCount.current.get(courseId) || 0;
      autoFixCycleCount.current.set(courseId, prevCycles + 1);
      setTimeout(() => handleValidateCourse(courseId, true), 1000);
    } catch (e: any) {
      console.error("Auto-fix error:", e);
      markCritical(e);
      toast.warning(hadCriticalError ? "Автоисправление прервано: ошибка API." : "Ошибка автоисправления", { id: toastId, duration: 8000 });
    }
  };

  const handleValidateCourse = async (courseId: string, isAutoRetry = false) => {
    if (!isAutoRetry) { autoFixCycleCount.current.delete(courseId); autoFixCriticalError.current.delete(courseId); }
    setValidatingId(courseId);
    try {
      const issues = await validateCourseIssues(courseId, valRules as ValidationRulesConfig);
      const isOk = issues.length === 0;
      setValidatedCourses(prev => ({ ...prev, [courseId]: isOk ? 'ok' : 'error' }));
      const mpCourse = courses.find((c: any) => c.course_id === courseId);
      if (mpCourse) await supabase.from("marketplace_courses").update({ is_validated: isOk } as any).eq("id", mpCourse.id);

      if (issues.length > 0) {
        const title = mpCourse?.course?.title || "";
        const cycles = autoFixCycleCount.current.get(courseId) || 0;
        const hadCritical = autoFixCriticalError.current.has(courseId);
        if (hadCritical) toast.warning(`Проблемы: ${issues.join(" • ")}. Автоисправление остановлено.`, { duration: 8000 });
        else if (cycles >= 2) toast.warning(`Проблемы: ${issues.join(" • ")}. Лимит автоисправлений достигнут.`, { duration: 8000 });
        else { toast.info(`Найдены проблемы: ${issues.join(" • ")}. Запускаю исправление (${cycles + 1}/2)...`, { duration: 6000 }); autoFixCourse(courseId, title); }
      } else toast.success("Курс готов ✅");
      fetchData();
    } catch (e) { console.error(e); toast.error("Ошибка проверки"); }
    finally { setValidatingId(null); }
  };

  const handleBulkValidate = async (group: any) => {
    if (bulkValidatingGroup) return;
    setBulkValidatingGroup(group.category);
    let okCount = 0; let errCount = 0;
    const total = group.courses.length;
    const failedCourses: { courseId: string; title: string; issues: string[] }[] = [];
    const CHUNK_SIZE = 5;

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = group.courses.slice(i, i + CHUNK_SIZE);
      setBulkValidateProgress(`${Math.min(i + CHUNK_SIZE, total)}/${total}...`);
      const results = await Promise.all(chunk.map(async (item: any) => {
        try {
          const issues = await validateCourseIssuesSimple(item.course_id, valRules as ValidationRulesConfig);
          const isOk = issues.length === 0;
          setValidatedCourses(prev => ({ ...prev, [item.course_id]: isOk ? 'ok' : 'error' }));
          await supabase.from("marketplace_courses").update({ is_validated: isOk } as any).eq("id", item.id);
          return { ok: isOk, courseId: item.course_id, title: item.course?.title || "", issues };
        } catch (e) {
          console.error("Bulk validate error for", item.course_id, e);
          setValidatedCourses(prev => ({ ...prev, [item.course_id]: 'error' }));
          return { ok: false, courseId: item.course_id, title: item.course?.title || "", issues: ["Ошибка проверки"] };
        }
      }));
      for (const r of results) { if (r.ok) okCount++; else { errCount++; failedCourses.push({ courseId: r.courseId, title: r.title, issues: r.issues }); } }
    }

    setBulkValidatingGroup(null); setBulkValidateProgress("");
    setValidationReportOk(okCount);
    setValidationReport(errCount > 0 ? failedCourses : null);
    if (errCount > 0) { toast.info(`Проверено ${total}: ✅ ${okCount}, ❌ ${errCount}. Запускаю авто-исправление...`); handleBulkAutoFix(failedCourses.map(r => ({ courseId: r.courseId, title: r.title }))); }
    else toast.success(`Проверено ${total}: ✅ ${okCount} готово`);
  };

  const handleBulkAutoFix = async (coursesToFix: { courseId: string; title: string }[]) => {
    if (bulkFixing) return;
    setBulkFixing(true);
    let fixed = 0; let failed = 0;
    for (let i = 0; i < coursesToFix.length; i++) {
      toast.loading(`Исправляю ${i + 1}/${coursesToFix.length}: ${coursesToFix[i].title.slice(0, 40)}...`, { id: "bulk-fix-progress", duration: Infinity });
      try { await autoFixCourse(coursesToFix[i].courseId, coursesToFix[i].title); fixed++; } catch { failed++; }
    }
    toast.dismiss("bulk-fix-progress"); setBulkFixing(false);
    toast.success(`Исправление завершено: ✅ ${fixed}${failed > 0 ? `, ❌ ${failed}` : ""}`, { duration: 10000 });
    fetchData();
  };

  return { validatedCourses, validatingId, bulkValidatingGroup, bulkValidateProgress, bulkFixing, validationReport, validationReportOk, setValidationReport, handleValidateCourse, handleBulkValidate };
}
