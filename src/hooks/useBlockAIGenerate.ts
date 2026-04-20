import { useState, useCallback } from "react";
import { checkAiLimitGlobal, incrementAiLimitGlobal } from "@/hooks/useAiGenerationLimit";
import { toast } from "sonner";

/**
 * Centralised wrapper for "AI generate" actions inside content blocks.
 * Handles: limit check, loading state, success increment, uniform error toasts.
 *
 * Usage:
 *   const { isGenerating, run } = useBlockAIGenerate();
 *   await run(async () => {
 *     const result = await myAiCall();
 *     onUpdate({ content: result });
 *   }, "Не удалось сгенерировать");
 */
export function useBlockAIGenerate() {
  const [isGenerating, setIsGenerating] = useState(false);

  const run = useCallback(
    async <T,>(
      action: () => Promise<T | null | undefined>,
      errorLabel = "Не удалось сгенерировать контент"
    ): Promise<T | null> => {
      if (!(await checkAiLimitGlobal())) return null;
      setIsGenerating(true);
      try {
        const result = await action();
        // null/undefined → action handled its own error path; do not bill
        if (result === null || result === undefined) return null;
        await incrementAiLimitGlobal();
        return result;
      } catch (err: any) {
        console.error("[useBlockAIGenerate]", err);
        const msg: string = err?.message || "";
        if (msg.includes("429")) toast.error("Слишком много запросов, попробуйте позже");
        else if (msg.includes("402")) toast.error("Лимит ИИ исчерпан");
        else toast.error(errorLabel, { description: msg || undefined });
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    []
  );

  return { isGenerating, run };
}
