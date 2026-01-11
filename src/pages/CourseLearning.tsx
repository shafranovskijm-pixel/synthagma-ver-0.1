import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import { 
  ArrowLeft, 
  CheckCircle2, 
  Circle, 
  FileText, 
  Video, 
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Sparkles,
  BookOpen,
  Clock,
  Loader2,
  Volume2,
  VolumeX,
  Square,
  Headphones
} from "lucide-react";
import { ContentBlock, jsonToBlocks, BlockRenderer } from "@/components/course-builder/BlockEditor";
import { cn } from "@/lib/utils";

// Helper to get text from option (handles both string and {text: string} formats)
const getOptionText = (option: unknown): string => {
  if (typeof option === 'object' && option !== null && 'text' in option) {
    return (option as { text: string }).text;
  }
  return String(option);
};

// Helper to check if content is an iframe embed
const isIframeEmbed = (content: string): boolean => {
  return content.trim().startsWith('<iframe');
};

// Helper function to get embed URL from video content
const getVideoEmbedUrl = (content: string): string | null => {
  if (!content) return null;
  
  // Check if it's an iframe embed code
  const iframeSrcMatch = content.match(/<iframe[^>]*src=["']([^"']+)["']/i);
  if (iframeSrcMatch) {
    return iframeSrcMatch[1];
  }
  
  // YouTube
  const youtubeMatch = content.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }
  
  // Vimeo
  const vimeoMatch = content.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }
  
  // Rutube
  const rutubeMatch = content.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rutubeMatch) {
    return `https://rutube.ru/play/embed/${rutubeMatch[1]}`;
  }
  
  // VK Video
  const vkMatch = content.match(/vk\.com\/video(-?\d+)_(\d+)/);
  if (vkMatch) {
    return `https://vk.com/video_ext.php?oid=${vkMatch[1]}&id=${vkMatch[2]}`;
  }
  
  // Одноклассники
  const okMatch = content.match(/ok\.ru\/video\/(\d+)/);
  if (okMatch) {
    return `https://ok.ru/videoembed/${okMatch[1]}`;
  }
  
  // Mail.ru
  const mailMatch = content.match(/my\.mail\.ru\/video\/embed\/(\d+)/);
  if (mailMatch) {
    return `https://my.mail.ru/video/embed/${mailMatch[1]}`;
  }
  
  // Дзен
  const dzenMatch = content.match(/dzen\.ru\/video\/watch\/([a-zA-Z0-9]+)/);
  if (dzenMatch) {
    return `https://dzen.ru/embed/${dzenMatch[1]}`;
  }
  
  // Яндекс Видео
  const yandexMatch = content.match(/yandex\.ru\/video\/preview\/(\d+)/);
  if (yandexMatch) {
    return `https://yandex.ru/video/preview/${yandexMatch[1]}`;
  }
  
  return null;
};

