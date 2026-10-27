import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DrivingApp from '@/components/driving-school/DrivingApp';
import type { DrivingAdapter, Lesson, State } from '@/lib/driving-school/types';
import { schoolState } from './fixtures';

const NOW = Date.parse('2026-10-27T18:20:00Z');
const MINUTE = 60000;
function lesson(id: string, start: number, end: number, status = 'booked'): Lesson {
  return { id, student_id: 'student', instructor_id: 'instructor', car_id: 'car',
    start, end, status, actual_minutes: status === 'completed' ? 30 : 0, topic: id, note: '' };
}
function state(role: State['user']['role'] = 'student'): State {
  const value = schoolState();
  value.user = { ...value.user, role, resource_id: role === 'owner' ? '' : role };
  value.school.settings = JSON.stringify({ timezone: 'Asia/Vladivostok', horizonDays: 30, cancelHours: 12 });
  value.balances[0].reserved = 30;
  return value;
}
function adapter(value: State) {
  return { load: vi.fn().mockResolvedValue(value), mutate: vi.fn(),
    canCreateStudents: true } satisfies DrivingAdapter;
}
function ui(value: DrivingAdapter) {
  return <MemoryRouter initialEntries={['/driving-school?view=today']}>
    <DrivingApp adapter={value} onExit={() => {}} />
  </MemoryRouter>;
}
async function show(value: State) {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  const port = adapter(value);
  render(ui(port));
  await screen.findByText('QA School A');
  return port;
}
function lessonPanel(student = true) {
  const heading = screen.getByRole('heading', { name: student ? 'Ближайшие занятия' : 'Расписание на сегодня' });
  const panel = heading.closest('section');
  if (!panel) throw new Error('Expected dashboard lesson section');
  return within(panel);
}
afterEach(() => { vi.useRealTimers(); });

