import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type InvokeResult = { data: any; error: any };

const harness = vi.hoisted(() => ({
  activeContext: "course-a",
  renderContext: "course-a",
  lessonId: "lesson-a",
  gradeResult: Promise.resolve({ data: null, error: new Error("grade result not configured") }) as Promise<InvokeResult>,
  setLessonProgress: vi.fn(),
  saveLessonTime: vi.fn().mockResolvedValue(undefined),
  handleCourseCompletion: vi.fn().mockResolvedValue(true),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

function testLesson(id: string, courseId: string) {
  return {
    id,
    course_id: courseId,
    title: `Тест ${id}`,
    type: "test",
    order_index: 0,
    module_id: null,
    is_locked: false,
    content: "[]",
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => {
      const builder: Record<string, any> = {};
      for (const method of ["select", "eq", "in", "order", "limit"]) builder[method] = vi.fn(() => builder);
      builder.single = vi.fn().mockResolvedValue({ data: { test_questions_to_show: null, test_passing_score: 60 }, error: null });
      return builder;
    }),
    rpc: vi.fn((_name: string, args: { p_lesson_id: string }) => Promise.resolve({
      data: [{ id: `question-${args.p_lesson_id}`, question: "Вопрос?", options: ["Да", "Нет"], correct_answer: 0 }],
      error: null,
    })),
  },
}));

vi.mock("@/utils/safeInvoke", () => ({
  safeInvoke: vi.fn((name: string) => {
    if (name === "get-test-results") {
      return Promise.resolve({ data: { hasAttempt: false, attemptsUsed: 0, maxAttempts: null }, error: null });
    }
    if (name === "grade-test") return harness.gradeResult;
    return Promise.resolve({ data: null, error: null });
  }),
}));

vi.mock("@/utils/testAnswerQueue", () => ({ enqueueTestSubmission: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/utils/adminViewMode", () => ({ isAdminViewActive: () => false }));
vi.mock("sonner", () => ({ toast: harness.toast }));

import { useLessonTest } from "../useLessonTest";

describe("useLessonTest — изоляция отправки теста", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.activeContext = "course-a";
    harness.renderContext = "course-a";
    harness.lessonId = "lesson-a";
    harness.gradeResult = Promise.resolve({ data: null, error: new Error("grade result not configured") });
  });

  it("не применяет запоздалую оценку теста A к открытому курсу B", async () => {
    const gradeA = deferred<InvokeResult>();
    harness.gradeResult = gradeA.promise;

    const { result, rerender } = renderHook(() => {
      const renderContext = harness.renderContext;
      const currentLesson = testLesson(harness.lessonId, renderContext);
      return useLessonTest({
        currentLesson: currentLesson as any,
        user: { id: "student-1" },
        lessons: [currentLesson as any, { ...testLesson(`next-${harness.lessonId}`, renderContext), order_index: 1 } as any],
        lessonProgress: [],
        completedCount: 0,
        enrollmentId: `enrollment-${renderContext}`,
        courseId: renderContext,
        course: { title: `Курс ${renderContext}`, duration: null },
        setLessonProgress: harness.setLessonProgress,
        saveLessonTime: harness.saveLessonTime,
        handleCourseCompletion: harness.handleCourseCompletion,
        isCurrentContext: () => harness.activeContext === renderContext,
      } as any);
    });
    await waitFor(() => expect(result.current.testQuestions.map(question => question.id)).toEqual(["question-lesson-a"]));

    let submitPromise!: Promise<void>;
    act(() => { submitPromise = result.current.submitTest(); });
    await act(async () => { await Promise.resolve(); });

    harness.activeContext = "course-b";
    harness.renderContext = "course-b";
    harness.lessonId = "lesson-b";
    rerender();
    await waitFor(() => expect(result.current.testQuestions.map(question => question.id)).toEqual(["question-lesson-b"]));
    harness.toast.success.mockClear();
    harness.setLessonProgress.mockClear();

    await act(async () => {
      gradeA.resolve({
        data: {
          score: 1,
          maxScore: 1,
          scorePercent: 100,
          passed: true,
          correctAnswers: { "question-lesson-a": 0 },
          explanations: { "question-lesson-a": "Верно" },
          maxAttempts: 3,
          attemptsUsed: 1,
        },
        error: null,
      });
      await submitPromise;
    });

    expect(result.current.testQuestions.map(question => question.id)).toEqual(["question-lesson-b"]);
    expect(result.current.testSubmitted).toBe(false);
    expect(result.current.testScore).toBeNull();
    expect(harness.setLessonProgress).not.toHaveBeenCalled();
    expect(harness.handleCourseCompletion).not.toHaveBeenCalled();
    expect(harness.toast.success).not.toHaveBeenCalled();
  });
});
