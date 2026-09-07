import { beforeEach, describe, expect, it, vi } from 'vitest';
import { duplicateCourse } from '../courses';

const state = vi.hoisted(() => ({
  lesson: {} as Record<string, unknown>,
  writes: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      let inserted = false;
      const result = () => {
        if (table === 'courses') return { data: inserted
          ? { id: 'course-copy', organization_id: 'destination-org' }
          : { id: 'course-original', organization_id: 'source-org', title: 'Охрана труда' }, error: null };
        if (table === 'lessons') return { data: inserted ? { id: 'lesson-copy' } : [state.lesson], error: null };
        return { data: [], error: null };
      };
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => Promise.resolve(result()),
        insert: (payload: Record<string, unknown>) => {
          inserted = true;
          state.writes.push({ table, payload });
          return builder;
        },
        single: () => Promise.resolve(result()),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
      };
      return builder;
    },
  },
}));

beforeEach(() => {
  state.writes.length = 0;
  state.lesson = {
    id: 'lesson-original', title: 'Итоговый тест', type: 'test', content: null, order_index: 0,
    test_questions_count: 12, test_questions_to_show: 8, test_passing_score: 75,
    test_max_attempts: 10, test_max_attempts_per_day: 3, test_show_answers: false, is_locked: false,
  };
});

describe('duplicateCourse test policy preservation', () => {
  it.each([
    { target: undefined, daily: 3, overall: 10, showAnswers: false },
    { target: 'destination-org', daily: 5, overall: 20, showAnswers: true },
    { target: 'destination-org', daily: null, overall: null, showAnswers: false },
  ])('preserves test policy when copying or transferring ($daily daily)', async ({ target, daily, overall, showAnswers }) => {
    Object.assign(state.lesson, {
      test_max_attempts_per_day: daily, test_max_attempts: overall, test_show_answers: showAnswers,
    });
    expect(await duplicateCourse('course-original', target)).toMatchObject({ id: 'course-copy' });
    const copiedLesson = state.writes.find(write => write.table === 'lessons')?.payload;
    expect(copiedLesson).toMatchObject({
      course_id: 'course-copy', test_passing_score: 75,
      test_questions_count: 12, test_questions_to_show: 8,
      test_max_attempts: overall, test_max_attempts_per_day: daily, test_show_answers: showAnswers,
    });
    expect(state.writes.find(write => write.table === 'courses')?.payload).toMatchObject({
      organization_id: target ?? 'source-org', is_published: false,
    });
  });
});
