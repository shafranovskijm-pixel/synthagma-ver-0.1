import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLessonTest } from '../useLessonTest';
import type { Lesson, TestQuestion } from '../types';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), enqueue: vi.fn(), admin: vi.fn(),
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/utils/adminViewMode', () => ({ isAdminViewActive: mocks.admin }));
vi.mock('@/utils/testAnswerQueue', () => ({
  enqueueTestSubmission: mocks.enqueue,
  isRetryableTestError: (error: { code?: string }) => !error.code || error.code.startsWith('08'),
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));

const lesson = (id: string): Lesson => ({ id, title: id, type: 'test', order_index: 0 });
const question = (id: string): TestQuestion => ({ id, question: id, options: ['A', 'B'], correct_answer: -1, order_index: 0 });
const limits = { maxAttempts: 5, maxAttemptsPerDay: 3, attemptsUsed: 0, attemptsUsedToday: 0, resetAt: null };
const idle = () => ({ ...limits, hasAttempt: false, passingScore: 60, showAnswers: false, activeAttempt: null });
const active = (id = 'attempt-a', qid = 'question-a') => ({
  ...limits, attemptId: id, startedAt: '2026-09-07T02:00:00Z', questions: [question(qid)],
  passingScore: 60, showAnswers: false, attemptsUsed: 1, attemptsUsedToday: 1,
});
const success = () => ({
  ...limits, score: 1, maxScore: 1, scorePercent: 100, passed: true, passingScore: 60,
  correctAnswers: { 'question-a': 0 }, explanations: {}, attemptsUsed: 1, attemptsUsedToday: 1,
});
const response = (data: unknown) => ({ data, error: null });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function harness(overrides: Partial<Parameters<typeof useLessonTest>[0]> = {}) {
  const params = {
    currentLesson: lesson('lesson-a'), user: { id: 'user-a' }, lessons: [lesson('lesson-a')],
    lessonProgress: [], completedCount: 0, enrollmentId: 'enrollment-a', courseId: 'course-a',
    course: { title: 'Course A', duration: null }, setLessonProgress: vi.fn(),
    saveLessonTime: vi.fn().mockResolvedValue(undefined), handleCourseCompletion: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const hook = renderHook((props: Parameters<typeof useLessonTest>[0]) => useLessonTest(props), { initialProps: params });
  return { ...hook, params };
}
const ready = async (result: { current: ReturnType<typeof useLessonTest> }) => {
  await waitFor(() => expect(result.current.testQuestionsLoading).toBe(false));
};

describe('final test photo gate', () => {
  const challenge = { required: true, challengeId: 'challenge-a', bucket: 'final-test-photos', path: 'user-a/challenge-a.jpg', completed: false };
  it('opens a fresh challenge without consuming an attempt and starts after server confirmation', async () => {
    let confirmed = false;
    mocks.rpc.mockImplementation(name => Promise.resolve(response(name === 'prepare_final_test_photo' ? { ...challenge, completed: confirmed }
      : name === 'start_test_attempt' ? active() : { ...idle(), photoRequired: true })));
    const { result } = harness(); await ready(result);
    await act(async () => { await result.current.startTest(); });
    expect(result.current.testPhotoChallenge?.challengeId).toBe('challenge-a');
    expect(result.current.testAttemptsUsed).toBe(0);
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'start_test_attempt')).toBe(false);
    const request = mocks.rpc.mock.calls.find(([name]) => name === 'prepare_final_test_photo')![1].p_request_id;
    confirmed = true;
    await act(async () => { await result.current.completeTestPhoto('challenge-a'); });
    expect(result.current.testAttemptId).toBe('attempt-a');
    expect(result.current.testPhotoChallenge).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith('start_test_attempt', { p_lesson_id: 'lesson-a', p_request_id: request });
  });

  it('restores an unstarted request after reload and does not reuse a prior general verification', async () => {
    mocks.rpc.mockImplementation(name => Promise.resolve(response(name === 'prepare_final_test_photo' ? challenge : { ...idle(), photoRequired: true })));
    const first = harness(); await ready(first.result);
    await act(async () => { await first.result.current.startTest(); });
    const request = mocks.rpc.mock.calls.find(([name]) => name === 'prepare_final_test_photo')![1].p_request_id;
    first.unmount();
    const second = harness(); await ready(second.result);
    await act(async () => { await second.result.current.startTest(); });
    const prepares = mocks.rpc.mock.calls.filter(([name]) => name === 'prepare_final_test_photo');
    expect(prepares[prepares.length - 1][1].p_request_id).toBe(request);
    expect(second.result.current.testPhotoChallenge).not.toBeNull();
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'start_test_attempt')).toBe(false);
  });

  it('does not prepare a photo for disabled/nonfinal tests or a resumed attempt', async () => {
    mocks.rpc.mockImplementation(name => Promise.resolve(response(name === 'start_test_attempt' ? active() : idle())));
    const first = harness(); await ready(first.result);
    await act(async () => { await first.result.current.startTest(); });
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'prepare_final_test_photo')).toBe(false);
    first.unmount(); mocks.rpc.mockClear();
    mocks.rpc.mockResolvedValue(response({ ...idle(), photoRequired: true, activeAttempt: active() }));
    const resumed = harness(); await ready(resumed.result);
    expect(resumed.result.current.testAttemptId).toBe('attempt-a');
    expect(resumed.result.current.testPhotoChallenge).toBeNull();
    expect(mocks.rpc.mock.calls.every(([name]) => name === 'get_student_test_state')).toBe(true);
  });

  it('closes photo without starting and ignores a late challenge for another lesson', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    mocks.rpc.mockImplementation(name => name === 'prepare_final_test_photo' ? pending.promise : Promise.resolve(response({ ...idle(), photoRequired: true })));
    const { result, params, rerender } = harness(); await ready(result);
    let start!: Promise<void>;
    act(() => { start = result.current.startTest(); });
    rerender({ ...params, currentLesson: lesson('lesson-b') }); await ready(result);
    await act(async () => { pending.resolve(response(challenge)); await start; });
    expect(result.current.testPhotoChallenge).toBeNull();
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'start_test_attempt')).toBe(false);
  });

  it('keeps the requirement after a server denial caused by a freshly enabled course setting', async () => {
    const { result } = harness(); await ready(result);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'Final test photo required' } });
    await act(async () => { await result.current.startTest(); });
    expect(result.current.testPhotoRequired).toBe(true);
    expect(result.current.testQuestionsError).toContain('нужно новое фото');
    expect(result.current.testAttemptsUsed).toBe(0);
  });

  it('rejects late confirmation after cancellation and uses a new request for a new camera dialog', async () => {
    mocks.rpc.mockImplementation(name => Promise.resolve(response(name === 'prepare_final_test_photo' ? challenge : { ...idle(), photoRequired: true })));
    const { result } = harness(); await ready(result);
    await act(async () => { await result.current.startTest(); });
    const request = mocks.rpc.mock.calls.find(([name]) => name === 'prepare_final_test_photo')![1].p_request_id;
    const lateComplete = result.current.completeTestPhoto;
    act(() => result.current.closeTestPhoto());
    await act(async () => { await lateComplete('challenge-a'); });
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'start_test_attempt')).toBe(false);
    await act(async () => { await result.current.startTest(); });
    const prepares = mocks.rpc.mock.calls.filter(([name]) => name === 'prepare_final_test_photo');
    expect(prepares[prepares.length - 1][1].p_request_id).not.toBe(request);
  });

  it('rejects an old photo completion after the learner changes lessons', async () => {
    mocks.rpc.mockImplementation(name => Promise.resolve(response(name === 'prepare_final_test_photo' ? challenge : { ...idle(), photoRequired: true })));
    const { result, rerender, params } = harness(); await ready(result);
    await act(async () => { await result.current.startTest(); });
    const lateComplete = result.current.completeTestPhoto;
    rerender({ ...params, currentLesson: lesson('lesson-b') }); await ready(result);
    await act(async () => { await lateComplete('challenge-a'); });
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'start_test_attempt')).toBe(false);
  });

  it('does not overwrite a renewed challenge with a late A-to-B-to-A response', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    let prepareCount = 0;
    mocks.rpc.mockImplementation(name => name === 'prepare_final_test_photo'
      ? (++prepareCount === 1 ? pending.promise : Promise.resolve(response({ ...challenge, challengeId: 'challenge-new', path: 'user-a/new.jpg' })))
      : Promise.resolve(response({ ...idle(), photoRequired: true })));
    const { result, params, rerender } = harness(); await ready(result);
    let oldStart!: Promise<void>;
    act(() => { oldStart = result.current.startTest(); });
    rerender({ ...params, currentLesson: lesson('lesson-b') }); await ready(result);
    rerender(params); await ready(result);
    await act(async () => { await result.current.startTest(); });
    expect(result.current.testPhotoChallenge?.challengeId).toBe('challenge-new');
    await act(async () => { pending.resolve(response(challenge)); await oldStart; });
    expect(result.current.testPhotoChallenge?.challengeId).toBe('challenge-new');
    expect(result.current.testQuestionsLoading).toBe(false);
  });
});
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.admin.mockReturnValue(false);
  mocks.enqueue.mockResolvedValue('user-a:attempt-a');
  mocks.rpc.mockResolvedValue(response(idle()));
});

