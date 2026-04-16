import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type LessonStatus = "pending" | "generating_text" | "generating_image" | "generating_audio" | "solving_test" | "done" | "error";
type Phase = "idle" | "structure" | "content" | "media" | "tests" | "complete";

export interface BulkLessonItem {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
  selected: boolean;
  status: LessonStatus;
  error?: string;
}

export const PHASE_LABELS: Record<Phase, string> = {
  idle: "Готово к запуску",
  structure: "Фаза 1: Генерация структуры",
  content: "Фаза 2: Генерация контента",
  media: "Фаза 3: Изображения и аудио",
  tests: "Фаза 4: Решение тестов",
  complete: "Завершено",
};

const isContentEmpty = (content: string | null): boolean => {
  if (!content || content === "[]" || content === "null") return true;
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed) || parsed.length === 0) return true;
    if (parsed.length === 1 && parsed[0]?.type === "heading1") return true;
    return false;
  } catch {
    return !content.trim();
  }
};

const isPracticeLesson = (lesson: BulkLessonItem): boolean => {
  if (!lesson.content) return false;
  return lesson.content.includes("Практическое задание");
};

const TEST_BATCH_SIZE = 20;
const PARALLEL_BATCH_SIZE = 3;

const logHistory = async (
  courseId: string, courseTitle: string, action: string, details: string,
  itemsCount: number, durationMs: number, streamIndex?: number
) => {
  try {
    await supabase.from("generation_history").insert({
      course_id: courseId, course_title: courseTitle, action, details,
      items_count: itemsCount, duration_ms: durationMs, stream_index: streamIndex ?? null,
    });
  } catch {}
};

