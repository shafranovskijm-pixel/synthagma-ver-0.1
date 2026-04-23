import { ContentBlock, htmlToBlocks, blocksToJson, jsonToBlocks, markdownToBlocks } from "@/components/course-builder/BlockEditor";
import { isHtmlContent, parseHtmlCourse } from "@/utils/htmlCourseParser";
import { safeInvoke, safeFetch } from "@/utils/safeInvoke";
import { uploadToStorage } from "@/utils/courseBuilderHelpers";
import { toast } from "sonner";
import type { LessonType, TestQuestionLocal, Lesson, LessonAttachmentLocal } from "@/components/course-builder/LessonTypeConfig";
import type { AIGenerateType } from "@/components/course-builder/AIGenerateDialog";
import { supabase } from "@/integrations/supabase/client";

// --- Local draft helpers ---
const DRAFT_PREFIX = 'course_draft_';

export function saveDraftToLocal(courseId: string | undefined, title: string, description: string, lessons: Lesson[]) {
  try {
    const key = `${DRAFT_PREFIX}${courseId || 'new'}`;
    localStorage.setItem(key, JSON.stringify({ title, description, lessons, savedAt: Date.now() }));
  } catch {}
}

export function loadDraftFromLocal(courseId: string | undefined): { title: string; description: string; lessons: Lesson[]; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${courseId || 'new'}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function clearDraftFromLocal(courseId: string | undefined) {
  try { localStorage.removeItem(`${DRAFT_PREFIX}${courseId || 'new'}`); } catch {}
}

// --- Lesson data normalization ---
export function normalizeLessonsFromDB(
  lessonsData: any[],
  questionsMap: Record<string, TestQuestionLocal[]>,
  attachmentsMap: Record<string, LessonAttachmentLocal[]>
): Lesson[] {
  return lessonsData.map(l => {
    let blocks: ContentBlock[] = [];
    if (l.content) {
      blocks = jsonToBlocks(l.content);
      if (blocks.length === 0 && l.content.length > 50 && !l.content.trim().startsWith('[')) {
        blocks = markdownToBlocks(l.content);
        if (blocks.length > 0) {
          const json = blocksToJson(blocks);
          supabase.from("lessons").update({ content: json }).eq("id", l.id);
        }
      }
      if (blocks.length > 0) {
        let healed = false;
        blocks = blocks.flatMap((b): ContentBlock[] => {
          if (b.type !== "paragraph") return [b];
          const markerMatch = b.content.match(/^:::(info|warning|tip|danger|highlight|accordion)\s*(.*?)(?::::\s*)?$/i);
          if (markerMatch) {
            healed = true;
            const markerType = markerMatch[1].toLowerCase();
            const content = (markerMatch[2] || "").replace(/:::?\s*$/, "").trim();
            const blockType = markerType === "highlight" ? "highlight"
              : markerType === "accordion" ? "accordion" : `callout-${markerType}`;
            return [{ ...b, type: blockType as ContentBlock['type'], content }];
          }
          if (/:::(info|warning|tip|danger|highlight|accordion)/i.test(b.content)) {
            healed = true;
            const cleaned = b.content.replace(/:::(info|warning|tip|danger|highlight|accordion)\s*/gi, "").replace(/:::\s*/g, "").trim();
            if (!cleaned) return [];
            return [{ ...b, content: cleaned }];
          }
          return [b];
        });
        if (healed) {
          const json = blocksToJson(blocks);
          supabase.from("lessons").update({ content: json }).eq("id", l.id);
        }
      }
    }
    return {
      id: l.id, type: l.type as LessonType, title: l.title, content: l.content || "",
      blocks: blocks.length > 0 ? blocks : undefined, expanded: false,
      testPassingScore: (l as any).test_passing_score ?? 60,
      testQuestionsToShow: (l as any).test_questions_to_show ?? null,
      questions: l.type === 'test' ? (questionsMap[l.id] || []) : undefined,
      attachments: attachmentsMap[l.id] || [],
      module_id: (l as any).module_id ?? null,
    };
  });
}

// --- File import logic ---
export async function importFiles(
  files: File[],
  courseTitle: string,
  setCourseTitle: (t: string) => void,
  setCourseDescription: (d: string) => void,
  setLessons: React.Dispatch<React.SetStateAction<Lesson[]>>
): Promise<number> {
  const CHUNK_SIZE = 3;
  const allFiles = Array.from(files).sort((a, b) => {
    const na = a.name.match(/(\d+(?:[\.,]\d+)*)/)?.[1];
    const nb = b.name.match(/(\d+(?:[\.,]\d+)*)/)?.[1];
    if (na && nb) return na.localeCompare(nb, 'ru', { numeric: true });
    return a.name.localeCompare(b.name, 'ru', { numeric: true });
  });

  let totalImported = 0;
  const htmlFiles: File[] = [];
  const otherFiles: File[] = [];

  for (const file of allFiles) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'html' || ext === 'htm') {
      htmlFiles.push(file);
    } else {
      const head = await file.slice(0, 500).text();
      if (isHtmlContent(head)) htmlFiles.push(file);
      else otherFiles.push(file);
    }
  }

  for (const file of htmlFiles) {
    const text = await file.text();
    const parsed = parseHtmlCourse(text);
    if (!courseTitle && parsed.title) setCourseTitle(parsed.title);
    if (parsed.description) setCourseDescription(parsed.description);
    const importedLessons: Lesson[] = parsed.lessons.map(l => ({
      id: l.id, type: l.type, title: l.title, content: l.content,
      blocks: l.blocks, expanded: false, questions: l.questions, testPassingScore: l.testPassingScore,
    }));
    totalImported += importedLessons.length;
    setLessons(prev => [...prev, ...importedLessons]);
  }

  for (let offset = 0; offset < otherFiles.length; offset += CHUNK_SIZE) {
    const chunk = otherFiles.slice(offset, offset + CHUNK_SIZE);
    const formData = new FormData();
    chunk.forEach((file, i) => formData.append(`file_${offset + i}`, file));
    const { data, error } = await safeInvoke<any>("import-course", { body: formData });
    if (error) throw new Error(error.message || "Ошибка импорта");
    if (!data.success) throw new Error(data.error || 'Ошибка импорта');
    if (!courseTitle && data.courseTitle) setCourseTitle(data.courseTitle);
    const importedLessons: Lesson[] = (data.lessons || []).map((l: any) => {
      const blocks = htmlToBlocks(l.content || "");
      return { id: l.id, type: "text" as LessonType, title: l.title, content: blocksToJson(blocks), blocks, expanded: false };
    });
    totalImported += importedLessons.length;
    setLessons(prev => [...prev, ...importedLessons]);
  }

  return totalImported;
}