describe('dashboard ongoing lessons and role-specific empty guidance', () => {
  it('ASD01 student still sees a booked lesson five minutes after its start without granting completed minutes', async () => {
    const value = state();
    value.lessons = [lesson('QA ongoing lesson', NOW - 5 * MINUTE, NOW + 25 * MINUTE)];
    const before = JSON.stringify(value);
    const port = await show(value);
    const panel = lessonPanel();
    expect(panel.getByText(/QA ongoing lesson/)).toBeTruthy();
    expect(panel.getByText('Запланировано')).toBeTruthy();
    expect(panel.queryByText('Занятий пока нет')).toBeNull();
    expect(screen.queryByText('В зачёт: 0 ч 30 мин')).toBeNull();
    expect(JSON.stringify(value)).toBe(before);
    expect(port.mutate).not.toHaveBeenCalled();
  });

  it('ASD02 the exact start instant is included alongside a future booked lesson', async () => {
    const value = state();
    value.lessons = [
      lesson('QA starts now', NOW, NOW + 30 * MINUTE),
      lesson('QA future booking', NOW + MINUTE, NOW + 31 * MINUTE),
    ];
    const port = await show(value);
    const panel = lessonPanel();
    expect(panel.getByText(/QA starts now/)).toBeTruthy();
    expect(panel.getByText(/QA future booking/)).toBeTruthy();
    expect(panel.getAllByRole('article')).toHaveLength(2);
    expect(port.mutate).not.toHaveBeenCalled();
  });

  it('ASD03 the end boundary is half-open: one millisecond before end is included but exact end and expired are excluded', async () => {
    const value = state();
    value.lessons = [
      lesson('QA last millisecond', NOW - 30 * MINUTE, NOW + 1),
      lesson('QA exact ended', NOW - 30 * MINUTE, NOW),
      lesson('QA already expired', NOW - 30 * MINUTE, NOW - 1),
    ];
    const port = await show(value);
    const panel = lessonPanel();
    expect(panel.getByText(/QA last millisecond/)).toBeTruthy();
    expect(panel.queryByText(/QA exact ended/)).toBeNull();
    expect(panel.queryByText(/QA already expired/)).toBeNull();
    expect(panel.getAllByRole('article')).toHaveLength(1);
    expect(port.mutate).not.toHaveBeenCalled();
  });

  it('ASD04 cancelled, completed and no-show records never appear as upcoming even when their end is later', async () => {
    const value = state();
    value.lessons = [
      lesson('QA future scheduled', NOW + MINUTE, NOW + 31 * MINUTE),
      lesson('QA cancelled future', NOW + MINUTE, NOW + 31 * MINUTE, 'cancelled'),
      lesson('QA completed future', NOW + MINUTE, NOW + 31 * MINUTE, 'completed'),
      lesson('QA no-show future', NOW + MINUTE, NOW + 31 * MINUTE, 'no_show'),
    ];
    const port = await show(value);
    const panel = lessonPanel();
    expect(panel.getByText(/QA future scheduled/)).toBeTruthy();
    expect(panel.queryByText(/QA cancelled future/)).toBeNull();
    expect(panel.queryByText(/QA completed future/)).toBeNull();
    expect(panel.queryByText(/QA no-show future/)).toBeNull();
    expect(panel.getAllByRole('article')).toHaveLength(1);
    expect(port.mutate).not.toHaveBeenCalled();
  });

  it('ASD05 the five nearest unended bookings include the ongoing lesson even when loaded in reverse order', async () => {
    const value = state();
    const ongoing = lesson('QA nearest ongoing', NOW - 5 * MINUTE, NOW + 25 * MINUTE);
    const future = Array.from({ length: 6 }, (_, i) =>
      lesson('QA ordered future ' + (i + 1), NOW + (i + 1) * 60 * MINUTE, NOW + ((i + 1) * 60 + 30) * MINUTE));
    value.lessons = [...future].reverse().concat(ongoing);
    const before = JSON.stringify(value.lessons);
    const port = await show(value);
    const articles = lessonPanel().getAllByRole('article');
    expect(articles).toHaveLength(5);
    expect(articles[0].textContent).toContain('QA nearest ongoing');
    for (let i = 1; i <= 4; i++) expect(articles[i].textContent).toContain('QA ordered future ' + i);
    expect(lessonPanel().queryByText(/QA ordered future 5/)).toBeNull();
    expect(lessonPanel().queryByText(/QA ordered future 6/)).toBeNull();
    expect(JSON.stringify(value.lessons)).toBe(before);
    expect(port.mutate).not.toHaveBeenCalled();
  });

  it('ASD06 an empty student view points to student booking and never tells the student to add a work shift', async () => {
    const port = await show(state());
    const panel = lessonPanel();
    expect(panel.getByText('Занятий пока нет')).toBeTruthy();
    expect(panel.getByText('Откройте раздел «Записаться», чтобы выбрать время, или уточните расписание в автошколе.')).toBeTruthy();
    expect(panel.queryByText(/Добавьте рабочую смену/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Добавить ученика' })).toBeNull();
    expect(port.mutate).not.toHaveBeenCalled();
  });

  it('ASD07 an empty instructor view points to the school administrator rather than owner setup or student booking', async () => {
    const port = await show(state('instructor'));
    const panel = lessonPanel(false);
    expect(panel.getByText('На выбранную дату занятий нет. Уточните расписание у администратора автошколы.')).toBeTruthy();
    expect(panel.queryByText(/Добавьте рабочую смену/)).toBeNull();
    expect(panel.queryByText(/Откройте раздел «Записаться»/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Добавить ученика' })).toBeNull();
    expect(port.mutate).not.toHaveBeenCalled();
  });

  it('ASD08 the empty owner view retains the original setup guidance and owner actions', async () => {
    const port = await show(state('owner'));
    const panel = lessonPanel(false);
    expect(panel.getByText('Добавьте рабочую смену и запишите ученика на удобное время.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Добавить ученика' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Записать на вождение' })).toBeTruthy();
    expect(port.mutate).not.toHaveBeenCalled();
  });

  it('ASD09 the existing minute timer removes an ended booking without changing its status or awarding practice', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    const value = state();
    value.lessons = [lesson('QA ends during next minute', NOW - 10 * MINUTE, NOW + 30 * 1000)];
    const before = JSON.stringify(value);
    const port = adapter(value);
    await act(async () => { render(ui(port)); await Promise.resolve(); });
    expect(lessonPanel().getByText(/QA ends during next minute/)).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(MINUTE); });
    expect(lessonPanel().queryByText(/QA ends during next minute/)).toBeNull();
    expect(lessonPanel().getByText('Занятий пока нет')).toBeTruthy();
    expect(JSON.stringify(value)).toBe(before);
    expect(port.mutate).not.toHaveBeenCalled();
  });
});
