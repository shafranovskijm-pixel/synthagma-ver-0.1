import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestAttemptDetail, type EnrichedTestAttempt } from '../TestAttemptDetail';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), signed: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, storage: { from: mocks.from } } }));
vi.mock('@/utils/testAttemptPdf', () => ({ generateTestAttemptPdf: vi.fn(), generateTestAttemptExcel: vi.fn() }));
const attempt: EnrichedTestAttempt = { id: 'attempt-a', lesson_id: 'lesson-a', lesson_title: 'Итоговый тест', course_title: 'Курс', score: 1, max_score: 1, passing_score: 60, passed: true, status: 'completed', completed_at: '2026-09-29T00:00:00Z', answers: {}, shown_question_ids: [], questions: [] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ createSignedUrl: mocks.signed });
  mocks.rpc.mockResolvedValue({ data: { bucket: 'final-test-photos', path: 'private/photo.jpg', capturedAt: '2026-09-28T23:58:00Z' }, error: null });
  mocks.signed.mockResolvedValue({ data: { signedUrl: 'https://storage.test/private-signed-photo' }, error: null });
});
afterEach(cleanup);
const open = () => { render(<TestAttemptDetail attempt={attempt} studentName="Ученик" />); fireEvent.click(screen.getByText('Итоговый тест')); };
describe('photo linked to a test attempt', () => {
  it('loads the exact attempt through authorized RPC and a short signed URL', async () => {
    open();
    await waitFor(() => expect(screen.getByAltText('Фото слушателя перед этой попыткой теста')).toBeTruthy());
    expect(mocks.rpc).toHaveBeenCalledWith('get_test_attempt_photo', { p_attempt_id: 'attempt-a' });
    expect(mocks.from).toHaveBeenCalledWith('final-test-photos');
    expect(mocks.signed).toHaveBeenCalledWith('private/photo.jpg', 60);
  });
  it('distinguishes a denied/unavailable read from an absent photograph', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    open();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Это не означает, что его нет'));
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(screen.queryByText('Фото для этой попытки не записывалось.')).toBeNull();
  });
  it('shows absence only when the server authorizes the attempt and returns null', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    open();
    await waitFor(() => expect(screen.getByText('Фото для этой попытки не записывалось.')).toBeTruthy());
    expect(mocks.signed).not.toHaveBeenCalled();
  });
  it('removes stale evidence when the displayed attempt changes', async () => {
    const view = render(<TestAttemptDetail attempt={attempt} studentName="Ученик" />);
    fireEvent.click(screen.getByText('Итоговый тест'));
    await waitFor(() => expect(screen.getByAltText('Фото слушателя перед этой попыткой теста')).toBeTruthy());
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    view.rerender(<TestAttemptDetail attempt={{ ...attempt, id: 'attempt-b' }} studentName="Ученик" />);
    await waitFor(() => expect(screen.getByText('Фото для этой попытки не записывалось.')).toBeTruthy());
    expect(screen.queryByAltText('Фото слушателя перед этой попыткой теста')).toBeNull();
  });
});
