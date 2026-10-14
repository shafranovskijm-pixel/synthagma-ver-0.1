import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudentCoursesEnrollDialog } from "../StudentCoursesEnrollDialog";

const courses = [
  { id: "one", title: "Охрана труда", is_published: true },
  { id: "two", title: "Первая помощь", is_published: true },
  { id: "draft", title: "Черновик", is_published: false },
];
const props = { open: true, onOpenChange: vi.fn(), courses, getCategoryById: () => undefined, isEnrolling: false, results: [], onEnroll: vi.fn() };

describe("student multi-course selection", () => {
  it("keeps selection across searches, supports deselection and submits unique IDs", () => {
    const onEnroll = vi.fn();
    render(<StudentCoursesEnrollDialog {...props} onEnroll={onEnroll} />);
    expect(screen.queryByRole("checkbox", { name: "Черновик" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Охрана труда" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Поиск курсов" }), { target: { value: "помощь" } });
    fireEvent.click(screen.getByRole("button", { name: "Выбрать найденные" }));
    expect(screen.getByText("Выбрано курсов: 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Снять выбор найденных" }));
    expect(screen.getByText("Выбрано курсов: 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Первая помощь" }));
    fireEvent.click(screen.getByRole("button", { name: "Добавить выбранные курсы (2)" }));
    expect(onEnroll).toHaveBeenCalledExactlyOnceWith(["one", "two"]);
  });

  it("retains only unconfirmed selections after a partial result", () => {
    const onEnroll = vi.fn();
    const view = render(<StudentCoursesEnrollDialog {...props} onEnroll={onEnroll} />);
    fireEvent.click(screen.getByRole("button", { name: "Выбрать найденные" }));
    view.rerender(<StudentCoursesEnrollDialog {...props} onEnroll={onEnroll} results={[
      { courseId: "one", title: courses[0].title, confirmed: true, message: "Добавлен" },
      { courseId: "two", title: courses[1].title, confirmed: false, message: "Не подтверждено" },
    ]} />);
    expect(screen.queryByRole("checkbox", { name: "Охрана труда" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Первая помощь" })).toBeChecked();
    expect(screen.getByText("Подтверждено курсов: 1 из 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Добавить выбранные курсы (1)" }));
    expect(onEnroll).toHaveBeenCalledExactlyOnceWith(["two"]);
  });

  it("prevents changing selection and closing while the batch is pending", () => {
    const onOpenChange = vi.fn();
    render(<StudentCoursesEnrollDialog {...props} isEnrolling onOpenChange={onOpenChange} />);
    expect(screen.getByRole("checkbox", { name: "Охрана труда" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Поиск курсов" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