// --- AI generation helpers ---
export function createFallbackSlides(lesson: Lesson, prompt: string, content?: string) {
  const slides = [
    { id: crypto.randomUUID(), title: "Введение", content: content || prompt },
    { id: crypto.randomUUID(), title: "Основные понятия", content: "" },
    { id: crypto.randomUUID(), title: "Заключение", content: "" },
  ];
  lesson.blocks = [{ id: crypto.randomUUID(), type: "slider" as const, content: prompt, sliderSlides: slides, sliderCurrentIndex: 0 }];
  lesson.content = JSON.stringify(slides);
}

export async function generateAIContent(
  type: AIGenerateType, prompt: string, courseTitle: string, courseDescription: string, newLesson: Lesson
) {
  if (type === "audio") {
    toast.info("Генерация аудио... Длинные тексты могут занять до 2 минут.");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);
    const response = await safeFetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/salutespeech-tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      body: JSON.stringify({ text: prompt, voice: "Natalya_24000" }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || `Ошибка: ${response.status}`); }
    const audioBlob = await response.blob();
    const fileName = `audio-${Date.now()}.mp3`;
    try {
      const result = await uploadToStorage(audioBlob, 'course-files', fileName, 'audio/mpeg');
      if (result) { newLesson.content = result.url; toast.success("Аудиолекция сгенерирована!"); }
      else throw new Error('Upload failed');
    } catch { const blobUrl = URL.createObjectURL(audioBlob); newLesson.content = blobUrl; toast.warning("Аудио создано, но не сохранено"); }
  }

  if (type === "test") {
    toast.info("Генерация тестовых вопросов...");
    const { data, error } = await safeInvoke<any>("generate-course-content", { body: { lessonTitle: prompt, courseTitle: courseTitle || "Курс", courseDescription: courseDescription || "", contentType: "test" } });
    if (error) throw error;
    if (data?.content) newLesson.content = data.content;
    toast.success("Тест сгенерирован!");
  }

  if (type === "slides") {
    toast.info("Генерация слайдов...");
    try {
      const { data, error } = await safeInvoke<any>("generate-course-content", { body: { lessonTitle: prompt, courseTitle: courseTitle || "Курс", courseDescription: courseDescription || "", contentType: "slides" } });
      if (error) throw error;
      if (data?.content) {
        try {
          const parsedSlides = JSON.parse(data.content);
          if (Array.isArray(parsedSlides)) {
            newLesson.blocks = [{ id: crypto.randomUUID(), type: "slider" as const, content: prompt, sliderSlides: parsedSlides.map((s: any) => ({ id: s.id || crypto.randomUUID(), title: s.title || "Слайд", content: s.content || "", imageUrl: s.imageUrl || undefined })), sliderCurrentIndex: 0 }];
            newLesson.content = JSON.stringify(parsedSlides);
            toast.success("Слайды сгенерированы!");
          } else { createFallbackSlides(newLesson, prompt, data.content); }
        } catch { createFallbackSlides(newLesson, prompt); }
      } else { createFallbackSlides(newLesson, prompt); }
    } catch { createFallbackSlides(newLesson, prompt); toast.warning("Слайды созданы с базовой структурой"); }
  }

  if (type === "image") {
    toast.info("Генерация изображения...");
    try {
      const { data } = await safeInvoke<any>("generate-course-content", { body: { lessonTitle: prompt, courseTitle: courseTitle || "Курс", courseDescription: courseDescription || "", contentType: "image" } });
      if (data?.imageUrl) { newLesson.blocks = [{ id: crypto.randomUUID(), type: "image" as const, content: "", imageSrc: data.imageUrl, imageAlt: prompt }]; newLesson.content = data.imageUrl; toast.success("Изображение сгенерировано!"); }
      else toast.info("Добавьте изображение вручную");
    } catch { toast.info("Добавьте изображение вручную"); }
  }

  if (type === "video") {
    try {
      toast.info("Генерация превью...");
      const { data: imageData } = await safeInvoke<any>("generate-course-content", { body: { lessonTitle: `Video thumbnail: ${prompt}`, courseTitle: courseTitle || "Курс", courseDescription: courseDescription || "", contentType: "image" } });
      const { data: scriptData } = await safeInvoke<any>("generate-course-content", { body: { lessonTitle: prompt, courseTitle: courseTitle || "Курс", courseDescription: courseDescription || "", contentType: "video_script" } });
      newLesson.thumbnailUrl = imageData?.imageUrl || "";
      newLesson.videoScript = scriptData?.content || "";
      newLesson.content = "";
      toast.success(imageData?.imageUrl || scriptData?.content ? "Превью и сценарий созданы!" : "Добавьте ссылку на видео");
    } catch { newLesson.content = ""; toast.info("Добавьте ссылку на видео"); }
  }
}