// Video preview component for learning
const VideoPlayerInline = ({ content }: { content: string }) => {
  if (!content) return null;
  
  // If it's a full iframe embed code, render it directly
  if (isIframeEmbed(content)) {
    const sanitized = DOMPurify.sanitize(content, {
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'src', 'width', 'height', 'title', 'referrerpolicy']
    });
    return (
      <div 
        className="aspect-video w-full rounded-2xl overflow-hidden bg-black"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  }
  
  // Try to get embed URL from link
  const embedUrl = getVideoEmbedUrl(content);
  
  if (embedUrl) {
    return (
      <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black">
        <iframe
          src={embedUrl}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  
  // Fallback to video tag
  return (
    <video 
      controls 
      className="w-full h-full rounded-2xl"
      src={content}
    />
  );
};

interface Lesson {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
}

interface LessonProgress {
  lesson_id: string;
  completed: boolean;
}

interface TestQuestion {
  id: string;
  question: string;
  options: unknown;
  correct_answer: number;
  order_index: number;
  explanation?: string;
  is_bank_question?: boolean;
}

const CourseLearning = () => {
  const { courseId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);
  
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [lessonProgress, setLessonProgress] = useState<LessonProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Test state
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([]);
  const [allBankQuestions, setAllBankQuestions] = useState<TestQuestion[]>([]);
  const [usedQuestionIds, setUsedQuestionIds] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [testScore, setTestScore] = useState<{ score: number; max: number } | null>(null);
  const [testQuestionsCount, setTestQuestionsCount] = useState<number>(5);

  // Text-to-speech state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);

  const currentLesson = lessons[currentLessonIndex];
  const completedCount = lessonProgress.filter(p => p.completed).length;
  const progressPercent = lessons.length > 0 ? (completedCount / lessons.length) * 100 : 0;

  // Parse content blocks
  const contentBlocks: ContentBlock[] = currentLesson?.content 
    ? parseContentToBlocks(currentLesson.content) 
    : [];

  // Text-to-speech functions
  const extractTextFromBlocks = (blocks: ContentBlock[]): string => {
    return blocks.map(block => {
      switch (block.type) {
        case 'paragraph':
        case 'heading1':
        case 'heading2':
        case 'quote':
        case 'callout-info':
        case 'callout-warning':
        case 'callout-tip':
          return block.content?.replace(/<[^>]*>/g, '') || '';
        case 'bulletList':
        case 'numberedList':
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

  const speakText = () => {
    if (!currentLesson) return;

    // Stop if already speaking
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    // Get text to speak
    let textToSpeak = '';
    
    if (currentLesson.type === 'text') {
      if (contentBlocks.length > 0) {
        textToSpeak = extractTextFromBlocks(contentBlocks);
      } else {
        textToSpeak = currentLesson.content?.replace(/<[^>]*>/g, '').replace(/\n/g, '. ') || '';
      }
    } else if (currentLesson.type === 'test') {
      textToSpeak = testQuestions.map((q, i) => {
        const options = Array.isArray(q.options) ? q.options : [];
        const optionsText = options.map((opt, j) => `${j + 1}. ${getOptionText(opt)}`).join('. ');
        return `Вопрос ${i + 1}: ${q.question}. Варианты ответа: ${optionsText}`;
      }).join('. ');
    }

    if (!textToSpeak) {
      toast.error('Нет текста для озвучивания');
      return;
    }

    // Check if speech synthesis is supported
    if (!('speechSynthesis' in window)) {
      toast.error('Озвучивание не поддерживается в вашем браузере');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'ru-RU';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Find Russian voice if available
    const voices = window.speechSynthesis.getVoices();
    const russianVoice = voices.find(v => v.lang.startsWith('ru'));
    if (russianVoice) {
      utterance.voice = russianVoice;
    }

    utterance.onend = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      toast.error('Ошибка озвучивания');
    };

    speechSynthesisRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  // Stop speaking when lesson changes
  useEffect(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [currentLessonIndex]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (courseId && user) {
      fetchCourseData();
    }
  }, [courseId, user]);

  useEffect(() => {
    if (currentLesson?.type === 'test') {
      fetchTestQuestions(currentLesson.id);
    }
  }, [currentLesson?.id]);

  // Scroll to top on lesson change
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentLessonIndex]);

  const fetchCourseData = async () => {
    try {
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (courseError) throw courseError;
      setCourse(courseData);

      const { data: lessonsData, error: lessonsError } = await supabase
        .from('lessons')
        .select('*')
        .eq('course_id', courseId)
        .order('order_index');

      if (lessonsError) throw lessonsError;
      setLessons(lessonsData || []);

      let { data: enrollment, error: enrollmentError } = await supabase
        .from('enrollments')
        .select('*')
        .eq('course_id', courseId)
        .eq('user_id', user!.id)
        .single();

      if (enrollmentError && enrollmentError.code === 'PGRST116') {
        const { data: newEnrollment, error: createError } = await supabase
          .from('enrollments')
          .insert({
            course_id: courseId,
            user_id: user!.id
          })
          .select()
          .single();
        
        if (createError) throw createError;
        enrollment = newEnrollment;
      }

      if (enrollment) {
        setEnrollmentId(enrollment.id);
      }

      const { data: progressData } = await supabase
        .from('lesson_progress')
        .select('lesson_id, completed')
        .eq('user_id', user!.id);

      setLessonProgress(progressData || []);
    } catch (error) {
      console.error('Error fetching course:', error);
      toast.error('Ошибка загрузки курса');
    } finally {
      setLoading(false);
    }
  };

  const fetchTestQuestions = async (lessonId: string) => {
    // Get lesson settings for questions count
    const { data: lessonData } = await supabase
      .from('lessons')
      .select('test_questions_count')
      .eq('id', lessonId)
      .single();
    
    const questionsCount = (lessonData as any)?.test_questions_count || 5;
    setTestQuestionsCount(questionsCount);

    // Get all questions for the bank
    const { data, error } = await supabase
      .from('test_questions')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('order_index');

    if (error) {
      console.error('Error fetching questions:', error);
      return;
    }

    const allQuestions = (data || []) as TestQuestion[];
    setAllBankQuestions(allQuestions);

    // Check for previous attempts
    const { data: attempts } = await supabase
      .from('test_attempts')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('user_id', user!.id)
      .order('completed_at', { ascending: false })
      .limit(1);

    if (attempts && attempts.length > 0) {
      const lastAttempt = attempts[0];
      setTestSubmitted(true);
      setTestScore({ score: lastAttempt.score, max: lastAttempt.max_score });
      const savedAnswers = lastAttempt.answers as Record<string, number>;
      setAnswers(savedAnswers || {});
      
      // Get used question IDs from all previous attempts
      const { data: allAttempts } = await supabase
        .from('test_attempts')
        .select('shown_question_ids')
        .eq('lesson_id', lessonId)
        .eq('user_id', user!.id);
      
      const allUsedIds = new Set<string>();
      allAttempts?.forEach(attempt => {
        const ids = (attempt as any).shown_question_ids as string[] || [];
        ids.forEach(id => allUsedIds.add(id));
      });
      setUsedQuestionIds(Array.from(allUsedIds));
      
      // Show the questions from the last attempt
      const shownIds = (lastAttempt as any).shown_question_ids as string[] || [];
      if (shownIds.length > 0) {
        const shownQuestions = allQuestions.filter(q => shownIds.includes(q.id));
        setTestQuestions(shownQuestions);
      } else {
        setTestQuestions(allQuestions);
      }
    } else {
      // First attempt - select random questions from bank
      selectRandomQuestions(allQuestions, questionsCount, []);
      setUsedQuestionIds([]);
    }
    
    setAnswers({});
  };

  const selectRandomQuestions = (allQuestions: TestQuestion[], count: number, excludeIds: string[]) => {
    // Filter out already used questions if possible
    let availableQuestions = allQuestions.filter(q => !excludeIds.includes(q.id));
    
    // If not enough unused questions, use all questions
    if (availableQuestions.length < count) {
      availableQuestions = allQuestions;
    }
    
    // Shuffle and select
    const shuffled = [...availableQuestions].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));
    
    setTestQuestions(selected);
  };

  const markLessonComplete = async () => {
    if (!currentLesson || !user) return;

    const isCompleted = lessonProgress.some(
      p => p.lesson_id === currentLesson.id && p.completed
    );

    if (isCompleted) {
      goToNextLesson();
      return;
    }

    const { error } = await supabase
      .from('lesson_progress')
      .upsert({
        lesson_id: currentLesson.id,
        user_id: user.id,
        completed: true,
        completed_at: new Date().toISOString()
      }, { onConflict: 'lesson_id,user_id' });

    if (error) {
      const { error: insertError } = await supabase
        .from('lesson_progress')
        .insert({
          lesson_id: currentLesson.id,
          user_id: user.id,
          completed: true,
          completed_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('Error marking complete:', insertError);
        toast.error('Ошибка сохранения прогресса');
        return;
      }
    }

    setLessonProgress(prev => [
      ...prev.filter(p => p.lesson_id !== currentLesson.id),
      { lesson_id: currentLesson.id, completed: true }
    ]);

    const newProgress = Math.round(((completedCount + 1) / lessons.length) * 100);
    await supabase
      .from('enrollments')
      .update({ progress: newProgress })
      .eq('id', enrollmentId);

    toast.success('Урок завершён!');
    goToNextLesson();
  };

  const goToNextLesson = () => {
    if (currentLessonIndex < lessons.length - 1) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentLessonIndex(prev => prev + 1);
        setIsTransitioning(false);
      }, 300);
    }
  };

  const goToPrevLesson = () => {
    if (currentLessonIndex > 0) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentLessonIndex(prev => prev - 1);
        setIsTransitioning(false);
      }, 300);
    }
  };

  const goToLesson = (index: number) => {
    if (index !== currentLessonIndex) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentLessonIndex(index);
        setIsTransitioning(false);
      }, 300);
    }
  };

  const submitTest = async () => {
    if (!currentLesson || !user) return;

    let score = 0;
    testQuestions.forEach(q => {
      if (answers[q.id] === q.correct_answer) {
        score++;
      }
    });

    const maxScore = testQuestions.length;

    const shownIds = testQuestions.map(q => q.id);
    
    const { error } = await supabase
      .from('test_attempts')
      .insert({
        lesson_id: currentLesson.id,
        user_id: user.id,
        score,
        max_score: maxScore,
        answers,
        shown_question_ids: shownIds
      });

    if (error) {
      console.error('Error saving test:', error);
      toast.error('Ошибка сохранения результата');
      return;
    }

    setTestSubmitted(true);
    setTestScore({ score, max: maxScore });

    if (score / maxScore >= 0.6) {
      await supabase
        .from('lesson_progress')
        .upsert({
          lesson_id: currentLesson.id,
          user_id: user.id,
          completed: true,
          completed_at: new Date().toISOString()
        }, { onConflict: 'lesson_id,user_id' });

      setLessonProgress(prev => [
        ...prev.filter(p => p.lesson_id !== currentLesson.id),
        { lesson_id: currentLesson.id, completed: true }
      ]);

      toast.success(`Тест пройден! ${score}/${maxScore}`);
    } else {
      toast.error(`Тест не пройден. ${score}/${maxScore}. Попробуйте снова.`);
    }
  };

  const retryTest = () => {
    // Select new questions from bank, excluding previously used ones
    const newUsedIds = [...usedQuestionIds, ...testQuestions.map(q => q.id)];
    setUsedQuestionIds(newUsedIds);
    selectRandomQuestions(allBankQuestions, testQuestionsCount, newUsedIds);
    
    setAnswers({});
    setTestSubmitted(false);
    setTestScore(null);
  };

  const getLessonIcon = (type: string) => {
    switch (type) {
      case 'video': return Video;
      case 'test': return ClipboardList;
      case 'audio': return Headphones;
      default: return FileText;
    }
  };

  const isLessonCompleted = (lessonId: string) => {
    return lessonProgress.some(p => p.lesson_id === lessonId && p.completed);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Загрузка курса...</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Курс не найден</h1>
          <Button onClick={() => navigate('/student')}>
            Вернуться в кабинет
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-80 bg-card border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/student')}
            className="mb-4 hover:bg-secondary"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
          <h2 className="font-display font-bold text-lg line-clamp-2">{course.title}</h2>
          <div className="mt-4">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Прогресс</span>
              <span className="font-medium">{completedCount}/{lessons.length}</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {lessons.map((lesson, index) => {
              const Icon = getLessonIcon(lesson.type);
              const completed = isLessonCompleted(lesson.id);
              const isCurrent = index === currentLessonIndex;
              
              return (
                <button
                  key={lesson.id}
                  onClick={() => goToLesson(index)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200",
                    isCurrent 
                      ? "bg-primary/10 text-primary shadow-sm" 
                      : "hover:bg-muted"
                  )}
                >
                  {completed ? (
                    <div className="w-8 h-8 rounded-full bg-sigma-green/10 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-sigma-green" />
                    </div>
                  ) : (
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      isCurrent ? "bg-primary/10" : "bg-muted"
                    )}>
                      <Circle className={cn("w-5 h-5", isCurrent ? "text-primary" : "text-muted-foreground")} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium line-clamp-2">{lesson.title}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Icon className="w-3 h-3" />
                      {lesson.type === 'text' && 'Текст'}
                      {lesson.type === 'video' && 'Видео'}
                      {lesson.type === 'test' && 'Тест'}
                      {lesson.type === 'audio' && 'Аудио'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {/* Sidebar footer with stats */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{lessons.length} уроков</span>
            </div>
            <div className="flex items-center gap-1">
              <Trophy className="w-4 h-4 text-sigma-green" />
              <span>{completedCount} пройдено</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <SigmaLogo size="sm" />
            <span className="text-muted-foreground">|</span>
            <span className="font-medium truncate max-w-md">{currentLesson?.title}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Text-to-speech button */}
            {(currentLesson?.type === 'text' || currentLesson?.type === 'test') && (
              <Button 
                variant={isSpeaking ? "default" : "outline"}
                size="sm"
                onClick={speakText}
                className={cn(
                  "rounded-lg gap-1",
                  isSpeaking && "bg-primary text-primary-foreground"
                )}
                title={isSpeaking ? "Остановить озвучивание" : "Озвучить текст"}
              >
                {isSpeaking ? (
                  <>
                    <Square className="w-4 h-4" />
                    <span className="hidden sm:inline">Стоп</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Озвучить</span>
                  </>
                )}
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm"
              disabled={currentLessonIndex === 0}
              onClick={goToPrevLesson}
              className="rounded-lg"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="px-3 py-1 bg-secondary rounded-lg text-sm">
              <span className="font-medium">{currentLessonIndex + 1}</span>
              <span className="text-muted-foreground"> / {lessons.length}</span>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              disabled={currentLessonIndex === lessons.length - 1}
              onClick={goToNextLesson}
              className="rounded-lg"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Lesson content with animation */}
        <ScrollArea className="flex-1" ref={contentRef}>
          <div 
            className={cn(
              "max-w-4xl mx-auto p-8 transition-all duration-300",
              isTransitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
            )}
          >
            {currentLesson?.type === 'text' && (
              <div className="space-y-6 animate-fade-in">
                {/* Lesson header */}
                <div className="flex items-center gap-3 pb-4 border-b border-border">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h1 className="font-display text-2xl font-bold">{currentLesson.title}</h1>
                    <p className="text-sm text-muted-foreground">Урок {currentLessonIndex + 1}</p>
                  </div>
                </div>

                {/* Block content or raw content */}
                {contentBlocks.length > 0 ? (
                  <BlockRenderer blocks={contentBlocks} />
                ) : (
                  <div className="prose prose-lg max-w-none dark:prose-invert">
                    <div 
                      className="whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ 
                        __html: currentLesson.content?.replace(/\n/g, '<br/>') || '' 
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {currentLesson?.type === 'video' && (
              <div className="space-y-6 animate-fade-in">
                {/* Video header */}
                <div className="flex items-center gap-3 pb-4 border-b border-border">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                    <Video className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h1 className="font-display text-2xl font-bold">{currentLesson.title}</h1>
                    <p className="text-sm text-muted-foreground">Видеоурок {currentLessonIndex + 1}</p>
                  </div>
                </div>

                <div className="aspect-video bg-muted rounded-2xl flex items-center justify-center overflow-hidden shadow-lg">
                  {currentLesson.content ? (
                    <VideoPlayerInline content={currentLesson.content} />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Video className="w-16 h-16 mx-auto mb-4" />
                      <p>Видео не загружено</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentLesson?.type === 'audio' && (
              <div className="space-y-6 animate-fade-in">
                {/* Audio header */}
                <div className="flex items-center gap-3 pb-4 border-b border-border">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <Headphones className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <h1 className="font-display text-2xl font-bold">{currentLesson.title}</h1>
                    <p className="text-sm text-muted-foreground">Аудиолекция {currentLessonIndex + 1}</p>
                  </div>
                </div>

                <div className="bg-card rounded-2xl border border-border p-6">
                  {currentLesson.content && currentLesson.content.startsWith('http') ? (
                    <audio controls className="w-full">
                      <source src={currentLesson.content} type="audio/mpeg" />
                      <source src={currentLesson.content} type="audio/wav" />
                      <source src={currentLesson.content} type="audio/ogg" />
                      Ваш браузер не поддерживает аудио.
                    </audio>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      <Headphones className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p>Аудио не загружено</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentLesson?.type === 'test' && (
              <div className="space-y-6 animate-fade-in">
                {/* Test header */}
                <div className="flex items-center gap-3 pb-4 border-b border-border">
                  <div className="w-10 h-10 rounded-xl bg-sigma-purple/10 flex items-center justify-center">
                    <ClipboardList className="w-5 h-5 text-sigma-purple" />
                  </div>
                  <div>
                    <h1 className="font-display text-2xl font-bold">{currentLesson.title}</h1>
                    <p className="text-sm text-muted-foreground">Тестирование • {testQuestions.length} вопросов</p>
                  </div>
                </div>

                {testScore && (
                  <div className={cn(
                    "p-6 rounded-2xl border transition-all",
                    testScore.score / testScore.max >= 0.6 
                      ? "bg-sigma-green/10 border-sigma-green/20" 
                      : "bg-destructive/10 border-destructive/20"
                  )}>
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-16 h-16 rounded-full flex items-center justify-center",
                        testScore.score / testScore.max >= 0.6 
                          ? "bg-sigma-green/20" 
                          : "bg-destructive/20"
                      )}>
                        <Trophy className={cn(
                          "w-8 h-8",
                          testScore.score / testScore.max >= 0.6 
                            ? "text-sigma-green" 
                            : "text-destructive"
                        )} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">
                          {testScore.score / testScore.max >= 0.6 ? 'Тест пройден!' : 'Тест не пройден'}
                        </h3>
                        <p className="text-muted-foreground">
                          Результат: {testScore.score} из {testScore.max} ({Math.round(testScore.score / testScore.max * 100)}%)
                        </p>
                      </div>
                    </div>
                    {testScore.score / testScore.max < 0.6 && (
                      <Button className="mt-4" onClick={retryTest}>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Попробовать снова
                      </Button>
                    )}
                  </div>
                )}

                {!testSubmitted && testQuestions.map((question, qIndex) => (
                  <div 
                    key={question.id} 
                    className="bg-card rounded-2xl p-6 border border-border shadow-sm hover:shadow-md transition-shadow"
                    style={{ animationDelay: `${qIndex * 100}ms` }}
                  >
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                        {qIndex + 1}
                      </span>
                      {question.question}
                    </h3>
                    <div className="space-y-2">
                      {(Array.isArray(question.options) ? question.options : []).map((option: unknown, oIndex: number) => (
                        <div 
                          key={oIndex}
                          onClick={() => setAnswers(prev => ({ ...prev, [question.id]: oIndex }))}
                          className={cn(
                            "flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all",
                            answers[question.id] === oIndex 
                              ? "border-primary bg-primary/5 shadow-sm" 
                              : "border-border hover:bg-muted hover:border-primary/30"
                          )}
                        >
                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                            answers[question.id] === oIndex 
                              ? "border-primary bg-primary" 
                              : "border-muted-foreground"
                          )}>
                            {answers[question.id] === oIndex && (
                              <div className="w-2 h-2 rounded-full bg-white" />
                            )}
                          </div>
                          <span>{getOptionText(option)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {testSubmitted && testQuestions.map((question, qIndex) => {
                  const userAnswer = answers[question.id];
                  const isAnswerCorrect = userAnswer === question.correct_answer;
                  
                  return (
                    <div key={question.id} className="bg-card rounded-2xl p-6 border border-border">
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                          {qIndex + 1}
                        </span>
                        {question.question}
                      </h3>
                      <div className="space-y-2">
                        {(Array.isArray(question.options) ? question.options : []).map((option: unknown, oIndex: number) => {
                          const isSelected = answers[question.id] === oIndex;
                          const isCorrect = question.correct_answer === oIndex;
                          
                          return (
                            <div 
                              key={oIndex}
                              className={cn(
                                "flex items-center gap-3 p-4 rounded-xl border",
                                isCorrect 
                                  ? "border-sigma-green bg-sigma-green/10" 
                                  : isSelected 
                                    ? "border-destructive bg-destructive/10" 
                                    : "border-border"
                              )}
                            >
                              <span className={isCorrect ? "text-sigma-green" : isSelected ? "text-destructive" : ""}>
                                {getOptionText(option)}
                              </span>
                              {isCorrect && <CheckCircle2 className="w-5 h-5 text-sigma-green ml-auto" />}
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Show explanation for wrong answers */}
                      {!isAnswerCorrect && question.explanation && (
                        <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                          <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-amber-600 text-sm">💡</span>
                            </div>
                            <div>
                              <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">Пояснение:</p>
                              <p className="text-sm text-foreground">{question.explanation}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <footer className="border-t border-border bg-card px-6 py-4 flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {isLessonCompleted(currentLesson?.id || '') && (
              <span className="flex items-center gap-2 text-sigma-green font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Урок завершён
              </span>
            )}
          </div>
          <div className="flex gap-3">
            {currentLesson?.type === 'test' && !testSubmitted && (
              <Button 
                onClick={submitTest}
                disabled={Object.keys(answers).length !== testQuestions.length}
                className="btn-gradient rounded-xl"
              >
                Отправить ответы
              </Button>
            )}
            {currentLesson?.type !== 'test' && !isLessonCompleted(currentLesson?.id || '') && (
              <Button onClick={markLessonComplete} className="btn-gradient rounded-xl">
                Завершить урок
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
            {isLessonCompleted(currentLesson?.id || '') && currentLessonIndex < lessons.length - 1 && (
              <Button onClick={goToNextLesson} className="btn-gradient rounded-xl">
                Следующий урок
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
            {isLessonCompleted(currentLesson?.id || '') && currentLessonIndex === lessons.length - 1 && (
              <Button onClick={() => navigate('/student')} className="btn-gradient rounded-xl">
                <Trophy className="w-4 h-4 mr-2" />
                Курс завершён!
              </Button>
            )}
          </div>
        </footer>
      </main>
    </div>
  );
};


function parseContentToBlocks(content: string): ContentBlock[] {
  // Try to parse as JSON blocks first
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.every(item => item.type && item.id)) {
      return parsed;
    }
  } catch {
    // Not JSON, return empty to use raw content
  }
  return [];
}

export default CourseLearning;
