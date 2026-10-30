import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { cacheCourseData, getCachedCourseData, captureOfflineActor, isOfflineActorCurrent,
  rememberOfflineScope, getOfflineScope, forgetOfflineScope, mayUseOfflineFallback, isOfflineAccessDenied } from "@/utils/courseCache";
import { setupOfflineSyncListeners } from "@/utils/offlineSync";
import { LearningProgressFence, fetchOwnLearningProgress, saveOwnLearningProgress, snapshotRun, isLearningProgressReset, type LearningProgressRun, type LearningProgressSnapshot } from "@/lib/learningProgress";
import { showLimitToast } from "@/utils/limitToast";
import { parseLessonContent } from "@/components/course-builder/block-editor/parsers";
import type { ContentBlock } from "@/components/course-builder/block-editor/types";
import { generateAttestationProtocol } from "@/utils/generateAttestationProtocol";
import { getAdminViewData, isAdminViewActive } from "@/utils/adminViewMode";
import { fetchCourseLibraryShell } from "@/api/courseLibrary";
import { COURSE_LESSON_ORDER_VERSION, orderCourseLessons } from "@/lib/courseLessonOrder";
import { fetchPostpaidAccessProfile } from "@/lib/postpaidAccess";
import { useCourseFileDeliveryMode } from "@/hooks/useCourseFileDeliveryMode";
import { buildLessonCompletionIndex, isCourseLessonAccessible } from './lessonAccess';

import type { Lesson, Course, LessonProgress, CourseMaterialFile } from "./types";
import { useLessonTTS } from "./useLessonTTS";
import { useLessonChat } from "./useLessonChat";
import { useLessonTest } from "./useLessonTest";
import { useLessonVideo } from "./useLessonVideo";
import { markLessonProgress } from "./markLessonProgress";
import { getOptionText } from "./types";

/**
 * Public re-export — kept for backwards compatibility with tests and callers.
 * Now delegates to the unified parser used everywhere in the app.
 */
export function parseContentToBlocks(content: string): ContentBlock[] {
  return parseLessonContent(content);
}

