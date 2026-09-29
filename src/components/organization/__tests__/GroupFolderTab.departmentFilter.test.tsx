import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroupFolderTab } from "@/components/organization/tabs/GroupFolderTab";

const db = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  errors: {} as Record<string, unknown>,
  refresh: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let start = 0; let end = 999;
    const rows = () => (db.rows[table] || []).filter(row => filters.every(
      ([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value,
    )).slice(start, end + 1);
    const result = () => ({ data: db.errors[table] ? null : rows(), error: db.errors[table] ?? null });
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; },
      is: (key: string, value: unknown) => { filters.push([key, value]); return builder; },
      in: (key: string, value: unknown[]) => { filters.push([key, value]); return builder; },
      order: () => builder,
      range: (from: number, to: number) => { start = from; end = to; return builder; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: db.errors[table] ?? null }),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return builder;
  },
} }));
vi.mock("@/contexts/OrgDashboardContext", () => ({ useOrgDashboard: () => ({}) }));
vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({ can: () => true, canSeeOrgTab: () => true, loading: false }),
}));
vi.mock("@/hooks/useGroupFolderCounts", () => ({
  useGroupFolderCounts: () => ({ counts: {}, refresh: db.refresh }),
}));
vi.mock("@/components/organization/group-folder/ContractsFolder", () => ({ ContractsFolder: () => null }));
vi.mock("@/components/organization/GroupSettingsDialog", () => ({ GroupSettingsDialog: () => null }));
vi.mock("@/components/organization/groups/AddStudentsToGroupDialog", () => ({ AddStudentsToGroupDialog: () => null }));
vi.mock("@/components/organization/group-folder/GroupDocumentsFolder", () => ({
  GroupDocumentsFolder: ({ ctx }: { ctx: unknown }) => <div data-testid="document-context">{JSON.stringify(ctx)}</div>,
}));

function profile(id: string, name: string, department: string | null, extra: Record<string, unknown> = {}) {
  return { user_id: id, full_name: name, department, email: `${id}@example.test`, login: `login-${id}`,
    organization_id: "org-1", student_group_id: "group-1", archived_at: null, ...extra };
}
function tree(organizationId = "org-1", groupId = "group-1") {
  return <MemoryRouter initialEntries={["/organization?tab=group-folder&groupId=group-1&folder=docs"]}>
    <GroupFolderTab organizationId={organizationId} groupId={groupId} />
  </MemoryRouter>;
}
async function openParticipants() {
  fireEvent.click(await screen.findByRole("button", { name: /^Участники \d+ активных$/ }));
  return screen.findByRole("combobox", { name: "Подразделение" });
}
function chooseDepartment(value: string) {
  fireEvent.change(screen.getByRole("combobox", { name: "Подразделение" }), { target: { value } });
}
function search(value: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Поиск участников" }), { target: { value } });
}
function participantRows() {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1).map(row => row.textContent);
}

