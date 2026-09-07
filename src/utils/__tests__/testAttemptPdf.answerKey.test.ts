import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTestAttemptExcel, generateTestAttemptPdf } from '../testAttemptPdf';

const mocks = vi.hoisted(() => ({ html: [] as string[], sheets: [] as unknown[][][], save: vi.fn() }));
vi.mock('html2canvas', () => ({ default: async (element: HTMLElement) => {
  mocks.html.push(element.innerHTML);
  return { width: 1, height: 0 };
} }));
vi.mock('jspdf', () => ({ default: class {
  internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
  save = mocks.save;
} }));
vi.mock('xlsx', () => ({
  utils: {
    book_new: () => ({}), book_append_sheet: vi.fn(),
    aoa_to_sheet: (rows: unknown[][]) => { mocks.sheets.push(rows); return {}; },
  },
  writeFile: vi.fn(),
}));
beforeEach(() => { mocks.html.length = 0; mocks.sheets.length = 0; vi.clearAllMocks(); });

const data = (key: number | null | undefined): Parameters<typeof generateTestAttemptExcel>[0] => ({
  studentName: 'Ученик', courseTitle: 'Курс', testTitle: 'Тест',
  completedAt: '2026-09-07T01:00:00Z', score: 0, maxScore: 1,
  percentage: 0, passingScore: 60, isPassed: false, answers: { question: 0 },
  questions: [{ id: 'question', question: 'Вопрос', options: ['Выбранный ответ', 'Другой ответ'],
    ...(key === undefined ? {} : { correct_answer: key }) }],
});

describe('saved answer keys in attempt exports', () => {
  it.each([null, -1, 2])('exports the missing/invalid key %s without inventing a correct option', async key => {
    await generateTestAttemptExcel(data(key));
    const questionRow = mocks.sheets[1][1];
    expect(questionRow[2]).toBe('Выбранный ответ');
    expect(questionRow[3]).toMatch(/Правильный ответ в вопросе.+Балл не начислен/);
    expect(questionRow[4]).toBe('Балл не начислен');

    await generateTestAttemptPdf(data(key));
    expect(mocks.html[0]).toContain('Балл не начислен');
    expect(mocks.html[0]).toContain('Ответ ученика: Выбранный ответ');
    expect(mocks.html[0]).not.toContain('✗ ');
    expect(mocks.html[0]).not.toContain('✓ ');
    expect(mocks.save).toHaveBeenCalledOnce();
  });

  it('does not reveal a key diagnostic when feedback has been withheld', async () => {
    await generateTestAttemptExcel(data(undefined));
    expect(mocks.sheets[1][1].slice(3, 5)).toEqual(['Не раскрыт', 'Не раскрыт']);
    await generateTestAttemptPdf(data(undefined));
    expect(mocks.html[0]).not.toContain('Правильный ответ в вопросе');
    expect(mocks.html[0]).not.toContain('Балл не начислен');
  });

  it('retains normal valid-key answer feedback', async () => {
    await generateTestAttemptExcel(data(1));
    expect(mocks.sheets[1][1].slice(3, 5)).toEqual(['Другой ответ', 'Неверно']);
    await generateTestAttemptPdf(data(1));
    expect(mocks.html[0]).toContain('✗ Выбранный ответ');
    expect(mocks.html[0]).toContain('→ Другой ответ');
    expect(mocks.html[0]).not.toContain('Балл не начислен');
  });
});
