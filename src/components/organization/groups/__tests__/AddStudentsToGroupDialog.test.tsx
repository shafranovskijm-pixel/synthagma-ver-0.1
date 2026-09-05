import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  const readResults: Record<string, { data: unknown; error: Error | null }> = {};
  const readCall = vi.fn();
  return {
    builder,
    readResults,
    readCall,
    from: vi.fn((table: string) => ({
      update: builder.update,
      select: (columns: string) => {
        const filters: Array<[string, string]> = [];
        const query = {
          eq: (column: string, value: string) => { filters.push([column, value]); return query; },
          maybeSingle: () => {
            readCall(table, columns, filters);
            if (!readResults[table]) throw new Error(`Unexpected read of ${table}`);
            return Promise.resolve(readResults[table]);
          },
        };
        return query;
      },
    })),
    safeInvoke: vi.fn(),
  };
});

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("@/api/students", () => ({
  fetchOrganizationStudentsPage: apiMocks.fetchOrganizationStudentsPage,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: supabaseMocks.from,
  },
}));

vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: supabaseMocks.safeInvoke }));

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
  const view = render(<AddStudentsToGroupDialog {...props} />);
  return {
    ...props,
    rerender: (next: Partial<typeof props>) => view.rerender(<AddStudentsToGroupDialog {...props} {...next} />),
    unmount: view.unmount,
  };
}

async function submitNewStudent() {
  await screen.findByText("Иванов Иван");
  fireEvent.click(screen.getByRole("button", { name: "Создать нового" }));
  fireEvent.change(screen.getByLabelText("ФИО *"), { target: { value: "Сидорова Анна" } });
  fireEvent.change(screen.getByLabelText("Email (необязательно)"), { target: { value: "anna@example.ru" } });
  const button = screen.getByRole("button", { name: "Создать и добавить в группу" });
  await act(async () => { fireEvent.click(button); });
  return button;
}

