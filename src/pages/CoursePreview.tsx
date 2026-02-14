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
import DOMPurify from "dompurify";
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
  Image,
  Play,
  Presentation
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

// Helper function to check if URL can be embedded in iframe
const canEmbedInIframe = (url: string): boolean => {
  const noEmbedPatterns = [
    /ktalk\.ru/i,
    /zoom\.us/i,
    /teams\.microsoft/i,
    /meet\.google/i
  ];
  return !noEmbedPatterns.some(pattern => pattern.test(url));
};

// Helper function to get embed URL from video content
const getVideoEmbedUrl = (content: string): { url: string; canEmbed: boolean } | null => {
  if (!content) return null;
  
  // Check if it's an iframe embed code
  const iframeSrcMatch = content.match(/<iframe[^>]*src=["']([^"']+)["']/i);
  if (iframeSrcMatch) {
    return { url: iframeSrcMatch[1], canEmbed: true };
  }
  
  // YouTube
  const youtubeMatch = content.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (youtubeMatch) {
    return { url: `https://www.youtube.com/embed/${youtubeMatch[1]}`, canEmbed: true };
  }
  
  // Vimeo
  const vimeoMatch = content.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) {
    return { url: `https://player.vimeo.com/video/${vimeoMatch[1]}`, canEmbed: true };
  }
  
  // Rutube
  const rutubeMatch = content.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rutubeMatch) {
    return { url: `https://rutube.ru/play/embed/${rutubeMatch[1]}`, canEmbed: true };
  }
  
  // VK Video
  const vkMatch = content.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/);
  if (vkMatch) {
    return { url: `https://vk.com/video_ext.php?oid=${vkMatch[1]}&id=${vkMatch[2]}&hd=2`, canEmbed: true };
  }
  
  // KTalk recordings
  const ktalkMatch = content.match(/([a-zA-Z0-9]+)\.ktalk\.ru\/recordings\/([a-zA-Z0-9_-]+)/);
  if (ktalkMatch) {
    return { url: content, canEmbed: false };
  }
  
  // Одноклассники
  const okMatch = content.match(/ok\.ru\/video\/(\d+)/);
  if (okMatch) {
    return { url: `https://ok.ru/videoembed/${okMatch[1]}`, canEmbed: true };
  }
  
  // Дзен
  const dzenMatch = content.match(/dzen\.ru\/video\/watch\/([a-zA-Z0-9]+)/);
  if (dzenMatch) {
    return { url: `https://dzen.ru/embed/${dzenMatch[1]}`, canEmbed: true };
  }
  
  // Generic video URLs
  if (content.match(/^https?:\/\/.+/i)) {
    return { url: content, canEmbed: canEmbedInIframe(content) };
  }
  
  return null;
};

// Check if content is an iframe embed
const isIframeEmbed = (content: string): boolean => {
  return content.trim().startsWith('<iframe');
};

