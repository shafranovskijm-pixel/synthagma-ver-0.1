import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseBuilderLessonsNav } from "../CourseBuilderLessonsNav";
import type { CourseModule, Lesson } from "../LessonTypeConfig";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function show() {
  const lessons: Lesson[] = [
    { id: "existing-text", title: "Сохранённая теория", type: "text", content: "<p>Исходный текст</p>", expanded: false, module_id: "module-a" },
    { id: "existing-practice", title: "Сохранённая практика", type: "practice", content: "<p>Исходная практика</p>", expanded: false, module_id: "module-b" },
  ];
  const modules: CourseModule[] = [
    { id: "module-a", title: "Первый модуль", order_index: 0 },
    { id: "module-b", title: "Второй модуль", order_index: 1 },
  ];
  const before = JSON.stringify({ lessons, modules });
  lessons.forEach(Object.freeze);
  modules.forEach(Object.freeze);
  Object.freeze(lessons);
  Object.freeze(modules);
  const onAddLesson = vi.fn();
  const onLessonClick = vi.fn();
  render(<CourseBuilderLessonsNav
    lessons={lessons} modules={modules} activeLessonId="existing-text" sensors={[]}
    onDragEnd={vi.fn()} onLessonClick={onLessonClick} onAddLesson={onAddLesson}
  />);
  return { lessons, modules, before, onAddLesson, onLessonClick };
}

describe("practice authoring through the lesson type dialog", () => {
  it.each([
    [0, "module-a"],
    [1, "module-b"],
  ] as const)("adds practice to the selected module (%s)", (buttonIndex, moduleId) => {
    const { lessons, modules, before, onAddLesson, onLessonClick } = show();
    fireEvent.click(screen.getAllByRole("button", { name: "Занятие" })[buttonIndex]);
    const dialog = screen.getByRole("dialog", { name: "Выберите тип занятия" });
    const practice = within(dialog).getByRole("button", { name: "Практика" });
    expect(practice).toBeEnabled();
    fireEvent.click(practice);
    expect(within(dialog).getByText("Практическое занятие с текстом, изображениями и файлами. Добавляйте материалы в редакторе урока.")).toBeInTheDocument();
    expect(onAddLesson).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Далее" }));

    expect(onAddLesson).toHaveBeenCalledExactlyOnceWith("practice", moduleId);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onLessonClick).not.toHaveBeenCalled();
    expect(JSON.stringify({ lessons, modules })).toBe(before);
    expect(screen.getByRole("button", { name: "Сохранённая теория" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранённая практика" })).toBeInTheDocument();
  });

  it("cancels a practice selection without creating or changing any lesson", () => {
    const { lessons, modules, before, onAddLesson, onLessonClick } = show();
    fireEvent.click(screen.getAllByRole("button", { name: "Занятие" })[1]);
    const dialog = screen.getByRole("dialog", { name: "Выберите тип занятия" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Практика" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Отмена" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onAddLesson).not.toHaveBeenCalled();
    expect(onLessonClick).not.toHaveBeenCalled();
    expect(JSON.stringify({ lessons, modules })).toBe(before);
  });

  it("keeps the existing default text lesson choice and module argument", () => {
    const { lessons, modules, before, onAddLesson } = show();
    fireEvent.click(screen.getAllByRole("button", { name: "Занятие" })[1]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Далее" }));

    expect(onAddLesson).toHaveBeenCalledExactlyOnceWith("text", "module-b");
    expect(JSON.stringify({ lessons, modules })).toBe(before);
  });
});
