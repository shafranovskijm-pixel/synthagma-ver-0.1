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
}

export function useServerPipeline({ courses, enableVerification, onComplete }: UseServerPipelineProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState<PipelineRun | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for updates
  const startPolling = useCallback((runId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    const poll = async () => {
      const { data } = await supabase
        .from("pipeline_runs")
        .select("id, status, current_index, total_courses, current_phase, completed_log, summary")
        .eq("id", runId)
        .single();

      if (!data) return;

      const run = data as unknown as PipelineRun;
      setCurrentRun(run);

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
        // Auto-resume partial runs
        setIsRunning(true);
        handleResume(runId);
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
        body: { action: "resume", runId, prompts, enableVerification },
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
    if (!currentRun) return;
    try {
      await supabase.functions.invoke("bulk-pipeline", {
        body: { action: "stop", runId: currentRun.id },
      });
    } catch (e: any) {
      console.error("Stop error:", e);
    }
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
