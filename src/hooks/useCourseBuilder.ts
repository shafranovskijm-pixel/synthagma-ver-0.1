import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAiGenerationLimit, setAiLimitContext } from "@/hooks/useAiGenerationLimit";
import { toast } from "sonner";
import { safeInvoke } from "@/utils/safeInvoke";
import { resolveCourseWriteScope } from "@/lib/courseImportScope";
import { ContentBlock, blocksToJson, markdownToBlocks, jsonToBlocks } from "@/components/course-builder/block-editor";
import { closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { type LessonType, type TestQuestionLocal, type Lesson, type LessonAttachmentLocal, type CourseModule } from "@/components/course-builder/LessonTypeConfig";
import { AIGenerateType } from "@/components/course-builder/AIGenerateDialog";
import {
  saveDraftToLocal, loadDraftFromLocal, clearDraftFromLocal,
  normalizeLessonsFromDB, importFiles, generateAIContent, createFallbackSlides,
} from "./useCourseBuilderHelpers";

const normalizeSaveError = (value: unknown): Error => {
  if (value instanceof Error) return value;
  if (value && typeof value === "object") {
    const candidate = value as { message?: unknown; name?: unknown };
    const error = new Error(
      typeof candidate.message === "string" ? candidate.message : JSON.stringify(value),
    );
    if (typeof candidate.name === "string") error.name = candidate.name;
    return error;
  }
  return new Error(String(value));
};

const isSaveCancellation = (error: Error): boolean =>
  error.name === "AbortError"
  || /aborterror|aborted|cancelled|canceled|отмен/i.test(error.message);

export function useCourseBuilder(propCourseId?: string) {
  const navigate = useNavigate();
  const { courseId: paramCourseId } = useParams();
  const externalCourseId = propCourseId || paramCourseId;
  const { user, userRole, loading: authLoading } = useAuth();
  const [courseTitle, setCourseTitle] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
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
  const delayedSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const courseCreationRef = useRef<Promise<string> | null>(null);
  const editorActiveRef = useRef(true);
  const editorGenerationRef = useRef(0);
  const saveCourseRef = useRef<(silent?: boolean) => Promise<boolean>>(() => Promise.resolve(false));
  const savedCourseIdRef = useRef<string | null>(courseId ?? null);
  const draftOriginCourseIdRef = useRef<string | undefined>(externalCourseId);
  const organizationIdRef = useRef<string | null>(organizationId);
  const changeVersionRef = useRef(0);
  const persistedChangeVersionRef = useRef(0);
  const loadedLessonIdsRef = useRef(new Set<string>());
  const contentReadyRef = useRef(false);
  const latestStateRef = useRef({
    courseTitle: '',
    courseDescription: '',
    lessons: [] as Lesson[],
    courseId: null as string | null,
  });

  if (courseId) savedCourseIdRef.current = courseId;
  organizationIdRef.current = organizationId;
  latestStateRef.current = {
    courseTitle,
    courseDescription,
    lessons,
    courseId: savedCourseIdRef.current ?? courseId ?? null,
  };

  const clearScheduledSaveTimers = useCallback(() => {
    if (delayedSaveTimerRef.current) {
      clearTimeout(delayedSaveTimerRef.current);
      delayedSaveTimerRef.current = null;
    }
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    if (statusResetTimerRef.current) {
      clearTimeout(statusResetTimerRef.current);
      statusResetTimerRef.current = null;
    }
  }, []);

  const scheduleSave = useCallback((delayMs = 500) => {
    if (!editorActiveRef.current) return;
    if (delayedSaveTimerRef.current) clearTimeout(delayedSaveTimerRef.current);
    delayedSaveTimerRef.current = setTimeout(() => {
      delayedSaveTimerRef.current = null;
      void saveCourseRef.current(true);
    }, delayMs);
  }, []);

  useEffect(() => {
    editorActiveRef.current = true;
    return () => {
      editorActiveRef.current = false;
      editorGenerationRef.current += 1;
      clearScheduledSaveTimers();
    };
  }, [clearScheduledSaveTimers]);

  const markAsChanged = useCallback(() => {
    changeVersionRef.current += 1;
    setHasUnsavedChanges(true);
  }, []);
  const updateLessons = useCallback((updater: Lesson[] | ((prev: Lesson[]) => Lesson[])) => { setLessons(updater); markAsChanged(); }, [markAsChanged]);
  const getBackPath = () => userRole === 'admin' ? "/admin" : "/organization?tab=courses";
  const handleBackClick = () => { if (hasUnsavedChanges) setShowExitDialog(true); else navigate(getBackPath()); };
  const saveLatestCourse = useCallback(async (): Promise<boolean> => {
    // Joining an in-flight autosave is not enough when the editor changed after
    // that operation captured its snapshot. Keep saving until the version that
    // reached the database is the current editor version.
    while (true) {
      const saved = await saveCourseRef.current(false);
      if (!saved) return false;
      if (persistedChangeVersionRef.current === changeVersionRef.current) return true;
    }
  }, []);
  const handleSaveAndExit = async () => {
    const saved = await saveLatestCourse();
    if (!saved) return;
    setShowExitDialog(false);
    navigate(getBackPath());
  };
  const handleExitWithoutSave = () => {
    editorActiveRef.current = false;
    editorGenerationRef.current += 1;
    clearScheduledSaveTimers();
    setShowExitDialog(false);
    navigate(getBackPath());
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setIsImporting(true);
    try {
      const totalImported = await importFiles(Array.from(fileList), courseTitle, setCourseTitle, setCourseDescription, setLessons);
      if (totalImported > 0) { toast.success(`Импортировано ${totalImported} ${totalImported === 1 ? 'урок' : totalImported < 5 ? 'урока' : 'уроков'}`); markAsChanged(); scheduleSave(); }
      else toast.warning("Не удалось извлечь уроки из файла");
    } catch (error: unknown) { toast.error(error instanceof Error ? error.message : 'Ошибка импорта файлов'); }
    finally { setIsImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  // Load the course and its content in parallel, but do not expose or mutate it
  // until the server-backed tenant resolver confirms courses.write for the
  // selected organization. This is especially important in admin view mode:
  // an administrator's own profile organization must never become a fallback.
  useEffect(() => {
    const fetchData = async () => {
      if (!user || authLoading || !userRole || isDataLoaded) return;

      setIsLoading(true);
      setScopeError(null);
      contentReadyRef.current = false;

      const coursePromise = courseId
        ? supabase.from("courses").select("*").eq("id", courseId).single()
        : Promise.resolve({ data: null, error: null } as any);

      const modulesPromise = courseId
        ? supabase
            .from("course_modules" as any)
            .select("*")
            .eq("course_id", courseId)
            .order("order_index")
        : Promise.resolve({ data: null, error: null } as any);

      // PERF: pull lesson list WITHOUT `content` column. Slider lessons can
      // hold 8–11 MB of base64 each → 50+ MB per course → PostgREST timeouts.
      // Content is fetched on-demand via `loadLessonContent(id)` when a lesson
      // is opened in the editor.
      const lessonsPromise = courseId
        ? supabase
            .from("lessons")
            .select("id, course_id, title, type, order_index, module_id, metadata, is_locked, test_passing_score, test_questions_to_show, test_max_attempts, test_show_answers, ai_avatar_name, ai_avatar_image_url, ai_avatar_voice_id, ai_avatar_system_prompt, ai_avatar_greeting, ai_avatar_subject, ai_avatar_style, ai_avatar_session_minutes, ai_avatar_model")
            .eq("course_id", courseId)
            .order("order_index")
        : Promise.resolve({ data: null, error: null } as any);

      try {
        const [courseRes, modulesRes, lessonsRes] = await Promise.all([
          coursePromise, modulesPromise, lessonsPromise,
        ]);

        const course = courseRes?.data ?? null;
        if (courseId && (courseRes?.error || !course)) {
          throw new Error("Не удалось загрузить курс или подтвердить его организацию");
        }

        const scope = await resolveCourseWriteScope({
          userId: user.id,
          userRole,
          requestedOrganizationId: course?.organization_id ?? null,
        });
        if (courseId && (modulesRes?.error || !Array.isArray(modulesRes?.data))) {
          throw new Error("Не удалось загрузить модули курса. Сохранение недоступно, обновите страницу.");
        }
        if (courseId && (lessonsRes?.error || !Array.isArray(lessonsRes?.data))) {
          throw new Error("Не удалось загрузить уроки курса. Сохранение недоступно, обновите страницу.");
        }
        const orgId = scope.organizationId;
        const modulesData = modulesRes?.data ?? null;
        const lessonsData = lessonsRes?.data ?? null;

        setOrganizationId(orgId);
        setSubscriptionPlan('free');

        if (course) {
          setCourseTitle(course.title);
          setCourseDescription(course.description || "");
        }
        if (modulesData) {
          setModules((modulesData as any[]).map((m: any) => ({
            id: m.id, course_id: m.course_id, title: m.title, order_index: m.order_index, collapsed: false,
          })));
        }

        // The AI quota and tariff always follow the verified tenant, including
        // when a platform administrator is viewing a client organization.
        supabase
          .from("organizations")
          .select("subscription_plan")
          .eq("id", orgId)
          .single()
          .then(({ data: org }) => {
            if (org?.subscription_plan) {
              setSubscriptionPlan(org.subscription_plan);
              setAiLimitContext(orgId, org.subscription_plan);
            } else {
              setAiLimitContext(orgId, 'free');
            }
          });

        if (lessonsData) {
        const testLessonIds = lessonsData.filter((l: any) => l.type === 'test').map((l: any) => l.id);
        const allLessonIds = lessonsData.map((l: any) => l.id);

        const questionsPromise = testLessonIds.length > 0
          ? supabase.from("test_questions").select("*").in("lesson_id", testLessonIds).order("order_index")
          : Promise.resolve({ data: [], error: null } as any);

        const attachmentsPromise = allLessonIds.length > 0
          ? supabase.from("lesson_attachments").select("*").in("lesson_id", allLessonIds).order("order_index")
          : Promise.resolve({ data: [], error: null } as any);

        const [questionsRes, attachmentsRes] = await Promise.all([
          questionsPromise, attachmentsPromise,
        ]);
        if (questionsRes.error || !Array.isArray(questionsRes.data)) {
          throw new Error("Не удалось загрузить вопросы курса. Сохранение недоступно, обновите страницу.");
        }
        if (attachmentsRes.error || !Array.isArray(attachmentsRes.data)) {
          throw new Error("Не удалось загрузить вложения курса. Сохранение недоступно, обновите страницу.");
        }
        const questionsData = questionsRes.data;
        const attachmentsData = attachmentsRes.data;

        const questionsMap: Record<string, TestQuestionLocal[]> = {};
        if (questionsData) {
          for (const q of questionsData as any[]) {
            if (!questionsMap[q.lesson_id]) questionsMap[q.lesson_id] = [];
            let rawOpts = q.options as unknown;
            if (typeof rawOpts === 'string') { try { rawOpts = JSON.parse(rawOpts); } catch { rawOpts = []; } }
            const normalizedOptions = Array.isArray(rawOpts) ? (rawOpts as any[]).map(o => typeof o === 'string' ? { text: o } : o) : [];
            questionsMap[q.lesson_id].push({ id: q.id, question: q.question, options: normalizedOptions, correct_answer: q.correct_answer, order_index: q.order_index, explanation: (q as any).explanation || '', image_url: q.image_url || null, isNew: false, isDeleted: false });
          }
        }

        const attachmentsMap: Record<string, LessonAttachmentLocal[]> = {};
        if (attachmentsData) {
          for (const a of attachmentsData as any[]) {
            if (!attachmentsMap[a.lesson_id]) attachmentsMap[a.lesson_id] = [];
            attachmentsMap[a.lesson_id].push({ id: a.id, lesson_id: a.lesson_id, name: a.name, file_url: a.file_url, file_type: a.file_type, file_size: a.file_size ? Number(a.file_size) : null, category: a.category, order_index: a.order_index, isNew: false, isDeleted: false });
          }
        }

        const normalized = normalizeLessonsFromDB(lessonsData, questionsMap, attachmentsMap);
        setLessons(normalized);
        if (normalized.length > 0) {
          setActiveLessonId(prev => prev ?? normalized[0].id);
        }
        }

        loadedLessonIdsRef.current = new Set((lessonsData ?? []).map((lesson: { id: string }) => lesson.id));
        contentReadyRef.current = true;
        setIsDataLoaded(true);
      } catch (error) {
        console.error("Course builder scope resolution failed", error);
        contentReadyRef.current = false;
        organizationIdRef.current = null;
        setOrganizationId(null);
        setScopeError(error instanceof Error
          ? error.message
          : "Не удалось подтвердить организацию курса");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [user?.id, userRole, authLoading, courseId, isDataLoaded]);

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

  // Auto-migrate orphan lessons (без module_id) → переложить в первый модуль или создать «Основной»
  const migrationDoneRef = useRef(false);
  useEffect(() => {
    if (!isDataLoaded || !courseId || migrationDoneRef.current) return;
    const orphans = lessons.filter(l => !l.module_id);
    if (orphans.length === 0) { migrationDoneRef.current = true; return; }
    migrationDoneRef.current = true;
    (async () => {
      let targetModuleId: string | null = null;
      if (modules.length > 0) {
        const sorted = [...modules].sort((a, b) => a.order_index - b.order_index);
        targetModuleId = sorted[0].id;
      } else {
        const { data, error } = await supabase
          .from("course_modules" as any)
          .insert({ course_id: courseId, title: "Основной", order_index: 0 })
          .select()
          .single();
        if (error || !data) return;
        const m = data as any;
        targetModuleId = m.id;
        setModules([{ id: m.id, course_id: m.course_id, title: m.title, order_index: m.order_index, collapsed: false }]);
      }
      if (!targetModuleId) return;
      const orphanIds = orphans.map(l => l.id);
      await supabase.from("lessons").update({ module_id: targetModuleId }).in("id", orphanIds);
      setLessons(prev => prev.map(l => !l.module_id ? { ...l, module_id: targetModuleId } : l));
    })();
  }, [isDataLoaded, courseId, lessons, modules]);

  // Debounced autosave
  useEffect(() => {
    if (!hasUnsavedChanges || !isDataLoaded || !editorActiveRef.current) return;
    saveDraftToLocal(courseId, courseTitle, courseDescription, lessons);
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    // Уменьшен debounce: 1.5с вместо 3с — данные сохраняются быстрее
    draftTimerRef.current = setTimeout(() => { draftTimerRef.current = null; void saveCourseRef.current(true); }, 1500);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [hasUnsavedChanges, courseTitle, courseDescription, lessons]);

  // Save draft on unload
  useEffect(() => {
    const saveDraft = () => { if (!editorActiveRef.current) return; const s = latestStateRef.current; saveDraftToLocal(courseId, s.courseTitle, s.courseDescription, s.lessons); };
    const handleBeforeUnload = (e: BeforeUnloadEvent) => { saveDraft(); if (hasUnsavedChanges) e.preventDefault(); };
    const handleVisibility = () => { if (document.visibilityState === 'hidden') saveDraft(); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { window.removeEventListener('beforeunload', handleBeforeUnload); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [courseId, hasUnsavedChanges]);

  const addLesson = (type: LessonType, moduleId?: string | null, overrides?: Partial<Lesson>) => {
    const typeNames: Record<LessonType, string> = { text: "урок", video: "видеоурок", image: "материал", test: "тест", audio: "аудиолекция", lesson: "урок", slider: "презентация", practice: "ситуационное задание", feedback: "обратная связь", homework: "задание", ai_avatar: "ИИ-аватар" };
    const newLesson: Lesson = {
      id: crypto.randomUUID(), type, title: `Новый ${typeNames[type]}`, content: "", expanded: true,
      blocks: (type === "text" || type === "practice") ? [] : undefined,
      module_id: moduleId ?? null,
      ...(overrides || {}),
    };
    // Accordion: новый урок раскрыт, остальные свёрнуты
    setLessons(prev => [...prev.map(l => ({ ...l, expanded: false })), newLesson]);
    // Если урок добавляется в модуль — раскрыть этот модуль
    if (moduleId) {
      setModules(prev => prev.map(m => m.id === moduleId ? { ...m, collapsed: false } : m));
    }
    setActiveLessonId(newLesson.id);
    markAsChanged();
    // Прокрутка правой колонки к новой карточке (не трогаем левую навигацию)
    setTimeout(() => {
      const el = document.querySelector(`[data-lesson-id="${newLesson.id}"]`);
      if (el && 'scrollIntoView' in el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  // ===== MODULES CRUD =====
  // Module bootstrap, full save and single-lesson save must share creation.
  // Otherwise two entry points can create two course IDs before React rerenders.
  const createCourseIdentity = useCallback((orgId: string, title: string, description: string): Promise<string> => {
    if (savedCourseIdRef.current) return Promise.resolve(savedCourseIdRef.current);
    if (courseCreationRef.current) return courseCreationRef.current;
    const generation = editorGenerationRef.current;
    const operation = (async () => {
      const { data, error } = await supabase.from("courses")
        .insert({ title, description: description.trim() || null, organization_id: orgId, is_published: false })
        .select().single();
      if (error) throw error;
      if (!data?.id) throw new Error("Курс создан без идентификатора");
      savedCourseIdRef.current = data.id;
      if (editorActiveRef.current && generation === editorGenerationRef.current) {
        latestStateRef.current = { ...latestStateRef.current, courseId: data.id };
        setSavedCourseIdState(data.id);
        window.history.replaceState(null, '', `/course-builder/${data.id}`);
      }
      return data.id;
    })();
    const tracked: Promise<string> = operation.finally(() => {
      if (courseCreationRef.current === tracked) courseCreationRef.current = null;
    });
    courseCreationRef.current = tracked;
    return tracked;
  }, []);

  const ensureCourseId = async (): Promise<string | null> => {
    if (!editorActiveRef.current || !contentReadyRef.current) return null;
    if (savedCourseIdRef.current) return savedCourseIdRef.current;
    const orgId = await ensureOrganizationId();
    if (!editorActiveRef.current || !orgId) return null;
    const current = latestStateRef.current;
    if (!current.courseTitle.trim()) setCourseTitle("Новый курс");
    try {
      return await createCourseIdentity(orgId, current.courseTitle.trim() || "Новый курс", current.courseDescription);
    } catch (error) {
      console.error("Course creation failed:", normalizeSaveError(error));
      return null;
    }
  };

  const createModule = async () => {
    const cId = await ensureCourseId();
    if (!editorActiveRef.current) return;
    if (!cId) { toast.error("Не удалось определить курс"); return; }
    const nextOrder = modules.length > 0 ? Math.max(...modules.map(m => m.order_index)) + 1 : 0;
    const { data, error } = await supabase
      .from("course_modules" as any)
      .insert({ course_id: cId, title: `Модуль ${modules.length + 1}`, order_index: nextOrder })
      .select()
      .single();
    if (error || !data) { toast.error("Не удалось создать модуль"); return; }
    const m = data as any;
    setModules(prev => [...prev, { id: m.id, course_id: m.course_id, title: m.title, order_index: m.order_index, collapsed: false }]);
    toast.success("Модуль создан");
  };

  const renameModule = async (id: string, title: string) => {
    setModules(prev => prev.map(m => m.id === id ? { ...m, title } : m));
    const { error } = await supabase.from("course_modules" as any).update({ title }).eq("id", id);
    if (error) toast.error("Не удалось переименовать модуль");
  };

  const toggleModuleCollapsed = (id: string) => {
    setModules(prev => prev.map(m => m.id === id ? { ...m, collapsed: !m.collapsed } : m));
  };

  const deleteModule = async (id: string, deleteLessons: boolean) => {
    if (deleteLessons) {
      // Каскадно удалить уроки в этом модуле
      const lessonIds = lessons.filter(l => l.module_id === id).map(l => l.id);
      if (lessonIds.length > 0) {
        await supabase.from("lessons").delete().in("id", lessonIds);
      }
      setLessons(prev => prev.filter(l => l.module_id !== id));
    } else {
      // Перенести уроки в корень
      const lessonIds = lessons.filter(l => l.module_id === id).map(l => l.id);
      if (lessonIds.length > 0) {
        await supabase.from("lessons").update({ module_id: null }).in("id", lessonIds);
      }
      setLessons(prev => prev.map(l => l.module_id === id ? { ...l, module_id: null } : l));
    }
    const { error } = await supabase.from("course_modules" as any).delete().eq("id", id);
    if (error) { toast.error("Не удалось удалить модуль"); return; }
    setModules(prev => prev.filter(m => m.id !== id));
    toast.success("Модуль удалён");
  };

  const reorderModules = async (newOrder: CourseModule[]) => {
    setModules(newOrder.map((m, i) => ({ ...m, order_index: i })));
    // Сохраняем порядок в БД асинхронно
    for (let i = 0; i < newOrder.length; i++) {
      await supabase.from("course_modules" as any).update({ order_index: i }).eq("id", newOrder[i].id);
    }
  };

  const moveLessonToModule = (lessonId: string, moduleId: string | null) => {
    setLessons(prev => prev.map(l => l.id === lessonId ? { ...l, module_id: moduleId } : l));
    markAsChanged();
  };

  const collapseAllModules = () => setModules(prev => prev.map(m => ({ ...m, collapsed: true })));
  const expandAllModules = () => setModules(prev => prev.map(m => ({ ...m, collapsed: false })));

  const handleGenerateStructure = async (customSystemPrompt?: string) => {
    if (!courseTitle.trim()) { toast.error("Введите название курса"); return; }
    if (!(await aiLimit.checkAndNotify())) return;
    setIsGenerating(true);
    try {
      await aiLimit.increment();
      const body: Record<string, unknown> = { title: courseTitle, description: courseDescription };
      if (customSystemPrompt && customSystemPrompt.trim()) body.customSystemPrompt = customSystemPrompt.trim();
      const { data, error } = await safeInvoke<any>("generate-course-structure", { body });
      if (error) throw new Error(error.message || "Ошибка генерации");
      if (!data.success) throw new Error(data.error || "Ошибка генерации структуры");

      // Гарантируем наличие модуля — иначе уроки не отрисуются в сайдбаре (он показывает только уроки внутри модулей).
      const cId = await ensureCourseId();
      let targetModuleId: string | null = null;
      if (modules.length > 0) {
        targetModuleId = [...modules].sort((a, b) => a.order_index - b.order_index)[0].id;
      } else if (cId) {
        const { data: newModule, error: modErr } = await supabase
          .from("course_modules" as any)
          .insert({ course_id: cId, title: "Основной", order_index: 0 })
          .select()
          .single();
        if (modErr || !newModule) { toast.error("Не удалось создать модуль для уроков"); return; }
        const m = newModule as any;
        targetModuleId = m.id;
        setModules(prev => [...prev, { id: m.id, course_id: m.course_id, title: m.title, order_index: m.order_index, collapsed: false }]);
      }

      const generatedLessons: Lesson[] = (data.lessons || []).map((l: any) => ({
        id: crypto.randomUUID(),
        type: l.type as LessonType,
        title: l.title,
        content: l.type === "text" || l.type === "test" ? (l.description || "") : "",
        expanded: false,
        blocks: l.type === "text" ? [] : undefined,
        module_id: targetModuleId,
      }));
      if (generatedLessons.length > 0) {
        setLessons(prev => [...prev, ...generatedLessons]);
        toast.success(`Добавлено ${generatedLessons.length} уроков`);
        markAsChanged();
        scheduleSave();
      } else {
        toast.error("AI не вернул уроки");
      }
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
    scheduleSave();
  };

  const updateLesson = useCallback((id: string, updates: Partial<Lesson>) => { setLessons(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l)); markAsChanged(); }, [markAsChanged]);
  const deleteLesson = useCallback((id: string) => { setLessons(prev => prev.filter(l => l.id !== id)); markAsChanged(); scheduleSave(); }, [markAsChanged, scheduleSave]);

  // Lazy-load full content for a single lesson (slider blobs can be 10+ MB).
  // Called when a lesson is opened/expanded in the editor.
  const loadLessonContent = useCallback(async (lessonId: string): Promise<void> => {
    const target = latestStateRef.current.lessons.find(l => l.id === lessonId);
    if (!target || target.__contentLoaded) return;
    const { data, error } = await supabase.from("lessons").select("content").eq("id", lessonId).maybeSingle();
    if (error) { console.error("loadLessonContent failed", error); return; }
    const content: string = (data as any)?.content || "";
    setLessons(prev => prev.map(l => {
      if (l.id !== lessonId) return l;
      let blocks = l.blocks;
      if (content) {
        try { blocks = jsonToBlocks(content); } catch { /* keep existing blocks */ }
      }
      return { ...l, content, blocks, __contentLoaded: true };
    }));
  }, []);

  // Accordion: открыт только один урок. Повторный клик по уже открытому — сворачивает.
  const toggleLesson = useCallback((id: string) => {
    setLessons(prev => {
      const target = prev.find(l => l.id === id);
      const willOpen = !(target?.expanded);
      return prev.map(l => l.id === id ? { ...l, expanded: willOpen } : { ...l, expanded: false });
    });
    setActiveLessonId(id);
    void loadLessonContent(id);
  }, [loadLessonContent]);
  const expandLesson = useCallback((id: string) => {
    setLessons(prev => prev.map(l => l.id === id ? { ...l, expanded: true } : { ...l, expanded: false }));
    void loadLessonContent(id);
  }, [loadLessonContent]);
  // Клик в левой навигации: раскрыть только этот урок (и свернуть остальные)
  // и проскроллить страницу к началу его карточки.
  const scrollToLesson = useCallback((id: string) => {
    expandLesson(id);
    setActiveLessonId(id);
    // Точная прокрутка к началу карточки с учётом sticky-шапки кабинета.
    const doScroll = () => {
      const el = document.querySelector(`[data-lesson-id="${id}"]`) as HTMLElement | null;
      if (!el) return;
      const header = document.querySelector('[data-org-sticky-header]') as HTMLElement | null;
      const offset = (header?.getBoundingClientRect().height ?? 200) + 12;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    };
    // Двойной rAF + задержка — accordion успевает развернуться до измерения
    setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(doScroll)), 150);
  }, [expandLesson]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) { setLessons(prev => { const oldIndex = prev.findIndex(l => l.id === active.id); const newIndex = prev.findIndex(l => l.id === over.id); return arrayMove(prev, oldIndex, newIndex); }); markAsChanged(); scheduleSave(); }
  };

  const ensureOrganizationId = async (): Promise<string | null> => {
    if (contentReadyRef.current && organizationIdRef.current) return organizationIdRef.current;
    return null;
  };

  const saveCourse = useCallback((silent = false): Promise<boolean> => {
    // React state is intentionally not the lock: two callbacks can observe the
    // same stale `isSaving=false` render. This ref is set synchronously before
    // the first async boundary, so every caller joins the exact same operation.
    if (!editorActiveRef.current) return Promise.resolve(false);
    if (saveInFlightRef.current) return saveInFlightRef.current;
    const generation = editorGenerationRef.current;
    const isCurrentEditor = () => editorActiveRef.current && generation === editorGenerationRef.current;

    clearScheduledSaveTimers();
    setIsSaving(true);
    setAutoSaveStatus('saving');

    const operation = (async (): Promise<boolean> => {
      const snapshot = latestStateRef.current;
      const saveVersion = changeVersionRef.current;
      const currentLessons = snapshot.lessons;
      try {
        if (!contentReadyRef.current) {
          if (!silent) toast.error("Данные курса не загружены полностью. Обновите страницу перед сохранением.");
          setAutoSaveStatus('error');
          return false;
        }
        saveDraftToLocal(snapshot.courseId ?? draftOriginCourseIdRef.current, snapshot.courseTitle, snapshot.courseDescription, snapshot.lessons);
        if (!snapshot.courseTitle.trim()) {
          if (!silent) toast.error("Введите название курса");
          setAutoSaveStatus('error');
          return false;
        }
        const orgId = await ensureOrganizationId();
        if (!isCurrentEditor()) return false;
        if (!orgId) {
          if (!silent) toast.error("Не найдена организация");
          setAutoSaveStatus('error');
          return false;
        }

        const existingCourseId = savedCourseIdRef.current ?? snapshot.courseId;
        const wasExistingCourse = Boolean(existingCourseId);
        const joinedCreation = Boolean(courseCreationRef.current);
        let savedCourseId = existingCourseId;
        if (existingCourseId) {
          const { error } = await supabase
            .from("courses")
            .update({ title: snapshot.courseTitle.trim(), description: snapshot.courseDescription.trim() || null })
            .eq("id", existingCourseId);
          if (error) throw error;
        } else {
          savedCourseId = await createCourseIdentity(orgId, snapshot.courseTitle.trim(), snapshot.courseDescription);
          if (!isCurrentEditor()) return false;
          // A concurrent module action may have bootstrapped with an older title.
          if (joinedCreation) {
            const { error } = await supabase.from("courses")
              .update({ title: snapshot.courseTitle.trim(), description: snapshot.courseDescription.trim() || null })
              .eq("id", savedCourseId);
            if (error) throw error;
          }
        }
        if (!isCurrentEditor()) return false;

        // Only delete lessons known to this editor. Empty or stale loads must
        // never turn into a course-wide DELETE or remove another window's work.
        const currentLessonIds = new Set(currentLessons.map(lesson => lesson.id));
        const removedLessonIds = [...loadedLessonIdsRef.current].filter(id => !currentLessonIds.has(id));
        if (savedCourseId && removedLessonIds.length > 0) {
          const { error: deleteError } = await supabase.from("lessons").delete()
            .eq("course_id", savedCourseId).in("id", removedLessonIds);
          if (deleteError) throw deleteError;
          removedLessonIds.forEach(id => loadedLessonIdsRef.current.delete(id));
          if (!isCurrentEditor()) return false;
        }

        if (currentLessons.length > 0 && savedCourseId) {
          // Split into two upsert batches:
          // - lessonsWithContent: content was loaded (or freshly created) → write everything
          // - lessonsMetaOnly: lazy placeholder → write metadata, KEEP existing content in DB
          const baseRow = (lesson: typeof currentLessons[number], index: number) => ({
            id: lesson.id, course_id: savedCourseId!, title: lesson.title, type: lesson.type,
            order_index: index, test_passing_score: lesson.testPassingScore ?? 60,
            test_questions_to_show: lesson.testQuestionsToShow ?? null,
            test_max_attempts: lesson.testMaxAttempts ?? null,
            test_show_answers: lesson.testShowAnswers ?? true,
            module_id: lesson.module_id ?? null,
            metadata: lesson.metadata ?? {},
          });
          const lessonsWithContent = currentLessons
            .map((l, i) => ({ l, i }))
            .filter(({ l }) => l.__contentLoaded !== false)
            .map(({ l, i }) => ({ ...baseRow(l, i), content: l.content || null }));
          const lessonsMetaOnly = currentLessons
            .map((l, i) => ({ l, i }))
            .filter(({ l }) => l.__contentLoaded === false)
            .map(({ l, i }) => baseRow(l, i));

          const lessonBatches = [lessonsWithContent, lessonsMetaOnly].filter(batch => batch.length > 0);
          // A response can fail after the row was committed. Retain all IDs
          // attempted by this editor, so removing one on a retry still deletes
          // that exact row without touching lessons created in another window.
          lessonBatches.forEach(batch => batch.forEach(lesson => loadedLessonIdsRef.current.add(lesson.id)));
          // Wait for both batches even after one failure, so a retry cannot race
          // a write from the previous attempt.
          const upsertResults = await Promise.allSettled(lessonBatches.map(batch =>
            Promise.resolve(supabase.from("lessons").upsert(batch, { onConflict: "id" })),
          ));
          const lessonErrors: unknown[] = [];
          upsertResults.forEach(result => {
            if (result.status === "rejected") lessonErrors.push(result.reason);
            else if (result.value.error) lessonErrors.push(result.value.error);
          });
          if (lessonErrors.length > 0) throw normalizeSaveError(lessonErrors[0]);
          if (!isCurrentEditor()) return false;

          // Параллельная обработка тестовых вопросов и вложений для скорости
          const testOps: Promise<unknown>[] = [];
          const attachOps: Promise<unknown>[] = [];

          for (const lesson of currentLessons) {
            if (lesson.type === "test" && lesson.questions && lesson.questions.length > 0) {
              const activeQuestions = lesson.questions.filter(q => !q.isDeleted);
              const toDelete = lesson.questions.filter(q => q.isDeleted && !q.isNew);
              for (const q of toDelete) {
                testOps.push(Promise.resolve(supabase.from("test_questions").delete().eq("id", q.id)));
              }
              if (activeQuestions.length > 0) {
                const rows = activeQuestions.map((q, i) => ({ id: q.id, lesson_id: lesson.id, question: q.question.trim(), options: q.options.filter(o => o.text.trim()), correct_answer: q.correct_answer, order_index: i, explanation: q.explanation || null, image_url: q.image_url || null }));
                testOps.push(Promise.resolve(supabase.from("test_questions").upsert(rows, { onConflict: "id" })));
              }
            }
            if (lesson.attachments && lesson.attachments.length > 0) {
              const toDelete = lesson.attachments.filter(a => a.isDeleted && !a.isNew);
              const toInsert = lesson.attachments.filter(a => a.isNew && !a.isDeleted);
              for (const a of toDelete) {
                attachOps.push(Promise.resolve(supabase.from("lesson_attachments").delete().eq("id", a.id)));
              }
              if (toInsert.length > 0) {
                const rows = toInsert.map((a, i) => ({ id: a.id, lesson_id: lesson.id, name: a.name, file_url: a.file_url, file_type: a.file_type, file_size: a.file_size, category: a.category, order_index: i }));
                attachOps.push(Promise.resolve(supabase.from("lesson_attachments").upsert(rows, { onConflict: "id" })));
              }
            }
          }
          const results = await Promise.allSettled([...testOps, ...attachOps]);
          const subRecordErrors = results.flatMap(result => {
            if (result.status === 'rejected') return [result.reason];
            const value = result.value;
            if (value && typeof value === 'object' && 'error' in value) {
              const operationError = (value as { error?: unknown }).error;
              return operationError ? [operationError] : [];
            }
            return [];
          });
          if (subRecordErrors.length > 0) {
            console.error("Some lesson sub-records failed to save:", subRecordErrors);
            throw normalizeSaveError(subRecordErrors[0]);
          }
        }
        if (!isCurrentEditor()) return false;

        persistedChangeVersionRef.current = saveVersion;
        if (!silent) toast.success(wasExistingCourse ? "Курс обновлён" : "Курс создан");
        if (changeVersionRef.current === saveVersion) {
          setHasUnsavedChanges(false);
          const draftOriginCourseId = draftOriginCourseIdRef.current;
          clearDraftFromLocal(draftOriginCourseId);
          if (savedCourseId && savedCourseId !== draftOriginCourseId) {
            clearDraftFromLocal(savedCourseId);
          }
          // Stop touching the shared new-course draft after the first confirmed
          // save. Another tab may now own that draft key.
          draftOriginCourseIdRef.current = savedCourseId ?? draftOriginCourseId;
        } else {
          const current = latestStateRef.current;
          setHasUnsavedChanges(true);
          saveDraftToLocal(savedCourseIdRef.current ?? current.courseId, current.courseTitle, current.courseDescription, current.lessons);
          scheduleSave();
        }
        setAutoSaveStatus('saved');
        statusResetTimerRef.current = setTimeout(() => {
          statusResetTimerRef.current = null;
          setAutoSaveStatus('idle');
        }, 3000);
        return true;
      } catch (error: unknown) {
        if (!isCurrentEditor()) return false;
        const err = normalizeSaveError(error);
        const wasCancelled = isSaveCancellation(err);
        console.error(wasCancelled ? "Course save was cancelled:" : "Course save failed:", err);
        // A failed or cancelled write can be partial. Keep the editor dirty and
        // the local draft intact so the same idempotent operations can be retried.
        const current = latestStateRef.current;
        saveDraftToLocal(savedCourseIdRef.current ?? current.courseId ?? draftOriginCourseIdRef.current, current.courseTitle, current.courseDescription, current.lessons);
        setHasUnsavedChanges(true);
        setAutoSaveStatus('error');
        if (!silent) {
          toast.error(
            wasCancelled
              ? "Сохранение прервано. Изменения не потеряны — попробуйте ещё раз"
              : "Ошибка сохранения: " + err.message,
          );
        }
        return false;
      }
    })();

    const trackedOperation: Promise<boolean> = operation.finally(() => {
      if (saveInFlightRef.current === trackedOperation) saveInFlightRef.current = null;
      if (isCurrentEditor()) setIsSaving(false);
    });
    saveInFlightRef.current = trackedOperation;
    return trackedOperation;
  }, [clearScheduledSaveTimers, scheduleSave, createCourseIdentity]);

  saveCourseRef.current = saveCourse;

  const saveSingleLesson = async (lesson: Lesson, orderIndex: number) => {
    if (!editorActiveRef.current) return;
    const orgId = await ensureOrganizationId();
    if (!editorActiveRef.current) return;
    if (!orgId) { toast.error("Не найдена организация"); return; }
    setIsSaving(true);
    try {
      const current = latestStateRef.current;
      if (!current.courseTitle.trim()) setCourseTitle(lesson.title || "Новый курс");
      const savedCourseId = await createCourseIdentity(orgId, current.courseTitle.trim() || lesson.title || "Новый курс", current.courseDescription);
      if (!editorActiveRef.current) return;
      const { data: existing } = await supabase.from("lessons").select("id").eq("id", lesson.id).maybeSingle();
      if (existing) { const { error } = await supabase.from("lessons").update({ title: lesson.title, type: lesson.type, content: lesson.content || null, order_index: orderIndex, test_passing_score: lesson.testPassingScore ?? 60, test_questions_to_show: lesson.testQuestionsToShow ?? null, test_max_attempts: lesson.testMaxAttempts ?? null, test_show_answers: lesson.testShowAnswers ?? true, module_id: lesson.module_id ?? null, metadata: lesson.metadata ?? {} }).eq("id", lesson.id); if (error) throw error; loadedLessonIdsRef.current.add(lesson.id); toast.success("Лекция обновлена"); }
      else { const { error } = await supabase.from("lessons").insert({ id: lesson.id, course_id: savedCourseId, title: lesson.title, type: lesson.type, content: lesson.content || null, order_index: orderIndex, test_passing_score: lesson.testPassingScore ?? 60, test_questions_to_show: lesson.testQuestionsToShow ?? null, test_max_attempts: lesson.testMaxAttempts ?? null, test_show_answers: lesson.testShowAnswers ?? true, module_id: lesson.module_id ?? null, metadata: lesson.metadata ?? {} }); if (error) throw error; loadedLessonIdsRef.current.add(lesson.id); toast.success("Лекция сохранена"); }
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
    sensors, handleDragEnd, saveCourse, saveSingleLesson, organizationId, scopeError,
    activeLessonId, setActiveLessonId, scrollToLesson, expandLesson, loadLessonContent,
    // Modules
    modules, createModule, renameModule, deleteModule, toggleModuleCollapsed,
    reorderModules, moveLessonToModule, collapseAllModules, expandAllModules,
  };
}
