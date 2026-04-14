import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, Loader2, Check, X, AlertCircle, RotateCcw, CheckSquare, Square, Layers, FileText, FileQuestion, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

type LessonStatus = "pending" | "generating_text" | "generating_image" | "generating_audio" | "solving_test" | "done" | "error";
type Phase = "idle" | "structure" | "content" | "media" | "tests" | "complete";

interface LessonItem {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
  selected: boolean;
  status: LessonStatus;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
  courseDescription?: string;
}

const PHASE_LABELS: Record<Phase, string> = {
  idle: "Готово к запуску",
  structure: "Фаза 1: Генерация структуры",
  content: "Фаза 2: Генерация контента",
  media: "Фаза 3: Изображения и аудио",
  tests: "Фаза 4: Решение тестов",
  complete: "Завершено",
};

/** Check if lesson content is empty or just a placeholder heading */
const isContentEmpty = (content: string | null): boolean => {
  if (!content || content === "[]" || content === "null") return true;
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed) || parsed.length === 0) return true;
    // Treat single-heading placeholder as empty (e.g. practice placeholder)
    if (parsed.length === 1 && parsed[0]?.type === "heading1") return true;
    return false;
  } catch {
    return !content.trim();
  }
};

/** Detect if lesson is a practice task by its content placeholder */
const isPracticeLesson = (lesson: LessonItem): boolean => {
  if (!lesson.content) return false;
  return lesson.content.includes("Практическое задание");
};

const TEST_BATCH_SIZE = 20;
const PARALLEL_BATCH_SIZE = 3;

/** Helper to log generation history */
const logHistory = async (
  courseId: string,
  courseTitle: string,
  action: string,
  details: string,
  itemsCount: number,
  durationMs: number,
  streamIndex?: number
) => {
  try {
    await supabase.from("generation_history").insert({
      course_id: courseId,
      course_title: courseTitle,
      action,
      details,
      items_count: itemsCount,
      duration_ms: durationMs,
      stream_index: streamIndex ?? null,
    });
  } catch (e) {
  }
};