describe("AddStudentsToGroupDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.builder.update.mockReturnValue(supabaseMocks.builder);
    supabaseMocks.builder.eq.mockReturnValue(supabaseMocks.builder);
    supabaseMocks.builder.is.mockReturnValue(supabaseMocks.builder);
    supabaseMocks.builder.in.mockReturnValue(supabaseMocks.builder);
    supabaseMocks.safeInvoke.mockResolvedValue({ data: { user_id: "created-1", message: "Создан" }, error: null });
    supabaseMocks.readResults.profiles = {
      data: { user_id: "created-1", organization_id: "org-1", student_group_id: "group-1" }, error: null,
    };
    supabaseMocks.readResults.student_groups = {
      data: { id: "group-1", organization_id: "org-1", course_id: null }, error: null,
    };
    supabaseMocks.readResults.courses = {
      data: { id: "course-1", organization_id: "org-1" }, error: null,
    };
    supabaseMocks.readResults.enrollments = {
      data: { id: "enrollment-1", user_id: "created-1", course_id: "course-1", status: "active", expires_at: null }, error: null,
    };
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
    fireEvent.click(screen.getByRole("button", { name: "Добавить только в группу (1)" }));

    await waitFor(() => expect(supabaseMocks.from).toHaveBeenCalledWith("profiles"));
    expect(supabaseMocks.builder.update).toHaveBeenCalledWith({ student_group_id: "group-1" });
    expect(supabaseMocks.builder.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(supabaseMocks.builder.is).toHaveBeenCalledWith("student_group_id", null);
    expect(supabaseMocks.builder.in).toHaveBeenCalledWith("user_id", ["student-1"]);
    expect(props.onStudentsChanged).toHaveBeenCalledWith("grouping");
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(toastMocks.success).toHaveBeenCalledWith("1 ученик добавлен только в группу", {
      description: "На курс ещё не зачислены. Следующий шаг — «Зачислить на курс».",
    });
    expect(supabaseMocks.safeInvoke).not.toHaveBeenCalled();
  });

  it("fails closed when the scoped update changes fewer students than selected", async () => {
    supabaseMocks.builder.select.mockResolvedValue({ data: [], error: null });
    const props = renderDialog();

    fireEvent.click(await screen.findByLabelText("Выбрать Иванов Иван"));
    fireEvent.click(screen.getByRole("button", { name: "Добавить только в группу (1)" }));

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Не удалось добавить учеников в группу"));
    expect(props.onStudentsChanged).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("confirms the saved student and exact group without a course before success", async () => {
    const props = renderDialog();
    await submitNewStudent();

    await waitFor(() => expect(supabaseMocks.safeInvoke).toHaveBeenCalledWith("register-student", {
      retry: false,
      body: {
        full_name: "Сидорова Анна",
        email: "anna@example.ru",
        organization_id: "org-1",
        student_group_id: "group-1",
      },
    }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Ученик добавлен в группу", {
      description: "У группы «сентябрь» нет курса. Зачисление можно выполнить отдельно на этапе «Обучение».",
    }));
    expect(supabaseMocks.readCall).toHaveBeenCalledWith("profiles", "user_id, organization_id, student_group_id", [
      ["user_id", "created-1"], ["organization_id", "org-1"],
    ]);
    expect(supabaseMocks.readCall).toHaveBeenCalledWith("student_groups", "id, organization_id, course_id", [
      ["id", "group-1"], ["organization_id", "org-1"],
    ]);
    expect(supabaseMocks.from).not.toHaveBeenCalledWith("enrollments");
    expect(supabaseMocks.builder.update).not.toHaveBeenCalled();
    expect(props.onStudentsChanged).toHaveBeenCalledWith("population");
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each([
    ["active", null],
    ["in_progress", null],
    ["completed", "2020-01-01T00:00:00Z"],
  ])("confirms a linked group course with %s access without mutating enrollment", async (status, expires_at) => {
    supabaseMocks.readResults.student_groups.data = { id: "group-1", organization_id: "org-1", course_id: "course-1" };
    supabaseMocks.readResults.enrollments.data = { id: "enrollment-1", user_id: "created-1", course_id: "course-1", status, expires_at };
    const props = renderDialog();
    await submitNewStudent();

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Ученик добавлен в группу и зачислен на её курс", {
      description: "Группа «сентябрь» и зачисление подтверждены в базе.",
    }));
    expect(supabaseMocks.readCall).toHaveBeenCalledWith("courses", "id, organization_id", [
      ["id", "course-1"], ["organization_id", "org-1"],
    ]);
    expect(supabaseMocks.readCall).toHaveBeenCalledWith("enrollments", "id, user_id, course_id, status, expires_at", [
      ["user_id", "created-1"], ["course_id", "course-1"],
    ]);
    expect(supabaseMocks.builder.update).not.toHaveBeenCalled();
    expect(supabaseMocks.safeInvoke).toHaveBeenCalledTimes(1);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each([
    ["missing profile", "profiles", null],
    ["wrong user", "profiles", { user_id: "someone-else", organization_id: "org-1", student_group_id: "group-1" }],
    ["wrong organization", "profiles", { user_id: "created-1", organization_id: "other-org", student_group_id: "group-1" }],
    ["wrong group", "profiles", { user_id: "created-1", organization_id: "org-1", student_group_id: "other-group" }],
    ["missing group", "student_groups", null],
    ["group from another organization", "student_groups", { id: "group-1", organization_id: "other-org", course_id: null }],
    ["unconfirmed course setting", "student_groups", { id: "group-1", organization_id: "org-1" }],
  ])("does not report success for %s and preserves the entered values", async (_label, table, data) => {
    supabaseMocks.readResults[table as string].data = data;
    const props = renderDialog();
    await submitNewStudent();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("завершение операции не подтверждено"));
    expect(screen.getByLabelText("ФИО *")).toHaveValue("Сидорова Анна");
    expect(screen.getByRole("button", { name: "Создать и добавить в группу" })).toBeDisabled();
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
    expect(props.onStudentsChanged).toHaveBeenCalledWith("population");
    expect(supabaseMocks.safeInvoke).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing", null],
    ["another course", { id: "enrollment-1", user_id: "created-1", course_id: "course-2", status: "active", expires_at: null }],
    ["another student", { id: "enrollment-1", user_id: "student-2", course_id: "course-1", status: "active", expires_at: null }],
    ["expired", { id: "enrollment-1", user_id: "created-1", course_id: "course-1", status: "active", expires_at: "2020-01-01T00:00:00Z" }],
  ])("does not announce a linked course when enrollment is %s", async (_label, data) => {
    supabaseMocks.readResults.student_groups.data = { id: "group-1", organization_id: "org-1", course_id: "course-1" };
    supabaseMocks.readResults.enrollments.data = data;
    const props = renderDialog();
    await submitNewStudent();

    await waitFor(() => expect(toastMocks.warning).toHaveBeenCalled());
    expect(screen.getByRole("alert")).toHaveTextContent("Не создавайте ученика повторно");
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
    expect(supabaseMocks.builder.update).not.toHaveBeenCalled();
  });

  it("rejects a linked course from another organization", async () => {
    supabaseMocks.readResults.student_groups.data = { id: "group-1", organization_id: "org-1", course_id: "course-1" };
    supabaseMocks.readResults.courses.data = { id: "course-1", organization_id: "other-org" };
    renderDialog();
    await submitNewStudent();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("принадлежность курса группы"));
    expect(supabaseMocks.from).not.toHaveBeenCalledWith("enrollments");
    expect(toastMocks.success).not.toHaveBeenCalled();
  });

  it("retains an unconfirmed result on a profile read failure", async () => {
    supabaseMocks.readResults.profiles = { data: null, error: new Error("read unavailable") };
    const props = renderDialog();
    await submitNewStudent();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("read unavailable"));
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
    expect(props.onStudentsChanged).toHaveBeenCalledWith("population");
  });

  it.each([
    { data: { message: "Создан" }, error: null },
    { data: { user_id: " " }, error: null },
    { data: null, error: new Error("network unavailable") },
    { data: null, error: new Error("response lost"), httpStatus: 500 },
  ])("does not retry an uncertain registration or claim rollback", async (response) => {
    supabaseMocks.safeInvoke.mockResolvedValue(response);
    const props = renderDialog();
    await submitNewStudent();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Результат создания ученика не подтверждён"));
    expect(screen.getByRole("button", { name: "Создать и добавить в группу" })).toBeDisabled();
    expect(toastMocks.error).not.toHaveBeenCalled();
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
    expect(props.onStudentsChanged).toHaveBeenCalledWith("population");
    expect(supabaseMocks.safeInvoke).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it("shows partial registration without claiming group or enrollment success", async () => {
    supabaseMocks.safeInvoke.mockResolvedValue({
      data: { user_id: "created-1", partial_success: true, error: "Группа не сохранена" }, error: null,
    });
    const props = renderDialog();
    await submitNewStudent();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Группа не сохранена"));
    expect(supabaseMocks.from).not.toHaveBeenCalled();
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
    expect(props.onStudentsChanged).toHaveBeenCalledWith("population");
  });

  it("allows correction after a confirmed pre-write rejection", async () => {
    supabaseMocks.safeInvoke.mockResolvedValue({ data: null, error: new Error("Недостаточно прав"), httpStatus: 403 });
    const props = renderDialog();
    await submitNewStudent();

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Недостаточно прав"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать и добавить в группу" })).toBeEnabled();
    expect(props.onStudentsChanged).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("does not submit twice while registration is pending", async () => {
    let resolveRegistration!: (value: unknown) => void;
    supabaseMocks.safeInvoke.mockImplementation(() => new Promise((resolve) => { resolveRegistration = resolve; }));
    renderDialog();
    const button = await submitNewStudent();
    fireEvent.click(button);
    expect(supabaseMocks.safeInvoke).toHaveBeenCalledTimes(1);

    await act(async () => { resolveRegistration({ data: { user_id: "created-1" }, error: null }); });
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalled());
    expect(supabaseMocks.safeInvoke).toHaveBeenCalledTimes(1);
  });

  it("blocks dismiss while pending and retains an uncertain registration after close and reopen", async () => {
    let resolveRegistration!: (value: unknown) => void;
    supabaseMocks.safeInvoke.mockImplementation(() => new Promise((resolve) => { resolveRegistration = resolve; }));
    const props = renderDialog();
    await submitNewStudent();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => { resolveRegistration({ data: null, error: new Error("response lost") }); });
    expect(screen.getByRole("alert")).toHaveTextContent("Результат создания ученика не подтверждён");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    props.rerender({ open: false });
    props.rerender({ open: true });

    expect(await screen.findByRole("alert")).toHaveTextContent("Результат создания ученика не подтверждён");
    fireEvent.change(screen.getByLabelText("ФИО *"), { target: { value: "Сидорова Анна" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать и добавить в группу" }));
    expect(screen.getByRole("button", { name: "Создать и добавить в группу" })).toBeDisabled();
    expect(supabaseMocks.safeInvoke).toHaveBeenCalledTimes(1);
    expect(toastMocks.success).not.toHaveBeenCalled();
  });

  it("does not apply the old group's registration response to a new group or lose the old warning", async () => {
    let resolveRegistration!: (value: unknown) => void;
    supabaseMocks.safeInvoke.mockImplementation(() => new Promise((resolve) => { resolveRegistration = resolve; }));
    const props = renderDialog();
    await submitNewStudent();

    props.rerender({ groupId: "group-2", groupName: "октябрь" });
    await screen.findByRole("heading", { name: "Добавить учеников в «октябрь»" });
    await act(async () => { resolveRegistration({ data: { user_id: "created-1" }, error: null }); });

    expect(supabaseMocks.safeInvoke).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.safeInvoke.mock.calls[0][1].body.student_group_id).toBe("group-1");
    expect(supabaseMocks.readCall).not.toHaveBeenCalled();
    expect(props.onStudentsChanged).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(toastMocks.warning).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Добавить учеников в «октябрь»" })).toBeInTheDocument();

    props.rerender({ groupId: "group-1", groupName: "сентябрь" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Результат регистрации в группе «сентябрь» не подтверждён");
    fireEvent.change(screen.getByLabelText("ФИО *"), { target: { value: "Сидорова Анна" } });
    expect(screen.getByRole("button", { name: "Создать и добавить в группу" })).toBeDisabled();
    expect(supabaseMocks.safeInvoke).toHaveBeenCalledTimes(1);
  });

  it("ignores a registration response after the dialog is unmounted", async () => {
    let resolveRegistration!: (value: unknown) => void;
    supabaseMocks.safeInvoke.mockImplementation(() => new Promise((resolve) => { resolveRegistration = resolve; }));
    const props = renderDialog();
    await submitNewStudent();
    props.unmount();

    await act(async () => { resolveRegistration({ data: { user_id: "created-1" }, error: null }); });

    expect(supabaseMocks.safeInvoke).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.readCall).not.toHaveBeenCalled();
    expect(props.onStudentsChanged).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(toastMocks.warning).not.toHaveBeenCalled();
    expect(toastMocks.error).not.toHaveBeenCalled();
  });
});
