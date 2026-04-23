import { Progress } from "@/components/ui/progress";
import { Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { useCourseGenerationProgress } from "@/hooks/useCourseGenerationProgress";

interface CourseGenerationProgressProps {
  courseId: string | null | undefined;
  /** Скрывать виджет, если генерация не идёт. По умолчанию true. */
  hideWhenIdle?: boolean;
}

/**
 * Виджет прогресса ИИ-генерации курса.
 * Подписывается на realtime-обновления `courses.generation_progress`
 * и показывает «Урок 7 из 35: …» с прогресс-баром.
 */
export function CourseGenerationProgress({
  courseId,
  hideWhenIdle = true,
}: CourseGenerationProgressProps) {
  const { progress, isActive, percent } = useCourseGenerationProgress(courseId);

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
        {progress.total > 0 && (
          <div className="text-xs text-muted-foreground tabular-nums shrink-0">
            {progress.current} / {progress.total}
          </div>
        )}
      </div>
      {!isError && (
        <Progress value={isDone ? 100 : percent} className="h-2" />
      )}
    </div>
  );
}
