import { ContentBlock, htmlToBlocks, blocksToJson, jsonToBlocks, markdownToBlocks } from "@/components/course-builder/block-editor";
import { isHtmlContent, parseHtmlCourse } from "@/utils/htmlCourseParser";
import { isCszStructuredCourseHtml } from "@/utils/structuredCourseImport";
import { safeInvoke, safeFetch } from "@/utils/safeInvoke";
import { uploadToStorage } from "@/utils/courseBuilderHelpers";
import { toast } from "sonner";
import type { LessonType, TestQuestionLocal, Lesson, LessonAttachmentLocal } from "@/components/course-builder/LessonTypeConfig";
import type { AIGenerateType } from "@/components/course-builder/AIGenerateDialog";
import { supabase } from "@/integrations/supabase/client";
import type { CourseImportScope } from "@/lib/courseImportScope";

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

export interface BuilderDraftIdentity { actorId: string; organizationId: string; requestedCourseId: string | undefined }
export interface BuilderDraftReceipt { key: string; raw: string | null }
export interface ScopedBuilderDraft {
  version: 2; actorId: string; organizationId: string; requestedCourseId: string | null;
  courseId: string | null; title: string; description: string; lessons: Lesson[]; savedAt: number;
}
const scopedDraftKey = (identity: BuilderDraftIdentity) => `course_builder_draft_v2:${encodeURIComponent(JSON.stringify([identity.actorId, identity.organizationId, identity.requestedCourseId ?? null]))}`;
function validScopedDraft(value: unknown, identity: BuilderDraftIdentity): value is ScopedBuilderDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const draft = value as ScopedBuilderDraft;
  return draft.version === 2 && draft.actorId === identity.actorId && draft.organizationId === identity.organizationId
    && draft.requestedCourseId === (identity.requestedCourseId ?? null)
    && (draft.courseId === null || typeof draft.courseId === 'string')
    && (!identity.requestedCourseId || draft.courseId === identity.requestedCourseId)
    && typeof draft.title === 'string' && typeof draft.description === 'string' && Number.isFinite(draft.savedAt)
    && Array.isArray(draft.lessons) && draft.lessons.every(lesson => lesson && typeof lesson.id === 'string'
      && typeof lesson.title === 'string' && ['text', 'video', 'image', 'test', 'audio', 'lesson', 'slider', 'practice', 'feedback', 'homework', 'ai_avatar'].includes(lesson.type) && typeof lesson.content === 'string'
      && typeof lesson.expanded === 'boolean' && (lesson.__contentLoaded === undefined || typeof lesson.__contentLoaded === 'boolean')
      && (lesson.blocks === undefined || Array.isArray(lesson.blocks)));
}
export function readScopedBuilderDraft(identity: BuilderDraftIdentity): { draft: ScopedBuilderDraft | null; receipt: BuilderDraftReceipt } {
  const key = scopedDraftKey(identity), raw = localStorage.getItem(key);
  if (raw === null) return { draft: null, receipt: { key, raw } };
  const value: unknown = JSON.parse(raw);
  if (!validScopedDraft(value, identity)) throw new Error('Локальный черновик не удалось подтвердить. Данные сохранены без изменений.');
  return { draft: value, receipt: { key, raw } };
}
export function saveScopedBuilderDraft(identity: BuilderDraftIdentity, data: Pick<ScopedBuilderDraft, 'courseId' | 'title' | 'description' | 'lessons'>, receipt: BuilderDraftReceipt): BuilderDraftReceipt {
  const source = readScopedBuilderDraft(identity);
  if (receipt.key !== source.receipt.key || receipt.raw !== source.receipt.raw) throw new Error('Черновик в браузере изменился. Он не перезаписан.');
  const draft: ScopedBuilderDraft = { version: 2, ...identity, requestedCourseId: identity.requestedCourseId ?? null, ...data, savedAt: Date.now() };
  if (!validScopedDraft(draft, identity)) throw new Error('Не удалось подтвердить локальный черновик.');
  const raw = JSON.stringify(draft);
  localStorage.setItem(receipt.key, raw);
  return { key: receipt.key, raw };
}
export function clearScopedBuilderDraft(receipt: BuilderDraftReceipt): boolean {
  if (!receipt.key.startsWith('course_builder_draft_v2:')) return false;
  if (localStorage.getItem(receipt.key) !== receipt.raw) return false;
  if (receipt.raw !== null) localStorage.removeItem(receipt.key);
  return true;
}
/** Presence only: old unattributed draft contents are not parsed or exposed. */
export function hasLegacyBuilderDraft(courseId: string | undefined) {
  return localStorage.getItem(`${DRAFT_PREFIX}${courseId || 'new'}`) !== null;
}

