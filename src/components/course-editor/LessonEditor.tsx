import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { FileText, Video, HelpCircle, Plus, Trash2, Sparkles, Loader2 } from "lucide-react";
import { BlockEditor, ContentBlock } from "@/components/course-builder/BlockEditor";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Lesson {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
  course_id?: string;
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
    } else {
      setTitle("");
      setType("text");
      setBlocks([]);
      setVideoUrl("");
      setQuestions([]);
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
      const { data, error } = await supabase.functions.invoke("generate-lesson-content", {
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
                  <Label>Ссылка на видео (YouTube, Vimeo)</Label>
                  <Input
                    placeholder="https://youtube.com/watch?v=..."
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    className="h-11"
                  />
                </div>
                {videoUrl && (
                  <div className="aspect-video bg-muted rounded-xl flex items-center justify-center border border-border">
                    <Video className="w-16 h-16 text-muted-foreground/30" />
                  </div>
                )}
              </div>
            )}

            {type === "test" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Вопросы теста</Label>
                  <div className="flex items-center gap-2">
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
