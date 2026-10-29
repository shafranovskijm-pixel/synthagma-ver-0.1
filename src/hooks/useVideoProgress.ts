import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchOwnLearningProgress, saveOwnLearningProgress, type LearningProgressRun } from "@/lib/learningProgress";

export interface VideoProgressAuthority {
  learningRun: LearningProgressRun | null;
  captureProgress: () => { run: LearningProgressRun; current: () => boolean } | null;
  onProgressReset: (error: unknown) => Promise<boolean>;
  readOnlyPreview?: boolean;
}
export const useVideoProgress = (userId: string | undefined, lessonId: string | undefined, authority: VideoProgressAuthority) => {
  const [state, setState] = useState({ position: 0, duration: 0, isLoading: true });
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedPositionRef = useRef(0);
  const currentPositionRef = useRef({ position: 0, duration: 0 });
  const latestAuthority = useRef(authority); latestAuthority.current = authority;
  const key = [userId, lessonId, authority.learningRun?.enrollmentId, authority.learningRun?.epoch, !!authority.readOnlyPreview].join(":");
  const keyRef = useRef(key); keyRef.current = key;
  const cancelSave = () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = null; };

  useEffect(() => {
    let active = true;
    const expectedKey = key, current = () => active && keyRef.current === expectedKey;
    cancelSave(); currentPositionRef.current = { position: 0, duration: 0 }; lastSavedPositionRef.current = 0;
    setState({ position: 0, duration: 0, isLoading: !!userId && !!lessonId });
    if (!userId || !lessonId) return () => { active = false; };
    void (async () => {
      try {
        let row: Record<string, unknown> | undefined;
        if (authority.readOnlyPreview) {
          const { data, error } = await supabase.from("lesson_progress").select("video_position,video_duration").eq("user_id", userId).eq("lesson_id", lessonId).maybeSingle();
          if (error) throw error;
          row = data ?? undefined;
        } else {
          const captured = latestAuthority.current.captureProgress();
          if (!captured) return;
          const snapshot = await fetchOwnLearningProgress(captured.run.courseId, captured.run.userId);
          if (!current() || !captured.current()) return;
          if (snapshot.learning_progress_epoch !== captured.run.epoch) { await latestAuthority.current.onProgressReset(new Error("LEARNING_PROGRESS_RESET")); return; }
          row = snapshot.lesson_progress.find(progress => progress.lesson_id === lessonId);
        }
        if (!current()) return;
        const position = typeof row?.video_position === "number" ? row.video_position : 0;
        const duration = typeof row?.video_duration === "number" ? row.video_duration : 0;
        lastSavedPositionRef.current = position; currentPositionRef.current = { position, duration };
        setState({ position, duration, isLoading: false });
      } catch (error) { if (current()) await latestAuthority.current.onProgressReset(error); }
      finally { if (current()) setState(previous => ({ ...previous, isLoading: false })); }
    })();
    return () => { active = false; cancelSave(); currentPositionRef.current = { position: 0, duration: 0 }; };
  }, [key]);

  const persist = useCallback(async (position: number, duration: number) => {
    const captured = latestAuthority.current.captureProgress(), expectedKey = keyRef.current;
    if (!userId || !lessonId || !captured || latestAuthority.current.readOnlyPreview
      || !Number.isFinite(position) || !Number.isFinite(duration) || position < 0 || duration < 0) return;
    try {
      await saveOwnLearningProgress(captured.run, lessonId, { videoPosition: position, videoDuration: duration });
      if (keyRef.current === expectedKey && captured.current()) lastSavedPositionRef.current = position;
    } catch (error) { if (keyRef.current === expectedKey && captured.current()) await latestAuthority.current.onProgressReset(error); }
  }, [userId, lessonId, key]);
  const savePosition = useCallback((position: number, duration: number) => {
    const captured = latestAuthority.current.captureProgress(), expectedKey = keyRef.current;
    if (!captured || latestAuthority.current.readOnlyPreview) return;
    currentPositionRef.current = { position, duration };
    if (Math.abs(position - lastSavedPositionRef.current) < 10) return;
    cancelSave();
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      if (captured.current() && keyRef.current === expectedKey) void persist(position, duration);
    }, 3000);
  }, [persist]);
  const savePositionImmediate = useCallback(async (position: number, duration: number) => {
    cancelSave(); await persist(position, duration);
  }, [persist]);
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState !== "hidden") return;
      const { position, duration } = currentPositionRef.current;
      if (position > 0 && Math.abs(position - lastSavedPositionRef.current) >= 1) void savePositionImmediate(position, duration);
    };
    document.addEventListener("visibilitychange", hidden);
    return () => { document.removeEventListener("visibilitychange", hidden); cancelSave(); };
  }, [savePositionImmediate]);
  return { savedPosition: state.position, savedDuration: state.duration, isLoading: state.isLoading, savePosition, savePositionImmediate };
};