export function BulkContentGenerator({ open, onOpenChange, courseId, courseTitle, courseDescription }: Props) {
  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [doneCount, setDoneCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const abortRef = useRef(false);

  // AI settings for 3-slot routing
  const [aiProvider, setAiProvider] = useState("gigachat");
  const [gigachatModel, setGigachatModel] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("ai_settings")
          .select("provider, gigachat_model")
          .eq("context", "pipeline")
          .single();
        if (data) {
          setAiProvider(data.provider || "gigachat");
          setGigachatModel(data.gigachat_model || undefined);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (open && courseId) {
      loadLessons();
      setPhase("idle");
    }
    return () => { abortRef.current = true; };
  }, [open, courseId]);

  const loadLessons = async (): Promise<LessonItem[]> => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("lessons")
        .select("id, title, type, content, order_index")
        .eq("course_id", courseId)
        .order("order_index");

      if (error) throw error;

      const items: LessonItem[] = (data || []).map((l) => ({
        ...l,
        selected: true,
        status: "pending" as LessonStatus,
      }));

      setLessons(items);
      setDoneCount(0);
      setTotalToProcess(0);
      setProcessing(false);
      abortRef.current = false;
      return items;
    } catch (e) {
      console.error(e);
      toast.error("Ошибка загрузки уроков");
      return [];
    } finally {
      setLoading(false);
    }
  };

  const toggleAll = () => {
    const allSelected = lessons.every((l) => l.selected);
    setLessons((prev) => prev.map((l) => ({ ...l, selected: !allSelected })));
  };

  const toggleLesson = (id: string) => {
    setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, selected: !l.selected } : l)));
  };

  const updateLesson = useCallback((id: string, patch: Partial<LessonItem>) => {
    setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const hasLessons = lessons.length > 0;
  const hasContentLessons = lessons.some((l) => l.type !== "test");
  const contentLessons = lessons.filter((l) => l.selected && l.type !== "test" && isContentEmpty(l.content));
  const testLessons = lessons.filter((l) => l.selected && l.type === "test");
  const selectedCount = lessons.filter((l) => l.selected).length;

  // Phase 1: Generate structure — returns fresh lessons
  const generateStructure = async (): Promise<LessonItem[]> => {
    setPhase("structure");
    const structureStart = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke("generate-course-structure", {
        body: { title: courseTitle, description: courseDescription || "" },
      });

      if (error) throw new Error(error.message || "Ошибка генерации структуры");
      if (!data?.success || !data?.lessons?.length) {
        throw new Error(data?.error || "Не удалось создать структуру");
      }

      // Check if test lessons already exist — skip inserting new tests
      const existingTestCount = lessons.filter((l) => l.type === "test").length;
      const lessonsToInsert = data.lessons
        .filter((l: any) => !(l.type === "test" && existingTestCount > 0))
        .map((l: any, i: number) => ({
          course_id: courseId,
          title: l.title,
          type: l.type === "practice" ? "text" : l.type,
          content: l.type === "practice" ? JSON.stringify([{ type: "heading1", content: "Практическое задание" }]) : null,
          order_index: existingTestCount > 0 ? i : i, // will be reordered after reload
        }));

      if (lessonsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("lessons")
          .insert(lessonsToInsert);

        if (insertError) throw new Error("Ошибка сохранения уроков: " + insertError.message);
      }

      // Robust reorder: all non-test lessons first, then tests at the end
      const { data: allLessons } = await supabase
        .from("lessons")
        .select("id, type, order_index")
        .eq("course_id", courseId)
        .order("order_index");

      if (allLessons) {
        const nonTests = allLessons.filter(l => l.type !== "test");
        const tests = allLessons.filter(l => l.type === "test");
        const ordered = [...nonTests, ...tests];
        for (let idx = 0; idx < ordered.length; idx++) {
          if (ordered[idx].order_index !== idx) {
            await supabase.from("lessons")
              .update({ order_index: idx })
              .eq("id", ordered[idx].id);
          }
        }
      }

      // Return fresh lessons from DB
      const freshLessons = await loadLessons();
      await logHistory(courseId, courseTitle, "structure", `Создано ${freshLessons.filter(l => l.type !== "test").length} уроков`, freshLessons.length, Date.now() - structureStart);
      return freshLessons;
    } catch (e: any) {
      console.error("Structure generation error:", e);
      toast.error(e.message || "Ошибка генерации структуры");
      await logHistory(courseId, courseTitle, "structure", `❌ Ошибка структуры — ${e.message || "Неизвестная ошибка"}`, 0, 0);
      return [];
    }
  };

  // Phase 2: Generate content for text/practice lessons (parallel batches)
  const generateContent = async (overrideLessons?: LessonItem[]) => {
    setPhase("content");
    const contentStart = Date.now();
    const source = overrideLessons || lessons;
    const targets = source.filter(
      (l) => l.selected && l.type !== "test" && isContentEmpty(l.content)
    );

    const previousLessonTitles: string[] = [];
    let successCount = 0;

    // Process in parallel batches of PARALLEL_BATCH_SIZE
    for (let batchStart = 0; batchStart < targets.length; batchStart += PARALLEL_BATCH_SIZE) {
      if (abortRef.current) break;
      const batch = targets.slice(batchStart, batchStart + PARALLEL_BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (lesson, idxInBatch) => {
          const taskIndex = batchStart + idxInBatch;
          const lessonType = isPracticeLesson(lesson) ? "practice" : "text";

          updateLesson(lesson.id, { status: "generating_text" });
          const { data: textData, error: textError } = await supabase.functions.invoke("generate-lesson-content", {
            body: {
              lessonTitle: lesson.title,
              lessonType,
              courseTitle,
              courseDescription,
              previousLessons: previousLessonTitles,
              taskIndex,
              lessonIndex: lesson.order_index,
              ai_provider: aiProvider,
              ...(aiProvider === "gigachat" && gigachatModel ? { gigachat_model: gigachatModel } : {}),
            },
          });
          if (textError) throw new Error(textError.message || "Ошибка генерации текста");
          if (!textData?.success || !textData?.blocks?.length) {
            throw new Error(textData?.error || "Пустой ответ от ИИ");
          }

          const { error: saveError } = await supabase
            .from("lessons")
            .update({ content: JSON.stringify(textData.blocks) })
            .eq("id", lesson.id);

          if (saveError) throw new Error("Ошибка сохранения: " + saveError.message);
          return lesson;
        })
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const lesson = batch[i];
        if (result.status === "fulfilled") {
          updateLesson(lesson.id, { status: "done" });
          previousLessonTitles.push(lesson.title);
          setDoneCount((prev) => prev + 1);
          successCount++;
        } else {
          const errMsg = result.reason?.message || "Неизвестная ошибка";
          console.error("Error processing lesson", lesson.title, result.reason);
          updateLesson(lesson.id, { status: "error", error: errMsg });
          previousLessonTitles.push(lesson.title);
          // Log error to history
          await logHistory(courseId, courseTitle, "content", `❌ Ошибка «${lesson.title}» — ${errMsg}`, 0, 0);
        }
      }
    }

    if (successCount > 0) {
      await logHistory(courseId, courseTitle, "content", `Сгенерирован контент для ${successCount} уроков (батчи по ${PARALLEL_BATCH_SIZE})`, successCount, Date.now() - contentStart);
    }
  };

  // Phase 3: Generate images and audio for content lessons (parallel batches)
  const generateMedia = async (overrideLessons?: LessonItem[]) => {
    setPhase("media");
    const mediaStart = Date.now();
    const source = overrideLessons || lessons;
    const targets = source.filter(
      (l) => l.selected && l.type !== "test" && !isContentEmpty(l.content)
    );

    let mediaCount = 0;

    const processOneMedia = async (lesson: LessonItem, taskIndex: number) => {
      const { data: freshLesson } = await supabase
        .from("lessons")
        .select("content")
        .eq("id", lesson.id)
        .single();

      if (!freshLesson?.content) return;

      let blocks: any[];
      try {
        blocks = JSON.parse(freshLesson.content);
        if (!Array.isArray(blocks)) return;
      } catch { return; }

      const hasImage = blocks.some((b: any) => b.type === "image" && b.imageSrc);
      const hasAudio = blocks.some((b: any) => b.type === "audio" && b.audioUrl);

      let changed = false;

      if (!hasImage) {
        updateLesson(lesson.id, { status: "generating_image" });
        try {
          const { data: imgData, error: imgError } = await supabase.functions.invoke("generate-image", {
            body: {
              prompt: `Образовательная иллюстрация для урока "${lesson.title}". Профессиональная, чистая, подходящая для онлайн-курса.`,
              provider: "gigachat",
              slotIndex: taskIndex,
            },
          });
          if (imgError) {
            console.error(`Image generation error for "${lesson.title}":`, imgError);
          } else if (imgData?.url) {
            blocks.unshift({
              id: crypto.randomUUID(),
              type: "image",
              content: "",
              imageSrc: imgData.url,
            });
            changed = true;
          } else {
            console.error(`Image generation returned no URL for "${lesson.title}":`, JSON.stringify(imgData));
          }
        } catch (e) {
          console.error(`Image generation exception for "${lesson.title}":`, e);
        }
      }

      if (!hasAudio) {
        updateLesson(lesson.id, { status: "generating_audio" as LessonStatus });
        // Collect ALL text from lesson blocks for full TTS
        const textBlocks = blocks.filter(
          (b: any) => ["paragraph", "heading1", "heading2", "bulletList", "numberedList", "quote"].includes(b.type) && b.content && b.content.trim().length > 0
        );
        const fullText = textBlocks.map((b: any) => b.content.trim()).join(". ");

        if (fullText.length > 50) {
          try {
            // Send full text (SaluteSpeech handles up to ~4000 chars, send more for full coverage)
            const ttsText = fullText.slice(0, 4000);
            const response = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/salutespeech-tts`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                  "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                },
                body: JSON.stringify({
                  text: ttsText,
                  voice: "natalya",
                  format: "opus",
                }),
              }
            );
            if (response.ok) {
              const audioBlob = await response.blob();
              const fileName = `tts_${crypto.randomUUID()}.ogg`;
              const { error: uploadErr } = await supabase.storage
                .from("course-files")
                .upload(fileName, audioBlob, {
                  contentType: "audio/ogg",
                  cacheControl: "3600",
                  upsert: true,
                });
              if (!uploadErr) {
                const { data: urlData } = supabase.storage.from("course-files").getPublicUrl(fileName);
                if (urlData?.publicUrl) {
                  const insertIdx = blocks[0]?.type === "image" ? 1 : 0;
                  blocks.splice(insertIdx, 0, {
                    id: crypto.randomUUID(),
                    type: "audio",
                    content: fullText.slice(0, 200),
                    audioUrl: urlData.publicUrl,
                  });
                  changed = true;
                }
              }
            } else {
              console.error(`TTS failed for "${lesson.title}": ${response.status} ${response.statusText}`);
            }
          } catch (e) {
            console.error(`TTS exception for "${lesson.title}":`, e);
          }
        }
      }

      if (changed) {
        await supabase.from("lessons").update({ content: JSON.stringify(blocks) }).eq("id", lesson.id);
        mediaCount++;
      }

      updateLesson(lesson.id, { status: "done" });
      setDoneCount((prev) => prev + 1);
    };

    // Process in parallel batches
    for (let batchStart = 0; batchStart < targets.length; batchStart += PARALLEL_BATCH_SIZE) {
      if (abortRef.current) break;
      const batch = targets.slice(batchStart, batchStart + PARALLEL_BATCH_SIZE);
      await Promise.allSettled(
        batch.map((lesson, i) => processOneMedia(lesson, batchStart + i))
      );
    }

    if (mediaCount > 0) {
      await logHistory(courseId, courseTitle, "media", `Изображения и аудио для ${mediaCount} уроков`, mediaCount, Date.now() - mediaStart);
    }
  };

  // Phase 4: Solve test questions using AI (with batching)
  const solveTests = async (overrideLessons?: LessonItem[]) => {
    setPhase("tests");
    const testsStart = Date.now();
    const source = overrideLessons || lessons;
    const targets = source.filter((l) => l.selected && l.type === "test");
    let totalAnswered = 0;

    for (let i = 0; i < targets.length; i++) {
      if (abortRef.current) break;
      const lesson = targets[i];

      updateLesson(lesson.id, { status: "solving_test" });
      try {
        const { data: questions, error: qError } = await supabase
          .from("test_questions")
          .select("id, question, options, correct_answer, order_index")
          .eq("lesson_id", lesson.id)
          .order("order_index");

        if (qError) throw new Error("Ошибка загрузки вопросов: " + qError.message);
        if (!questions || questions.length === 0) {
          updateLesson(lesson.id, { status: "done" });
          setDoneCount((prev) => prev + 1);
          continue;
        }

        const allAnswers: Array<{ questionIndex: number; correctAnswer: number; explanation?: string }> = [];

        for (let batchStart = 0; batchStart < questions.length; batchStart += TEST_BATCH_SIZE) {
          if (abortRef.current) break;
          const batch = questions.slice(batchStart, batchStart + TEST_BATCH_SIZE);

          const questionsForAI = batch.map((q: any) => ({
            question: q.question,
            options: Array.isArray(q.options) ? q.options.map((o: any) => typeof o === "string" ? o : o.text || String(o)) : [],
          }));

          const { data: aiData, error: aiError } = await supabase.functions.invoke("gigachat", {
            body: {
              action: "generate_answers",
              courseTitle,
              lessonTitle: lesson.title,
              questions: questionsForAI,
              taskIndex: i,
            },
          });

          if (aiError) throw new Error(aiError.message || "Ошибка AI");
          if (aiData.parseError) throw new Error("ИИ вернул ответ в неожиданном формате");

          const batchAnswers = (aiData.answers || []).map((a: any) => ({
            ...a,
            questionIndex: a.questionIndex + batchStart,
          }));
          allAnswers.push(...batchAnswers);

          if (batchStart + TEST_BATCH_SIZE < questions.length) {
            await new Promise((r) => setTimeout(r, 1500));
          }
        }

        for (const answer of allAnswers) {
          const questionIdx = answer.questionIndex;
          if (questionIdx >= 0 && questionIdx < questions.length) {
            const q = questions[questionIdx];
            await supabase
              .from("test_questions")
              .update({
                correct_answer: answer.correctAnswer ?? 0,
                explanation: answer.explanation || null,
              })
              .eq("id", q.id);
          }
        }

        totalAnswered += allAnswers.length;
        updateLesson(lesson.id, { status: "done" });
        setDoneCount((prev) => prev + 1);
      } catch (e: any) {
        console.error("Error solving test", lesson.title, e);
        updateLesson(lesson.id, { status: "error", error: e.message || "Ошибка решения теста" });
        await logHistory(courseId, courseTitle, "answers", `❌ Ошибка теста «${lesson.title}» — ${e.message || "Неизвестная ошибка"}`, 0, 0);
      }

      if (i < targets.length - 1 && !abortRef.current) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    if (totalAnswered > 0) {
      await logHistory(courseId, courseTitle, "answers", `Решено ${totalAnswered} вопросов в ${targets.length} тестах`, totalAnswered, Date.now() - testsStart);
    }
  };

  const startFullPipeline = async () => {
    setProcessing(true);
    setDoneCount(0);
    abortRef.current = false;

    setLessons((prev) => prev.map((l) => ({ ...l, status: "pending", error: undefined })));

    let freshLessons: LessonItem[] | undefined;

    // Phase 1: Structure (if no content lessons — only tests or empty)
    if (!hasContentLessons) {
      freshLessons = await generateStructure();
      if (!freshLessons.length || abortRef.current) {
        setProcessing(false);
        setPhase("idle");
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Calculate total using fresh data if available
    const source = freshLessons || lessons;
    const cTargets = source.filter((l) => l.selected && l.type !== "test" && isContentEmpty(l.content)).length;
    const mTargets = source.filter((l) => l.selected && l.type !== "test").length; // media for all content lessons
    const tTargets = source.filter((l) => l.selected && l.type === "test").length;
    setTotalToProcess(cTargets + mTargets + tTargets);

    // Phase 2: Content
    if (!abortRef.current) {
      await generateContent(freshLessons);
    }

    // Phase 3: Media (images + audio)
    if (!abortRef.current) {
      await generateMedia(freshLessons);
    }

    // Phase 4: Solve tests
    if (!abortRef.current) {
      await solveTests(freshLessons);
    }

    setPhase(abortRef.current ? "idle" : "complete");
    setProcessing(false);
    if (!abortRef.current) {
      toast.success("Полная генерация курса завершена!");
    }
  };

  const retryErrors = async () => {
    const errorLessons = lessons.filter((l) => l.status === "error" && l.selected);
    if (errorLessons.length === 0) return;

    setProcessing(true);
    abortRef.current = false;

    for (let i = 0; i < errorLessons.length; i++) {
      if (abortRef.current) break;
      const lesson = errorLessons[i];

      if (lesson.type === "test") {
        // Retry test solving
        updateLesson(lesson.id, { status: "solving_test", error: undefined });
        try {
          const { data: questions, error: qError } = await supabase
            .from("test_questions")
            .select("id, question, options, correct_answer, order_index")
            .eq("lesson_id", lesson.id)
            .order("order_index");

          if (qError) throw new Error(qError.message);
          if (!questions || questions.length === 0) {
            updateLesson(lesson.id, { status: "done" });
            setDoneCount((prev) => prev + 1);
            continue;
          }

          // Batch test questions
          const allAnswers: Array<{ questionIndex: number; correctAnswer: number; explanation?: string }> = [];
          for (let batchStart = 0; batchStart < questions.length; batchStart += TEST_BATCH_SIZE) {
            if (abortRef.current) break;
            const batch = questions.slice(batchStart, batchStart + TEST_BATCH_SIZE);
            const questionsForAI = batch.map((q: any) => ({
              question: q.question,
              options: Array.isArray(q.options) ? q.options.map((o: any) => typeof o === "string" ? o : o.text || String(o)) : [],
            }));

            const { data: aiData, error: aiError } = await supabase.functions.invoke("gigachat", {
              body: { action: "generate_answers", courseTitle, lessonTitle: lesson.title, questions: questionsForAI },
            });

            if (aiError) throw new Error(aiError.message);
            if (aiData.parseError) throw new Error("Неожиданный формат ответа AI");

            const batchAnswers = (aiData.answers || []).map((a: any) => ({
              ...a,
              questionIndex: a.questionIndex + batchStart,
            }));
            allAnswers.push(...batchAnswers);

            if (batchStart + TEST_BATCH_SIZE < questions.length) {
              await new Promise((r) => setTimeout(r, 1500));
            }
          }

          for (const answer of allAnswers) {
            const questionIdx = answer.questionIndex;
            if (questionIdx >= 0 && questionIdx < questions.length) {
              await supabase
                .from("test_questions")
                .update({ correct_answer: answer.correctAnswer ?? 0, explanation: answer.explanation || null })
                .eq("id", questions[questionIdx].id);
            }
          }

          updateLesson(lesson.id, { status: "done" });
          setDoneCount((prev) => prev + 1);
        } catch (e: any) {
          updateLesson(lesson.id, { status: "error", error: e.message });
        }
      } else {
        // Retry content generation
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
            const { data: imgData } = await supabase.functions.invoke("generate-image", {
              body: { prompt: `Образовательная иллюстрация для урока: ${lesson.title}`, provider: "gigachat", slotIndex: i },
            });
            if (imgData?.url) imageUrl = imgData.url;
          } catch {}

          const finalBlocks = [...textData.blocks];
          if (imageUrl) finalBlocks.push({ type: "image", content: imageUrl });

          const { error: saveError } = await supabase.from("lessons").update({ content: JSON.stringify(finalBlocks) }).eq("id", lesson.id);
          if (saveError) throw new Error(saveError.message);

          updateLesson(lesson.id, { status: "done" });
          setDoneCount((prev) => prev + 1);
        } catch (e: any) {
          updateLesson(lesson.id, { status: "error", error: e.message });
        }
      }

      if (i < errorLessons.length - 1 && !abortRef.current) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    setProcessing(false);
  };

  const stopGeneration = () => { abortRef.current = true; };

  const errorCount = lessons.filter((l) => l.status === "error").length;
  const progress = totalToProcess > 0 ? (doneCount / totalToProcess) * 100 : 0;

  const statusIcon = (status: LessonStatus) => {
    switch (status) {
      case "generating_text":
      case "generating_image":
      case "generating_audio":
      case "solving_test":
        return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case "done":
        return <Check className="w-4 h-4 text-accent-foreground" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return null;
    }
  };

  const statusText = (status: LessonStatus) => {
    switch (status) {
      case "generating_text": return "Текст...";
      case "generating_image": return "Изображение...";
      case "generating_audio": return "Аудио...";
      case "solving_test": return "Решение теста...";
      case "done": return "Готово";
      case "error": return "Ошибка";
      default: return "";
    }
  };

  const typeBadge = (type: string) => {
    switch (type) {
      case "test": return <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-600">Тест</Badge>;
      case "practice": return <Badge variant="outline" className="text-xs">Практика</Badge>;
      default: return <Badge variant="secondary" className="text-xs">Лекция</Badge>;
    }
  };

  const isPhaseComplete = (p: string) => {
    const order = ["idle", "structure", "content", "tests", "complete"];
    return order.indexOf(phase) > order.indexOf(p);
  };

  const phaseIndicator = (phaseName: string, label: string, icon: React.ReactNode, isActive: boolean) => (
    <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${
      isActive ? "bg-primary/10 text-primary font-medium" :
      isPhaseComplete(phaseName) ? "bg-accent text-accent-foreground" : "text-muted-foreground"
    }`}>
      {icon}
      {label}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (processing) stopGeneration(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Полная генерация курса
          </DialogTitle>
          <DialogDescription className="truncate">{courseTitle}</DialogDescription>
        </DialogHeader>

        {/* Phase indicators */}
        <div className="flex items-center gap-2 flex-wrap">
          {phaseIndicator("structure", "Структура", <Layers className="w-3.5 h-3.5" />, phase === "structure")}
          <span className="text-muted-foreground">→</span>
          {phaseIndicator("content", "Контент", <FileText className="w-3.5 h-3.5" />, phase === "content")}
          <span className="text-muted-foreground">→</span>
          {phaseIndicator("media", "Медиа", <ImageIcon className="w-3.5 h-3.5" />, phase === "media")}
          <span className="text-muted-foreground">→</span>
          {phaseIndicator("tests", "Тесты", <FileQuestion className="w-3.5 h-3.5" />, phase === "tests")}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !hasLessons ? (
          <div className="text-center py-8 space-y-2">
            <p className="text-muted-foreground">Уроков пока нет — ИИ создаст структуру и контент автоматически</p>
            <p className="text-xs text-muted-foreground">Структура: лекции → практические задания → итоговое тестирование</p>
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={toggleAll} disabled={processing}>
                {lessons.every((l) => l.selected) ? (
                  <><CheckSquare className="w-4 h-4 mr-1.5" />Снять все</>
                ) : (
                  <><Square className="w-4 h-4 mr-1.5" />Выбрать все</>
                )}
              </Button>
              <div className="flex gap-1.5 items-center">
                <Badge variant="secondary">{contentLessons.length} к генерации</Badge>
                <Badge variant="outline" className="border-orange-500/30 text-orange-600" title="ИИ подберёт правильные ответы к вопросам теста">{testLessons.length} тестов</Badge>
              </div>
            </div>

            {/* Progress */}
            {processing && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{PHASE_LABELS[phase]}</span>
                  <span>{doneCount} / {totalToProcess || "..."}</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {/* Lesson list */}
            <ScrollArea className="flex-1 min-h-[200px] max-h-[50vh] -mx-2 px-2">
              <div className="space-y-1">
                {lessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      lesson.status === "done" ? "bg-green-500/5" :
                      lesson.status === "error" ? "bg-destructive/5" :
                      ["generating_text", "generating_image", "generating_audio", "solving_test"].includes(lesson.status) ? "bg-primary/5" :
                      "hover:bg-secondary/50"
                    }`}
                  >
                    <Checkbox
                      checked={lesson.selected}
                      onCheckedChange={() => toggleLesson(lesson.id)}
                      disabled={processing}
                    />
                    {typeBadge(lesson.type)}
                    <span className="flex-1 truncate">{lesson.title}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {statusIcon(lesson.status)}
                      <span className="text-xs text-muted-foreground w-28 text-right">
                        {lesson.status === "error" && lesson.error
                          ? lesson.error.substring(0, 25)
                          : statusText(lesson.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {errorCount > 0 && !processing && (
            <Button variant="outline" onClick={retryErrors}>
              <RotateCcw className="w-4 h-4 mr-1.5" />
              Повторить ошибки ({errorCount})
            </Button>
          )}
          {processing ? (
            <Button variant="destructive" onClick={stopGeneration}>
              <X className="w-4 h-4 mr-1.5" />Остановить
            </Button>
          ) : (
            <Button onClick={startFullPipeline} disabled={loading}>
              <Sparkles className="w-4 h-4 mr-1.5" />
              {hasLessons ? `Генерировать контент` : `Создать курс полностью`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