describe('useLessonTest server attempt lifecycle', () => {
  it('preserves an explicit null answer key returned after submission', async () => {
    mocks.rpc.mockImplementation(name => Promise.resolve(response(name === 'submit_test_attempt'
      ? { ...success(), score: 0, scorePercent: 0, passed: false, showAnswers: true, correctAnswers: { 'question-a': null } }
      : { ...idle(), activeAttempt: active() })));
    const { result, params } = harness();
    await ready(result);
    act(() => result.current.setAnswers({ 'question-a': 0 }));
    await act(async () => { await result.current.submitTest(); });
    expect(result.current.testQuestions[0].correct_answer).toBeNull();
    expect(result.current.testScore).toEqual({ score: 0, max: 1 });
    expect(params.handleCourseCompletion).not.toHaveBeenCalled();
  });

  it('preserves null feedback on refresh instead of falling back to a different question key', async () => {
    mocks.rpc.mockResolvedValue(response({ ...idle(), hasAttempt: true, showAnswers: true,
      correctAnswers: { 'question-a': null },
      attempt: { score: 0, max_score: 1, answers: { 'question-a': 0 }, questions: [question('question-a')] } }));
    const { result } = harness();
    await ready(result);
    expect(result.current.testQuestions[0].correct_answer).toBeNull();
  });

  it('keeps hidden answer keys absent when completed feedback is restricted', async () => {
    const { correct_answer: _key, ...hiddenQuestion } = question('question-a');
    mocks.rpc.mockResolvedValue(response({ ...idle(), hasAttempt: true, correctAnswers: {},
      attempt: { score: 0, max_score: 1, answers: { 'question-a': 0 }, questions: [hiddenQuestion] } }));
    const { result } = harness();
    await ready(result);
    expect(result.current.testShowAnswers).toBe(false);
    expect(result.current.testQuestions[0]).not.toHaveProperty('correct_answer');
  });

  it('loads status without starting or consuming an attempt', async () => {
    const { result } = harness();
    await ready(result);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('get_student_test_state', { p_lesson_id: 'lesson-a' });
    expect(result.current.testAttemptId).toBeNull();
    expect(result.current.testAttemptsUsedToday).toBe(0);
    expect(result.current.testQuestions).toEqual([]);
  });

  it('explains malformed test content without claiming a network failure or consuming an attempt', async () => {
    const { result } = harness();
    await ready(result);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'Test content invalid: answer options are empty' } });
    await act(async () => { await result.current.startTest(); });
    expect(result.current.testQuestionsError).toContain('Попытка не списана');
    expect(result.current.testQuestionsError).toContain('Обратитесь в учебную организацию');
    expect(result.current.testAttemptId).toBeNull();
    expect(result.current.testAttemptsUsedToday).toBe(0);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('restores the same active attempt and its owner-scoped draft after remount', async () => {
    mocks.rpc.mockResolvedValue(response({ ...idle(), activeAttempt: active() }));
    sessionStorage.setItem('test-draft:user-a:attempt-a', JSON.stringify({ 'question-a': 1 }));
    const first = harness();
    await ready(first.result);
    expect(first.result.current.answers).toEqual({ 'question-a': 1 });
    first.unmount();
    const second = harness();
    await ready(second.result);
    expect(second.result.current.testAttemptId).toBe('attempt-a');
    expect(second.result.current.answers).toEqual({ 'question-a': 1 });
    expect(mocks.rpc.mock.calls.every(([name]) => name === 'get_student_test_state')).toBe(true);
  });

  it('does not expose the previous user draft after account changes', async () => {
    mocks.rpc.mockResolvedValue(response({ ...idle(), activeAttempt: active() }));
    sessionStorage.setItem('test-draft:user-a:attempt-a', JSON.stringify({ 'question-a': 1 }));
    const { result, rerender, params } = harness();
    await ready(result);
    mocks.rpc.mockResolvedValueOnce(response({ ...idle(), activeAttempt: active('attempt-b', 'question-b') }));
    rerender({ ...params, user: { id: 'user-b' } });
    await ready(result);
    expect(result.current.answers).toEqual({});
    expect(sessionStorage.getItem('test-draft:user-b:attempt-a')).toBeNull();
    expect(sessionStorage.getItem('test-draft:user-a:attempt-a')).toBe('{"question-a":1}');
  });

  it('ignores a previous lesson response arriving after a switch', async () => {
    const old = deferred<ReturnType<typeof response>>();
    mocks.rpc.mockImplementation((_name, args) => args.p_lesson_id === 'lesson-a'
      ? old.promise : Promise.resolve(response({ ...idle(), activeAttempt: active('attempt-b', 'question-b') })));
    const { result, rerender, params } = harness();
    rerender({ ...params, currentLesson: lesson('lesson-b') });
    await ready(result);
    await act(async () => { old.resolve(response({ ...idle(), activeAttempt: active() })); await old.promise; });
    expect(result.current.testAttemptId).toBe('attempt-b');
    expect(result.current.testQuestions.map(q => q.id)).toEqual(['question-b']);
  });

  it('starts once on a double click and preserves request identity after a network error', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    mocks.rpc.mockImplementation(name => name === 'start_test_attempt' ? pending.promise : Promise.resolve(response(idle())));
    const { result } = harness();
    await ready(result);
    let first!: Promise<void>;
    act(() => { first = result.current.startTest(); void result.current.startTest(); });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'start_test_attempt')).toHaveLength(1);
    await act(async () => { pending.resolve({ data: null, error: { code: '08006', message: 'connection lost' } } as never); await first; });
    const requestId = mocks.rpc.mock.calls.find(([name]) => name === 'start_test_attempt')![1].p_request_id;
    mocks.rpc.mockResolvedValueOnce(response(active()));
    await act(async () => { await result.current.startTest(); });
    const calls = mocks.rpc.mock.calls.filter(([name]) => name === 'start_test_attempt');
    expect(calls[1][1].p_request_id).toBe(requestId);
    expect(result.current.testAttemptId).toBe('attempt-a');
  });

  it('shows exhausted daily allowance while still allowing an existing attempt to resume', async () => {
    mocks.rpc.mockResolvedValue(response({ ...idle(), attemptsUsed: 3, attemptsUsedToday: 3,
      activeAttempt: { ...active(), attemptsUsed: 3, attemptsUsedToday: 3 } }));
    const { result } = harness();
    await ready(result);
    expect(result.current.testLimitReached).toBe(true);
    expect(result.current.testAttemptId).toBe('attempt-a');
    expect(result.current.testQuestions).toHaveLength(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('marks manual credit completed without manufacturing a test score or submitting answers', async () => {
    mocks.rpc.mockResolvedValue(response({ ...idle(), manualCredit: { creditedAt: '2026-09-07T01:00:00Z', creditedBy: 'Teacher' } }));
    const { result, params } = harness();
    await ready(result);
    expect(result.current.testSubmitted).toBe(true);
    expect(result.current.testScore).toBeNull();
    expect(result.current.testQuestions).toEqual([]);
    const update = vi.mocked(params.setLessonProgress).mock.calls[0][0];
    if (typeof update !== 'function') throw new Error('Expected a progress state updater');
    expect(update([])).toEqual([{ lesson_id: 'lesson-a', completed: true }]);
    await act(async () => { await result.current.startTest(); await result.current.submitTest(); });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(params.handleCourseCompletion).not.toHaveBeenCalled();
  });

  it('submits the original attempt only once on double click and uses the server score', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    mocks.rpc.mockImplementation(name => name === 'submit_test_attempt' ? pending.promise
      : Promise.resolve(response({ ...idle(), activeAttempt: active() })));
    const { result, params } = harness();
    await ready(result);
    act(() => result.current.setAnswers({ 'question-a': 0 }));
    let first!: Promise<void>;
    act(() => { first = result.current.submitTest(); void result.current.submitTest(); });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'submit_test_attempt')).toEqual([
      ['submit_test_attempt', { p_attempt_id: 'attempt-a', p_answers: { 'question-a': 0 } }],
    ]);
    await act(async () => { pending.resolve(response(success())); await first; });
    expect(result.current.testScore).toEqual({ score: 1, max: 1 });
    expect(params.handleCourseCompletion).toHaveBeenCalledExactlyOnceWith({ score: 1, max: 1 });
    expect(sessionStorage.getItem('test-draft:user-a:attempt-a')).toBeNull();
  });

  it('queues retryable submissions using the same authenticated owner and attempt', async () => {
    mocks.rpc.mockImplementation(name => Promise.resolve(name === 'submit_test_attempt'
      ? { data: null, error: { code: '08006', message: 'offline' } }
      : response({ ...idle(), activeAttempt: active() })));
    const { result } = harness();
    await ready(result);
    act(() => result.current.setAnswers({ 'question-a': 1 }));
    await act(async () => { await result.current.submitTest(); });
    expect(mocks.enqueue).toHaveBeenCalledExactlyOnceWith({
      attemptId: 'attempt-a', userId: 'user-a', lessonId: 'lesson-a',
      answers: { 'question-a': 1 }, shownQuestionIds: ['question-a'],
    });
    expect(result.current.testSubmitted).toBe(false);
    expect(result.current.testScore).toBeNull();
  });

  it('does not reopen a submitted attempt when an older focus refresh finishes last', async () => {
    const refresh = deferred<ReturnType<typeof response>>();
    mocks.rpc.mockResolvedValueOnce(response({ ...idle(), activeAttempt: active() }));
    const { result } = harness();
    await ready(result);
    act(() => result.current.setAnswers({ 'question-a': 0 }));
    mocks.rpc.mockImplementation(name => name === 'get_student_test_state' ? refresh.promise : Promise.resolve(response(success())));
    act(() => window.dispatchEvent(new Event('focus')));
    await act(async () => { await result.current.submitTest(); });
    expect(result.current.testSubmitted).toBe(true);
    await act(async () => { refresh.resolve(response({ ...idle(), activeAttempt: active() })); await refresh.promise; });
    expect(result.current.testSubmitted).toBe(true);
    expect(result.current.testAttemptId).toBeNull();
    expect(result.current.testScore).toEqual({ score: 1, max: 1 });
    expect(result.current.testQuestionsLoading).toBe(false);
  });

  it('does not complete the previous course after switching lessons while saving time', async () => {
    const timeSave = deferred<void>();
    mocks.rpc.mockImplementation(name => Promise.resolve(name === 'submit_test_attempt'
      ? response(success()) : response({ ...idle(), activeAttempt: active() })));
    const { result, params, rerender } = harness({ saveLessonTime: vi.fn(() => timeSave.promise) });
    await ready(result);
    act(() => result.current.setAnswers({ 'question-a': 0 }));
    let submit!: Promise<void>;
    act(() => { submit = result.current.submitTest(); });
    await waitFor(() => expect(params.saveLessonTime).toHaveBeenCalledTimes(1));
    rerender({ ...params, currentLesson: lesson('lesson-b'), courseId: 'course-b', lessons: [lesson('lesson-b')] });
    await ready(result);
    await act(async () => { timeSave.resolve(); await submit; });
    expect(params.handleCourseCompletion).not.toHaveBeenCalled();
    expect(params.setLessonProgress).not.toHaveBeenCalled();
  });

  it('completes the last lesson after queued answers sync using the saved server score', async () => {
    const priorLesson = { ...lesson('lesson-prior'), type: 'text' };
    const { result, params } = harness({
      lessons: [priorLesson, lesson('lesson-a')],
      lessonProgress: [{ lesson_id: priorLesson.id, completed: true }],
    });
    await ready(result);
    expect(params.handleCourseCompletion).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce(response({
      ...idle(), hasAttempt: true, passed: true,
      attempt: { score: 2, max_score: 3, passing_score: 60, answers: { 'question-a': 0 }, questions: [question('question-a')] },
    }));
    act(() => window.dispatchEvent(new Event('test-submission-synced')));
    await waitFor(() => expect(params.handleCourseCompletion).toHaveBeenCalledExactlyOnceWith({ score: 2, max: 3 }));
    expect(result.current.testScore).toEqual({ score: 2, max: 3 });
    expect(result.current.testSubmitted).toBe(true);
    const update = vi.mocked(params.setLessonProgress).mock.calls[0][0];
    if (typeof update !== 'function') throw new Error('Expected a progress state updater');
    expect(update(params.lessonProgress)).toEqual([
      { lesson_id: 'lesson-prior', completed: true }, { lesson_id: 'lesson-a', completed: true },
    ]);
  });

  it.each(['failed-result', 'unavailable-state'])('does not complete a course on queued sync with %s', async scenario => {
    const { result, params } = harness();
    await ready(result);
    mocks.rpc.mockResolvedValueOnce(scenario === 'failed-result'
      ? response({ ...idle(), hasAttempt: true, passed: false,
        attempt: { score: 0, max_score: 3, passing_score: 60, answers: {}, questions: [] } })
      : { data: null, error: { code: '08006', message: 'connection lost' } });
    act(() => window.dispatchEvent(new Event('test-submission-synced')));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    await ready(result);
    expect(params.handleCourseCompletion).not.toHaveBeenCalled();
    expect(params.setLessonProgress).not.toHaveBeenCalled();
    if (scenario === 'failed-result') expect(result.current.testScore).toEqual({ score: 0, max: 3 });
    else expect(result.current.testQuestionsError).not.toBeNull();
  });

  it('ignores a queued-sync result arriving after the student switches to another lesson', async () => {
    const syncedState = deferred<ReturnType<typeof response>>();
    const { result, params, rerender } = harness();
    await ready(result);
    mocks.rpc.mockResolvedValueOnce(syncedState.promise);
    act(() => window.dispatchEvent(new Event('test-submission-synced')));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    mocks.rpc.mockResolvedValueOnce(response(idle()));
    rerender({ ...params, currentLesson: lesson('lesson-b'), lessons: [lesson('lesson-b')], courseId: 'course-b' });
    await ready(result);
    await act(async () => {
      syncedState.resolve(response({ ...idle(), hasAttempt: true, passed: true,
        attempt: { score: 2, max_score: 3, passing_score: 60, answers: {}, questions: [] } }));
      await syncedState.promise;
    });
    expect(result.current.testScore).toBeNull();
    expect(params.handleCourseCompletion).not.toHaveBeenCalled();
    expect(params.setLessonProgress).not.toHaveBeenCalled();
  });
});
