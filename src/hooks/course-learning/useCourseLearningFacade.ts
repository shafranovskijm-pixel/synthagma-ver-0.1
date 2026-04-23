import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { cacheCourseData, getCachedCourseData } from "@/utils/courseCache";
import { setupOfflineSyncListeners } from "@/utils/offlineSync";
import { showLimitToast } from "@/utils/limitToast";
import { ContentBlock, parseLessonContent } from "@/components/course-builder/BlockEditor";
import { generateAttestationProtocol } from "@/utils/generateAttestationProtocol";
import { getAdminViewData, isAdminViewActive } from "@/utils/adminViewMode";

import type { Lesson, Course, LessonProgress } from "./types";
import { useLessonTTS } from "./useLessonTTS";
import { useLessonChat } from "./useLessonChat";
import { useLessonTest } from "./useLessonTest";
import { useLessonVideo } from "./useLessonVideo";
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
  const { user } = useAuth();
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

  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [lessonProgress, setLessonProgress] = useState<LessonProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [lessonAttachments, setLessonAttachments] = useState<Record<string, { id: string; name: string; file_url: string; file_type: string | null; file_size: number | null; category: string }[]>>({});
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [offlineCachedAt, setOfflineCachedAt] = useState<number | undefined>(undefined);

  // Tooltip state for mobile progress bar
  const [tooltipLesson, setTooltipLesson] = useState<{ index: number; title: string } | null>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const lessonButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Feedback state
  const [feedbackAnswer, setFeedbackAnswer] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);

  const currentLesson = lessons[currentLessonIndex];
  const completedCount = lessonProgress.filter(p => p.completed).length;
  const progressPercent = lessons.length > 0 ? (completedCount / lessons.length) * 100 : 0;

  // Parse content blocks
  const contentBlocks: ContentBlock[] = currentLesson?.content ? parseContentToBlocks(currentLesson.content) : [];

  // Sub-hooks — always use effective user id so admin sees student's video state
  const videoHook = useLessonVideo({ userId: effectiveUserId, currentLesson });

  const saveLessonTime = useCallback(async (lessonId?: string) => {
    if (isAdminView) return; // never write progress in admin view
    const lid = lessonId || currentLesson?.id;
    if (!lid || !user || !enrollmentId) return;
    const elapsed = Math.floor((Date.now() - lessonStartTimeRef.current) / 1000);
    lessonStartTimeRef.current = Date.now();
    if (elapsed <= 0 || elapsed > 7200) return;
    try {
      await supabase.rpc('increment_lesson_time', { p_lesson_id: lid, p_user_id: user.id, p_seconds: elapsed });
      await supabase.rpc('recalc_enrollment_time', { p_enrollment_id: enrollmentId });
    } catch (err) { console.error('[saveLessonTime] error:', err); }
  }, [currentLesson?.id, user, enrollmentId, isAdminView]);

  const handleCourseCompletion = async (testScoreData?: { score: number; max: number }) => {
    if (!course || !user || !courseId) return;
    try {
      const { data: profile } = await supabase.from('profiles').select('full_name, organization_id').eq('user_id', user.id).maybeSingle();
      if (!profile?.organization_id) return;

      const { data: org } = await supabase.from('organizations').select('id, name, director_name, director_position, subscription_plan').eq('id', profile.organization_id).single();
      if (!org) return;

      const planInfo = (await import('@/constants/subscriptionPlans')).getPlanInfo(org.subscription_plan as Parameters<typeof import('@/constants/subscriptionPlans').getPlanInfo>[0]);
      if (planInfo.limits.maxTrainedPerMonth !== -1) {
        const { data: countData } = await supabase.rpc('count_org_completions_this_month' as never, { org_id: profile.organization_id } as never);
        const trainedCount = Number(countData) || 0;
        if (trainedCount >= planInfo.limits.maxTrainedPerMonth) {
          showLimitToast(`Лимит тарифа "${planInfo.name}": ${planInfo.limits.maxTrainedPerMonth} обученных в месяц. Перейдите на следующий тариф.`);
          return;
        }
      }

      await supabase.from('enrollments').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', enrollmentId);
      const protocolName = await generateAttestationProtocol({
        organizationId: org.id, organizationName: org.name, directorName: org.director_name, directorPosition: org.director_position,
        studentName: profile.full_name || 'Слушатель', courseName: course.title, courseDuration: course.duration,
        completedAt: new Date(), testScore: testScoreData?.score, testMaxScore: testScoreData?.max,
      });
      if (protocolName) toast.success('Курс завершён! Протокол аттестационной комиссии создан.');

      if ((course as unknown as Record<string, unknown>).notify_on_completion) {
        try { await safeInvoke('notify-course-completion', { body: { enrollment_id: enrollmentId, course_id: courseId, user_id: user.id } }); } catch (e) { console.error('Notification error:', e); }
      }
    } catch (error) { console.error('Error handling course completion:', error); }
  };

  const testHook = useLessonTest({
    currentLesson, user, lessons, lessonProgress, completedCount,
    enrollmentId, courseId, course, setLessonProgress,
    saveLessonTime: () => saveLessonTime(),
    handleCourseCompletion,
  });

  const ttsHook = useLessonTTS({
    currentLesson, currentLessonIndex, contentBlocks,
    testQuestions: testHook.testQuestions,
  });

  const chatHook = useLessonChat({ course, currentLesson, contentBlocks });

  const isLessonCompleted = (lessonId: string) => lessonProgress.some(p => p.lesson_id === lessonId && p.completed);

  const isLessonAccessible = (index: number): boolean => {
    const lesson = lessons[index];
    if (lesson?.is_locked) return false;
    if (lesson?.locked_until) {
      const unlockAt = new Date(lesson.locked_until).getTime();
      if (unlockAt > Date.now()) return false;
    }
    if (!course?.sequential_lessons) return true;
    if (index === 0) return true;
    for (let i = 0; i < index; i++) {
      if (!isLessonCompleted(lessons[i].id)) return false;
    }
    return true;
  };

  const goToNextLesson = () => {
    const nextIndex = currentLessonIndex + 1;
    if (nextIndex < lessons.length) {
      if (!isLessonAccessible(nextIndex)) { toast.error('Сначала завершите текущий урок'); return; }
      setIsTransitioning(true); videoHook.setVideoWatchProgress(0);
      setTimeout(() => { setCurrentLessonIndex(nextIndex); setIsTransitioning(false); }, 300);
    }
  };

  const goToPrevLesson = () => {
    if (currentLessonIndex > 0) {
      setIsTransitioning(true); videoHook.setVideoWatchProgress(0);
      setTimeout(() => { setCurrentLessonIndex(prev => prev - 1); setIsTransitioning(false); }, 300);
    }
  };

  const goToLesson = (index: number) => {
    if (index !== currentLessonIndex) {
      if (!isLessonAccessible(index)) { toast.error('Этот урок пока недоступен. Пройдите предыдущие уроки.'); return; }
      setIsTransitioning(true); videoHook.setVideoWatchProgress(0);
      setTimeout(() => { setCurrentLessonIndex(index); setIsTransitioning(false); }, 300);
    }
  };

  const markLessonComplete = async (autoAdvance = true) => {
    if (!currentLesson || !user) return;
    if (isLessonCompleted(currentLesson.id)) { if (autoAdvance) goToNextLesson(); return; }

    await saveLessonTime();
    const { error } = await supabase.from('lesson_progress').upsert({
      lesson_id: currentLesson.id, user_id: user.id, completed: true, completed_at: new Date().toISOString()
    }, { onConflict: 'lesson_id,user_id' });

    if (error) {
      const { error: insertError } = await supabase.from('lesson_progress').insert({
        lesson_id: currentLesson.id, user_id: user.id, completed: true, completed_at: new Date().toISOString()
      });
      if (insertError) { console.error('Error:', insertError); toast.error('Ошибка сохранения прогресса'); return; }
    }

    setLessonProgress(prev => [...prev.filter(p => p.lesson_id !== currentLesson.id), { lesson_id: currentLesson.id, completed: true }]);
    const newProgress = Math.min(Math.round(((completedCount + 1) / lessons.length) * 100), 100);
    await supabase.from('enrollments').update({ progress: newProgress }).eq('id', enrollmentId);

    if (newProgress >= 100) { await handleCourseCompletion(); } else { toast.success('Урок завершён!'); }
    if (autoAdvance) goToNextLesson();
  };

  const resetCourseProgress = async () => {
    if (!user || !courseId) return;
    try {
      const lessonIds = lessons.map(l => l.id);
      if (lessonIds.length > 0) {
        await supabase.from('lesson_progress').delete().eq('user_id', user.id).in('lesson_id', lessonIds);
        await supabase.from('test_attempts').delete().eq('user_id', user.id).in('lesson_id', lessonIds);
      }
      await supabase.from('enrollments').update({ progress: 0, status: 'active', completed_at: null }).eq('user_id', user.id).eq('course_id', courseId);
      setLessonProgress([]); setCurrentLessonIndex(0); videoHook.setVideoWatchProgress(0);
      toast.success('Прогресс курса сброшен. Начните прохождение заново!');
    } catch (error) { console.error('Error resetting progress:', error); toast.error('Ошибка сброса прогресса'); }
  };

  const submitFeedback = async () => {
    if (!currentLesson || !user || !feedbackAnswer.trim()) return;
    setFeedbackSending(true);
    try {
      const { data: courseData } = await supabase.from('courses').select('organization_id').eq('id', courseId).single();
      if (!courseData?.organization_id) { toast.error('Не удалось определить организацию'); setFeedbackSending(false); return; }
      const messageContent = `📋 Обратная связь (урок "${currentLesson.title}"): ${feedbackAnswer.trim()}`;
      const { error } = await supabase.from('org_student_messages').insert({
        organization_id: courseData.organization_id, student_user_id: user.id, sender_user_id: user.id, content: messageContent,
      });
      if (error) throw error;
      setFeedbackSent(true);
      toast.success('Ваш ответ отправлен');
      await markLessonComplete(false);
    } catch (err) { console.error('Feedback submit error:', err); toast.error('Ошибка отправки ответа'); }
    finally { setFeedbackSending(false); }
  };

  // Data fetching
  useEffect(() => { if (courseId && user) fetchCourseData(); }, [courseId, user]);
  useEffect(() => {
    setFeedbackAnswer(''); setFeedbackSent(false);
  }, [currentLesson?.id]);
  useEffect(() => { if (contentRef.current) contentRef.current.scrollTo({ top: 0, behavior: 'smooth' }); }, [currentLessonIndex]);
  useEffect(() => {
    if (isMobile && lessonButtonRefs.current[currentLessonIndex]) {
      lessonButtonRefs.current[currentLessonIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentLessonIndex, isMobile]);
  useEffect(() => { const cleanup = setupOfflineSyncListeners(); return cleanup; }, []);

  // Save time on lesson switch
  const prevLessonIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentLesson?.id && prevLessonIdRef.current && prevLessonIdRef.current !== currentLesson.id) {
      saveLessonTime(prevLessonIdRef.current);
    }
    prevLessonIdRef.current = currentLesson?.id || null;
    lessonStartTimeRef.current = Date.now();
  }, [currentLesson?.id]);

  // Save time on page unload / visibility change
  useEffect(() => {
    if (!user || !enrollmentId) return;
    const handleBeforeUnload = () => {
      const lid = currentLesson?.id;
      if (!lid) return;
      const elapsed = Math.floor((Date.now() - lessonStartTimeRef.current) / 1000);
      if (elapsed <= 0 || elapsed > 7200) return;
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/increment_lesson_time`;
        const payload = JSON.stringify({ p_lesson_id: lid, p_user_id: user.id, p_seconds: elapsed });
        navigator.sendBeacon(`${url}?apikey=${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, new Blob([payload], { type: 'application/json' }));
      } catch { /* best-effort */ }
    };
    const handleVisibility = () => { if (document.visibilityState === 'hidden') saveLessonTime(); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { window.removeEventListener('beforeunload', handleBeforeUnload); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [user, enrollmentId, currentLesson?.id, saveLessonTime]);

  const fetchCourseData = async () => {
    try {
      const [courseResult, lessonsResult, enrollmentResult] = await Promise.all([
        supabase.from('courses').select('*').eq('id', courseId).single(),
        supabase.from('lessons').select('*').eq('course_id', courseId).order('order_index'),
        supabase.from('enrollments').select('*').eq('course_id', courseId).eq('user_id', user!.id).maybeSingle(),
      ]);
      if (courseResult.error) throw courseResult.error;
      const courseData = courseResult.data;
      setCourse(courseData);
      setIsOfflineMode(false);

      if (courseData.skip_video_identification === false && user) {
        const { data: profileData } = await supabase.from('profiles').select('organization_id').eq('user_id', user.id).maybeSingle();
        if (profileData?.organization_id) {
          const { data: videoId } = await supabase.from('video_identifications').select('status').eq('user_id', user.id).eq('organization_id', profileData.organization_id).in('status', ['approved', 'verified']).limit(1).maybeSingle();
          if (!videoId) {
            toast.error('Требуется видеоидентификация', { description: 'Пройдите видеоидентификацию перед началом курса' });
            navigate('/student');
            return;
          }
        }
      }
      if (lessonsResult.error) throw lessonsResult.error;
      let lessonsData = lessonsResult.data || [];

      // Apply module access schedules + per-user overrides
      try {
        const moduleIds = Array.from(new Set(lessonsData.map((l: any) => l.module_id).filter(Boolean)));
        if (moduleIds.length > 0 && user) {
          const [schedRes, ovrRes] = await Promise.all([
            supabase.from("module_access_schedules" as never).select("module_id, unlock_at").in("module_id", moduleIds as string[]),
            supabase.from("module_access_overrides" as never).select("module_id, unlock_at").in("module_id", moduleIds as string[]).eq("user_id", user.id),
          ]);
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

      let enrollment = enrollmentResult.data;
      if (!enrollment) {
        toast.error('Вы не записаны на этот курс', { description: 'Отправьте заявку на запись через каталог курсов' });
        navigate('/student');
        return;
      }

      if (enrollment && (enrollment as Record<string, unknown>).expires_at) {
        const expiresAt = new Date((enrollment as Record<string, unknown>).expires_at as string);
        if (expiresAt < new Date() && enrollment.status !== 'completed') {
          toast.error('Доступ к курсу истёк', { description: 'Срок доступа к этому курсу закончился. Обратитесь к администратору.' });
          navigate('/student');
          return;
        }
      }

      if (enrollment) {
        setEnrollmentId(enrollment.id);
        const orgId = await supabase.from('profiles').select('organization_id').eq('user_id', user!.id).maybeSingle();
        supabase.from('course_access_log').insert({
          user_id: user!.id, course_id: courseId!, organization_id: orgId?.data?.organization_id || null, user_agent: navigator.userAgent,
        }).then(() => {});
      }

      const courseLessonIds = lessonsData.map((l: Lesson) => l.id);
      let progressData: LessonProgress[] = [];
      let attMap: Record<string, typeof lessonAttachments[string]> = {};

      if (courseLessonIds.length > 0) {
        const [progressResult, attachmentsResult] = await Promise.all([
          supabase.from('lesson_progress').select('lesson_id, completed').eq('user_id', user!.id).in('lesson_id', courseLessonIds),
          supabase.from('lesson_attachments').select('*').in('lesson_id', courseLessonIds).order('order_index'),
        ]);
        if (attachmentsResult.error) console.error('Error fetching lesson attachments:', attachmentsResult.error);
        progressData = (progressResult.data || []) as LessonProgress[];
        setLessonProgress(progressData);
        for (const a of (attachmentsResult.data || [])) {
          if (!attMap[a.lesson_id]) attMap[a.lesson_id] = [];
          attMap[a.lesson_id].push({ id: a.id, name: a.name, file_url: a.file_url, file_type: a.file_type, file_size: a.file_size ? Number(a.file_size) : null, category: a.category });
        }
        setLessonAttachments(attMap);
      } else {
        setLessonProgress([]);
      }

      if (courseId) { cacheCourseData(courseId, courseData, lessonsData, progressData, attMap).catch(() => {}); }
    } catch (error) {
      console.error('Error fetching course:', error);
      if (courseId) {
        const cached = await getCachedCourseData(courseId);
        if (cached) {
          setCourse(cached.course); setLessons(cached.lessons); setLessonProgress(cached.lessonProgress); setLessonAttachments(cached.lessonAttachments);
          setIsOfflineMode(true); setOfflineCachedAt(cached.cachedAt);
          toast.info('Загружена офлайн-версия курса', { description: 'Данные могут быть устаревшими' });
        } else { toast.error('Ошибка загрузки курса'); }
      } else { toast.error('Ошибка загрузки курса'); }
    } finally { setLoading(false); }
  };

  // Swipe gestures
  const triggerHapticFeedback = useCallback(() => { if (navigator.vibrate) navigator.vibrate(10); }, []);
  const handleSwipeLeft = useCallback(() => { if (currentLessonIndex < lessons.length - 1) { triggerHapticFeedback(); goToNextLesson(); } }, [currentLessonIndex, lessons.length]);
  const handleSwipeRight = useCallback(() => { if (currentLessonIndex > 0) { triggerHapticFeedback(); goToPrevLesson(); } }, [currentLessonIndex]);
  const isTestActive = currentLesson?.type === 'test' && !testHook.testSubmitted;

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
    course, lessons, currentLesson, currentLessonIndex, loading, enrollmentId,
    lessonProgress, completedCount, progressPercent, isMobile, user, courseId, lessonAttachments,
    isOfflineMode, offlineCachedAt,
    navigate, goToNextLesson, goToPrevLesson, goToLesson, isTransitioning,
    sidebarOpen, setSidebarOpen, isLessonCompleted, isLessonAccessible,
    markLessonComplete, resetCourseProgress,
    ...testHook,
    feedbackAnswer, setFeedbackAnswer, feedbackSent, feedbackSending, submitFeedback,
    ...videoHook,
    ...ttsHook,
    ...chatHook,
    contentRef, swipeRef, progressBarSwipeRef, progressBarRef,
    lessonButtonRefs, tooltipLesson, setTooltipLesson, longPressTimeoutRef,
    contentBlocks, getOptionText, getLessonIcon,
  };
}
