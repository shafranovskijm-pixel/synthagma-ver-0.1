import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  Circle, 
  FileText, 
  Video, 
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Eye,
  BookOpen,
  Clock,
  Loader2,
  Edit,
  Headphones,
  Image
} from "lucide-react";
import { ContentBlock, jsonToBlocks, BlockRenderer } from "@/components/course-builder/BlockEditor";
import { cn } from "@/lib/utils";

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
  is_published: boolean;
}

interface TestQuestion {
  id: string;
  question: string;
  options: unknown;
  correct_answer: number;
  order_index: number;
}

// Helper function to parse content
function parseContentToBlocks(content: string): ContentBlock[] {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return jsonToBlocks(content);
  } catch {
    return jsonToBlocks(content);
  }
}

const CoursePreview = () => {
  const { courseId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);
  
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Test state
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});

  const currentLesson = lessons[currentLessonIndex];

  // Parse content blocks
  const contentBlocks: ContentBlock[] = currentLesson?.content 
    ? parseContentToBlocks(currentLesson.content) 
    : [];

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
    setSelectedAnswers({});
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

  const getLessonIcon = (type: string) => {
    switch (type) {
      case 'video': return Video;
      case 'test': return ClipboardList;
      case 'audio': return Headphones;
      case 'image': return Image;
      default: return FileText;
    }
  };

  const getLessonTypeName = (type: string) => {
    switch (type) {
      case 'video': return 'Видео';
      case 'test': return 'Тест';
      case 'audio': return 'Аудио';
      case 'image': return 'Изображение';
      default: return 'Текст';
    }
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
          <Button onClick={() => navigate('/organization')}>
            Вернуться в панель
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
            onClick={() => navigate(`/course-builder/${courseId}`)}
            className="mb-4 hover:bg-secondary"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад в редактор
          </Button>
          
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="gap-1 text-primary border-primary/30 bg-primary/5">
              <Eye className="w-3 h-3" />
              Предпросмотр
            </Badge>
            {!course.is_published && (
              <Badge variant="secondary" className="text-muted-foreground">
                Черновик
              </Badge>
            )}
          </div>
          
          <h2 className="font-display font-bold text-lg line-clamp-2">{course.title}</h2>
          
          {course.description && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
              {course.description}
            </p>
          )}
          
          <div className="mt-4">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Структура курса</span>
              <span className="font-medium">{lessons.length} уроков</span>
            </div>
            <Progress value={(currentLessonIndex + 1) / lessons.length * 100} className="h-2" />
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {lessons.map((lesson, index) => {
              const Icon = getLessonIcon(lesson.type);
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
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                    isCurrent ? "bg-primary/10" : "bg-muted"
                  )}>
                    <span className={cn(
                      "text-sm font-medium",
                      isCurrent ? "text-primary" : "text-muted-foreground"
                    )}>
                      {index + 1}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium line-clamp-2">{lesson.title}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Icon className="w-3 h-3" />
                      {getLessonTypeName(lesson.type)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {/* Sidebar footer */}
        <div className="p-4 border-t border-border space-y-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{lessons.length} уроков</span>
            </div>
          </div>
          
          <Button 
            onClick={() => navigate(`/course-builder/${courseId}`)}
            className="w-full gap-2"
            variant="outline"
          >
            <Edit className="w-4 h-4" />
            Редактировать
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <SigmaLogo size="sm" />
            <span className="text-muted-foreground">|</span>
            <Badge variant="outline" className="gap-1 text-sigma-cyan border-sigma-cyan/30">
              <Eye className="w-3 h-3" />
              Режим предпросмотра
            </Badge>
            <span className="font-medium truncate max-w-md">{currentLesson?.title}</span>
          </div>
          <div className="flex items-center gap-2">
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
              <div className="prose prose-lg dark:prose-invert max-w-none">
                {contentBlocks.length > 0 ? (
                  <BlockRenderer blocks={contentBlocks} />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Контент урока пуст</p>
                    <p className="text-sm">Добавьте содержимое в редакторе</p>
                  </div>
                )}
              </div>
            )}

            {currentLesson?.type === 'video' && (
              <div className="space-y-6">
                {currentLesson.content ? (
                  <div className="aspect-video rounded-2xl overflow-hidden bg-black">
                    <iframe
                      src={currentLesson.content.replace('watch?v=', 'embed/')}
                      className="w-full h-full"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div className="aspect-video rounded-2xl border-2 border-dashed border-border flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <Video className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Видео не добавлено</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentLesson?.type === 'audio' && (
              <div className="space-y-6">
                {currentLesson.content && currentLesson.content.startsWith('http') ? (
                  <div className="bg-card rounded-2xl border border-border p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-16 h-16 rounded-xl bg-green-500/10 flex items-center justify-center">
                        <Headphones className="w-8 h-8 text-green-500" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{currentLesson.title}</h3>
                        <p className="text-sm text-muted-foreground">Аудиолекция</p>
                      </div>
                    </div>
                    <audio controls className="w-full">
                      <source src={currentLesson.content} />
                    </audio>
                  </div>
                ) : (
                  <div className="aspect-[3/1] rounded-2xl border-2 border-dashed border-border flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <Headphones className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Аудио не добавлено</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentLesson?.type === 'image' && (
              <div className="space-y-6">
                <div className="rounded-2xl border-2 border-dashed border-border p-8 flex items-center justify-center min-h-[300px]">
                  <div className="text-center text-muted-foreground">
                    <Image className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Изображение не добавлено</p>
                  </div>
                </div>
              </div>
            )}

            {currentLesson?.type === 'test' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-sigma-orange/10 to-primary/10 rounded-2xl p-6 border border-sigma-orange/20">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-sigma-orange/10 flex items-center justify-center">
                      <ClipboardList className="w-6 h-6 text-sigma-orange" />
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-lg">Тест: {currentLesson.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {testQuestions.length} {testQuestions.length === 1 ? 'вопрос' : testQuestions.length < 5 ? 'вопроса' : 'вопросов'}
                      </p>
                    </div>
                  </div>
                </div>

                {testQuestions.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Вопросы не добавлены</p>
                    <p className="text-sm">Добавьте вопросы в редакторе</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {testQuestions.map((question, qIndex) => {
                      const options = Array.isArray(question.options) 
                        ? question.options 
                        : [];
                      
                      return (
                        <div 
                          key={question.id}
                          className="bg-card rounded-2xl border border-border p-6"
                        >
                          <div className="flex items-start gap-4 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-sm font-bold text-primary">{qIndex + 1}</span>
                            </div>
                            <h4 className="font-medium text-lg">{question.question}</h4>
                          </div>
                          
                          <div className="space-y-3 ml-12">
                            {options.map((option: string, oIndex: number) => (
                              <button
                                key={oIndex}
                                onClick={() => setSelectedAnswers(prev => ({
                                  ...prev,
                                  [question.id]: oIndex
                                }))}
                                className={cn(
                                  "w-full p-4 rounded-xl border text-left transition-all",
                                  selectedAnswers[question.id] === oIndex
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                                    selectedAnswers[question.id] === oIndex
                                      ? "border-primary bg-primary"
                                      : "border-muted-foreground"
                                  )}>
                                    {selectedAnswers[question.id] === oIndex && (
                                      <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                                    )}
                                  </div>
                                  <span>{option}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                          
                          {/* Show correct answer indicator for preview */}
                          <div className="mt-4 ml-12 text-xs text-muted-foreground">
                            Правильный ответ: {question.correct_answer + 1}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center justify-between mt-12 pt-6 border-t border-border">
              <Button
                variant="outline"
                onClick={goToPrevLesson}
                disabled={currentLessonIndex === 0}
                className="gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Предыдущий
              </Button>
              
              {currentLessonIndex < lessons.length - 1 ? (
                <Button
                  onClick={goToNextLesson}
                  className="gap-2 btn-gradient"
                >
                  Следующий
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => navigate(`/course-builder/${courseId}`)}
                  className="gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Вернуться в редактор
                </Button>
              )}
            </div>
          </div>
        </ScrollArea>
      </main>
    </div>
  );
};

export default CoursePreview;
