import { useEffect, useRef, useCallback } from "react";
import { useBuilderContext, useBuilderState } from "./course-builder/useBuilderContext";
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
  readScopedBuilderDraft, saveScopedBuilderDraft, clearScopedBuilderDraft, hasLegacyBuilderDraft,
  type BuilderDraftIdentity, type BuilderDraftReceipt,
  normalizeLessonsFromDB, importFiles, generateAIContent, createFallbackSlides,
} from "./useCourseBuilderHelpers";

export function useCourseBuilder(propCourseId?: string) {
  const navigate = useNavigate();
  const { courseId: paramCourseId } = useParams();
  const externalCourseId = propCourseId || paramCourseId;
  const { user, userRole, loading: authLoading } = useAuth();
  const builderContext = useBuilderContext(user?.id, userRole, !!authLoading, externalCourseId);
  const [courseTitle, setCourseTitle] = useBuilderState(builderContext, "");
  const [courseDescription, setCourseDescription] = useBuilderState(builderContext, "");
  const [lessons, setLessonState] = useBuilderState<Lesson[]>(builderContext, []);
  const [modules, setModules] = useBuilderState<CourseModule[]>(builderContext, []);
  const [isGenerating, setIsGenerating] = useBuilderState(builderContext, false);
  const [isSaving, setIsSaving] = useBuilderState(builderContext, false);
  const [isLoading, setIsLoading] = useBuilderState(builderContext, true);
  const [isImporting, setIsImporting] = useBuilderState(builderContext, false);
  const [organizationId, setOrganizationId] = useBuilderState<string | null>(builderContext, null);
  const [scopeError, setScopeError] = useBuilderState<string | null>(builderContext, null);
  const [isDataLoaded, setIsDataLoaded] = useBuilderState(builderContext, false);
  const [savedCourseIdState, setSavedCourseIdState] = useBuilderState<string | null>(builderContext, null);
  const courseId = savedCourseIdState || externalCourseId;
  const [hasUnsavedChanges, setHasUnsavedChanges] = useBuilderState(builderContext, false);
  const [showExitDialog, setShowExitDialog] = useBuilderState(builderContext, false);
  const [showAIGenerateDialog, setShowAIGenerateDialog] = useBuilderState(builderContext, false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useBuilderState<string>(builderContext, 'free');
  const aiLimit = useAiGenerationLimit(organizationId, subscriptionPlan);
  const [autoSaveStatus, setAutoSaveStatus] = useBuilderState<'idle' | 'saving' | 'saved' | 'error'>(builderContext, 'idle');
  const [activeLessonId, setActiveLessonId] = useBuilderState<string | null>(builderContext, null);
  const [lessonContentStatus, setLessonContentStatus] = useBuilderState<Record<string, "loading" | "error" | "missing" | "conflict">>(builderContext, {});
  const [draftStatus, setDraftStatus] = useBuilderState(builderContext, "");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStateRef = useRef({ courseTitle: '', courseDescription: '', lessons: [] as Lesson[] });
  const importIdentity = JSON.stringify([user?.id, userRole, !!authLoading, organizationId, courseId, externalCourseId]);
  const importIdentityRef = useRef({ key: importIdentity, generation: 0 });
  if (importIdentityRef.current.key !== importIdentity) {
    importIdentityRef.current = { key: importIdentity, generation: importIdentityRef.current.generation + 1 };
  }
  const importGeneration = importIdentityRef.current.generation;
  const importRequestRef = useRef(0);
  const importBusyRef = useRef(false);
  const importMountedRef = useRef(true);
  const pendingImportSaveRef = useRef<{ generation: number; organizationId: string; userId: string; userRole: string } | null>(null);
  useEffect(() => {
    importMountedRef.current = true;
    return () => { importMountedRef.current = false; importRequestRef.current++; };
  }, []);

  latestStateRef.current = { courseTitle, courseDescription, lessons };
  const mainRequestRef = useRef(0);
  const contentRequestsRef = useRef(new Map<string, Promise<void>>());
  const localRevisionRef = useRef(0);
  const saveCourseRef = useRef<(silent?: boolean, allowAmbiguityRead?: boolean) => Promise<boolean>>(async () => false);
  const migrationOwnerRef = useRef<typeof builderContext | null>(null);
  const draftSourceRef = useRef<{ context: typeof builderContext; identity: BuilderDraftIdentity; receipt: BuilderDraftReceipt } | null>(null);
  const createdCourseRef = useRef<{ context: typeof builderContext; id: string } | null>(null);
  const creationRef = useRef<{ context: typeof builderContext; promise: Promise<string | null> } | null>(null);
  const savingRef = useRef<typeof builderContext | null>(null);
  const failedSaveRef = useRef<{ context: typeof builderContext; revision: number } | null>(null);
  const persistedLessonIdsRef = useRef<{ context: typeof builderContext; courseId: string; ids: Set<string> } | null>(null);
  const confirmedSaveRef = useRef<{ context: typeof builderContext; courseId: string; revision: number } | null>(null);
  const uncertainLessonIdsRef = useRef<{ context: typeof builderContext; courseId: string; ids: Set<string> } | null>(null);
  const uncertainIdsFor = (id: string) => {
    if (uncertainLessonIdsRef.current?.context !== builderContext || uncertainLessonIdsRef.current.courseId !== id) {
      uncertainLessonIdsRef.current = { context: builderContext, courseId: id, ids: new Set() };
    }
    return uncertainLessonIdsRef.current.ids;
  };
  const setLessons = useCallback<typeof setLessonState>(update => {
    if (!builderContext.isCurrent()) return;
    setLessonState(previous => {
      const next = typeof update === "function" ? update(previous) : update;
      const before = new Map(previous.map(lesson => [lesson.id, lesson]));
      if (next.some(lesson => {
        const old = before.get(lesson.id);
        return old?.__contentLoaded === false && (lesson.__contentLoaded !== false
          || lesson.content !== old.content || lesson.blocks !== old.blocks || lesson.type !== old.type);
      })) return previous;
      latestStateRef.current = { ...latestStateRef.current, lessons: next };
      return next;
    });
  }, [builderContext, setLessonState]);
  useEffect(() => {
    importRequestRef.current++;
    importBusyRef.current = false;
    pendingImportSaveRef.current = null;
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [builderContext]);

  const markAsChanged = useCallback(() => { if (!builderContext.isCurrent()) return; localRevisionRef.current++; setHasUnsavedChanges(true); }, [builderContext, setHasUnsavedChanges]);
  const updateLessons = useCallback((updater: Lesson[] | ((prev: Lesson[]) => Lesson[])) => { setLessons(updater); markAsChanged(); }, [setLessons, markAsChanged]);
  const getBackPath = () => userRole === 'admin' ? "/admin" : "/organization?tab=courses";
  const handleBackClick = () => { if (!builderContext.isCurrent()) return; if (hasUnsavedChanges) setShowExitDialog(true); else navigate(getBackPath()); };
  const handleSaveAndExit = async () => { const saved = await saveCourse(); if (saved && builderContext.isCurrent()) { setShowExitDialog(false); navigate(getBackPath()); } };
  const handleExitWithoutSave = () => { if (!builderContext.isCurrent()) return; setShowExitDialog(false); navigate(getBackPath()); };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    if (importBusyRef.current) return;
    if (!importMountedRef.current || !user || authLoading || !userRole || isLoading || !isDataLoaded || scopeError || !organizationId || importIdentityRef.current.generation !== importGeneration) {
      toast.error(scopeError || "Сначала дождитесь подтверждения организации и прав на курс");
      return;
    }
    const request = ++importRequestRef.current;
    const isCurrent = () => importMountedRef.current && importRequestRef.current === request && importIdentityRef.current.generation === importGeneration;
    const verifyScope = async () => {
      const scope = await resolveCourseWriteScope({ userId: user.id, userRole, requestedOrganizationId: organizationId });
      if (!isCurrent() || scope.organizationId !== organizationId) throw new Error("Контекст импорта изменился. Запустите импорт снова в нужной организации");
      return scope;
    };
    importBusyRef.current = true;
    setIsImporting(true);
    try {
      const scope = await verifyScope();
      const totalImported = await importFiles(Array.from(fileList), courseTitle, setCourseTitle, setCourseDescription, setLessons, {
        scope, isCurrent, verifyBeforeCommit: async () => { await verifyScope(); },
      });
      if (!isCurrent()) return;
      if (totalImported > 0) {
        pendingImportSaveRef.current = { generation: importGeneration, organizationId, userId: user.id, userRole };
        toast.success(`Импортировано ${totalImported} ${totalImported === 1 ? 'урок' : totalImported < 5 ? 'урока' : 'уроков'}`);
        markAsChanged();
      }
      else toast.warning("Не удалось извлечь уроки из файла");
    } catch (error: unknown) { if (isCurrent()) toast.error(error instanceof Error ? error.message : 'Ошибка импорта файлов'); }
    finally {
      if (importRequestRef.current === request) {
        importBusyRef.current = false;
        if (importMountedRef.current) setIsImporting(false);
      }
      if (isCurrent() && fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Load the course and its content in parallel, but do not expose or mutate it
  // until the server-backed tenant resolver confirms courses.write for the
  // selected organization. This is especially important in admin view mode:
  // an administrator's own profile organization must never become a fallback.
  useEffect(() => {
    let cancelled = false;
    const request = ++mainRequestRef.current;
    const current = () => !cancelled && builderContext.isCurrent() && mainRequestRef.current === request;
    const fetchData = async () => {
      if (!current() || !user || authLoading || !userRole || isDataLoaded) return;

      setIsLoading(true);
      setScopeError(null);

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
            .select("id, course_id, title, type, order_index, module_id, metadata, is_locked, test_passing_score, test_questions_to_show, test_max_attempts, test_max_attempts_per_day, test_show_answers, ai_avatar_name, ai_avatar_image_url, ai_avatar_voice_id, ai_avatar_system_prompt, ai_avatar_greeting, ai_avatar_subject, ai_avatar_style, ai_avatar_session_minutes, ai_avatar_model")
            .eq("course_id", courseId)
            .order("order_index")
        : Promise.resolve({ data: null, error: null } as any);

      try {
        const [courseRes, modulesRes, lessonsRes] = await Promise.all([
          coursePromise, modulesPromise, lessonsPromise,
        ]);
        if (!current()) return;

        const course = courseRes?.data ?? null;
        if (courseId && (courseRes?.error || !course || course.id !== courseId)) {
          throw new Error("Не удалось загрузить курс или подтвердить его организацию");
        }
        if (modulesRes?.error || lessonsRes?.error) throw new Error("Не удалось загрузить список уроков курса");

        const scope = await resolveCourseWriteScope({
          userId: user.id,
          userRole,
          requestedOrganizationId: course?.organization_id ?? null,
        });
        if (!current()) return;
        const orgId = scope.organizationId;
        const modulesData = modulesRes?.data ?? null;
        const lessonsData = lessonsRes?.data ?? null;
        if (courseId && !Array.isArray(lessonsData)) throw new Error("Не удалось подтвердить исходный список уроков курса");
        if ((modulesData && (!Array.isArray(modulesData) || modulesData.some((module: any) => module.course_id !== courseId)))
          || (lessonsData && (!Array.isArray(lessonsData) || lessonsData.some((lesson: any) => lesson.course_id !== courseId)))) throw new Error("Не удалось подтвердить принадлежность материалов курсу");

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
            if (!builderContext.isCurrent()) return;
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

        const [{ data: questionsData, error: questionsError }, { data: attachmentsData, error: attachmentsError }] = await Promise.all([
          questionsPromise, attachmentsPromise,
        ]);
        if (!current()) return;
        if (questionsError || attachmentsError) throw new Error("Не удалось загрузить вопросы или вложения курса");

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
        if (courseId) persistedLessonIdsRef.current = { context: builderContext, courseId, ids: new Set(normalized.map(lesson => lesson.id)) };
        setLessons(normalized);
        if (normalized.length > 0) {
          setActiveLessonId(prev => prev ?? normalized[0].id);
        }
        }

        setIsDataLoaded(true);
      } catch (error) {
        if (!current()) return;
        console.error("Course builder scope resolution failed", error);
        setOrganizationId(null);
        setScopeError(error instanceof Error
          ? error.message
          : "Не удалось подтвердить организацию курса");
      } finally {
        if (current()) setIsLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [user?.id, userRole, authLoading, courseId, isDataLoaded, builderContext]);

  // Legacy drafts have no actor attribution. Keep their bytes, but never restore
  // their contents into a different signed-in editor.
  useEffect(() => {
    if (!builderContext.isCurrent() || !isDataLoaded || !organizationId || !user) return;
    const identity = { actorId: user.id, organizationId, requestedCourseId: externalCourseId };
    const retainedLegacy = "Черновик старого формата сохранён в браузере. Для восстановления требуется подтверждение владельца.";
    let legacy = false;
    try {
      legacy = hasLegacyBuilderDraft(externalCourseId);
      const source = readScopedBuilderDraft(identity);
      draftSourceRef.current = { context: builderContext, identity, receipt: source.receipt };
      setDraftStatus(legacy ? retainedLegacy : "");
      if (!source.draft) return;
      const draft = source.draft;
      if (draft.courseId !== (externalCourseId ?? null)) {
        // A stored newly-created ID is not sufficient proof to adopt its route.
        setDraftStatus(`${legacy ? retainedLegacy + " " : ""}Именной черновик сохранён в браузере. Для восстановления связанного курса требуется повторное подтверждение.`);
        return;
      }
      const currentHasContent = latestStateRef.current.courseTitle.trim() || latestStateRef.current.lessons.length > 0;
      if (!currentHasContent && (draft.title.trim() || draft.lessons.length > 0)) {
        setCourseTitle(draft.title); setCourseDescription(draft.description); setLessons(draft.lessons);
        markAsChanged();
        setDraftStatus(`${legacy ? retainedLegacy + " " : ""}Восстановлен ваш черновик для этой организации.`);
      } else setDraftStatus(`${legacy ? retainedLegacy + " " : ""}Ваш черновик сохранён в браузере; открытые данные курса не заменены.`);
    } catch {
      draftSourceRef.current = null;
      setDraftStatus(`${legacy ? retainedLegacy + " " : ""}Локальный черновик недоступен или не подтверждён. Он сохранён без изменений.`);
    }
  }, [builderContext, isDataLoaded, organizationId, externalCourseId]);

  // Auto-migrate orphan lessons (без module_id) → переложить в первый модуль или создать «Основной»
  useEffect(() => {
    if (!builderContext.isCurrent() || !isDataLoaded || !courseId || migrationOwnerRef.current === builderContext) return;
    const orphans = lessons.filter(l => !l.module_id);
    if (orphans.length === 0) { migrationOwnerRef.current = builderContext; return; }
    migrationOwnerRef.current = builderContext;
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
        if (!builderContext.isCurrent()) return;
        const m = data as any;
        targetModuleId = m.id;
        setModules([{ id: m.id, course_id: m.course_id, title: m.title, order_index: m.order_index, collapsed: false }]);
      }
      if (!targetModuleId || !builderContext.isCurrent()) return;
      const orphanIds = orphans.map(l => l.id);
      const { error } = await supabase.from("lessons").update({ module_id: targetModuleId }).eq("course_id", courseId).in("id", orphanIds);
      if (error || !builderContext.isCurrent()) return;
      setLessons(prev => prev.map(l => !l.module_id ? { ...l, module_id: targetModuleId } : l));
    })();
  }, [builderContext, isDataLoaded, courseId, lessons, modules]);

  const saveCurrentDraft = useCallback(() => {
    const source = draftSourceRef.current;
    if (!builderContext.isCurrent() || !isDataLoaded || !source || source.context !== builderContext) return;
    try {
      const state = latestStateRef.current;
      source.receipt = saveScopedBuilderDraft(source.identity, {
        courseId: createdCourseRef.current?.context === builderContext ? createdCourseRef.current.id : externalCourseId ?? null,
        title: state.courseTitle, description: state.courseDescription, lessons: state.lessons,
      }, source.receipt);
    } catch {
      setDraftStatus("Черновик в браузере изменился или недоступен. Он не перезаписан.");
    }
  }, [builderContext, isDataLoaded, externalCourseId, setDraftStatus]);

  // Debounced autosave
  useEffect(() => {
    if (!builderContext.isCurrent() || !hasUnsavedChanges || !isDataLoaded) return;
    saveCurrentDraft();
    if (failedSaveRef.current?.context === builderContext && failedSaveRef.current.revision === localRevisionRef.current) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    // Уменьшен debounce: 1.5с вместо 3с — данные сохраняются быстрее
    const saveGeneration = importIdentityRef.current.generation;
    let cancelled = false;
    draftTimerRef.current = setTimeout(async () => {
      const current = () => !cancelled && builderContext.isCurrent() && importMountedRef.current && importIdentityRef.current.generation === saveGeneration;
      if (!current()) return;
      const importSave = pendingImportSaveRef.current;
      if (importSave) {
        if (importSave.generation !== saveGeneration) return;
        try {
          const scope = await resolveCourseWriteScope({ userId: importSave.userId, userRole: importSave.userRole, requestedOrganizationId: importSave.organizationId });
          if (!current() || pendingImportSaveRef.current !== importSave || scope.organizationId !== importSave.organizationId) return;
        } catch (error) {
          if (current()) {
            setAutoSaveStatus('error');
            toast.error(error instanceof Error ? error.message : "Не удалось подтвердить организацию перед сохранением импорта");
          }
          return;
        }
      }
      if (!current()) return;
      const saved = await saveCourseRef.current(true, false);
      if (saved && pendingImportSaveRef.current === importSave) pendingImportSaveRef.current = null;
    }, 1500);
    return () => { cancelled = true; if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [builderContext, hasUnsavedChanges, courseTitle, courseDescription, lessons, isDataLoaded, saveCurrentDraft]);

  // Save draft on unload
  useEffect(() => {
    const saveDraft = () => { if (hasUnsavedChanges && builderContext.isCurrent()) saveCurrentDraft(); };
    const handleBeforeUnload = (e: BeforeUnloadEvent) => { saveDraft(); if (hasUnsavedChanges) e.preventDefault(); };
    const handleVisibility = () => { if (document.visibilityState === 'hidden') saveDraft(); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { window.removeEventListener('beforeunload', handleBeforeUnload); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [builderContext, hasUnsavedChanges, saveCurrentDraft]);

  const addLesson = (type: LessonType, moduleId?: string | null, overrides?: Partial<Lesson>) => {
    if (!builderContext.isCurrent() || !isDataLoaded || scopeError) return;
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
      if (!builderContext.isCurrent()) return;
      const el = document.querySelector(`[data-lesson-id="${newLesson.id}"]`);
      if (el && 'scrollIntoView' in el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  // ===== MODULES CRUD =====
  const ensureCourseId = async (): Promise<string | null> => {
    if (!builderContext.isCurrent() || !isDataLoaded || scopeError || !organizationId || !user || !userRole) return null;
    if (createdCourseRef.current?.context === builderContext) return createdCourseRef.current.id;
    if (courseId) return courseId;
    if (creationRef.current?.context === builderContext) return creationRef.current.promise;
    const promise = (async () => {
      const scope = await resolveCourseWriteScope({ userId: user.id, userRole, requestedOrganizationId: organizationId });
      if (!builderContext.isCurrent() || scope.organizationId !== organizationId) return null;
      const state = latestStateRef.current;
      if (!state.courseTitle.trim()) setCourseTitle("Новый курс");
      const { data, error } = await supabase.from("courses")
        .insert({ title: state.courseTitle.trim() || "Новый курс", description: state.courseDescription.trim() || null, organization_id: organizationId, is_published: false })
        .select().single();
      if (!builderContext.isCurrent()) return null;
      if (error) throw error;
      if (!data || typeof data.id !== "string" || data.organization_id !== organizationId) throw new Error("Не удалось подтвердить созданный курс");
      createdCourseRef.current = { context: builderContext, id: data.id };
      persistedLessonIdsRef.current = { context: builderContext, courseId: data.id, ids: new Set() };
      setSavedCourseIdState(data.id);
      return data.id;
    })();
    creationRef.current = { context: builderContext, promise };
    try { return await promise; }
    finally { if (creationRef.current?.promise === promise) creationRef.current = null; }
  };

  const createModule = async () => {
    let cId: string | null;
    try { cId = await ensureCourseId(); }
    catch { if (builderContext.isCurrent()) toast.error("Не удалось подтвердить курс и организацию"); return; }
    if (!builderContext.isCurrent()) return;
    if (!cId) { toast.error("Не удалось определить курс"); return; }
    const nextOrder = modules.length > 0 ? Math.max(...modules.map(m => m.order_index)) + 1 : 0;
    const { data, error } = await supabase
      .from("course_modules" as any)
      .insert({ course_id: cId, title: `Модуль ${modules.length + 1}`, order_index: nextOrder })
      .select()
      .single();
    if (!builderContext.isCurrent()) return;
    if (error || !data) { toast.error("Не удалось создать модуль"); return; }
    const m = data as any;
    setModules(prev => [...prev, { id: m.id, course_id: m.course_id, title: m.title, order_index: m.order_index, collapsed: false }]);
    toast.success("Модуль создан");
  };

  const renameModule = async (id: string, title: string) => {
    if (!builderContext.isCurrent() || !courseId || !modules.some(module => module.id === id)) return;
    setModules(prev => prev.map(m => m.id === id ? { ...m, title } : m));
    const { error } = await supabase.from("course_modules" as any).update({ title }).eq("id", id).eq("course_id", courseId);
    if (builderContext.isCurrent() && error) toast.error("Не удалось переименовать модуль");
  };

  const toggleModuleCollapsed = (id: string) => {
    setModules(prev => prev.map(m => m.id === id ? { ...m, collapsed: !m.collapsed } : m));
  };

  const deleteModule = async (id: string, deleteLessons: boolean) => {
    if (!builderContext.isCurrent() || !courseId || !modules.some(module => module.id === id)) return;
    if (deleteLessons) {
      // Каскадно удалить уроки в этом модуле
      const lessonIds = lessons.filter(l => l.module_id === id).map(l => l.id);
      if (lessonIds.length > 0) {
        const { error } = await supabase.from("lessons").delete().eq("course_id", courseId).in("id", lessonIds);
        if (!builderContext.isCurrent()) return;
        if (error) { toast.error("Не удалось удалить уроки модуля"); return; }
      }
      setLessons(prev => prev.filter(l => l.module_id !== id));
    } else {
      // Перенести уроки в корень
      const lessonIds = lessons.filter(l => l.module_id === id).map(l => l.id);
      if (lessonIds.length > 0) {
        const { error } = await supabase.from("lessons").update({ module_id: null }).eq("course_id", courseId).in("id", lessonIds);
        if (!builderContext.isCurrent()) return;
        if (error) { toast.error("Не удалось перенести уроки модуля"); return; }
      }
      setLessons(prev => prev.map(l => l.module_id === id ? { ...l, module_id: null } : l));
    }
    if (!builderContext.isCurrent()) return;
    const { error } = await supabase.from("course_modules" as any).delete().eq("id", id).eq("course_id", courseId);
    if (!builderContext.isCurrent()) return;
    if (error) { toast.error("Не удалось удалить модуль"); return; }
    setModules(prev => prev.filter(m => m.id !== id));
    toast.success("Модуль удалён");
  };

  const reorderModules = async (newOrder: CourseModule[]) => {
    if (!builderContext.isCurrent() || !courseId || newOrder.some(module => !modules.some(current => current.id === module.id))) return;
    setModules(newOrder.map((m, i) => ({ ...m, order_index: i })));
    // Сохраняем порядок в БД асинхронно
    for (let i = 0; i < newOrder.length; i++) {
      if (!builderContext.isCurrent()) return;
      const { error } = await supabase.from("course_modules" as any).update({ order_index: i }).eq("id", newOrder[i].id).eq("course_id", courseId);
      if (error) { if (builderContext.isCurrent()) toast.error("Не удалось сохранить порядок модулей"); return; }
    }
  };

  const moveLessonToModule = (lessonId: string, moduleId: string | null) => {
    setLessons(prev => prev.map(l => l.id === lessonId ? { ...l, module_id: moduleId } : l));
    markAsChanged();
  };

  const collapseAllModules = () => setModules(prev => prev.map(m => ({ ...m, collapsed: true })));
  const expandAllModules = () => setModules(prev => prev.map(m => ({ ...m, collapsed: false })));

  const handleGenerateStructure = async (customSystemPrompt?: string) => {
    if (!builderContext.isCurrent()) return;
    if (!courseTitle.trim()) { toast.error("Введите название курса"); return; }
    if (!(await aiLimit.checkAndNotify())) return;
    if (!builderContext.isCurrent()) return;
    setIsGenerating(true);
    try {
      await aiLimit.increment();
      if (!builderContext.isCurrent()) return;
      const body: Record<string, unknown> = { title: courseTitle, description: courseDescription };
      if (customSystemPrompt && customSystemPrompt.trim()) body.customSystemPrompt = customSystemPrompt.trim();
      const { data, error } = await safeInvoke<any>("generate-course-structure", { body });
      if (!builderContext.isCurrent()) return;
      if (error) throw new Error(error.message || "Ошибка генерации");
      if (!data.success) throw new Error(data.error || "Ошибка генерации структуры");

      // Гарантируем наличие модуля — иначе уроки не отрисуются в сайдбаре (он показывает только уроки внутри модулей).
      const cId = await ensureCourseId();
      if (!builderContext.isCurrent()) return;
      let targetModuleId: string | null = null;
      if (modules.length > 0) {
        targetModuleId = [...modules].sort((a, b) => a.order_index - b.order_index)[0].id;
      } else if (cId) {
        const { data: newModule, error: modErr } = await supabase
          .from("course_modules" as any)
          .insert({ course_id: cId, title: "Основной", order_index: 0 })
          .select()
          .single();
        if (!builderContext.isCurrent()) return;
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
        setTimeout(() => { if (builderContext.isCurrent()) void saveCourseRef.current(true, false); }, 500);
      } else {
        toast.error("AI не вернул уроки");
      }
    } catch (error: unknown) { if (builderContext.isCurrent()) toast.error(error instanceof Error ? error.message : "Ошибка генерации"); }
    finally { setIsGenerating(false); }
  };

  const handleAIGenerate = async (type: AIGenerateType, prompt: string) => {
    if (!builderContext.isCurrent()) return;
    if (!(await aiLimit.checkAndNotify())) return;
    if (!builderContext.isCurrent()) return;
    const lessonTypeMap: Record<AIGenerateType, LessonType> = { audio: "audio", slides: "slider", video: "video", image: "image", test: "test" };
    const typeNames: Record<AIGenerateType, string> = { audio: "аудиолекция", slides: "презентация", video: "видео", image: "изображение", test: "тест" };
    const newLesson: Lesson = { id: crypto.randomUUID(), type: lessonTypeMap[type], title: `AI ${typeNames[type]}: ${prompt.slice(0, 50)}${prompt.length > 50 ? "..." : ""}`, content: "", expanded: true, blocks: type === "slides" ? [] : undefined };
    try { await generateAIContent(type, prompt, courseTitle, courseDescription, newLesson); } catch (error: unknown) { if (builderContext.isCurrent()) toast.error(error instanceof Error ? error.message : "Ошибка генерации"); return; }
    if (!builderContext.isCurrent()) return;
    await aiLimit.increment();
    if (!builderContext.isCurrent()) return;
    setLessons(prev => [...prev, newLesson]); markAsChanged();
    setTimeout(() => { if (builderContext.isCurrent()) void saveCourseRef.current(true, false); }, 500);
  };

  const updateLesson = useCallback((id: string, updates: Partial<Lesson>) => {
    if (!builderContext.isCurrent()) return;
    const target = latestStateRef.current.lessons.find(lesson => lesson.id === id);
    if (!target) return;
    if (target.__contentLoaded === false && ["content", "blocks", "type", "__contentLoaded"].some(key => Object.prototype.hasOwnProperty.call(updates, key))) return;
    setLessons(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l)); markAsChanged();
  }, [builderContext, setLessons, markAsChanged]);
  const deleteLesson = useCallback((id: string) => { if (!builderContext.isCurrent()) return; setLessons(prev => prev.filter(l => l.id !== id)); markAsChanged(); if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = setTimeout(() => { if (builderContext.isCurrent()) void saveCourseRef.current(true, false); }, 500); }, [builderContext, setLessons, markAsChanged]);

  // Lazy-load full content for a single lesson (slider blobs can be 10+ MB).
  // Called when a lesson is opened/expanded in the editor.
  const loadLessonContent = useCallback((lessonId: string): Promise<void> => {
    if (!builderContext.isCurrent() || isLoading || !isDataLoaded || scopeError || !organizationId || !courseId) return Promise.resolve();
    const target = latestStateRef.current.lessons.find(l => l.id === lessonId);
    if (!target || target.__contentLoaded !== false) return Promise.resolve();
    const generation = importIdentityRef.current.generation;
    const key = JSON.stringify([builderContext.generation, generation, courseId, lessonId]);
    const existing = contentRequestsRef.current.get(key);
    if (existing) return existing;
    const base = { type: target.type, content: target.content, blocks: target.blocks };
    const current = () => builderContext.isCurrent() && importIdentityRef.current.generation === generation;
    setLessonContentStatus(previous => ({ ...previous, [lessonId]: "loading" }));
    let pending: Promise<void>;
    pending = Promise.resolve().then(async () => {
      try {
        if (!current()) return;
        if (!user || !userRole) return;
        const scope = await resolveCourseWriteScope({ userId: user.id, userRole, requestedOrganizationId: organizationId });
        if (!current()) return;
        if (scope.organizationId !== organizationId) throw new Error("Организация изменилась");
        const { data, error } = await supabase.from("lessons").select("id, course_id, content").eq("id", lessonId).eq("course_id", courseId).maybeSingle();
        if (!current()) return;
        if (error) throw error;
        const confirmedScope = await resolveCourseWriteScope({ userId: user.id, userRole, requestedOrganizationId: organizationId });
        if (!current()) return;
        if (confirmedScope.organizationId !== organizationId) throw new Error("Организация изменилась");
        if (!data) { setLessonContentStatus(previous => ({ ...previous, [lessonId]: "missing" })); return; }
        if (data.id !== lessonId || data.course_id !== courseId || (data.content !== null && typeof data.content !== "string")) throw new Error("Invalid lesson content identity");
        const content = data.content ?? "";
        let applied = false;
        setLessonState(previous => previous.map(lesson => {
          if (lesson.id !== lessonId) return lesson;
          if (lesson.__contentLoaded !== false || lesson.type !== base.type || lesson.content !== base.content || lesson.blocks !== base.blocks) return lesson;
          let blocks = lesson.blocks;
          blocks = jsonToBlocks(content);
          applied = true;
          const hydrated = { ...lesson, content, blocks, __contentLoaded: true };
          latestStateRef.current = { ...latestStateRef.current, lessons: previous.map(row => row.id === lessonId ? hydrated : row) };
          return hydrated;
        }));
        setLessonContentStatus(previous => {
          const next = { ...previous };
          if (applied) delete next[lessonId]; else next[lessonId] = "conflict";
          return next;
        });
      } catch {
        if (current()) setLessonContentStatus(previous => ({ ...previous, [lessonId]: "error" }));
      } finally {
        if (contentRequestsRef.current.get(key) === pending) contentRequestsRef.current.delete(key);
      }
    });
    contentRequestsRef.current.set(key, pending);
    return pending;
  }, [builderContext, isLoading, isDataLoaded, scopeError, organizationId, courseId, importGeneration, user?.id, userRole, setLessonState, setLessonContentStatus]);

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
      if (!builderContext.isCurrent()) return;
      const el = document.querySelector(`[data-lesson-id="${id}"]`) as HTMLElement | null;
      if (!el) return;
      const header = document.querySelector('[data-org-sticky-header]') as HTMLElement | null;
      const offset = (header?.getBoundingClientRect().height ?? 200) + 12;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    };
    // Двойной rAF + задержка — accordion успевает развернуться до измерения
    setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(doScroll)), 150);
  }, [builderContext, expandLesson, setActiveLessonId]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleDragEnd = (event: DragEndEvent) => {
    if (!builderContext.isCurrent()) return;
    const { active, over } = event;
    if (over && active.id !== over.id) { setLessons(prev => { const oldIndex = prev.findIndex(l => l.id === active.id); const newIndex = prev.findIndex(l => l.id === over.id); return oldIndex < 0 || newIndex < 0 ? prev : arrayMove(prev, oldIndex, newIndex); }); markAsChanged(); setTimeout(() => { if (builderContext.isCurrent()) void saveCourseRef.current(true, false); }, 500); }
  };

  const saveCourse = async (silent = false, allowAmbiguityRead = true): Promise<boolean> => {
    if (!builderContext.isCurrent() || !isDataLoaded || scopeError || !user || !userRole || !organizationId || savingRef.current === builderContext) return false;
    if (!courseTitle.trim()) { if (!silent) toast.error("Введите название курса"); return false; }
    savingRef.current = builderContext;
    const revision = localRevisionRef.current;
    const draftSource = draftSourceRef.current?.context === builderContext ? draftSourceRef.current : null;
    const draftReceipt = draftSource ? { ...draftSource.receipt } : null;
    const current = () => builderContext.isCurrent();
    setIsSaving(true); setAutoSaveStatus('saving');
    try {
      const scope = await resolveCourseWriteScope({ userId: user.id, userRole, requestedOrganizationId: organizationId });
      if (!current()) return false;
      if (scope.organizationId !== organizationId) throw new Error("Организация изменилась");
      const savedCourseId = await ensureCourseId();
      if (!current() || !savedCourseId) return false;
      const baseline = persistedLessonIdsRef.current;
      if (baseline?.context !== builderContext || baseline.courseId !== savedCourseId) throw new Error("Исходный список уроков не подтверждён. Повторно откройте курс перед сохранением.");
      const uncertainIds = uncertainIdsFor(savedCourseId);
      if (uncertainIds.size > 0) {
        if (!allowAmbiguityRead) throw new Error("Предыдущее сохранение не подтверждено. Нажмите «Сохранить курс» для проверки перед повторной записью.");
        const attemptedIds = [...uncertainIds];
        const foundIds = new Set<string>();
        for (let offset = 0; offset < attemptedIds.length; offset += 50) {
          const chunk = attemptedIds.slice(offset, offset + 50);
          const { data, error } = await supabase.from("lessons").select("id, course_id").eq("course_id", savedCourseId).in("id", chunk);
          if (!current()) return false;
          if (error) throw error;
          if (!Array.isArray(data) || new Set(data.map(row => row.id)).size !== data.length || data.some(row => typeof row.id !== "string" || row.course_id !== savedCourseId || !chunk.includes(row.id) || foundIds.has(row.id))) throw new Error("Не удалось подтвердить результат предыдущей записи уроков");
          for (const row of data) foundIds.add(row.id);
        }
        const confirmedScope = await resolveCourseWriteScope({ userId: user.id, userRole, requestedOrganizationId: organizationId });
        if (!current()) return false;
        if (confirmedScope.organizationId !== organizationId) throw new Error("Организация изменилась");
        for (const id of foundIds) baseline.ids.add(id);
        for (const id of attemptedIds) uncertainIds.delete(id);
      }
      const currentLessonIds = new Set(lessons.map(lesson => lesson.id));
      const removedKnownIds = [...baseline.ids].filter(id => !currentLessonIds.has(id));
      const { data: savedHead, error: headError } = await supabase.from("courses")
        .update({ title: courseTitle.trim(), description: courseDescription.trim() || null })
        .eq("id", savedCourseId).eq("organization_id", organizationId).select("id, organization_id").single();
      if (!current()) return false;
      if (headError) throw headError;
      if (savedHead?.id !== savedCourseId || savedHead.organization_id !== organizationId) throw new Error("Сохранение курса не подтверждено");

      // Reconcile only lessons actually observed or confirmed in this lifetime.
      // A concurrent or unseen server lesson must never be inferred deleted.
      if (removedKnownIds.length > 0) {
        const { error: deleteError } = await supabase.from("lessons").delete().eq("course_id", savedCourseId).in("id", removedKnownIds);
        if (!current()) return false;
        if (deleteError) throw deleteError;
      }

      if (lessons.length > 0 && savedCourseId) {
        // Split into two upsert batches:
        // - lessonsWithContent: content was loaded (or freshly created) → write everything
        // - lessonsMetaOnly: lazy placeholder → write metadata, KEEP existing content in DB
        const baseRow = (lesson: typeof lessons[number], index: number) => ({
          id: lesson.id, course_id: savedCourseId!, title: lesson.title, type: lesson.type,
          order_index: index, test_passing_score: lesson.testPassingScore ?? 60,
          test_questions_to_show: lesson.testQuestionsToShow ?? null,
          test_max_attempts: lesson.testMaxAttempts ?? null, test_max_attempts_per_day: lesson.testMaxAttemptsPerDay ?? null,
          test_show_answers: lesson.testShowAnswers ?? true,
          module_id: lesson.module_id ?? null,
          metadata: lesson.metadata ?? {},
        });
        const lessonsWithContent = lessons
          .map((l, i) => ({ l, i }))
          .filter(({ l }) => l.__contentLoaded !== false)
          .map(({ l, i }) => ({ ...baseRow(l, i), content: l.content || null }));
        const lessonsMetaOnly = lessons
          .map((l, i) => ({ l, i }))
          .filter(({ l }) => l.__contentLoaded === false)
          .map(({ l, i }) => baseRow(l, i));

        for (const row of [...lessonsWithContent, ...lessonsMetaOnly]) if (!baseline.ids.has(row.id)) uncertainIds.add(row.id);
        const upsertResults = await Promise.allSettled([
          lessonsWithContent.length > 0
            ? Promise.resolve().then(() => supabase.from("lessons").upsert(lessonsWithContent, { onConflict: "id" }))
            : Promise.resolve({ error: null } as any),
          lessonsMetaOnly.length > 0
            ? Promise.resolve().then(() => supabase.from("lessons").upsert(lessonsMetaOnly, { onConflict: "id" }))
            : Promise.resolve({ error: null } as any),
        ]);
        if (!current()) return false;
        // An acknowledged batch remains part of our exact baseline even if its
        // sibling fails or newer local edits keep the overall save dirty.
        for (const [index, result] of upsertResults.entries()) {
          if (result.status === "fulfilled" && !result.value.error) {
            for (const row of index === 0 ? lessonsWithContent : lessonsMetaOnly) { baseline.ids.add(row.id); uncertainIds.delete(row.id); }
          }
        }
        const rejectedBatch = upsertResults.find(result => result.status === "rejected");
        if (rejectedBatch?.status === "rejected") throw rejectedBatch.reason;
        const failedBatch = upsertResults.find(result => result.status === "fulfilled" && result.value.error);
        if (failedBatch?.status === "fulfilled") throw failedBatch.value.error;

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
        if (!current()) return false;
        const failed = results.some(result => result.status === 'rejected' || (result.value as { error?: unknown } | null)?.error);
        if (failed) throw new Error("Не все вопросы или вложения сохранены. Повторите сохранение.");
      }
      if (!current()) return false;
      persistedLessonIdsRef.current = { context: builderContext, courseId: savedCourseId, ids: currentLessonIds };
      if (revision !== localRevisionRef.current) {
        failedSaveRef.current = { context: builderContext, revision: localRevisionRef.current };
        setAutoSaveStatus('error');
        if (!silent) toast.info("Во время сохранения появились новые изменения. Сохраните их перед выходом.");
        return false;
      }
      confirmedSaveRef.current = { context: builderContext, courseId: savedCourseId, revision };
      if (!silent) toast.success(courseId ? "Курс обновлён" : "Курс создан");
      setHasUnsavedChanges(false); setAutoSaveStatus('saved');
      if (draftReceipt) {
        try {
          if (clearScopedBuilderDraft(draftReceipt) && draftSourceRef.current === draftSource) draftSource.receipt = { key: draftReceipt.key, raw: null };
        } catch { setDraftStatus("Курс сохранён; локальный черновик не удалён из-за недоступности хранилища."); }
      }
      if (!externalCourseId) {
        builderContext.prepareAdoption(savedCourseId);
        navigate(`/course-builder/${savedCourseId}`, { replace: true });
      }
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 3000);
      return true;
    } catch (error: unknown) {
      if (current()) {
        failedSaveRef.current = { context: builderContext, revision: localRevisionRef.current };
        setHasUnsavedChanges(true);
        saveCurrentDraft();
        const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
        toast.error("Сохранение не подтверждено: " + message); setAutoSaveStatus('error');
      }
      return false;
    } finally { if (savingRef.current === builderContext) savingRef.current = null; setIsSaving(false); }
  };
  saveCourseRef.current = saveCourse;

  const saveSingleLesson = async (lesson: Lesson, orderIndex: number) => {
    if (!builderContext.isCurrent() || !isDataLoaded || scopeError || !organizationId || !user || !userRole || savingRef.current === builderContext) return false;
    if (lesson.__contentLoaded === false || !latestStateRef.current.lessons.some(row => row === lesson)) return false;
    const revision = localRevisionRef.current;
    const current = () => builderContext.isCurrent() && revision === localRevisionRef.current && latestStateRef.current.lessons.some(row => row === lesson);
    savingRef.current = builderContext;
    setIsSaving(true);
    try {
      const scope = await resolveCourseWriteScope({ userId: user.id, userRole, requestedOrganizationId: organizationId });
      if (!current() || scope.organizationId !== organizationId) return false;
      const savedCourseId = await ensureCourseId();
      if (!current() || !savedCourseId) return false;
      const { data: existing, error: readError } = await supabase.from("lessons").select("id, course_id").eq("id", lesson.id).eq("course_id", savedCourseId).maybeSingle();
      if (!current()) return false;
      if (readError) throw readError;
      if (existing && (existing.id !== lesson.id || existing.course_id !== savedCourseId)) throw new Error("Не удалось подтвердить урок");
      const row = { title: lesson.title, type: lesson.type, content: lesson.content || null, order_index: orderIndex, test_passing_score: lesson.testPassingScore ?? 60, test_questions_to_show: lesson.testQuestionsToShow ?? null, test_max_attempts: lesson.testMaxAttempts ?? null, test_max_attempts_per_day: lesson.testMaxAttemptsPerDay ?? null, test_show_answers: lesson.testShowAnswers ?? true, module_id: lesson.module_id ?? null, metadata: lesson.metadata ?? {} };
      const uncertainty = uncertainIdsFor(savedCourseId);
      if (!persistedLessonIdsRef.current?.ids.has(lesson.id)) uncertainty.add(lesson.id);
      const write = existing ? supabase.from("lessons").update(row).eq("id", lesson.id).eq("course_id", savedCourseId)
        : supabase.from("lessons").insert({ ...row, id: lesson.id, course_id: savedCourseId });
      const { data, error } = await write.select("id, course_id").single();
      if (!builderContext.isCurrent()) return false;
      if (error) throw error;
      if (data?.id !== lesson.id || data.course_id !== savedCourseId) throw new Error("Сохранение урока не подтверждено");
      const baseline = persistedLessonIdsRef.current;
      if (baseline?.context === builderContext && baseline.courseId === savedCourseId) baseline.ids.add(lesson.id);
      uncertainty.delete(lesson.id);
      if (!current()) return false;
      toast.success(existing ? "Лекция обновлена" : "Лекция сохранена");
      return true;
    } catch (error: unknown) { if (builderContext.isCurrent()) toast.error("Сохранение не подтверждено: " + (error instanceof Error ? error.message : String(error))); return false; }
    finally { if (savingRef.current === builderContext) savingRef.current = null; setIsSaving(false); }
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
    activeLessonId, setActiveLessonId, scrollToLesson, expandLesson, loadLessonContent, lessonContentStatus, draftStatus,
    isCurrentContext: builderContext.isCurrent,
    getCommittedCourseId: () => builderContext.isCurrent() && confirmedSaveRef.current?.context === builderContext
      && confirmedSaveRef.current.revision === localRevisionRef.current ? confirmedSaveRef.current.courseId : null,
    // Modules
    modules, createModule, renameModule, deleteModule, toggleModuleCollapsed,
    reorderModules, moveLessonToModule, collapseAllModules, expandAllModules,
  };
}
