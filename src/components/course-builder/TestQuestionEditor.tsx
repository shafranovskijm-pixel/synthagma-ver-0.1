import React, { forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2, GripVertical, Save, Sparkles, ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useTestQuestionEditor, type TestQuestion } from "@/hooks/useTestQuestionEditor";

export type { TestQuestion };
export type { QuestionOption } from "@/hooks/useTestQuestionEditor";

export interface TestQuestionEditorRef {
  getQuestions: () => TestQuestion[];
  saveQuestions: () => Promise<boolean>;
}

interface TestQuestionEditorProps {
  lessonId: string;
  courseId: string | undefined;
  generatedQuestions?: Array<{
    question: string;
    options: string[];
    correctAnswer: number;
    explanation?: string;
  }>;
  onQuestionsProcessed?: () => void;
  onQuestionsChange?: (questions: TestQuestion[]) => void;
  initialQuestions?: TestQuestion[];
}

export const TestQuestionEditor = forwardRef<TestQuestionEditorRef, TestQuestionEditorProps>(({
  lessonId, courseId, generatedQuestions, onQuestionsProcessed, onQuestionsChange, initialQuestions
}, ref) => {
  const h = useTestQuestionEditor({ lessonId, courseId, generatedQuestions, onQuestionsProcessed, onQuestionsChange, initialQuestions });

  useImperativeHandle(ref, () => ({
    getQuestions: () => h.visibleQuestions,
    saveQuestions: () => h.saveQuestions(),
  }));

  if (h.isLoading) {
    return <div className="flex items-center justify-center py-8"><SigmaSpinner /></div>;
  }

  return (
    <div className="space-y-4">
      {h.visibleQuestions.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-border rounded-xl">
          <p className="text-muted-foreground mb-4">Добавьте вопросы для теста</p>
          <Button onClick={h.addQuestion} variant="outline" className="gap-2"><Plus className="w-4 h-4" />Добавить вопрос</Button>
        </div>
      ) : (
        <>
          {h.visibleQuestions.map((question, qIndex) => (
            <div key={question.id} className="border border-border rounded-xl p-4 space-y-4 bg-secondary/20">
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-2 pt-2">
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                  <span className="text-sm font-semibold text-muted-foreground w-6">{qIndex + 1}.</span>
                </div>
                <div className="flex-1 space-y-3">
                  <Input value={question.question} onChange={(e) => h.updateQuestion(question.id, { question: e.target.value })} placeholder="Введите текст вопроса..." className="font-medium" />

                  {/* Image */}
                  <div className="space-y-2">
                    {question.image_url ? (
                      <div className="relative inline-block">
                        <img src={question.image_url} alt="Изображение вопроса" className="max-h-48 rounded-lg border border-border object-contain" />
                        <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={() => h.removeImage(question.id)}><X className="w-3 h-3" /></Button>
                      </div>
                    ) : (
                      <label className="cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) h.handleImageUpload(question.id, file); e.target.value = ""; }} disabled={h.uploadingImageId === question.id} />
                        <div className={cn("inline-flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-border rounded-lg hover:bg-secondary/50 transition-colors text-muted-foreground", h.uploadingImageId === question.id && "opacity-50 pointer-events-none")}>
                          {h.uploadingImageId === question.id ? <><SigmaSpinner size="sm" />Загрузка...</> : <><ImagePlus className="w-4 h-4" />Добавить изображение</>}
                        </div>
                      </label>
                    )}
                  </div>

                  {/* Options */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Варианты ответа (отметьте правильный):</Label>
                    <RadioGroup value={String(question.correct_answer)} onValueChange={(value) => h.updateQuestion(question.id, { correct_answer: parseInt(value) })}>
                      {question.options.map((option, oIndex) => (
                        <div key={oIndex} className="flex items-center gap-2">
                          <RadioGroupItem value={String(oIndex)} id={`${question.id}-option-${oIndex}`} className="flex-shrink-0" />
                          <Input value={option.text} onChange={(e) => h.updateOption(question.id, oIndex, e.target.value)} placeholder={`Вариант ${oIndex + 1}`} className={cn("flex-1", question.correct_answer === oIndex && "border-green-500/50 bg-green-500/5")} />
                          {question.options.length > 2 && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => h.removeOption(question.id, oIndex)}><Trash2 className="w-3 h-3" /></Button>
                          )}
                        </div>
                      ))}
                    </RadioGroup>
                    {question.options.length < 6 && (
                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => h.addOption(question.id)}><Plus className="w-3 h-3 mr-1" />Добавить вариант</Button>
                    )}
                  </div>

                  {/* Explanation */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Пояснение (показывается при неправильном ответе):</Label>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={() => h.generateExplanation(question.id)} disabled={h.generatingExplanationId === question.id}>
                        {h.generatingExplanationId === question.id ? <><SigmaSpinner size="xs" />Генерация...</> : <><Sparkles className="w-3 h-3" />Сгенерировать ИИ</>}
                      </Button>
                    </div>
                    <textarea value={question.explanation || ''} onChange={(e) => h.updateQuestion(question.id, { explanation: e.target.value })} placeholder="Объясните, почему другие ответы неверны..." className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background resize-none min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => h.deleteQuestion(question.id)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2">
            <Button onClick={h.addQuestion} variant="outline" size="sm" className="gap-2"><Plus className="w-4 h-4" />Добавить вопрос</Button>
            <Button onClick={h.saveQuestions} disabled={h.isSaving} variant="outline" size="sm" className="gap-2">
              {h.isSaving ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
              {h.isSaving ? "Сохранение..." : "Сохранить вопросы"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
});

TestQuestionEditor.displayName = "TestQuestionEditor";
