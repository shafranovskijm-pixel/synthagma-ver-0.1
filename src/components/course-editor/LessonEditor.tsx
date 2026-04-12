import { useState, useEffect, useCallback, useRef } from "react";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Video, HelpCircle, Plus, Trash2, Sparkles, Loader2, Settings, Upload, Cloud, FileSpreadsheet, FolderOpen } from "lucide-react";
import { BlockEditor, ContentBlock } from "@/components/course-builder/BlockEditor";
import { TestImportDialog } from "@/components/course-builder/TestImportDialog";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { useToast } from "@/hooks/use-toast";
import { useExternalStorageWithProgress } from "@/hooks/useExternalStorageWithProgress";
import { Badge } from "@/components/ui/badge";
import { MediaLibraryDialog } from "@/components/course-builder/MediaLibraryDialog";
// Video preview component for lesson editor
function VideoPreview({ videoUrl }: { videoUrl: string }) {
  const isIframeEmbed = (content: string): boolean => {
    return content.trim().startsWith('<iframe') && content.includes('</iframe>');
  };

  const getEmbedFromContent = (content: string): { type: 'iframe' | 'url' | 'direct' | null; value: string | null } => {
    if (!content) return { type: null, value: null };
    
    if (isIframeEmbed(content)) {
      return { type: 'iframe', value: content };
    }
    
    // YouTube
    const ytMatch = content.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) return { type: 'url', value: `https://www.youtube.com/embed/${ytMatch[1]}` };
    
    // Vimeo
    const vimeoMatch = content.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return { type: 'url', value: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
    
    // Rutube
    const rutubeMatch = content.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
    if (rutubeMatch) return { type: 'url', value: `https://rutube.ru/play/embed/${rutubeMatch[1]}` };
    
    // VK Video (vk.com and vkvideo.ru)
    const vkMatch = content.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/);
    if (vkMatch) return { type: 'url', value: `https://vk.com/video_ext.php?oid=${vkMatch[1]}&id=${vkMatch[2]}&hd=2` };
    
    // KTalk recordings (ktalk.ru)
    const ktalkMatch = content.match(/([a-zA-Z0-9]+)\.ktalk\.ru\/recordings\/([a-zA-Z0-9_-]+)/);
    if (ktalkMatch) return { type: 'url', value: `https://${ktalkMatch[1]}.ktalk.ru/recordings/${ktalkMatch[2]}` };
    
    // Яндекс Дзен (dzen.ru)
    const dzenMatch = content.match(/dzen\.ru\/(?:video\/watch|embed)\/([a-zA-Z0-9_-]+)/);
    if (dzenMatch) return { type: 'url', value: `https://dzen.ru/embed/${dzenMatch[1]}` };
    
    // Одноклассники (ok.ru)
    const okMatch = content.match(/ok\.ru\/video\/(\d+)/);
    if (okMatch) return { type: 'url', value: `https://ok.ru/videoembed/${okMatch[1]}` };
    
    // Mail.ru Video
    const mailMatch = content.match(/my\.mail\.ru\/(?:mail|bk|inbox|list)\/([^\/]+)\/video\/([^\/]+)\/(\d+)/);
    if (mailMatch) return { type: 'url', value: `https://my.mail.ru/video/embed/${mailMatch[3]}` };
    
    // Yandex Video (yandex.ru/video)
    const yandexMatch = content.match(/yandex\.ru\/video\/preview\/(\d+)/);
    if (yandexMatch) return { type: 'url', value: `https://yandex.ru/video/preview/${yandexMatch[1]}` };
    
    // Direct video file URLs
    if (content.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i) || content.includes("selstorage.ru")) {
      return { type: 'direct' as any, value: content };
    }

    // Generic video URLs - try direct embed for recording services
    if (content.match(/^https?:\/\/.*\/recordings?\//i) || content.match(/^https?:\/\/.*\/video\//i)) {
      return { type: 'url', value: content };
    }
    
    return { type: null, value: null };
  };

  const embedResult = getEmbedFromContent(videoUrl);

  if (embedResult.type === null) {
    return (
      <div className="aspect-video bg-muted rounded-xl flex items-center justify-center border border-border">
        <div className="text-center">
          <Video className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Превью недоступно</p>
        </div>
      </div>
    );
  }

  if (embedResult.type === 'direct') {
    return (
      <div className="aspect-video bg-black rounded-xl overflow-hidden">
        <video src={embedResult.value || ''} controls className="w-full h-full" controlsList="nodownload" />
      </div>
    );
  }

  return (
    <div className="aspect-video bg-black rounded-xl overflow-hidden">
      {embedResult.type === 'iframe' ? (
        <div 
          className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(embedResult.value || '', {
            ALLOWED_TAGS: ['iframe'],
            ALLOWED_ATTR: ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'title', 'referrerpolicy'],
          }) }}
        />
      ) : (
        <iframe 
          src={embedResult.value || ''} 
          className="w-full h-full border-0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
          allowFullScreen 
        />
      )}
    </div>
  );
}

