import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) => <select value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));
import { AddStudentDialog } from "../AddStudentDialog";
const courses = Array.from({ length: 6 }, (_, i) => ({ id: `course-${i + 1}`, title: `Учебный курс ${i + 1}`, is_published: true }));
const props = { onOpenChange: vi.fn(), courses, companies: [], groups: [], isCreating: false };
describe("explicit new student course selection", () => {
  it("keeps every selected course visible outside search and can remove a hidden checked course", () => {
    const onSubmit = vi.fn();
    render(<AddStudentDialog {...props} open onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Учебный курс 1" }));
    fireEvent.change(screen.getByPlaceholderText("Поиск курса..."), { target: { value: "курс 6" } });
    expect(screen.queryByRole("checkbox", { name: "Учебный курс 1" })).not.toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Выбранные курсы" });
    expect(within(summary).getByText("Учебный курс 1")).toBeInTheDocument();
    fireEvent.click(within(summary).getByRole("button", { name: "Убрать курс: Учебный курс 1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Учебный курс 6" }));
    fireEvent.click(screen.getByRole("button", { name: "Добавить ученика" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ courseIds: ["course-6"] }));
  });
  it("preserves explicitly selected courses across searches instead of silently replacing them", () => {
    const onSubmit = vi.fn(); render(<AddStudentDialog {...props} open onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Учебный курс 1" }));
    fireEvent.change(screen.getByPlaceholderText("Поиск курса..."), { target: { value: "курс 6" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Учебный курс 6" }));
    expect(within(screen.getByRole("region", { name: "Выбранные курсы" })).getByText("Будут назначены: 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Добавить ученика" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ courseIds: ["course-1", "course-6"] }));
  });
  it("clears the whole selection explicitly and sends no course", () => {
    const onSubmit = vi.fn(); render(<AddStudentDialog {...props} open onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Учебный курс 1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Учебный курс 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Очистить выбор" }));
    fireEvent.click(screen.getByRole("button", { name: "Добавить ученика" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ courseIds: [] }));
  });
  it("resets the previous learner selection when the dialog opens again", () => {
    const onSubmit = vi.fn(); const { rerender } = render(<AddStudentDialog {...props} open onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Учебный курс 2" }));
    rerender(<AddStudentDialog {...props} open={false} onSubmit={onSubmit} />);
    rerender(<AddStudentDialog {...props} open onSubmit={onSubmit} />);
    expect(screen.getByRole("checkbox", { name: "Учебный курс 2" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Добавить ученика" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ courseIds: [] }));
  });
});