// Video preview component
const VideoPreview = ({ content }: { content: string }) => {
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
  const embedResult = getVideoEmbedUrl(content);
  
  if (embedResult) {
    // If can't embed, show a card with link to open video
    if (!embedResult.canEmbed) {
      return (
        <div className="aspect-video w-full rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex flex-col items-center justify-center gap-4">
          <Video className="w-16 h-16 text-primary/60" />
          <div className="text-center px-4">
            <p className="text-sm font-medium text-foreground mb-1">Видеозапись</p>
            <p className="text-xs text-muted-foreground mb-3">Этот сервис не поддерживает встраивание</p>
            <a
              href={embedResult.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Play className="w-4 h-4" />
              Открыть видео
            </a>
          </div>
        </div>
      );
    }
    
    return (
      <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black">
        <iframe
          src={embedResult.url}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  
  return (
    <div className="aspect-video w-full rounded-2xl overflow-hidden bg-muted flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Неподдерживаемый формат видео</p>
    </div>
  );
};

// Slider content types and helper
interface SliderSlide {
  id: string;
  content: string;
  title?: string;
  imageUrl?: string;
}

interface SliderContent {
  slides: SliderSlide[];
  pptxFileUrl?: string;
}

const parseSliderContent = (content: string | null): SliderContent => {
  try {
    if (!content) return { slides: [] };
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return { slides: parsed };
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        slides: Array.isArray(parsed.slides) ? parsed.slides : [],
        pptxFileUrl: parsed.pptxFileUrl
      };
    }
    return { slides: [] };
  } catch {
    return { slides: [] };
  }
};

// Inline slider viewer for slides without PPTX file
const InlineSliderPreview = ({ slides, title }: { slides: SliderSlide[]; title: string }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const currentSlide = slides[currentIdx];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <Presentation className="w-6 h-6 text-amber-500" />
        </div>
        <div className="flex-1">
          <h3 className="font-display font-bold text-lg">{title}</h3>
          <p className="text-sm text-muted-foreground">{slides.length} слайдов</p>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/30 bg-card overflow-hidden shadow-lg">
        <div className="p-6 min-h-[350px]">
          {currentSlide && (
            <div className="space-y-4">
              {currentSlide.imageUrl && (
                <div className="rounded-lg overflow-hidden border border-border bg-secondary/20">
                  <img src={currentSlide.imageUrl} alt={currentSlide.title || 'Слайд'} className="w-full max-h-[500px] object-contain" />
                </div>
              )}
              <h3 className="text-lg font-semibold">{currentSlide.title}</h3>
              {currentSlide.content && (
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">{currentSlide.content}</div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between p-3 border-t border-amber-500/20 bg-amber-500/5">
          <Button variant="ghost" size="sm" onClick={() => setCurrentIdx(i => Math.max(0, i - 1))} disabled={currentIdx === 0} className="gap-1">
            <ChevronLeft className="w-4 h-4" /> Назад
          </Button>
          <div className="flex gap-1.5">
            {slides.map((_, i) => (
              <button key={i} onClick={() => setCurrentIdx(i)} className={`w-2.5 h-2.5 rounded-full transition-colors ${i === currentIdx ? "bg-amber-500" : "bg-amber-500/30 hover:bg-amber-500/50"}`} />
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setCurrentIdx(i => Math.min(slides.length - 1, i + 1))} disabled={currentIdx === slides.length - 1} className="gap-1">
            Далее <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

// Slider Preview Component
const SliderPreview = ({ content, title }: { content: string | null; title: string }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [viewerError, setViewerError] = useState(false);
  
  const sliderContent = parseSliderContent(content);
  const slides = sliderContent.slides;
  const pptxFileUrl = sliderContent.pptxFileUrl;

  const getViewerUrl = (fileUrl: string): string => {
    const encodedUrl = encodeURIComponent(fileUrl);
    return `https://docs.google.com/gview?url=${encodedUrl}&embedded=true`;
  };

  const handleIframeLoad = () => setIsLoading(false);
  const handleIframeError = () => {
    setIsLoading(false);
    setViewerError(true);
  };

  if (pptxFileUrl) {
    const viewerUrl = getViewerUrl(pptxFileUrl);
    
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Presentation className="w-6 h-6 text-amber-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-display font-bold text-lg">{title}</h3>
            <p className="text-sm text-muted-foreground">{slides.length} слайдов</p>
          </div>
          <a
            href={pptxFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-600 rounded-lg hover:bg-amber-500/20 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Скачать
          </a>
        </div>
        
        <div className="rounded-2xl border border-amber-500/30 bg-card overflow-hidden shadow-lg">
          <div className="relative w-full" style={{ minHeight: '600px' }}>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 z-10">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                  <p className="text-sm text-muted-foreground">Загрузка презентации...</p>
                </div>
              </div>
            )}
            {viewerError ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center p-6">
                  <Presentation className="w-16 h-16 mx-auto mb-4 text-amber-500/50" />
                  <p className="text-muted-foreground mb-4">Не удалось загрузить просмотрщик</p>
                  <a
                    href={pptxFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    Скачать презентацию
                  </a>
                </div>
              </div>
            ) : (
              <iframe
                src={viewerUrl}
                className="w-full h-full border-0"
                style={{ minHeight: '600px' }}
                onLoad={handleIframeLoad}
                onError={handleIframeError}
                title={title}
                allowFullScreen
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // No PPTX URL — render slides inline if available
  if (slides.length > 0) {
    return <InlineSliderPreview slides={slides} title={title} />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border-2 border-dashed border-border p-8 flex items-center justify-center min-h-[300px]">
        <div className="text-center text-muted-foreground">
          <Presentation className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Презентация не загружена</p>
        </div>
      </div>
    </div>
  );
};

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
    // Use secure view that hides correct_answer from students
    const { data, error } = await supabase
      .from('test_questions_for_students')
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
      case 'slider': return Presentation;
      default: return FileText;
    }
  };

  const getLessonTypeName = (type: string) => {
    switch (type) {
      case 'video': return 'Видео';
      case 'test': return 'Тест';
      case 'audio': return 'Аудио';
      case 'image': return 'Изображение';
      case 'slider': return 'Презентация';
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
                  <VideoPreview content={currentLesson.content} />
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
                      <source src={currentLesson.content} type="audio/mpeg" />
                      <source src={currentLesson.content} type="audio/wav" />
                      <source src={currentLesson.content} type="audio/ogg" />
                      Ваш браузер не поддерживает аудио.
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

            {currentLesson?.type === 'slider' && (
              <SliderPreview content={currentLesson.content} title={currentLesson.title} />
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
                            {options.map((option: unknown, oIndex: number) => {
                              // Handle both string and object formats
                              const optionText = typeof option === 'object' && option !== null && 'text' in option ? (option as { text: string }).text : String(option);
                              
                              return (
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
                                    <span>{optionText}</span>
                                  </div>
                                </button>
                              );
                            })}
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
