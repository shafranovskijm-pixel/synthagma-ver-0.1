import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { LogEntry, PipelineSummary, PipelineCourse } from "./useBulkPipeline";
import { getMarketplacePrompts } from "@/components/admin/MarketplaceSettings";

interface PipelineRun {
  id: string;
  status: string;
  current_index: number;
  total_courses: number;
  current_phase: string;
  completed_log: LogEntry[];
  summary: PipelineSummary | null;
  updated_at?: string;
}

const STALE_RUN_THRESHOLD = 5 * 60 * 1000; // 5 minutes
const MAX_POLL_ERRORS = 5;

interface UseServerPipelineProps {
  courses: PipelineCourse[];
  enableVerification: boolean;
  onComplete: () => void;
  aiProvider?: string;
  gigachatModel?: string;
  lovableModel?: string;
}

export function useServerPipeline({ courses, enableVerification, onComplete, aiProvider, gigachatModel, lovableModel }: UseServerPipelineProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState<PipelineRun | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollErrorCountRef = useRef(0);

  // Poll for updates with error counting and stale detection
  const startPolling = useCallback((runId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollErrorCountRef.current = 0;

    const poll = async () => {
      try {
        const { data, error } = await supabase
          .from("pipeline_runs")
          .select("id, status, current_index, total_courses, current_phase, completed_log, summary, updated_at")
          .eq("id", runId)
          .single();

        if (error) throw error;
        if (!data) return;

        // Reset error counter on success
        pollErrorCountRef.current = 0;

        const run = data as unknown as PipelineRun;
        setCurrentRun(run);

        // Stale run detection: running but no heartbeat for 5 min
        if (run.status === "running" && run.updated_at) {
          const updatedAt = new Date(run.updated_at).getTime();
          if (Date.now() - updatedAt > STALE_RUN_THRESHOLD) {
            console.warn(`[ServerPipeline] Stale run detected: ${runId}, last update ${Math.round((Date.now() - updatedAt) / 1000)}s ago`);
            // Mark as partial and stop — don't auto-resume (avoid infinite loop)
            await supabase.from("pipeline_runs").update({
              status: "partial",
              current_phase: "Зависание обнаружено — нажмите «Продолжить» для возобновления",
              updated_at: new Date().toISOString(),
            } as any).eq("id", runId);
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setIsRunning(false);
            toast.warning("Серверный процесс завис. Нажмите «Продолжить» для возобновления.", { duration: 8000 });
            return;
          }
        }

        if (run.status === "completed" || run.status === "error" || run.status === "stopped") {
          setIsRunning(false);
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          onComplete();

          if (run.status === "completed") {
            toast.success(`Серверный конвейер завершён. Решено ${run.summary?.totalTestsSolved || 0} тестов.`);
          } else if (run.status === "stopped") {
            toast.info("Конвейер остановлен");
          }
        } else if (run.status === "partial") {
          // Don't auto-resume — let user click "Продолжить" manually
          setIsRunning(false);
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (e) {
        pollErrorCountRef.current++;
        console.error(`[ServerPipeline] Poll error ${pollErrorCountRef.current}/${MAX_POLL_ERRORS}:`, e);

        if (pollErrorCountRef.current >= MAX_POLL_ERRORS) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setIsRunning(false);
          toast.error("Потеряна связь с сервером. Нажмите «Запустить» для переподключения.", { duration: 10000 });
        }
      }
    };

    poll(); // Initial fetch
    pollRef.current = setInterval(poll, 3000);
  }, [onComplete]);

  // Check for existing active run on mount
  useEffect(() => {
    const checkActive = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("pipeline_runs")
        .select("id, status, current_index, total_courses, current_phase, completed_log, summary")
        .eq("user_id", user.id)
        .in("status", ["running", "partial"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const run = data[0] as unknown as PipelineRun;
        setCurrentRun(run);
        setIsRunning(true);

        if (run.status === "partial") {
          toast.info("Обнаружен незавершённый серверный конвейер. Продолжаю...");
          handleResume(run.id);
        } else {
          startPolling(run.id);
        }
      }
    };
    checkActive();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [startPolling]);

  const handleStart = useCallback(async () => {
    if (courses.length === 0) return;
    setIsRunning(true);

    const prompts = getMarketplacePrompts();
    const courseEntries = courses.map(c => ({
      id: c.id,
      marketplace_id: c.id,
      course_id: c.course_id,
      title: c.course?.title || "",
    }));

    try {
      const { data, error } = await supabase.functions.invoke("bulk-pipeline", {
        body: {
          action: "start",
          courses: courseEntries,
          enableVerification,
          prompts,
          ai_provider: aiProvider,
          gigachat_model: gigachatModel,
          lovable_model: lovableModel,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.runId) {
        startPolling(data.runId);

        // If it completed immediately (very few courses)
        if (data.status === "completed") {
          setIsRunning(false);
          setCurrentRun(prev => prev ? { ...prev, status: "completed", summary: data.summary } : null);
          toast.success("Серверный конвейер завершён");
          onComplete();
        }
      }
    } catch (e: any) {
      setIsRunning(false);
      toast.error(`Ошибка запуска: ${e?.message || "Неизвестная ошибка"}`);
    }
  }, [courses, enableVerification, startPolling, onComplete]);

  const handleResume = useCallback(async (runId: string) => {
    try {
      const prompts = getMarketplacePrompts();
      const { data, error } = await supabase.functions.invoke("bulk-pipeline", {
        body: { action: "resume", runId, prompts, enableVerification, gigachat_model: gigachatModel, lovable_model: lovableModel },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.runId) {
        startPolling(data.runId);
      }
    } catch (e: any) {
      toast.error(`Ошибка возобновления: ${e?.message || "Неизвестная ошибка"}`);
      setIsRunning(false);
    }
  }, [enableVerification, startPolling]);

  const handleStop = useCallback(async () => {
    // Always stop polling and reset UI state first
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setIsRunning(false);

    if (!currentRun) return;

    // Try edge function stop, but don't depend on it
    try {
      await supabase.functions.invoke("bulk-pipeline", {
        body: { action: "stop", runId: currentRun.id },
      });
    } catch (e: any) {
      console.error("Stop edge function failed, updating DB directly:", e);
      // Fallback: update DB directly
      try {
        await supabase.from("pipeline_runs").update({
          status: "stopped",
          current_phase: "Остановлено вручную",
          updated_at: new Date().toISOString(),
        } as any).eq("id", currentRun.id);
      } catch (dbErr) {
        console.error("DB stop fallback also failed:", dbErr);
      }
    }
    toast.info("Конвейер остановлен");
  }, [currentRun]);

  const progressPercent = currentRun
    ? currentRun.total_courses > 0
      ? Math.round(((currentRun.completed_log?.length || 0) / currentRun.total_courses) * 100)
      : 0
    : 0;

  return {
    isRunning,
    currentRun,
    progressPercent,
    handleStart,
    handleStop,
  };
}
