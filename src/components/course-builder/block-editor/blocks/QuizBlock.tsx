import { useEffect, useRef } from "react";
import { useBlockAIGenerate } from "@/hooks/useBlockAIGenerate";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { HelpCircle, Plus, Trash2, Sparkles } from "lucide-react";
import type { ContentBlock } from "../types";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

export function QuizBlock({ block, onUpdate, courseTitle, lessonTitle, existingContent }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void; courseTitle?: string; lessonTitle?: string; existingContent?: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const autoTriggeredRef = useRef(false);
  const options = block.quizOptions || [{ text: "", isCorrect: true }, { text: "", isCorrect: false }];

  const updateOption = (index: number, updates: Partial<{ text: string; isCorrect: boolean }>) => {
    const newOptions = options.map((o, i) => {
      if (i === index) {
        const updated = { ...o, ...updates };
        if (updates.isCorrect) return { ...updated, isCorrect: true };
        return updated;
      }
      if (updates.isCorrect) return { ...o, isCorrect: false };
      return o;
    });
    onUpdate({ quizOptions: newOptions });
  };

  const addOption = () => onUpdate({ quizOptions: [...options, { text: "", isCorrect: false }] });
  const removeOption = (index: number) => {
    const newOptions = options.filter((_, i) => i !== index);
    if (!newOptions.some(o => o.isCorrect) && newOptions.length > 0) newOptions[0].isCorrect = true;
    onUpdate({ quizOptions: newOptions });
  };

  const handleGenerateWithAI = async () => {
    if (!(await checkAiLimitGlobal())) return;
    setIsGenerating(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("generate-course-content", {
        body: { contentType: "quiz", lessonTitle: lessonTitle || "Общая тема", courseTitle: courseTitle || "Курс", existingContent } });
      if (error) throw error;
      if (data?.quiz) {
        onUpdate({
          quizQuestion: data.quiz.question,
          quizOptions: data.quiz.options.map((o: any, i: number) => ({ text: o, isCorrect: i === data.quiz.correctIndex })),
          quizExplanation: data.quiz.explanation || "" });
        await incrementAiLimitGlobal();
      }
    } catch (e) {
      console.error("Quiz AI generation error:", e);
      const { toast } = await import("sonner");
      toast.error("Ошибка генерации квиза");
    } finally { setIsGenerating(false); }
  };

  // Auto-trigger AI generation if block was created via the "AI-тест" shortcut
  useEffect(() => {
    if (block.pendingAI === "ai-quiz" && !autoTriggeredRef.current && !block.quizQuestion) {
      autoTriggeredRef.current = true;
      onUpdate({ pendingAI: undefined });
      handleGenerateWithAI();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.pendingAI]);

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary"><HelpCircle className="w-5 h-5" /><span className="font-medium">Мини-квиз</span></div>
        <Button variant="outline" size="sm" onClick={handleGenerateWithAI} disabled={isGenerating} className="gap-2 text-xs">
          {isGenerating ? <SigmaSpinner size="xs" /> : <Sparkles className="w-3 h-3" />}
          {isGenerating ? "Генерация..." : "Сгенерировать с ИИ"}
        </Button>
      </div>
      <Input value={block.quizQuestion || ""} onChange={(e) => onUpdate({ quizQuestion: e.target.value })} placeholder="Введите вопрос..." className="font-medium" />
      <div className="space-y-2">
        {options.map((option, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="radio" checked={option.isCorrect} onChange={() => updateOption(i, { isCorrect: true })} className="w-4 h-4 text-primary" />
            <Input value={option.text} onChange={(e) => updateOption(i, { text: e.target.value })} placeholder={`Вариант ${i + 1}`} className="flex-1" />
            {options.length > 2 && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeOption(i)}><Trash2 className="w-4 h-4" /></Button>
            )}
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={addOption} className="gap-2"><Plus className="w-4 h-4" />Добавить вариант</Button>
      <Textarea value={block.quizExplanation || ""} onChange={(e) => onUpdate({ quizExplanation: e.target.value })} placeholder="Пояснение к правильному ответу (опционально)" className="min-h-[40px] text-sm bg-white/50 dark:bg-black/20" />
    </div>
  );
}
