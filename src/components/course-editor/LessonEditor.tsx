import { useState, useEffect } from "react";
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
import { FileText, Video, HelpCircle, Plus, Trash2 } from "lucide-react";

interface Lesson {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
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
}

export const LessonEditor = ({ 
  lesson, 
  isOpen, 
  onClose, 
  onSave,
  existingQuestions = []
}: LessonEditorProps) => {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("text");
  const [content, setContent] = useState("");
  const [questions, setQuestions] = useState<TestQuestion[]>([]);

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {lesson ? "Редактировать урок" : "Новый урок"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>Название урока *</Label>
            <Input
              placeholder="Введите название"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Тип урока</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
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

          {type === "text" && (
            <div className="space-y-2">
              <Label>Содержание урока</Label>
              <Textarea
                placeholder="Введите текст урока..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[200px]"
              />
            </div>
          )}

          {type === "video" && (
            <div className="space-y-2">
              <Label>Ссылка на видео (YouTube, Vimeo)</Label>
              <Input
                placeholder="https://youtube.com/watch?v=..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              {content && (
                <div className="aspect-video bg-muted rounded-lg flex items-center justify-center mt-2">
                  <Video className="w-12 h-12 text-muted-foreground/50" />
                </div>
              )}
            </div>
          )}

          {type === "test" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Вопросы теста</Label>
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
                <div className="text-center py-8 bg-muted/30 rounded-lg">
                  <HelpCircle className="w-10 h-10 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    Добавьте вопросы для теста
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {questions.map((q, qIndex) => (
                    <div
                      key={qIndex}
                      className="border border-border rounded-lg p-4 space-y-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <Label>Вопрос {qIndex + 1}</Label>
                          <Input
                            placeholder="Введите вопрос"
                            value={q.question}
                            onChange={(e) =>
                              handleUpdateQuestion(qIndex, "question", e.target.value)
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveQuestion(qIndex)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <Label>Варианты ответов</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {q.options.map((option, oIndex) => (
                            <div key={oIndex} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`correct-${qIndex}`}
                                checked={q.correct_answer === oIndex}
                                onChange={() =>
                                  handleUpdateQuestion(qIndex, "correct_answer", oIndex)
                                }
                                className="w-4 h-4 accent-primary"
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
                                className="flex-1"
                              />
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Выберите правильный ответ с помощью переключателя
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Отмена
            </Button>
            <Button onClick={handleSave} className="flex-1 btn-gradient">
              {lesson ? "Сохранить" : "Создать урок"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
