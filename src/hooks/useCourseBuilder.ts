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
import { type LessonType, type TestQuestionLocal, type Lesson, type LessonAttachmentLocal, type CourseModule } from "@/components/course-builder/LessonTypeConfig";
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
  const [modules, setModules] = useState<CourseModule[]>([]);
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

  // Load data — parallelize independent queries to cut waterfall latency.
  // Before: profile → org → course → modules → lessons → (questions + attachments)  [6 sequential round-trips]
  // After:  [profile, course, modules, lessons] in parallel, then [questions, attachments] in parallel.
  //         Subscription plan is fetched in the background (doesn't block UI).
  useEffect(() => {
    const fetchData = async () => {
      if (!user || isDataLoaded) return;

      const profilePromise = supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

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
            .select("id, course_id, title, type, order_index, module_id, is_locked, locked_until, test_passing_score, test_questions_to_show, ai_avatar_name, ai_avatar_image_url, ai_avatar_voice_id, ai_avatar_system_prompt, ai_avatar_greeting, ai_avatar_subject, ai_avatar_style, ai_avatar_session_minutes, ai_avatar_model")
            .eq("course_id", courseId)
            .order("order_index")
        : Promise.resolve({ data: null, error: null } as any);

      const [{ data: profile }, courseRes, modulesRes, lessonsRes] = await Promise.all([
        profilePromise, coursePromise, modulesPromise, lessonsPromise,
      ]);

      const course = courseRes?.data ?? null;
      const modulesData = modulesRes?.data ?? null;
      const lessonsData = lessonsRes?.data ?? null;

      if (course) {
        setCourseTitle(course.title);
        setCourseDescription(course.description || "");
      }
      if (modulesData) {
        setModules((modulesData as any[]).map((m: any) => ({
          id: m.id, course_id: m.course_id, title: m.title, order_index: m.order_index, collapsed: false,
        })));
      }

      // Resolve organization id (prefer profile, fall back to course's org).
      const orgId = profile?.organization_id || course?.organization_id || null;
      if (orgId) {
        setOrganizationId(orgId);
        // Subscription plan is only needed for AI limits — fetch in background.
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
      }

      if (lessonsData) {
        const testLessonIds = lessonsData.filter((l: any) => l.type === 'test').map((l: any) => l.id);
        const allLessonIds = lessonsData.map((l: any) => l.id);

        const questionsPromise = testLessonIds.length > 0
          ? supabase.from("test_questions").select("*").in("lesson_id", testLessonIds).order("order_index")
          : Promise.resolve({ data: [], error: null } as any);

        const attachmentsPromise = allLessonIds.length > 0
          ? supabase.from("lesson_attachments").select("*").in("lesson_id", allLessonIds).order("order_index")
          : Promise.resolve({ data: [], error: null } as any);

        const [{ data: questionsData }, { data: attachmentsData }] = await Promise.all([
          questionsPromise, attachmentsPromise,
        ]);

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

      setIsLoading(false);
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
    if (!hasUnsavedChanges || !isDataLoaded) return;
    saveDraftToLocal(courseId, courseTitle, courseDescription, lessons);
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    // Уменьшен debounce: 1.5с вместо 3с — данные сохраняются быстрее
    draftTimerRef.current = setTimeout(() => { saveCourse(true); }, 1500);
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

  const addLesson = (type: LessonType, moduleId?: string | null) => {
    const typeNames: Record<LessonType, string> = { text: "урок", video: "видеоурок", image: "материал", test: "тест", audio: "аудиолекция", lesson: "урок", slider: "презентация", practice: "ситуационное задание", feedback: "обратная связь", homework: "задание", ai_avatar: "ИИ-аватар" };
    const newLesson: Lesson = {
      id: crypto.randomUUID(), type, title: `Новый ${typeNames[type]}`, content: "", expanded: true,
      blocks: (type === "text" || type === "practice") ? [] : undefined,
      module_id: moduleId ?? null,
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
  const ensureCourseId = async (): Promise<string | null> => {
    if (courseId) return courseId;
    const orgId = await ensureOrganizationId();
    if (!orgId) return null;
    if (!courseTitle.trim()) setCourseTitle("Новый курс");
    const { data: newCourse, error } = await supabase
      .from("courses")
      .insert({ title: courseTitle.trim() || "Новый курс", description: courseDescription.trim() || null, organization_id: orgId })
      .select()
      .single();
    if (error || !newCourse) return null;
    setSavedCourseIdState(newCourse.id);
    window.history.replaceState(null, '', `/course-builder/${newCourse.id}`);
    return newCourse.id;
  };

  const createModule = async () => {
    const cId = await ensureCourseId();
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

  const handleGenerateStructure = async () => {
    if (!courseTitle.trim()) { toast.error("Введите название курса"); return; }
    if (!(await aiLimit.checkAndNotify())) return;
    setIsGenerating(true);
    try {
      await aiLimit.increment();
      const { data, error } = await safeInvoke<any>("generate-course-structure", { body: { title: courseTitle, description: courseDescription } });
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
        setTimeout(() => { saveCourse(true); }, 500);
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
    setTimeout(() => { saveCourse(true); }, 500);
  };

  const updateLesson = useCallback((id: string, updates: Partial<Lesson>) => { setLessons(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l)); markAsChanged(); }, [markAsChanged]);
  const deleteLesson = useCallback((id: string) => { setLessons(prev => prev.filter(l => l.id !== id)); markAsChanged(); if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = setTimeout(() => { saveCourse(true); }, 500); }, [markAsChanged]);
  // Accordion: открыт только один урок. Повторный клик по уже открытому — сворачивает.
  const toggleLesson = useCallback((id: string) => {
    setLessons(prev => {
      const target = prev.find(l => l.id === id);
      const willOpen = !(target?.expanded);
      return prev.map(l => l.id === id ? { ...l, expanded: willOpen } : { ...l, expanded: false });
    });
    setActiveLessonId(id);
  }, []);
  const expandLesson = useCallback((id: string) => {
    setLessons(prev => prev.map(l => l.id === id ? { ...l, expanded: true } : { ...l, expanded: false }));
  }, []);
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
        const lessonsToSave = lessons.map((lesson, index) => ({ id: lesson.id, course_id: savedCourseId!, title: lesson.title, type: lesson.type, content: lesson.content || null, order_index: index, test_passing_score: lesson.testPassingScore ?? 60, test_questions_to_show: lesson.testQuestionsToShow ?? null, module_id: lesson.module_id ?? null }));
        const { error: batchError } = await supabase.from("lessons").upsert(lessonsToSave, { onConflict: "id" });
        if (batchError && !batchError.message?.includes('AbortError')) {
          console.error("Error saving lessons:", batchError);
          if (!silent) toast.error("Ошибка сохранения уроков: " + batchError.message);
          throw batchError;
        }

        // Параллельная обработка тестовых вопросов и вложений для скорости
        const testOps: Promise<unknown>[] = [];
        const attachOps: Promise<unknown>[] = [];

        for (const lesson of lessons) {
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
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length > 0) {
          console.error("Some lesson sub-records failed to save:", failed);
          if (!silent) toast.warning(`Не удалось сохранить ${failed.length} элементов (вопросы/файлы)`);
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
      if (existing) { const { error } = await supabase.from("lessons").update({ title: lesson.title, type: lesson.type, content: lesson.content || null, order_index: orderIndex, test_passing_score: lesson.testPassingScore ?? 60, test_questions_to_show: lesson.testQuestionsToShow ?? null, module_id: lesson.module_id ?? null }).eq("id", lesson.id); if (error) throw error; toast.success("Лекция обновлена"); }
      else { const { error } = await supabase.from("lessons").insert({ id: lesson.id, course_id: savedCourseId, title: lesson.title, type: lesson.type, content: lesson.content || null, order_index: orderIndex, test_passing_score: lesson.testPassingScore ?? 60, test_questions_to_show: lesson.testQuestionsToShow ?? null, module_id: lesson.module_id ?? null }); if (error) throw error; toast.success("Лекция сохранена"); }
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
    // Modules
    modules, createModule, renameModule, deleteModule, toggleModuleCollapsed,
    reorderModules, moveLessonToModule, collapseAllModules, expandAllModules,
  };
}
