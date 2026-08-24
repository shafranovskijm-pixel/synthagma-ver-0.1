import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AddStudentsToGroupDialog } from "@/components/organization/groups/AddStudentsToGroupDialog";

const apiMocks = vi.hoisted(() => ({
  fetchOrganizationStudentsPage: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => {
  const builder = {
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    select: vi.fn(),
  };
  builder.update.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.is.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  return {
    builder,
    from: vi.fn(() => builder),
    invoke: vi.fn(),
  };
});

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/api/students", () => ({
  fetchOrganizationStudentsPage: apiMocks.fetchOrganizationStudentsPage,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: supabaseMocks.from,
    functions: { invoke: supabaseMocks.invoke },
  },
}));

vi.mock("sonner", () => ({ toast: toastMocks }));

function renderDialog(overrides?: Partial<React.ComponentProps<typeof AddStudentsToGroupDialog>>) {
  const props: React.ComponentProps<typeof AddStudentsToGroupDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    organizationId: "org-1",
    groupId: "group-1",
    groupName: "сентябрь",
    onStudentsChanged: vi.fn(),
    ...overrides,
  };
  render(<AddStudentsToGroupDialog {...props} />);
  return props;
}

describe("AddStudentsToGroupDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.builder.update.mockReturnValue(supabaseMocks.builder);
    supabaseMocks.builder.eq.mockReturnValue(supabaseMocks.builder);
    supabaseMocks.builder.is.mockReturnValue(supabaseMocks.builder);
    supabaseMocks.builder.in.mockReturnValue(supabaseMocks.builder);
    apiMocks.fetchOrganizationStudentsPage.mockResolvedValue({
      rows: [
        { user_id: "student-1", name: "Иванов Иван", email: "ivan@example.ru", login: "ivan", student_group_id: null },
        { user_id: "student-2", name: "Петров Пётр", email: "", login: "petr", student_group_id: null },
      ],
      totalFiltered: 2,
      activeTotal: 2,
      archivedTotal: 0,
      nextOffset: null,
    });
  });

  it("loads only active students without a group and adds selected rows with organization scope", async () => {
    supabaseMocks.builder.select.mockResolvedValue({ data: [{ user_id: "student-1" }], error: null });
    const props = renderDialog();

    expect(await screen.findByText("Иванов Иван")).toBeInTheDocument();
    expect(apiMocks.fetchOrganizationStudentsPage).toHaveBeenCalledWith({
      organizationId: "org-1",
      groupFilter: "no_group",
      archiveMode: "active",
      limit: 100,
      offset: 0,
    });

    fireEvent.click(screen.getByLabelText("Выбрать Иванов Иван"));
    fireEvent.click(screen.getByRole("button", { name: "Добавить выбранных (1)" }));

    await waitFor(() => expect(supabaseMocks.from).toHaveBeenCalledWith("profiles"));
    expect(supabaseMocks.builder.update).toHaveBeenCalledWith({ student_group_id: "group-1" });
    expect(supabaseMocks.builder.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(supabaseMocks.builder.is).toHaveBeenCalledWith("student_group_id", null);
    expect(supabaseMocks.builder.in).toHaveBeenCalledWith("user_id", ["student-1"]);
    expect(props.onStudentsChanged).toHaveBeenCalledWith("grouping");
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(supabaseMocks.invoke).not.toHaveBeenCalled();
  });

  it("fails closed when the scoped update changes fewer students than selected", async () => {
    supabaseMocks.builder.select.mockResolvedValue({ data: [], error: null });
    const props = renderDialog();

    fireEvent.click(await screen.findByLabelText("Выбрать Иванов Иван"));
    fireEvent.click(screen.getByRole("button", { name: "Добавить выбранных (1)" }));

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Не удалось добавить учеников в группу"));
    expect(props.onStudentsChanged).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("creates a new student directly in the exact organization and group without enrollment side effects", async () => {
    supabaseMocks.invoke.mockResolvedValue({ data: { message: "Создан" }, error: null });
    const props = renderDialog();

    await screen.findByText("Иванов Иван");
    fireEvent.click(screen.getByRole("button", { name: "Создать нового" }));
    fireEvent.change(screen.getByLabelText("ФИО *"), { target: { value: "Сидорова Анна" } });
    fireEvent.change(screen.getByLabelText("Email (необязательно)"), { target: { value: "anna@example.ru" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать и добавить" }));

    await waitFor(() => expect(supabaseMocks.invoke).toHaveBeenCalledWith("register-student", {
      body: {
        full_name: "Сидорова Анна",
        email: "anna@example.ru",
        organization_id: "org-1",
        student_group_id: "group-1",
      },
    }));
    expect(props.onStudentsChanged).toHaveBeenCalledWith("population");
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });
});
