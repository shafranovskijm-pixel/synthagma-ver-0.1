import { useState, useCallback, useEffect } from "react";
import {
  ArrowLeft, Sparkles, Loader2, CheckCircle2, AlertTriangle,
  FolderOpen, Plus, Play, BookOpen, FileText, HelpCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";
import { markdownToBlocks, blocksToJson } from "@/components/course-builder/BlockEditor";
import type { ContentBlock } from "@/components/course-builder/BlockEditor";
import type { DbCategory } from "@/hooks/useAdminMarketplace";
import { initExternalSupabase, getExternalSupabase } from "@/integrations/external-supabase/client";
import { safeFetch } from "@/utils/safeInvoke";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface MarketplaceCourseWithDetails {
  id: string;
  course_id: string;
  organization_id: string | null;
  price_student: number;
  price_organization: number;
  is_active: boolean;
  is_validated?: boolean;
  description_short: string | null;
  preview_image_url: string | null;
  created_at: string;
  course?: { id: string; title: string; description: string | null; duration: string | null; category_id?: string | null };
  organization?: { name: string } | null;
}

interface Props {
  courses: MarketplaceCourseWithDetails[];
  dbCategories: DbCategory[];
  onComplete: () => void;
}

interface CourseAnalysis {
  courseId: string;
  totalLessons: number;
  emptyLessons: number;
  totalTests: number;
  unansweredQuestions: number;
}

type GeneratingPhase = "idle" | "structure" | "streaming" | "enriching";

const PHASE_LABELS: Record<GeneratingPhase, string> = {
  idle: "",
  structure: "Генерация структуры...",
  streaming: "Параллельная генерация (контент → вопросы → ответы)...",
  enriching: "Обогащение медиа (анализ + изображения + слайды)...",
};

const programTypes = [
  "Повышение квалификации",
  "Профессиональная переподготовка",
  "Охрана труда / Пожарная безопасность",
  "Рабочие профессии",
];

export function ContentGeneratorTab({ courses, dbCategories, onComplete }: Props) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [courseAnalyses, setCourseAnalyses] = useState<Record<string, CourseAnalysis>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingCourseId, setGeneratingCourseId] = useState<string | null>(null);
  const [generatingPhase, setGeneratingPhase] = useState<GeneratingPhase>("idle");
  const [generatingProgress, setGeneratingProgress] = useState(0);
  const [newCourseName, setNewCourseName] = useState("");
  const [creatingCourse, setCreatingCourse] = useState(false);

  // AI settings
  const [aiProvider, setAiProvider] = useState("gigachat");
  const [gigachatModel, setGigachatModel] = useState<string | undefined>();
  const [lovableModel, setLovableModel] = useState<string | undefined>();

  useEffect(() => {
    const loadAiSettings = async () => {
      try {
        const { data } = await supabase
          .from("ai_settings")
          .select("provider, gigachat_model, lovable_model")
          .eq("context", "pipeline")
          .single();
        if (data) {
          setAiProvider(data.provider || "gigachat");
          setGigachatModel(data.gigachat_model || undefined);
          setLovableModel(data.lovable_model || undefined);
        }
      } catch {}
    };
    loadAiSettings();
  }, []);

  const selectedCategory = dbCategories.find(c => c.id === selectedCategoryId);
  const categoryCourses = selectedCategoryId
    ? courses.filter(c => c.course?.category_id === selectedCategoryId)
    : [];

  // Group categories by parent_type
  const categoryGroups = programTypes.map(pt => ({
    type: pt,
    categories: dbCategories.filter(c => (c.parent_type || "Повышение квалификации") === pt),
  })).filter(g => g.categories.length > 0);

  // Count courses per category
  const coursesPerCategory = (catId: string) =>
    courses.filter(c => c.course?.category_id === catId).length;

  // Analyze courses in selected category
  const analyzeCategory = useCallback(async () => {
    if (!selectedCategoryId || categoryCourses.length === 0) return;
    setAnalyzing(true);
    const analyses: Record<string, CourseAnalysis> = {};

    for (const mc of categoryCourses) {
      try {
        const { data: lessons } = await supabase
          .from("lessons")
          .select("id, type, content, title")
          .eq("course_id", mc.course_id);

        const textLessons = (lessons || []).filter(l => l.type === "text" || l.type === "practice");
        const testLessons = (lessons || []).filter(l => l.type === "test");
        const emptyLessons = textLessons.filter(l =>
          !l.content || l.content === "[]" || l.content === ""
        );

        let unansweredQuestions = 0;
        if (testLessons.length > 0) {
          const testIds = testLessons.map(l => l.id);
          const { data: questions } = await supabase
            .from("test_questions")
            .select("id, correct_answer")
            .in("lesson_id", testIds);
          unansweredQuestions = (questions || []).filter(q =>
            q.correct_answer === null || q.correct_answer === undefined
          ).length;
        }

        analyses[mc.course_id] = {
          courseId: mc.course_id,
          totalLessons: (lessons || []).length,
          emptyLessons: emptyLessons.length,
          totalTests: testLessons.length,
          unansweredQuestions,
        };
      } catch (e) {
        console.error("Analysis error for", mc.course_id, e);
      }
    }

    setCourseAnalyses(prev => ({ ...prev, ...analyses }));
    setAnalyzing(false);
  }, [selectedCategoryId, categoryCourses]);

  useEffect(() => {
    if (selectedCategoryId) {
      analyzeCategory();
    }
  }, [selectedCategoryId]);

  // Utility: strip AI meta-intro phrases
  const stripAIIntro = (text: string): string => {
    return text
      .replace(/^\s*(#{1,3}\s*)?((\*\*)?(\s)*(Отлично!?|Конечно!?|Подготовлю для вас|Вот учебный материал|Учебный материал по курсу|Учебный материал для урока|Учебный материал:|Курс:)(\*\*)?\s*.*?\n+)+/gi, "")
      .replace(/^\s*\*\*Учебный материал[^*]*\*\*\s*\n+/gi, "")
      .trim();
  };

  // Utility: generate hero image for a lesson
  const generateHeroImage = async (lessonTitle: string, contentSnippet: string): Promise<string | null> => {
    try {
      const prompt = `Educational illustration for lesson "${lessonTitle}". ${contentSnippet.slice(0, 200)}. Professional, clean, suitable for online course.`;
      const { data, error } = await safeInvoke<any>("generate-image", {
        body: { prompt, provider: "gigachat" },
      });
      if (error || !data?.url) {
        return null;
      }
      return data.url;
    } catch (e) {
      return null;
    }
  };

  // Utility: generate intro audio for a lesson paragraph via SaluteSpeech
  const generateIntroAudio = async (text: string): Promise<string | null> => {
    try {
      const truncated = text.slice(0, 500);
      const response = await safeFetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/salutespeech-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: truncated, voice: "natalya", format: "opus" }),
        }
      );
      if (!response.ok) {
        return null;
      }
      const audioBlob = await response.blob();

      // Upload to storage
      await initExternalSupabase();
      const storageClient = getExternalSupabase() || supabase;
      const fileName = `tts_${crypto.randomUUID()}.ogg`;
      const { error: uploadError } = await storageClient.storage
        .from("course-files")
        .upload(fileName, audioBlob, { contentType: "audio/ogg", cacheControl: "3600", upsert: true });
      if (uploadError) {
        return null;
      }
      const { data: urlData } = storageClient.storage.from("course-files").getPublicUrl(fileName);
      return urlData?.publicUrl || null;
    } catch (e) {
      return null;
    }
  };

  // Process a single lesson end-to-end: content → image → audio → questions → answers
  const processLesson = async (
    lesson: any,
    courseId: string,
    courseTitle: string,
    onProgress: () => void,
    streamIndex: number,
  ) => {
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    // 1. Content (for text/practice lessons)
    if ((lesson.type === "text" || lesson.type === "practice") &&
        (!lesson.content || lesson.content === "[]" || lesson.content === "")) {
      const contentStart = Date.now();
      const { data: contentData, error: contentError } = await safeInvoke<any>("gigachat", {
        body: {
          action: "generate_content",
          courseTitle,
          lessonTitle: lesson.title,
          lessonType: lesson.type,
          ai_provider: aiProvider,
          stream_index: streamIndex,
          ...(aiProvider === "gigachat" ? { gigachat_model: gigachatModel } : { lovable_model: lovableModel }),
        },
      });
      const contentDuration = Date.now() - contentStart;
      if (contentError || !contentData?.content) {
        const errMsg = contentError?.message || contentData?.error || "Пустой ответ от ИИ";
        console.error(`Content generation failed for "${lesson.title}" (stream ${streamIndex}):`, errMsg);
        await supabase.from("generation_history").insert({
          course_id: courseId, course_title: courseTitle,
          action: "content", details: `❌ Поток ${streamIndex}: ошибка «${lesson.title}» — ${errMsg}`, items_count: 0,
          stream_index: streamIndex, duration_ms: contentDuration,
        }).then(({ error: h }) => { if (h) { /* history insert failed silently */ } });
      }
      if (!contentError && contentData?.content) {
        // Clean AI intro and convert to blocks
        const cleanedContent = stripAIIntro(contentData.content);
        let blocks: ContentBlock[] = markdownToBlocks(cleanedContent);

        // 1b. Generate hero image (optional, non-blocking failure)
        const heroImageUrl = await generateHeroImage(lesson.title, cleanedContent);
        if (heroImageUrl) {
          blocks.unshift({
            id: crypto.randomUUID(),
            type: "image",
            content: "",
            imageSrc: heroImageUrl,
          } as ContentBlock);
        }

        // 1c. Generate intro audio from first paragraph (optional)
        const firstPara = blocks.find(b => b.type === "paragraph" && b.content && b.content.trim().length > 50);
        if (firstPara) {
          const audioUrl = await generateIntroAudio(firstPara.content);
          if (audioUrl) {
            const insertIdx = heroImageUrl ? 1 : 0;
            blocks.splice(insertIdx, 0, {
              id: crypto.randomUUID(),
              type: "audio",
              content: firstPara.content.slice(0, 200),
              audioUrl,
            } as ContentBlock);
          }
        }

        const jsonContent = blocksToJson(blocks);
        await supabase.from("lessons").update({ content: jsonContent }).eq("id", lesson.id);
        const { error: histErr } = await supabase.from("generation_history").insert({
          course_id: courseId, course_title: courseTitle,
          action: "content", details: `Поток ${streamIndex}: контент «${lesson.title}»${heroImageUrl ? ' + изображение' : ''}${firstPara ? ' + аудио' : ''}`, items_count: 1,
          stream_index: streamIndex, duration_ms: contentDuration,
        });
        if (histErr) { /* history insert failed silently */ }
      }
      await delay(500);
    }

    // 2. Questions (for test lessons)
    if (lesson.type === "test") {
      const { data: existingQ } = await supabase
        .from("test_questions").select("id").eq("lesson_id", lesson.id);

      if (!existingQ || existingQ.length === 0) {
        const qStart = Date.now();
        const { data: qData, error: qError } = await safeInvoke<any>("gigachat", {
          body: {
            action: "generate_questions",
            courseTitle,
            lessonTitle: lesson.title,
            questionsCount: 10,
            ai_provider: aiProvider,
            stream_index: streamIndex,
            ...(aiProvider === "gigachat" ? { gigachat_model: gigachatModel } : { lovable_model: lovableModel }),
          },
        });
        if (qError || !qData?.questions) {
          const errMsg = qError?.message || qData?.error || "Пустой ответ";
          console.error(`Questions generation failed for "${lesson.title}" (stream ${streamIndex}):`, errMsg);
          await supabase.from("generation_history").insert({
            course_id: courseId, course_title: courseTitle,
            action: "questions", details: `❌ Поток ${streamIndex}: ошибка вопросов «${lesson.title}» — ${errMsg}`, items_count: 0,
            stream_index: streamIndex, duration_ms: Date.now() - qStart,
           }).then(({ error: h }) => { if (h) { /* history insert failed silently */ } });
        }
        if (!qError && qData?.questions) {
          for (const q of qData.questions) {
            await supabase.from("test_questions").insert({
              lesson_id: lesson.id,
              question: q.question,
              options: q.options,
              correct_answer: q.correctAnswer ?? q.correct_answer ?? null,
            });
          }
          const qDuration = Date.now() - qStart;
          const { error: histErr } = await supabase.from("generation_history").insert({
            course_id: courseId, course_title: courseTitle,
            action: "questions", details: `Поток ${streamIndex}: вопросы «${lesson.title}»`, items_count: qData.questions.length,
            stream_index: streamIndex, duration_ms: qDuration,
          });
          if (histErr) { /* history insert failed silently */ }
        }
        await delay(500);
      }

      // 3. Answers for unanswered questions
      const { data: allQ } = await supabase
        .from("test_questions")
        .select("id, question, options, correct_answer")
        .eq("lesson_id", lesson.id);

      const unanswered = (allQ || []).filter(q => q.correct_answer === null || q.correct_answer === undefined);
      if (unanswered.length > 0) {
        const ansStart = Date.now();
        const { data: ansData, error: ansError } = await safeInvoke<any>("gigachat", {
          body: {
            action: "generate_answers",
            courseTitle,
            lessonTitle: lesson.title,
            questions: unanswered.map(q => ({ id: q.id, question: q.question, options: q.options })),
            ai_provider: aiProvider,
            stream_index: streamIndex,
            ...(aiProvider === "gigachat" ? { gigachat_model: gigachatModel } : { lovable_model: lovableModel }),
          },
        });
        if (ansError || !ansData?.answers) {
          const errMsg = ansError?.message || ansData?.error || "Пустой ответ";
          console.error(`Answers generation failed for "${lesson.title}" (stream ${streamIndex}):`, errMsg);
          await supabase.from("generation_history").insert({
            course_id: courseId, course_title: courseTitle,
            action: "answers", details: `❌ Поток ${streamIndex}: ошибка ответов «${lesson.title}» — ${errMsg}`, items_count: 0,
            stream_index: streamIndex, duration_ms: Date.now() - ansStart,
           }).then(({ error: h }) => { if (h) { /* history insert failed silently */ } });
        }
        if (!ansError && ansData?.answers) {
          let solved = 0;
          for (const ans of ansData.answers) {
            if (ans.correct_answer !== null && ans.correct_answer !== undefined) {
              await supabase.from("test_questions").update({ correct_answer: ans.correct_answer }).eq("id", ans.id);
              solved++;
            }
          }
          if (solved > 0) {
            const ansDuration = Date.now() - ansStart;
            const { error: histErr } = await supabase.from("generation_history").insert({
              course_id: courseId, course_title: courseTitle,
              action: "answers", details: `Поток ${streamIndex}: решено ${solved} вопросов (${lesson.title})`, items_count: solved,
              stream_index: streamIndex, duration_ms: ansDuration,
            });
            if (histErr) { /* history insert failed silently */ }
          }
        }
        await delay(500);
      }
    }

    onProgress();
  };

  // Process a stream of lessons sequentially
  const processStream = async (
    lessons: any[],
    courseId: string,
    courseTitle: string,
    onProgress: () => void,
    streamIndex: number,
  ) => {
    for (const lesson of lessons) {
      await processLesson(lesson, courseId, courseTitle, onProgress, streamIndex);
    }
  };

  // Generate content for a single course using parallel streams
  const handleGenerateCourse = async (courseId: string, courseTitle: string) => {
    if (generatingCourseId) return;
    setGeneratingCourseId(courseId);
    setGeneratingProgress(0);

    try {
      // 1. Check existing lessons
      const { data: existingLessons } = await supabase
        .from("lessons")
        .select("id, type, content, title, order_index")
        .eq("course_id", courseId)
        .order("order_index");

      let allLessons = existingLessons || [];

      // Step 1: Generate structure if no lessons
      if (allLessons.length === 0) {
        setGeneratingPhase("structure");
        setGeneratingProgress(10);

        const { data: structData, error: structError } = await safeInvoke<any>("gigachat", {
          body: {
            action: "generate_structure",
            courseTitle,
            ai_provider: aiProvider,
            ...(aiProvider === "gigachat" ? { gigachat_model: gigachatModel } : { lovable_model: lovableModel }),
          },
        });
        if (structError) throw structError;

        // Deduplicate: re-check DB for lessons that may have been created concurrently
        const { data: checkAgain } = await supabase
          .from("lessons").select("id, title").eq("course_id", courseId);
        const existingTitles = new Set((checkAgain || []).map(l => l.title.trim().toLowerCase()));

        const lessons: { title: string; type: string }[] = (structData?.lessons || [])
          .filter((l: any) => !existingTitles.has(l.title.trim().toLowerCase()));

        const startIndex = (checkAgain || []).length;
        for (let i = 0; i < lessons.length; i++) {
          await supabase.from("lessons").insert({
            course_id: courseId,
            title: lessons[i].title,
            type: lessons[i].type || "text",
            order_index: startIndex + i,
          });
        }

        if (lessons.length > 0) {
          const { error: histErr } = await supabase.from("generation_history").insert({
            course_id: courseId, course_title: courseTitle,
            action: "structure", details: `Создано ${lessons.length} уроков`, items_count: lessons.length,
            stream_index: 0, duration_ms: null,
          });
          if (histErr) console.warn("⚠️ History insert error (structure):", histErr, { courseId, courseTitle });
        }

        const { data: freshLessons } = await supabase
          .from("lessons")
          .select("id, type, content, title, order_index")
          .eq("course_id", courseId)
          .order("order_index");

        if (!freshLessons) throw new Error("Failed to fetch lessons after structure generation");
        allLessons = freshLessons;
      }

      // Step 2: Split into N parallel streams and process
      setGeneratingPhase("streaming");
      setGeneratingProgress(15);

      const STREAMS = 3;
      let completedCount = 0;
      const totalLessons = allLessons.length;

      const onProgress = () => {
        completedCount++;
        setGeneratingProgress(15 + Math.round((completedCount / totalLessons) * 80));
      };

      // Split lessons into STREAMS groups
      const groups: any[][] = Array.from({ length: STREAMS }, () => []);
      allLessons.forEach((lesson, i) => {
        groups[i % STREAMS].push(lesson);
      });

      // Run all streams in parallel
      await Promise.all(
        groups
          .filter(g => g.length > 0)
          .map((group, idx) => processStream(group, courseId, courseTitle, onProgress, idx + 1))
      );

      // Step 3: Enrichment — analyze content and add images/sliders
      setGeneratingPhase("enriching");
      setGeneratingProgress(90);

      const textLessons = allLessons.filter(l => l.type === "text" || l.type === "practice");
      if (textLessons.length > 0) {
        let enrichedCount = 0;
        const enrichGroups: any[][] = Array.from({ length: STREAMS }, () => []);
        textLessons.forEach((lesson, i) => { enrichGroups[i % STREAMS].push(lesson); });

        const enrichLesson = async (lesson: any, streamIdx: number) => {
          const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
          try {
            // Re-fetch lesson content (it was just generated)
            const { data: freshLesson } = await supabase
              .from("lessons").select("content").eq("id", lesson.id).single();
            if (!freshLesson?.content || freshLesson.content === "[]") return;

            let blocks: ContentBlock[];
            try { blocks = JSON.parse(freshLesson.content); } catch { return; }
            if (blocks.length < 3) return; // too short to enrich

            // Extract text for analysis
            const textContent = blocks
              .filter((b: any) => b.type === "paragraph" || b.type === "heading")
              .map((b: any) => b.content || "")
              .join("\n").slice(0, 4000);

            if (textContent.length < 100) return;

            // 1. Analyze visuals
            const { data: analysisData, error: analysisErr } = await safeInvoke<any>("gigachat", {
              body: {
                action: "analyze_visuals",
                courseTitle,
                lessonTitle: lesson.title,
                lessonContent: textContent,
                blocksCount: blocks.length,
                ai_provider: aiProvider,
                stream_index: streamIdx,
                ...(aiProvider === "gigachat" ? { gigachat_model: gigachatModel } : { lovable_model: lovableModel }),
              },
            });

            if (analysisErr || !analysisData?.visuals || analysisData.visuals.length === 0) {
              console.warn(`[Enrichment] Skip "${lesson.title}": err=${analysisErr?.message || "none"}, visuals=${JSON.stringify(analysisData?.visuals || null)}, raw=${analysisData?.raw?.slice(0, 200) || "none"}, parseError=${analysisData?.parseError}`);
              return;
            }

            const visuals = analysisData.visuals as Array<{
              prompt: string;
              after_block_index: number;
              format: "image" | "slider";
              slides?: string[];
            }>;

            // 2. Generate images for each visual (sort by index descending to insert without shifting)
            const sortedVisuals = [...visuals]
              .filter(v => v.format === "image") // handle images first
              .sort((a, b) => b.after_block_index - a.after_block_index);

            // Parallel image generation for speed, with slotIndex for round-robin
            const imageResults = await Promise.allSettled(
              sortedVisuals.map((visual, vIdx) =>
                safeInvoke<any>("generate-image", {
                  body: { prompt: visual.prompt, provider: "gigachat", slotIndex: streamIdx * 10 + vIdx },
                }).then(res => ({ ...res, visual }))
              )
            );

            let insertedCount = 0;
            for (const result of imageResults) {
              if (result.status !== "fulfilled") continue;
              const { data: imgData, error: imgErr, visual } = result.value;
              if (imgErr || !imgData?.url) continue;
              const insertIdx = Math.min(visual.after_block_index + 1, blocks.length);
              blocks.splice(insertIdx, 0, {
                id: crypto.randomUUID(),
                type: "image",
                content: visual.prompt,
                imageSrc: imgData.url,
              } as ContentBlock);
              insertedCount++;
            }

            // 3. Handle slider visuals — create separate slider lessons
            const sliderVisuals = visuals.filter(v => v.format === "slider" && v.slides && v.slides.length >= 2);
            for (const sv of sliderVisuals) {
              try {
                const slideTitles = (sv.slides || []).slice(0, 5);
                const slideResults = await Promise.allSettled(
                  slideTitles.map(slideTitle => {
                    const slidePrompt = `${sv.prompt}: ${slideTitle}. Образовательная инфографика, чистый стиль.`;
                    return safeInvoke<any>("generate-image", {
                      body: { prompt: slidePrompt, provider: "gigachat" },
                    }).then(res => ({ ...res, slideTitle }));
                  })
                );
                const slides = slideResults
                  .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
                  .map(r => ({
                    id: crypto.randomUUID(),
                    title: r.value.slideTitle,
                    content: "",
                    imageUrl: r.value.data?.url || "",
                  }));

                if (slides.length > 0) {
                  // Insert slider as a new block in the lesson content
                  const sliderBlock = {
                    id: crypto.randomUUID(),
                    type: "slider",
                    content: JSON.stringify({ slides }),
                  } as ContentBlock;

                  const insertIdx = Math.min(sv.after_block_index + 1 + insertedCount, blocks.length);
                  blocks.splice(insertIdx, 0, sliderBlock);
                  insertedCount++;
                }
              } catch (e) {
              }
            }

            // 4. Save updated content
            if (insertedCount > 0) {
              const jsonContent = blocksToJson(blocks);
              await supabase.from("lessons").update({ content: jsonContent }).eq("id", lesson.id);
              enrichedCount++;

              await supabase.from("generation_history").insert({
                course_id: courseId, course_title: courseTitle,
                action: "enrichment",
                details: `Поток ${streamIdx}: обогащение «${lesson.title}» — ${insertedCount} визуализаций`,
                items_count: insertedCount,
                stream_index: streamIdx,
              }).then(({ error: h }) => h && console.warn("History insert error:", h));
            }
          } catch (e) {
          }
        };

        await Promise.all(
          enrichGroups
            .filter(g => g.length > 0)
            .map((group, idx) =>
              (async () => {
                for (const lesson of group) {
                  await enrichLesson(lesson, idx + 1);
                }
              })()
            )
        );

        if (enrichedCount > 0) {
        }
      }

      setGeneratingProgress(98);

      // Mark as validated
      const mpCourse = courses.find(c => c.course_id === courseId);
      if (mpCourse) {
        await supabase.from("marketplace_courses").update({ is_validated: true } as any).eq("id", mpCourse.id);
      }

      setGeneratingProgress(100);
      setGeneratingPhase("idle");
      toast.success(`Курс «${courseTitle}» сгенерирован и обогащён медиа!`);
      onComplete();
      analyzeCategory();
    } catch (e: any) {
      console.error("Generation error:", e);
      toast.error(`Ошибка генерации: ${e.message || "неизвестная ошибка"}`);
      setGeneratingPhase("idle");
    } finally {
      setGeneratingCourseId(null);
      setGeneratingProgress(0);
    }
  };

  // Create new course in category
  const handleCreateCourse = async () => {
    if (!newCourseName.trim() || !selectedCategoryId) return;
    setCreatingCourse(true);
    try {
      // Get or create platform org
      const { data: existingOrg } = await supabase
        .from("organizations")
        .select("id")
        .eq("name", "Платформа Синтагма")
        .maybeSingle();

      const orgId = existingOrg?.id;
      if (!orgId) throw new Error("Organization not found");

      const { data: courseData, error: courseError } = await supabase
        .from("courses")
        .insert({
          title: newCourseName.trim(),
          organization_id: orgId,
          category_id: selectedCategoryId,
          is_published: true,
        })
        .select("id")
        .single();
      if (courseError) throw courseError;

      await supabase.from("marketplace_courses").insert({
        course_id: courseData.id,
        organization_id: orgId,
        price_student: 0,
        price_organization: 0,
        is_active: true,
      });

      toast.success("Курс создан!");
      setNewCourseName("");
      onComplete();
    } catch (e: any) {
      toast.error(`Ошибка: ${e.message}`);
    } finally {
      setCreatingCourse(false);
    }
  };

  // Generate all empty courses in category
  const handleGenerateAll = async () => {
    const emptyOrPartial = categoryCourses.filter(mc => {
      const a = courseAnalyses[mc.course_id];
      if (!a) return true;
      return a.totalLessons === 0 || a.emptyLessons > 0 || a.unansweredQuestions > 0;
    });

    if (emptyOrPartial.length === 0) {
      toast.info("Все курсы в категории уже заполнены");
      return;
    }

    for (const mc of emptyOrPartial) {
      await handleGenerateCourse(mc.course_id, mc.course?.title || "");
    }
  };

  // ── Category Overview ──
  if (!selectedCategoryId) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Генератор контента
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Выберите категорию для просмотра и генерации курсов
            </p>
          </CardHeader>
        </Card>

        {categoryGroups.map(group => (
          <Collapsible key={group.type} defaultOpen>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform" />
                      {group.type}
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {group.categories.length} категорий
                    </Badge>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {group.categories.map(cat => {
                      const count = coursesPerCategory(cat.id);
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedCategoryId(cat.id)}
                          className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 hover:border-primary/30 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-sm truncate">{cat.name}</span>
                          </div>
                          <Badge variant={count > 0 ? "default" : "outline"} className="text-xs shrink-0 ml-2">
                            {count}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>
    );
  }

  // ── Category Detail View ──
  const totalEmpty = categoryCourses.reduce((sum, mc) => {
    const a = courseAnalyses[mc.course_id];
    return sum + (a ? (a.totalLessons === 0 ? 1 : 0) + a.emptyLessons : 0);
  }, 0);

  const totalUnanswered = categoryCourses.reduce((sum, mc) => {
    const a = courseAnalyses[mc.course_id];
    return sum + (a?.unansweredQuestions || 0);
  }, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedCategoryId(null)}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <CardTitle className="text-base">{selectedCategory?.name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {categoryCourses.length} курсов
                  {!analyzing && totalEmpty > 0 && <span className="text-amber-600"> • {totalEmpty} без контента</span>}
                  {!analyzing && totalUnanswered > 0 && <span className="text-amber-600"> • {totalUnanswered} нерешённых вопросов</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={analyzeCategory}
                disabled={analyzing}
              >
                {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Обновить
              </Button>
              <Button
                size="sm"
                onClick={handleGenerateAll}
                disabled={!!generatingCourseId || analyzing || categoryCourses.length === 0}
                className="gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Сгенерировать все
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Generation progress */}
      {generatingCourseId && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {PHASE_LABELS[generatingPhase]}
              </span>
              <span className="font-medium">{generatingProgress}%</span>
            </div>
            <Progress value={generatingProgress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Courses table */}
      <Card>
        <CardContent className="p-0">
          {analyzing ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Анализ курсов...
            </div>
          ) : categoryCourses.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Нет курсов в этой категории
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Курс</TableHead>
                  <TableHead className="w-[80px] text-center">Уроки</TableHead>
                  <TableHead className="w-[80px] text-center">Пустые</TableHead>
                  <TableHead className="w-[80px] text-center">Тесты</TableHead>
                  <TableHead className="w-[100px] text-center">Нерешённые</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryCourses.map(mc => {
                  const a = courseAnalyses[mc.course_id];
                  const isGenerating = generatingCourseId === mc.course_id;
                  const needsWork = a && (a.totalLessons === 0 || a.emptyLessons > 0 || a.unansweredQuestions > 0);
                  const isReady = a && !needsWork;

                  return (
                    <TableRow key={mc.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {isReady && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                          {needsWork && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                          <span className="text-sm truncate max-w-[300px]">{mc.course?.title || ""}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {a ? a.totalLessons : "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {a ? (
                          a.emptyLessons > 0 ? (
                            <span className="text-amber-600 font-medium">{a.emptyLessons}</span>
                          ) : (
                            <span className="text-green-600">0</span>
                          )
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {a ? a.totalTests : "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {a ? (
                          a.unansweredQuestions > 0 ? (
                            <span className="text-amber-600 font-medium">{a.unansweredQuestions}</span>
                          ) : (
                            <span className="text-green-600">0</span>
                          )
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={needsWork ? "default" : "outline"}
                          onClick={() => handleGenerateCourse(mc.course_id, mc.course?.title || "")}
                          disabled={!!generatingCourseId}
                          className="gap-1 h-7 text-xs"
                        >
                          {isGenerating ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                          {a?.totalLessons === 0 ? "Создать" : "Заполнить"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create new course */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Название нового курса..."
              value={newCourseName}
              onChange={e => setNewCourseName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreateCourse()}
              className="h-9"
            />
            <Button
              size="sm"
              onClick={handleCreateCourse}
              disabled={!newCourseName.trim() || creatingCourse}
              className="gap-1 shrink-0"
            >
              {creatingCourse ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Создать
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
