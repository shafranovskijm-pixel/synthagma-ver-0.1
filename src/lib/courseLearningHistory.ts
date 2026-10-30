import { z } from 'zod';
import { isLearningProgressEpoch } from '@/lib/learningProgress';

const id = z.string().min(1).max(100);
const epoch = z.string().refine(isLearningProgressEpoch);
const instant = z.string().refine(value => /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)));
const count = z.number().int().nonnegative().safe();
const nullableScore = z.number().nonnegative().finite().nullable();
const cursor = z.object({ ts: instant, kind: z.enum(['attempt', 'reset', 'manual_credit']), id });
const schema = z.object({
  course_id: id, enrollment_id: id, learning_progress_epoch: epoch, learning_progress_reset_at: instant.nullable(),
  lessons: z.array(z.object({ lesson_id: id, current_completed: z.boolean() })),
  attempts: z.array(z.object({
    id, lesson_id: id, lesson_title: z.string(), started_at: instant.nullable(), completed_at: instant.nullable(),
    score: nullableScore, max_score: nullableScore, passed: z.boolean().nullable(), passing_score: nullableScore,
    run_epoch: epoch.nullable(), is_current_run: z.boolean(), historical_boundary_known: z.boolean(), is_counted_in_current_run: z.boolean(),
  })).max(100),
  resets: z.array(z.object({
    id, previous_epoch: epoch, learning_progress_epoch: epoch, reset_at: instant,
    previous_progress: z.number().finite().min(0).max(100), previous_status: z.string().nullable(),
  })).max(100),
  manual_credits: z.array(z.object({ id, credited_at: instant, revoked_at: instant.nullable() })).max(100),
  counts: z.object({ attempts_total: count, resets_total: count, manual_credits_total: count }), has_more: z.boolean(),
  next_cursor: cursor.nullable(), per_page_limit: z.literal(100),
});
export type CourseLearningHistory = z.infer<typeof schema>;
export type LearningHistoryCursor = z.infer<typeof cursor>;

export function parseCourseLearningHistory(payload: unknown, courseId: string, enrollmentId: string, expectedEpoch: string): CourseLearningHistory {
  const value = schema.parse(payload);
  if (value.course_id !== courseId || value.enrollment_id !== enrollmentId || value.learning_progress_epoch !== expectedEpoch
    || value.counts.attempts_total < value.attempts.length || value.counts.resets_total < value.resets.length
    || value.counts.manual_credits_total < value.manual_credits.length
    || value.attempts.length + value.resets.length + value.manual_credits.length > value.per_page_limit
    || value.has_more !== (value.next_cursor !== null)) throw new Error('Unconfirmed learning history');
  for (const items of [value.attempts, value.resets, value.manual_credits]) {
    if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Duplicate learning history');
  }
  for (const attempt of value.attempts) {
    if (!attempt.completed_at && !attempt.started_at || attempt.is_counted_in_current_run
      && (!attempt.is_current_run || attempt.passed !== true
        || !value.lessons.some(lesson => lesson.lesson_id === attempt.lesson_id && lesson.current_completed))) {
      throw new Error('Unconfirmed current result');
    }
  }
  return value;
}

/** Pagination only appends distinct older records; it never merges progress rows. */
export function mergeCourseLearningHistory(previous: CourseLearningHistory, page: CourseLearningHistory): CourseLearningHistory {
  if (previous.course_id !== page.course_id || previous.enrollment_id !== page.enrollment_id
    || previous.learning_progress_epoch !== page.learning_progress_epoch || !previous.next_cursor
    || page.next_cursor && JSON.stringify(page.next_cursor) === JSON.stringify(previous.next_cursor)) throw new Error('Unconfirmed history page');
  for (const key of ['attempts', 'resets', 'manual_credits'] as const) {
    const ids = new Set(previous[key].map(item => item.id));
    if (page[key].some(item => ids.has(item.id))) throw new Error('Duplicate history page');
  }
  return { ...page, attempts: [...previous.attempts, ...page.attempts], resets: [...previous.resets, ...page.resets],
    manual_credits: [...previous.manual_credits, ...page.manual_credits] };
}

export type LearningHistoryEvent =
  | { key: string; at: string; kind: 'attempt'; item: CourseLearningHistory['attempts'][number] }
  | { key: string; at: string; kind: 'reset'; item: CourseLearningHistory['resets'][number] }
  | { key: string; at: string; kind: 'credit' | 'credit_revoked'; item: CourseLearningHistory['manual_credits'][number] };

// PostgreSQL stores microseconds; Date.parse alone would collapse events less
// than a millisecond apart and could put a reset before the preceding attempt.
const microseconds = (instant: string) => BigInt(Date.parse(instant)) * 1000n
  + BigInt((instant.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3, 6));

export function chronologicalLearningHistory(value: CourseLearningHistory): LearningHistoryEvent[] {
  const events: LearningHistoryEvent[] = [
    ...value.attempts.map(item => ({ key: 'attempt:' + item.id, at: item.completed_at ?? item.started_at!, kind: 'attempt' as const, item })),
    ...value.resets.map(item => ({ key: 'reset:' + item.id, at: item.reset_at, kind: 'reset' as const, item })),
    ...value.manual_credits.flatMap(item => [
      { key: 'credit:' + item.id, at: item.credited_at, kind: 'credit' as const, item },
      ...(item.revoked_at ? [{ key: 'credit_revoked:' + item.id, at: item.revoked_at, kind: 'credit_revoked' as const, item }] : []),
    ]),
  ];
  return events.sort((a, b) => {
    const ta = microseconds(a.at), tb = microseconds(b.at);
    return ta < tb ? -1 : ta > tb ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}
