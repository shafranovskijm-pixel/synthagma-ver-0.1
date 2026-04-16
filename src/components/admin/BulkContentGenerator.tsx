import { Sparkles, Check, X, AlertCircle, RotateCcw, CheckSquare, Square, Layers, FileText, FileQuestion, Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useBulkContentGenerator, type BulkLessonItem, PHASE_LABELS } from "@/hooks/useBulkContentGenerator";

type LessonStatus = BulkLessonItem["status"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
  courseDescription?: string;
}

export function BulkContentGenerator({ open, onOpenChange, courseId, courseTitle, courseDescription }: Props) {
  const {
    lessons, loading, processing, phase, doneCount, totalToProcess,
    hasLessons, hasContentLessons, contentLessons, testLessons, selectedCount, errorCount, progress,
    toggleAll, toggleLesson, startFullPipeline, retryErrors, stopGeneration, isPhaseComplete,
  } = useBulkContentGenerator(courseId, courseTitle, courseDescription, open);

  const statusIcon = (status: LessonStatus) => {
    switch (status) {
      case "generating_text": case "generating_image": case "generating_audio": case "solving_test":
        return <SigmaSpinner size="sm" />;
      case "done": return <Check className="w-4 h-4 text-accent-foreground" />;
      case "error": return <AlertCircle className="w-4 h-4 text-destructive" />;
      default: return null;
    }
  };

  const statusText = (status: LessonStatus) => {
    switch (status) {
      case "generating_text": return "Текст...";
      case "generating_image": return "Изображение...";
      case "generating_audio": return "Аудио...";
      case "solving_test": return "Решение теста...";
      case "done": return "Готово";
      case "error": return "Ошибка";
      default: return "";
    }
  };

  const typeBadge = (type: string) => {
    switch (type) {
      case "test": return <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-600">Тест</Badge>;
      case "practice": return <Badge variant="outline" className="text-xs">Практика</Badge>;
      default: return <Badge variant="secondary" className="text-xs">Лекция</Badge>;
    }
  };

  const phaseIndicator = (phaseName: string, label: string, icon: React.ReactNode, isActive: boolean) => (
    <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${
      isActive ? "bg-primary/10 text-primary font-medium" :
      isPhaseComplete(phaseName) ? "bg-accent text-accent-foreground" : "text-muted-foreground"
    }`}>
      {icon}
      {label}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (processing) stopGeneration(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Полная генерация курса
          </DialogTitle>
          <DialogDescription className="truncate">{courseTitle}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          {phaseIndicator("structure", "Структура", <Layers className="w-3.5 h-3.5" />, phase === "structure")}
          <span className="text-muted-foreground">→</span>
          {phaseIndicator("content", "Контент", <FileText className="w-3.5 h-3.5" />, phase === "content")}
          <span className="text-muted-foreground">→</span>
          {phaseIndicator("media", "Медиа", <ImageIcon className="w-3.5 h-3.5" />, phase === "media")}
          <span className="text-muted-foreground">→</span>
          {phaseIndicator("tests", "Тесты", <FileQuestion className="w-3.5 h-3.5" />, phase === "tests")}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12"><SigmaSpinner /></div>
        ) : !hasLessons ? (
          <div className="text-center py-8 space-y-2">
            <p className="text-muted-foreground">Уроков пока нет — ИИ создаст структуру и контент автоматически</p>
            <p className="text-xs text-muted-foreground">Структура: лекции → практические задания → итоговое тестирование</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={toggleAll} disabled={processing}>
                {lessons.every((l) => l.selected) ? <><CheckSquare className="w-4 h-4 mr-1.5" />Снять все</> : <><Square className="w-4 h-4 mr-1.5" />Выбрать все</>}
              </Button>
              <div className="flex gap-1.5 items-center">
                <Badge variant="secondary">{contentLessons.length} к генерации</Badge>
                <Badge variant="outline" className="border-orange-500/30 text-orange-600" title="ИИ подберёт правильные ответы к вопросам теста">{testLessons.length} тестов</Badge>
              </div>
            </div>

            {processing && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{PHASE_LABELS[phase]}</span>
                  <span>{doneCount} / {totalToProcess || "..."}</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            <ScrollArea className="flex-1 min-h-[200px] max-h-[50vh] -mx-2 px-2">
              <div className="space-y-1">
                {lessons.map((lesson) => (
                  <div key={lesson.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    lesson.status === "done" ? "bg-green-500/5" :
                    lesson.status === "error" ? "bg-destructive/5" :
                    ["generating_text", "generating_image", "generating_audio", "solving_test"].includes(lesson.status) ? "bg-primary/5" : "hover:bg-secondary/50"
                  }`}>
                    <Checkbox checked={lesson.selected} onCheckedChange={() => toggleLesson(lesson.id)} disabled={processing} />
                    {typeBadge(lesson.type)}
                    <span className="flex-1 truncate">{lesson.title}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {statusIcon(lesson.status)}
                      <span className="text-xs text-muted-foreground w-28 text-right">
                        {lesson.status === "error" && lesson.error ? lesson.error.substring(0, 25) : statusText(lesson.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {errorCount > 0 && !processing && (
            <Button variant="outline" onClick={retryErrors}>
              <RotateCcw className="w-4 h-4 mr-1.5" />Повторить ошибки ({errorCount})
            </Button>
          )}
          {processing ? (
            <Button variant="destructive" onClick={stopGeneration}><X className="w-4 h-4 mr-1.5" />Остановить</Button>
          ) : (
            <Button onClick={startFullPipeline} disabled={loading}>
              <Sparkles className="w-4 h-4 mr-1.5" />{hasLessons ? `Генерировать контент` : `Создать курс полностью`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
