import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAiGenerationLimit, setAiLimitContext } from "@/hooks/useAiGenerationLimit";
import { toast } from "sonner";
import { safeInvoke } from "@/utils/safeInvoke";
import { ContentBlock, blocksToJson, markdownToBlocks } from "@/components/course-builder/BlockEditor";
import { closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { type LessonType, type TestQuestionLocal, type Lesson, type LessonAttachmentLocal } from "@/components/course-builder/LessonTypeConfig";
import { AIGenerateType } from "@/components/course-builder/AIGenerateDialog";
import {
  saveDraftToLocal, loadDraftFromLocal, clearDraftFromLocal,
  normalizeLessonsFromDB, importFiles, generateAIContent, createFallbackSlides,
} from "./useCourseBuilderHelpers";

export function useCourseBuilder(propCourseId?: string) {
  const navigate = useNavigate();
  const { courseId: paramCourseId } = useParams();
  const externalCourseId = propCourseId || paramCourseId;
  const { user, userRole } = useAuth();
  const [courseTitle, setCourseTitle] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!externalCourseId);
  const [isImporting, setIsImporting] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [savedCourseIdState, setSavedCourseIdState] = useState<string | null>(null);
  const courseId = savedCourseIdState || externalCourseId;
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showAIGenerateDialog, setShowAIGenerateDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<string>('free');
  const aiLimit = useAiGenerationLimit(organizationId, subscriptionPlan);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStateRef = useRef({ courseTitle: '', courseDescription: '', lessons: [] as Lesson[] });

  useEffect(() => { latestStateRef.current = { courseTitle, courseDescription, lessons }; }, [courseTitle, courseDescription, lessons]);

  const markAsChanged = useCallback(() => { setHasUnsavedChanges(true); }, []);
  const updateLessons = useCallback((updater: Lesson[] | ((prev: Lesson[]) => Lesson[])) => { setLessons(updater); markAsChanged(); }, [markAsChanged]);
  const getBackPath = () => userRole === 'admin' ? "/admin" : "/organization";
  const handleBackClick = () => { if (hasUnsavedChanges) setShowExitDialog(true); else navigate(getBackPath()); };
  const handleSaveAndExit = async () => { await saveCourse(); setShowExitDialog(false); navigate(getBackPath()); };
  const handleExitWithoutSave = () => { setShowExitDialog(false); navigate(getBackPath()); };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setIsImporting(true);
    try {
      const totalImported = await importFiles(Array.from(fileList), courseTitle, setCourseTitle, setCourseDescription, setLessons);
      if (totalImported > 0) { toast.success(`Импортировано ${totalImported} ${totalImported === 1 ? 'урок' : totalImported < 5 ? 'урока' : 'уроков'}`); markAsChanged(); setTimeout(() => { saveCourse(true); }, 500); }
      else toast.warning("Не удалось извлечь уроки из файла");
    } catch (error: unknown) { toast.error(error instanceof Error ? error.message : 'Ошибка импорта файлов'); }
    finally { setIsImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  // Load data
  useEffect(() => {
    const fetchData = async () => {
      if (!user || isDataLoaded) return;
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      if (profile?.organization_id) {
        setOrganizationId(profile.organization_id);
        const { data: org } = await supabase.from("organizations").select("subscription_plan").eq("id", profile.organization_id).single();
        if (org?.subscription_plan) { setSubscriptionPlan(org.subscription_plan); setAiLimitContext(profile.organization_id, org.subscription_plan); }
        else setAiLimitContext(profile.organization_id, 'free');
      }
      if (courseId) {
        const { data: course } = await supabase.from("courses").select("*").eq("id", courseId).single();
        if (course) { setCourseTitle(course.title); setCourseDescription(course.description || ""); if (!profile?.organization_id && course.organization_id) setOrganizationId(course.organization_id); }
        const { data: lessonsData } = await supabase.from("lessons").select("*").eq("course_id", courseId).order("order_index");
        if (lessonsData) {
          const testLessonIds = lessonsData.filter(l => l.type === 'test').map(l => l.id);
          let questionsMap: Record<string, TestQuestionLocal[]> = {};
          if (testLessonIds.length > 0) {
            const { data: questionsData } = await supabase.from("test_questions").select("*").in("lesson_id", testLessonIds).order("order_index");
            if (questionsData) {
              for (const q of questionsData) {
                if (!questionsMap[q.lesson_id]) questionsMap[q.lesson_id] = [];
                let rawOpts = q.options as unknown;
                if (typeof rawOpts === 'string') { try { rawOpts = JSON.parse(rawOpts); } catch { rawOpts = []; } }
                const normalizedOptions = Array.isArray(rawOpts) ? (rawOpts as any[]).map(o => typeof o === 'string' ? { text: o } : o) : [];
                questionsMap[q.lesson_id].push({ id: q.id, question: q.question, options: normalizedOptions, correct_answer: q.correct_answer, order_index: q.order_index, explanation: (q as any).explanation || '', image_url: q.image_url || null, isNew: false, isDeleted: false });
              }
            }
          }
          const allLessonIds = lessonsData.map(l => l.id);
          let attachmentsMap: Record<string, LessonAttachmentLocal[]> = {};
          if (allLessonIds.length > 0) {
            const { data: attachmentsData } = await supabase.from("lesson_attachments").select("*").in("lesson_id", allLessonIds).order("order_index");
            if (attachmentsData) {
              for (const a of attachmentsData) {
                if (!attachmentsMap[a.lesson_id]) attachmentsMap[a.lesson_id] = [];
                attachmentsMap[a.lesson_id].push({ id: a.id, lesson_id: a.lesson_id, name: a.name, file_url: a.file_url, file_type: a.file_type, file_size: a.file_size ? Number(a.file_size) : null, category: a.category, order_index: a.order_index, isNew: false, isDeleted: false });
              }
            }
          }
          setLessons(normalizeLessonsFromDB(lessonsData, questionsMap, attachmentsMap));
        }
        setIsLoading(false);
      } else { setIsLoading(false); }
      setIsDataLoaded(true);
    };
    fetchData();
  }, [user, courseId, isDataLoaded]);

  // Restore local draft
  useEffect(() => {
    if (!isDataLoaded) return;
    const draft = loadDraftFromLocal(courseId);
    if (!draft) return;
    const currentHasContent = courseTitle.trim() || lessons.length > 0;
    if (!currentHasContent && (draft.title.trim() || draft.lessons.length > 0)) {
      setCourseTitle(draft.title); setCourseDescription(draft.description); setLessons(draft.lessons);
      toast.info("Восстановлен черновик из предыдущего сеанса", { duration: 4000 });
    }
  }, [isDataLoaded]);

  // Debounced autosave
  useEffect(() => {
    if (!hasUnsavedChanges || !isDataLoaded) return;
    saveDraftToLocal(courseId, courseTitle, courseDescription, lessons);
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => { saveCourse(true); }, 3000);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [hasUnsavedChanges, courseTitle, courseDescription, lessons]);

  // Save draft on unload
  useEffect(() => {
    const saveDraft = () => { const s = latestStateRef.current; saveDraftToLocal(courseId, s.courseTitle, s.courseDescription, s.lessons); };
    const handleBeforeUnload = (e: BeforeUnloadEvent) => { saveDraft(); if (hasUnsavedChanges) e.preventDefault(); };
    const handleVisibility = () => { if (document.visibilityState === 'hidden') saveDraft(); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { window.removeEventListener('beforeunload', handleBeforeUnload); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [courseId, hasUnsavedChanges]);

  const addLesson = (type: LessonType) => {
    const typeNames: Record<LessonType, string> = { text: "урок", video: "видеоурок", image: "материал", test: "тест", audio: "аудиолекция", lesson: "урок", slider: "презентация", practice: "ситуационное задание", feedback: "обратная связь", homework: "задание" };
    const newLesson: Lesson = { id: crypto.randomUUID(), type, title: `Новый ${typeNames[type]}`, content: "", expanded: true, blocks: (type === "text" || type === "practice") ? [] : undefined };
    setLessons(prev => [...prev, newLesson]); markAsChanged();
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
      const generatedLessons: Lesson[] = (data.lessons || []).map((l: any) => ({ id: crypto.randomUUID(), type: l.type as LessonType, title: l.title, content: l.type === "text" || l.type === "test" ? (l.description || "") : "", expanded: false, blocks: l.type === "text" ? [] : undefined }));
      if (generatedLessons.length > 0) { setLessons(prev => [...prev, ...generatedLessons]); toast.success(`Добавлено ${generatedLessons.length} уроков`); markAsChanged(); setTimeout(() => { saveCourse(true); }, 500); }
      else toast.error("AI не вернул уроки");
    } catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Ошибка генерации"); }
    finally { setIsGenerating(false); }
  };

  const handleAIGenerate = async (type: AIGenerateType, prompt: string) => {
    if (!(await aiLimit.checkAndNotify())) return;
    const lessonTypeMap: Record<AIGenerateType, LessonType> = { audio: "audio", slides: "slider", video: "video", image: "image", test: "test" };
    const typeNames: Record<AIGenerateType, string> = { audio: "аудиолекция", slides: "презентация", video: "видео", image: "изображение", test: "тест" };
    const newLesson: Lesson = { id: crypto.randomUUID(), type: lessonTypeMap[type], title: `AI ${typeNames[type]}: ${prompt.slice(0, 50)}${prompt.length > 50 ? "..." : ""}`, content: "", expanded: true, blocks: type === "slides" ? [] : undefined };
    try { await generateAIContent(type, prompt, courseTitle, courseDescription, newLesson); } catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Ошибка генерации"); return; }
    await aiLimit.increment();
    setLessons(prev => [...prev, newLesson]); markAsChanged();
    setTimeout(() => { saveCourse(true); }, 500);
  };

  const updateLesson = useCallback((id: string, updates: Partial<Lesson>) => { setLessons(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l)); markAsChanged(); }, [markAsChanged]);
  const deleteLesson = useCallback((id: string) => { setLessons(prev => prev.filter(l => l.id !== id)); markAsChanged(); if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = setTimeout(() => { saveCourse(true); }, 500); }, [markAsChanged]);
  const toggleLesson = useCallback((id: string) => { setLessons(prev => prev.map(l => l.id === id ? { ...l, expanded: !l.expanded } : l)); }, []);
  const expandLesson = useCallback((id: string) => { setLessons(prev => prev.map(l => l.id === id ? { ...l, expanded: true } : l)); }, []);
  const scrollToLesson = useCallback((id: string) => {
    expandLesson(id);
    setActiveLessonId(id);
  }, [expandLesson]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) { setLessons(prev => { const oldIndex = prev.findIndex(l => l.id === active.id); const newIndex = prev.findIndex(l => l.id === over.id); return arrayMove(prev, oldIndex, newIndex); }); markAsChanged(); setTimeout(() => { saveCourse(true); }, 500); }
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
    setIsSaving(true); setAutoSaveStatus('saving');
    try {
      let savedCourseId = courseId;
      if (courseId) { const { error } = await supabase.from("courses").update({ title: courseTitle.trim(), description: courseDescription.trim() || null, is_published: true }).eq("id", courseId); if (error) throw error; }
      else { const { data: newCourse, error } = await supabase.from("courses").insert({ title: courseTitle.trim(), description: courseDescription.trim() || null, organization_id: orgId, is_published: true }).select().single(); if (error) throw error; savedCourseId = newCourse.id; setSavedCourseIdState(newCourse.id); window.history.replaceState(null, '', `/course-builder/${savedCourseId}`); }

      if (lessons.length > 0 && savedCourseId) {
        const currentLessonIds = lessons.map(l => l.id);
        if (courseId) await supabase.from("lessons").delete().eq("course_id", courseId).not("id", "in", `(${currentLessonIds.join(",")})`);
        const lessonsToSave = lessons.map((lesson, index) => ({ id: lesson.id, course_id: savedCourseId!, title: lesson.title, type: lesson.type, content: lesson.content || null, order_index: index, test_passing_score: lesson.testPassingScore ?? 60, test_questions_to_show: lesson.testQuestionsToShow ?? null }));
        const { error: batchError } = await supabase.from("lessons").upsert(lessonsToSave, { onConflict: "id" });
        if (batchError && !batchError.message?.includes('AbortError')) console.error("Error saving lessons:", batchError);

        for (const lesson of lessons) {
          if (lesson.type === "test" && lesson.questions && lesson.questions.length > 0) {
            const activeQuestions = lesson.questions.filter(q => !q.isDeleted);
            const toDelete = lesson.questions.filter(q => q.isDeleted && !q.isNew);
            for (const q of toDelete) await supabase.from("test_questions").delete().eq("id", q.id);
            for (let i = 0; i < activeQuestions.length; i++) {
              const q = activeQuestions[i];
              await supabase.from("test_questions").upsert([{ id: q.id, lesson_id: lesson.id, question: q.question.trim(), options: q.options.filter(o => o.text.trim()), correct_answer: q.correct_answer, order_index: i, explanation: q.explanation || null, image_url: q.image_url || null }], { onConflict: "id" });
            }
          }
        }
        for (const lesson of lessons) {
          if (lesson.attachments && lesson.attachments.length > 0) {
            const toDelete = lesson.attachments.filter(a => a.isDeleted && !a.isNew);
            const toInsert = lesson.attachments.filter(a => a.isNew && !a.isDeleted);
            for (const a of toDelete) await supabase.from("lesson_attachments").delete().eq("id", a.id);
            if (toInsert.length > 0) { const rows = toInsert.map((a, i) => ({ id: a.id, lesson_id: lesson.id, name: a.name, file_url: a.file_url, file_type: a.file_type, file_size: a.file_size, category: a.category, order_index: i })); await supabase.from("lesson_attachments").upsert(rows, { onConflict: "id" }); }
          }
        }
      }
      if (!silent) toast.success(courseId ? "Курс обновлён" : "Курс создан");
      setHasUnsavedChanges(false); clearDraftFromLocal(courseId); setAutoSaveStatus('saved');
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 3000);
      return true;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (err.name === 'AbortError' || err.message?.includes('AbortError')) {
        if (!silent) toast.success(courseId ? "Курс обновлён" : "Курс создан");
        setHasUnsavedChanges(false); clearDraftFromLocal(courseId); setAutoSaveStatus('saved');
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 3000); return true;
      } else { toast.error("Ошибка сохранения: " + err.message); setAutoSaveStatus('error'); return false; }
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
        if (error) throw error; savedCourseId = newCourse.id; setSavedCourseIdState(newCourse.id); window.history.replaceState(null, '', `/course-builder/${savedCourseId}`);
      }
      const { data: existing } = await supabase.from("lessons").select("id").eq("id", lesson.id).maybeSingle();
      if (existing) { const { error } = await supabase.from("lessons").update({ title: lesson.title, type: lesson.type, content: lesson.content || null, order_index: orderIndex, test_passing_score: lesson.testPassingScore ?? 60, test_questions_to_show: lesson.testQuestionsToShow ?? null }).eq("id", lesson.id); if (error) throw error; toast.success("Лекция обновлена"); }
      else { const { error } = await supabase.from("lessons").insert({ id: lesson.id, course_id: savedCourseId, title: lesson.title, type: lesson.type, content: lesson.content || null, order_index: orderIndex, test_passing_score: lesson.testPassingScore ?? 60, test_questions_to_show: lesson.testQuestionsToShow ?? null }); if (error) throw error; toast.success("Лекция сохранена"); }
    } catch (error: unknown) { toast.error("Ошибка сохранения: " + (error instanceof Error ? error.message : String(error))); }
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
    sensors, handleDragEnd, saveCourse, saveSingleLesson, organizationId,
    activeLessonId, setActiveLessonId, scrollToLesson, expandLesson,
  };
}