const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  db.errors = {};
  db.rows = {
    student_groups: [{ id: "group-1", organization_id: "org-1", name: "Учебный центр", course_id: null }],
    organizations: [{ id: "org-1", name: "Организация" }],
    profiles: [
      profile("s1", "Анна Иванова", " Карьер 1 "),
      profile("s2", "Борис Петров", "Карьер 2"),
      profile("s3", "Вера Сидорова", null),
      profile("s4", "Глеб Орлов", "   "),
      profile("s5", "Архивный ученик", "Архивный участок", { archived_at: "2026-09-01" }),
      profile("s6", "Чужой ученик", "Чужое подразделение", { organization_id: "org-2" }),
    ],
    student_frdo_data: [
      { user_id: "s1", organization_id: "org-1", snils: "own-snils" },
      { user_id: "s1", organization_id: "org-2", snils: "foreign-snils" },
    ],
  };
});
afterEach(() => {
  cleanup();
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

describe("group participants department filter", () => {
  it("displays departments, includes an explicit missing value and excludes archived/foreign options", async () => {
    render(tree());
    const select = await openParticipants();
    expect(within(select).getAllByRole("option").map(option => option.textContent)).toEqual([
      "Все подразделения", "Без подразделения", "Карьер 1", "Карьер 2",
    ]);
    expect(participantRows()).toHaveLength(4);
    expect(within(screen.getByRole("table")).getAllByText("Не указано")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("В архиве этой группы: 1");
    expect(screen.getByText("Показано 4 из 4 активных участников")).toBeInTheDocument();
  });

  it("combines named department with case-insensitive name, email or login search", async () => {
    render(tree());
    await openParticipants();
    chooseDepartment("department:Карьер 1");
    expect(participantRows()).toHaveLength(1);
    expect(participantRows()[0]).toContain("Анна Иванова");
    for (const query of ["  АННА  ", "S1@EXAMPLE.TEST", "LOGIN-S1"]) {
      search(query);
      expect(participantRows()[0]).toContain("Анна Иванова");
    }
    search("Борис");
    expect(screen.getByText(/По выбранным условиям ученики не найдены/)).toBeInTheDocument();
    expect(screen.queryByText("В группе нет активных учеников")).not.toBeInTheDocument();
    expect(screen.getByText("Показано 0 из 4 активных участников")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
    expect(participantRows()).toHaveLength(4);
  });

  it("treats both null and blank department as missing", async () => {
    render(tree());
    await openParticipants();
    chooseDepartment("none");
    expect(participantRows()).toHaveLength(2);
    expect(participantRows().join(" ")).toContain("Вера Сидорова");
    expect(participantRows().join(" ")).toContain("Глеб Орлов");
    search("Вера");
    expect(participantRows()).toHaveLength(1);
  });

  it("does not confuse actual department names with reserved filter values", async () => {
    db.rows.profiles = [profile("s1", "Первый", "all"), profile("s2", "Второй", "none")];
    render(tree());
    await openParticipants();
    chooseDepartment("department:all");
    expect(participantRows()).toHaveLength(1);
    expect(participantRows()[0]).toContain("Первый");
    chooseDepartment("department:none");
    expect(participantRows()[0]).toContain("Второй");
    chooseDepartment("none");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("retains filters on refresh even if the selected department no longer has active participants", async () => {
    render(tree());
    await openParticipants();
    chooseDepartment("department:Карьер 1");
    search("Анна");
    db.rows.profiles = db.rows.profiles.filter(row => row.user_id !== "s1");
    fireEvent.click(screen.getByRole("button", { name: "Обновить папки" }));
    expect(await screen.findByRole("combobox", { name: "Подразделение" })).toHaveValue("department:Карьер 1");
    expect(screen.getByRole("textbox", { name: "Поиск участников" })).toHaveValue("Анна");
    expect(screen.getByRole("option", { name: "Карьер 1 (нет активных участников)" })).toBeInTheDocument();
    expect(screen.getByText("Показано 0 из 3 активных участников")).toBeInTheDocument();
  });

  it("keeps the full active document roster and tenant-scoped FRDO data while filtering participants", async () => {
    render(tree());
    await openParticipants();
    chooseDepartment("department:Карьер 2");
    expect(participantRows()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /^Документы группы Beta Приказы/ }));
    const context = JSON.parse((await screen.findByTestId("document-context")).textContent || "null");
    expect(context.students.map((student: { user_id: string }) => student.user_id)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(context.students[0].snils).toBe("own-snils");
    expect(JSON.stringify(context)).not.toContain("foreign-snils");
    await openParticipants();
    expect(screen.getByRole("combobox", { name: "Подразделение" })).toHaveValue("department:Карьер 2");
    expect(participantRows()).toHaveLength(1);
  });

  it("resets scoped filters when switching organization and group", async () => {
    const view = render(tree());
    await openParticipants();
    chooseDepartment("department:Карьер 1");
    search("Анна");
    db.rows.student_groups.push({ id: "group-2", organization_id: "org-2", name: "Другая группа", course_id: null });
    db.rows.organizations.push({ id: "org-2", name: "Другая организация" });
    db.rows.profiles.push(profile("s7", "Новый ученик", "Новый участок", { organization_id: "org-2", student_group_id: "group-2" }));
    view.rerender(tree("org-2", "group-2"));
    expect(await screen.findByRole("combobox", { name: "Подразделение" })).toHaveValue("all");
    expect(screen.getByRole("textbox", { name: "Поиск участников" })).toHaveValue("");
    expect(participantRows()).toHaveLength(1);
    expect(participantRows()[0]).toContain("Новый ученик");
    expect(screen.queryByRole("option", { name: "Карьер 1" })).not.toBeInTheDocument();
  });

  it("preserves retry-error behavior and restores selected filters after recovery", async () => {
    render(tree());
    await openParticipants();
    chooseDepartment("department:Карьер 1");
    db.errors.profiles = { code: "502", message: "Bad gateway" };
    fireEvent.click(screen.getByRole("button", { name: "Обновить папки" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить данные группы");
    expect(screen.queryByRole("combobox", { name: "Подразделение" })).not.toBeInTheDocument();
    delete db.errors.profiles;
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    expect(await screen.findByRole("combobox", { name: "Подразделение" })).toHaveValue("department:Карьер 1");
    expect(participantRows()).toHaveLength(1);
  });
});