export function useBulkContentGenerator(courseId: string, courseTitle: string, courseDescription?: string, open = false) {
  const [lessons, setLessons] = useState<BulkLessonItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [doneCount, setDoneCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const abortRef = useRef(false);

  const [aiProvider, setAiProvider] = useState("gigachat");
  const [gigachatModel, setGigachatModel] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("ai_settings").select("provider, gigachat_model").eq("context", "pipeline").single();
        if (data) { setAiProvider(data.provider || "gigachat"); setGigachatModel(data.gigachat_model || undefined); }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (open && courseId) { loadLessons(); setPhase("idle"); }
    return () => { abortRef.current = true; };
  }, [open, courseId]);

  const updateLesson = useCallback((id: string, patch: Partial<BulkLessonItem>) => {
    setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const loadLessons = async (): Promise<BulkLessonItem[]> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");
      if (error) throw error;
      const items: BulkLessonItem[] = (data || []).map((l) => ({ ...l, selected: true, status: "pending" as LessonStatus }));
      setLessons(items); setDoneCount(0); setTotalToProcess(0); setProcessing(false); abortRef.current = false;
      return items;
    } catch (e) { console.error(e); toast.error("Ошибка загрузки уроков"); return []; }
    finally { setLoading(false); }
  };

  const toggleAll = () => {
    const allSelected = lessons.every((l) => l.selected);
    setLessons((prev) => prev.map((l) => ({ ...l, selected: !allSelected })));
  };

  const toggleLesson = (id: string) => {
    setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, selected: !l.selected } : l)));
  };

  const hasLessons = lessons.length > 0;
  const hasContentLessons = lessons.some((l) => l.type !== "test");
  const contentLessons = lessons.filter((l) => l.selected && l.type !== "test" && isContentEmpty(l.content));
  const testLessons = lessons.filter((l) => l.selected && l.type === "test");
  const selectedCount = lessons.filter((l) => l.selected).length;
  const errorCount = lessons.filter((l) => l.status === "error").length;
  const progress = totalToProcess > 0 ? (doneCount / totalToProcess) * 100 : 0;

  const generateStructure = async (): Promise<BulkLessonItem[]> => {
    setPhase("structure");
    const start = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke("generate-course-structure", {
        body: { title: courseTitle, description: courseDescription || "" },
      });
      if (error) throw new Error(error.message || "Ошибка генерации структуры");
      if (!data?.success || !data?.lessons?.length) throw new Error(data?.error || "Не удалось создать структуру");

      const existingTestCount = lessons.filter((l) => l.type === "test").length;
      const lessonsToInsert = data.lessons
        .filter((l: any) => !(l.type === "test" && existingTestCount > 0))
        .map((l: any, i: number) => ({
          course_id: courseId, title: l.title,
          type: l.type === "practice" ? "text" : l.type,
          content: l.type === "practice" ? JSON.stringify([{ type: "heading1", content: "Практическое задание" }]) : null,
          order_index: i,
        }));

      if (lessonsToInsert.length > 0) {
        const { error: insertError } = await supabase.from("lessons").insert(lessonsToInsert);
        if (insertError) throw new Error("Ошибка сохранения уроков: " + insertError.message);
      }

      const { data: allLessons } = await supabase.from("lessons").select("id, type, order_index").eq("course_id", courseId).order("order_index");
      if (allLessons) {
        const nonTests = allLessons.filter(l => l.type !== "test");
        const tests = allLessons.filter(l => l.type === "test");
        const ordered = [...nonTests, ...tests];
        for (let idx = 0; idx < ordered.length; idx++) {
          if (ordered[idx].order_index !== idx) {
            await supabase.from("lessons").update({ order_index: idx }).eq("id", ordered[idx].id);
          }
        }
      }

      const freshLessons = await loadLessons();
      await logHistory(courseId, courseTitle, "structure", `Создано ${freshLessons.filter(l => l.type !== "test").length} уроков`, freshLessons.length, Date.now() - start);
      return freshLessons;
    } catch (e: any) {
      console.error("Structure generation error:", e);
      toast.error(e.message || "Ошибка генерации структуры");
      await logHistory(courseId, courseTitle, "structure", `❌ Ошибка структуры — ${e.message || "Неизвестная ошибка"}`, 0, 0);
      return [];
    }
  };

  const generateContent = async (overrideLessons?: BulkLessonItem[]) => {
    setPhase("content");
    const start = Date.now();
    const source = overrideLessons || lessons;
    const targets = source.filter((l) => l.selected && l.type !== "test" && isContentEmpty(l.content));
    const previousLessonTitles: string[] = [];
    let successCount = 0;

    for (let batchStart = 0; batchStart < targets.length; batchStart += PARALLEL_BATCH_SIZE) {
      if (abortRef.current) break;
      const batch = targets.slice(batchStart, batchStart + PARALLEL_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (lesson, idxInBatch) => {
          const taskIndex = batchStart + idxInBatch;
          const lessonType = isPracticeLesson(lesson) ? "practice" : "text";
          updateLesson(lesson.id, { status: "generating_text" });
          const { data: textData, error: textError } = await supabase.functions.invoke("generate-lesson-content", {
            body: { lessonTitle: lesson.title, lessonType, courseTitle, courseDescription, previousLessons: previousLessonTitles, taskIndex, lessonIndex: lesson.order_index, ai_provider: aiProvider, ...(aiProvider === "gigachat" && gigachatModel ? { gigachat_model: gigachatModel } : {}) },
          });
          if (textError) throw new Error(textError.message || "Ошибка генерации текста");
          if (!textData?.success || !textData?.blocks?.length) throw new Error(textData?.error || "Пустой ответ от ИИ");
          const { error: saveError } = await supabase.from("lessons").update({ content: JSON.stringify(textData.blocks) }).eq("id", lesson.id);
          if (saveError) throw new Error("Ошибка сохранения: " + saveError.message);
          return lesson;
        })
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const lesson = batch[i];
        if (result.status === "fulfilled") {
          updateLesson(lesson.id, { status: "done" }); previousLessonTitles.push(lesson.title); setDoneCount((p) => p + 1); successCount++;
        } else {
          const errMsg = result.reason?.message || "Неизвестная ошибка";
          updateLesson(lesson.id, { status: "error", error: errMsg }); previousLessonTitles.push(lesson.title);
          await logHistory(courseId, courseTitle, "content", `❌ Ошибка «${lesson.title}» — ${errMsg}`, 0, 0);
        }
      }
    }

    if (successCount > 0) await logHistory(courseId, courseTitle, "content", `Сгенерирован контент для ${successCount} уроков`, successCount, Date.now() - start);
  };

  const generateMedia = async (overrideLessons?: BulkLessonItem[]) => {
    setPhase("media");
    const start = Date.now();
    const source = overrideLessons || lessons;
    const targets = source.filter((l) => l.selected && l.type !== "test" && !isContentEmpty(l.content));
    let mediaCount = 0;

    const processOneMedia = async (lesson: BulkLessonItem, taskIndex: number) => {
      const { data: freshLesson } = await supabase.from("lessons").select("content").eq("id", lesson.id).single();
      if (!freshLesson?.content) return;
      let blocks: any[];
      try { blocks = JSON.parse(freshLesson.content); if (!Array.isArray(blocks)) return; } catch { return; }

      const hasImage = blocks.some((b: any) => b.type === "image" && b.imageSrc);
      const hasAudio = blocks.some((b: any) => b.type === "audio" && b.audioUrl);
      let changed = false;

      if (!hasImage) {
        updateLesson(lesson.id, { status: "generating_image" });
        try {
          const { data: imgData, error: imgError } = await supabase.functions.invoke("generate-image", {
            body: { prompt: `Образовательная иллюстрация для урока "${lesson.title}". Профессиональная, чистая, подходящая для онлайн-курса.`, provider: "gigachat", slotIndex: taskIndex },
          });
          if (!imgError && imgData?.url) {
            blocks.unshift({ id: crypto.randomUUID(), type: "image", content: "", imageSrc: imgData.url });
            changed = true;
          }
        } catch {}
      }

      if (!hasAudio) {
        updateLesson(lesson.id, { status: "generating_audio" as LessonStatus });
        const textBlocks = blocks.filter((b: any) => ["paragraph", "heading1", "heading2", "bulletList", "numberedList", "quote"].includes(b.type) && b.content?.trim().length > 0);
        const fullText = textBlocks.map((b: any) => b.content.trim()).join(". ");
        if (fullText.length > 50) {
          try {
            const ttsText = fullText.slice(0, 4000);
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/salutespeech-tts`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
              body: JSON.stringify({ text: ttsText, voice: "natalya", format: "opus" }),
            });
            if (response.ok) {
              const audioBlob = await response.blob();
              const fileName = `tts_${crypto.randomUUID()}.ogg`;
              const { error: uploadErr } = await supabase.storage.from("course-files").upload(fileName, audioBlob, { contentType: "audio/ogg", cacheControl: "3600", upsert: true });
              if (!uploadErr) {
                const { data: urlData } = supabase.storage.from("course-files").getPublicUrl(fileName);
                if (urlData?.publicUrl) {
                  const insertIdx = blocks[0]?.type === "image" ? 1 : 0;
                  blocks.splice(insertIdx, 0, { id: crypto.randomUUID(), type: "audio", content: fullText.slice(0, 200), audioUrl: urlData.publicUrl });
                  changed = true;
                }
              }
            }
          } catch {}
        }
      }

      if (changed) { await supabase.from("lessons").update({ content: JSON.stringify(blocks) }).eq("id", lesson.id); mediaCount++; }
      updateLesson(lesson.id, { status: "done" }); setDoneCount((p) => p + 1);
    };

    for (let batchStart = 0; batchStart < targets.length; batchStart += PARALLEL_BATCH_SIZE) {
      if (abortRef.current) break;
      const batch = targets.slice(batchStart, batchStart + PARALLEL_BATCH_SIZE);
      await Promise.allSettled(batch.map((lesson, i) => processOneMedia(lesson, batchStart + i)));
    }

    if (mediaCount > 0) await logHistory(courseId, courseTitle, "media", `Изображения и аудио для ${mediaCount} уроков`, mediaCount, Date.now() - start);
  };

  const solveTests = async (overrideLessons?: BulkLessonItem[]) => {
    setPhase("tests");
    const start = Date.now();
    const source = overrideLessons || lessons;
    const targets = source.filter((l) => l.selected && l.type === "test");
    let totalAnswered = 0;

    for (let i = 0; i < targets.length; i++) {
      if (abortRef.current) break;
      const lesson = targets[i];
      updateLesson(lesson.id, { status: "solving_test" });
      try {
        const { data: questions, error: qError } = await supabase.from("test_questions").select("id, question, options, correct_answer, order_index").eq("lesson_id", lesson.id).order("order_index");
        if (qError) throw new Error("Ошибка загрузки вопросов: " + qError.message);
        if (!questions?.length) { updateLesson(lesson.id, { status: "done" }); setDoneCount((p) => p + 1); continue; }

        const allAnswers: Array<{ questionIndex: number; correctAnswer: number; explanation?: string }> = [];
        for (let batchStart = 0; batchStart < questions.length; batchStart += TEST_BATCH_SIZE) {
          if (abortRef.current) break;
          const batch = questions.slice(batchStart, batchStart + TEST_BATCH_SIZE);
          const questionsForAI = batch.map((q: any) => ({ question: q.question, options: Array.isArray(q.options) ? q.options.map((o: any) => typeof o === "string" ? o : o.text || String(o)) : [] }));
          const { data: aiData, error: aiError } = await supabase.functions.invoke("gigachat", { body: { action: "generate_answers", courseTitle, lessonTitle: lesson.title, questions: questionsForAI, taskIndex: i } });
          if (aiError) throw new Error(aiError.message || "Ошибка AI");
          if (aiData.parseError) throw new Error("ИИ вернул ответ в неожиданном формате");
          const batchAnswers = (aiData.answers || []).map((a: any) => ({ ...a, questionIndex: a.questionIndex + batchStart }));
          allAnswers.push(...batchAnswers);
          if (batchStart + TEST_BATCH_SIZE < questions.length) await new Promise((r) => setTimeout(r, 1500));
        }

        for (const answer of allAnswers) {
          if (answer.questionIndex >= 0 && answer.questionIndex < questions.length) {
            await supabase.from("test_questions").update({ correct_answer: answer.correctAnswer ?? 0, explanation: answer.explanation || null }).eq("id", questions[answer.questionIndex].id);
          }
        }
        totalAnswered += allAnswers.length;
        updateLesson(lesson.id, { status: "done" }); setDoneCount((p) => p + 1);
      } catch (e: any) {
        updateLesson(lesson.id, { status: "error", error: e.message || "Ошибка решения теста" });
        await logHistory(courseId, courseTitle, "answers", `❌ Ошибка теста «${lesson.title}» — ${e.message}`, 0, 0);
      }
      if (i < targets.length - 1 && !abortRef.current) await new Promise((r) => setTimeout(r, 2000));
    }

    if (totalAnswered > 0) await logHistory(courseId, courseTitle, "answers", `Решено ${totalAnswered} вопросов`, totalAnswered, Date.now() - start);
  };

  const startFullPipeline = async () => {
    setProcessing(true); setDoneCount(0); abortRef.current = false;
    setLessons((prev) => prev.map((l) => ({ ...l, status: "pending", error: undefined })));

    let freshLessons: BulkLessonItem[] | undefined;
    if (!hasContentLessons) {
      freshLessons = await generateStructure();
      if (!freshLessons.length || abortRef.current) { setProcessing(false); setPhase("idle"); return; }
      await new Promise((r) => setTimeout(r, 1000));
    }

    const source = freshLessons || lessons;
    const cTargets = source.filter((l) => l.selected && l.type !== "test" && isContentEmpty(l.content)).length;
    const mTargets = source.filter((l) => l.selected && l.type !== "test").length;
    const tTargets = source.filter((l) => l.selected && l.type === "test").length;
    setTotalToProcess(cTargets + mTargets + tTargets);

    if (!abortRef.current) await generateContent(freshLessons);
    if (!abortRef.current) await generateMedia(freshLessons);
    if (!abortRef.current) await solveTests(freshLessons);

    setPhase(abortRef.current ? "idle" : "complete");
    setProcessing(false);
    if (!abortRef.current) toast.success("Полная генерация курса завершена!");
  };

  const retryErrors = async () => {
    const errorLessons = lessons.filter((l) => l.status === "error" && l.selected);
    if (!errorLessons.length) return;
    setProcessing(true); abortRef.current = false;

    for (let i = 0; i < errorLessons.length; i++) {
      if (abortRef.current) break;
      const lesson = errorLessons[i];

      if (lesson.type === "test") {
        updateLesson(lesson.id, { status: "solving_test", error: undefined });
        try {
          const { data: questions, error: qError } = await supabase.from("test_questions").select("id, question, options, correct_answer, order_index").eq("lesson_id", lesson.id).order("order_index");
          if (qError) throw new Error(qError.message);
          if (!questions?.length) { updateLesson(lesson.id, { status: "done" }); setDoneCount((p) => p + 1); continue; }

          const allAnswers: Array<{ questionIndex: number; correctAnswer: number; explanation?: string }> = [];
          for (let batchStart = 0; batchStart < questions.length; batchStart += TEST_BATCH_SIZE) {
            if (abortRef.current) break;
            const batch = questions.slice(batchStart, batchStart + TEST_BATCH_SIZE);
            const questionsForAI = batch.map((q: any) => ({ question: q.question, options: Array.isArray(q.options) ? q.options.map((o: any) => typeof o === "string" ? o : o.text || String(o)) : [] }));
            const { data: aiData, error: aiError } = await supabase.functions.invoke("gigachat", { body: { action: "generate_answers", courseTitle, lessonTitle: lesson.title, questions: questionsForAI } });
            if (aiError) throw new Error(aiError.message);
            if (aiData.parseError) throw new Error("Неожиданный формат ответа AI");
            allAnswers.push(...(aiData.answers || []).map((a: any) => ({ ...a, questionIndex: a.questionIndex + batchStart })));
            if (batchStart + TEST_BATCH_SIZE < questions.length) await new Promise((r) => setTimeout(r, 1500));
          }
          for (const answer of allAnswers) {
            if (answer.questionIndex >= 0 && answer.questionIndex < questions.length) {
              await supabase.from("test_questions").update({ correct_answer: answer.correctAnswer ?? 0, explanation: answer.explanation || null }).eq("id", questions[answer.questionIndex].id);
            }
          }
          updateLesson(lesson.id, { status: "done" }); setDoneCount((p) => p + 1);
        } catch (e: any) { updateLesson(lesson.id, { status: "error", error: e.message }); }
      } else {
        updateLesson(lesson.id, { status: "generating_text", error: undefined });
        try {
          const lessonType = isPracticeLesson(lesson) ? "practice" : "text";
          const { data: textData, error: textError } = await supabase.functions.invoke("generate-lesson-content", {
            body: { lessonTitle: lesson.title, lessonType, courseTitle, courseDescription, previousLessons: [], ai_provider: aiProvider, ...(aiProvider === "gigachat" && gigachatModel ? { gigachat_model: gigachatModel } : {}) },
          });
          if (textError) throw new Error(textError.message);
          if (!textData?.success || !textData?.blocks?.length) throw new Error(textData?.error || "Пустой ответ");

          updateLesson(lesson.id, { status: "generating_image" });
          let imageUrl: string | null = null;
          try {
            const { data: imgData } = await supabase.functions.invoke("generate-image", { body: { prompt: `Образовательная иллюстрация для урока: ${lesson.title}`, provider: "gigachat", slotIndex: i } });
            if (imgData?.url) imageUrl = imgData.url;
          } catch {}

          const finalBlocks = [...textData.blocks];
          if (imageUrl) finalBlocks.push({ type: "image", content: imageUrl });
          const { error: saveError } = await supabase.from("lessons").update({ content: JSON.stringify(finalBlocks) }).eq("id", lesson.id);
          if (saveError) throw new Error(saveError.message);

          updateLesson(lesson.id, { status: "done" }); setDoneCount((p) => p + 1);
        } catch (e: any) { updateLesson(lesson.id, { status: "error", error: e.message }); }
      }
      if (i < errorLessons.length - 1 && !abortRef.current) await new Promise((r) => setTimeout(r, 2000));
    }
    setProcessing(false);
  };

  const stopGeneration = () => { abortRef.current = true; };

  const isPhaseComplete = (p: string) => {
    const order = ["idle", "structure", "content", "tests", "complete"];
    return order.indexOf(phase) > order.indexOf(p);
  };

  return {
    lessons, loading, processing, phase, doneCount, totalToProcess,
    hasLessons, hasContentLessons, contentLessons, testLessons, selectedCount, errorCount, progress,
    toggleAll, toggleLesson, startFullPipeline, retryErrors, stopGeneration, isPhaseComplete,
    PHASE_LABELS,
  };
}