interface Lesson {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
  course_id?: string;
  test_questions_count?: number;
}

interface TestQuestion {
  id?: string;
  question: string;
  options: string[];
  correct_answer: number;
  order_index: number;
}

interface LessonEditorProps {
  lesson: Lesson | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { 
    title: string; 
    type: string; 
    content: string;
    questions?: TestQuestion[];
    test_questions_count?: number;
  }) => void;
  existingQuestions?: TestQuestion[];
  courseId?: string;
  courseTitle?: string;
  courseDescription?: string;
}

export const LessonEditor = ({ 
  lesson, 
  isOpen, 
  onClose, 
  onSave,
  existingQuestions = [],
  courseId = "",
  courseTitle = "",
  courseDescription = ""
}: LessonEditorProps) => {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("text");
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [testQuestionsCount, setTestQuestionsCount] = useState(5);
  
  // Video upload
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);
  const { uploadWithProgress, abortUpload } = useExternalStorageWithProgress();
  const isUploading = videoUploadProgress !== null;
  // Parse content to blocks or use as video URL
  const parseContent = useCallback((content: string | null, lessonType: string) => {
    if (!content) {
      setBlocks([]);
      setVideoUrl("");
      return;
    }
    
    if (lessonType === "video") {
      setVideoUrl(content);
      setBlocks([]);
      return;
    }
    
    // Try to parse as JSON blocks
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        setBlocks(parsed);
        return;
      }
    } catch {
      // Not JSON, convert markdown to blocks
      const lines = content.split('\n').filter(line => line.trim());
      const convertedBlocks: ContentBlock[] = lines.map((line, index) => {
        const id = crypto.randomUUID();
        
        if (line.startsWith('# ')) {
          return { id, type: 'heading1' as const, content: line.slice(2) };
        }
        if (line.startsWith('## ') || line.startsWith('### ')) {
          return { id, type: 'heading2' as const, content: line.replace(/^#{2,3}\s/, '') };
        }
        if (line.startsWith('> ')) {
          return { id, type: 'quote' as const, content: line.slice(2) };
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return { id, type: 'bulletList' as const, content: line.slice(2) };
        }
        if (/^\d+\.\s/.test(line)) {
          return { id, type: 'numberedList' as const, content: line.replace(/^\d+\.\s/, '') };
        }
        if (line.startsWith('![')) {
          const match = line.match(/!\[.*?\]\((.*?)\)/);
          return { id, type: 'image' as const, content: '', imageSrc: match?.[1] || '' };
        }
        return { id, type: 'paragraph' as const, content: line };
      });
      setBlocks(convertedBlocks.length > 0 ? convertedBlocks : []);
    }
  }, []);

  useEffect(() => {
    if (lesson) {
      setTitle(lesson.title);
      setType(lesson.type);
      parseContent(lesson.content, lesson.type);
      setQuestions(existingQuestions);
      setTestQuestionsCount(lesson.test_questions_count || 5);
    } else {
      setTitle("");
      setType("text");
      setBlocks([]);
      setVideoUrl("");
      setQuestions([]);
      setTestQuestionsCount(5);
    }
  }, [lesson, existingQuestions, isOpen, parseContent]);

  const handleAddQuestion = () => {
    setQuestions([
      ...questions,
      {
        question: "",
        options: ["", "", "", ""],
        correct_answer: 0,
        order_index: questions.length,
      },
    ]);
  };

  const handleUpdateQuestion = (index: number, field: string, value: any) => {
    const updated = [...questions];
    if (field === "option") {
      updated[index].options[value.optionIndex] = value.text;
    } else {
      (updated[index] as any)[field] = value;
    }
    setQuestions(updated);
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleGenerateContent = async () => {
    if (!title.trim()) {
      toast({
        title: "Введите название урока",
        description: "Для генерации контента нужно указать название урока",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await safeInvoke<any>("generate-lesson-content", {
        body: {
          lessonTitle: title,
          lessonType: type,
          courseTitle,
          courseDescription,
        },
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: "Ошибка генерации",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      if (type === "test" && data.questions) {
        setQuestions(
          data.questions.map((q: any, index: number) => ({
            question: q.question,
            options: q.options,
            correct_answer: q.correctAnswer,
            order_index: index,
          }))
        );
        toast({
          title: "✨ Тест сгенерирован",
          description: `Создано ${data.questions.length} вопросов. Отредактируйте их при необходимости.`,
        });
      } else if (data.blocks) {
        const generatedBlocks: ContentBlock[] = data.blocks.map((block: any) => ({
          id: crypto.randomUUID(),
          type: block.type,
          content: block.content,
        }));
        setBlocks(generatedBlocks);
        toast({
          title: "✨ Контент сгенерирован",
          description: "Отредактируйте содержание при необходимости и сохраните урок.",
        });
      }
    } catch (error) {
      console.error("Generate content error:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось сгенерировать контент",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (!title.trim()) return;
    
    let content = "";
    if (type === "text") {
      content = JSON.stringify(blocks);
    } else if (type === "video") {
      content = videoUrl;
    }
    
    onSave({
      title,
      type,
      content,
      questions: type === "test" ? questions : undefined,
      test_questions_count: type === "test" ? testQuestionsCount : undefined,
    });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {lesson ? "Редактировать урок" : "Новый урок"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Название урока *</Label>
                <Input
                  placeholder="Введите название"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label>Тип урока</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Текстовый урок
                      </div>
                    </SelectItem>
                    <SelectItem value="video">
                      <div className="flex items-center gap-2">
                        <Video className="w-4 h-4" />
                        Видео урок
                      </div>
                    </SelectItem>
                    <SelectItem value="test">
                      <div className="flex items-center gap-2">
                        <HelpCircle className="w-4 h-4" />
                        Тест
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {type === "text" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Содержание урока</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateContent}
                    disabled={isGenerating || !title.trim()}
                    className="gap-2"
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {isGenerating ? "Генерация..." : "Сгенерировать ИИ"}
                  </Button>
                </div>
                <BlockEditor
                  blocks={blocks}
                  onChange={setBlocks}
                />
              </div>
            )}

            {type === "video" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Ссылка на видео или embed код</Label>
                      <p className="text-xs text-muted-foreground">YouTube, Vimeo, Rutube, VK, Дзен, OK.ru, Mail.ru или &lt;iframe&gt;</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowMediaLibrary(true)}
                        className="gap-2"
                      >
                        <FolderOpen className="w-4 h-4" />
                        Из загруженных
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => videoInputRef.current?.click()}
                        disabled={isUploading}
                        className="gap-2"
                      >
                        {isUploading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        {isUploading ? "Загрузка..." : "Загрузить видео"}
                      </Button>
                      <input
                        ref={videoInputRef}
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          
                          const fileName = `${courseId}/${Date.now()}-${file.name}`;
                          setVideoUploadProgress(0);
                          try {
                            const result = await uploadWithProgress(file, 'course-files', fileName, (percent) => {
                              setVideoUploadProgress(percent);
                            });
                            
                            if (result) {
                              setVideoUrl(result.url);
                              toast({
                                title: "Видео загружено",
                                description: "Файл успешно загружен",
                              });
                            }
                          } catch (err: any) {
                            if (err.message !== 'Загрузка отменена') {
                              toast({
                                title: "Ошибка загрузки",
                                description: err.message || "Не удалось загрузить видео",
                                variant: "destructive",
                              });
                            }
                          } finally {
                            setVideoUploadProgress(null);
                          }
                          
                          // Reset input
                          e.target.value = '';
                        }}
                      />
                      <MediaLibraryDialog
                        open={showMediaLibrary}
                        onClose={() => setShowMediaLibrary(false)}
                        onSelect={(url) => setVideoUrl(url)}
                        filter="video"
                      />
                    </div>
                  </div>
                  <Textarea
                    placeholder="https://youtube.com/watch?v=... или <iframe>...</iframe>"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    className="min-h-[100px] resize-none"
                  />
                </div>
                {videoUrl && (
                  videoUrl.startsWith('http') && !videoUrl.includes('youtube') && !videoUrl.includes('vimeo') && !videoUrl.includes('rutube') && !videoUrl.includes('vk.') && !videoUrl.includes('dzen') && !videoUrl.includes('ok.ru') && !videoUrl.includes('mail.ru') && !videoUrl.includes('<iframe') ? (
                    <video
                      src={videoUrl}
                      controls
                      className="w-full aspect-video rounded-xl bg-black"
                    />
                  ) : (
                    <VideoPreview videoUrl={videoUrl} />
                  )
                )}
              </div>
            )}

            {type === "test" && (
              <div className="space-y-4">
                {/* Question bank settings */}
                <div className="p-4 bg-muted/30 rounded-xl border border-border space-y-4">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-sm font-semibold">Настройки банка вопросов</Label>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-2">
                        Система будет случайным образом выбирать вопросы из банка. При повторной попытке — новые вопросы.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Вопросов в тесте:</Label>
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={testQuestionsCount}
                        onChange={(e) => setTestQuestionsCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                        className="w-20 h-9"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">
                    Банк вопросов ({questions.length})
                  </Label>
                  <div className="flex items-center gap-2">
                    <TestImportDialog
                      onImport={(imported) => {
                        const newQuestions = imported.map((q, idx) => ({
                          question: q.question,
                          options: q.options,
                          correct_answer: q.correctAnswer,
                          order_index: questions.length + idx,
                        }));
                        setQuestions([...questions, ...newQuestions]);
                      }}
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        Импорт из Excel / TXT
                      </Button>
                    </TestImportDialog>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateContent}
                      disabled={isGenerating || !title.trim()}
                      className="gap-2"
                    >
                      {isGenerating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      {isGenerating ? "Генерация..." : "Сгенерировать ИИ"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddQuestion}
                      className="gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Добавить вопрос
                    </Button>
                  </div>
                </div>

                {questions.length === 0 ? (
                  <div className="text-center py-12 bg-muted/30 rounded-xl border-2 border-dashed border-border">
                    <HelpCircle className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">
                      Добавьте вопросы для теста
                    </p>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      Нажмите кнопку выше чтобы создать первый вопрос
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {questions.map((q, qIndex) => (
                      <div
                        key={qIndex}
                        className="border border-border rounded-xl p-5 space-y-4 bg-card"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <Label className="text-sm font-medium">
                              Вопрос {qIndex + 1}
                            </Label>
                            <Input
                              placeholder="Введите вопрос"
                              value={q.question}
                              onChange={(e) =>
                                handleUpdateQuestion(qIndex, "question", e.target.value)
                              }
                              className="h-11"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveQuestion(qIndex)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-sm">Варианты ответов</Label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {q.options.map((option, oIndex) => (
                              <div
                                key={oIndex}
                                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                                  q.correct_answer === oIndex
                                    ? "border-green-500 bg-green-500/5"
                                    : "border-border"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`correct-${qIndex}`}
                                  checked={q.correct_answer === oIndex}
                                  onChange={() =>
                                    handleUpdateQuestion(qIndex, "correct_answer", oIndex)
                                  }
                                  className="w-4 h-4 accent-green-500"
                                />
                                <Input
                                  placeholder={`Вариант ${oIndex + 1}`}
                                  value={option}
                                  onChange={(e) =>
                                    handleUpdateQuestion(qIndex, "option", {
                                      optionIndex: oIndex,
                                      text: e.target.value,
                                    })
                                  }
                                  className="flex-1 border-0 bg-transparent p-0 h-auto focus-visible:ring-0"
                                />
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            ✓ Выберите правильный ответ
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={onClose} className="flex-1 h-11">
                Отмена
              </Button>
              <Button 
                onClick={handleSave} 
                className="flex-1 btn-gradient h-11"
                disabled={!title.trim()}
              >
                {lesson ? "Сохранить изменения" : "Создать урок"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
