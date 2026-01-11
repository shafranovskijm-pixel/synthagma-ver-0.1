import { useState, useEffect } from "react";
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
import { FileText, Video, HelpCircle, Plus, Trash2, Upload } from "lucide-react";
import { MarkdownEditor } from "./MarkdownEditor";
import { FileUploadDialog } from "./FileUploadDialog";

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
}

export const LessonEditor = ({ 
  lesson, 
  isOpen, 
  onClose, 
  onSave,
  existingQuestions = [],
  courseId = ""
}: LessonEditorProps) => {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("text");
  const [content, setContent] = useState("");
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [isFileUploadOpen, setIsFileUploadOpen] = useState(false);

  useEffect(() => {
    if (lesson) {
      setTitle(lesson.title);
      setType(lesson.type);
      setContent(lesson.content || "");
      setQuestions(existingQuestions);
    } else {
      setTitle("");
      setType("text");
      setContent("");
      setQuestions([]);
    }
  }, [lesson, existingQuestions, isOpen]);

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

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      title,
      type,
      content,
      questions: type === "test" ? questions : undefined,
    });
  };

  const handleFileUpload = (url: string, fileType: "image" | "video" | "file") => {
    if (fileType === "image") {
      setContent(content + `\n![Изображение](${url})\n`);
    } else if (fileType === "video") {
      setContent(content + `\n<video src="${url}" controls></video>\n`);
    } else {
      setContent(content + `\n[Скачать файл](${url})\n`);
    }
    setIsFileUploadOpen(false);
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
                  <Label>Содержание урока (Markdown)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsFileUploadOpen(true)}
                    className="gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Загрузить файл
                  </Button>
                </div>
                <MarkdownEditor
                  value={content}
                  onChange={setContent}
                  onImageUpload={() => setIsFileUploadOpen(true)}
                />
              </div>
            )}

            {type === "video" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Ссылка на видео (YouTube, Vimeo)</Label>
                  <Input
                    placeholder="https://youtube.com/watch?v=..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="h-11"
                  />
                </div>
                {content && (
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

      <FileUploadDialog
        isOpen={isFileUploadOpen}
        onClose={() => setIsFileUploadOpen(false)}
        onUpload={handleFileUpload}
        courseId={courseId || lesson?.course_id || ""}
      />
    </>
  );
};
