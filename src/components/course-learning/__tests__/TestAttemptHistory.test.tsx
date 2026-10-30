import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setOfflineAuthActor } from '@/utils/courseCache';
import { TestAttemptHistory } from '../TestAttemptHistory';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
const props = { userId: 'learner-a', courseId: 'course-a', enrollmentId: 'enrollment-a', learningEpoch: '1' };
const history = (epoch = '1') => ({
  course_id: 'course-a', enrollment_id: 'enrollment-a', learning_progress_epoch: epoch, learning_progress_reset_at: '2026-10-30T01:00:00Z',
  lessons: [{ lesson_id: 'lesson-a', current_completed: false }],
  attempts: [{ id: 'attempt-a', lesson_id: 'lesson-a', lesson_title: 'Сохранённый тест', started_at: null,
    completed_at: '2026-10-29T02:00:00Z', score: 8, max_score: 10, passed: true, passing_score: 60,
    run_epoch: null, is_current_run: false, historical_boundary_known: false, is_counted_in_current_run: false }],
  resets: [{ id: 'reset-a', previous_epoch: '0', learning_progress_epoch: '1', reset_at: '2026-10-30T01:00:00Z', previous_progress: 80, previous_status: 'active' }],
  manual_credits: [], counts: { attempts_total: 1, resets_total: 1, manual_credits_total: 0 }, has_more: false, next_cursor: null, per_page_limit: 100,
});
const open = () => fireEvent.click(screen.getByRole('button', { name: 'История прохождений' }));
beforeEach(() => { setOfflineAuthActor(null); setOfflineAuthActor('learner-a'); rpc.mockReset(); rpc.mockResolvedValue({ data: history(), error: null }); });
afterEach(() => { cleanup(); setOfflineAuthActor(null); });

describe('course history stays separate from current learning', () => {
  it('loads only when explicitly opened and has no action that can credit or navigate a lesson', async () => {
    render(<TestAttemptHistory {...props} />);
    expect(rpc).not.toHaveBeenCalled(); open();
    expect(await screen.findByText('Сохранённый тест')).toBeInTheDocument();
    expect(screen.getByText('Сохранённый результат. Не учитывается в текущем прогрессе.')).toBeInTheDocument();
    expect(screen.getByText('Прогресс сброшен организацией')).toBeInTheDocument();
    expect(screen.getByText(/Предыдущий прогресс: 80%/)).toBeInTheDocument();
    expect(document.querySelectorAll('time[datetime]')).toHaveLength(2);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('get_own_course_learning_history', { p_course_id: 'course-a', p_expected_epoch: '1' });
    expect(screen.queryByRole('button', { name: /Начать|Зачесть|Пройти/ })).not.toBeInTheDocument();
  });
  it('discards an old-epoch response and immediately masks old rendered history on reset', async () => {
    let resolve!: (value: unknown) => void;
    rpc.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const view = render(<TestAttemptHistory {...props} />); open();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    rpc.mockResolvedValueOnce({ data: { ...history('2'), attempts: [], resets: [], counts: { attempts_total: 0, resets_total: 0, manual_credits_total: 0 } }, error: null });
    view.rerender(<TestAttemptHistory {...props} learningEpoch="2" />);
    expect(await screen.findByText('Сохранённых попыток, зачётов и сбросов пока нет.')).toBeInTheDocument();
    await act(async () => { resolve({ data: history(), error: null }); });
    expect(screen.queryByText('Сохранённый тест')).not.toBeInTheDocument();
  });
  it('rejects another assignment and recovers only after a new confirmed read', async () => {
    rpc.mockResolvedValueOnce({ data: { ...history(), enrollment_id: 'another-enrollment' }, error: null });
    render(<TestAttemptHistory {...props} />); open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось подтвердить историю');
    expect(screen.queryByText('Сохранённый тест')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
    expect(await screen.findByText('Сохранённый тест')).toBeInTheDocument();
  });
  it('closes access immediately on actor change and never shows a late response for the previous user', async () => {
    let resolve!: (value: unknown) => void;
    rpc.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const view = render(<TestAttemptHistory {...props} />); open();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    act(() => { setOfflineAuthActor('learner-b'); view.rerender(<TestAttemptHistory {...props} />); });
    await act(async () => { resolve({ data: history(), error: null }); });
    expect(screen.queryByText('Сохранённый тест')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'История прохождений' })).not.toBeInTheDocument();
  });
  it('loads an older page by the exact server cursor without dropping existing records or crediting a lesson', async () => {
    const cursor = { ts: '2026-10-29T02:00:00Z', kind: 'attempt', id: 'attempt-a' };
    rpc.mockResolvedValueOnce({ data: { ...history(), counts: { attempts_total: 101, resets_total: 1, manual_credits_total: 0 }, has_more: true, next_cursor: cursor }, error: null });
    const older = history();
    rpc.mockResolvedValueOnce({ data: { ...older, resets: [], attempts: [{ ...older.attempts[0], id: 'older-attempt', lesson_title: 'Более ранний тест',
      completed_at: '2026-10-28T01:00:00Z' }] }, error: null });
    render(<TestAttemptHistory {...props} />); open();
    expect(await screen.findByText('Показана часть сохранённой истории. Более ранние записи можно загрузить ниже.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Показать более ранние' }));
    expect(await screen.findByText('Более ранний тест')).toBeInTheDocument();
    expect(screen.getByText('Сохранённый тест')).toBeInTheDocument();
    expect(rpc).toHaveBeenLastCalledWith('get_own_course_learning_history', { p_course_id: 'course-a', p_expected_epoch: '1',
      p_cursor_ts: cursor.ts, p_cursor_kind: cursor.kind, p_cursor_id: cursor.id });
    expect(screen.queryByRole('button', { name: 'Показать более ранние' })).not.toBeInTheDocument();
  });
  it('discards an in-flight older page after a reset instead of appending it to the new run', async () => {
    const cursor = { ts: '2026-10-29T02:00:00Z', kind: 'attempt', id: 'attempt-a' };
    let finish!: (value: unknown) => void;
    rpc.mockResolvedValueOnce({ data: { ...history(), has_more: true, next_cursor: cursor }, error: null })
      .mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce({ data: { ...history('2'), attempts: [], resets: [], counts: { attempts_total: 0, resets_total: 0, manual_credits_total: 0 } }, error: null });
    const view = render(<TestAttemptHistory {...props} />); open();
    const button = await screen.findByRole('button', { name: 'Показать более ранние' });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    view.rerender(<TestAttemptHistory {...props} learningEpoch="2" />);
    expect(await screen.findByText('Сохранённых попыток, зачётов и сбросов пока нет.')).toBeInTheDocument();
    await act(async () => { finish({ data: { ...history(), resets: [], attempts: [{ ...history().attempts[0], id: 'late-old', lesson_title: 'Устаревшая страница' }] }, error: null }); });
    expect(screen.queryByText('Устаревшая страница')).not.toBeInTheDocument();
    expect(screen.queryByText('Сохранённый тест')).not.toBeInTheDocument();
  });
});
