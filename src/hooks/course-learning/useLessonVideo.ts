import { useState, useEffect } from "react";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import type { Lesson } from "./types";

interface UseLessonVideoParams {
  userId: string | undefined;
  currentLesson: Lesson | undefined;
}

export function useLessonVideo({ userId, currentLesson }: UseLessonVideoParams) {
  const [videoWatchProgress, setVideoWatchProgress] = useState(0);

  const videoLessonId = currentLesson?.type === 'video' ? currentLesson.id : undefined;
  const { savedPosition, savedDuration, isLoading: isVideoProgressLoading, savePosition: saveVideoPosition } = useVideoProgress(userId, videoLessonId);

  // Restore video progress
  useEffect(() => {
    if (savedPosition > 0 && savedDuration > 0 && currentLesson?.type === 'video') {
      const restoredProgress = (savedPosition / savedDuration) * 100;
      if (restoredProgress > videoWatchProgress) {
        setVideoWatchProgress(restoredProgress);
      }
    }
  }, [savedPosition, savedDuration, currentLesson?.id]);

  return {
    videoWatchProgress, setVideoWatchProgress,
    savedPosition, isVideoProgressLoading, saveVideoPosition,
  };
}
