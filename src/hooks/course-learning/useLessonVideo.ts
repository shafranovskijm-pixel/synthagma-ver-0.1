import { useState, useEffect } from "react";
import { useVideoProgress, type VideoProgressAuthority } from "@/hooks/useVideoProgress";
import type { Lesson } from "./types";

interface UseLessonVideoParams extends VideoProgressAuthority {
  userId: string | undefined;
  currentLesson: Lesson | undefined;
}

export function useLessonVideo({ userId, currentLesson, ...authority }: UseLessonVideoParams) {
  const [videoWatchProgress, setVideoWatchProgress] = useState(0);

  const videoLessonId = currentLesson?.type === 'video' ? currentLesson.id : undefined;
  const { savedPosition, savedDuration, isLoading: isVideoProgressLoading, savePosition: saveVideoPosition } = useVideoProgress(userId, videoLessonId, authority);

  // A new server run may move progress down to zero.
  useEffect(() => {
    setVideoWatchProgress(savedDuration > 0 && currentLesson?.type === "video" ? (savedPosition / savedDuration) * 100 : 0);
  }, [savedPosition, savedDuration, currentLesson?.id, authority.learningRun?.epoch]);

  return {
    videoWatchProgress, setVideoWatchProgress,
    savedPosition, isVideoProgressLoading, saveVideoPosition,
  };
}
