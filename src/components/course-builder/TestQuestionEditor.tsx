import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Plus,
  Trash2,
  GripVertical,
  Save,
  Loader2,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Json } from "@/integrations/supabase/types";

interface QuestionOption {
  text: string;
}

interface TestQuestion {
  id: string;
  question: string;
  options: QuestionOption[];
  correct_answer: number;
  order_index: number;
  explanation?: string;
  isNew?: boolean;
  isDeleted?: boolean;
}

interface TestQuestionEditorProps {
  lessonId: string;
  courseId: string | undefined;
  generatedQuestions?: Array<{
    question: string;
    options: string[];
    correctAnswer: number;
  }>;
  onQuestionsProcessed?: () => void;
}

export function TestQuestionEditor({ 
  lessonId, 
  courseId, 
  generatedQuestions,
  onQuestionsProcessed 
}: TestQuestionEditorProps) {
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [generatingExplanationId, setGeneratingExplanationId] = useState<string | null>(null);

  // Handle generated questions from AI
  useEffect(() => {
    if (generatedQuestions && generatedQuestions.length > 0) {
      const newQuestions: TestQuestion[] = generatedQuestions.map((q, index) => ({
        id: crypto.randomUUID(),
        question: q.question,
        options: q.options.map(text => ({ text })),
        correct_answer: q.correctAnswer,
        order_index: questions.length + index,
        isNew: true
      }));
      
      setQuestions(prev => [...prev, ...newQuestions]);
      onQuestionsProcessed?.();
      toast.success(`Добавлено ${newQuestions.length} вопросов`);
    }
  }, [generatedQuestions]);

  useEffect(() => {
    const fetchQuestions = async () => {
      if (!lessonId) {
        setIsLoading(false);
        return;
      }

      const { data: lessonData } = await supabase
        .from("lessons")
        .select("id")
        .eq("id", lessonId)
        .maybeSingle();

      if (!lessonData) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("test_questions")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("order_index");

      if (error) {
        console.error("Error fetching questions:", error);
        toast.error("Ошибка загрузки вопросов");
      } else if (data) {
        setQuestions(data.map(q => ({
          id: q.id,
          question: q.question,
          options: (q.options as unknown as QuestionOption[]) || [],
          correct_answer: q.correct_answer,
          order_index: q.order_index,
          explanation: (q as any).explanation || ''
        })));
      }

      setIsLoading(false);
    };

    fetchQuestions();
  }, [lessonId]);

  const addQuestion = () => {
    const newQuestion: TestQuestion = {
      id: crypto.randomUUID(),
      question: "",
      options: [
        { text: "" },
        { text: "" },
        { text: "" },
        { text: "" }
      ],
      correct_answer: 0,
      order_index: questions.length,
      explanation: "",
      isNew: true
    };
    setQuestions([...questions, newQuestion]);
  };

  const updateQuestion = (id: string, updates: Partial<TestQuestion>) => {
    setQuestions(questions.map(q =>
      q.id === id ? { ...q, ...updates } : q
    ));
  };

  const updateOption = (questionId: string, optionIndex: number, text: string) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId) {
        const newOptions = [...q.options];
        newOptions[optionIndex] = { text };
        return { ...q, options: newOptions };
      }
      return q;
    }));
  };

  const addOption = (questionId: string) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId && q.options.length < 6) {
        return { ...q, options: [...q.options, { text: "" }] };
      }
      return q;
    }));
  };

  const removeOption = (questionId: string, optionIndex: number) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId && q.options.length > 2) {
        const newOptions = q.options.filter((_, i) => i !== optionIndex);
        let newCorrect = q.correct_answer;
        if (optionIndex === q.correct_answer) {
          newCorrect = 0;
        } else if (optionIndex < q.correct_answer) {
          newCorrect = q.correct_answer - 1;
        }
        return { ...q, options: newOptions, correct_answer: newCorrect };
      }
      return q;
    }));
  };

  const deleteQuestion = (id: string) => {
    const question = questions.find(q => q.id === id);
    if (question?.isNew) {
      setQuestions(questions.filter(q => q.id !== id));
    } else {
      setQuestions(questions.map(q =>
        q.id === id ? { ...q, isDeleted: true } : q
      ));
    }
  };

  const generateExplanation = async (questionId: string) => {
    const question = questions.find(q => q.id === questionId);
    if (!question || !question.question.trim()) {
      toast.error("Сначала заполните вопрос");
      return;
    }

    const filledOptions = question.options.filter(o => o.text.trim());
    if (filledOptions.length < 2) {
      toast.error("Добавьте минимум 2 варианта ответа");
      return;
    }

    setGeneratingExplanationId(questionId);

    try {
      const { data, error } = await supabase.functions.invoke("generate-explanation", {
        body: {
          question: question.question,
          options: question.options.map(o => o.text),
          correctAnswer: question.correct_answer,
        },
      });

      if (error) throw error;

      if (data.explanation) {
        updateQuestion(questionId, { explanation: data.explanation });
        toast.success("Пояснение сгенерировано");
      }
    } catch (error: any) {
      console.error("Error generating explanation:", error);
      toast.error("Ошибка генерации: " + (error.message || "Попробуйте позже"));
    } finally {
      setGeneratingExplanationId(null);
    }
  };

  const saveQuestions = async () => {
    if (!courseId) {
      toast.error("Сначала сохраните курс");
      return;
    }

    const { data: lessonExists } = await supabase
      .from("lessons")
      .select("id")
      .eq("id", lessonId)
      .maybeSingle();

    if (!lessonExists) {
      toast.error("Сначала сохраните урок");
      return;
    }

    const activeQuestions = questions.filter(q => !q.isDeleted);
    for (const q of activeQuestions) {
      if (!q.question.trim()) {
        toast.error("Заполните текст вопроса");
        return;
      }
      const filledOptions = q.options.filter(o => o.text.trim());
      if (filledOptions.length < 2) {
        toast.error("Добавьте минимум 2 варианта ответа");
        return;
      }
    }

    setIsSaving(true);

    try {
      const toDelete = questions.filter(q => q.isDeleted && !q.isNew);
      for (const q of toDelete) {
        const { error } = await supabase
          .from("test_questions")
          .delete()
          .eq("id", q.id);
        if (error) throw error;
      }

      for (let i = 0; i < activeQuestions.length; i++) {
        const q = activeQuestions[i];
        const questionData = {
          id: q.id,
          lesson_id: lessonId,
          question: q.question.trim(),
          options: q.options.filter(o => o.text.trim()) as unknown as Json,
          correct_answer: q.correct_answer,
          order_index: i,
          explanation: q.explanation || null
        };

        const { error } = await supabase
          .from("test_questions")
          .upsert([questionData], { onConflict: "id" });

        if (error) throw error;
      }

      setQuestions(activeQuestions.map((q, i) => ({
        ...q,
        order_index: i,
        isNew: false
      })));

      toast.success("Вопросы сохранены");
    } catch (error: any) {
      console.error("Error saving questions:", error);
      toast.error("Ошибка сохранения: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const visibleQuestions = questions.filter(q => !q.isDeleted);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {visibleQuestions.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-border rounded-xl">
          <p className="text-muted-foreground mb-4">Добавьте вопросы для теста</p>
          <Button onClick={addQuestion} variant="outline" className="gap-2">
            <Plus className="w-4 h-4" />
            Добавить вопрос
          </Button>
        </div>
      ) : (
        <>
          {visibleQuestions.map((question, qIndex) => (
            <div
              key={question.id}
              className="border border-border rounded-xl p-4 space-y-4 bg-secondary/20"
            >
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-2 pt-2">
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                  <span className="text-sm font-semibold text-muted-foreground w-6">
                    {qIndex + 1}.
                  </span>
                </div>
                <div className="flex-1 space-y-3">
                  <Input
                    value={question.question}
                    onChange={(e) => updateQuestion(question.id, { question: e.target.value })}
                    placeholder="Введите текст вопроса..."
                    className="font-medium"
                  />

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Варианты ответа (отметьте правильный):
                    </Label>
                    <RadioGroup
                      value={String(question.correct_answer)}
                      onValueChange={(value) => updateQuestion(question.id, { correct_answer: parseInt(value) })}
                    >
                      {question.options.map((option, oIndex) => (
                        <div key={oIndex} className="flex items-center gap-2">
                          <RadioGroupItem
                            value={String(oIndex)}
                            id={`${question.id}-option-${oIndex}`}
                            className="flex-shrink-0"
                          />
                          <Input
                            value={option.text}
                            onChange={(e) => updateOption(question.id, oIndex, e.target.value)}
                            placeholder={`Вариант ${oIndex + 1}`}
                            className={cn(
                              "flex-1",
                              question.correct_answer === oIndex && "border-green-500/50 bg-green-500/5"
                            )}
                          />
                          {question.options.length > 2 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeOption(question.id, oIndex)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </RadioGroup>

                    {question.options.length < 6 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground"
                        onClick={() => addOption(question.id)}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Добавить вариант
                      </Button>
                    )}
                  </div>
                  
                  {/* Explanation field */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">
                        Пояснение (показывается при неправильном ответе):
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-primary"
                        onClick={() => generateExplanation(question.id)}
                        disabled={generatingExplanationId === question.id}
                      >
                        {generatingExplanationId === question.id ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Генерация...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3" />
                            Сгенерировать ИИ
                          </>
                        )}
                      </Button>
                    </div>
                    <textarea
                      value={question.explanation || ''}
                      onChange={(e) => updateQuestion(question.id, { explanation: e.target.value })}
                      placeholder="Объясните, почему другие ответы неверны..."
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background resize-none min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => deleteQuestion(question.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between pt-2">
            <Button onClick={addQuestion} variant="outline" size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Добавить вопрос
            </Button>

            <Button
              onClick={saveQuestions}
              disabled={isSaving}
              className="gap-2"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? "Сохранение..." : "Сохранить вопросы"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