// --- Lesson data normalization ---
export function normalizeLessonsFromDB(
  lessonsData: any[],
  questionsMap: Record<string, TestQuestionLocal[]>,
  attachmentsMap: Record<string, LessonAttachmentLocal[]>
): Lesson[] {
  return lessonsData.map(l => {
    // If content column wasn't selected (lazy mode), keep placeholder and skip parsing.
    const hasContentColumn = Object.prototype.hasOwnProperty.call(l, 'content');
    let blocks: ContentBlock[] = [];
    if (hasContentColumn && l.content) {
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
    const lessonMetadata: unknown = l.metadata;
    return {
      id: l.id, type: l.type as LessonType, title: l.title,
      content: hasContentColumn ? (l.content || "") : "",
      blocks: blocks.length > 0 ? blocks : undefined, expanded: false,
      testPassingScore: (l as any).test_passing_score ?? 60,
      testQuestionsToShow: (l as any).test_questions_to_show ?? null,
      testMaxAttempts: (l as any).test_max_attempts ?? null,
      testMaxAttemptsPerDay: (l as any).test_max_attempts_per_day ?? null,
      testShowAnswers: (l as any).test_show_answers ?? true,
      questions: l.type === 'test' ? (questionsMap[l.id] || []) : undefined,
      attachments: attachmentsMap[l.id] || [],
      module_id: (l as any).module_id ?? null,
      metadata: (lessonMetadata !== null && typeof lessonMetadata === "object")
        ? lessonMetadata as NonNullable<Lesson["metadata"]>
        : {},
      __contentLoaded: hasContentColumn,
    };
  });
}

// --- File import logic ---
export interface CourseBuilderImportContext {
  scope: CourseImportScope;
  isCurrent: () => boolean;
  verifyBeforeCommit: () => Promise<void>;
}

export async function importFiles(
  files: File[],
  courseTitle: string,
  setCourseTitle: (t: string) => void,
  setCourseDescription: (d: string) => void,
  setLessons: React.Dispatch<React.SetStateAction<Lesson[]>>,
  context: CourseBuilderImportContext,
): Promise<number> {
  const assertCurrent = () => {
    if (!context.scope.organizationId.trim() || !context.isCurrent()) {
      throw new Error("Контекст импорта изменился. Запустите импорт снова в нужной организации");
    }
  };
  assertCurrent();
  const CHUNK_SIZE = 3;
  const allFiles = Array.from(files).sort((a, b) => {
    const na = a.name.match(/(\d+(?:[\.,]\d+)*)/)?.[1];
    const nb = b.name.match(/(\d+(?:[\.,]\d+)*)/)?.[1];
    if (na && nb) return na.localeCompare(nb, 'ru', { numeric: true });
    return a.name.localeCompare(b.name, 'ru', { numeric: true });
  });

  let totalImported = 0;
  let importedTitle: string | undefined;
  let importedDescription: string | undefined;
  const pendingLessons: Lesson[] = [];
  const htmlFiles: File[] = [];
  const otherFiles: File[] = [];

  for (const file of allFiles) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'html' || ext === 'htm') {
      htmlFiles.push(file);
    } else {
      const head = await file.slice(0, 500).text();
      assertCurrent();
      if (isHtmlContent(head)) htmlFiles.push(file);
      else otherFiles.push(file);
    }
  }

  for (const file of htmlFiles) {
    const text = await file.text();
    assertCurrent();
    if (isCszStructuredCourseHtml(text)) {
      throw new Error("Пакет ЦСЗ импортируется через раздел «Импорт курса», чтобы сохранить 11 модулей, типы занятий и статус черновика");
    }
    const parsed = parseHtmlCourse(text);
    if (!courseTitle && parsed.title) importedTitle = parsed.title;
    if (parsed.description) importedDescription = parsed.description;
    const importedLessons: Lesson[] = parsed.lessons.map(l => ({
      id: l.id, type: l.type, title: l.title, content: l.content,
      blocks: l.blocks, expanded: false, questions: l.questions, testPassingScore: l.testPassingScore,
    }));
    totalImported += importedLessons.length;
    pendingLessons.push(...importedLessons);
  }

  for (let offset = 0; offset < otherFiles.length; offset += CHUNK_SIZE) {
    assertCurrent();
    const chunk = otherFiles.slice(offset, offset + CHUNK_SIZE);
    const formData = new FormData();
    formData.append("organization_id", context.scope.organizationId);
    chunk.forEach((file, i) => formData.append(`file_${offset + i}`, file));
    const { data, error } = await safeInvoke<any>("import-course", { body: formData });
    assertCurrent();
    if (error) throw new Error(error.message || "Ошибка импорта");
    if (!data.success) throw new Error(data.error || 'Ошибка импорта');
    if (!courseTitle && data.courseTitle) importedTitle = data.courseTitle;
    const importedLessons: Lesson[] = (data.lessons || []).map((l: any) => {
      const blocks = htmlToBlocks(l.content || "");
      return { id: l.id, type: "text" as LessonType, title: l.title, content: blocksToJson(blocks), blocks, expanded: false };
    });
    totalImported += importedLessons.length;
    pendingLessons.push(...importedLessons);
  }

  // Keep every chunk private until the actor and server-backed tenant are
  // confirmed again. A late response must not append into another editor.
  await context.verifyBeforeCommit();
  assertCurrent();
  if (importedTitle) setCourseTitle(importedTitle);
  if (importedDescription) setCourseDescription(importedDescription);
  if (pendingLessons.length) setLessons(prev => context.isCurrent() ? [...prev, ...pendingLessons] : prev);
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