export function useCourseLearning() {
  const { courseId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const contentRef = useRef<HTMLDivElement>(null);
  const lessonStartTimeRef = useRef<number>(Date.now());

  // Admin/manager "view as student" mode — read once per mount.
  // While active: load target student's data, skip video-id check, never write to DB.
  const adminViewRef = useRef(getAdminViewData());
  const adminView = adminViewRef.current;
  const isAdminView = adminView !== null;
  const effectiveUserId = adminView?.userId || user?.id;
  const identityKey = JSON.stringify([user?.id, effectiveUserId, courseId, isAdminView, !!authLoading, captureOfflineActor(user?.id)]);
  const identityRef = useRef({ key: identityKey, generation: 0 });
  if (identityRef.current.key !== identityKey) identityRef.current = { key: identityKey, generation: identityRef.current.generation + 1 };
  const requestRef = useRef(0);
  const progressMutationRef = useRef(0);
  const progressPollRequestRef = useRef(0);
  const courseFetchRequestRef = useRef<number | null>(null);
  const progressAuthorityRef = useRef({ identityKey, fence: new LearningProgressFence() });
  if (progressAuthorityRef.current.identityKey !== identityKey) progressAuthorityRef.current = { identityKey, fence: new LearningProgressFence() };
  const [learningRun, setLearningRun] = useState<LearningProgressRun | null>(null);
  const captureProgress = () => {
    if (isAdminView || isOfflineMode || !privateVisible) return null;
    const authority = progressAuthorityRef.current, captured = authority.fence.capture();
    const actor = user?.id, revision = captureOfflineActor(actor);
    if (!captured || !actor || !learningRun || captured.run.enrollmentId !== learningRun.enrollmentId
      || captured.run.userId !== actor || captured.run.userId !== learningRun.userId || captured.run.courseId !== courseId
      || captured.run.courseId !== learningRun.courseId || captured.run.epoch !== learningRun.epoch) return null;
    return { ...captured, current: () => authority === progressAuthorityRef.current && captured.current() && isOfflineActorCurrent(actor, revision) };
  };
  const handleProgressReset = async (error: unknown) => {
    if (!isLearningProgressReset(error)) return false;
    progressAuthorityRef.current.fence.invalidate(); progressMutationRef.current++; requestRef.current++;
    setLearningRun(null); cacheCandidate.current = null;
    if (user && effectiveUserId && courseId) forgetOfflineScope(user.id, effectiveUserId, "learner", courseId);
    setLoadedGeneration(-1); setLoading(true);
    toast.info("Организация сбросила учебный прогресс. Загружаем актуальное состояние.");
    await fetchCourseData();
    return true;
  };
  const [loadedGeneration, setLoadedGeneration] = useState(-1);
  const [settledGeneration, setSettledGeneration] = useState(-1);
  const privateVisible = !authLoading && !!user && loadedGeneration === identityRef.current.generation;

  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [lessonProgress, setLessonProgress] = useState<LessonProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [lessonAttachments, setLessonAttachments] = useState<Record<string, CourseMaterialFile[]>>({});
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [offlineCachedAt, setOfflineCachedAt] = useState<number | undefined>(undefined);
  const [courseDocuments, setCourseDocuments] = useState<CourseMaterialFile[]>([]);
  const [materialsError, setMaterialsError] = useState(false);
  const cacheCandidate = useRef<{ generation: number; actorId: string; actorRevision: number; effectiveUserId: string; course: Course; lessons: Lesson[]; progress: LessonProgress[]; attachments: Record<string, CourseMaterialFile[]>; documents: CourseMaterialFile[]; enrollmentId: string | null; run: LearningProgressRun | null } | null>(null);
  const { view: courseFileDeliveryMode } = useCourseFileDeliveryMode({
    courseId: privateVisible ? course?.id : null,
    organizationId: privateVisible ? course?.organization_id : null,
    effectiveUserId: effectiveUserId ?? null,
    accessMode: isAdminView ? "staff_preview" : "learner",
  }, privateVisible && !isOfflineMode);

  // A successful server classification, not a URL or a client copy flag, permits
  // a new legacy offline snapshot. Frozen bytes and their locators are not cached.
  useEffect(() => {
    if (!privateVisible || isOfflineMode || !user || !effectiveUserId || !courseId) return;
    const mode = isAdminView ? "preview" as const : "learner" as const;
    const candidate = cacheCandidate.current;
    if (courseFileDeliveryMode.state !== "legacy") {
      forgetOfflineScope(user.id, effectiveUserId, mode, courseId);
      return;
    }
    if (!candidate || candidate.generation !== identityRef.current.generation || candidate.actorId !== user.id
      || candidate.effectiveUserId !== effectiveUserId || candidate.course.id !== courseId || !candidate.enrollmentId
      || !isOfflineActorCurrent(candidate.actorId, candidate.actorRevision)
      || (!isAdminView && (!candidate.run || candidate.run.epoch !== progressAuthorityRef.current.fence.capture()?.run.epoch))) return;
    const scope = rememberOfflineScope({ actorId: candidate.actorId, effectiveUserId, mode,
      organizationId: candidate.course.organization_id ?? "" }, courseId, candidate.actorRevision);
    if (scope) void cacheCourseData(scope, courseId, { ...candidate.course,
      _lessonOrderVersion: COURSE_LESSON_ORDER_VERSION, _fileDeliveryMode: "legacy", _fileDeliveryAuthority: 1,
      _learningProgressEpoch: candidate.run?.epoch ?? null, _learningEnrollmentId: candidate.enrollmentId },
      candidate.lessons, candidate.progress, candidate.attachments, candidate.documents).catch(() => {});
  }, [privateVisible, isOfflineMode, user?.id, effectiveUserId, courseId, isAdminView, courseFileDeliveryMode, learningRun]);

  // Lazy-loaded lesson content (PERF: heavy slider lessons can hold 8-11 MB
  // base64 each → we don't fetch `content` in the initial lessons list and
  // pull it on demand for the currently opened lesson.)
  const [lessonContents, setLessonContents] = useState<Record<string, string | null>>({});
  const contentLoadingRef = useRef<Set<string>>(new Set());

  // Refs для устранения гонки при последовательном autoAdvance:
  // completedIdsRef всегда содержит актуальный набор завершённых lesson_id,
  // markInFlightRef — мьютекс для параллельных markLessonComplete,
  // courseCompletionStartedRef — защита от повторного handleCourseCompletion.
  const completedIdsRef = useRef<Set<string>>(new Set());
  const markInFlightRef = useRef<Set<string>>(new Set());
  const courseCompletionStartedRef = useRef<{ value: boolean }>({ value: false });

  // Tooltip state for mobile progress bar
  const [tooltipLesson, setTooltipLesson] = useState<{ index: number; title: string } | null>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const lessonButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Feedback state
  const [feedbackAnswer, setFeedbackAnswer] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);

  const baseLesson = privateVisible ? lessons[currentLessonIndex] : undefined;
  // Merge lazy-loaded content into currentLesson so all downstream consumers
  // (TTS, chat, slider viewer) read a normal lesson shape.
  const currentLesson = baseLesson
    ? ({ ...baseLesson, content: baseLesson.content ?? lessonContents[baseLesson.id] ?? null } as Lesson)
    : (undefined as unknown as Lesson);
  const completedCount = lessonProgress.filter(p => p.completed).length;
  const progressPercent = lessons.length > 0 ? (completedCount / lessons.length) * 100 : 0;
  const completionIndex = useMemo(
    () => buildLessonCompletionIndex(lessons, lessonProgress),
    [lessons, lessonProgress],
  );

  // Держим completedIdsRef синхронно с lessonProgress: сброс, повторная загрузка,
  // обновления от useLessonTest — всё попадает в ref, из которого читает
  // markLessonProgress вместо устаревшего замыкания.
  useEffect(() => {
    completedIdsRef.current = new Set(
      lessonProgress.filter(p => p.completed).map(p => p.lesson_id),
    );
  }, [lessonProgress]);

  // Сбрасываем "one-shot" защиту завершения курса при смене курса/enrollment,
  // чтобы повторный вход в тот же курс мог снова корректно завершиться.
  useEffect(() => {
    courseCompletionStartedRef.current = { value: false };
    markInFlightRef.current = new Set();
  }, [enrollmentId]);

  // TTS/chat consume blocks only for text lessons. In particular, slider JSON
  // must not be reparsed as legacy markdown on every progress/input render.
  const contentBlocks = useMemo<ContentBlock[]>(
    () => currentLesson?.type === 'text' && currentLesson.content
      ? parseContentToBlocks(currentLesson.content) : [],
    [identityKey, currentLesson?.id, currentLesson?.type, currentLesson?.content],
  );

  // Lazy fetch lesson content when opened (and prefetch the next one).
  const loadLessonContent = useCallback(async (lessonId: string) => {
    if (!lessonId) return;
    const generation = identityRef.current.generation;
    const actorId = user?.id;
    const actorRevision = captureOfflineActor(actorId);
    const current = () => generation === identityRef.current.generation && !!actorId && isOfflineActorCurrent(actorId, actorRevision);
    if (contentLoadingRef.current.has(lessonId)) return;
    contentLoadingRef.current.add(lessonId);
    try {
      const { data, error } = await supabase
        .from('lessons').select('content').eq('id', lessonId).maybeSingle();
      if (error) throw error;
      if (!current()) return;
      setLessonContents(prev => (prev[lessonId] !== undefined ? prev : { ...prev, [lessonId]: (data?.content ?? null) as string | null }));
    } catch (e) {
      console.error('[loadLessonContent] error:', e);
    } finally {
      if (current()) contentLoadingRef.current.delete(lessonId);
    }
  }, [user?.id]);

  useEffect(() => {
    const cur = lessons[currentLessonIndex];
    if (!cur) return;
    if (cur.content == null && lessonContents[cur.id] === undefined) void loadLessonContent(cur.id);
    const next = lessons[currentLessonIndex + 1];
    if (next && next.content == null && lessonContents[next.id] === undefined) void loadLessonContent(next.id);
  }, [currentLessonIndex, lessons, lessonContents, loadLessonContent]);



  // Sub-hooks — always use effective user id so admin sees student's video state
  const videoHook = useLessonVideo({ userId: effectiveUserId, currentLesson,
    learningRun: isAdminView ? null : learningRun, captureProgress, onProgressReset: handleProgressReset, readOnlyPreview: isAdminView });

  const applyProgressSnapshot = (snapshot: LearningProgressSnapshot) => {
    const previous = progressAuthorityRef.current.fence.capture()?.run;
    const run = snapshotRun(snapshot);
    if (!progressAuthorityRef.current.fence.accept(run)) return false;
    const changed = !previous || previous.enrollmentId !== run.enrollmentId || previous.epoch !== run.epoch;
    if (changed) {
      progressMutationRef.current++; cacheCandidate.current = null;
      if (user && effectiveUserId && courseId) forgetOfflineScope(user.id, effectiveUserId, "learner", courseId);
      markInFlightRef.current = new Set(); courseCompletionStartedRef.current = { value: false };
      setCurrentLessonIndex(0); setIsTransitioning(false); videoHook.setVideoWatchProgress(0);
      setFeedbackSent(false); setFeedbackSending(false);
      lessonStartTimeRef.current = Date.now();
    }
    if (cacheCandidate.current && cacheCandidate.current.run?.epoch === run.epoch) {
      cacheCandidate.current = { ...cacheCandidate.current, progress: snapshot.lesson_progress, run };
    }
    completedIdsRef.current = new Set(snapshot.lesson_progress.filter(row => row.completed).map(row => row.lesson_id));
    setLearningRun(run); setLessonProgress(snapshot.lesson_progress); setEnrollmentId(run.enrollmentId);
    return true;
  };

  const saveLessonTime = useCallback(async (lessonId?: string) => {
    if (isAdminView) return;
    const lid = lessonId || currentLesson?.id, captured = captureProgress();
    if (!lid || !captured) return;
    const elapsed = Math.floor((Date.now() - lessonStartTimeRef.current) / 1000);
    lessonStartTimeRef.current = Date.now();
    if (elapsed <= 0 || elapsed > 7200) return;
    try {
      await saveOwnLearningProgress(captured.run, lid, { seconds: elapsed });
    } catch (error) { if (captured.current()) await handleProgressReset(error); }
  }, [currentLesson?.id, user?.id, enrollmentId, isAdminView, learningRun, isOfflineMode, privateVisible]);

  const handleCourseCompletion = async (testScoreData?: { score: number; max: number }) => {
    if (isAdminView) return; // never complete the student's course in admin view
    if (!course || !user || !courseId) return;
    const captured = captureProgress();
    if (!captured) return;
    try {
      const { data: profile } = await supabase.from('profiles').select('full_name, organization_id').eq('user_id', user.id).maybeSingle();
      if (!captured.current() || !profile?.organization_id) return;

      const { data: org } = await supabase.from('organizations').select('id, name, director_name, director_position, subscription_plan').eq('id', profile.organization_id).single();
      if (!captured.current() || !org) return;

      const planInfo = (await import('@/constants/subscriptionPlans')).getPlanInfo(org.subscription_plan as Parameters<typeof import('@/constants/subscriptionPlans').getPlanInfo>[0]);
      const postpaid = await fetchPostpaidAccessProfile(profile.organization_id);
      if (!captured.current()) return;
      if (!postpaid.active && planInfo.limits.maxTrainedPerMonth !== -1) {
        const { data: countData, error: countError } = await supabase.rpc('count_org_completions_this_month' as never, { org_id: profile.organization_id } as never);
        if (!captured.current()) return;
        const rawCount: unknown = countData;
        const trainedCount = typeof rawCount === 'number' || (typeof rawCount === 'string' && rawCount.trim() !== '') ? Number(rawCount) : NaN;
        if (countError || !Number.isSafeInteger(trainedCount) || trainedCount < 0) {
          showLimitToast({ allowed: false, reason: "verification_error", message: 'Не удалось проверить ограничения завершения курса. Повторите проверку.' });
          return;
        }
        if (trainedCount >= planInfo.limits.maxTrainedPerMonth) {
          showLimitToast({ allowed: false, reason: "quota", message: `Лимит тарифа "${planInfo.name}": ${planInfo.limits.maxTrainedPerMonth} обученных в месяц. Перейдите на следующий тариф.` });
          return;
        }
      }

      if (!enrollmentId) {
        toast.error('Не удалось определить запись на курс. Обновите страницу и попробуйте ещё раз.');
        return;
      }

      // Validate every lesson and complete the enrollment in one server-side
      // transaction. Only authoritative current lesson progress can complete
      // this run; viewing an earlier passed attempt never repairs completion.
      const { data: updatedEnrollment, error: enrollmentUpdateErr } = await supabase.rpc(
        'complete_own_course_enrollment_at_epoch' as never,
        { p_enrollment_id: enrollmentId, p_expected_epoch: captured.run.epoch } as never,
      );

      if (!captured.current()) return;
      if (enrollmentUpdateErr && await handleProgressReset(enrollmentUpdateErr)) return;
      const completed = updatedEnrollment as { id?: string; status?: string; progress?: number; learning_progress_epoch?: string } | null;
      if (enrollmentUpdateErr || !completed || completed.id !== captured.run.enrollmentId || completed.status !== 'completed'
        || completed.progress !== 100 || completed.learning_progress_epoch !== captured.run.epoch) {
        console.error('[course-completion] failed to mark enrollment completed:', enrollmentUpdateErr);
        toast.error('Не удалось завершить курс. Попробуйте ещё раз.');
        return;
      }

      setLessonProgress(lessons.map(lesson => ({ lesson_id: lesson.id, completed: true })));

      const protocolName = await generateAttestationProtocol({
        organizationId: org.id, organizationName: org.name, directorName: org.director_name, directorPosition: org.director_position,
        studentName: profile.full_name || 'Слушатель', courseName: course.title, courseDuration: course.duration,
        completedAt: new Date(), testScore: testScoreData?.score, testMaxScore: testScoreData?.max,
      });
      if (!captured.current()) return;
      if (protocolName) toast.success('Курс завершён! Протокол аттестационной комиссии создан.');

      // Best-effort email/edge notification. Failure here MUST NOT undo the completion
      // or the DB-triggered organization notification.
      const notifyKey = `notified:course-completion:${enrollmentId}:${courseId}:${captured.run.epoch}`;
      const alreadyNotified = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(notifyKey);
      if (!alreadyNotified) {
        try {
          const result = await safeInvoke('notify-course-completion', {
            body: { enrollment_id: enrollmentId, course_id: courseId, user_id: user.id },
          });
          if (result.error) {
            console.error('[course-completion] notify edge error:', result.error);
          } else {
            try { sessionStorage.setItem(notifyKey, '1'); } catch (_) { /* ignore */ }
          }
        } catch (e) {
          console.error('[course-completion] notify edge exception:', e);
        }
      }


    } catch (error) {
      if (!captured.current() || await handleProgressReset(error)) return;
      console.error('Error handling course completion:', error);
      toast.error('Не удалось проверить условия завершения курса. Повторите попытку.');
    }
  };

  const testHook = useLessonTest({
    currentLesson, user, lessons, lessonProgress, completedCount,
    enrollmentId, courseId, course, setLessonProgress,
    saveLessonTime: () => saveLessonTime(),
    handleCourseCompletion, learningEpoch: isAdminView ? null : learningRun?.epoch ?? null,
    onProgressReset: handleProgressReset,
    isProgressCurrent: () => !!captureProgress(),
  });

  const ttsHook = useLessonTTS({
    currentLesson, currentLessonIndex, contentBlocks,
    testQuestions: testHook.testQuestions,
  });

  const chatGeneration = identityRef.current.generation;
  const chatActorRevision = captureOfflineActor(user?.id);
  const chatHook = useLessonChat({
    contextKey: identityKey,
    isContextCurrent: () => privateVisible && chatGeneration === identityRef.current.generation && !!user && isOfflineActorCurrent(user.id, chatActorRevision),
    course: privateVisible ? course : null, currentLesson, contentBlocks,
  });

  const isLessonCompleted = (lessonId: string) => completionIndex.completedIds.has(lessonId);

  const isLessonAccessible = (index: number, completedIds?: ReadonlySet<string>): boolean => {
    return Number.isInteger(index) && index >= 0 && index < lessons.length
      && isCourseLessonAccessible(lessons, index, course?.sequential_lessons, completionIndex, completedIds);
  };

  const navigationView = useRef({ identityKey, lessons, sequential: course?.sequential_lessons, completionIndex, privateVisible });
  navigationView.current = { identityKey, lessons, sequential: course?.sequential_lessons, completionIndex, privateVisible };
  const navigationOperation = useRef(0);
  const navigationMounted = useRef(true);
  useEffect(() => { navigationMounted.current = true; return () => { navigationMounted.current = false; navigationOperation.current++; }; }, []);
  const captureNavigation = () => {
    const authority = progressAuthorityRef.current, current = authority.fence.captureRevision();
    return () => navigationMounted.current && authority === progressAuthorityRef.current && current();
  };
  const goToLesson = (index: number, blockedMessage = 'Этот урок пока недоступен. Пройдите предыдущие уроки.') => {
    const targetId = lessons[index]?.id, sourceId = lessons[currentLessonIndex]?.id;
    if (!targetId || index === currentLessonIndex) return;
    const current = captureNavigation();
    const accessibleNow = () => {
      const view = navigationView.current;
      return current() && view.identityKey === identityKey && view.privateVisible
        && view.lessons[index]?.id === targetId && view.lessons[currentLessonIndex]?.id === sourceId
        // A just-confirmed save updates this set before React renders. Never
        // freeze the old completion set into the delayed navigation callback.
        && isCourseLessonAccessible(view.lessons, index, view.sequential, view.completionIndex, completedIdsRef.current);
    };
    if (!accessibleNow()) { toast.error(blockedMessage); return; }
    const operation = ++navigationOperation.current;
    setIsTransitioning(true); videoHook.setVideoWatchProgress(0);
    setTimeout(() => {
      if (!current() || operation !== navigationOperation.current) return;
      // Progress, locks or schedules may change during the transition, even
      // within the same run. Previous/swipe/direct/next share this final gate.
      if (accessibleNow()) setCurrentLessonIndex(index);
      else toast.error(blockedMessage);
      setIsTransitioning(false);
    }, 300);
  };
  const goToNextLesson = () => goToLesson(currentLessonIndex + 1, 'Сначала завершите текущий урок');
  const goToPrevLesson = () => goToLesson(currentLessonIndex - 1);

  const markLessonComplete = async (autoAdvance = true) => {
    if (!currentLesson || !user) return;
    if (isAdminView) {
      // Admin preview — just navigate forward without writing progress.
      if (autoAdvance) goToNextLesson();
      return;
    }

    const captured = captureProgress();
    if (!captured) {
      if (progressAuthorityRef.current.identityKey === identityKey && (isOfflineMode || !learningRun)) toast.info("Подключитесь к Интернету, чтобы подтвердить актуальный прогресс.");
      return;
    }
    const lessonId = currentLesson.id;
    progressMutationRef.current++; requestRef.current++;
    let saved: LearningProgressSnapshot | null = null;
    await markLessonProgress({
      lessonId, userId: user.id, enrollmentId, totalLessons: lessons.length, autoAdvance,
      state: { inFlight: markInFlightRef.current, completed: completedIdsRef.current, courseCompletionStarted: courseCompletionStartedRef.current },
      deps: {
        isCurrent: captured.current,
        saveLessonTime: () => saveLessonTime(),
        upsertLessonProgress: async () => {
          try {
            saved = await saveOwnLearningProgress(captured.run, lessonId, { completed: true });
            return { error: null };
          } catch (error) { if (captured.current()) await handleProgressReset(error); return { error }; }
        },
        // The guarded RPC already computed the enrollment from actual server rows.
        updateEnrollmentProgress: async () => ({ error: captured.current() ? null : new Error("LEARNING_PROGRESS_RESET") }),
        handleCourseCompletion: () => handleCourseCompletion(),
        goToNextLesson: () => { if (captured.current()) goToNextLesson(); },
        onProgressUpdated: () => { if (captured.current() && saved) applyProgressSnapshot(saved); },
        toastSuccess: (msg) => { if (captured.current()) toast.success(msg); },
        toastError: (msg) => { if (captured.current()) toast.error(msg); },
      },
    });
  };

  const resetCourseProgress = async () => {
    if (isAdminView) { toast.info('Сброс прогресса недоступен в режиме просмотра'); return; }
    if (!user || !courseId) return;
    // A learner cannot delete historical attempts or reinterpret a staff reset.
    toast.info('Сброс учебного прогресса выполняет ваша организация. Обновляем текущее состояние.');
    await fetchCourseData();
  };

  const submitFeedback = async () => {
    if (isAdminView) { toast.info('Отправка отзывов недоступна в режиме просмотра'); return; }
    if (!currentLesson || !user || !courseId || !feedbackAnswer.trim()) return;
    const captured = captureProgress(); if (!captured) return;
    setFeedbackSending(true);
    try {
      const { data: courseData } = await supabase.from('courses').select('organization_id').eq('id', courseId).single();
      if (!captured.current()) return;
      if (!courseData?.organization_id) { toast.error('Не удалось определить организацию'); setFeedbackSending(false); return; }
      const messageContent = `📋 Обратная связь (урок "${currentLesson.title}"): ${feedbackAnswer.trim()}`;
      const { error } = await supabase.from('org_student_messages').insert({
        organization_id: courseData.organization_id, student_user_id: user.id, sender_user_id: user.id, content: messageContent,
      });
      if (!captured.current()) return;
      if (error) throw error;
      setFeedbackSent(true);
      toast.success('Ваш ответ отправлен');
      await markLessonComplete(false);
    } catch (err) { if (captured.current()) { console.error('Feedback submit error:', err); toast.error('Ошибка отправки ответа'); } }
    finally { if (captured.current()) setFeedbackSending(false); }
  };

  // Data fetching
  useEffect(() => {
    setCourse(null); setLessons([]); setLessonProgress([]); setLessonAttachments({}); setCourseDocuments([]); setMaterialsError(false);
    setLessonContents({}); setEnrollmentId(null); setCurrentLessonIndex(0);
    setIsOfflineMode(false); setOfflineCachedAt(undefined); setLoadedGeneration(-1); setSettledGeneration(-1);
    contentLoadingRef.current = new Set();
    setLoading(!!user);
    if (courseId && user && !authLoading) void fetchCourseData();
    return () => { requestRef.current += 1; };
  }, [identityKey]);
  useEffect(() => {
    setFeedbackAnswer(''); setFeedbackSent(false);
  }, [currentLesson?.id]);
  useEffect(() => { if (contentRef.current) contentRef.current.scrollTo({ top: 0, behavior: 'smooth' }); }, [currentLessonIndex]);
  useEffect(() => {
    if (isMobile && lessonButtonRefs.current[currentLessonIndex]) {
      lessonButtonRefs.current[currentLessonIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentLessonIndex, isMobile]);
  useEffect(() => {
    if (!privateVisible || isAdminView) return;
    const scope = user && effectiveUserId && courseId ? getOfflineScope(user.id, effectiveUserId, 'learner', courseId) : null;
    if (!scope || !courseId) return;
    const generation = identityRef.current.generation;
    const cleanup = setupOfflineSyncListeners(scope, courseId, () => generation === identityRef.current.generation); return cleanup;
  }, [privateVisible, identityKey, isAdminView, learningRun?.epoch]);

  // Save time on lesson switch
  const prevLessonIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentLesson?.id && prevLessonIdRef.current && prevLessonIdRef.current !== currentLesson.id) {
      saveLessonTime(prevLessonIdRef.current);
    }
    prevLessonIdRef.current = currentLesson?.id || null;
    lessonStartTimeRef.current = Date.now();
  }, [currentLesson?.id]);

  // Authenticated, epoch-bound saves only. An anonymous beacon must not recreate a reset run.
  useEffect(() => {
    if (isAdminView || !user || !learningRun) return;
    const hidden = () => { if (document.visibilityState === "hidden") void saveLessonTime(); };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [user?.id, learningRun, saveLessonTime, isAdminView]);

  useEffect(() => {
    if (!user || authLoading || isAdminView) return;
    const refresh = () => { if (document.visibilityState !== "hidden") void fetchCourseData(); };
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(() => { void pollCourseProgress(); }, 30000);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh); window.clearInterval(timer); };
  }, [identityKey, privateVisible, isOfflineMode, learningRun?.epoch]);

  const fetchCourseData = async () => {
    if (!courseId || !user || authLoading || !effectiveUserId) return;
    const generation = identityRef.current.generation;
    const request = ++requestRef.current;
    courseFetchRequestRef.current = request;
    const mutation = progressMutationRef.current;
    const actorId = user.id;
    const actorRevision = captureOfflineActor(actorId);
    if (actorRevision === null) return;
    const current = () => generation === identityRef.current.generation && request === requestRef.current && mutation === progressMutationRef.current
      && isOfflineActorCurrent(actorId, actorRevision);
    const mode = isAdminView ? 'preview' as const : 'learner' as const;
    const requestedLibraryOnly = typeof window !== "undefined"
      && new URLSearchParams(window.location.search).get("view") === "library";
    try {
      const lookupUserId = effectiveUserId; // target student in admin view, otherwise current user

      if (requestedLibraryOnly) {
        const [shell, filePolicy] = await Promise.all([
          fetchCourseLibraryShell(courseId || ""),
          supabase.from('courses').select('organization_id, allow_materials_download').eq('id', courseId).maybeSingle(),
        ]);
        if (!current()) return;
        setCourse({
          id: shell.courseId,
          organization_id: filePolicy.error ? null : filePolicy.data?.organization_id ?? null,
          allow_materials_download: !filePolicy.error && filePolicy.data?.allow_materials_download === true,
          title: shell.title,
          description: null,
          duration: null,
          landing_content: { electronic_library: { enabled: true } },
        });
        setLessons([]);
        setLessonProgress([]);
        setLessonAttachments({}); setCourseDocuments([]); setMaterialsError(false);
        setEnrollmentId(null);
        setIsOfflineMode(false);
        setLoadedGeneration(generation);
        return;
      }

      const [courseResult, lessonsResult, enrollmentResult, modulesResult] = await Promise.all([
        supabase
          .from('courses')
          .select('id, organization_id, title, description, duration, sequential_lessons, allow_video_seek, skip_video_identification, allow_materials_download, landing_content')
          .eq('id', courseId)
          .single(),
        supabase
          .from('lessons')
          .select('id, course_id, title, type, order_index, module_id, is_locked, test_passing_score, test_questions_to_show, test_show_answers, ai_avatar_name, ai_avatar_image_url, ai_avatar_voice_id, ai_avatar_system_prompt, ai_avatar_greeting, ai_avatar_subject, ai_avatar_style, ai_avatar_session_minutes, ai_avatar_model')
          .eq('course_id', courseId)
          .order('order_index'),
        lookupUserId
          ? isAdminView
            ? supabase.from('enrollments').select('*').eq('course_id', courseId).eq('user_id', lookupUserId).maybeSingle()
            : fetchOwnLearningProgress(courseId, lookupUserId).then(snapshot => ({ data: snapshot.enrollment, error: null, snapshot }))
          : Promise.resolve({ data: null, error: null }),
        supabase.from('course_modules').select('id, order_index').eq('course_id', courseId).order('order_index'),
      ]);
      if (!current()) return;
      if (courseResult.error) throw courseResult.error;
      if (lessonsResult.error) throw lessonsResult.error;
      if (modulesResult.error) throw modulesResult.error;
      if (enrollmentResult.error) throw enrollmentResult.error;
      const courseData = courseResult.data;
      setCourse(courseData);
      setIsOfflineMode(false);

      // Existing current enrollment/status/expiry checks below govern learning.
      // A newly submitted photo is pending evidence and cannot grant or revoke course access.
      let lessonsData = orderCourseLessons(lessonsResult.data || [], modulesResult.data || []);

      // Apply module access schedules + per-user overrides (use target student's id in admin view)
      try {
        const moduleIds = Array.from(new Set(lessonsData.map((l: any) => l.module_id).filter(Boolean)));
        if (moduleIds.length > 0 && lookupUserId) {
          const [schedRes, ovrRes] = await Promise.all([
            supabase.from("module_access_schedules" as never).select("module_id, unlock_at").in("module_id", moduleIds as string[]),
            supabase.from("module_access_overrides" as never).select("module_id, unlock_at").in("module_id", moduleIds as string[]).eq("user_id", lookupUserId),
          ]);
          if (!current()) return;
          const schedMap = new Map<string, string>();
          ((schedRes.data as any[]) || []).forEach((r) => schedMap.set(r.module_id, r.unlock_at));
          const ovrMap = new Map<string, string | null>();
          ((ovrRes.data as any[]) || []).forEach((r) => ovrMap.set(r.module_id, r.unlock_at));
          lessonsData = lessonsData.map((l: any) => {
            if (!l.module_id) return l;
            const effective = ovrMap.has(l.module_id) ? ovrMap.get(l.module_id)! : (schedMap.get(l.module_id) || null);
            return effective ? { ...l, locked_until: effective } : l;
          });
        }
      } catch (e) { console.warn("[module access] load failed", e); }

      setLessons(lessonsData);

      const enrollment = enrollmentResult.data;
      const authoritativeProgress = !isAdminView && 'snapshot' in enrollmentResult
        ? enrollmentResult.snapshot as LearningProgressSnapshot : null;
      if (enrollment && (enrollment.user_id !== lookupUserId || enrollment.course_id !== courseId)) {
        forgetOfflineScope(actorId, effectiveUserId, mode, courseId);
        setCourse(null); setLessons([]); setLessonProgress([]); setLessonAttachments({}); setCourseDocuments([]); setMaterialsError(false); setEnrollmentId(null); setLoadedGeneration(-1);
        toast.error('Доступ к курсу не подтверждён'); navigate('/student'); return;
      }
      if (!isAdminView && enrollment && !['active', 'completed'].includes(enrollment.status || '')) {
        forgetOfflineScope(actorId, effectiveUserId, mode, courseId);
        setCourse(null); setLessons([]); setLessonProgress([]); setLessonAttachments({}); setCourseDocuments([]); setMaterialsError(false); setEnrollmentId(null); setLoadedGeneration(-1);
        toast.error('Доступ к курсу не подтверждён'); navigate('/student'); return;
      }
      if (!enrollment) {
        forgetOfflineScope(actorId, effectiveUserId, mode, courseId);
        if (isAdminView) {
          // Admin preview: continue without enrollment so admin can browse the course content.
          toast.info('Просмотр курса в режиме администратора', { description: 'Прогресс не сохраняется' });
        } else {
          toast.error('Вы не записаны на этот курс', { description: 'Отправьте заявку на запись через каталог курсов' });
          navigate('/student');
          return;
        }
      }

      if (!isAdminView && enrollment && (enrollment as Record<string, unknown>).expires_at) {
        const expiresAt = new Date((enrollment as Record<string, unknown>).expires_at as string);
        if (expiresAt < new Date() && enrollment.status !== 'completed') {
          forgetOfflineScope(actorId, effectiveUserId, mode, courseId);
          toast.error('Доступ к курсу истёк', { description: 'Срок доступа к этому курсу закончился. Обратитесь к администратору.' });
          navigate('/student');
          return;
        }
      }

      if (enrollment) {
        setEnrollmentId(enrollment.id);
        // Don't write access logs in admin preview mode.
        if (!isAdminView && user) {
          // This is a best-effort audit write, not an access prerequisite.
          // A slow profile lookup must not hold the authorized lesson screen.
          void (async () => {
            const orgId = await supabase.from('profiles').select('organization_id').eq('user_id', user.id).maybeSingle();
            if (generation !== identityRef.current.generation || !isOfflineActorCurrent(actorId, actorRevision)) return;
            await supabase.from('course_access_log').insert({
              user_id: user.id, course_id: courseId!, organization_id: orgId?.data?.organization_id || null, user_agent: navigator.userAgent,
            });
          })().catch(() => { /* Audit delivery must not break course loading. */ });
        }
      }

      const courseLessonIds = lessonsData.map((l: Lesson) => l.id);
      const [progressResult, attachmentsResult, documentsResult] = await Promise.all([
        authoritativeProgress
          ? Promise.resolve({ data: authoritativeProgress.lesson_progress, error: null })
          : courseLessonIds.length > 0 && lookupUserId
          ? supabase.from('lesson_progress').select('lesson_id, completed').eq('user_id', lookupUserId).in('lesson_id', courseLessonIds)
          : Promise.resolve({ data: [], error: null }),
        courseLessonIds.length > 0
          ? supabase.from('lesson_attachments').select('id, lesson_id, name, file_url, file_type, file_size, category, order_index').in('lesson_id', courseLessonIds).order('order_index')
          : Promise.resolve({ data: [], error: null }),
        supabase.from('course_documents').select('id, course_id, name, type, file_url, module_id, visible_to_students, allow_download, library_document_id, library_category, sort_order').eq('course_id', courseId).order('sort_order'),
      ]);
      if (!current()) return;
      if (progressResult.error) throw progressResult.error;
      const progressData = (progressResult.data || []) as LessonProgress[];
      const attMap: Record<string, CourseMaterialFile[]> = {};
      const moduleByLesson = new Map(lessonsData.map((lesson: Lesson) => [lesson.id, lesson.module_id ?? null]));
      if (!attachmentsResult.error) for (const a of (attachmentsResult.data || [])) {
        if (!attMap[a.lesson_id]) attMap[a.lesson_id] = [];
        attMap[a.lesson_id].push({ id: a.id, course_id: courseData.id, organization_id: courseData.organization_id,
          lesson_id: a.lesson_id, module_id: moduleByLesson.get(a.lesson_id) ?? null, reference_kind: "lesson_attachment",
          name: a.name, file_url: a.file_url, file_type: a.file_type, file_size: a.file_size ? Number(a.file_size) : null,
          category: a.category, visible_to_students: true, allow_download: true });
      }
      const documents: CourseMaterialFile[] = documentsResult.error ? [] : (documentsResult.data || [])
        .filter(d => d.library_document_id === null && d.library_category === null && (isAdminView || d.visible_to_students === true))
        .map(d => ({ id: d.id, course_id: d.course_id, organization_id: courseData.organization_id,
          lesson_id: null, module_id: d.module_id, reference_kind: "course_document" as const,
          name: d.name, file_url: d.file_url, file_type: null, file_size: null,
          category: "material", visible_to_students: d.visible_to_students === true, allow_download: d.allow_download === true,
          library_document_id: d.library_document_id, library_category: d.library_category }));
      if (authoritativeProgress) { if (!applyProgressSnapshot(authoritativeProgress)) return; }
      else setLessonProgress(progressData);
      setLessonAttachments(attMap); setCourseDocuments(documents);
      setMaterialsError(!!attachmentsResult.error || !!documentsResult.error);
      if (generation === identityRef.current.generation && request === requestRef.current && isOfflineActorCurrent(actorId, actorRevision)) {
        cacheCandidate.current = { generation, actorId, actorRevision, effectiveUserId, course: courseData,
          lessons: lessonsData, progress: progressData, attachments: attMap, documents, enrollmentId: enrollment?.id ?? null, run: authoritativeProgress ? snapshotRun(authoritativeProgress) : null };
        setLoadedGeneration(generation);
      }
    } catch (error) {
      if (!current()) return;
      progressAuthorityRef.current.fence.invalidate(); setLearningRun(null); cacheCandidate.current = null;
      console.error('Error fetching course:', error);
      if (isOfflineAccessDenied(error)) {
        forgetOfflineScope(actorId, effectiveUserId, mode, courseId);
        setCourse(null); setLessons([]); setLessonProgress([]); setLessonAttachments({}); setCourseDocuments([]);
        setMaterialsError(false); setEnrollmentId(null); setLoadedGeneration(-1);
        toast.error('Доступ к курсу не подтверждён'); navigate('/student'); return;
      }
      if (requestedLibraryOnly) {
        setCourse(null);
        setLessons([]);
        setLessonProgress([]);
        setLessonAttachments({}); setCourseDocuments([]); setMaterialsError(false);
        toast.error('Электронная библиотека недоступна', {
          description: 'Проверьте зачисление или обратитесь в учебный центр.',
        });
        navigate('/student', { replace: true });
        return;
      }
      if (courseId) {
        if (!mayUseOfflineFallback(error)) forgetOfflineScope(actorId, effectiveUserId, mode, courseId);
        const scope = mayUseOfflineFallback(error) ? getOfflineScope(actorId, effectiveUserId, mode, courseId) : null;
        const cached = scope ? await getCachedCourseData(scope, courseId) : null;
        if (!current()) return;
        const hasKnownOrder = cached && (
          cached.course?._lessonOrderVersion === COURSE_LESSON_ORDER_VERSION ||
          cached.lessons.every((lesson: Lesson) => !lesson.module_id)
        );
        if (cached && hasKnownOrder) {
          // Cached materials are useful offline; their old completion flags
          // cannot confirm the current run after a reset on another device.
          // Never adopt the cached epoch or use cached passes to unlock lessons.
          setCourse(cached.course); setLessons(cached.lessons); setLessonProgress([]); completedIdsRef.current = new Set();
          setCurrentLessonIndex(0); setIsTransitioning(false);
          setLessonAttachments(cached.lessonAttachments); setCourseDocuments(cached.courseDocuments ?? []); setMaterialsError(false);
          setIsOfflineMode(true); setOfflineCachedAt(cached.cachedAt);
          setEnrollmentId(null); setLoadedGeneration(generation);
          toast.info('Загружены сохранённые материалы курса', { description: 'Актуальный прогресс не подтверждён. Подключитесь к Интернету для продолжения обучения.' });
        } else if (cached) {
          setCourse(null); setLessons([]); setLessonProgress([]); setLessonAttachments({}); setCourseDocuments([]); setMaterialsError(false); setEnrollmentId(null);
          toast.error('Подключитесь к Интернету, чтобы обновить порядок модулей курса');
        } else {
          setCourse(null); setLessons([]); setLessonProgress([]); setLessonAttachments({}); setCourseDocuments([]); setMaterialsError(false); setEnrollmentId(null);
          setLoadedGeneration(-1);
          toast.error('Подключитесь к Интернету, чтобы подтвердить доступ к курсу');
        }
      } else { toast.error('Ошибка загрузки курса'); }
    } finally {
      if (courseFetchRequestRef.current === request) courseFetchRequestRef.current = null;
      if (generation === identityRef.current.generation && request === requestRef.current && isOfflineActorCurrent(actorId, actorRevision)) { setLoading(false); setSettledGeneration(generation); }
    }
  };

  // A visible open tab checks only the atomic progress snapshot. It does not
  // reload course files/metadata or create another historical access-log row.
  const pollCourseProgress = async () => {
    if (isAdminView || authLoading || !privateVisible || isOfflineMode || !user || !courseId
      || document.visibilityState === "hidden" || courseFetchRequestRef.current !== null) return;
    const authority = progressAuthorityRef.current, captured = authority.fence.capture();
    if (!captured) return;
    const generation = identityRef.current.generation, request = requestRef.current;
    const mutation = progressMutationRef.current, poll = ++progressPollRequestRef.current;
    const revision = captureOfflineActor(user.id);
    const current = () => authority === progressAuthorityRef.current && generation === identityRef.current.generation
      && request === requestRef.current && mutation === progressMutationRef.current && poll === progressPollRequestRef.current
      && captured.current() && isOfflineActorCurrent(user.id, revision);
    try {
      const snapshot = await fetchOwnLearningProgress(courseId, user.id);
      if (!current()) return;
      if (snapshot.enrollment.id !== captured.run.enrollmentId) throw Object.assign(new Error("Доступ к зачислению не подтверждён"), { code: "42501" });
      applyProgressSnapshot(snapshot);
    } catch (error) {
      if (!current()) return;
      if (await handleProgressReset(error)) return;
      if (!current()) return;
      if (isOfflineAccessDenied(error)) {
        authority.fence.invalidate(); setLearningRun(null); cacheCandidate.current = null;
        forgetOfflineScope(user.id, user.id, "learner", courseId);
        setCourse(null); setLessons([]); setLessonProgress([]); setLessonAttachments({}); setCourseDocuments([]);
        setMaterialsError(false); setEnrollmentId(null); setLoadedGeneration(-1);
        toast.error("Доступ к курсу не подтверждён"); navigate("/student");
      }
      // Transient read failures never replace a confirmed run with cached progress.
    }
  };

  // Swipe gestures
  const triggerHapticFeedback = useCallback(() => { if (navigator.vibrate) navigator.vibrate(10); }, []);
  const handleSwipeLeft = useCallback(() => { if (currentLessonIndex < lessons.length - 1) { triggerHapticFeedback(); goToNextLesson(); } }, [currentLessonIndex, lessons.length]);
  const handleSwipeRight = useCallback(() => { if (currentLessonIndex > 0) { triggerHapticFeedback(); goToPrevLesson(); } }, [currentLessonIndex]);
  const isTestActive = currentLesson?.type === 'test' && !!testHook.testAttemptId && !testHook.testSubmitted;

  const swipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: isMobile && !isTestActive ? handleSwipeLeft : undefined,
    onSwipeRight: isMobile && !isTestActive ? handleSwipeRight : undefined,
    threshold: 100, minSwipeDistance: 70,
  });

  const progressBarSwipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: isMobile ? handleSwipeLeft : undefined,
    onSwipeRight: isMobile ? handleSwipeRight : undefined,
    threshold: 40, minSwipeDistance: 30,
  });

  const getLessonIcon = (type: string) => type;

  return {
    course: privateVisible ? course : null, lessons: privateVisible ? lessons : [], currentLesson: privateVisible ? currentLesson : undefined,
    currentLessonIndex, loading: !!user && (!!authLoading || loading || settledGeneration !== identityRef.current.generation), enrollmentId: privateVisible ? enrollmentId : null,
    lessonProgress: privateVisible ? lessonProgress : [], completedCount: privateVisible ? completedCount : 0,
    progressPercent: privateVisible ? progressPercent : 0, isMobile, user, courseId, lessonAttachments: privateVisible ? lessonAttachments : {},
    isOfflineMode, offlineCachedAt, onLearningProgressReset: handleProgressReset, learningRun: privateVisible && !isAdminView && !isOfflineMode && progressAuthorityRef.current.fence.capture()?.run.epoch === learningRun?.epoch ? learningRun : null,
    courseDocuments: privateVisible ? courseDocuments : [], materialsError: privateVisible && materialsError,
    fileOrganizationId: privateVisible ? course?.organization_id ?? ((courseFileDeliveryMode.state === "legacy" || courseFileDeliveryMode.state === "frozen_required") ? courseFileDeliveryMode.context.organization_id : null) : null,
    courseFileDeliveryMode, fileEffectiveUserId: privateVisible ? effectiveUserId : null, fileViewGeneration: identityRef.current.generation,
    isAdminView, adminViewStudentName: adminView?.name || '',
    navigate, goToNextLesson, goToPrevLesson, goToLesson, isTransitioning,
    sidebarOpen, setSidebarOpen, isLessonCompleted, isLessonAccessible,
    markLessonComplete, resetCourseProgress,
    retryCourseCompletion: () => handleCourseCompletion(testHook.testScore ?? undefined),
    ...testHook,
    ...(!privateVisible ? { testQuestions: [], allBankQuestions: [], answers: {}, testScore: null, testAttemptId: null, testExplanations: {}, testManualCredit: null } : {}),
    feedbackAnswer, setFeedbackAnswer, feedbackSent, feedbackSending, submitFeedback,
    ...videoHook,
    ...ttsHook,
    ...chatHook,
    contentRef, swipeRef, progressBarSwipeRef, progressBarRef,
    lessonButtonRefs, tooltipLesson, setTooltipLesson, longPressTimeoutRef,
    contentBlocks: privateVisible ? contentBlocks : [], getOptionText, getLessonIcon,
  };
}
