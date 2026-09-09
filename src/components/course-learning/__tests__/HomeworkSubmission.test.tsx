import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CourseLearning from '@/pages/CourseLearning';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeworkSubmission } from '../HomeworkSubmission';
import { HOMEWORK_TEXT_LIMIT, isReportForContext, resolveHomeworkContext } from '@/lib/homeworkReport';

const mocks = vi.hoisted(() => ({
  history: [] as any[], course: [] as any[], lesson: [] as any[], saved: [] as any[],
  historyFilters: [] as Record<string, string>[], lessonFilters: [] as Record<string, string>[], inserts: [] as any[],
  success: vi.fn(), error: vi.fn(), upload: vi.fn(),
}));
const pageScenario = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('@/hooks/useCourseLearning', () => ({
  useCourseLearning: () => pageScenario.state,
  getOptionText: (value: unknown) => String(value),
}));
vi.mock('@/components/course-learning/CourseSidebar', () => ({ CourseSidebarContent: () => null }));
vi.mock('@/components/course-learning/AiChatPanel', () => ({ AiChatPanel: () => null }));
vi.mock('@/components/student/TTSSettingsDialog', () => ({
  TTSSettingsDialog: () => null, SALUTE_VOICES: [], saveTTSSettings: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/utils/courseBuilderHelpers', () => ({ uploadToStorage: mocks.upload }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => {
    const filters: Record<string, string> = {};
    let inserted = false;
    const query = {
      select: () => query,
      eq: (key: string, value: string) => { filters[key] = value; return query; },
      order: () => { mocks.historyFilters.push(filters); return Promise.resolve(mocks.history.shift() ?? { data: [], error: null }); },
      insert: (payload: any) => { inserted = true; mocks.inserts.push(payload); return query; },
      single: () => {
        if (table === 'lessons') {
          mocks.lessonFilters.push(filters);
          return Promise.resolve(mocks.lesson.shift() ?? { data: { id: 'lesson-a', course_id: 'course-a' }, error: null });
        }
        return Promise.resolve(table === 'courses'
          ? (mocks.course.shift() ?? { data: { organization_id: 'org-a' }, error: null })
          : inserted ? (mocks.saved.shift() ?? { data: null, error: { message: 'unconfigured save' } })
          : { data: null, error: { message: 'unexpected query' } });
      },
    };
    return query;
  },
} }));

const context = { organizationId: 'org-a', courseId: 'course-a', lessonId: 'lesson-a', userId: 'student-a' };
const props = { ...context, taskDescription: 'Учебное задание', isMobile: false, onComplete: vi.fn(), allowAttachments: false };
const report = { ...context, revision: 1, text: 'Мой условный учебный отчёт' };
const row = (status = 'pending') => ({
  id: 'submission-a', organization_id: context.organizationId, course_id: context.courseId,
  lesson_id: context.lessonId, student_id: context.userId, status, content: 'Ответ', attachments: [],
  score: null, reviewer_comment: null, submitted_at: '2026-09-08T00:00:00Z', reviewed_at: null,
});
function deferred() {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>(res => { resolve = res; });
  return { promise, resolve };
}
async function answer(text = 'Мой ответ') {
  fireEvent.change(await screen.findByLabelText('Ответ на практическое задание'), { target: { value: text } });
}
afterEach(cleanup);
beforeEach(() => {
  mocks.history.length = 0; mocks.course.length = 0; mocks.lesson.length = 0; mocks.saved.length = 0;
  mocks.historyFilters.length = 0; mocks.lessonFilters.length = 0; mocks.inserts.length = 0;
  vi.clearAllMocks();
});

