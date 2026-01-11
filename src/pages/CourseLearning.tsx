import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  CheckCircle2, 
  Circle, 
  FileText, 
  Video, 
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Trophy
} from "lucide-react";

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
}

const CourseLearning = () => {
  const { courseId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [lessonProgress, setLessonProgress] = useState<LessonProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  
  // Test state
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [testScore, setTestScore] = useState<{ score: number; max: number } | null>(null);

  const currentLesson = lessons[currentLessonIndex];
  const completedCount = lessonProgress.filter(p => p.completed).length;
  const progressPercent = lessons.length > 0 ? (completedCount / lessons.length) * 100 : 0;

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

  const fetchCourseData = async () => {
    try {
      // Fetch course
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (courseError) throw courseError;
      setCourse(courseData);

      // Fetch lessons
      const { data: lessonsData, error: lessonsError } = await supabase
        .from('lessons')
        .select('*')
        .eq('course_id', courseId)
        .order('order_index');

      if (lessonsError) throw lessonsError;
      setLessons(lessonsData || []);

      // Check/create enrollment
      let { data: enrollment, error: enrollmentError } = await supabase
        .from('enrollments')
        .select('*')
        .eq('course_id', courseId)
        .eq('user_id', user!.id)
        .single();

      if (enrollmentError && enrollmentError.code === 'PGRST116') {
        // Create enrollment
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

      // Fetch lesson progress
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
    const { data, error } = await supabase
      .from('test_questions')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('order_index');

    if (error) {
      console.error('Error fetching questions:', error);
      return;
    }

    setTestQuestions(data || []);
    setAnswers({});
    setTestSubmitted(false);
    setTestScore(null);

    // Check if already attempted
    const { data: attempts } = await supabase
      .from('test_attempts')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('user_id', user!.id)
      .order('completed_at', { ascending: false })
      .limit(1);

    if (attempts && attempts.length > 0) {
      setTestSubmitted(true);
      setTestScore({ score: attempts[0].score, max: attempts[0].max_score });
      const savedAnswers = attempts[0].answers as Record<string, number>;
      setAnswers(savedAnswers || {});
    }
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

    // Upsert lesson progress
    const { error } = await supabase
      .from('lesson_progress')
      .upsert({
        lesson_id: currentLesson.id,
        user_id: user.id,
        completed: true,
        completed_at: new Date().toISOString()
      }, { onConflict: 'lesson_id,user_id' });

    if (error) {
      // If upsert fails, try insert
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

    // Update enrollment progress
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
      setCurrentLessonIndex(prev => prev + 1);
    }
  };

  const goToPrevLesson = () => {
    if (currentLessonIndex > 0) {
      setCurrentLessonIndex(prev => prev - 1);
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

    // Save attempt
    const { error } = await supabase
      .from('test_attempts')
      .insert({
        lesson_id: currentLesson.id,
        user_id: user.id,
        score,
        max_score: maxScore,
        answers
      });

    if (error) {
      console.error('Error saving test:', error);
      toast.error('Ошибка сохранения результата');
      return;
    }

    setTestSubmitted(true);
    setTestScore({ score, max: maxScore });

    // Mark lesson as complete if passed (>=60%)
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
    setAnswers({});
    setTestSubmitted(false);
    setTestScore(null);
  };

  const getLessonIcon = (type: string) => {
    switch (type) {
      case 'video': return Video;
      case 'test': return ClipboardList;
      default: return FileText;
    }
  };

  const isLessonCompleted = (lessonId: string) => {
    return lessonProgress.some(p => p.lesson_id === lessonId && p.completed);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
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
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
          <h2 className="font-display font-bold text-lg line-clamp-2">{course.title}</h2>
          <div className="mt-4">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Прогресс</span>
              <span>{completedCount}/{lessons.length}</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2">
            {lessons.map((lesson, index) => {
              const Icon = getLessonIcon(lesson.type);
              const completed = isLessonCompleted(lesson.id);
              const isCurrent = index === currentLessonIndex;
              
              return (
                <button
                  key={lesson.id}
                  onClick={() => setCurrentLessonIndex(index)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                    isCurrent 
                      ? 'bg-primary/10 text-primary' 
                      : 'hover:bg-muted'
                  }`}
                >
                  {completed ? (
                    <CheckCircle2 className="w-5 h-5 text-sigma-green shrink-0" />
                  ) : (
                    <Circle className={`w-5 h-5 shrink-0 ${isCurrent ? 'text-primary' : 'text-muted-foreground'}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium line-clamp-2">{lesson.title}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Icon className="w-3 h-3" />
                      {lesson.type === 'text' && 'Текст'}
                      {lesson.type === 'video' && 'Видео'}
                      {lesson.type === 'test' && 'Тест'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <SigmaLogo size="sm" />
            <span className="text-muted-foreground">|</span>
            <span className="font-medium">{currentLesson?.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              disabled={currentLessonIndex === 0}
              onClick={goToPrevLesson}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              {currentLessonIndex + 1} / {lessons.length}
            </span>
            <Button 
              variant="outline" 
              size="sm"
              disabled={currentLessonIndex === lessons.length - 1}
              onClick={goToNextLesson}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Lesson content */}
        <ScrollArea className="flex-1">
          <div className="max-w-4xl mx-auto p-8">
            {currentLesson?.type === 'text' && (
              <div className="prose prose-lg max-w-none">
                <div 
                  className="whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ 
                    __html: currentLesson.content?.replace(/\n/g, '<br/>') || '' 
                  }}
                />
              </div>
            )}

            {currentLesson?.type === 'video' && (
              <div className="space-y-6">
                <div className="aspect-video bg-muted rounded-xl flex items-center justify-center">
                  {currentLesson.content?.includes('youtube.com') || currentLesson.content?.includes('youtu.be') ? (
                    <iframe
                      className="w-full h-full rounded-xl"
                      src={getYouTubeEmbedUrl(currentLesson.content)}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : currentLesson.content ? (
                    <video 
                      controls 
                      className="w-full h-full rounded-xl"
                      src={currentLesson.content}
                    />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Video className="w-16 h-16 mx-auto mb-4" />
                      <p>Видео не загружено</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentLesson?.type === 'test' && (
              <div className="space-y-6">
                {testScore && (
                  <div className={`p-6 rounded-xl ${
                    testScore.score / testScore.max >= 0.6 
                      ? 'bg-sigma-green/10 border border-sigma-green/20' 
                      : 'bg-destructive/10 border border-destructive/20'
                  }`}>
                    <div className="flex items-center gap-4">
                      <Trophy className={`w-12 h-12 ${
                        testScore.score / testScore.max >= 0.6 
                          ? 'text-sigma-green' 
                          : 'text-destructive'
                      }`} />
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
                        Попробовать снова
                      </Button>
                    )}
                  </div>
                )}

                {!testSubmitted && testQuestions.map((question, qIndex) => (
                  <div key={question.id} className="bg-card rounded-xl p-6 border border-border">
                    <h3 className="font-semibold mb-4">
                      {qIndex + 1}. {question.question}
                    </h3>
                    <div className="space-y-2">
                      {(Array.isArray(question.options) ? question.options : []).map((option: string, oIndex: number) => (
                        <label 
                          key={oIndex}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            answers[question.id] === oIndex 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border hover:bg-muted'
                          }`}
                        >
                          <input
                            type="radio"
                            name={question.id}
                            checked={answers[question.id] === oIndex}
                            onChange={() => setAnswers(prev => ({ ...prev, [question.id]: oIndex }))}
                            className="w-4 h-4"
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {testSubmitted && testQuestions.map((question, qIndex) => (
                  <div key={question.id} className="bg-card rounded-xl p-6 border border-border">
                    <h3 className="font-semibold mb-4">
                      {qIndex + 1}. {question.question}
                    </h3>
                    <div className="space-y-2">
                      {(Array.isArray(question.options) ? question.options : []).map((option: string, oIndex: number) => {
                        const isSelected = answers[question.id] === oIndex;
                        const isCorrect = question.correct_answer === oIndex;
                        
                        return (
                          <div 
                            key={oIndex}
                            className={`flex items-center gap-3 p-3 rounded-lg border ${
                              isCorrect 
                                ? 'border-sigma-green bg-sigma-green/10' 
                                : isSelected 
                                  ? 'border-destructive bg-destructive/10' 
                                  : 'border-border'
                            }`}
                          >
                            <span className={isCorrect ? 'text-sigma-green' : isSelected ? 'text-destructive' : ''}>
                              {option}
                            </span>
                            {isCorrect && <CheckCircle2 className="w-4 h-4 text-sigma-green ml-auto" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <footer className="border-t border-border bg-card px-6 py-4 flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {isLessonCompleted(currentLesson?.id || '') && (
              <span className="flex items-center gap-2 text-sigma-green">
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
              >
                Отправить ответы
              </Button>
            )}
            {currentLesson?.type !== 'test' && !isLessonCompleted(currentLesson?.id || '') && (
              <Button onClick={markLessonComplete}>
                Завершить урок
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
            {isLessonCompleted(currentLesson?.id || '') && currentLessonIndex < lessons.length - 1 && (
              <Button onClick={goToNextLesson}>
                Следующий урок
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
            {isLessonCompleted(currentLesson?.id || '') && currentLessonIndex === lessons.length - 1 && (
              <Button onClick={() => navigate('/student')}>
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

function getYouTubeEmbedUrl(url: string): string {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  const videoId = match && match[2].length === 11 ? match[2] : null;
  return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
}

export default CourseLearning;
