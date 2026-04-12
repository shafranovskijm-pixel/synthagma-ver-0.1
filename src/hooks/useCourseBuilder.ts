import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAiGenerationLimit, setAiLimitContext } from "@/hooks/useAiGenerationLimit";
import { toast } from "sonner";
import { safeInvoke, safeFetch } from "@/utils/safeInvoke";
import { ContentBlock, htmlToBlocks, blocksToJson, jsonToBlocks, markdownToBlocks } from "@/components/course-builder/BlockEditor";
import {
  closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { getExternalStorageConfig, uploadToStorage } from "@/utils/courseBuilderHelpers";
import { isHtmlContent, parseHtmlCourse } from "@/utils/htmlCourseParser";
import {
  type LessonType, type TestQuestionLocal, type Lesson, type GeneratedQuestion, type LessonAttachmentLocal,
} from "@/components/course-builder/LessonTypeConfig";
import { AIGenerateType } from "@/components/course-builder/AIGenerateDialog";

// --- Local draft helpers ---
const DRAFT_PREFIX = 'course_draft_';

function saveDraftToLocal(courseId: string | undefined, title: string, description: string, lessons: Lesson[]) {
  try {
    const key = `${DRAFT_PREFIX}${courseId || 'new'}`;
    const draft = { title, description, lessons, savedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(draft));
  } catch { /* quota exceeded — ignore */ }
}

function loadDraftFromLocal(courseId: string | undefined): { title: string; description: string; lessons: Lesson[]; savedAt: number } | null {
  try {
    const key = `${DRAFT_PREFIX}${courseId || 'new'}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function clearDraftFromLocal(courseId: string | undefined) {
  try { localStorage.removeItem(`${DRAFT_PREFIX}${courseId || 'new'}`); } catch {}
}

export function useCourseBuilder() {
  const navigate = useNavigate();
  const { courseId: paramCourseId } = useParams();
  const { user, userRole } = useAuth();
  const [courseTitle, setCourseTitle] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!paramCourseId);
  const [isImporting, setIsImporting] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [savedCourseIdState, setSavedCourseIdState] = useState<string | null>(null);
  const courseId = savedCourseIdState || paramCourseId;
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showAIGenerateDialog, setShowAIGenerateDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<string>('free');
  const aiLimit = useAiGenerationLimit(organizationId, subscriptionPlan);

  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markAsChanged = useCallback(() => { setHasUnsavedChanges(true); }, []);

  const updateLessons = useCallback((updater: Lesson[] | ((prev: Lesson[]) => Lesson[])) => {
    setLessons(updater);
    markAsChanged();
  }, [markAsChanged]);

  const getBackPath = () => {
    // Admin users go back to /admin
    if (userRole === 'admin') {
      return "/admin";
    }
    return "/organization";
  };

  const handleBackClick = () => {
    if (hasUnsavedChanges) setShowExitDialog(true);
    else navigate(getBackPath());
  };

  const handleSaveAndExit = async () => { await saveCourse(); setShowExitDialog(false); navigate(getBackPath()); };
  const handleExitWithoutSave = () => { setShowExitDialog(false); navigate(getBackPath()); };

  // Import files
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const CHUNK_SIZE = 3;
    const allFiles = Array.from(fileList).sort((a, b) => {
      const na = a.name.match(/(\d+(?:[\.,]\d+)*)/)?.[1];
      const nb = b.name.match(/(\d+(?:[\.,]\d+)*)/)?.[1];
      if (na && nb) return na.localeCompare(nb, 'ru', { numeric: true });
      return a.name.localeCompare(b.name, 'ru', { numeric: true });
    });
    setIsImporting(true);
    try {
      let totalImported = 0;

      // Check if any files are HTML — parse client-side
      const htmlFiles: File[] = [];
      const otherFiles: File[] = [];
      for (const file of allFiles) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'html' || ext === 'htm') {
          htmlFiles.push(file);
        } else {
          // Read first bytes to detect HTML in .txt files
          const head = await file.slice(0, 500).text();
          if (isHtmlContent(head)) {
            htmlFiles.push(file);
          } else {
            otherFiles.push(file);
          }
        }
      }

      // Parse HTML files client-side
      for (const file of htmlFiles) {
        const text = await file.text();
        const parsed = parseHtmlCourse(text);
        if (!courseTitle && parsed.title) setCourseTitle(parsed.title);
        if (!courseDescription && parsed.description) setCourseDescription(parsed.description);
        const importedLessons: Lesson[] = parsed.lessons.map((l) => ({
          id: l.id,
          type: l.type,
          title: l.title,
          content: l.content,
          blocks: l.blocks,
          expanded: false,
          questions: l.questions,
          testPassingScore: l.testPassingScore,
        }));
        totalImported += importedLessons.length;
        setLessons(prev => [...prev, ...importedLessons]);
      }

      // Process other files via edge function
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

      if (totalImported > 0) {
        toast.success(`Импортировано ${totalImported} ${totalImported === 1 ? 'урок' : totalImported < 5 ? 'урока' : 'уроков'}`);
        markAsChanged();
        // Autosave after import
        setTimeout(() => { saveCourse(true); }, 500);
      } else {
        toast.warning("Не удалось извлечь уроки из файла");
      }
    } catch (error: any) { console.error('Import error:', error); toast.error(error.message || 'Ошибка импорта файлов'); }
    finally { setIsImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  // Load data
  useEffect(() => {
    const fetchData = async () => {
      if (!user || isDataLoaded) return;
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (profile?.organization_id) {
        setOrganizationId(profile.organization_id);
        // Fetch subscription plan
        const { data: org } = await supabase.from("organizations").select("subscription_plan").eq("id", profile.organization_id).single();
        if (org?.subscription_plan) {
          setSubscriptionPlan(org.subscription_plan);
          setAiLimitContext(profile.organization_id, org.subscription_plan);
        } else {
          setAiLimitContext(profile.organization_id, 'free');
        }
      }

      if (courseId) {
        const { data: course } = await supabase.from("courses").select("*").eq("id", courseId).single();
        if (course) {
          setCourseTitle(course.title);
          setCourseDescription(course.description || "");
          if (!profile?.organization_id && course.organization_id) setOrganizationId(course.organization_id);
        }
        const { data: lessonsData } = await supabase.from("lessons").select("*").eq("course_id", courseId).order("order_index");
        if (lessonsData) {
          const testLessonIds = lessonsData.filter(l => l.type === 'test').map(l => l.id);
          let questionsMap: Record<string, TestQuestionLocal[]> = {};
          if (testLessonIds.length > 0) {
            const { data: questionsData } = await supabase.from("test_questions").select("*").in("lesson_id", testLessonIds).order("order_index");
            if (questionsData) {
              for (const q of questionsData) {
                if (!questionsMap[q.lesson_id]) questionsMap[q.lesson_id] = [];
                // Normalize options: may be {text}[], string[], or JSON string
                let rawOpts = q.options as unknown;
                if (typeof rawOpts === 'string') {
                  try { rawOpts = JSON.parse(rawOpts); } catch { rawOpts = []; }
                }
                const normalizedOptions = Array.isArray(rawOpts)
                  ? (rawOpts as any[]).map(o => typeof o === 'string' ? { text: o } : o)
                  : [];
                questionsMap[q.lesson_id].push({
                  id: q.id, question: q.question, options: normalizedOptions,
                  correct_answer: q.correct_answer, order_index: q.order_index,
                  explanation: (q as any).explanation || '', image_url: q.image_url || null, isNew: false, isDeleted: false,
                });
              }
            }
          }

          // Load attachments for all lessons
          const allLessonIds = lessonsData.map(l => l.id);
          let attachmentsMap: Record<string, LessonAttachmentLocal[]> = {};
          if (allLessonIds.length > 0) {
            const { data: attachmentsData } = await supabase.from("lesson_attachments").select("*").in("lesson_id", allLessonIds).order("order_index");
            if (attachmentsData) {
              for (const a of attachmentsData) {
                if (!attachmentsMap[a.lesson_id]) attachmentsMap[a.lesson_id] = [];
                attachmentsMap[a.lesson_id].push({
                  id: a.id, lesson_id: a.lesson_id, name: a.name, file_url: a.file_url,
                  file_type: a.file_type, file_size: a.file_size ? Number(a.file_size) : null,
                  category: a.category, order_index: a.order_index, isNew: false, isDeleted: false,
                });
              }
            }
          }

          setLessons(lessonsData.map(l => {
            let blocks: ContentBlock[] = [];
            if (l.content) {
              blocks = jsonToBlocks(l.content);
              // Auto-convert Markdown → JSON blocks on the fly
              if (blocks.length === 0 && l.content.length > 50 && !l.content.trim().startsWith('[')) {
                blocks = markdownToBlocks(l.content);
                if (blocks.length > 0) {
                  const json = blocksToJson(blocks);
                  supabase.from("lessons").update({ content: json }).eq("id", l.id);
                }
              }
              // Self-healing: detect raw :::markers inside paragraph blocks and convert them
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
                      : markerType === "accordion" ? "accordion"
                      : `callout-${markerType}`;
                    return [{ ...b, type: blockType as ContentBlock['type'], content }];
                  }
                  // Check if paragraph contains embedded ::: markers mid-text
                  if (/:::(info|warning|tip|danger|highlight|accordion)/i.test(b.content)) {
                    healed = true;
                    // Strip raw markers from the text
                    const cleaned = b.content
                      .replace(/:::(info|warning|tip|danger|highlight|accordion)\s*/gi, "")
                      .replace(/:::\s*/g, "").trim();
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
            };
          }));
        }
        setIsLoading(false);
      } else { setIsLoading(false); }
      setIsDataLoaded(true);
    };
    fetchData();
  }, [user, courseId, isDataLoaded]);

  const addLesson = (type: LessonType) => {
    const typeNames: Record<LessonType, string> = { text: "урок", video: "видеоурок", image: "материал", test: "тест", audio: "аудиолекция", lesson: "урок", slider: "презентация", practice: "ситуационное задание", feedback: "обратная связь", homework: "задание" };
    const newLesson: Lesson = { id: crypto.randomUUID(), type, title: `Новый ${typeNames[type]}`, content: "", expanded: true, blocks: (type === "text" || type === "practice") ? [] : undefined };
    setLessons(prev => [...prev, newLesson]);
    markAsChanged();
  };

  const handleGenerateStructure = async () => {
    if (!courseTitle.trim()) { toast.error("Введите название курса"); return; }
    if (!(await aiLimit.checkAndNotify())) return;
    setIsGenerating(true);
    try {
      await aiLimit.increment();
      const { data, error } = await safeInvoke<any>("generate-course-structure", { body: { title: courseTitle, description: courseDescription } });
      if (error) throw new Error(error.message || "Ошибка генерации");
      if (!data.success) throw new Error(data.error || "Ошибка генерации структуры");
      const generatedLessons: Lesson[] = (data.lessons || []).map((l: any) => ({
        id: crypto.randomUUID(), type: l.type as LessonType, title: l.title,
        content: l.type === "text" || l.type === "test" ? (l.description || "") : "",
        expanded: false, blocks: l.type === "text" ? [] : undefined,
      }));
      if (generatedLessons.length > 0) {
        setLessons(prev => [...prev, ...generatedLessons]);
        toast.success(`Добавлено ${generatedLessons.length} уроков`);
        markAsChanged();
        // Autosave after structure generation
        setTimeout(() => { saveCourse(true); }, 500);
      }
      else toast.error("AI не вернул уроки");
    } catch (error: any) { console.error("Generate error:", error); toast.error(error.message || "Ошибка генерации"); }
    finally { setIsGenerating(false); }
  };

  const handleAIGenerate = async (type: AIGenerateType, prompt: string) => {
    if (!(await aiLimit.checkAndNotify())) return;
    const lessonTypeMap: Record<AIGenerateType, LessonType> = { audio: "audio", slides: "slider", video: "video", image: "image", test: "test" };
    const typeNames: Record<AIGenerateType, string> = { audio: "аудиолекция", slides: "презентация", video: "видео", image: "изображение", test: "тест" };
    const newLesson: Lesson = {
      id: crypto.randomUUID(), type: lessonTypeMap[type],
      title: `AI ${typeNames[type]}: ${prompt.slice(0, 50)}${prompt.length > 50 ? "..." : ""}`,
      content: "", expanded: true, blocks: type === "slides" ? [] : undefined,
    };

    if (type === "audio") {
      try {
        toast.info("Генерация аудио... Длинные тексты могут занять до 2 минут.");
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 min timeout
        const response = await safeFetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`, {
          method: "POST", headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
          body: JSON.stringify({ text: prompt, voiceId: "JBFqnCBsd6RMkjVDRZzb" }),
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
      } catch (error: any) { toast.error(error.message || "Ошибка генерации аудио"); return; }
    }

    if (type === "test") {
      try {
        toast.info("Генерация тестовых вопросов...");
        const { data, error } = await safeInvoke<any>("generate-course-content", { body: { lessonTitle: prompt, courseTitle: courseTitle || "Курс", courseDescription: courseDescription || "", contentType: "test" } });
        if (error) throw error;
        if (data?.content) newLesson.content = data.content;
        toast.success("Тест сгенерирован!");
      } catch { toast.error("Ошибка генерации теста"); return; }
    }

    if (type === "slides") {
      try {
        toast.info("Генерация слайдов...");
        const { data, error } = await safeInvoke<any>("generate-course-content", { body: { lessonTitle: prompt, courseTitle: courseTitle || "Курс", courseDescription: courseDescription || "", contentType: "slides" } });
        if (error) throw error;
        if (data?.content) {
          try {
            const parsedSlides = JSON.parse(data.content);
            if (Array.isArray(parsedSlides)) {
              newLesson.blocks = [{ id: crypto.randomUUID(), type: "slider" as const, content: prompt, sliderSlides: parsedSlides.map((s: any) => ({ id: s.id || crypto.randomUUID(), title: s.title || "Слайд", content: s.content || "", imageUrl: s.imageUrl || undefined })), sliderCurrentIndex: 0 }];
              newLesson.content = JSON.stringify(parsedSlides);
              toast.success(`Слайды сгенерированы!`);
            } else { _createFallbackSlides(newLesson, prompt, data.content); }
          } catch { _createFallbackSlides(newLesson, prompt); }
        } else { _createFallbackSlides(newLesson, prompt); }
      } catch { _createFallbackSlides(newLesson, prompt); toast.warning("Слайды созданы с базовой структурой"); }
    }

    if (type === "image") {
      try {
        toast.info("Генерация изображения...");
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

    await aiLimit.increment();
    setLessons(prev => [...prev, newLesson]);
    markAsChanged();
    // Autosave after AI generation
    setTimeout(() => { saveCourse(true); }, 500);
  };

  const _createFallbackSlides = (lesson: Lesson, prompt: string, content?: string) => {
    const slides = [
      { id: crypto.randomUUID(), title: "Введение", content: content || prompt },
      { id: crypto.randomUUID(), title: "Основные понятия", content: "" },
      { id: crypto.randomUUID(), title: "Заключение", content: "" },
    ];
    lesson.blocks = [{ id: crypto.randomUUID(), type: "slider" as const, content: prompt, sliderSlides: slides, sliderCurrentIndex: 0 }];
    lesson.content = JSON.stringify(slides);
  };

  const updateLesson = useCallback((id: string, updates: Partial<Lesson>) => {
    setLessons(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
    markAsChanged();
  }, [markAsChanged]);

  const deleteLesson = useCallback((id: string) => {
    setLessons(prev => prev.filter(l => l.id !== id));
    markAsChanged();
    // Autosave after delete with debounce
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { saveCourse(true); }, 500);
  }, [markAsChanged]);

  const toggleLesson = useCallback((id: string) => {
    setLessons(prev => prev.map(l => l.id === id ? { ...l, expanded: !l.expanded } : l));
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLessons(prev => {
        const oldIndex = prev.findIndex(l => l.id === active.id);
        const newIndex = prev.findIndex(l => l.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
      markAsChanged();
      // Autosave after reorder
      setTimeout(() => { saveCourse(true); }, 500);
    }
  };

  const ensureOrganizationId = async (): Promise<string | null> => {
    if (organizationId) return organizationId;
    if (!user) return null;
    const { data } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
    const orgId = data?.organization_id ?? null;
    if (orgId) setOrganizationId(orgId);
    return orgId;
  };

  const saveCourse = async (silent = false): Promise<boolean> => {
    if (isSaving) return false;
    if (!courseTitle.trim()) { if (!silent) toast.error("Введите название курса"); return false; }
    const orgId = await ensureOrganizationId();
    if (!orgId) { if (!silent) toast.error("Не найдена организация"); return false; }
    setIsSaving(true);
    setAutoSaveStatus('saving');
    try {
      let savedCourseId = courseId;
      if (courseId) {
        const { error } = await supabase.from("courses").update({ title: courseTitle.trim(), description: courseDescription.trim() || null, is_published: true }).eq("id", courseId);
        if (error) throw error;
      } else {
        const { data: newCourse, error } = await supabase.from("courses").insert({ title: courseTitle.trim(), description: courseDescription.trim() || null, organization_id: orgId, is_published: true }).select().single();
        if (error) throw error;
        savedCourseId = newCourse.id;
        setSavedCourseIdState(newCourse.id);
        window.history.replaceState(null, '', `/course-builder/${savedCourseId}`);
      }

      if (lessons.length > 0 && savedCourseId) {
        const currentLessonIds = lessons.map(l => l.id);
        if (courseId) {
          await supabase.from("lessons").delete().eq("course_id", courseId).not("id", "in", `(${currentLessonIds.join(",")})`);
        }
        const lessonsToSave = lessons.map((lesson, index) => ({
          id: lesson.id, course_id: savedCourseId!, title: lesson.title, type: lesson.type, content: lesson.content || null,
          order_index: index, test_passing_score: lesson.testPassingScore ?? 60, test_questions_to_show: lesson.testQuestionsToShow ?? null,
        }));
        const { error: batchError } = await supabase.from("lessons").upsert(lessonsToSave, { onConflict: "id" });
        if (batchError && !batchError.message?.includes('AbortError')) {
          console.error("Error saving lessons:", batchError);
        }

        for (const lesson of lessons) {
          if (lesson.type === "test" && lesson.questions && lesson.questions.length > 0) {
            const activeQuestions = lesson.questions.filter(q => !q.isDeleted);
            const toDelete = lesson.questions.filter(q => q.isDeleted && !q.isNew);
            for (const q of toDelete) { await supabase.from("test_questions").delete().eq("id", q.id); }
            for (let i = 0; i < activeQuestions.length; i++) {
              const q = activeQuestions[i];
              await supabase.from("test_questions").upsert([{
                id: q.id, lesson_id: lesson.id, question: q.question.trim(), options: q.options.filter(o => o.text.trim()),
                correct_answer: q.correct_answer, order_index: i, explanation: q.explanation || null, image_url: q.image_url || null
              }], { onConflict: "id" });
            }
          }
        }

        // Save attachments
        for (const lesson of lessons) {
          if (lesson.attachments && lesson.attachments.length > 0) {
            const toDelete = lesson.attachments.filter(a => a.isDeleted && !a.isNew);
            const toInsert = lesson.attachments.filter(a => a.isNew && !a.isDeleted);

            for (const a of toDelete) {
              await supabase.from("lesson_attachments").delete().eq("id", a.id);
            }

            if (toInsert.length > 0) {
              const rows = toInsert.map((a, i) => ({
                id: a.id, lesson_id: lesson.id, name: a.name, file_url: a.file_url,
                file_type: a.file_type, file_size: a.file_size, category: a.category,
                order_index: i,
              }));
              await supabase.from("lesson_attachments").upsert(rows, { onConflict: "id" });
            }
          }
        }
      }
      if (!silent) toast.success(courseId ? "Курс обновлён" : "Курс создан");
      setHasUnsavedChanges(false);
      setAutoSaveStatus('saved');
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 3000);
      return true;
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.message?.includes('AbortError')) {
        if (!silent) toast.success(courseId ? "Курс обновлён" : "Курс создан");
        setHasUnsavedChanges(false);
        setAutoSaveStatus('saved');
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 3000);
        return true;
      } else {
        toast.error("Ошибка сохранения: " + error.message);
        setAutoSaveStatus('error');
        return false;
      }
    } finally { setIsSaving(false); }
  };

  const saveSingleLesson = async (lesson: Lesson, orderIndex: number) => {
    const orgId = await ensureOrganizationId();
    if (!orgId) { toast.error("Не найдена организация"); return; }
    setIsSaving(true);
    try {
      let savedCourseId = courseId;
      if (!savedCourseId) {
        if (!courseTitle.trim()) setCourseTitle(lesson.title || "Новый курс");
        const { data: newCourse, error } = await supabase.from("courses").insert({ title: courseTitle.trim() || lesson.title || "Новый курс", description: courseDescription.trim() || null, organization_id: orgId }).select().single();
        if (error) throw error;
        savedCourseId = newCourse.id;
        setSavedCourseIdState(newCourse.id);
        window.history.replaceState(null, '', `/course-builder/${savedCourseId}`);
      }
      const { data: existing } = await supabase.from("lessons").select("id").eq("id", lesson.id).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("lessons").update({ title: lesson.title, type: lesson.type, content: lesson.content || null, order_index: orderIndex, test_passing_score: lesson.testPassingScore ?? 60, test_questions_to_show: lesson.testQuestionsToShow ?? null }).eq("id", lesson.id);
        if (error) throw error;
        toast.success("Лекция обновлена");
      } else {
        const { error } = await supabase.from("lessons").insert({ id: lesson.id, course_id: savedCourseId, title: lesson.title, type: lesson.type, content: lesson.content || null, order_index: orderIndex, test_passing_score: lesson.testPassingScore ?? 60, test_questions_to_show: lesson.testQuestionsToShow ?? null });
        if (error) throw error;
        toast.success("Лекция сохранена");
      }
    } catch (error: any) { toast.error("Ошибка сохранения: " + error.message); }
    finally { setIsSaving(false); }
  };

  return {
    navigate, courseId, courseTitle, setCourseTitle, courseDescription, setCourseDescription,
    lessons, setLessons, isGenerating, isSaving, isLoading, isImporting,
    hasUnsavedChanges, showExitDialog, setShowExitDialog, showAIGenerateDialog, setShowAIGenerateDialog,
    fileInputRef, markAsChanged, updateLessons, autoSaveStatus,
    handleBackClick, handleSaveAndExit, handleExitWithoutSave, handleFileImport,
    addLesson, handleGenerateStructure, handleAIGenerate,
    updateLesson, deleteLesson, toggleLesson,
    sensors, handleDragEnd, saveCourse, saveSingleLesson,
  };
}
