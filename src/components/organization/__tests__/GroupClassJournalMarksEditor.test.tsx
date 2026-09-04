import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  fetch: vi.fn(), save: vi.fn(), permissions: new Set<string>(), permissionsLoading: false,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({
    loading: state.permissionsLoading, can: (permission: string) => state.permissions.has(permission),
  }),
}));
vi.mock("@/lib/groups/groupClassJournalMarks", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/groups/groupClassJournalMarks")>()),
  fetchGroupClassJournalMarks: (...args: unknown[]) => state.fetch(...args),
  saveGroupClassJournalMark: (...args: unknown[]) => state.save(...args),
}));

import { GroupClassJournalMarksEditor } from "@/components/organization/GroupClassJournalMarksEditor";
import {
  GroupClassJournalMarksError, type GroupClassJournalMark, type GroupClassJournalMarksContext,
} from "@/lib/groups/groupClassJournalMarks";
import { groupFolderPath } from "@/lib/groups/groupContext";

const scope = { organizationId: "organization-a", groupId: "group-a" };
const firstName = "Иванова Анна";
const secondName = "Петров Борис";
function makeContext(): GroupClassJournalMarksContext {
  return {
    group: {
      id: scope.groupId, organization_id: scope.organizationId, course_id: "course-a", name: "Группа А",
      training_dates: ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"],
    },
    students: [{ user_id: "user-a", full_name: firstName }, { user_id: "user-b", full_name: secondName }],
    marks: [],
  };
}
function makeMark(overrides: Partial<GroupClassJournalMark> = {}): GroupClassJournalMark {
  return {
    id: "mark-a", organization_id: scope.organizationId, group_id: scope.groupId, user_id: "user-a", slot: 1,
    course_id: "course-a", source_date: "2026-09-01", mark: "V", revision: 1,
    updated_at: "2026-09-04T02:00:00Z", updated_by: "operator-a", ...overrides,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}
function editor(props = scope, onClose = vi.fn()) {
  return <MemoryRouter><GroupClassJournalMarksEditor {...props} onClose={onClose} /><LocationProbe /></MemoryRouter>;
}
function cell(name = firstName, slot = 1) {
  return screen.getByRole("button", { name: new RegExp(`^${name}, колонка ${slot},`) });
}
async function loaded() {
  await screen.findByRole("table");
}

describe("GroupClassJournalMarksEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.fetch.mockReset().mockResolvedValue(makeContext());
    state.save.mockReset().mockResolvedValue(makeContext());
    state.permissions = new Set(["documents.read", "documents.write"]);
    state.permissionsLoading = false;
  });
  afterEach(cleanup);

  it("loads the exact organization/group and keeps the four original columns", async () => {
    render(editor());
    await loaded();
    expect(state.fetch).toHaveBeenCalledExactlyOnceWith(scope);
    expect(screen.getByText("Группа А")).toBeInTheDocument();
    expect(screen.getByRole("table").querySelectorAll("thead th")).toHaveLength(5);
    expect(screen.getAllByRole("button", { name: /, колонка [1-4],/ })).toHaveLength(8);
    expect(screen.getByText(/Это ручной учёт очных занятий/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
  });

  it("saves an unchanged raw mark for the selected user and slot with the full current scope", async () => {
    const context = makeContext();
    const raw = "  н/б  ";
    const saved = { ...context, marks: [makeMark({ user_id: "user-b", slot: 3, source_date: "2026-09-03", mark: raw })] };
    state.fetch.mockResolvedValue(context);
    state.save.mockResolvedValue(saved);
    render(editor());
    await loaded();
    fireEvent.click(cell(secondName, 3));
    fireEvent.change(screen.getByRole("textbox", { name: "Отметка в Word-журнале" }), { target: { value: raw } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить отметку" }));
    await screen.findByText("Отметка сохранена и проверена в базе.");
    expect(state.save).toHaveBeenCalledExactlyOnceWith({ ...scope, context, userId: "user-b", slot: 3, mark: raw });
    expect(cell(secondName, 3).textContent).toBe(raw);
    expect(cell(firstName, 3)).toHaveTextContent("—");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("limits input by twelve Unicode code points just like the database", async () => {
    render(editor());
    await loaded();
    fireEvent.click(cell());
    const input = screen.getByRole("textbox", { name: "Отметка в Word-журнале" });
    expect(input).not.toHaveAttribute("maxlength");
    fireEvent.change(input, { target: { value: "✅😀".repeat(7) } });
    expect(input).toHaveValue("✅😀".repeat(6));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить отметку" }));
    await screen.findByText("Отметка сохранена и проверена в базе.");
    expect(state.save.mock.calls[0][0].mark).toBe("✅😀".repeat(6));
  });

  it.each([
    { button: "Присутствие — V", mark: "V" },
    { button: "Очистить отметку", mark: "" },
  ])("$button only changes the draft until explicit save", async ({ button, mark }) => {
    const context = { ...makeContext(), marks: [makeMark({ mark: "ручная" })] };
    state.fetch.mockResolvedValue(context);
    state.save.mockResolvedValue({ ...context, marks: [makeMark({ mark, revision: 2 })] });
    render(editor());
    await loaded();
    fireEvent.click(cell());
    expect(screen.getByRole("textbox")).toHaveValue("ручная");
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(screen.getByRole("textbox")).toHaveValue(mark);
    expect(state.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить отметку" }));
    await screen.findByText("Отметка сохранена и проверена в базе.");
    expect(state.save).toHaveBeenCalledExactlyOnceWith({ ...scope, context, userId: "user-a", slot: 1, mark });
    expect(cell()).toHaveTextContent(mark || "—");
  });

  it("synchronously prevents a second save while the first request/readback is pending", async () => {
    const pending = deferred<GroupClassJournalMarksContext>();
    state.save.mockReturnValue(pending.promise);
    render(editor());
    await loaded();
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Присутствие — V" }));
    const saveButton = screen.getByRole("button", { name: "Сохранить отметку" });
    act(() => { fireEvent.click(saveButton); fireEvent.click(saveButton); });
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Сохраняем…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Перезагрузить отметки" })).toBeDisabled();
    expect(screen.queryByText("Отметка сохранена и проверена в базе.")).not.toBeInTheDocument();
    await act(async () => { pending.resolve({ ...makeContext(), marks: [makeMark()] }); await pending.promise; });
    expect(screen.getByText("Отметка сохранена и проверена в базе.")).toBeInTheDocument();
    expect(state.save).toHaveBeenCalledTimes(1);
  });

  it("locks uncertain writes until a successful reload and never retries the write automatically", async () => {
    state.save.mockRejectedValueOnce(new GroupClassJournalMarksError("Запись не подтверждена.", true));
    render(editor());
    await loaded();
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Присутствие — V" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить отметку" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Запись не подтверждена.");
    expect(screen.getByRole("textbox")).toHaveValue("V");
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Сохранить отметку" })).toBeDisabled();
    expect(cell(secondName, 2)).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить отметку" }));
    expect(state.save).toHaveBeenCalledTimes(1);

    state.fetch.mockRejectedValueOnce(new GroupClassJournalMarksError("Повторная загрузка не удалась."));
    fireEvent.click(screen.getByRole("button", { name: "Перезагрузить отметки" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Повторная загрузка не удалась."));
    expect(screen.getByRole("button", { name: "Сохранить отметку" })).toBeDisabled();
    expect(screen.queryByText("Отметка сохранена и проверена в базе.")).not.toBeInTheDocument();

    state.fetch.mockResolvedValueOnce({ ...makeContext(), marks: [makeMark()] });
    fireEvent.click(screen.getByRole("button", { name: "Перезагрузить отметки" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(cell()).toBeEnabled();
    expect(cell()).toHaveTextContent("V");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(state.fetch).toHaveBeenCalledTimes(3);
    expect(state.save).toHaveBeenCalledTimes(1);
    fireEvent.click(cell(secondName, 2));
    expect(screen.getByRole("button", { name: "Сохранить отметку" })).toBeEnabled();
  });

  it("also blocks an unknown save failure rather than treating it as safe to repeat", async () => {
    state.save.mockRejectedValueOnce(new Error("Network connection lost"));
    render(editor());
    await loaded();
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Сохранить отметку" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Сохранение не подтверждено");
    expect(screen.getByRole("button", { name: "Сохранить отметку" })).toBeDisabled();
    expect(state.save).toHaveBeenCalledTimes(1);
  });

  it("does not paint a late old-group load into the newly selected group", async () => {
    const oldLoad = deferred<GroupClassJournalMarksContext>();
    const nextScope = { ...scope, groupId: "group-b" };
    const nextContext = { ...makeContext(), group: { ...makeContext().group, id: nextScope.groupId, name: "Группа Б" } };
    state.fetch.mockReturnValueOnce(oldLoad.promise).mockResolvedValueOnce(nextContext);
    const view = render(editor());
    view.rerender(editor(nextScope));
    await screen.findByText("Группа Б");
    await act(async () => { oldLoad.resolve({ ...makeContext(), marks: [makeMark({ mark: "СТАРАЯ" })] }); await oldLoad.promise; });
    expect(screen.getByText("Группа Б")).toBeInTheDocument();
    expect(screen.queryByText("Группа А")).not.toBeInTheDocument();
    expect(screen.queryByText("СТАРАЯ")).not.toBeInTheDocument();
    expect(state.fetch).toHaveBeenNthCalledWith(2, nextScope);
    state.save.mockResolvedValueOnce(nextContext);
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Сохранить отметку" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledExactlyOnceWith({ ...nextScope, context: nextContext, userId: "user-a", slot: 1, mark: "" }));
  });

  it("ignores an old-group save completion after switching groups", async () => {
    const oldSave = deferred<GroupClassJournalMarksContext>();
    state.save.mockReturnValueOnce(oldSave.promise);
    const nextScope = { ...scope, groupId: "group-b" };
    const nextContext = { ...makeContext(), group: { ...makeContext().group, id: nextScope.groupId, name: "Группа Б" } };
    const view = render(editor());
    await loaded();
    fireEvent.click(cell());
    fireEvent.click(screen.getByRole("button", { name: "Присутствие — V" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить отметку" }));
    state.fetch.mockResolvedValueOnce(nextContext);
    view.rerender(editor(nextScope));
    await screen.findByText("Группа Б");
    await act(async () => { oldSave.resolve({ ...makeContext(), marks: [makeMark()] }); await oldSave.promise; });
    expect(screen.getByText("Группа Б")).toBeInTheDocument();
    expect(cell()).toHaveTextContent("—");
    expect(cell()).toBeEnabled();
    expect(screen.queryByText("Отметка сохранена и проверена в базе.")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(state.save).toHaveBeenCalledTimes(1);
  });

  it("allows read-only viewing and reload but no mark mutation", async () => {
    state.permissions = new Set(["documents.read"]);
    state.fetch.mockResolvedValue({ ...makeContext(), marks: [makeMark()] });
    render(editor());
    await loaded();
    expect(screen.getByText(/Журнал доступен только для просмотра/)).toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: /, колонка [1-4],/ })) expect(button).toBeDisabled();
    fireEvent.click(cell());
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Перезагрузить отметки" }));
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(2));
    expect(state.save).not.toHaveBeenCalled();
  });

  it("does not request journal data until permission checking completes, and rejects no-access users", async () => {
    state.permissionsLoading = true;
    const onClose = vi.fn();
    const view = render(editor(scope, onClose));
    expect(screen.getByText("Проверяем доступ к журналу…")).toBeInTheDocument();
    expect(state.fetch).not.toHaveBeenCalled();
    state.permissionsLoading = false;
    state.permissions.clear();
    view.rerender(editor(scope, onClose));
    expect(screen.getByRole("alert")).toHaveTextContent("Нет доступа к документам");
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "К списку журналов" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables cells without configured dates instead of inventing a date", async () => {
    const context = makeContext();
    context.group.training_dates = ["2026-09-01"];
    state.fetch.mockResolvedValue(context);
    render(editor());
    await loaded();
    expect(cell()).toBeEnabled();
    for (const slot of [2, 3, 4]) {
      expect(cell(firstName, slot)).toBeDisabled();
      expect(cell(firstName, slot)).toHaveAccessibleName(`${firstName}, колонка ${slot}, Дата не указана: не отмечено`);
      fireEvent.click(cell(firstName, slot));
    }
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
  });

  it.each([
    { changed: "course", overrides: { course_id: "previous-course" } },
    { changed: "date", overrides: { source_date: "2026-08-31" } },
  ])("retains a historical $changed mark as a warning but never prefills the current cell", async ({ overrides }) => {
    state.fetch.mockResolvedValue({ ...makeContext(), marks: [makeMark({ ...overrides, mark: "СТАРАЯ" })] });
    render(editor());
    await loaded();
    const summary = screen.getByText("Не используются в текущем Word-журнале: 1 отметок");
    expect(summary.closest("details")).toHaveTextContent("Старые записи сохранены; они не переносятся автоматически.");
    expect(summary.closest("details")).toHaveTextContent("СТАРАЯ");
    expect(cell()).toHaveTextContent("—");
    fireEvent.click(cell());
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(state.save).not.toHaveBeenCalled();
  });

  it("warns about extra dates while keeping exactly four columns and not changing saved dates", async () => {
    const context = makeContext();
    context.group.training_dates.push("2026-09-05");
    state.fetch.mockResolvedValue(context);
    render(editor());
    await loaded();
    expect(screen.getByRole("alert")).toHaveTextContent("У группы больше четырёх дат");
    expect(screen.getByRole("alert")).toHaveTextContent("Даты группы не изменены");
    expect(screen.getByRole("table").querySelectorAll("thead th")).toHaveLength(5);
    expect(screen.queryByText("Колонка 5")).not.toBeInTheDocument();
    expect(screen.queryByText("05.09.2026")).not.toBeInTheDocument();
    expect(context.group.training_dates).toHaveLength(5);
    expect(state.save).not.toHaveBeenCalled();
  });

  it("uses exact group-folder links for settings and documents, with real router navigation", async () => {
    const specialScope = { ...scope, groupId: "group / Б&=" };
    state.fetch.mockResolvedValue({ ...makeContext(), group: { ...makeContext().group, id: specialScope.groupId } });
    render(editor(specialScope));
    await loaded();
    const settingsPath = groupFolderPath(specialScope.groupId, null, { settings: true });
    const documentsPath = groupFolderPath(specialScope.groupId, "docs");
    expect(screen.getByRole("link", { name: "Настроить даты группы" })).toHaveAttribute("href", settingsPath);
    expect(screen.getByRole("link", { name: "Документы группы" })).toHaveAttribute("href", documentsPath);
    fireEvent.click(screen.getByRole("link", { name: "Настроить даты группы" }));
    expect(screen.getByTestId("location").textContent).toBe(settingsPath);
    fireEvent.click(screen.getByRole("link", { name: "Документы группы" }));
    expect(screen.getByTestId("location").textContent).toBe(documentsPath);
    expect(state.save).not.toHaveBeenCalled();
  });

  it("shows a failed load and retries only the read before enabling editing", async () => {
    state.fetch.mockRejectedValueOnce(new GroupClassJournalMarksError("Бета: обновление базы не установлено."));
    render(editor());
    expect(await screen.findByRole("alert")).toHaveTextContent("Бета: обновление базы не установлено.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Перезагрузить отметки" }));
    await loaded();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(cell()).toBeEnabled();
    expect(state.fetch).toHaveBeenNthCalledWith(2, scope);
    expect(state.save).not.toHaveBeenCalled();
  });
});
