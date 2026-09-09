import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplaceTextLessonContent } from '../ReplaceTextLessonContent';
import type { Lesson } from '../LessonTypeConfig';
import type { TextLessonPatch } from '@/lib/textLessonReplacement';

const original: Lesson = {
  id: 'lesson-a', type: 'text', title: 'Сохранённое название', content: 'Исходный текст', expanded: true,
  blocks: [{ id: 'original-block', type: 'paragraph', content: 'Исходный текст' }],
  module_id: 'module-a', metadata: { hours: 14, author: 'existing' }, __contentLoaded: true,
  questions: [{ id: 'question-a', question: 'Сохранённый вопрос', options: [{ text: 'Да' }], correct_answer: 0, order_index: 0 }],
  testPassingScore: 60, testMaxAttempts: 2, testQuestionsToShow: 1, testShowAnswers: false,
  attachments: [{ id: 'attachment-a', lesson_id: 'lesson-a', name: 'Сохранённое приложение', file_url: 'existing', file_type: 'pdf', file_size: 1, category: 'file', order_index: 0 }],
};
const onUpdate = vi.fn<(patch: TextLessonPatch) => void>();
const props = { courseId: 'course-a', organizationId: 'org-a', lesson: original, onUpdate };
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Заменить содержание из MD/HTML' }));
function choose(source: string | Promise<string>, name = 'lecture.md') {
  const file = new File(['fixture'], name, { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(source) });
  fireEvent.change(screen.getByLabelText('Файл одной лекции (MD/HTML, до 2 МиБ)'), { target: { files: [file] } });
}
const confirm = () => screen.getByRole('button', { name: 'Подтвердить замену содержания этого урока' });
const md = '# Новое содержание\n\n> **Безопасность:** Не выполнять пуск.\n\n| Параметр | Значение |\n|---|---|\n| Условие | [Источник](https://example.test/norm) |\n\n3. Первый пункт\n4. Второй пункт';
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('single existing lecture replacement', () => {
  it('reads and previews locally without updates; confirms exactly one patch with only blocks/content', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
    render(<ReplaceTextLessonContent {...props} />);
    open(); choose(md);
    await screen.findByRole('table');
    expect(screen.getByText('Не выполнять пуск.')).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fireEvent.click(confirm());
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(Object.keys(onUpdate.mock.calls[0][0]).sort()).toEqual(['blocks', 'content']);
    expect(onUpdate.mock.calls[0][0].content).toEqual(JSON.stringify(onUpdate.mock.calls[0][0].blocks));
    expect(screen.queryByRole('button', { name: 'Подтвердить замену содержания этого урока' })).toBeNull();
    fetchSpy.mockRestore();
  });
  it('preserves lesson IDs, order, title, type, metadata, questions, attachments and all other lessons', async () => {
    const sibling = { ...original, id: 'sibling', type: 'test' as const, title: 'Не изменять' };
    let state = [original, sibling];
    function CourseState() {
      const [lessons, setLessons] = useState(state);
      state = lessons;
      return <ReplaceTextLessonContent {...props} lesson={lessons[0]} onUpdate={patch => {
        onUpdate(patch);
        setLessons(previous => previous.map(lesson => lesson.id === original.id ? { ...lesson, ...patch } : lesson));
      }} />;
    }
    render(<CourseState />); open(); choose(md); await screen.findByRole('table'); fireEvent.click(confirm());
    expect(state).toHaveLength(2);
    expect(state.map(lesson => lesson.id)).toEqual(['lesson-a', 'sibling']);
    expect(state[1]).toBe(sibling);
    const { content: oldContent, blocks: oldBlocks, ...untouched } = original;
    const { content: newContent, blocks: newBlocks, ...preserved } = state[0];
    expect(preserved).toEqual(untouched);
    expect(newContent).not.toEqual(oldContent);
    expect(newBlocks).not.toEqual(oldBlocks);
  });
  it('cancel after preview makes no update', async () => {
    render(<ReplaceTextLessonContent {...props} />); open(); choose(md); await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Отменить импорт' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(onUpdate).not.toHaveBeenCalled();
  });
  it('cancel during file reading ignores the late read', async () => {
    let finish!: (text: string) => void;
    const pending = new Promise<string>(resolve => { finish = resolve; });
    render(<ReplaceTextLessonContent {...props} />); open(); choose(pending);
    fireEvent.click(screen.getByRole('button', { name: 'Отменить импорт' }));
    await act(async () => finish(md));
    expect(screen.queryByRole('table')).toBeNull();
    expect(onUpdate).not.toHaveBeenCalled();
  });
  it.each(['organizationId', 'courseId', 'lessonId'] as const)('invalidates preview after %s switches', async key => {
    const view = render(<ReplaceTextLessonContent {...props} />); open(); choose(md); await screen.findByRole('table');
    const changed = key === 'lessonId' ? { lesson: { ...original, id: 'lesson-b' } } : { [key]: 'other' };
    view.rerender(<ReplaceTextLessonContent {...props} {...changed} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Подтвердить замену содержания этого урока' })).toBeNull();
    expect(onUpdate).not.toHaveBeenCalled();
  });
  it('rejects a late file result after the selected lesson changes', async () => {
    let finish!: (text: string) => void;
    const pending = new Promise<string>(resolve => { finish = resolve; });
    const view = render(<ReplaceTextLessonContent {...props} />); open(); choose(pending);
    view.rerender(<ReplaceTextLessonContent {...props} lesson={{ ...original, id: 'lesson-b' }} />);
    await act(async () => finish(md));
    expect(screen.queryByRole('table')).toBeNull();
    expect(onUpdate).not.toHaveBeenCalled();
  });
  it('does not overwrite newer edits made after preview', async () => {
    const view = render(<ReplaceTextLessonContent {...props} />); open(); choose(md); await screen.findByRole('table');
    view.rerender(<ReplaceTextLessonContent {...props} lesson={{ ...original, content: 'Более новая правка' }} />);
    fireEvent.click(confirm());
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/Содержание или доступность урока изменились/)).toBeInTheDocument();
  });
  it('rejects content changes during file reading', async () => {
    let finish!: (text: string) => void;
    const pending = new Promise<string>(resolve => { finish = resolve; });
    const view = render(<ReplaceTextLessonContent {...props} />); open(); choose(pending);
    view.rerender(<ReplaceTextLessonContent {...props} lesson={{ ...original, blocks: [] }} />);
    await act(async () => finish(md));
    expect(screen.queryByRole('table')).toBeNull();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/Содержание урока изменилось/)).toBeInTheDocument();
  });
  it.each(['practice', 'homework', 'video', 'test', 'audio', 'slider'] as const)('does not offer replacement for %s', type => {
    render(<ReplaceTextLessonContent {...props} lesson={{ ...original, type }} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('requires loaded existing content and nonempty course/organization context', () => {
    const view = render(<ReplaceTextLessonContent {...props} lesson={{ ...original, __contentLoaded: false }} />);
    expect(screen.getByRole('button')).toBeDisabled();
    view.rerender(<ReplaceTextLessonContent {...props} organizationId={undefined} />);
    expect(screen.getByRole('button')).toBeDisabled();
    view.rerender(<ReplaceTextLessonContent {...props} courseId={undefined} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
  it.each([['lecture.docx', md], ['empty.md', '   ']])('rejects %s without update', async (name, source) => {
    render(<ReplaceTextLessonContent {...props} />); open(); choose(source, name);
    await waitFor(() => expect(screen.queryByText('Чтение локального файла…')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Подтвердить замену содержания этого урока' })).toBeNull();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
