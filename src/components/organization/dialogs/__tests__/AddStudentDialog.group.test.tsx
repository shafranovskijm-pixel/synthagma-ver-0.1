import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: ReactNode;
  }) => (
    <select
      aria-label="Группа ученика"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

import { AddStudentDialog } from "@/components/organization/dialogs/AddStudentDialog";

describe("AddStudentDialog group assignment", () => {
  it("shows the implicit group course and lets the user add another course without duplicating it", () => {
    const onSubmit = vi.fn();
    render(<AddStudentDialog open onOpenChange={vi.fn()} companies={[]} isCreating={false} onSubmit={onSubmit}
      groups={[{ id: "group-1", name: "Группа 1", course_id: "course-1" }]}
      courses={[{ id: "course-1", title: "Охрана труда", is_published: true }, { id: "course-2", title: "Пожарная безопасность", is_published: true }]} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Группа ученика" }), { target: { value: "group-1" } });
    expect(screen.getByText(/Курс группы «Охрана труда» будет назначен вместе с группой/)).toBeInTheDocument();
    const implicit = screen.getByRole("checkbox", { name: /Охрана труда/ });
    expect(implicit).toBeChecked();
    expect(implicit).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Пожарная безопасность" }));
    fireEvent.change(screen.getByPlaceholderText("Иванов Иван Иванович"), { target: { value: "Тестовый Ученик" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить ученика" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ groupId: "group-1", courseIds: ["course-2"] }));
    fireEvent.change(screen.getByRole("combobox", { name: "Группа ученика" }), { target: { value: "__no_group__" } });
    expect(implicit).not.toBeChecked();
    expect(implicit).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Пожарная безопасность" })).toBeChecked();
  });

  it("explains a group without a course without inventing an enrollment", () => {
    render(<AddStudentDialog open onOpenChange={vi.fn()} companies={[]} courses={[]} isCreating={false} onSubmit={vi.fn()}
      groups={[{ id: "group-1", name: "Группа 1", course_id: null }]} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Группа ученика" }), { target: { value: "group-1" } });
    expect(screen.getByText(/К группе пока не привязан курс/)).toBeInTheDocument();
  });

  it("does not hide the implicit group course when it is outside the published course picker", () => {
    render(<AddStudentDialog open onOpenChange={vi.fn()} companies={[]} courses={[]} isCreating={false} onSubmit={vi.fn()}
      groups={[{ id: "group-1", name: "Группа 1", course_id: "course-1" }]} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Группа ученика" }), { target: { value: "group-1" } });
    expect(screen.getByText(/Курс группы будет назначен вместе с группой/)).toBeInTheDocument();
    expect(screen.getByText(/Дополнительные курсы \(необязательно\)/)).toBeInTheDocument();
  });

  it("submits the selected group together with the new student", () => {
    const onSubmit = vi.fn();

    render(
      <AddStudentDialog
        open
        onOpenChange={vi.fn()}
        courses={[]}
        companies={[]}
        groups={[
          { id: "group-1", name: "Группа 1-ПК-26" },
          { id: "group-2", name: "Группа 2-ПК-26" },
        ]}
        onSubmit={onSubmit}
        isCreating={false}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Иванов Иван Иванович"), {
      target: { value: "Петров Пётр Петрович" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Группа ученика" }), {
      target: { value: "group-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Добавить ученика" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Петров Пётр Петрович",
      email: "",
      courseIds: [],
      companyId: "",
      groupId: "group-1",
      login: "",
      password: "",
    });
  });

  it("keeps creation available without a group when the group directory failed to load", () => {
    const onSubmit = vi.fn();

    render(
      <AddStudentDialog
        open
        onOpenChange={vi.fn()}
        courses={[]}
        companies={[]}
        groups={[]}
        groupsError
        onSubmit={onSubmit}
        isCreating={false}
      />,
    );

    expect(screen.getByText(/Не удалось загрузить группы/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Иванов Иван Иванович"), {
      target: { value: "Сидоров Сидор Сидорович" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Добавить ученика" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: "Сидоров Сидор Сидорович",
      groupId: "",
    }));
  });

  it("preserves the entered student and group after an uncertain response and requires a manual check before retry", () => {
    const onSubmit = vi.fn();
    const props = {
      open: true, onOpenChange: vi.fn(), courses: [], companies: [],
      groups: [{ id: "group-1", name: "Группа 1-ПК-26" }], onSubmit, isCreating: false,
    };
    const view = render(<AddStudentDialog {...props} />);
    fireEvent.change(screen.getByPlaceholderText("Иванов Иван Иванович"), { target: { value: "Новый Ученик" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Группа ученика" }), { target: { value: "group-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить ученика" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    view.rerender(<AddStudentDialog {...props} creationWarning="Результат создания ученика не подтверждён. Проверьте список и уточните результат." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Результат создания ученика не подтверждён");
    expect(screen.getByPlaceholderText("Иванов Иван Иванович")).toHaveValue("Новый Ученик");
    expect(screen.getByRole("combobox", { name: "Группа ученика" })).toHaveValue("group-1");
    const retry = screen.getByRole("button", { name: "Создать после ручной проверки" });
    expect(retry).toBeDisabled();
    fireEvent.click(retry);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("checkbox", { name: /Результат регистрации проверен/ }));
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Новый Ученик", groupId: "group-1" }));
    // Another lost response with the same text must require another explicit check.
    expect(retry).toBeDisabled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("retains an uncertain draft across close/reopen but resets the manual confirmation and later normal opens", () => {
    const onOpenChange = vi.fn();
    const props = {
      open: true, onOpenChange, courses: [], companies: [],
      groups: [{ id: "group-1", name: "Группа 1-ПК-26" }], onSubmit: vi.fn(), isCreating: false,
    };
    const warning = "Результат создания ученика не подтверждён. Проверьте список.";
    const view = render(<AddStudentDialog {...props} />);
    fireEvent.change(screen.getByPlaceholderText("Иванов Иван Иванович"), { target: { value: "Сохранённый Черновик" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Группа ученика" }), { target: { value: "group-1" } });
    view.rerender(<AddStudentDialog {...props} creationWarning={warning} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Результат регистрации проверен/ }));
    expect(screen.getByRole("button", { name: "Создать после ручной проверки" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    view.rerender(<AddStudentDialog {...props} open={false} creationWarning={warning} />);
    view.rerender(<AddStudentDialog {...props} creationWarning={warning} />);
    expect(screen.getByPlaceholderText("Иванов Иван Иванович")).toHaveValue("Сохранённый Черновик");
    expect(screen.getByRole("combobox", { name: "Группа ученика" })).toHaveValue("group-1");
    expect(screen.getByRole("checkbox", { name: /Результат регистрации проверен/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Создать после ручной проверки" })).toBeDisabled();

    // Starting an explicit retry clears the warning while the dialog stays open.
    view.rerender(<AddStudentDialog {...props} isCreating creationWarning={null} />);
    expect(screen.getByPlaceholderText("Иванов Иван Иванович")).toHaveValue("Сохранённый Черновик");
    expect(screen.getByRole("combobox", { name: "Группа ученика" })).toHaveValue("group-1");

    view.rerender(<AddStudentDialog {...props} open={false} creationWarning={null} />);
    view.rerender(<AddStudentDialog {...props} creationWarning={null} />);
    expect(screen.getByPlaceholderText("Иванов Иван Иванович")).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Группа ученика" })).toHaveValue("__no_group__");
  });
});
