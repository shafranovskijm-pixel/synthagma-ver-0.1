
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Download, Upload, Bot, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
  exportQuestionsForAI,
  parseAnswersFile,
  downloadTextFile,
  type QuestionForExport,
  type ParsedAnswer } from "@/utils/testAnswersExport";

interface TestAnswersDialogProps {
  questions: QuestionForExport[];
  courseTitle: string;
  lessonTitle?: string;
  onApplyAnswers: (answers: ParsedAnswer[]) => void;
  children: React.ReactNode;
}

export function TestAnswersDialog({ questions, courseTitle, lessonTitle, onApplyAnswers, children }: TestAnswersDialogProps) {
  const [open, setOpen] = useState(false);
  const [answersText, setAnswersText] = useState("");
  const [preview, setPreview] = useState<{ answers: ParsedAnswer[]; errors: string[] } | null>(null);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [autoResult, setAutoResult] = useState<(ParsedAnswer & { explanation?: string })[] | null>(null);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [usedModel, setUsedModel] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    if (questions.length === 0) {
      toast.error("Нет вопросов для экспорта");
      return;
    }
    const txt = exportQuestionsForAI(questions, courseTitle);
    const safeName = courseTitle.replace(/[^a-zA-Zа-яА-ЯёЁ0-9 ]/g, '').trim().replace(/\s+/g, '_');
    downloadTextFile(txt, `${safeName}_вопросы.txt`);
    toast.success(`Экспортировано ${questions.length} вопросов`);
  };

  const handleParse = (text: string) => {
    setAnswersText(text);
    if (text.trim()) {
      setPreview(parseAnswersFile(text, questions.length));
    } else {
      setPreview(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      handleParse(text);
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleApply = () => {
    if (!preview || preview.answers.length === 0) return;
    onApplyAnswers(preview.answers);
    toast.success(`Применено ${preview.answers.length} ответов`);
    setOpen(false);
    setAnswersText("");
    setPreview(null);
  };

  const handleAutoGenerate = async () => {
    if (questions.length === 0) {
      toast.error("Нет вопросов для анализа");
      return;
    }
    setIsAutoGenerating(true);
    setAutoResult(null);
    setAutoError(null);

    try {
      const questionsForAI = questions.map(q => ({
        question: q.question,
        options: q.options }));

      const { data, error } = await supabase.functions.invoke("gigachat", {
        body: {
          action: "generate_answers",
          courseTitle,
          lessonTitle: lessonTitle || courseTitle,
          questions: questionsForAI,
          ai_provider: "lovable_ai",
          lovable_model: "google/gemini-2.5-pro" } });

      if (error) throw error;

      if (data.parseError) {
        setAutoError("ИИ вернул ответ в неожиданном формате. Попробуйте ещё раз.");
        setUsedModel(data.model || null);
        return;
      }

      setUsedModel(data.model || "AI");

      const answers: (ParsedAnswer & { explanation?: string })[] = (data.answers || []).map((a: any) => ({
        questionNumber: a.questionIndex + 1,
        answerIndex: a.correctAnswer,
        answerLetter: String.fromCharCode(65 + (a.correctAnswer || 0)),
        explanation: a.explanation }));

      setAutoResult(answers);
    } catch (err: any) {
      console.error("AI error:", err);
      const msg = err?.message || "Ошибка при обращении к AI";
      setAutoError(msg);
      toast.error(msg);
    } finally {
      setIsAutoGenerating(false);
    }
  };

  const handleDownloadWithAnswers = (answers: (ParsedAnswer & { explanation?: string })[]) => {
    const lines: string[] = [];
    lines.push(`Курс: ${courseTitle}`);
    if (lessonTitle) lines.push(`Урок: ${lessonTitle}`);
    lines.push(`Модель: ${usedModel || 'AI'}`);
    lines.push('');

    answers.forEach((a) => {
      const q = questions[a.questionNumber - 1];
      if (!q) return;
      const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      lines.push(`Вопрос ${a.questionNumber}: ${q.question}`);
      q.options.forEach((opt: any, j: number) => {
        const optText = typeof opt === 'string' ? opt : (opt?.text || opt?.label || String(opt));
        const marker = j === a.answerIndex ? '✅' : '  ';
        lines.push(`${marker} ${letters[j] || (j + 1).toString()}) ${optText}`);
      });
      if (a.explanation) {
        lines.push(`Пояснение: ${a.explanation}`);
      }
      lines.push('');
    });

    const safeName = courseTitle.replace(/[^a-zA-Zа-яА-ЯёЁ0-9 ]/g, '').trim().replace(/\s+/g, '_');
    downloadTextFile(lines.join('\n'), `${safeName}_ответы_${usedModel || 'AI'}.txt`);
    toast.success('Файл с ответами скачан');
  };

  const handleApplyAutoAnswers = () => {
    if (!autoResult || autoResult.length === 0) return;
    onApplyAnswers(autoResult);
    toast.success(`Применено ${autoResult.length} ответов${usedModel ? ` (${usedModel})` : ''}`);
    setOpen(false);
    setAutoResult(null);
    setUsedModel(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bot className="w-5 h-5" />Ответы через AI</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="auto">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="auto" className="gap-1"><Sparkles className="w-3 h-3" />AI Ответы</TabsTrigger>
            <TabsTrigger value="export" className="gap-1"><Download className="w-3 h-3" />Скачать</TabsTrigger>
            <TabsTrigger value="import" className="gap-1"><Upload className="w-3 h-3" />Загрузить</TabsTrigger>
          </TabsList>

          <TabsContent value="auto" className="space-y-3 mt-3">
            <p className="text-sm text-muted-foreground">
              AI автоматически определит правильные ответы для {questions.length} вопросов
              на основе знаний нормативных документов Ростехнадзора.
            </p>

            {!autoResult && !autoError && (
              <Button
                onClick={handleAutoGenerate}
                className="w-full gap-2"
                disabled={isAutoGenerating || questions.length === 0}
              >
                {isAutoGenerating ? (
                  <><SigmaSpinner size="sm" />Анализ вопросов...</>
                ) : (
                  <><Sparkles className="w-4 h-4" />Определить ответы ({questions.length} вопросов)</>
                )}
              </Button>
            )}

            {autoError && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>{autoError}</div>
                </div>
                <Button variant="outline" onClick={handleAutoGenerate} className="w-full gap-2" disabled={isAutoGenerating}>
                  Попробовать снова
                </Button>
              </div>
            )}

            {autoResult && autoResult.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span>Определено ответов: <strong>{autoResult.length}</strong> из {questions.length}</span>
                  </div>
                  {usedModel && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                      {usedModel}
                    </span>
                  )}
                </div>

                <div className="bg-secondary/30 rounded-lg p-3 text-xs max-h-48 overflow-y-auto space-y-1.5">
                  {autoResult.map((a) => {
                    const q = questions[a.questionNumber - 1];
                    const answerLetter = String.fromCharCode(65 + (a.answerIndex || 0));
                    return (
                      <div key={a.questionNumber} className="flex gap-2">
                        <span className="text-muted-foreground shrink-0">#{a.questionNumber}</span>
                        <span className="font-medium text-primary shrink-0">{answerLetter}</span>
                        <span className="text-muted-foreground truncate">
                          {q?.question?.substring(0, 50)}...
                        </span>
                      </div>
                    );
                  })}
                </div>

                {autoResult.some(a => a.explanation) && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Показать пояснения
                    </summary>
                    <div className="mt-2 space-y-2 bg-secondary/20 rounded-lg p-3 max-h-40 overflow-y-auto">
                      {autoResult.filter(a => a.explanation).map(a => (
                        <div key={a.questionNumber}>
                          <span className="font-medium">#{a.questionNumber}:</span>{" "}
                          <span className="text-muted-foreground">{a.explanation}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <div className="flex gap-2">
                  <Button onClick={handleApplyAutoAnswers} className="flex-1 gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Применить {autoResult.length} ответов
                  </Button>
                  <Button variant="outline" onClick={() => handleDownloadWithAnswers(autoResult)} className="gap-2">
                    <Download className="w-4 h-4" />
                    Скачать
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="export" className="space-y-3 mt-3">
            <p className="text-sm text-muted-foreground">
              Скачайте файл с вопросами, отправьте его в ChatGPT, Grok или другой AI, 
              затем загрузите полученные ответы обратно.
            </p>
            <div className="bg-secondary/30 rounded-lg p-3 text-xs font-mono max-h-40 overflow-y-auto">
              {questions.length > 0 ? (
                <>
                  <div className="text-muted-foreground mb-1">Превью ({questions.length} вопросов):</div>
                  <div>Вопрос 1: {questions[0]?.question?.substring(0, 60)}...</div>
                  <div className="text-muted-foreground mt-1">...</div>
                  <div>Вопрос {questions.length}: {questions[questions.length - 1]?.question?.substring(0, 60)}...</div>
                </>
              ) : (
                <div className="text-muted-foreground">Нет вопросов</div>
              )}
            </div>
            <Button onClick={handleExport} className="w-full gap-2" disabled={questions.length === 0}>
              <Download className="w-4 h-4" />
              Скачать {questions.length} вопросов в TXT
            </Button>
          </TabsContent>

          <TabsContent value="import" className="space-y-3 mt-3">
            <p className="text-sm text-muted-foreground">
              Вставьте ответы от AI в формате: <code className="bg-secondary px-1 rounded">1-A</code>, <code className="bg-secondary px-1 rounded">2: B</code> или <code className="bg-secondary px-1 rounded">3-1</code>
            </p>
            <Textarea
              value={answersText}
              onChange={(e) => handleParse(e.target.value)}
              placeholder={"1-A\n2-B\n3-C\n..."}
              className="rounded-xl min-h-[120px] font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={() => fileRef.current?.click()}>
                <Upload className="w-3 h-3" />Из файла
              </Button>
              <input ref={fileRef} type="file" accept=".txt,.text" className="hidden" onChange={handleFileUpload} />
            </div>

            {preview && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>Распознано ответов: <strong>{preview.answers.length}</strong> из {questions.length}</span>
                </div>
                {preview.errors.length > 0 && (
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>{preview.errors.slice(0, 3).join('; ')}{preview.errors.length > 3 && ` и ещё ${preview.errors.length - 3}...`}</div>
                  </div>
                )}
                <Button onClick={handleApply} className="w-full gap-2" disabled={preview.answers.length === 0}>
                  <CheckCircle2 className="w-4 h-4" />
                  Применить {preview.answers.length} ответов
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
