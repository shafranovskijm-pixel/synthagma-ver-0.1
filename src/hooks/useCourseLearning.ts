import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { useElevenLabsTTS } from "@/hooks/useElevenLabsTTS";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { cacheCourseData, getCachedCourseData } from "@/utils/courseCache";
import { setupOfflineSyncListeners } from "@/utils/offlineSync";
import { showLimitToast } from "@/utils/limitToast";
import { ContentBlock, jsonToBlocks } from "@/components/course-builder/BlockEditor";
import { generateAttestationProtocol } from "@/utils/generateAttestationProtocol";
import { TTSSettings, getStoredTTSSettings, AdminTTSDefaults } from "@/components/student/TTSSettingsDialog";

export interface Lesson {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
  is_locked?: boolean;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  duration: string | null;
  sequential_lessons?: boolean;
  allow_video_seek?: boolean;
  skip_video_identification?: boolean;
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
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [offlineCachedAt, setOfflineCachedAt] = useState<number | undefined>(undefined);

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
  const adminDefaultsLoaded = useRef(false);
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [isBrowserSpeaking, setIsBrowserSpeaking] = useState(false);
  const [isSaluteSpeaking, setIsSaluteSpeaking] = useState(false);
  const [isSaluteLoading, setIsSaluteLoading] = useState(false);
  const saluteAudioRef = useRef<HTMLAudioElement | null>(null);
  const saluteAbortRef = useRef<AbortController | null>(null);
  const saluteCacheRef = useRef<Map<string, string>>(new Map());

  const elevenLabsTTS = useElevenLabsTTS({ voiceId: ttsSettings.voiceId });

  // Video watch progress
  const [videoWatchProgress, setVideoWatchProgress] = useState(0);

