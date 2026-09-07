import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestAttemptStatus, type TestAttemptStatusProps } from '../TestAttemptStatus';

afterEach(cleanup);
const base = (): TestAttemptStatusProps => ({
  maxAttempts: 5, attemptsUsed: 1, maxAttemptsPerDay: 3, attemptsUsedToday: 1,
  active: false, submitted: false, busy: false, blocked: false, error: null,
  onStart: vi.fn(), onRefresh: vi.fn(),
});
describe('TestAttemptStatus user actions', () => {
  it('requires an explicit start and displays daily and overall usage', () => {
    const props = base();
    render(<TestAttemptStatus {...props} />);
    expect(props.onStart).not.toHaveBeenCalled();
    expect(screen.getByText(/Сегодня начато попыток/)).toHaveTextContent('1 из 3. Всего: 1 из 5.');
    fireEvent.click(screen.getByRole('button', { name: 'Начать тест' }));
    expect(props.onStart).toHaveBeenCalledTimes(1);
  });
  it('disables starting after the daily cap and explains the Moscow reset', () => {
    const props = { ...base(), attemptsUsedToday: 3, blocked: true };
    render(<TestAttemptStatus {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent('На сегодня попытки закончились');
    expect(screen.getByRole('status')).toHaveTextContent('00:00 по Москве');
    const start = screen.getByRole('button', { name: 'Начать тест' });
    expect(start).toBeDisabled();
    fireEvent.click(start);
    expect(props.onStart).not.toHaveBeenCalled();
  });
  it('prioritizes exhausted overall allowance over the daily reset', () => {
    render(<TestAttemptStatus {...base()} attemptsUsed={5} attemptsUsedToday={3} blocked />);
    expect(screen.getByRole('status')).toHaveTextContent('Использованы все попытки теста.');
    expect(screen.getByRole('status')).not.toHaveTextContent('Следующая попытка');
  });
  it('lets the student continue an existing attempt even at the daily cap', () => {
    render(<TestAttemptStatus {...base()} active blocked attemptsUsedToday={3} />);
    expect(screen.getByText(/Вы продолжаете начатую попытку/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Начать тест' })).not.toBeInTheDocument();
    expect(screen.queryByText(/На сегодня попытки закончились/)).not.toBeInTheDocument();
  });
  it('offers refresh instead of start when server state is unavailable', () => {
    const props = { ...base(), error: 'Не удалось загрузить тест' };
    render(<TestAttemptStatus {...props} />);
    expect(screen.queryByRole('button', { name: 'Начать тест' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Обновить состояние теста' }));
    expect(props.onRefresh).toHaveBeenCalledTimes(1);
    expect(props.onStart).not.toHaveBeenCalled();
  });
  it('shows manual credit as passed without a fabricated score or restart action', () => {
    render(<TestAttemptStatus {...base()} submitted manualCredit={{ creditedAt: '2026-09-07T01:00:00Z', creditedBy: 'Teacher' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Тест сдан — зачтено организацией');
    expect(screen.getByRole('status')).toHaveTextContent('Повторно проходить тест не требуется');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent('100%');
  });
  it('prevents repeated starts while the first request is busy', () => {
    const props = { ...base(), busy: true };
    render(<TestAttemptStatus {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Начать тест' }));
    expect(props.onStart).not.toHaveBeenCalled();
  });
});
