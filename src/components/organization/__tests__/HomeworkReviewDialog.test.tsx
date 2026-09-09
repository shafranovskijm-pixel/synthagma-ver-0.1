import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeworkReviewDialog } from '../HomeworkReviewDialog';

interface ReviewResult {
  data: { id: string; status: string; reviewer_id: string | null } | null;
  error: { message: string; code?: string } | null;
}

const mocks = vi.hoisted(() => ({
  from: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(),
  maybeSingle: vi.fn<() => Promise<ReviewResult>>(),
  getUser: vi.fn(), invoke: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: mocks.from, auth: { getUser: mocks.getUser }, functions: { invoke: mocks.invoke },
} }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));

const confirmedRow = { id: 'submission-a', status: 'approved', reviewer_id: 'reviewer-a' };
const submission = {
  id: 'submission-a', content: 'Synthetic answer', attachments: [], status: 'pending',
  score: null, reviewer_comment: null, submitted_at: '2026-09-09T00:00:00Z',
  student_name: 'Synthetic student', lesson_title: 'Synthetic homework',
};

function openReview(status = 'pending') {
  const onUpdated = vi.fn();
  render(<HomeworkReviewDialog submission={{ ...submission, status }} open
    onOpenChange={vi.fn()} onUpdated={onUpdated} />);
  return { onUpdated, submit: () => fireEvent.click(screen.getByRole('button', { name: 'Отправить' })) };
}

function deferredResult() {
  let settle: (value: ReviewResult) => void = () => { throw new Error('Deferred result not initialized'); };
  const promise = new Promise<ReviewResult>(resolve => { settle = resolve; });
  return { promise, resolve: (value: ReviewResult) => settle(value) };
}

beforeEach(() => {
  vi.clearAllMocks();
  const query = { update: mocks.update, eq: mocks.eq, select: mocks.select, maybeSingle: mocks.maybeSingle };
  mocks.from.mockReturnValue(query);
  mocks.update.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.select.mockReturnValue(query);
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'reviewer-a' } }, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: confirmedRow, error: null });
  mocks.invoke.mockResolvedValue({ data: null, error: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('HomeworkReviewDialog actual-row confirmation', () => {
  it.each(['approved', 'revision', 'rejected'])('notifies once only after the expected %s row and actor are confirmed', async status => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...confirmedRow, status }, error: null });
    const view = openReview(status === 'approved' ? 'pending' : status);
    fireEvent.change(screen.getByPlaceholderText('Напишите комментарий к работе ученика...'), { target: { value: '  Synthetic review  ' } });
    fireEvent.change(screen.getByPlaceholderText('0-100'), { target: { value: '0' } });
    view.submit();
    await waitFor(() => expect(view.onUpdated).toHaveBeenCalledOnce());
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith('homework_submissions');
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      status, reviewer_id: 'reviewer-a', reviewer_comment: 'Synthetic review', score: 0,
    }));
    expect(mocks.eq).toHaveBeenCalledExactlyOnceWith('id', 'submission-a');
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith('id, status, reviewer_id');
    expect(mocks.maybeSingle).toHaveBeenCalledOnce();
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('notify-homework-graded', { body: { submission_id: 'submission-a' } });
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith('Проверка сохранена');
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('does not notify or report success while the returning-row response is still pending', async () => {
    const pending = deferredResult();
    mocks.maybeSingle.mockReturnValue(pending.promise);
    const view = openReview();
    view.submit();
    await waitFor(() => expect(mocks.maybeSingle).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: /Отправить$/ })).toBeDisabled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(view.onUpdated).not.toHaveBeenCalled();
    await act(async () => { pending.resolve({ data: confirmedRow, error: null }); });
    expect(mocks.invoke).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
    expect(view.onUpdated).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ score: null, reviewer_comment: null }));
  });

  const failures: { label: string; result: ReviewResult }[] = [
    { label: 'zero rows without an error', result: { data: null, error: null } },
    { label: 'wrong submission', result: { data: { ...confirmedRow, id: 'submission-b' }, error: null } },
    { label: 'wrong status', result: { data: { ...confirmedRow, status: 'pending' }, error: null } },
    { label: 'wrong reviewer', result: { data: { ...confirmedRow, reviewer_id: 'reviewer-b' }, error: null } },
    { label: 'missing reviewer', result: { data: { ...confirmedRow, reviewer_id: null }, error: null } },
    { label: 'database error with a matching row', result: { data: confirmedRow, error: { message: 'Synthetic denial', code: '42501' } } },
    { label: 'ambiguous returning rows', result: { data: null, error: { message: 'Synthetic multiple rows', code: 'PGRST116' } } },
  ];
  it.each(failures)('fails closed on $label', async ({ result }) => {
    mocks.maybeSingle.mockResolvedValue(result);
    const view = openReview();
    view.submit();
    await waitFor(() => expect(mocks.error).toHaveBeenCalledExactlyOnceWith('Ошибка сохранения'));
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(view.onUpdated).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeEnabled();
  });

  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: '' } }, error: null },
    { data: { user: { id: 'reviewer-a' } }, error: { message: 'Synthetic auth error' } },
  ])('does not start an update without a confirmed authenticated actor %#', async authResult => {
    mocks.getUser.mockResolvedValue(authResult);
    const view = openReview();
    view.submit();
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(view.onUpdated).not.toHaveBeenCalled();
  });

  it.each(['auth', 'update'])('restores the submit button and does not notify after a rejected %s promise', async stage => {
    if (stage === 'auth') mocks.getUser.mockRejectedValue(new Error('Synthetic auth transport failure'));
    else mocks.maybeSingle.mockRejectedValue(new Error('Synthetic update transport failure'));
    const view = openReview();
    view.submit();
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeEnabled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(view.onUpdated).not.toHaveBeenCalled();
  });

  it('retains confirmed-save feedback when the existing best-effort notification rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.invoke.mockRejectedValue(new Error('Synthetic notification failure'));
    const view = openReview();
    view.submit();
    await waitFor(() => expect(view.onUpdated).toHaveBeenCalledOnce());
    expect(mocks.invoke).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
