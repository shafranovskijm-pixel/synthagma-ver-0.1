import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ReviewFinding {
  id: string;
  lesson_title: string;
  type: "legislation" | "test" | "error" | "suggestion";
  severity: "critical" | "warning" | "info";
  description: string;
  suggestion: string;
}

export interface ReviewResult {
  findings: ReviewFinding[];
  summary: string;
}

export function useCourseReview() {
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const startReview = useCallback(async (courseId: string) => {
    setIsReviewing(true);
    setReviewResult(null);
    setDismissedIds(new Set());

    try {
      const { data, error } = await supabase.functions.invoke("review-course", {
        body: { courseId },
      });

      if (error) {
        throw new Error(error.message || "Ошибка при проверке курса");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const result: ReviewResult = {
        findings: data?.findings || [],
        summary: data?.summary || "Проверка завершена",
      };

      setReviewResult(result);

      if (result.findings.length === 0) {
        toast.success("Проверка завершена — замечаний не найдено!");
      } else {
        toast.info(`Найдено ${result.findings.length} замечаний`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Неизвестная ошибка";
      if (message.includes("402")) {
        toast.error("Требуется пополнение баланса ИИ-кредитов");
      } else if (message.includes("429")) {
        toast.error("Слишком много запросов, попробуйте позже");
      } else {
        toast.error(`Ошибка проверки: ${message}`);
      }
    } finally {
      setIsReviewing(false);
    }
  }, []);

  const dismissFinding = useCallback((findingId: string) => {
    setDismissedIds(prev => new Set([...prev, findingId]));
  }, []);

  const dismissAll = useCallback(() => {
    if (reviewResult) {
      setDismissedIds(new Set(reviewResult.findings.map(f => f.id)));
    }
  }, [reviewResult]);

  const resetReview = useCallback(() => {
    setReviewResult(null);
    setDismissedIds(new Set());
  }, []);

  const activeFindings = reviewResult?.findings.filter(f => !dismissedIds.has(f.id)) || [];

  return {
    isReviewing,
    reviewResult,
    activeFindings,
    dismissedIds,
    startReview,
    dismissFinding,
    dismissAll,
    resetReview,
  };
}
