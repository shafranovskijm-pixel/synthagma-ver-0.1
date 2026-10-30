import { describe, expect, it } from 'vitest';
import { chronologicalLearningHistory, mergeCourseLearningHistory, parseCourseLearningHistory } from '../courseLearningHistory';

const payload = () => ({
  course_id: 'course-a', enrollment_id: 'enrollment-a', learning_progress_epoch: '1', learning_progress_reset_at: '2026-10-30T01:00:00Z',
  lessons: [{ lesson_id: 'lesson-a', current_completed: false }],
  attempts: [{ id: 'attempt-a', lesson_id: 'lesson-a', lesson_title: 'Тест', started_at: '2026-10-29T01:00:00Z',
    completed_at: '2026-10-29T02:00:00Z', score: 8, max_score: 10, passed: true, passing_score: 60,
    run_epoch: '0', is_current_run: false, historical_boundary_known: true, is_counted_in_current_run: false }],
  resets: [{ id: 'reset-a', previous_epoch: '0', learning_progress_epoch: '1', reset_at: '2026-10-30T01:00:00Z', previous_progress: 80, previous_status: 'active' }],
  manual_credits: [{ id: 'credit-a', credited_at: '2026-10-29T03:00:00Z', revoked_at: '2026-10-30T01:00:00Z' }],
  counts: { attempts_total: 1, resets_total: 1, manual_credits_total: 1 }, has_more: false, next_cursor: null, per_page_limit: 100,
});
const read = (value: unknown) => parseCourseLearningHistory(value, 'course-a', 'enrollment-a', '1');

describe('read-only course learning chronology', () => {
  it('orders attempts, grants, revocations and resets without changing stored outcomes', () => {
    const value = read(payload()), events = chronologicalLearningHistory(value);
    expect(events.map(event => event.kind)).toEqual(['attempt', 'credit', 'credit_revoked', 'reset']);
    expect(value.attempts[0]).toMatchObject({ score: 8, max_score: 10, passed: true, is_counted_in_current_run: false });
  });
  it('preserves chronological order across a sub-millisecond reset boundary', () => {
    const input = payload();
    input.attempts[0].completed_at = '2026-10-30T01:00:00.000099Z';
    input.resets[0].reset_at = '2026-10-30T01:00:00.000001Z';
    const events = chronologicalLearningHistory(read(input));
    expect(events.findIndex(event => event.kind === 'reset')).toBeLessThan(events.findIndex(event => event.kind === 'attempt'));
  });
  it.each(['course_id', 'enrollment_id', 'learning_progress_epoch'])('rejects another %s instead of displaying another run', key => {
    expect(() => read({ ...payload(), [key]: 'other' })).toThrow();
  });
  it('keeps unknown legacy boundaries explicitly unknown and strips unrequested keys', () => {
    const input = payload();
    input.attempts[0] = { ...input.attempts[0], started_at: null, run_epoch: null, historical_boundary_known: false } as never;
    const value = read({ ...input, answers: { private: 'must not appear' }, test_questions: ['secret'] });
    expect(value.attempts[0]).toMatchObject({ started_at: null, run_epoch: null, historical_boundary_known: false, is_counted_in_current_run: false });
    expect(value).not.toHaveProperty('answers');
    expect(value).not.toHaveProperty('test_questions');
  });
  it('preserves an unknown historical outcome instead of regrading its score against current settings', () => {
    const input = payload();
    input.attempts[0] = { ...input.attempts[0], passed: null, passing_score: null } as never;
    expect(read(input).attempts[0]).toMatchObject({ score: 8, max_score: 10, passed: null, passing_score: null });
  });
  it('rejects a falsely claimed current pass when its current progress row is absent', () => {
    const input = payload();
    input.attempts[0] = { ...input.attempts[0], is_current_run: true, is_counted_in_current_run: true };
    expect(() => read(input)).toThrow('Unconfirmed current result');
  });
  it('rejects duplicate rows, invalid dates and false complete-history counts', () => {
    const input = payload();
    expect(() => read({ ...input, attempts: [input.attempts[0], input.attempts[0]], counts: { ...input.counts, attempts_total: 2 } })).toThrow();
    expect(() => read({ ...input, learning_progress_reset_at: 'not a date' })).toThrow();
    expect(() => read({ ...input, has_more: true })).toThrow('Unconfirmed learning history');
    expect(read({ ...input, counts: { ...input.counts, attempts_total: 101 }, has_more: true,
      next_cursor: { ts: input.attempts[0].completed_at, kind: 'attempt', id: 'attempt-a' } }).has_more).toBe(true);
  });
  it('merges distinct older pages without recrediting results and rejects duplicate or looping cursors', () => {
    const before = { ts: '2026-10-29T02:00:00Z', kind: 'attempt' as const, id: 'attempt-a' };
    const first = read({ ...payload(), has_more: true, next_cursor: before });
    const older = read({ ...payload(), resets: [], manual_credits: [], attempts: [{ ...payload().attempts[0], id: 'attempt-earlier',
      started_at: '2026-10-28T01:00:00Z', completed_at: '2026-10-28T02:00:00Z' }] });
    const combined = mergeCourseLearningHistory(first, older);
    expect(chronologicalLearningHistory(combined)[0].key).toBe('attempt:attempt-earlier');
    expect(combined.attempts).toHaveLength(2);
    expect(combined.next_cursor).toBeNull();
    expect(() => mergeCourseLearningHistory(first, read(payload()))).toThrow('Duplicate history page');
    expect(() => mergeCourseLearningHistory(first, { ...older, next_cursor: before, has_more: true })).toThrow('Unconfirmed history page');
  });
});
