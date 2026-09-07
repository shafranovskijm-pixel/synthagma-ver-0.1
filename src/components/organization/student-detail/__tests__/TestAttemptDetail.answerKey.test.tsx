import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestAttemptDetail, type EnrichedTestAttempt } from '../TestAttemptDetail';

vi.mock('@/utils/testAttemptPdf', () => ({ generateTestAttemptPdf: vi.fn(), generateTestAttemptExcel: vi.fn() }));
afterEach(cleanup);

const attempt = (key: number | null | undefined): EnrichedTestAttempt => ({
  id: 'attempt', lesson_id: 'lesson', lesson_title: 'Тест', course_title: 'Курс',
  score: 0, max_score: 1, passing_score: 60, passed: false,
  status: 'completed', completed_at: '2026-09-07T01:00:00Z',
  started_at: '2026-09-07T00:00:00Z', shown_question_ids: ['question'], answers: { question: 0 },
  questions: [{ id: 'question', question: 'Вопрос', options: ['Выбранный ответ', 'Другой ответ'],
    ...(key === undefined ? {} : { correct_answer: key }) }],
});
function openReview(data: EnrichedTestAttempt) {
  render(<TestAttemptDetail attempt={data} studentName="Ученик" />);
  fireEvent.click(screen.getByText('Тест'));
}

describe('attempt review with invalid saved keys', () => {
  it.each([null, -1, 2])('shows neutral saved-key diagnostics for %s without blaming the selected answer', key => {
    openReview(attempt(key));
    expect(screen.getByText(/Правильный ответ в вопросе/).textContent).toContain('Балл не начислен');
    const selection = screen.getByText('Ответ ученика:').parentElement!;
    expect(selection.textContent).toContain('Выбранный ответ');
    expect(selection.className).not.toContain('destructive');
    expect(selection.querySelector('svg')).toBeNull();
  });

  it('does not interpret a hidden answer key as a broken key', () => {
    openReview(attempt(undefined));
    expect(screen.queryByText(/Правильный ответ в вопросе/)).toBeNull();
    expect(screen.getByText('Ответ ученика:')).toBeTruthy();
  });

  it('does not disclose key diagnostics before completion', () => {
    openReview({ ...attempt(null), status: 'in_progress', completed_at: null });
    expect(screen.queryByText(/Правильный ответ в вопросе/)).toBeNull();
    expect(screen.queryByText('1. Вопрос')).toBeNull();
  });

  it('keeps normal correct and wrong option feedback for valid keys', () => {
    openReview(attempt(1));
    expect(screen.queryByText(/Правильный ответ в вопросе/)).toBeNull();
    expect(screen.getByText('Выбранный ответ').className).toContain('destructive');
    expect(screen.getByText('Другой ответ').className).toContain('green');
  });
});
