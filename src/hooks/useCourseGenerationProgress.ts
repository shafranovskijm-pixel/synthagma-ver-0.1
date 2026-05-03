import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Прогресс ИИ-генерации курса.
 * Источник истины — поле `courses.generation_progress` (jsonb),
 * куда edge-функция `generate-course-content` пишет шаги.
 */
export interface CourseGenerationProgress {
  step: "structure" | "lesson" | "test" | "done" | "error";
  current: number;
  total: number;
  message: string;
  /** Человекочитаемое описание ошибки (только при step === "error"). */
  error_message?: string;
  /** На каком шаге упало (для кнопки «Повторить с шага N»). */
  failed_at?: number;
  updated_at?: string;
}

interface UseCourseGenerationProgressResult {
  progress: CourseGenerationProgress | null;
  isActive: boolean;
  percent: number;
}

export function useCourseGenerationProgress(
  courseId: string | null | undefined,
): UseCourseGenerationProgressResult {
  const [progress, setProgress] = useState<CourseGenerationProgress | null>(null);

  useEffect(() => {
    if (!courseId) {
      setProgress(null);
      return;
    }

    let cancelled = false;

    // Initial fetch
    (async () => {
      const { data } = await supabase
        .from("courses")
        .select("generation_progress")
        .eq("id", courseId)
        .maybeSingle();
      if (!cancelled && data?.generation_progress) {
        setProgress(data.generation_progress as unknown as CourseGenerationProgress);
      }
    })();

    // Realtime subscription
    const channel = supabase
      .channel(`course-progress-${courseId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "courses",
          filter: `id=eq.${courseId}`,
        },
        (payload) => {
          const next = (payload.new as { generation_progress?: unknown })?.generation_progress;
          if (next) setProgress(next as CourseGenerationProgress);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [courseId]);

  const isActive =
    !!progress && progress.step !== "done" && progress.step !== "error";
  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return { progress, isActive, percent };
}
