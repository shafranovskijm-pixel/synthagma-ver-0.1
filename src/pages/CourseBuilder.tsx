import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import DOMPurify from "dompurify";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Plus,
  GripVertical,
  FileText,
  Video,
  Image,
  FileQuestion,
  Trash2,
  Save,
  Eye,
  Sparkles,
  Upload,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileUp,
  Headphones,
  Volume2,
  Pause,
  Play,
  Square,
  Presentation,
  Wand2,
  FileSpreadsheet,
} from "lucide-react";
import { AIGenerateDialog, AIGenerateType } from "@/components/course-builder/AIGenerateDialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { BlockEditor, ContentBlock, htmlToBlocks, blocksToJson, jsonToBlocks } from "@/components/course-builder/BlockEditor";
import { TestQuestionEditor } from "@/components/course-builder/TestQuestionEditor";
import { TestImportDialog } from "@/components/course-builder/TestImportDialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  getExternalStorageConfig, uploadToStorage, canEmbedInIframe,
  getVideoEmbedUrl, isIframeEmbed, parseSliderContent,
  type SliderSlide, type SliderContent,
} from "@/utils/courseBuilderHelpers";
import {
  type LessonType, type TestQuestionLocal, type Lesson, type GeneratedQuestion,
  lessonIcons, lessonColors,
} from "@/components/course-builder/LessonTypeConfig";

