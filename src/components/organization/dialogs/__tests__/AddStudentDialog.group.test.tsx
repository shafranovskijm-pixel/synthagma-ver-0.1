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
});
