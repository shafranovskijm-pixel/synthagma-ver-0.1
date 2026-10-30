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
  const key = JSON.stringify([userId, lessonId, authority.learningRun?.userId, authority.learningRun?.courseId,
    authority.learningRun?.enrollmentId, authority.learningRun?.epoch, !!authority.readOnlyPreview]);
  const makeScope = () => ({ key, authority, position: 0, duration: 0, lastSavedPosition: 0,
    timer: null as ReturnType<typeof setTimeout> | null });
  const scopeRef = useRef(makeScope());
  // Invalidate the old position AND its callbacks during render. Passive-effect
  // cleanup is too late for a hidden event fired in the same commit as a reset.
  if (scopeRef.current.key !== key) scopeRef.current = makeScope();
  const scope = scopeRef.current;
  scope.authority = authority;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const currentScope = () => mounted.current && scopeRef.current === scope;
  const captureSave = () => {
    if (!currentScope() || scope.authority.readOnlyPreview || !userId || !lessonId) return null;
    const captured = scope.authority.captureProgress(), run = scope.authority.learningRun;
    if (!captured || !run || captured.run.userId !== userId || captured.run.userId !== run.userId
      || captured.run.courseId !== run.courseId || captured.run.enrollmentId !== run.enrollmentId
      || captured.run.epoch !== run.epoch || !captured.current()) return null;
    return captured;
  };
  const [state, setState] = useState({ scope, position: 0, duration: 0, isLoading: true });
  const cancelSave = () => { if (scope.timer) clearTimeout(scope.timer); scope.timer = null; };

  useEffect(() => {
    let active = true;
    const current = () => active && currentScope();
    cancelSave(); scope.position = 0; scope.duration = 0; scope.lastSavedPosition = 0;
    setState({ scope, position: 0, duration: 0, isLoading: !!userId && !!lessonId });
    if (!userId || !lessonId) return () => { active = false; };
    void (async () => {
      try {
        let row: Record<string, unknown> | undefined;
        if (authority.readOnlyPreview) {
          const { data, error } = await supabase.from("lesson_progress").select("video_position,video_duration").eq("user_id", userId).eq("lesson_id", lessonId).maybeSingle();
          if (error) throw error;
          row = data ?? undefined;
        } else {
          const captured = captureSave();
          if (!captured) return;
          const snapshot = await fetchOwnLearningProgress(captured.run.courseId, captured.run.userId);
          if (!current() || !captured.current()) return;
          if (snapshot.learning_progress_epoch !== captured.run.epoch) { await scope.authority.onProgressReset(new Error("LEARNING_PROGRESS_RESET")); return; }
          row = snapshot.lesson_progress.find(progress => progress.lesson_id === lessonId);
        }
        if (!current()) return;
        const position = typeof row?.video_position === "number" && Number.isFinite(row.video_position) && row.video_position >= 0 ? row.video_position : 0;
        const duration = typeof row?.video_duration === "number" && Number.isFinite(row.video_duration) && row.video_duration >= 0 ? row.video_duration : 0;
        scope.lastSavedPosition = position; scope.position = position; scope.duration = duration;
        setState({ scope, position, duration, isLoading: false });
      } catch (error) { if (current()) await scope.authority.onProgressReset(error); }
      finally { if (current()) setState(previous => previous.scope === scope ? { ...previous, isLoading: false } : previous); }
    })();
    return () => { active = false; cancelSave(); scope.position = 0; scope.duration = 0; };
  }, [scope]);

  const persist = useCallback(async (position: number, duration: number) => {
    const captured = captureSave();
    if (!userId || !lessonId || !captured
      || !Number.isFinite(position) || !Number.isFinite(duration) || position < 0 || duration < 0) return;
    try {
      await saveOwnLearningProgress(captured.run, lessonId, { videoPosition: position, videoDuration: duration });
      if (currentScope() && captured.current()) scope.lastSavedPosition = position;
    } catch (error) { if (currentScope() && captured.current()) await scope.authority.onProgressReset(error); }
  }, [scope]);
  const savePosition = useCallback((position: number, duration: number) => {
    const captured = captureSave();
    if (!captured || !Number.isFinite(position) || !Number.isFinite(duration) || position < 0 || duration < 0) return;
    scope.position = position; scope.duration = duration;
    if (Math.abs(position - scope.lastSavedPosition) < 10) return;
    cancelSave();
    scope.timer = setTimeout(() => {
      scope.timer = null;
      if (captured.current() && currentScope()) void persist(position, duration);
    }, 3000);
  }, [persist]);
  const savePositionImmediate = useCallback(async (position: number, duration: number) => {
    cancelSave(); await persist(position, duration);
  }, [persist]);
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState !== "hidden") return;
      if (!currentScope()) return;
      const { position, duration } = scope;
      if (position > 0 && Math.abs(position - scope.lastSavedPosition) >= 1) void savePositionImmediate(position, duration);
    };
    document.addEventListener("visibilitychange", hidden);
    return () => { document.removeEventListener("visibilitychange", hidden); cancelSave(); };
  }, [savePositionImmediate]);
  const visibleState = state.scope === scope ? state : { position: 0, duration: 0, isLoading: !!userId && !!lessonId };
  return { savedPosition: visibleState.position, savedDuration: visibleState.duration, isLoading: visibleState.isLoading, savePosition, savePositionImmediate };
};
