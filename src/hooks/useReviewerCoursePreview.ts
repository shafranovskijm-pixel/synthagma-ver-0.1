import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchCourseReviewLesson,
  fetchCourseReviewSnapshot,
} from "@/api/courseReviewer";

export const reviewerSnapshotKey = (userId?: string, courseId?: string) =>
  ["reviewer-course", userId, courseId] as const;

export const reviewerLessonKey = (
  userId?: string,
  courseId?: string,
  lessonId?: string,
) => ["reviewer-lesson", userId, courseId, lessonId] as const;

export function useReviewerCoursePreview(courseId?: string) {
  const { user } = useAuth();
  const [selectedLessonId, setSelectedLessonId] = useState<string>();

  const snapshotQuery = useQuery({
    queryKey: reviewerSnapshotKey(user?.id, courseId),
    queryFn: () => fetchCourseReviewSnapshot(courseId!),
    enabled: Boolean(user?.id && courseId),
    staleTime: 30_000,
    retry: false,
  });

  const activeLessonId = useMemo(() => {
    const lessons = snapshotQuery.data?.lessons ?? [];
    if (selectedLessonId && lessons.some((lesson) => lesson.id === selectedLessonId)) {
      return selectedLessonId;
    }
    return lessons[0]?.id;
  }, [selectedLessonId, snapshotQuery.data?.lessons]);

  const lessonQuery = useQuery({
    queryKey: reviewerLessonKey(user?.id, courseId, activeLessonId),
    queryFn: () => fetchCourseReviewLesson(courseId!, activeLessonId!),
    enabled: Boolean(user?.id && courseId && activeLessonId),
    staleTime: 30_000,
    retry: false,
  });

  const currentIndex = snapshotQuery.data?.lessons.findIndex(
    (lesson) => lesson.id === activeLessonId,
  ) ?? -1;

  const selectPreviousLesson = () => {
    if (!snapshotQuery.data || currentIndex <= 0) return;
    setSelectedLessonId(snapshotQuery.data.lessons[currentIndex - 1].id);
  };

  const selectNextLesson = () => {
    if (!snapshotQuery.data || currentIndex < 0 || currentIndex >= snapshotQuery.data.lessons.length - 1) return;
    setSelectedLessonId(snapshotQuery.data.lessons[currentIndex + 1].id);
  };

  return {
    snapshot: snapshotQuery.data,
    lesson: lessonQuery.data,
    activeLessonId,
    currentIndex,
    selectLesson: setSelectedLessonId,
    selectPreviousLesson,
    selectNextLesson,
    snapshotLoading: snapshotQuery.isLoading,
    snapshotError: snapshotQuery.error,
    retrySnapshot: snapshotQuery.refetch,
    lessonLoading: lessonQuery.isLoading,
    lessonError: lessonQuery.error,
    retryLesson: lessonQuery.refetch,
  };
}
