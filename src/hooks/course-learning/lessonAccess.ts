import type { Lesson, LessonProgress } from './types';

type AccessLesson = Pick<Lesson, 'id' | 'is_locked' | 'locked_until'>;

export interface LessonCompletionIndex {
  completedIds: ReadonlySet<string>;
  /** Entry i says every lesson before i is completed; entry0 is true. */
  completeBefore: readonly boolean[];
}

/** Build once per lesson/progress change, rather than scanning progress per link. */
export function buildLessonCompletionIndex(
  lessons: readonly Pick<Lesson, 'id'>[],
  progress: readonly LessonProgress[],
): LessonCompletionIndex {
  const completedIds = new Set(progress.filter(p => p.completed).map(p => p.lesson_id));
  const completeBefore = [true];
  for (let i = 0; i < lessons.length; i++) {
    completeBefore.push(completeBefore[i] && completedIds.has(lessons[i].id));
  }
  return { completedIds, completeBefore };
}

export function isCourseLessonAccessible(
  lessons: readonly AccessLesson[],
  index: number,
  sequential: boolean | undefined,
  completion: LessonCompletionIndex,
  completedOverride?: ReadonlySet<string>,
): boolean {
  const lesson = lessons[index];
  if (lesson?.is_locked) return false;
  if (lesson?.locked_until) {
    // Keep time live: a memoized render must not freeze a scheduled unlock.
    if (new Date(lesson.locked_until).getTime() > Date.now()) return false;
  }
  if (!sequential || index === 0) return true;

  if (!completedOverride && Number.isInteger(index) && index >= 0 && index <= lessons.length) {
    return completion.completeBefore[index];
  }
  // markLessonProgress can pass the just-saved IDs before React publishes its
  // state. Preserve that override and the original unusual-index behavior.
  const completed = completedOverride ?? completion.completedIds;
  for (let i = 0; i < index; i++) {
    if (!completed.has(lessons[i].id)) return false;
  }
  return true;
}