  // Feedback state
  const [feedbackAnswer, setFeedbackAnswer] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);

  // AI Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Load admin TTS defaults from ai_settings (context='tts') if no localStorage override
  useEffect(() => {
    if (adminDefaultsLoaded.current) return;
    adminDefaultsLoaded.current = true;

    const TTS_KEY = 'tts-settings';
    if (localStorage.getItem(TTS_KEY)) return; // user already has personal settings

    (async () => {
      try {
        const { data } = await supabase
          .from('ai_settings')
          .select('provider, extra_config')
          .eq('context', 'tts')
          .maybeSingle();

        if (!data) return;
        const ec = data.extra_config as Record<string, unknown> | null;
        const adminDefaults: AdminTTSDefaults = {
          provider: data.provider || undefined,
          saluteVoice: (ec?.salute_voice as string) || undefined,
        };
        setTtsSettings(getStoredTTSSettings(adminDefaults));
      } catch {
        // ignore — fallback to built-in defaults
      }
    })();
  }, []);


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
  const isSpeaking = ttsSettings.provider === 'elevenlabs'
    ? elevenLabsTTS.isActive
    : ttsSettings.provider === 'salutespeech'
      ? (isSaluteSpeaking || isSaluteLoading)
      : isBrowserSpeaking;

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

  const stopSaluteSpeech = useCallback(() => {
    if (saluteAbortRef.current) { saluteAbortRef.current.abort(); saluteAbortRef.current = null; }
    if (saluteAudioRef.current) { saluteAudioRef.current.pause(); saluteAudioRef.current.src = ''; saluteAudioRef.current = null; }
    setIsSaluteSpeaking(false);
    setIsSaluteLoading(false);
  }, []);

  const speakSalute = useCallback(async (text: string) => {
    if (isSaluteSpeaking || isSaluteLoading) { stopSaluteSpeech(); return; }

    // Simple hash for cache key
    const hashText = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return h.toString(36); };
    const cacheKey = `${ttsSettings.saluteVoice}:${hashText(text)}`;
    const cached = saluteCacheRef.current.get(cacheKey);

    if (cached) {
      // Play from cache
      const audio = new Audio(cached);
      saluteAudioRef.current = audio;
      audio.onplay = () => { setIsSaluteLoading(false); setIsSaluteSpeaking(true); };
      audio.onended = () => { setIsSaluteSpeaking(false); };
      audio.onerror = () => { setIsSaluteSpeaking(false); toast.error('Ошибка воспроизведения'); };
      setIsSaluteLoading(true);
      await audio.play();
      return;
    }

    setIsSaluteLoading(true);
    saluteAbortRef.current = new AbortController();
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/salutespeech-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text, voice: ttsSettings.saluteVoice }),
          signal: saluteAbortRef.current.signal,
        }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || `Ошибка SaluteSpeech: ${response.status}`);
        setIsSaluteLoading(false);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      // Save to cache
      saluteCacheRef.current.set(cacheKey, url);
      const audio = new Audio(url);
      saluteAudioRef.current = audio;
      audio.onplay = () => { setIsSaluteLoading(false); setIsSaluteSpeaking(true); };
      audio.onended = () => { setIsSaluteSpeaking(false); };
      audio.onerror = () => { setIsSaluteSpeaking(false); setIsSaluteLoading(false); toast.error('Ошибка воспроизведения'); };
      await audio.play();
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      toast.error('Ошибка озвучивания SaluteSpeech');
      setIsSaluteLoading(false);
    }
  }, [ttsSettings.saluteVoice, isSaluteSpeaking, isSaluteLoading, stopSaluteSpeech]);

  const speakText = () => {
    if (!currentLesson) return;
    const textToSpeak = getTextToSpeak();
    if (!textToSpeak) { toast.error('Нет текста для озвучивания'); return; }

    if (ttsSettings.provider === 'elevenlabs') {
      elevenLabsTTS.speak(textToSpeak);
    } else if (ttsSettings.provider === 'salutespeech') {
      speakSalute(textToSpeak);
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
  useEffect(() => { window.speechSynthesis?.cancel(); setIsBrowserSpeaking(false); elevenLabsTTS.stop(); stopSaluteSpeech(); }, [currentLessonIndex]);
  useEffect(() => { return () => { window.speechSynthesis?.cancel(); elevenLabsTTS.stop(); stopSaluteSpeech(); saluteCacheRef.current.forEach(url => URL.revokeObjectURL(url)); saluteCacheRef.current.clear(); }; }, []);

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
      const { data, error } = await safeInvoke<any>('student-chat', {
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
    setFeedbackAnswer(''); setFeedbackSent(false);
    if (currentLesson?.type === 'test') fetchTestQuestions(currentLesson.id);
  }, [currentLesson?.id]);

  useEffect(() => { if (contentRef.current) contentRef.current.scrollTo({ top: 0, behavior: 'smooth' }); }, [currentLessonIndex]);

  useEffect(() => {
    if (isMobile && lessonButtonRefs.current[currentLessonIndex]) {
      lessonButtonRefs.current[currentLessonIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentLessonIndex, isMobile]);

  // Setup offline sync listeners
  useEffect(() => {
    const cleanup = setupOfflineSyncListeners();
    return cleanup;
  }, []);

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

      // Check video identification requirement
      if (courseData.skip_video_identification === false && user) {
        const { data: profileData } = await supabase.from('profiles').select('organization_id').eq('user_id', user.id).maybeSingle();
        if (profileData?.organization_id) {
          const { data: videoId } = await supabase.from('video_identifications').select('status').eq('user_id', user.id).eq('organization_id', profileData.organization_id).in('status', ['approved', 'verified']).limit(1).maybeSingle();
          if (!videoId) {
            toast.error('Требуется видеоидентификация', { description:"'Пройдите видеоидентификацию перед началом курса'" });
            navigate('/student');
            return;
          }
        }
      }
      if (lessonsResult.error) throw lessonsResult.error;
      const lessonsData = lessonsResult.data || [];
      setLessons(lessonsData);

      let enrollment = enrollmentResult.data;
      if (!enrollment) {
        const { data: newEnrollment, error: createError } = await supabase.from('enrollments').insert({ course_id: courseId, user_id: user!.id }).select().single();
        if (createError) throw createError;
        enrollment = newEnrollment;
      }

      // Check access expiration
      if (enrollment && (enrollment as any).expires_at) {
        const expiresAt = new Date((enrollment as any).expires_at);
        if (expiresAt < new Date() && enrollment.status !== 'completed') {
          toast.error('Доступ к курсу истёк', { description:"'Срок доступа к этому курсу закончился. Обратитесь к администратору.'" });
          navigate('/student');
          return;
        }
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
      let progressData: any[] = [];
      let attMap: Record<string, typeof lessonAttachments[string]> = {};
      
      if (courseLessonIds.length > 0) {
        const [progressResult, attachmentsResult] = await Promise.all([
          supabase.from('lesson_progress').select('lesson_id, completed').eq('user_id', user!.id).in('lesson_id', courseLessonIds),
          supabase.from('lesson_attachments').select('*').in('lesson_id', courseLessonIds).order('order_index'),
        ]);
        if (attachmentsResult.error) {
          console.error('Error fetching lesson attachments:', attachmentsResult.error);
        }
        progressData = progressResult.data || [];
        setLessonProgress(progressData);
        // Group attachments by lesson_id
        for (const a of (attachmentsResult.data || [])) {
          if (!attMap[a.lesson_id]) attMap[a.lesson_id] = [];
          attMap[a.lesson_id].push({ id: a.id, name: a.name, file_url: a.file_url, file_type: a.file_type, file_size: a.file_size ? Number(a.file_size) : null, category: a.category });
        }
        setLessonAttachments(attMap);
      } else {
        setLessonProgress([]);
      }

      // Cache course data to IndexedDB for offline fallback
      if (courseId) {
        cacheCourseData(courseId, courseData, lessonsData, progressData, attMap).catch(() => {});
      }
    } catch (error) {
      console.error('Error fetching course:', error);
      
      // Try loading from cache as fallback
      if (courseId) {
        const cached = await getCachedCourseData(courseId);
        if (cached) {
          setCourse(cached.course);
          setLessons(cached.lessons);
          setLessonProgress(cached.lessonProgress);
          setLessonAttachments(cached.lessonAttachments);
          setIsOfflineMode(true);
          setOfflineCachedAt(cached.cachedAt);
          toast.info('Загружена офлайн-версия курса', { description:"'Данные могут быть устаревшими'" });
        } else {
          toast.error('Ошибка загрузки курса');
        }
      } else {
        toast.error('Ошибка загрузки курса');
      }
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
      const { data: resultsData, error: resultsError } = await safeInvoke<any>('get-test-results', { body: { lesson_id: lessonId } });
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

      // Check trained-per-month limit
      const { data: org } = await supabase.from('organizations').select('id, name, director_name, director_position, subscription_plan').eq('id', profile.organization_id).single();
      if (!org) return;

      const planInfo = (await import('@/constants/subscriptionPlans')).getPlanInfo(org.subscription_plan as any);
      if (planInfo.limits.maxTrainedPerMonth !== -1) {
        const { data: countData } = await supabase.rpc('count_org_completions_this_month' as any, { org_id: profile.organization_id });
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

      if ((course as any).notify_on_completion) {
        try { await safeInvoke('notify-course-completion', { body: { enrollment_id: enrollmentId, course_id: courseId, user_id: user.id } }); } catch (e) { console.error('Notification error:', e); }
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

  const submitFeedback = async () => {
    if (!currentLesson || !user || !feedbackAnswer.trim()) return;
    setFeedbackSending(true);
    try {
      // Get organization_id from course
      const { data: courseData } = await supabase.from('courses').select('organization_id').eq('id', courseId).single();
      if (!courseData?.organization_id) { toast.error('Не удалось определить организацию'); setFeedbackSending(false); return; }

      const messageContent = `📋 Обратная связь (урок "${currentLesson.title}"): ${feedbackAnswer.trim()}`;
      const { error } = await supabase.from('org_student_messages').insert({
        organization_id: courseData.organization_id,
        student_user_id: user.id,
        sender_user_id: user.id,
        content: messageContent,
      });
      if (error) throw error;
      setFeedbackSent(true);
      toast.success('Ваш ответ отправлен');
      await markLessonComplete(false);
    } catch (err) {
      console.error('Feedback submit error:', err);
      toast.error('Ошибка отправки ответа');
    } finally {
      setFeedbackSending(false);
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
      const { data: gradeResult, error: gradeError } = await safeInvoke<any>('grade-test', {
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
    lessonProgress, completedCount, progressPercent, isMobile, user, courseId, lessonAttachments,
    isOfflineMode, offlineCachedAt,

    // Navigation
    navigate, goToNextLesson, goToPrevLesson, goToLesson, isTransitioning,
    sidebarOpen, setSidebarOpen, isLessonCompleted, isLessonAccessible,
    markLessonComplete, resetCourseProgress,

    // Test
    testQuestions, allBankQuestions, answers, setAnswers, testSubmitted,
    testScore, testPassingScore, testExplanations, submitTest, retryTest,

    // Feedback
    feedbackAnswer, setFeedbackAnswer, feedbackSent, feedbackSending, submitFeedback,

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
