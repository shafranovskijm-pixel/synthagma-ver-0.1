import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

vi.mock("@/components/course-reviewer/CourseReviewRegister", () => ({
  CourseReviewRegister: ({ courseId: scope }: { courseId: string }) => <section aria-label="Учёт слушателей" data-course-id={scope} />,
}));

const state = vi.hoisted(() => {
  const modules = Array.from({ length: 11 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    title: `Модуль ${index + 1}`,
    order_index: index,
  }));
  const lessons = modules.flatMap((module, index) => [
    {
      id: `10000000-0000-4000-8000-${String(index * 3 + 1).padStart(12, "0")}`,
      module_id: module.id,
      title: `Лекция ${index + 1}`,
      type: "text",
      order_index: index * 3,
      is_locked: false,
      test_passing_score: 70,
      test_questions_count: 0,
      module_number: index + 1,
      final_assessment: false,
      source_article_id: `module-${index + 1}-theory`,
    },
    {
      id: `20000000-0000-4000-8000-${String(index * 3 + 2).padStart(12, "0")}`,
      module_id: module.id,
      title: `Письменное задание ${index + 1}`,
      type: "homework",
      order_index: index * 3 + 1,
      is_locked: false,
      test_passing_score: 70,
      test_questions_count: 0,
      module_number: index + 1,
      final_assessment: false,
      source_article_id: `module-${index + 1}-homework`,
    },
    {
      id: `30000000-0000-4000-8000-${String(index * 3 + 3).padStart(12, "0")}`,
      module_id: module.id,
      title: `Тест ${index + 1}`,
      type: "test",
      order_index: index * 3 + 2,
      is_locked: false,
      test_passing_score: 70,
      test_questions_count: 5,
      module_number: index + 1,
      final_assessment: false,
      source_article_id: `module-${index + 1}-test`,
    },
  ]);
  lessons.push(
    {
      ...lessons[1],
      id: "40000000-0000-4000-8000-000000000034",
      title: "Письменное задание 12",
      order_index: 33,
    },
    {
      ...lessons[2],
      id: "40000000-0000-4000-8000-000000000035",
      title: "Итоговый тест",
      order_index: 34,
      test_questions_count: 12,
      final_assessment: true,
    },
  );

  return {
    modules,
    lessons,
    currentLessonId: lessons[2].id,
  };
});

vi.mock("@/hooks/useReviewerCoursePreview", () => ({
  useReviewerCoursePreview: () => ({
    snapshot: {
      course: {
        id: courseId,
        title: "Курс 178 часов",
        description: "Курс для лицензионной проверки.",
        duration: "178 часов",
        is_published: false,
        cover_image_url: null,
      },
      grant_expires_at: "infinity",
      counts: { modules: 11, elements: 35, homework: 12, tests: 12, questions: 67 },
      modules: state.modules,
      lessons: state.lessons,
      library: [{
        id: "50000000-0000-4000-8000-000000000001",
        module_id: null,
        name: "Нормативный документ",
        type: "link",
        description: "Официальный источник",
        sort_order: 0,
        visible_to_students: true,
        allow_download: true,
        library_category: "legal_acts",
        source_name: "Официальный источник",
        resource_url: "https://example.test/document",
        storage_path: null,
        original_filename: null,
        mime_type: null,
        edition_label: null,
        last_checked_at: null,
        usage_basis: "official_open_source",
        library_status: "active",
      }],
    },
    lesson: {
      lesson: {
        ...state.lessons[2],
        course_id: courseId,
        content: null,
      },
      attachments: [],
      questions: [{
        id: "60000000-0000-4000-8000-000000000001",
        question: "Какой режим доступен проверяющему?",
        options: ["Только чтение", "Изменение курса"],
        order_index: 0,
        image_url: null,
      }],
    },
    activeLessonId: state.currentLessonId,
    currentIndex: 2,
    selectLesson: vi.fn(),
    selectPreviousLesson: vi.fn(),
    selectNextLesson: vi.fn(),
    snapshotLoading: false,
    snapshotError: null,
    retrySnapshot: vi.fn(),
    lessonLoading: false,
    lessonError: null,
    retryLesson: vi.fn(),
  }),
}));

import CourseReviewer from "@/pages/CourseReviewer";

afterEach(() => cleanup());

describe("read-only course reviewer screen", () => {
  it("shows the complete structure and masked test options without write controls", () => {
    const view = render(
      <MemoryRouter initialEntries={[`/review/course/${courseId}`]}>
        <Routes><Route path="/review/course/:courseId" element={<CourseReviewer />} /></Routes>
      </MemoryRouter>,
    );

    const counts = screen.getByLabelText("Состав курса");
    expect(within(counts).getByText("11")).toBeInTheDocument();
    expect(within(counts).getByText("35")).toBeInTheDocument();
    expect(within(counts).getAllByText("12")).toHaveLength(2);
    expect(within(counts).getByText("67")).toBeInTheDocument();
    expect(screen.getByText("Доступ без ограничения срока")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Учёт слушателей" })).toHaveAttribute("data-course-id", courseId);

    expect(view.container.querySelectorAll("aside section")).toHaveLength(11);
    expect(view.container.querySelectorAll("aside button")).toHaveLength(35);
    expect(screen.getByText("Какой режим доступен проверяющему?")).toBeInTheDocument();
    expect(screen.getByText("Только чтение", { selector: "li" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Электронная библиотека курса" })).toHaveTextContent("Нормативный документ");

    const questionRegion = screen.getByRole("region", { name: "Вопросы теста без ключей ответов" });
    expect(within(questionRegion).queryByRole("button")).toBeNull();
    expect(within(questionRegion).queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(view.container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText(/начать тест|отправить ответ|зачислить|редактировать курс/i)).toBeNull();
  });
});
