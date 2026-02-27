import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { useElevenLabsTTS } from "@/hooks/useElevenLabsTTS";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ContentBlock, jsonToBlocks } from "@/components/course-builder/BlockEditor";
import { generateAttestationProtocol } from "@/utils/generateAttestationProtocol";
import { TTSSettings, getStoredTTSSettings } from "@/components/student/TTSSettingsDialog";

export interface Lesson {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  duration: string | null;
  sequential_lessons?: boolean;
  allow_video_seek?: boolean;
}

export interface LessonProgress {
  lesson_id: string;
  completed: boolean;
}

export interface TestQuestion {
  id: string;
  question: string;
  options: unknown;
  correct_answer: number;
  order_index: number;
  explanation?: string;
  is_bank_question?: boolean;
  image_url?: string;
}

// Helper to get text from option
export const getOptionText = (option: unknown): string => {
  if (typeof option === 'object' && option !== null && 'text' in option) {
    return (option as { text: string }).text;
  }
  return String(option);
};

export function parseContentToBlocks(content: string): ContentBlock[] {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.every(item => item.type && item.id)) {
      return parsed;
    }
  } catch {
    // Not JSON
  }
  return [];
}

export function useCourseLearning() {
  const { courseId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const contentRef = useRef<HTMLDivElement>(null);
  const lessonStartTimeRef = useRef<number>(Date.now());

  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [lessonProgress, setLessonProgress] = useState<LessonProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [lessonAttachments, setLessonAttachments] = useState<Record<string, { id: string; name: string; file_url: string; file_type: string | null; file_size: number | null; category: string }[]>>({});
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Tooltip state for mobile progress bar
  const [tooltipLesson, setTooltipLesson] = useState<{ index: number; title: string } | null>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const lessonButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Test state
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([]);
  const [allBankQuestions, setAllBankQuestions] = useState<TestQuestion[]>([]);
  const [usedQuestionIds, setUsedQuestionIds] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [testScore, setTestScore] = useState<{ score: number; max: number } | null>(null);
  const [testQuestionsCount, setTestQuestionsCount] = useState<number | null>(null);
  const [testPassingScore, setTestPassingScore] = useState<number>(60);
  const [testExplanations, setTestExplanations] = useState<Record<string, string | null>>({});

  // TTS state
  const [ttsSettingsOpen, setTtsSettingsOpen] = useState(false);
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>(() => getStoredTTSSettings());
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [isBrowserSpeaking, setIsBrowserSpeaking] = useState(false);

  const elevenLabsTTS = useElevenLabsTTS({ voiceId: ttsSettings.voiceId });

  // Video watch progress
  const [videoWatchProgress, setVideoWatchProgress] = useState(0);

  // AI Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const currentLesson = lessons[currentLessonIndex];
  const completedCount = lessonProgress.filter(p => p.completed).length;
  const progressPercent = lessons.length > 0 ? (completedCount / lessons.length) * 100 : 0;

  // Video position persistence
  const videoLessonId = currentLesson?.type === 'video' ? currentLesson.id : undefined;
  const {
    savedPosition,
    savedDuration,
    isLoading: isVideoProgressLoading,
    savePosition: saveVideoPosition,
  } = useVideoProgress(user?.id, videoLessonId);

  // Initialize videoWatchProgress from saved position on load
  useEffect(() => {
    if (savedPosition > 0 && savedDuration > 0 && currentLesson?.type === 'video') {
      const restoredProgress = (savedPosition / savedDuration) * 100;
      if (restoredProgress > videoWatchProgress) {
        setVideoWatchProgress(restoredProgress);
      }
    }
  }, [savedPosition, savedDuration, currentLesson?.id]);

  // Parse content blocks
  const contentBlocks: ContentBlock[] = currentLesson?.content
    ? parseContentToBlocks(currentLesson.content)
    : [];

  // Computed isSpeaking
  const isSpeaking = ttsSettings.useElevenLabs ? elevenLabsTTS.isActive : isBrowserSpeaking;

  // Text extraction from blocks
  const extractTextFromBlocks = (blocks: ContentBlock[]): string => {
    return blocks.map(block => {
      switch (block.type) {
        case 'paragraph': case 'heading1': case 'heading2': case 'quote':
        case 'callout-info': case 'callout-warning': case 'callout-tip':
          return block.content?.replace(/<[^>]*>/g, '') || '';
        case 'bulletList': case 'numberedList':
          return (block.content || '').split('\n').filter(Boolean).join('. ');
        case 'accordion':
          return `${block.accordionTitle || ''}. ${block.content || ''}`;
        case 'quiz':
          return `Вопрос: ${block.quizQuestion || ''}`;
        default:
          return '';
      }
    }).filter(Boolean).join('. ');
  };

  const getTextToSpeak = (): string => {
    if (!currentLesson) return '';
    let textToSpeak = '';
    if (currentLesson.type === 'text') {
      textToSpeak = contentBlocks.length > 0 ? extractTextFromBlocks(contentBlocks) : currentLesson.content?.replace(/<[^>]*>/g, '').replace(/\n/g, '. ') || '';
    } else if (currentLesson.type === 'test') {
      textToSpeak = testQuestions.map((q, i) => {
        const options = Array.isArray(q.options) ? q.options : [];
        const optionsText = options.map((opt, j) => `${j + 1}. ${getOptionText(opt)}`).join('. ');
        return `Вопрос ${i + 1}: ${q.question}. Варианты ответа: ${optionsText}`;
      }).join('. ');
    }
    return textToSpeak;
  };

  const speakText = () => {
    if (!currentLesson) return;
    const textToSpeak = getTextToSpeak();
    if (!textToSpeak) { toast.error('Нет текста для озвучивания'); return; }

    if (ttsSettings.useElevenLabs) {
      elevenLabsTTS.speak(textToSpeak);
    } else {
      if (isBrowserSpeaking) { window.speechSynthesis?.cancel(); setIsBrowserSpeaking(false); return; }
      if (!('speechSynthesis' in window)) { toast.error('Озвучивание не поддерживается'); return; }
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'ru-RU'; utterance.rate = 1.0; utterance.pitch = 1.0;
      const voices = window.speechSynthesis?.getVoices() || [];
      const russianVoice = voices.find(v => v.lang.startsWith('ru'));
      if (russianVoice) utterance.voice = russianVoice;
      utterance.onend = () => setIsBrowserSpeaking(false);
      utterance.onerror = () => { setIsBrowserSpeaking(false); toast.error('Ошибка озвучивания'); };
      speechSynthesisRef.current = utterance;
      window.speechSynthesis?.speak(utterance);
      setIsBrowserSpeaking(true);
    }
  };

  // Stop speaking when lesson changes
  useEffect(() => { window.speechSynthesis?.cancel(); setIsBrowserSpeaking(false); elevenLabsTTS.stop(); }, [currentLessonIndex]);
  useEffect(() => { return () => { window.speechSynthesis?.cancel(); elevenLabsTTS.stop(); }; }, []);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages]);

  // AI Chat
  const sendChatMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatLoading(true);

    let lessonContent = '';
    if (currentLesson) {
      if (currentLesson.type === 'text' && contentBlocks.length > 0) {
        lessonContent = extractTextFromBlocks(contentBlocks);
      } else if (currentLesson.content) {
        lessonContent = currentLesson.content.replace(/<[^>]*>/g, '').substring(0, 3000);
      }
    }

    try {
      const { data, error } = await supabase.functions.invoke('student-chat', {
        body: {
          messages: [...chatMessages, { role: 'user', content: userMessage }],
          context: { courseTitle: course?.title || '', lessonTitle: currentLesson?.title || '', lessonType: currentLesson?.type || '', lessonContent }
        }
      });
      if (error) throw error;
      if (data.content) setChatMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch (error: any) {
      console.error('Chat error:', error);
      toast.error('Ошибка отправки сообщения');
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Извините, произошла ошибка. Попробуйте позже.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Data fetching
  useEffect(() => { if (courseId && user) fetchCourseData(); }, [courseId, user]);

  useEffect(() => {
    setTestSubmitted(false); setTestScore(null); setTestQuestions([]); setAnswers({});
    if (currentLesson?.type === 'test') fetchTestQuestions(currentLesson.id);
  }, [currentLesson?.id]);

  useEffect(() => { if (contentRef.current) contentRef.current.scrollTo({ top: 0, behavior: 'smooth' }); }, [currentLessonIndex]);

  useEffect(() => {
    if (isMobile && lessonButtonRefs.current[currentLessonIndex]) {
      lessonButtonRefs.current[currentLessonIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentLessonIndex, isMobile]);

  const fetchCourseData = async () => {
    try {
      const [courseResult, lessonsResult, enrollmentResult] = await Promise.all([
        supabase.from('courses').select('*').eq('id', courseId).single(),
        supabase.from('lessons').select('*').eq('course_id', courseId).order('order_index'),
        supabase.from('enrollments').select('*').eq('course_id', courseId).eq('user_id', user!.id).maybeSingle(),
      ]);
      if (courseResult.error) throw courseResult.error;
      setCourse(courseResult.data);
      if (lessonsResult.error) throw lessonsResult.error;
      const lessonsData = lessonsResult.data || [];
      setLessons(lessonsData);

      let enrollment = enrollmentResult.data;
      if (!enrollment) {
        const { data: newEnrollment, error: createError } = await supabase.from('enrollments').insert({ course_id: courseId, user_id: user!.id }).select().single();
        if (createError) throw createError;
        enrollment = newEnrollment;
      }
      if (enrollment) {
        setEnrollmentId(enrollment.id);
        // Log course access
        const orgId = await supabase.from('profiles').select('organization_id').eq('user_id', user!.id).maybeSingle();
        supabase.from('course_access_log').insert({
          user_id: user!.id,
          course_id: courseId!,
          organization_id: orgId?.data?.organization_id || null,
          user_agent: navigator.userAgent,
        }).then(() => {}); // fire and forget
      }

      const courseLessonIds = lessonsData.map((l: any) => l.id);
      if (courseLessonIds.length > 0) {
        const { data: progressData } = await supabase.from('lesson_progress').select('lesson_id, completed').eq('user_id', user!.id).in('lesson_id', courseLessonIds);
        setLessonProgress(progressData || []);
      } else {
        setLessonProgress([]);
      }
    } catch (error) {
      console.error('Error fetching course:', error);
      toast.error('Ошибка загрузки курса');
    } finally {
      setLoading(false);
    }
  };

  const selectRandomQuestions = (allQuestions: TestQuestion[], count: number | null, excludeIds: string[]) => {
    if (count === null || count <= 0 || count >= allQuestions.length) {
      setTestQuestions([...allQuestions].sort(() => Math.random() - 0.5));
      return;
    }
    let availableQuestions = allQuestions.filter(q => !excludeIds.includes(q.id));
    if (availableQuestions.length < count) availableQuestions = allQuestions;
    const shuffled = [...availableQuestions].sort(() => Math.random() - 0.5);
    setTestQuestions(shuffled.slice(0, Math.min(count, shuffled.length)));
  };

  const fetchTestQuestions = async (lessonId: string) => {
    const { data: lessonData } = await supabase.from('lessons').select('test_questions_to_show, test_passing_score').eq('id', lessonId).single();
    const questionsToShow = (lessonData as any)?.test_questions_to_show ?? null;
    const passingScore = (lessonData as any)?.test_passing_score ?? 60;
    setTestQuestionsCount(questionsToShow);
    setTestPassingScore(passingScore);

    const { data, error } = await supabase.from('test_questions_for_students').select('*').eq('lesson_id', lessonId).order('order_index');
    if (error) { console.error('Error fetching questions:', error); return; }
    const allQuestions = (data || []) as TestQuestion[];
    setAllBankQuestions(allQuestions);

    try {
      const { data: resultsData, error: resultsError } = await supabase.functions.invoke('get-test-results', { body: { lesson_id: lessonId } });
      if (resultsError) { selectRandomQuestions(allQuestions, questionsToShow, []); setUsedQuestionIds([]); setAnswers({}); return; }

      if (resultsData?.hasAttempt) {
        const { attempt, correctAnswers, explanations, usedQuestionIds: allUsedIds } = resultsData;
        if (explanations) setTestExplanations(explanations);
        setTestSubmitted(true);
        setTestScore({ score: attempt.score, max: attempt.max_score });
        setAnswers(attempt.answers as Record<string, number> || {});
        setUsedQuestionIds(allUsedIds || []);
        const shownIds = attempt.shown_question_ids as string[] || [];
        if (shownIds.length > 0) {
          setTestQuestions(allQuestions.filter(q => shownIds.includes(q.id)).map(q => ({ ...q, correct_answer: correctAnswers[q.id] ?? q.correct_answer })));
        } else {
          setTestQuestions(allQuestions);
        }
      } else {
        selectRandomQuestions(allQuestions, questionsToShow, []);
        setUsedQuestionIds([]); setAnswers({});
      }
    } catch (err) {
      selectRandomQuestions(allQuestions, questionsToShow, []);
      setUsedQuestionIds([]); setAnswers({});
    }
  };

  const handleCourseCompletion = async (testScoreData?: { score: number; max: number }) => {
    if (!course || !user || !courseId) return;
    try {
      const { data: profile } = await supabase.from('profiles').select('full_name, organization_id').eq('user_id', user.id).maybeSingle();
      if (!profile?.organization_id) return;
      const { data: org } = await supabase.from('organizations').select('id, name, director_name, director_position').eq('id', profile.organization_id).single();
      if (!org) return;

      await supabase.from('enrollments').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', enrollmentId);
      const protocolName = await generateAttestationProtocol({
        organizationId: org.id, organizationName: org.name, directorName: org.director_name, directorPosition: org.director_position,
        studentName: profile.full_name || 'Слушатель', courseName: course.title, courseDuration: course.duration,
        completedAt: new Date(), testScore: testScoreData?.score, testMaxScore: testScoreData?.max,
      });
      if (protocolName) toast.success('Курс завершён! Протокол аттестационной комиссии создан.');

      if ((course as any).notify_on_completion) {
        try { await supabase.functions.invoke('notify-course-completion', { body: { enrollment_id: enrollmentId, course_id: courseId, user_id: user.id } }); } catch (e) { console.error('Notification error:', e); }
      }
    } catch (error) { console.error('Error handling course completion:', error); }
  };

  const isLessonCompleted = (lessonId: string) => lessonProgress.some(p => p.lesson_id === lessonId && p.completed);

  const isLessonAccessible = (index: number): boolean => {
    if (!course?.sequential_lessons) return true;
    if (index === 0) return true;
    for (let i = 0; i < index; i++) {
      if (!isLessonCompleted(lessons[i].id)) return false;
    }
    return true;
  };

  // Save lesson time tracking
  const saveLessonTime = useCallback(async (lessonId?: string) => {
    const lid = lessonId || currentLesson?.id;
    if (!lid || !user || !enrollmentId) return;
    const elapsed = Math.floor((Date.now() - lessonStartTimeRef.current) / 1000);
    lessonStartTimeRef.current = Date.now();
    if (elapsed <= 0 || elapsed > 7200) return; // skip if 0 or > 2 hours (tab left open)
    try {
      await supabase.rpc('increment_lesson_time', { p_lesson_id: lid, p_user_id: user.id, p_seconds: elapsed });
      await supabase.rpc('recalc_enrollment_time', { p_enrollment_id: enrollmentId });
    } catch (err) {
      console.error('[saveLessonTime] error:', err);
    }
  }, [currentLesson?.id, user, enrollmentId]);

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
        navigator.sendBeacon(
          `${url}?apikey=${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          new Blob([payload], { type: 'application/json' })
        );
      } catch {}
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') saveLessonTime();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, enrollmentId, currentLesson?.id, saveLessonTime]);

  const markLessonComplete = async () => {
    if (!currentLesson || !user) return;
    if (isLessonCompleted(currentLesson.id)) { goToNextLesson(); return; }

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
    goToNextLesson();
  };

  const goToNextLesson = () => {
    const nextIndex = currentLessonIndex + 1;
    if (nextIndex < lessons.length) {
      if (!isLessonAccessible(nextIndex)) { toast.error('Сначала завершите текущий урок'); return; }
      setIsTransitioning(true); setVideoWatchProgress(0);
      setTimeout(() => { setCurrentLessonIndex(nextIndex); setIsTransitioning(false); }, 300);
    }
  };

  const goToPrevLesson = () => {
    if (currentLessonIndex > 0) {
      setIsTransitioning(true); setVideoWatchProgress(0);
      setTimeout(() => { setCurrentLessonIndex(prev => prev - 1); setIsTransitioning(false); }, 300);
    }
  };

  const goToLesson = (index: number) => {
    if (index !== currentLessonIndex) {
      if (!isLessonAccessible(index)) { toast.error('Этот урок пока недоступен. Пройдите предыдущие уроки.'); return; }
      setIsTransitioning(true); setVideoWatchProgress(0);
      setTimeout(() => { setCurrentLessonIndex(index); setIsTransitioning(false); }, 300);
    }
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
      setLessonProgress([]); setCurrentLessonIndex(0); setTestSubmitted(false); setTestScore(null); setAnswers({}); setVideoWatchProgress(0);
      toast.success('Прогресс курса сброшен. Начните прохождение заново!');
    } catch (error) { console.error('Error resetting progress:', error); toast.error('Ошибка сброса прогресса'); }
  };

  const submitTest = async () => {
    if (!currentLesson || !user) return;
    if (testQuestions.length === 0) { toast.error('Нет вопросов для теста.'); return; }
    await saveLessonTime();
    const shownIds = testQuestions.map(q => q.id);
    try {
      const { data: gradeResult, error: gradeError } = await supabase.functions.invoke('grade-test', {
        body: { lesson_id: currentLesson.id, answers, shown_question_ids: shownIds }
      });
      if (gradeError || !gradeResult) { toast.error('Ошибка проверки теста'); return; }
      const { score, maxScore, scorePercent, passed, correctAnswers, explanations } = gradeResult;
      if (explanations) setTestExplanations(explanations);
      setTestQuestions(testQuestions.map(q => ({ ...q, correct_answer: correctAnswers[q.id] ?? q.correct_answer })));
      setTestSubmitted(true);
      setTestScore({ score, max: maxScore });
      if (passed) {
        setLessonProgress(prev => [...prev.filter(p => p.lesson_id !== currentLesson.id), { lesson_id: currentLesson.id, completed: true }]);
        const newProgress = Math.min(Math.round(((completedCount + 1) / lessons.length) * 100), 100);
        await supabase.from('enrollments').update({ progress: newProgress }).eq('id', enrollmentId);
        if (newProgress >= 100) { await handleCourseCompletion({ score, max: maxScore }); } else { toast.success(`Тест пройден! ${score}/${maxScore} (${scorePercent}%)`); }
      } else {
        toast.error(`Тест не пройден. ${score}/${maxScore} (${scorePercent}%). Нужно: ${testPassingScore}%.`);
      }
    } catch (err) { console.error('Error submitting test:', err); toast.error('Ошибка отправки теста'); }
  };

  const retryTest = () => {
    const newUsedIds = [...usedQuestionIds, ...testQuestions.map(q => q.id)];
    setUsedQuestionIds(newUsedIds);
    selectRandomQuestions(allBankQuestions, testQuestionsCount, newUsedIds);
    setAnswers({}); setTestSubmitted(false); setTestScore(null);
  };

  // Swipe gestures
  const triggerHapticFeedback = useCallback(() => { if (navigator.vibrate) navigator.vibrate(10); }, []);
  const handleSwipeLeft = useCallback(() => { if (currentLessonIndex < lessons.length - 1) { triggerHapticFeedback(); goToNextLesson(); } }, [currentLessonIndex, lessons.length]);
  const handleSwipeRight = useCallback(() => { if (currentLessonIndex > 0) { triggerHapticFeedback(); goToPrevLesson(); } }, [currentLessonIndex]);
  const isTestActive = currentLesson?.type === 'test' && !testSubmitted;

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
    // Core data
    course, lessons, currentLesson, currentLessonIndex, loading, enrollmentId,
    lessonProgress, completedCount, progressPercent, isMobile, user, courseId,

    // Navigation
    navigate, goToNextLesson, goToPrevLesson, goToLesson, isTransitioning,
    sidebarOpen, setSidebarOpen, isLessonCompleted, isLessonAccessible,
    markLessonComplete, resetCourseProgress,

    // Test
    testQuestions, allBankQuestions, answers, setAnswers, testSubmitted,
    testScore, testPassingScore, testExplanations, submitTest, retryTest,

    // Video
    videoWatchProgress, setVideoWatchProgress, savedPosition,
    isVideoProgressLoading, saveVideoPosition,

    // TTS
    ttsSettingsOpen, setTtsSettingsOpen, ttsSettings, setTtsSettings,
    isSpeaking, speakText, elevenLabsTTS,

    // AI Chat
    isChatOpen, setIsChatOpen, chatMessages, chatInput, setChatInput,
    isChatLoading, sendChatMessage, chatScrollRef,

    // Refs
    contentRef, swipeRef, progressBarSwipeRef, progressBarRef,
    lessonButtonRefs, tooltipLesson, setTooltipLesson, longPressTimeoutRef,

    // Content
    contentBlocks, getOptionText, getLessonIcon,
  };
}
