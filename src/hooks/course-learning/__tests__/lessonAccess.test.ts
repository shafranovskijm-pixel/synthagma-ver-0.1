import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLessonCompletionIndex, isCourseLessonAccessible } from '../lessonAccess';
import type { Lesson, LessonProgress } from '../types';

const lesson = (id: string, extra: Partial<Lesson> = {}): Lesson => ({ id, title: id, type: 'text', order_index: 0, ...extra });
afterEach(() => vi.restoreAllMocks());

describe('lesson access completion index', () => {
  it('preserves sequence, duplicate progress and explicit static locks', () => {
    const lessons = [lesson('a'), lesson('b'), lesson('c', { is_locked: true })];
    const progress: LessonProgress[] = [{ lesson_id: 'a', completed: false }, { lesson_id: 'a', completed: true }, { lesson_id: 'foreign', completed: true }];
    const index = buildLessonCompletionIndex(lessons, progress);
    expect(lessons.map((_, i) => isCourseLessonAccessible(lessons, i, true, index))).toEqual([true, true, false]);
    expect(isCourseLessonAccessible(lessons, 2, false, index)).toBe(false);
    expect(isCourseLessonAccessible([lesson('first', { is_locked: true })], 0, false, buildLessonCompletionIndex([], []))).toBe(false);
  });

  it('uses freshly saved override IDs before React state updates without bypassing locks', () => {
    const lessons = [lesson('a'), lesson('b')];
    const index = buildLessonCompletionIndex(lessons, []);
    expect(isCourseLessonAccessible(lessons, 1, true, index)).toBe(false);
    expect(isCourseLessonAccessible(lessons, 1, true, index, new Set(['a']))).toBe(true);
    expect(isCourseLessonAccessible(lessons, 1, true, index)).toBe(false);
    expect(isCourseLessonAccessible([lessons[0], { ...lessons[1], is_locked: true }], 1, true, index, new Set(['a']))).toBe(false);
  });

  it('keeps scheduled unlock time live without rebuilding the completion index', () => {
    const time = vi.spyOn(Date, 'now');
    const lessons = [lesson('a', { locked_until: '2026-10-20T12:00:00Z' })];
    const index = buildLessonCompletionIndex(lessons, []);
    time.mockReturnValue(Date.parse('2026-10-20T11:59:59Z'));
    expect(isCourseLessonAccessible(lessons, 0, false, index)).toBe(false);
    time.mockReturnValue(Date.parse('2026-10-20T12:00:00Z'));
    expect(isCourseLessonAccessible(lessons, 0, false, index)).toBe(true);
    expect(isCourseLessonAccessible([lesson('a', { locked_until: 'legacy-invalid-date' })], 0, true, index)).toBe(true);
  });

  it('matches the previous access rules across every progress/lock subset and schedule state', () => {
    const now = Date.parse('2026-10-20T12:00:00Z'); vi.spyOn(Date, 'now').mockReturnValue(now);
    for (const sequential of [false, true]) for (let done = 0; done < 8; done++) for (let locks = 0; locks < 8; locks++) {
      for (const lockedUntil of [undefined, '2026-10-20T11:59:59Z', '2026-10-20T12:00:00Z', '2026-10-20T12:00:01Z', 'legacy-invalid']) {
        const lessons = ['a', 'b', 'c'].map((id, i) => lesson(id, { is_locked: !!(locks & (1 << i)), locked_until: lockedUntil }));
        const progress = lessons.map((l, i) => ({ lesson_id: l.id, completed: !!(done & (1 << i)) }));
        const completion = buildLessonCompletionIndex(lessons, progress);
        for (let target = 0; target < lessons.length; target++) {
          const current = lessons[target];
          const locked = current.is_locked || (!!current.locked_until && Date.parse(current.locked_until) > now);
          const priorComplete = progress.slice(0, target).every(p => p.completed);
          const expected = !locked && (!sequential || priorComplete);
          expect(isCourseLessonAccessible(lessons, target, sequential, completion)).toBe(expected);
        }
      }
    }
  });

  it('does not reread preceding lesson identities for every link of a large completed course', () => {
    let idReads = 0;
    const lessons = Array.from({ length: 300 }, (_, n) => ({ ...lesson(String(n)), get id() { idReads++; return String(n); } }));
    const completion = buildLessonCompletionIndex(lessons, lessons.map((_, n) => ({ lesson_id: String(n), completed: true })));
    idReads = 0;
    expect(lessons.every((_, i) => isCourseLessonAccessible(lessons, i, true, completion))).toBe(true);
    expect(idReads).toBe(0); // Prevents the previous nested predecessor/progress scans.
  });
});