// VideoPreviewInline component
const VideoPreviewInline = ({ content }: { content: string }) => {
  if (!content) return null;

  if (isIframeEmbed(content)) {
    const sanitized = DOMPurify.sanitize(content, {
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'src', 'width', 'height', 'title', 'referrerpolicy']
    });
    return (
      <div
        className="aspect-video w-full rounded-xl overflow-hidden bg-muted"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  }

  const embedResult = getVideoEmbedUrl(content);

  if (embedResult) {
    if (!embedResult.canEmbed) {
      return (
        <div className="aspect-video w-full rounded-xl overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex flex-col items-center justify-center gap-4">
          <Video className="w-16 h-16 text-primary/60" />
          <div className="text-center px-4">
            <p className="text-sm font-medium text-foreground mb-1">Видеозапись</p>
            <p className="text-xs text-muted-foreground mb-3">Этот сервис не поддерживает встраивание</p>
            <a href={embedResult.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              <Play className="w-4 h-4" />
              Открыть видео
            </a>
          </div>
        </div>
      );
    }
    return (
      <div className="aspect-video w-full rounded-xl overflow-hidden bg-muted">
        <iframe src={embedResult.url} className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen />
      </div>
    );
  }

  return (
    <div className="aspect-video w-full rounded-xl overflow-hidden bg-muted flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Неподдерживаемый формат видео</p>
    </div>
  );
};

interface SliderLessonEditorProps {
  lesson: Lesson;
  courseId: string | undefined;
  onUpdate: (updates: Partial<Lesson>) => void;
}

function SliderLessonEditor({ lesson, courseId, onUpdate }: SliderLessonEditorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  // Parse slides from content using new helper
  const sliderContent = parseSliderContent(lesson.content);
  const slides = sliderContent.slides;
  const pptxFileUrl = sliderContent.pptxFileUrl;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'pptx') {
      setError('Формат .ppt не поддерживается. Откройте файл в PowerPoint и сохраните как .pptx');
      return;
    }

    setIsLoading(true);
    setError(null);
    setUploadProgress('Загрузка файла...');

    try {
      // Upload the PPTX file to PUBLIC presentations bucket (required for Google Docs Viewer)
      // Sanitize filename: remove non-ASCII characters and spaces (Supabase Storage limitation)
      const safeFileName = file.name
        .replace(/[^\x00-\x7F]/g, '') // Remove non-ASCII (Cyrillic, etc.)
        .replace(/\s+/g, '_')         // Replace spaces with underscores
        .replace(/_{2,}/g, '_')       // Collapse multiple underscores
        .replace(/^_|_$/g, '')        // Trim leading/trailing underscores
        || 'presentation.pptx';       // Fallback if name becomes empty
      
      const uploadPath = `${courseId || 'temp'}/${lesson.id}_${Date.now()}_${safeFileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('presentations')
        .upload(uploadPath, file, { upsert: true });
        
      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error('Ошибка загрузки файла');
      }
      
      const { data: { publicUrl } } = supabase.storage
        .from('presentations')
        .getPublicUrl(uploadPath);

      setUploadProgress('Обработка презентации...');

      // Also parse PPTX for slide count info
      const JSZip = (await import('jszip')).default;
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      
      // Get slide files count
      const slideFiles = Object.keys(zip.files)
        .filter(name => name.match(/ppt\/slides\/slide\d+\.xml$/));
      
      const slidesArray: SliderSlide[] = [];
      
      // Create placeholder slides for navigation
      for (let i = 0; i < slideFiles.length; i++) {
        slidesArray.push({
          id: crypto.randomUUID(),
          title: `Слайд ${i + 1}`,
          content: ''
        });
      }
      
      // Save both the file URL and slides info
      const newContent: SliderContent = {
        slides: slidesArray,
        pptxFileUrl: publicUrl
      };
      
      onUpdate({ 
        content: JSON.stringify(newContent),
        title: lesson.title || file.name.replace(/\.pptx$/i, '')
      });
      
      setCurrentIndex(0);
      toast.success(`Загружена презентация с ${slideFiles.length} слайдами`);
    } catch (err) {
      console.error('Error uploading PPTX:', err);
      setError('Ошибка при загрузке файла');
    } finally {
      setIsLoading(false);
      setUploadProgress('');
    }
  };

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentIndex(index);
    }
  };

  const removeSlider = () => {
    onUpdate({ content: '[]' });
    setCurrentIndex(0);
  };

  if (slides.length === 0) {
    return (
      <div className="space-y-3">
        <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
          <Presentation className="w-8 h-8 mx-auto mb-2 text-amber-500" />
          <p className="text-sm text-muted-foreground mb-2">Загрузите презентацию PPTX</p>
          <p className="text-xs text-muted-foreground/70 mb-4">Слайды с изображениями будут отображаться как интерактивный слайдер</p>
          {error && (
            <p className="text-sm text-destructive mb-4">{error}</p>
          )}
          {isLoading && uploadProgress && (
            <p className="text-xs text-amber-500 mb-4">{uploadProgress}</p>
          )}
          <label className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg cursor-pointer hover:border-amber-500 hover:bg-amber-500/5 transition-colors">
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
            ) : (
              <Upload className="w-4 h-4 text-amber-500" />
            )}
            <span className="text-sm">
              {isLoading ? 'Обработка...' : 'Выбрать файл PPTX'}
            </span>
            <input
              type="file"
              accept=".pptx"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isLoading}
            />
          </label>
        </div>
      </div>
    );
  }

  const currentSlide = slides[currentIndex];

  // Generate Google Docs Viewer URL
  const getViewerUrl = (fileUrl: string): string => {
    const encodedUrl = encodeURIComponent(fileUrl);
    return `https://docs.google.com/gview?url=${encodedUrl}&embedded=true`;
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-amber-500/20">
          <div className="flex items-center gap-2 text-amber-500">
            <Presentation className="w-5 h-5" />
            <span className="font-medium text-sm">{slides.length} слайдов</span>
          </div>
          <div className="flex items-center gap-2">
            {pptxFileUrl && (
              <a
                href={pptxFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-500 hover:underline"
              >
                Скачать
              </a>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-destructive hover:text-destructive"
              onClick={removeSlider}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {/* PPTX Preview via Google Docs Viewer */}
        {pptxFileUrl ? (
          <div className="relative bg-white">
            <iframe
              src={getViewerUrl(pptxFileUrl)}
              className="w-full border-0"
              style={{ height: '450px' }}
              title="Предпросмотр презентации"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
            {/* Navigation hint */}
            <div className="flex items-center justify-between p-3 border-t border-amber-500/20 bg-amber-500/5">
              <p className="text-xs text-muted-foreground">
                Используйте стрелки ← → или прокрутку для навигации
              </p>
              <a
                href={getViewerUrl(pptxFileUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-600 rounded-lg hover:bg-amber-500/20 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                На весь экран
              </a>
            </div>
          </div>
        ) : (
          <div className="p-6 min-h-[250px]">
            {currentSlide && (
              <div className="space-y-4">
                {currentSlide.imageUrl && (
                  <div className="rounded-lg overflow-hidden border border-border bg-secondary/20">
                    <img 
                      src={currentSlide.imageUrl} 
                      alt={currentSlide.title || 'Слайд'} 
                      className="w-full max-h-[400px] object-contain"
                    />
                  </div>
                )}
                <h3 className="text-lg font-semibold">{currentSlide.title}</h3>
                {currentSlide.content && (
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {currentSlide.content}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navigation only for legacy slides without PPTX viewer */}
        {!pptxFileUrl && slides.length > 0 && (
          <div className="flex items-center justify-between p-3 border-t border-amber-500/20 bg-amber-500/5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToSlide(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="gap-1"
            >
              <ChevronDown className="w-4 h-4 rotate-90" />
              Назад
            </Button>
            
            <div className="flex gap-1 overflow-x-auto max-w-[200px]">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goToSlide(i)}
                  className={`w-2 h-2 rounded-full transition-colors flex-shrink-0 ${
                    i === currentIndex ? "bg-amber-500" : "bg-amber-500/30 hover:bg-amber-500/50"
                  }`}
                />
              ))}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToSlide(currentIndex + 1)}
              disabled={currentIndex === slides.length - 1}
              className="gap-1"
            >
              Далее
              <ChevronDown className="w-4 h-4 -rotate-90" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

interface SortableLessonProps {
  lesson: Lesson;
  index: number;
  onToggle: () => void;
  onUpdate: (updates: Partial<Lesson>) => void;
  onDelete: () => void;
  courseId: string | undefined;
  courseTitle: string;
  courseDescription: string;
  generatedQuestions?: GeneratedQuestion[];
  onQuestionsProcessed?: () => void;
}

function SortableLessonItem({
  lesson,
  index,
  onToggle,
  onUpdate,
  onDelete,
  courseId,
  courseTitle,
  courseDescription,
  generatedQuestions,
  onQuestionsProcessed
}: SortableLessonProps) {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeechPaused, setIsSpeechPaused] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  // Video upload state
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);
  const videoUploadXhrRef = useRef<XMLHttpRequest | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  const Icon = lessonIcons[lesson.type] || FileText;

  const extractTextFromBlocks = (blocks: ContentBlock[]): string => {
    return blocks
      .filter(b =>
        b.type === "heading1" ||
        b.type === "heading2" ||
        b.type === "quote" ||
        b.type === "bulletList" ||
        b.type === "numberedList" ||
        b.type === "paragraph"
      )
      .map(b => {
        const raw = b.content || "";
        return raw.replace(/<[^>]+>/g, "");
      })
      .filter(t => t.trim())
      .join(". ");
  };

  const handlePlayAudio = () => {
    const blocks = lesson.blocks || [];
    const textToSpeak = extractTextFromBlocks(blocks);
    if (!textToSpeak.trim()) {
      toast.error("Нет текста для озвучивания");
      return;
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("Озвучка не поддерживается в этом браузере");
      return;
    }

    if (isSpeaking) {
      if (isSpeechPaused) {
        window.speechSynthesis.resume();
        setIsSpeechPaused(false);
      } else {
        window.speechSynthesis.pause();
        setIsSpeechPaused(true);
      }
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = "ru-RU";
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsSpeechPaused(false);
      utteranceRef.current = null;
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsSpeechPaused(false);
      utteranceRef.current = null;
      toast.error("Ошибка озвучивания");
    };

    utteranceRef.current = utterance;
    setIsSpeaking(true);
    setIsSpeechPaused(false);
    window.speechSynthesis.speak(utterance);
  };

  const handleStopSpeech = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setIsSpeechPaused(false);
    utteranceRef.current = null;
  };

  useEffect(() => {
    if (!isPreviewMode) {
      handleStopSpeech();
    }
  }, [isPreviewMode]);

  const handleGenerateContent = async () => {
    setIsGeneratingContent(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-lesson-content", {
        body: {
          lessonTitle: lesson.title,
          lessonType: lesson.type,
          courseTitle,
          courseDescription
        }
      });

      if (error) {
        throw new Error(error.message || "Ошибка генерации");
      }

      if (!data.success) {
        throw new Error(data.error || "Ошибка генерации контента");
      }

      if (lesson.type === "test") {
        // For tests, pass questions directly to TestQuestionEditor
        const questions = data.questions || [];
        if (questions.length > 0) {
          onUpdate({
            content: JSON.stringify({ generatedQuestions: questions })
          });
          toast.success(`Сгенерировано ${questions.length} вопросов`);
        }
      } else {
        // For text lessons, convert blocks
        const blocks: ContentBlock[] = (data.blocks || []).map((b: any) => ({
          id: crypto.randomUUID(),
          type: b.type,
          content: b.content
        }));

        if (blocks.length > 0) {
          onUpdate({
            blocks,
            content: blocksToJson(blocks)
          });
          toast.success("Контент сгенерирован");
        } else {
          toast.error("AI не вернул контент");
        }
      }
    } catch (error: any) {
      console.error("Generate content error:", error);
      toast.error(error.message || "Ошибка генерации контента");
    } finally {
      setIsGeneratingContent(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-border rounded-xl overflow-hidden bg-card"
    >
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary/50 transition-colors"
        onClick={onToggle}
      >
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        <span className="text-sm font-medium text-muted-foreground w-8">{index + 1}.</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${lessonColors[lesson.type]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <Input
          value={lesson.title}
          onChange={(e) => {
            e.stopPropagation();
            onUpdate({ title: e.target.value });
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 border-0 bg-transparent focus-visible:ring-0 px-0"
        />
        
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
        {lesson.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </div>

      {lesson.expanded && (
        <div className="p-4 pt-0 border-t border-border">
          {(lesson.type === "text" || lesson.type === "lesson") && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Button
                    variant={isPreviewMode ? "outline" : "default"}
                    size="sm"
                    className="rounded-lg text-xs"
                    onClick={() => setIsPreviewMode(false)}
                  >
                    Редактор
                  </Button>
                  <Button
                    variant={isPreviewMode ? "default" : "outline"}
                    size="sm"
                    className="rounded-lg text-xs gap-1"
                    onClick={() => setIsPreviewMode(true)}
                  >
                    <Eye className="w-3 h-3" />
                    Предпросмотр
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg text-xs gap-1 border-primary text-primary hover:bg-primary/10"
                  onClick={handleGenerateContent}
                  disabled={isGeneratingContent}
                >
                  {isGeneratingContent ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {isGeneratingContent ? "Генерация..." : "Написать с AI"}
                </Button>
              </div>
              {isPreviewMode ? (
                <div className="relative">
                  <div className="bg-secondary/30 rounded-xl p-6 prose prose-sm dark:prose-invert max-w-none min-h-[200px]">
                    <BlockEditor
                      blocks={lesson.blocks || []}
                      onChange={() => {}}
                      readOnly
                    />
                  </div>

                  <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
                    <Button
                      onClick={handlePlayAudio}
                      variant="default"
                      size="icon"
                      className="w-12 h-12 rounded-full shadow-lg"
                      title={isSpeaking ? (isSpeechPaused ? "Продолжить" : "Пауза") : "Озвучить"}
                    >
                      {isSpeaking ? (
                        isSpeechPaused ? (
                          <Play className="w-5 h-5" />
                        ) : (
                          <Pause className="w-5 h-5" />
                        )
                      ) : (
                        <Volume2 className="w-5 h-5" />
                      )}
                    </Button>

                    {isSpeaking && (
                      <Button
                        onClick={handleStopSpeech}
                        variant="destructive"
                        size="icon"
                        className="w-12 h-12 rounded-full shadow-lg"
                        title="Остановить"
                      >
                        <Square className="w-5 h-5" />
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <BlockEditor
                  blocks={lesson.blocks || []}
                  onChange={(blocks) => onUpdate({
                    blocks,
                    content: blocksToJson(blocks)
                  })}
                />
              )}
            </div>
          )}
          {lesson.type === "video" && (
            <div className="space-y-4">
              {/* AI Generated Preview and Script */}
              {(lesson.thumbnailUrl || lesson.videoScript) && (
                <div className="bg-gradient-to-r from-sigma-purple/10 to-primary/10 rounded-xl p-4 border border-sigma-purple/20">
                  <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sigma-purple" />
                    AI-сгенерированный контент
                  </h4>
                  {lesson.thumbnailUrl && (
                    <div className="mb-3">
                      <p className="text-xs text-muted-foreground mb-2">Превью:</p>
                      <img 
                        src={lesson.thumbnailUrl} 
                        alt="Превью видео" 
                        className="rounded-lg max-h-48 object-contain border border-border"
                      />
                    </div>
                  )}
                  {lesson.videoScript && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Сценарий:</p>
                      <div className="bg-background/50 rounded-lg p-3 text-sm max-h-40 overflow-y-auto">
                        {lesson.videoScript}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-3">
                    💡 Для создания видео используйте: Runway ML, Pika Labs, или загрузите готовое видео
                  </p>
                </div>
              )}

              {/* Video Upload Section */}
              <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-sigma-purple/50 transition-colors">
                {videoUploadProgress !== null ? (
                  // Upload in progress
                  <div className="space-y-4">
                    <Video className="w-10 h-10 mx-auto text-sigma-purple animate-pulse" />
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-sigma-purple" />
                        <span className="text-sm font-medium">Загрузка видео...</span>
                      </div>
                      <div className="w-full max-w-xs mx-auto">
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-sigma-purple transition-all duration-300 ease-out"
                            style={{ width: `${videoUploadProgress}%` }}
                          />
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{videoUploadProgress}%</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 gap-1 text-destructive hover:text-destructive border-destructive/50 hover:bg-destructive/10"
                        onClick={() => {
                          if (videoUploadXhrRef.current) {
                            videoUploadXhrRef.current.abort();
                            videoUploadXhrRef.current = null;
                          }
                          setVideoUploadProgress(null);
                          if (videoInputRef.current) {
                            videoInputRef.current.value = '';
                          }
                          toast.info("Загрузка отменена");
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                        Отменить
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Upload button
                  <>
                    <Video className="w-10 h-10 mx-auto mb-3 text-sigma-purple" />
                    <p className="text-sm font-medium mb-1">Загрузить видео на сервер</p>
                    <p className="text-xs text-muted-foreground mb-4">
                      MP4, WebM, MOV — до 500 МБ
                    </p>
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-sigma-purple text-white rounded-lg cursor-pointer hover:bg-sigma-purple/90 transition-colors">
                      <Upload className="w-4 h-4" />
                      <span className="text-sm font-medium">Выбрать файл</span>
                      <input
                        ref={videoInputRef}
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime,video/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          
                          // Check file size (500MB limit)
                          const maxSize = 500 * 1024 * 1024;
                          if (file.size > maxSize) {
                            toast.error("Файл слишком большой. Максимум 500 МБ");
                            return;
                          }
                          
                          if (!courseId) {
                            toast.error("Сначала сохраните курс");
                            return;
                          }
                          
                          setVideoUploadProgress(0);
                          
                          try {
                            const fileExt = file.name.split('.').pop()?.toLowerCase() || 'mp4';
                            const fileName = `video_${lesson.id}_${Date.now()}.${fileExt}`;
                            const filePath = `${courseId}/${fileName}`;
                            
                            // Check for external storage configuration
                            let externalConfig: { configured: boolean; url: string | null; key: string | null } | null = null;
                            try {
                              const { data } = await supabase.functions.invoke('get-external-storage-config');
                              externalConfig = data;
                            } catch {
                              // Fallback to internal
                            }
                            
                            const useExternal = externalConfig?.configured && externalConfig?.url && externalConfig?.key;
                            const baseUrl = useExternal ? externalConfig.url : import.meta.env.VITE_SUPABASE_URL;
                            const apiKey = useExternal ? externalConfig.key : import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
                            // Use course-videos bucket for external, course-files for internal
                            const bucketName = useExternal ? 'course-videos' : 'course-files';
                            
                            // Get auth token
                            let authToken = apiKey;
                            if (!useExternal) {
                              const { data: session } = await supabase.auth.getSession();
                              authToken = session?.session?.access_token || apiKey;
                            }
                            
                            // Use XMLHttpRequest for progress tracking
                            const xhr = new XMLHttpRequest();
                            videoUploadXhrRef.current = xhr;
                            
                            const uploadUrl = `${baseUrl}/storage/v1/object/${bucketName}/${filePath}`;
                            
                            xhr.upload.addEventListener('progress', (event) => {
                              if (event.lengthComputable) {
                                const percent = Math.round((event.loaded / event.total) * 100);
                                setVideoUploadProgress(percent);
                              }
                            });
                            
                            xhr.addEventListener('load', () => {
                              videoUploadXhrRef.current = null;
                              if (xhr.status >= 200 && xhr.status < 300) {
                                const publicUrl = `${baseUrl}/storage/v1/object/public/${bucketName}/${filePath}`;
                                  
                                onUpdate({ content: publicUrl });
                                toast.success(useExternal ? "Видео загружено во внешнее хранилище!" : "Видео загружено!");
                              } else {
                                toast.error(`Ошибка загрузки: ${xhr.statusText || 'Неизвестная ошибка'}`);
                              }
                              setVideoUploadProgress(null);
                              if (videoInputRef.current) {
                                videoInputRef.current.value = '';
                              }
                            });
                            
                            xhr.addEventListener('error', () => {
                              videoUploadXhrRef.current = null;
                              toast.error("Ошибка соединения при загрузке");
                              setVideoUploadProgress(null);
                              if (videoInputRef.current) {
                                videoInputRef.current.value = '';
                              }
                            });
                            
                            xhr.addEventListener('abort', () => {
                              videoUploadXhrRef.current = null;
                              setVideoUploadProgress(null);
                              if (videoInputRef.current) {
                                videoInputRef.current.value = '';
                              }
                            });
                            
                            xhr.open('POST', uploadUrl, true);
                            xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
                            xhr.setRequestHeader('apikey', apiKey!);
                            xhr.setRequestHeader('x-upsert', 'true');
                            xhr.send(file);
                            
                          } catch (error: any) {
                            console.error("Video upload error:", error);
                            toast.error(`Ошибка загрузки: ${error.message}`);
                            setVideoUploadProgress(null);
                            videoUploadXhrRef.current = null;
                            if (videoInputRef.current) {
                              videoInputRef.current.value = '';
                            }
                          }
                        }}
                      />
                    </label>
                  </>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">или вставьте ссылку</span>
                </div>
              </div>

              {/* Video URL Input */}
              <div className="space-y-2">
                <Label>Ссылка на видео или код для встраивания</Label>
                <Textarea
                  value={lesson.content || ''}
                  onChange={(e) => onUpdate({ content: e.target.value })}
                  placeholder="Вставьте ссылку (YouTube, Vimeo, Rutube, VK Video, Дзен и др.) или код iframe для встраивания"
                  className="rounded-xl min-h-[100px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Поддерживаются: YouTube, Vimeo, Rutube, VK Video, Одноклассники, Mail.ru, Дзен, Яндекс Видео
                </p>
              </div>

              {/* Video Preview */}
              {lesson.content && (
                <div className="space-y-2">
                  <Label className="text-sm">Предпросмотр</Label>
                  {lesson.content.includes('supabase') || lesson.content.includes('.mp4') || lesson.content.includes('.webm') || lesson.content.includes('.mov') ? (
                    <div className="relative">
                      <video 
                        controls 
                        className="w-full rounded-xl border border-border"
                        src={lesson.content}
                      >
                        Ваш браузер не поддерживает видео.
                      </video>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2 h-8 text-destructive hover:text-destructive bg-background/80 backdrop-blur-sm"
                        onClick={() => onUpdate({ content: '' })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <VideoPreviewInline content={lesson.content} />
                  )}
                </div>
              )}
            </div>
          )}
          {lesson.type === "audio" && (
            <div className="space-y-3">
              <Input
                value={lesson.content}
                onChange={(e) => onUpdate({ content: e.target.value })}
                placeholder="Вставьте ссылку на аудио или загрузите файл"
                className="rounded-xl"
              />
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                <Headphones className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Загрузите аудиофайл (MP3, WAV, OGG)</p>
                <input
                  type="file"
                  accept="audio/*"
                  className="mt-3"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file && courseId) {
                      const toastId = toast.loading("Загрузка аудио...");
                      try {
                        const fileExt = file.name.split('.').pop();
                        const fileName = `audio_${lesson.id}_${Date.now()}.${fileExt}`;
                        const filePath = `${courseId}/${fileName}`;
                        
                        const result = await uploadToStorage(file, 'course-files', filePath);
                        if (!result) throw new Error('Upload failed');
                          
                        onUpdate({ content: result.url });
                        toast.success(result.storage === 'external' ? "Аудио загружено во внешнее хранилище!" : "Аудио загружено!", { id: toastId });
                      } catch (error: any) {
                        console.error("Audio upload error:", error);
                        toast.error(`Ошибка загрузки: ${error.message}`, { id: toastId });
                      }
                    }
                  }}
                />
              </div>
              {lesson.content && lesson.content.startsWith('http') && (
                <audio controls className="w-full mt-2">
                  <source src={lesson.content} type="audio/mpeg" />
                  <source src={lesson.content} type="audio/wav" />
                  <source src={lesson.content} type="audio/ogg" />
                  Ваш браузер не поддерживает аудио.
                </audio>
              )}
            </div>
          )}
          {lesson.type === "image" && (
            <div className="space-y-3">
              <Input
                value={lesson.content}
                onChange={(e) => onUpdate({ content: e.target.value })}
                placeholder="Вставьте ссылку на изображение или загрузите файл"
                className="rounded-xl"
              />
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                <Image className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Загрузите изображение (JPG, PNG, GIF, WebP)</p>
                <input
                  type="file"
                  accept="image/*"
                  className="mt-3"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file && courseId) {
                      const toastId = toast.loading("Загрузка изображения...");
                      try {
                        const fileExt = file.name.split('.').pop();
                        const fileName = `image_${lesson.id}_${Date.now()}.${fileExt}`;
                        const filePath = `${courseId}/${fileName}`;
                        
                        const result = await uploadToStorage(file, 'course-files', filePath);
                        if (!result) throw new Error('Upload failed');
                          
                        onUpdate({ content: result.url });
                        toast.success(result.storage === 'external' ? "Изображение загружено во внешнее хранилище!" : "Изображение загружено!", { id: toastId });
                      } catch (error: any) {
                        console.error("Image upload error:", error);
                        toast.error(`Ошибка загрузки: ${error.message}`, { id: toastId });
                      }
                    }
                  }}
                />
              </div>
              {lesson.content && (lesson.content.startsWith('http') || lesson.content.startsWith('data:image')) && (
                <div className="mt-3 rounded-xl overflow-hidden border border-border">
                  <img 
                    src={lesson.content} 
                    alt="Превью" 
                    className="w-full max-h-96 object-contain bg-secondary/20"
                  />
                </div>
              )}
            </div>
          )}
          {lesson.type === "test" && (
            <div className="space-y-4">
              {/* Test Settings */}
              <div className="bg-secondary/30 rounded-xl p-4 border border-border">
                <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <FileQuestion className="w-4 h-4 text-sigma-orange" />
                  Настройки теста
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Проходной балл (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={lesson.testPassingScore ?? 60}
                      onChange={(e) => onUpdate({ testPassingScore: parseInt(e.target.value) || 60 })}
                      className="rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">
                      Минимальный % правильных ответов для прохождения теста
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Показывать вопросов</Label>
                    <Input
                      type="number"
                      min={1}
                      value={lesson.testQuestionsToShow ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        onUpdate({ 
                          testQuestionsToShow: val ? parseInt(val) : null 
                        });
                      }}
                      placeholder="Все"
                      className="rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">
                      Оставьте пустым, чтобы показать все вопросы. Или укажите число — система выберет случайные.
                    </p>
                  </div>
                </div>
              </div>

              {/* Import and AI Generation buttons */}
              <div className="flex justify-end gap-2">
                <TestImportDialog
                  onImport={(imported) => {
                    // Convert imported questions to the format expected by TestQuestionEditor
                    const newQuestions = imported.map((q, idx) => ({
                      question: q.question,
                      options: q.options,
                      correctAnswer: q.correctAnswer,
                    }));
                    // Set generatedQuestions in content to trigger TestQuestionEditor to pick them up
                    onUpdate({ 
                      content: JSON.stringify({ 
                        generatedQuestions: newQuestions 
                      }) 
                    });
                    toast.success(`Импортировано ${imported.length} вопросов`);
                  }}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg text-xs gap-1"
                  >
                    <FileSpreadsheet className="w-3 h-3" />
                    Импорт из Excel
                  </Button>
                </TestImportDialog>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg text-xs gap-1 border-primary text-primary hover:bg-primary/10"
                  onClick={handleGenerateContent}
                  disabled={isGeneratingContent}
                >
                  {isGeneratingContent ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {isGeneratingContent ? "Генерация..." : "Сгенерировать вопросы с AI"}
                </Button>
              </div>
              <TestQuestionEditor
                lessonId={lesson.id}
                courseId={courseId}
                initialQuestions={lesson.questions as any}
                generatedQuestions={(() => {
                  try {
                    const parsed = JSON.parse(lesson.content || '{}');
                    return parsed.generatedQuestions;
                  } catch {
                    return undefined;
                  }
                })()}
                onQuestionsProcessed={() => onUpdate({ content: '' })}
                onQuestionsChange={(questions) => {
                  // Store questions in lesson state for saving with course
                  onUpdate({ questions: questions as TestQuestionLocal[] });
                }}
              />
            </div>
          )}
          {lesson.type === "slider" && (
            <SliderLessonEditor 
              lesson={lesson} 
              courseId={courseId} 
              onUpdate={onUpdate} 
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function CourseBuilder() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const { user } = useAuth();
  const [courseTitle, setCourseTitle] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!courseId);
  const [isImporting, setIsImporting] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showAIGenerateDialog, setShowAIGenerateDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track unsaved changes
  const markAsChanged = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  // Wrapper for setLessons that marks changes
  const updateLessons = useCallback((updater: Lesson[] | ((prev: Lesson[]) => Lesson[])) => {
    setLessons(updater);
    markAsChanged();
  }, [markAsChanged]);

  // Handle back button click
  const handleBackClick = () => {
    if (hasUnsavedChanges) {
      setShowExitDialog(true);
    } else {
      navigate("/organization");
    }
  };

  const handleSaveAndExit = async () => {
    await saveCourse();
    setShowExitDialog(false);
    navigate("/organization");
  };

  const handleExitWithoutSave = () => {
    setShowExitDialog(false);
    navigate("/organization");
  };

  // Import multiple files - chunked to avoid backend worker limits
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const CHUNK_SIZE = 3;

    // Sort files (by number in name, then alphabetically) to keep a sensible course order
    const allFiles = Array.from(fileList).sort((a, b) => {
      const na = a.name.match(/(\d+(?:[\.,]\d+)*)/)?.[1];
      const nb = b.name.match(/(\d+(?:[\.,]\d+)*)/)?.[1];
      if (na && nb) return na.localeCompare(nb, 'ru', { numeric: true });
      return a.name.localeCompare(b.name, 'ru', { numeric: true });
    });

    setIsImporting(true);

    try {
      let totalImported = 0;

      for (let offset = 0; offset < allFiles.length; offset += CHUNK_SIZE) {
        const chunk = allFiles.slice(offset, offset + CHUNK_SIZE);

        const formData = new FormData();
        chunk.forEach((file, i) => formData.append(`file_${offset + i}`, file));

        const { data, error } = await supabase.functions.invoke("import-course", {
          body: formData,
        });

        if (error) {
          throw new Error(error.message || "Ошибка импорта");
        }

        if (!data.success) {
          throw new Error(data.error || 'Ошибка импорта');
        }

        if (!courseTitle && data.courseTitle) {
          setCourseTitle(data.courseTitle);
        }

        const importedLessons: Lesson[] = (data.lessons || []).map((l: any) => {
          const blocks = htmlToBlocks(l.content || "");
          return {
            id: l.id,
            type: "text" as LessonType,
            title: l.title,
            content: blocksToJson(blocks),
            blocks: blocks,
            expanded: false,
          };
        });

        totalImported += importedLessons.length;
        setLessons((prev) => [...prev, ...importedLessons]);
      }

      toast.success(
        `Импортировано ${totalImported} ${totalImported === 1 ? 'лекция' : totalImported < 5 ? 'лекции' : 'лекций'}`
      );
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || 'Ошибка импорта файлов');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      if (isDataLoaded) return;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Profile fetch error:", profileError);
      }

      if (profile?.organization_id) {
        setOrganizationId(profile.organization_id);
      }

      if (courseId) {
        const { data: course } = await supabase
          .from("courses")
          .select("*")
          .eq("id", courseId)
          .single();

        if (course) {
          setCourseTitle(course.title);
          setCourseDescription(course.description || "");
          if (!profile?.organization_id && course.organization_id) {
            setOrganizationId(course.organization_id);
          }
        }

        const { data: lessonsData } = await supabase
          .from("lessons")
          .select("*")
          .eq("course_id", courseId)
          .order("order_index");

        if (lessonsData) {
          // Load questions for test lessons
          const testLessonIds = lessonsData.filter(l => l.type === 'test').map(l => l.id);
          let questionsMap: Record<string, TestQuestionLocal[]> = {};
          
          if (testLessonIds.length > 0) {
            const { data: questionsData } = await supabase
              .from("test_questions")
              .select("*")
              .in("lesson_id", testLessonIds)
              .order("order_index");
            
            if (questionsData) {
              for (const q of questionsData) {
                if (!questionsMap[q.lesson_id]) {
                  questionsMap[q.lesson_id] = [];
                }
                questionsMap[q.lesson_id].push({
                  id: q.id,
                  question: q.question,
                  options: (q.options as unknown as { text: string }[]) || [],
                  correct_answer: q.correct_answer,
                  order_index: q.order_index,
                  explanation: (q as any).explanation || '',
                  image_url: q.image_url || null,
                  isNew: false,
                  isDeleted: false,
                });
              }
            }
          }

          setLessons(lessonsData.map(l => {
            const blocks = l.content ? jsonToBlocks(l.content) : [];
            return {
              id: l.id,
              type: l.type as LessonType,
              title: l.title,
              content: l.content || "",
              blocks: blocks.length > 0 ? blocks : undefined,
              expanded: false,
              // Test settings from DB
              testPassingScore: (l as any).test_passing_score ?? 60,
              testQuestionsToShow: (l as any).test_questions_to_show ?? null,
              // Load questions for test lessons
              questions: l.type === 'test' ? (questionsMap[l.id] || []) : undefined,
            };
          }));
        }
        setIsLoading(false);
      } else {
        setIsLoading(false);
      }

      setIsDataLoaded(true);
    };

    fetchData();
  }, [user, courseId, isDataLoaded]);

  const addLesson = (type: LessonType) => {
    const typeNames: Record<LessonType, string> = {
      text: "урок",
      video: "видеоурок",
      image: "материал",
      test: "тест",
      audio: "аудиолекция",
      lesson: "урок",
      slider: "презентация"
    };
    const newLesson: Lesson = {
      id: crypto.randomUUID(),
      type,
      title: `Новый ${typeNames[type]}`,
      content: "",
      expanded: true,
      blocks: type === "text" ? [] : undefined,
    };
    updateLessons([...lessons, newLesson]);
  };

  const handleGenerateStructure = async () => {
    if (!courseTitle.trim()) {
      toast.error("Введите название курса");
      return;
    }

    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-course-structure", {
        body: { title: courseTitle, description: courseDescription }
      });

      if (error) {
        throw new Error(error.message || "Ошибка генерации");
      }

      if (!data.success) {
        throw new Error(data.error || "Ошибка генерации структуры");
      }

      const generatedLessons: Lesson[] = (data.lessons || []).map((l: any) => ({
        id: crypto.randomUUID(),
        type: l.type as LessonType,
        title: l.title,
        // Для video/audio/image уроков контент должен быть пустым (ждём ссылку от пользователя)
        content: l.type === "text" || l.type === "test" ? (l.description || "") : "",
        expanded: false,
        blocks: l.type === "text" ? [] : undefined,
      }));

      if (generatedLessons.length > 0) {
        // Дополняем существующие уроки, а не заменяем
        setLessons(prev => [...prev, ...generatedLessons]);
        toast.success(`Добавлено ${generatedLessons.length} уроков`);
      } else {
        toast.error("AI не вернул уроки");
      }
    } catch (error: any) {
      console.error("Generate structure error:", error);
      toast.error(error.message || "Ошибка генерации структуры");
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle AI generation from dialog
  const handleAIGenerate = async (type: AIGenerateType, prompt: string) => {
    const typeNames: Record<AIGenerateType, string> = {
      audio: "аудиолекция",
      slides: "презентация",
      video: "видео",
      image: "изображение",
      test: "тест",
    };

    const lessonTypeMap: Record<AIGenerateType, LessonType> = {
      audio: "audio",
      slides: "slider",
      video: "video",
      image: "image",
      test: "test",
    };

    const newLesson: Lesson = {
      id: crypto.randomUUID(),
      type: lessonTypeMap[type],
      title: `AI ${typeNames[type]}: ${prompt.slice(0, 50)}${prompt.length > 50 ? "..." : ""}`,
      content: "",
      expanded: true,
      blocks: type === "slides" ? [] : undefined,
    };

    // For audio - generate with ElevenLabs TTS
    if (type === "audio") {
      try {
        toast.info("Генерация аудио с ElevenLabs...");
        
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ text: prompt, voiceId: "JBFqnCBsd6RMkjVDRZzb" }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Ошибка: ${response.status}`);
        }

        const audioBlob = await response.blob();
        
        // Upload to storage (external or internal)
        const fileName = `audio-${Date.now()}.mp3`;
        
        try {
          const result = await uploadToStorage(audioBlob, 'course-files', fileName, 'audio/mpeg');
          if (result) {
            newLesson.content = result.url;
            toast.success(result.storage === 'external' ? "Аудиолекция загружена во внешнее хранилище!" : "Аудиолекция сгенерирована!");
          } else {
            throw new Error('Upload failed');
          }
        } catch (uploadErr) {
          console.error("Upload error:", uploadErr);
          // Still create lesson with blob URL for preview
          const blobUrl = URL.createObjectURL(audioBlob);
          newLesson.content = blobUrl;
          toast.warning("Аудио создано, но не сохранено в хранилище");
        }
      } catch (error: any) {
        console.error("TTS error:", error);
        toast.error(error.message || "Ошибка генерации аудио");
        return;
      }
    }

    // For test - generate with AI
    if (type === "test") {
      try {
        toast.info("Генерация тестовых вопросов...");
        
        const { data, error } = await supabase.functions.invoke("generate-course-content", {
          body: {
            lessonTitle: prompt,
            courseTitle: courseTitle || "Курс",
            courseDescription: courseDescription || "",
            contentType: "test",
          },
        });

        if (error) throw error;
        
        if (data?.content) {
          newLesson.content = data.content;
        }
        toast.success("Тест сгенерирован!");
      } catch (error: any) {
        console.error("Test generation error:", error);
        toast.error("Ошибка генерации теста");
        return;
      }
    }

    // For slides - generate with AI (with images)
    if (type === "slides") {
      try {
        toast.info("Генерация слайдов с иллюстрациями... Это может занять минуту.");
        
        const { data, error } = await supabase.functions.invoke("generate-course-content", {
          body: {
            lessonTitle: prompt,
            courseTitle: courseTitle || "Курс",
            courseDescription: courseDescription || "",
            contentType: "slides",
          },
        });

        if (error) throw error;
        
        if (data?.content) {
          try {
            const parsedSlides = JSON.parse(data.content);
            if (Array.isArray(parsedSlides)) {
              // Create a slider block with the generated slides
              const sliderBlock = {
                id: crypto.randomUUID(),
                type: "slider" as const,
                content: prompt,
                sliderSlides: parsedSlides.map((s: any) => ({
                  id: s.id || crypto.randomUUID(),
                  title: s.title || "Слайд",
                  content: s.content || "",
                  imageUrl: s.imageUrl || undefined
                })),
                sliderCurrentIndex: 0
              };
              newLesson.blocks = [sliderBlock];
              newLesson.content = JSON.stringify(parsedSlides);
              const imagesCount = parsedSlides.filter((s: any) => s.imageUrl).length;
              toast.success(`Слайды сгенерированы! (${imagesCount} иллюстраций)`);
            } else {
              const slides = [
                { id: crypto.randomUUID(), title: "Введение", content: data.content },
              ];
              const sliderBlock = {
                id: crypto.randomUUID(),
                type: "slider" as const,
                content: prompt,
                sliderSlides: slides,
                sliderCurrentIndex: 0
              };
              newLesson.blocks = [sliderBlock];
              newLesson.content = JSON.stringify(slides);
              toast.success("Слайды сгенерированы!");
            }
          } catch {
            const slides = [
              { id: crypto.randomUUID(), title: prompt.slice(0, 50), content: data.content },
            ];
            const sliderBlock = {
              id: crypto.randomUUID(),
              type: "slider" as const,
              content: prompt,
              sliderSlides: slides,
              sliderCurrentIndex: 0
            };
            newLesson.blocks = [sliderBlock];
            newLesson.content = JSON.stringify(slides);
            toast.success("Слайды сгенерированы!");
          }
        } else {
          const slides = [
            { id: crypto.randomUUID(), title: "Введение", content: prompt },
            { id: crypto.randomUUID(), title: "Основные понятия", content: "" },
            { id: crypto.randomUUID(), title: "Заключение", content: "" },
          ];
          const sliderBlock = {
            id: crypto.randomUUID(),
            type: "slider" as const,
            content: prompt,
            sliderSlides: slides,
            sliderCurrentIndex: 0
          };
          newLesson.blocks = [sliderBlock];
          newLesson.content = JSON.stringify(slides);
          toast.warning("Слайды созданы с базовой структурой");
        }
      } catch (error: any) {
        console.error("Slides generation error:", error);
        const slides = [
          { id: crypto.randomUUID(), title: "Введение", content: prompt },
          { id: crypto.randomUUID(), title: "Основные понятия", content: "" },
          { id: crypto.randomUUID(), title: "Заключение", content: "" },
        ];
        const sliderBlock = {
          id: crypto.randomUUID(),
          type: "slider" as const,
          content: prompt,
          sliderSlides: slides,
          sliderCurrentIndex: 0
        };
        newLesson.blocks = [sliderBlock];
        newLesson.content = JSON.stringify(slides);
        toast.warning("Слайды созданы с базовой структурой");
      }
    }

    // For image - generate with AI
    if (type === "image") {
      try {
        toast.info("Генерация изображения с AI...");
        
        const { data, error } = await supabase.functions.invoke("generate-course-content", {
          body: {
            lessonTitle: prompt,
            courseTitle: courseTitle || "Курс",
            courseDescription: courseDescription || "",
            contentType: "image",
          },
        });

        if (error) throw error;
        
        if (data?.imageUrl) {
          // Create an image block
          const imageBlock = {
            id: crypto.randomUUID(),
            type: "image" as const,
            content: "",
            imageSrc: data.imageUrl,
            imageAlt: prompt
          };
          newLesson.blocks = [imageBlock];
          newLesson.content = data.imageUrl;
          toast.success("Изображение сгенерировано!");
        } else {
          toast.info("Добавьте изображение вручную");
        }
      } catch (error: any) {
        console.error("Image generation error:", error);
        toast.info("Добавьте изображение вручную");
      }
    }

    // For video - generate thumbnail image and script with AI
    if (type === "video") {
      try {
        toast.info("Генерация превью и сценария для видео...");
        
        // Generate a thumbnail image
        const { data: imageData } = await supabase.functions.invoke("generate-course-content", {
          body: {
            lessonTitle: `Video thumbnail: ${prompt}`,
            courseTitle: courseTitle || "Курс",
            courseDescription: courseDescription || "",
            contentType: "image",
          },
        });

        // Generate video script/description
        const { data: scriptData } = await supabase.functions.invoke("generate-course-content", {
          body: {
            lessonTitle: prompt,
            courseTitle: courseTitle || "Курс",
            courseDescription: courseDescription || "",
            contentType: "video_script",
          },
        });

        const thumbnailUrl = imageData?.imageUrl || "";
        const script = scriptData?.content || "";

        // Store thumbnail separately, keep content empty for actual video URL
        newLesson.thumbnailUrl = thumbnailUrl;
        newLesson.videoScript = script;
        newLesson.content = ""; // Keep empty for user to add video URL
        
        if (thumbnailUrl || script) {
          toast.success("Превью и сценарий созданы! Добавьте ссылку на видео.");
        } else {
          toast.info("Добавьте ссылку на видео");
        }
      } catch (error: any) {
        console.error("Video generation error:", error);
        newLesson.content = "";
        toast.info("Добавьте ссылку на видео вручную");
      }
    }

    updateLessons([...lessons, newLesson]);
  };

  const updateLesson = (id: string, updates: Partial<Lesson>) => {
    setLessons(lessons.map(l => l.id === id ? { ...l, ...updates } : l));
    markAsChanged();
  };

  const deleteLesson = (id: string) => {
    setLessons(lessons.filter(l => l.id !== id));
  };

  const toggleLesson = (id: string) => {
    setLessons(lessons.map(l => l.id === id ? { ...l, expanded: !l.expanded } : l));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = lessons.findIndex((l) => l.id === active.id);
      const newIndex = lessons.findIndex((l) => l.id === over.id);
      setLessons(arrayMove(lessons, oldIndex, newIndex));
    }
  };

  const ensureOrganizationId = async (): Promise<string | null> => {
    if (organizationId) return organizationId;
    if (!user) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching organization_id:", error);
      return null;
    }

    const orgId = data?.organization_id ?? null;
    if (orgId) setOrganizationId(orgId);
    return orgId;
  };

  const saveCourse = async () => {
    // Защита от двойного вызова
    if (isSaving) return;
    
    if (!courseTitle.trim()) {
      toast.error("Введите название курса");
      return;
    }

    const orgId = await ensureOrganizationId();
    if (!orgId) {
      toast.error("Не найдена организация");
      return;
    }

    setIsSaving(true);

    try {
      let savedCourseId = courseId;

      if (courseId) {
        const { error } = await supabase
          .from("courses")
          .update({
            title: courseTitle.trim(),
            description: courseDescription.trim() || null,
            is_published: true,
          })
          .eq("id", courseId);

        if (error) throw error;
      } else {
        const { data: newCourse, error } = await supabase
          .from("courses")
          .insert({
            title: courseTitle.trim(),
            description: courseDescription.trim() || null,
            organization_id: orgId,
            is_published: true,
          })
          .select()
          .single();

        if (error) throw error;
        savedCourseId = newCourse.id;
        // Update URL with new course ID
        window.history.replaceState(null, '', `/course-builder/${savedCourseId}`);
      }

      if (lessons.length > 0 && savedCourseId) {
        const currentLessonIds = lessons.map(l => l.id);

        if (courseId) {
          const { error: deleteError } = await supabase
            .from("lessons")
            .delete()
            .eq("course_id", courseId)
            .not("id", "in", `(${currentLessonIds.join(",")})`);

          if (deleteError) {
            console.error("Error deleting removed lessons:", deleteError);
          }
        }

        // Save all lessons first - batch to avoid AbortError
        const lessonsToSave = lessons.map((lesson, index) => ({
          id: lesson.id,
          course_id: savedCourseId!,
          title: lesson.title,
          type: lesson.type,
          content: lesson.content || null,
          order_index: index,
          test_passing_score: lesson.testPassingScore ?? 60,
          test_questions_to_show: lesson.testQuestionsToShow ?? null,
        }));

        const { error: batchUpsertError } = await supabase
          .from("lessons")
          .upsert(lessonsToSave, { onConflict: "id" });

        if (batchUpsertError) {
          // Ignore AbortError - often happens due to race conditions
          if (batchUpsertError.message?.includes('AbortError') || 
              batchUpsertError.message?.includes('signal is aborted')) {
            console.warn("Save was interrupted, retrying may help:", batchUpsertError);
          } else {
            console.error("Error saving lessons:", batchUpsertError);
            toast.error(`Ошибка сохранения уроков: ${batchUpsertError.message}`);
          }
        }

        // Save test questions for each test lesson from local state
        for (const lesson of lessons) {
          if (lesson.type === "test" && lesson.questions && lesson.questions.length > 0) {
            const activeQuestions = lesson.questions.filter(q => !q.isDeleted);
            
            // Delete removed questions
            const toDelete = lesson.questions.filter(q => q.isDeleted && !q.isNew);
            for (const q of toDelete) {
              await supabase
                .from("test_questions")
                .delete()
                .eq("id", q.id);
            }
            
            // Upsert active questions
            for (let i = 0; i < activeQuestions.length; i++) {
              const q = activeQuestions[i];
              const questionData = {
                id: q.id,
                lesson_id: lesson.id,
                question: q.question.trim(),
                options: q.options.filter(o => o.text.trim()),
                correct_answer: q.correct_answer,
                order_index: i,
                explanation: q.explanation || null,
                image_url: q.image_url || null
              };

              const { error: qError } = await supabase
                .from("test_questions")
                .upsert([questionData], { onConflict: "id" });

              if (qError) {
                console.error(`Error saving question:`, qError);
              }
            }
          }
        }
      }

      toast.success(courseId ? "Курс обновлён" : "Курс создан");
      setHasUnsavedChanges(false);
    } catch (error: any) {
      // Ignore AbortError - harmless race condition
      if (error?.name === 'AbortError' || 
          error?.message?.includes('AbortError') || 
          error?.message?.includes('signal is aborted')) {
        console.warn("Save interrupted by AbortError, changes may have been saved:", error);
        toast.success(courseId ? "Курс обновлён" : "Курс создан");
        setHasUnsavedChanges(false);
      } else {
        console.error("Error saving course:", error);
        toast.error("Ошибка сохранения: " + error.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const saveSingleLesson = async (lesson: Lesson, orderIndex: number) => {
    const orgId = await ensureOrganizationId();
    if (!orgId) {
      toast.error("Не найдена организация");
      return;
    }

    setIsSaving(true);

    try {
      let savedCourseId = courseId;

      if (!savedCourseId) {
        if (!courseTitle.trim()) {
          setCourseTitle(lesson.title || "Новый курс");
        }

        const { data: newCourse, error } = await supabase
          .from("courses")
          .insert({
            title: courseTitle.trim() || lesson.title || "Новый курс",
            description: courseDescription.trim() || null,
            organization_id: orgId,
          })
          .select()
          .single();

        if (error) throw error;
        savedCourseId = newCourse.id;

        window.history.replaceState(null, '', `/course-builder/${savedCourseId}`);
      }

      const { data: existingLesson } = await supabase
        .from("lessons")
        .select("id")
        .eq("id", lesson.id)
        .maybeSingle();

      if (existingLesson) {
        const { error } = await supabase
          .from("lessons")
          .update({
            title: lesson.title,
            type: lesson.type,
            content: lesson.content || null,
            order_index: orderIndex,
            // Test-specific settings
            test_passing_score: lesson.testPassingScore ?? 60,
            test_questions_to_show: lesson.testQuestionsToShow ?? null,
          })
          .eq("id", lesson.id);

        if (error) throw error;
        toast.success("Лекция обновлена");
      } else {
        const { error } = await supabase
          .from("lessons")
          .insert({
            id: lesson.id,
            course_id: savedCourseId,
            title: lesson.title,
            type: lesson.type,
            content: lesson.content || null,
            order_index: orderIndex,
            // Test-specific settings
            test_passing_score: lesson.testPassingScore ?? 60,
            test_questions_to_show: lesson.testQuestionsToShow ?? null,
          });

        if (error) throw error;
        toast.success("Лекция сохранена");
      }
    } catch (error: any) {
      console.error("Error saving lesson:", error);
      toast.error("Ошибка сохранения: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl"
                onClick={handleBackClick}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Назад
              </Button>
              <SigmaLogo size="sm" />
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="rounded-xl gap-2"
                disabled={!courseId}
                onClick={() => {
                  if (courseId) {
                    navigate(`/course-preview/${courseId}`);
                  } else {
                    toast.error("Сначала сохраните курс");
                  }
                }}
                title={!courseId ? "Сначала сохраните курс" : "Открыть предпросмотр курса"}
              >
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">Предпросмотр</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Fixed Save Button at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-background via-background to-transparent pb-4 pt-8 pointer-events-none">
        <div className="container mx-auto px-6 pointer-events-auto">
          <div className="flex justify-center">
            <Button
              onClick={saveCourse}
              disabled={isSaving}
              size="lg"
              className="btn-gradient rounded-2xl gap-3 px-8 py-6 text-lg font-semibold shadow-2xl hover:scale-105 transition-transform"
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              {isSaving ? "Сохранение..." : "Сохранить курс"}
              {hasUnsavedChanges && !isSaving && (
                <span className="ml-1 w-2 h-2 rounded-full bg-white/80 animate-pulse" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 pb-32">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Course info */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h2 className="font-display text-xl font-semibold mb-4">Информация о курсе</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Название курса</Label>
                  <Input
                    value={courseTitle}
                    onChange={(e) => { setCourseTitle(e.target.value); markAsChanged(); }}
                    placeholder="Например: Основы безопасности на производстве"
                    className="rounded-xl h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Описание</Label>
                  <Textarea
                    value={courseDescription}
                    onChange={(e) => { setCourseDescription(e.target.value); markAsChanged(); }}
                    placeholder="Краткое описание курса..."
                    className="rounded-xl min-h-[100px]"
                  />
                </div>
                <Button
                  onClick={handleGenerateStructure}
                  disabled={isGenerating || !courseTitle.trim()}
                  className="btn-gradient rounded-xl gap-2 w-full sm:w-auto"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isGenerating ? "Генерация..." : "Сгенерировать структуру с AI"}
                </Button>
              </div>
            </div>

            {/* Import from file */}
            <div className="bg-gradient-to-r from-sigma-cyan/10 via-primary/10 to-sigma-purple/10 rounded-2xl border border-sigma-cyan/20 p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sigma-cyan to-primary flex items-center justify-center flex-shrink-0">
                  <FileUp className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                    <h3 className="font-display font-semibold text-lg mb-1">Импорт лекций из файлов</h3>
                    <p className="text-muted-foreground text-sm mb-2">
                      Загрузите PPTX, DOC, DOCX, HTML или TXT — каждый файл станет лекцией
                    </p>
                  {lessons.length > 0 && (
                    <p className="text-xs text-primary mb-3">
                      ✓ Загружено {lessons.length} {lessons.length === 1 ? 'лекция' : lessons.length < 5 ? 'лекции' : 'лекций'}
                    </p>
                  )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pptx,.doc,.docx,.html,.htm,.txt"
                      onChange={handleFileImport}
                      multiple
                      className="hidden"
                    />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                    className="rounded-xl gap-2"
                    variant="outline"
                  >
                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                    {isImporting ? "Импорт..." : "Загрузить файл"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Lessons */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h2 className="font-display text-xl font-semibold mb-4">Структура курса</h2>

              {lessons.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Добавьте первый урок</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={lessons.map(l => l.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {lessons.map((lesson, index) => (
                        <SortableLessonItem
                          key={lesson.id}
                          lesson={lesson}
                          index={index}
                          onToggle={() => toggleLesson(lesson.id)}
                          onUpdate={(updates) => updateLesson(lesson.id, updates)}
                          onDelete={() => deleteLesson(lesson.id)}
                          courseId={courseId}
                          courseTitle={courseTitle}
                          courseDescription={courseDescription}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-card rounded-2xl border border-border p-6 sticky top-24">
              <h3 className="font-display font-semibold mb-4">Добавить элемент</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => addLesson("text")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium">Текст</span>
                </button>
                <button
                  onClick={() => addLesson("video")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-sigma-purple hover:bg-sigma-purple/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-sigma-purple/10 flex items-center justify-center">
                    <Video className="w-5 h-5 text-sigma-purple" />
                  </div>
                  <span className="text-sm font-medium">Видео</span>
                </button>
                <button
                  onClick={() => addLesson("audio")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-green-500 hover:bg-green-500/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <Headphones className="w-5 h-5 text-green-500" />
                  </div>
                  <span className="text-sm font-medium">Аудио</span>
                </button>
                <button
                  onClick={() => addLesson("image")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-sigma-cyan hover:bg-sigma-cyan/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-sigma-cyan/10 flex items-center justify-center">
                    <Image className="w-5 h-5 text-sigma-cyan" />
                  </div>
                  <span className="text-sm font-medium">Изображение</span>
                </button>
                <button
                  onClick={() => addLesson("test")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-sigma-orange hover:bg-sigma-orange/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-sigma-orange/10 flex items-center justify-center">
                    <FileQuestion className="w-5 h-5 text-sigma-orange" />
                  </div>
                  <span className="text-sm font-medium">Тест</span>
                </button>
                <button
                  onClick={() => addLesson("slider")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-amber-500 hover:bg-amber-500/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Presentation className="w-5 h-5 text-amber-500" />
                  </div>
                  <span className="text-sm font-medium">Слайдер</span>
                </button>
                
                {/* AI Generate Button - spans full width */}
                <button
                  onClick={() => setShowAIGenerateDialog(true)}
                  className="col-span-2 flex items-center justify-center gap-3 p-4 rounded-xl border-2 border-dashed border-primary/50 hover:border-primary hover:bg-primary/5 transition-all bg-gradient-to-r from-primary/5 to-sigma-purple/5"
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-sigma-purple flex items-center justify-center">
                    <Wand2 className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-semibold block">Сгенерировать с ИИ</span>
                    <span className="text-xs text-muted-foreground">Аудио, слайды, тесты и др.</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* AI Generate Dialog */}
      <AIGenerateDialog
        open={showAIGenerateDialog}
        onOpenChange={setShowAIGenerateDialog}
        onGenerate={handleAIGenerate}
        courseTitle={courseTitle}
        courseDescription={courseDescription}
      />
      
      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Несохранённые изменения</AlertDialogTitle>
            <AlertDialogDescription>
              У вас есть несохранённые изменения. Хотите сохранить курс перед выходом?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleExitWithoutSave}>
              Выйти без сохранения
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveAndExit} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Сохранить и выйти
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