describe('HomeworkSubmission: real component with isolated database doubles', () => {
  it('reads history with all four context filters', async () => {
    render(<HomeworkSubmission {...props} />);
    await screen.findByLabelText('Ответ на практическое задание');
    expect(mocks.historyFilters).toEqual([{ organization_id: 'org-a', course_id: 'course-a', lesson_id: 'lesson-a', student_id: 'student-a' }]);
  });

  it.each(['userId', 'lessonId', 'courseId', 'organizationId'] as const)('resets draft on %s change', async key => {
    const view = render(<HomeworkSubmission {...props} />);
    await answer('Старый приватный черновик');
    view.rerender(<HomeworkSubmission {...props} {...{ [key]: `${key}-b` }} />);
    expect(await screen.findByLabelText('Ответ на практическое задание')).toHaveValue('');
    expect(screen.queryByDisplayValue('Старый приватный черновик')).toBeNull();
  });

  it('ignores a late old-context approved history and does not complete a new lesson', async () => {
    const old = deferred(); mocks.history.push(old.promise);
    const view = render(<HomeworkSubmission {...props} />);
    view.rerender(<HomeworkSubmission {...props} userId="student-b" />);
    await screen.findByLabelText('Ответ на практическое задание');
    await act(async () => old.resolve({ data: [row('approved')], error: null }));
    expect(props.onComplete).not.toHaveBeenCalled();
    expect(screen.queryByText('Выполнено')).toBeNull();
  });

  it('fails closed on a history error and lets the user retry', async () => {
    mocks.history.push({ data: null, error: { message: 'offline' } });
    render(<HomeworkSubmission {...props} />);
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: /^Отправить$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Обновить историю' }));
    await screen.findByLabelText('Ответ на практическое задание');
    expect(mocks.inserts).toHaveLength(0);
  });

  it('refuses returned history belonging to another context', async () => {
    mocks.history.push({ data: [{ ...row('approved'), student_id: 'other' }], error: null });
    render(<HomeworkSubmission {...props} />);
    await screen.findByRole('alert');
    expect(props.onComplete).not.toHaveBeenCalled();
  });

  it('reports pending only after the exact saved row is confirmed', async () => {
    mocks.saved.push({ data: row(), error: null });
    mocks.history.push({ data: [], error: null }, { data: [row()], error: null });
    render(<HomeworkSubmission {...props} />); await answer();
    fireEvent.click(screen.getByRole('button', { name: /^Отправить$/ }));
    await screen.findByText('Ждёт проверки');
    expect(mocks.inserts[0]).toMatchObject({ ...Object.fromEntries([['organization_id','org-a'],['course_id','course-a'],['lesson_id','lesson-a'],['student_id','student-a']]), content: 'Мой ответ', status: 'pending', attachments: [] });
    expect(mocks.inserts[0]).not.toHaveProperty('score');
    expect(mocks.inserts[0]).not.toHaveProperty('reviewed_at');
    expect(mocks.lessonFilters).toEqual([{ id: 'lesson-a', course_id: 'course-a' }]);
    expect(props.onComplete).not.toHaveBeenCalled();
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it.each([
    { data: null, error: null },
    { data: { ...row(), course_id: 'other' }, error: null },
    { data: row('approved'), error: null },
    { data: null, error: { message: 'write unavailable' } },
  ])('does not claim save success from an unconfirmed/mismatched response %#', async result => {
    mocks.saved.push(result);
    render(<HomeworkSubmission {...props} />); await answer('Не потерять этот текст');
    fireEvent.click(screen.getByRole('button', { name: /^Отправить$/ }));
    expect(await screen.findByLabelText('Сохранённый черновик, отправка не подтверждена')).toHaveValue('Не потерять этот текст');
    expect(mocks.success).not.toHaveBeenCalled(); expect(props.onComplete).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Отправить$/ })).toBeNull();
  });

  it('does not insert when the course organization changed', async () => {
    mocks.course.push({ data: { organization_id: 'other-org' }, error: null });
    render(<HomeworkSubmission {...props} />); await answer();
    fireEvent.click(screen.getByRole('button', { name: /^Отправить$/ }));
    await screen.findByRole('alert'); expect(mocks.inserts).toHaveLength(0);
  });

  it.each([
    { data: null, error: null },
    { data: { id: 'lesson-a', course_id: 'other-course' }, error: null },
    { data: { id: 'other-lesson', course_id: 'course-a' }, error: null },
    { data: null, error: { message: 'lesson lookup failed' } },
  ])('does not insert without confirmed lesson membership %#', async result => {
    mocks.lesson.push(result);
    render(<HomeworkSubmission {...props} />); await answer('Сохранить черновик');
    fireEvent.click(screen.getByRole('button', { name: /^Отправить$/ }));
    expect(await screen.findByLabelText('Сохранённый черновик, отправка не подтверждена')).toHaveValue('Сохранить черновик');
    expect(mocks.inserts).toHaveLength(0); expect(mocks.success).not.toHaveBeenCalled();
  });

  it('ignores a late lesson-membership result after switching the lesson', async () => {
    const gate = deferred(); mocks.lesson.push(gate.promise);
    const view = render(<HomeworkSubmission {...props} />); await answer();
    fireEvent.click(screen.getByRole('button', { name: /^Отправить$/ }));
    await waitFor(() => expect(mocks.lessonFilters).toHaveLength(1));
    view.rerender(<HomeworkSubmission {...props} lessonId="lesson-b" />);
    await screen.findByLabelText('Ответ на практическое задание');
    await act(async () => gate.resolve({ data: { id: 'lesson-a', course_id: 'course-a' }, error: null }));
    expect(mocks.inserts).toHaveLength(0); expect(mocks.success).not.toHaveBeenCalled();
  });

  it.each(['empty', 'approved'])('read-only mode neither submits, uploads, transfers nor completes: %s history', async status => {
    mocks.history.push({ data: status === 'approved' ? [row('approved')] : [], error: null });
    const view = render(<HomeworkSubmission {...props} readOnly allowAttachments preparedReport={report} />);
    await screen.findByText('Режим просмотра: отправка, загрузка файлов и завершение урока недоступны.');
    expect(screen.queryByRole('button', { name: /^Отправить$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Перенести отчёт в ответ' })).toBeNull();
    expect(view.container.querySelector('input[type=file]')).toBeNull();
    expect(mocks.inserts).toHaveLength(0); expect(mocks.upload).not.toHaveBeenCalled();
    expect(props.onComplete).not.toHaveBeenCalled();
  });

  it('switching to read-only stops a pending pre-insert membership check', async () => {
    const gate = deferred(); mocks.lesson.push(gate.promise);
    const view = render(<HomeworkSubmission {...props} />); await answer();
    fireEvent.click(screen.getByRole('button', { name: /^Отправить$/ }));
    await waitFor(() => expect(mocks.lessonFilters).toHaveLength(1));
    view.rerender(<HomeworkSubmission {...props} readOnly />);
    await screen.findByText('Режим просмотра: отправка, загрузка файлов и завершение урока недоступны.');
    await act(async () => gate.resolve({ data: { id: 'lesson-a', course_id: 'course-a' }, error: null }));
    expect(mocks.inserts).toHaveLength(0); expect(mocks.success).not.toHaveBeenCalled();
    expect(props.onComplete).not.toHaveBeenCalled();
  });

  it('switching to read-only ignores an old approved history', async () => {
    const history = deferred(); mocks.history.push(history.promise);
    const view = render(<HomeworkSubmission {...props} />);
    view.rerender(<HomeworkSubmission {...props} readOnly />);
    await screen.findByText('Режим просмотра: отправка, загрузка файлов и завершение урока недоступны.');
    await act(async () => history.resolve({ data: [row('approved')], error: null }));
    expect(props.onComplete).not.toHaveBeenCalled();
    expect(screen.queryByText('Выполнено')).toBeNull();
  });

  it('switching to read-only ignores a previous file upload callback', async () => {
    const uploaded = deferred(); mocks.upload.mockReturnValueOnce(uploaded.promise);
    const view = render(<HomeworkSubmission {...props} allowAttachments />);
    await screen.findByLabelText('Ответ на практическое задание');
    const input = view.container.querySelector('input[type=file]')!;
    fireEvent.change(input, { target: { files: [new File(['draft'], 'draft.txt', { type: 'text/plain' })] } });
    expect(mocks.upload).toHaveBeenCalledOnce();
    view.rerender(<HomeworkSubmission {...props} allowAttachments readOnly />);
    await screen.findByText('Режим просмотра: отправка, загрузка файлов и завершение урока недоступны.');
    await act(async () => uploaded.resolve({ url: 'https://example.invalid/draft.txt' }));
    expect(screen.queryByText('draft.txt')).toBeNull();
    expect(mocks.inserts).toHaveLength(0); expect(mocks.success).not.toHaveBeenCalled();
  });

  it('prevents concurrent duplicate submits while the first request is pending', async () => {
    const gate = deferred(); mocks.course.push(gate.promise); mocks.saved.push({ data: row(), error: null });
    render(<HomeworkSubmission {...props} />); await answer();
    const send = screen.getByRole('button', { name: /^Отправить$/ });
    fireEvent.click(send); fireEvent.click(send);
    expect(screen.getByLabelText('Ответ на практическое задание')).toBeDisabled();
    await act(async () => gate.resolve({ data: { organization_id: 'org-a' }, error: null }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce()); expect(mocks.inserts).toHaveLength(1);
  });

  it('stops a pre-insert continuation after changing context', async () => {
    const gate = deferred(); mocks.course.push(gate.promise);
    const view = render(<HomeworkSubmission {...props} />); await answer();
    fireEvent.click(screen.getByRole('button', { name: /^Отправить$/ }));
    view.rerender(<HomeworkSubmission {...props} lessonId="lesson-b" />);
    await screen.findByLabelText('Ответ на практическое задание');
    await act(async () => gate.resolve({ data: { organization_id: 'org-a' }, error: null }));
    expect(mocks.inserts).toHaveLength(0); expect(mocks.success).not.toHaveBeenCalled();
  });

  it('does not emit a stale success or clear the next context after insert was already sent', async () => {
    const save = deferred(); mocks.saved.push(save.promise);
    const view = render(<HomeworkSubmission {...props} />); await answer();
    fireEvent.click(screen.getByRole('button', { name: /^Отправить$/ }));
    await waitFor(() => expect(mocks.inserts).toHaveLength(1));
    view.rerender(<HomeworkSubmission {...props} lessonId="lesson-b" />); await answer('Новый ответ');
    await act(async () => save.resolve({ data: row(), error: null }));
    expect(screen.getByLabelText('Ответ на практическое задание')).toHaveValue('Новый ответ');
    expect(mocks.success).not.toHaveBeenCalled(); expect(props.onComplete).not.toHaveBeenCalled();
  });

  it('completes only a confirmed approved row, once across callback identity changes', async () => {
    mocks.history.push({ data: [row('approved')], error: null });
    const view = render(<HomeworkSubmission {...props} />);
    await waitFor(() => expect(props.onComplete).toHaveBeenCalledOnce());
    const next = vi.fn(); view.rerender(<HomeworkSubmission {...props} onComplete={next} />);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not expose the public attachment route in text-only mode', async () => {
    const view = render(<HomeworkSubmission {...props} />); await answer();
    expect(view.container.querySelector('input[type=file]')).toBeNull();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('transfers a matching report only on click and does not send or grade', async () => {
    render(<HomeworkSubmission {...props} preparedReport={report} />);
    expect(await screen.findByLabelText('Ответ на практическое задание')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Перенести отчёт в ответ' }));
    expect(screen.getByLabelText('Ответ на практическое задание')).toHaveValue(report.text);
    expect(screen.getByRole('status')).toHaveTextContent('черновик');
    expect(mocks.inserts).toHaveLength(0); expect(props.onComplete).not.toHaveBeenCalled();
  });

  it('clears the old transfer notice when the learner edits the answer', async () => {
    render(<HomeworkSubmission {...props} preparedReport={report} />);
    await screen.findByLabelText('Ответ на практическое задание');
    fireEvent.click(screen.getByRole('button', { name: 'Перенести отчёт в ответ' }));
    expect(screen.getByRole('status')).toBeInTheDocument();
    await answer('Моя новая редакция');
    expect(screen.queryByRole('status')).toBeNull();
    expect(mocks.inserts).toHaveLength(0);
  });

  it('requires an explicit replacement choice for existing text', async () => {
    render(<HomeworkSubmission {...props} preparedReport={report} />); await answer('Собственная работа');
    fireEvent.click(screen.getByRole('button', { name: 'Перенести отчёт в ответ' }));
    expect(screen.getByLabelText('Ответ на практическое задание')).toHaveValue('Собственная работа');
    fireEvent.click(screen.getByRole('button', { name: 'Оставить мой текст' }));
    expect(screen.getByLabelText('Ответ на практическое задание')).toHaveValue('Собственная работа');
    fireEvent.click(screen.getByRole('button', { name: 'Перенести отчёт в ответ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Заменить мой текст отчётом' }));
    expect(screen.getByLabelText('Ответ на практическое задание')).toHaveValue(report.text);
  });

  it('never offers another student report', async () => {
    render(<HomeworkSubmission {...props} preparedReport={{ ...report, userId: 'other' }} />);
    await screen.findByLabelText('Ответ на практическое задание');
    expect(screen.queryByRole('button', { name: 'Перенести отчёт в ответ' })).toBeNull();
  });
});

describe('report transfer bounds', () => {
  it.each(['organizationId', 'courseId', 'lessonId', 'userId'] as const)('rejects a different %s', key => {
    expect(isReportForContext({ ...report, [key]: 'other' }, context)).toBe(false);
  });
  it('rejects empty/oversize text and nonpositive/noninteger revision', () => {
    for (const bad of [{ text: '' }, { text: '  ' }, { text: 'a'.repeat(HOMEWORK_TEXT_LIMIT + 1) }, { revision: 0 }, { revision: 1.5 }]) {
      expect(isReportForContext({ ...report, ...bad }, context)).toBe(false);
    }
    expect(isReportForContext(report, context)).toBe(true);
  });
});

describe('course page submission context gate', () => {
  const course = { id: 'course-a', organization_id: 'org-a' };
  const lesson = { id: 'lesson-a', course_id: 'course-a' };

  it('allows only a fully matching route, loaded course and loaded lesson', () => {
    expect(resolveHomeworkContext('course-a', course, lesson, 'student-a')).toEqual(context);
  });

  it('does not create a submission context for admin/read-only viewing', () => {
    expect(resolveHomeworkContext('course-a', course, lesson, 'student-a', true)).toBeNull();
  });

  it('fails closed throughout a same-organization course transition and late old response', () => {
    const nextCourse = { ...course, id: 'course-b' };
    const nextLesson = { id: 'lesson-b', course_id: 'course-b' };
    expect(resolveHomeworkContext('course-b', course, lesson, 'student-a')).toBeNull();
    expect(resolveHomeworkContext('course-b', nextCourse, lesson, 'student-a')).toBeNull();
    expect(resolveHomeworkContext('course-b', course, nextLesson, 'student-a')).toBeNull();
    expect(resolveHomeworkContext('course-b', nextCourse, nextLesson, 'student-a')).toEqual({ ...context, courseId: 'course-b', lessonId: 'lesson-b' });
    expect(resolveHomeworkContext('course-b', course, lesson, 'student-a')).toBeNull();
  });

  it('rejects missing organization, lesson membership, route or user, including old caches', () => {
    expect(resolveHomeworkContext('course-a', { id: 'course-a' }, lesson, 'student-a')).toBeNull();
    expect(resolveHomeworkContext('course-a', course, { id: 'lesson-a' }, 'student-a')).toBeNull();
    expect(resolveHomeworkContext(undefined, course, lesson, 'student-a')).toBeNull();
    expect(resolveHomeworkContext('course-a', course, lesson, undefined)).toBeNull();
  });
});

// Render the real page/form together with isolated hook/database seams.
// This verifies local component wiring, not production persistence or permissions.
describe('CourseLearning text-homework integration and existing test controls', () => {
  const cszCourseId = '7630559a-6caf-42e7-97f9-1cd0e4598c39';
  const preparePage = (courseId = context.courseId) => {
    const lesson = { id: context.lessonId, course_id: courseId, type: 'homework', title: 'Практическое задание', content: 'Ответьте текстом' };
    pageScenario.state = {
      user: { id: context.userId }, navigate: vi.fn(), isMobile: false, contentRef: { current: null },
      course: { id: courseId, organization_id: context.organizationId, title: 'Тестовый курс', landing_content: null },
      lessons: [lesson], currentLesson: lesson, currentLessonIndex: 0,
      lessonProgress: [], lessonAttachments: [], loading: false, sidebarOpen: false,
      completedCount: 0, progressPercent: 0, isOfflineMode: false, isAdminView: false,
      isLessonAccessible: () => true, isLessonCompleted: () => false,
      markLessonComplete: vi.fn(), goToNextLesson: vi.fn(), goToPrevLesson: vi.fn(),
      testQuestions: [], answers: {}, testScore: null, testPassingScore: 80,
      testQuestionsLoading: false, testQuestionsError: null, testAttemptId: null,
      testSubmitted: false, testSubmitting: false, testLegacy: false, testShowAnswers: true,
      testMaxAttempts: 5, testAttemptsUsed: 1, testMaxAttemptsPerDay: 3,
      testAttemptsUsedToday: 1, testLimitReached: false,
      startTest: vi.fn(), refreshTestState: vi.fn(),
      ttsSettings: { provider: 'browser' }, chatMessages: [], isChatOpen: false,
    };
  };
  const renderPage = (courseId = context.courseId) => render(
    <MemoryRouter initialEntries={[`/learn/${courseId}`]}>
      <Routes><Route path="/learn/:courseId" element={<CourseLearning />} /></Routes>
    </MemoryRouter>,
  );

  it('keeps attachments and explicit pending submission available in another course', async () => {
    preparePage();
    mocks.history.push({ data: [], error: null }, { data: [row()], error: null });
    mocks.saved.push({ data: row(), error: null });
    renderPage();
    await answer('Ответ другого курса');
    expect(screen.getByText('Прикрепить файл')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Отправить$/ }));
    await screen.findByText('Ждёт проверки');
    expect(mocks.inserts).toHaveLength(1);
    expect(mocks.inserts[0]).toMatchObject({
      organization_id: context.organizationId, course_id: context.courseId,
      lesson_id: context.lessonId, student_id: context.userId, status: 'pending',
      content: 'Ответ другого курса',
    });
    expect(pageScenario.state.markLessonComplete).not.toHaveBeenCalled();
  });

  it('uses the real response form without the upload route for the exact CSZ course', async () => {
    preparePage(cszCourseId);
    renderPage(cszCourseId);
    expect(await screen.findByLabelText('Ответ на практическое задание')).toBeInTheDocument();
    expect(screen.queryByText('Прикрепить файл')).toBeNull();
    expect(mocks.historyFilters[0]).toMatchObject({ course_id: cszCourseId, organization_id: context.organizationId });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('does not mount a writable response form during admin preview', () => {
    preparePage();
    pageScenario.state.isAdminView = true;
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('сдача задания и завершение урока недоступны');
    expect(screen.queryByLabelText('Ответ на практическое задание')).toBeNull();
    expect(mocks.historyFilters).toEqual([]);
    expect(mocks.inserts).toEqual([]);
    expect(pageScenario.state.markLessonComplete).not.toHaveBeenCalled();
  });

  it('keeps the response unavailable while route and loaded course disagree', () => {
    preparePage();
    renderPage('course-b');
    expect(screen.getByRole('alert')).toHaveTextContent('Контекст курса и урока ещё не подтверждён');
    expect(screen.queryByLabelText('Ответ на практическое задание')).toBeNull();
    expect(mocks.historyFilters).toEqual([]);
  });

  it('preserves S001 explicit test start and daily-attempt controls on the real page', () => {
    preparePage();
    const lesson = { id: 'test-a', course_id: context.courseId, type: 'test', title: 'Контрольный тест', content: '' };
    pageScenario.state.currentLesson = lesson;
    pageScenario.state.lessons = [lesson];
    renderPage();
    expect(screen.getByText(/Сегодня начато попыток/)).toHaveTextContent('1 из 3. Всего: 1 из 5.');
    expect(screen.queryByRole('button', { name: /^Отправить ответы$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Начать тест' }));
    expect(pageScenario.state.startTest).toHaveBeenCalledTimes(1);
    expect(mocks.inserts).toEqual([]);
  });
});
