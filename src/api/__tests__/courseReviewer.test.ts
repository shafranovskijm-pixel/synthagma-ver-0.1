import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: state.rpc },
}));

import {
  fetchCourseReviewLesson,
  fetchCourseReviewSnapshot,
} from "@/api/courseReviewer";

const ids = {
  course: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  module: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  lesson: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  question: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};

const snapshot = {
  course: {
    id: ids.course,
    title: "Проверяемый курс",
    description: null,
    duration: "178 часов",
    is_published: false,
    cover_image_url: null,
  },
  grant_expires_at: "2026-09-27T00:00:00+00:00",
  counts: { modules: 11, elements: 35, homework: 12, tests: 12, questions: 67 },
  modules: [{ id: ids.module, title: "Модуль 1", order_index: 0 }],
  lessons: [{
    id: ids.lesson,
    module_id: ids.module,
    title: "Итоговый тест",
    type: "test",
    order_index: 0,
    is_locked: false,
    test_passing_score: 70,
    test_questions_count: 1,
    module_number: 1,
    final_assessment: false,
    source_article_id: "module-1-test",
  }],
  library: [],
};

const lesson = {
  lesson: {
    ...snapshot.lessons[0],
    course_id: ids.course,
    content: null,
  },
  attachments: [],
  questions: [{
    id: ids.question,
    question: "Что проверяется?",
    options: ["Вариант А", "Вариант Б"],
    order_index: 0,
    image_url: null,
  }],
};

describe("course reviewer RPC boundary", () => {
  beforeEach(() => state.rpc.mockReset());

  it("uses only the exact snapshot and lesson RPCs with both scope identifiers", async () => {
    state.rpc
      .mockResolvedValueOnce({ data: snapshot, error: null })
      .mockResolvedValueOnce({ data: lesson, error: null });

    await expect(fetchCourseReviewSnapshot(ids.course)).resolves.toEqual(snapshot);
    await expect(fetchCourseReviewLesson(ids.course, ids.lesson)).resolves.toEqual(lesson);

    expect(state.rpc).toHaveBeenNthCalledWith(1, "get_course_review_snapshot", {
      p_course_id: ids.course,
    });
    expect(state.rpc).toHaveBeenNthCalledWith(2, "get_course_review_lesson", {
      p_course_id: ids.course,
      p_lesson_id: ids.lesson,
    });
  });

  it.each([
    { ...lesson, questions: [{ ...lesson.questions[0], correct_answer: 0 }] },
    { ...lesson, questions: [{ ...lesson.questions[0], explanation: "Верный ответ А" }] },
    { ...lesson, questions: [{ ...lesson.questions[0], options: [{ text: "А", isCorrect: true }] }] },
  ])("rejects an answer-bearing or non-string question payload", async (unsafeLesson) => {
    state.rpc.mockResolvedValue({ data: unsafeLesson, error: null });
    await expect(fetchCourseReviewLesson(ids.course, ids.lesson)).rejects.toThrow();
  });

  it("rejects extra snapshot fields instead of silently widening the reviewer contract", async () => {
    state.rpc.mockResolvedValue({
      data: { ...snapshot, course: { ...snapshot.course, landing_content: { secret: true } } },
      error: null,
    });
    await expect(fetchCourseReviewSnapshot(ids.course)).rejects.toThrow();
  });
});
