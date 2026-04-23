import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Sparkles, CheckCircle2, AlertCircle, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { useCourseGenerationProgress } from "@/hooks/useCourseGenerationProgress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";

interface CourseGenerationProgressProps {
  courseId: string | null | undefined;
  /** Скрывать виджет, если генерация не идёт. По умолчанию true. */
  hideWhenIdle?: boolean;
}

/**
 * Виджет прогресса ИИ-генерации курса.
 * Подписывается на realtime-обновления `courses.generation_progress`
 * и показывает «Урок 7 из 35: …» с прогресс-баром.
 *
 * При ошибке показывает текст ошибки и кнопку «Повторить с шага N».
 */
export function CourseGenerationProgress({
  courseId,
  hideWhenIdle = true,
}: CourseGenerationProgressProps) {
  const { progress, isActive, percent } = useCourseGenerationProgress(courseId);
  const [retrying, setRetrying] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  if (!progress && hideWhenIdle) return null;
  if (!progress) return null;

  const isDone = progress.step === "done";
  const isError = progress.step === "error";

  if (isDone && hideWhenIdle) return null;

  const Icon = isError ? AlertCircle : isDone ? CheckCircle2 : Sparkles;
  const iconColor = isError
    ? "text-destructive"
    : isDone
      ? "text-green-500"
      : "text-primary";

  const handleRetry = async () => {
    if (!courseId) return;
    setRetrying(true);
    try {
      const { error } = await supabase.functions.invoke("generate-course-content", {
        body: {
          courseId,
          resumeFrom: progress.failed_at ?? progress.current ?? 0,
        },
      });
      if (error) throw error;
      toast.success("Генерация перезапущена");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${iconColor} ${isActive ? "animate-pulse" : ""}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {isError
              ? "Ошибка генерации"
              : isDone
                ? "Генерация завершена"
                : "ИИ создаёт ваш курс"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {progress.message}
          </div>
        </div>
        {progress.total > 0 && !isError && (
          <div className="text-xs text-muted-foreground tabular-nums shrink-0">
            {progress.current} / {progress.total}
          </div>
        )}
      </div>

      {!isError && <Progress value={isDone ? 100 : percent} className="h-2" />}

      {isError && (
        <div className="space-y-2">
          {progress.error_message && (
            <>
              <button
                onClick={() => setShowDetails((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showDetails ? "Скрыть детали" : "Показать детали"}
              </button>
              {showDetails && (
                <div className="rounded-md bg-destructive/5 border border-destructive/20 p-2 text-xs text-destructive whitespace-pre-wrap break-words">
                  {progress.error_message}
                </div>
              )}
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleRetry}
            disabled={retrying || !courseId}
            className="w-full"
          >
            <RotateCcw className={`w-3 h-3 mr-2 ${retrying ? "animate-spin" : ""}`} />
            {retrying
              ? "Перезапуск..."
              : progress.failed_at
                ? `Повторить с шага ${progress.failed_at}`
                : "Повторить генерацию"}
          </Button>
        </div>
      )}
    </div>
  );
}
