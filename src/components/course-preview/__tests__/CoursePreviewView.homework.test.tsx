import { createRef } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const preview = vi.hoisted(() => ({ content: null as string | null }));
vi.mock("@/hooks/useCoursePreview", () => ({
  useCoursePreview: () => ({
    course: { id: "course-a", title: "Курс", is_published: false },
    lessons: [{ id: "homework-a", title: "Самостоятельная работа С1", type: "homework" }],
    currentLesson: { id: "homework-a", title: "Самостоятельная работа С1", type: "homework", content: preview.content },
    currentLessonIndex: 0, loading: false, isTransitioning: false,
    testQuestions: [], selectedAnswers: {}, lessonAttachments: {}, courseDocuments: [],
    showDocumentsView: false, previewFile: null, contentRef: createRef(), fromStore: false,
    goToNextLesson: vi.fn(), goToPrevLesson: vi.fn(), goToLesson: vi.fn(), goToDocumentsView: vi.fn(),
    navigateBack: vi.fn(), navigateToEditor: vi.fn(), fetchTestQuestions: vi.fn(),
  }),
}));
vi.mock("@/components/course-learning/FilePreviewDialog", () => ({ FilePreviewDialog: () => null }));

import { CoursePreviewView } from "../CoursePreviewView";

beforeEach(() => { preview.content = null; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("homework in read-only course preview", () => {
  it.each([
    "Условия С1\n\nСоставьте письменный план проверки.\n\n1. Укажите источники.\n2. Сохраните границы результата.\n\n[Материал](https://example.test/source)",
    "Составьте письменный план проверки.\n\nСохраните обозначения: (x₂ − x₁) / 2; x < y.\n<a href=\"https://example.test/source\">Материал</a><script>alert('unsafe')</script>",
  ])("renders stored task content and provides no submission or grading controls", (content) => {
    preview.content = content;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden"));
    const view = render(<MemoryRouter><CoursePreviewView embedded /></MemoryRouter>);
    const task = screen.getByRole("region", { name: "Предпросмотр письменного задания" });
    expect(task).toHaveTextContent("Составьте письменный план проверки.");
    expect(within(task).getByRole("document", { name: "Условия задания" }).textContent).toBe(content);
    expect(task.querySelector("script")).toBeNull();
    expect(task).toHaveTextContent("Отправка ответа и просмотр оценки доступны в кабинете слушателя");
    expect(screen.getByRole("button", { name: /Самостоятельная работа С1/ })).toHaveTextContent("Письменное задание");
    expect(within(task).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(task).queryByRole("button")).not.toBeInTheDocument();
    expect(view.container.querySelector('input[type="file"]')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not fabricate a task or a submission result when content is unavailable", () => {
    render(<MemoryRouter><CoursePreviewView embedded /></MemoryRouter>);
    const task = screen.getByRole("region", { name: "Предпросмотр письменного задания" });
    expect(task).toHaveTextContent("Содержимое задания недоступно");
    expect(task).not.toHaveTextContent("Выполнено");
    expect(task).not.toHaveTextContent("Ждёт проверки");
  });
});
