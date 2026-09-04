import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), success: vi.fn(), from: vi.fn(), rpc: vi.fn(), permissions: new Set<string>() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (...args: unknown[]) => state.from(...args), rpc: (...args: unknown[]) => state.rpc(...args) } }));
vi.mock("sonner", () => ({ toast: { success: state.success } }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({ loading: false, can: (permission: string) => state.permissions.has(permission) }) }));
vi.mock("@/lib/groups/groupDocumentSchedule", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/groups/groupDocumentSchedule")>()),
  fetchGroupDocumentSchedule: (...args: unknown[]) => state.fetch(...args),
  saveGroupDocumentSchedule: (...args: unknown[]) => state.save(...args),
}));

import { GroupDocumentScheduleEditor } from "@/components/organization/GroupDocumentScheduleEditor";
import { GroupSettingsDialog } from "@/components/organization/GroupSettingsDialog";
import { GroupDocumentScheduleError, type GroupDocumentScheduleContext } from "@/lib/groups/groupDocumentSchedule";
import { GORELTECH_INN, GORELTECH_ORGANIZATION_ID, type GroupDocumentOrganizationIdentity } from "@/lib/group-docs/clientProfile";

const props = { organizationId: GORELTECH_ORGANIZATION_ID, groupId: "group-1" };
const exactOrganization = { id: GORELTECH_ORGANIZATION_ID, name: 'ООО «ИЦ «ГОРЭЛТЕХ»', inn: GORELTECH_INN };
type OrganizationResult = { data: GroupDocumentOrganizationIdentity | null; error: unknown };
const context: GroupDocumentScheduleContext = {
  group: { id: "group-1", organization_id: props.organizationId, course_id: "course-1", start_date: "2026-09-01", end_date: "2026-09-30" },
  schedule: null,
};
const saved: GroupDocumentScheduleContext = { ...context, schedule: {
  group_id: "group-1", organization_id: props.organizationId, course_id: "course-1", revision: 1,
  slots: [{ slot: 1, date: "", time_from: "", time_to: "", topic: "Тема" }],
  updated_at: "2026-09-04T02:00:00Z", updated_by: "operator-1",
} };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

function mockParentGroup(readOrganization = vi.fn<() => Promise<OrganizationResult>>().mockResolvedValue({ data: exactOrganization, error: null })) {
  const parentGroup = {
    ...context.group, name: "Учебная группа", color: null, group_number: null, program_title: null,
    program_hours: null, program_form: null, default_price: null, training_address: null,
    schedule_text: null, instructor_name: null, training_dates: [], max_seats: null, curator_id: null,
    strict_order: false, limit_access_time: false, schedule_access: false, block_resubmit: false,
    show_locked_lessons: false, enable_channel: false, enable_group_chat: false, block_student_dialogs: false,
  };
  const deleteGroup = vi.fn();
  const organizationFilters: Array<[string, string]> = [];
  state.from.mockImplementation((table: string) => {
    const query = { select: () => query, eq: (field: string, value: string) => {
      if (table === "organizations") organizationFilters.push([field, value]);
      return query;
    }, delete: deleteGroup,
      maybeSingle: readOrganization,
      single: async () => ({ data: parentGroup, error: null }),
      order: async () => ({ data: table === "courses" ? [] : [parentGroup], error: null }) };
    return query;
  });
  return { deleteGroup, readOrganization, organizationFilters };
}

describe("GroupDocumentScheduleEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.fetch.mockReset().mockResolvedValue(context);
    state.save.mockReset().mockResolvedValue(saved);
    state.permissions = new Set(["documents.read", "documents.write"]);
  });

  it("loads four fixed blocks and explains independent saving without changing the parent", async () => {
    const onDirtyChange = vi.fn();
    render(<GroupDocumentScheduleEditor {...props} onDirtyChange={onDirtyChange} />);
    await screen.findByLabelText("Тема блока 1");
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    expect(screen.queryByLabelText("Тема блока 5")).not.toBeInTheDocument();
    expect(screen.getByText(/Это не четыре дня/)).toBeInTheDocument();
    expect(screen.getByText(/сначала сохраните настройки группы/)).toBeInTheDocument();
    expect(state.fetch).toHaveBeenCalledWith(props);
    expect(screen.getByRole("button", { name: "Сохранить расписание" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Тема блока 1"), { target: { value: "Тема" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить расписание" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledTimes(1));
    expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ ...props, context, slots: expect.arrayContaining([expect.objectContaining({ slot: 1, topic: "Тема" })]) }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByLabelText("Тема блока 1")).toHaveValue("Тема");
    expect(screen.getByRole("button", { name: "Сохранить расписание" })).toBeDisabled();
  });

  it("locks duplicate clicks synchronously while saving and read-back are pending", async () => {
    const pending = deferred<GroupDocumentScheduleContext>();
    state.save.mockReturnValue(pending.promise);
    render(<GroupDocumentScheduleEditor {...props} />);
    fireEvent.change(await screen.findByLabelText("Тема блока 1"), { target: { value: "Тема" } });
    const button = screen.getByRole("button", { name: "Сохранить расписание" });
    fireEvent.click(button); fireEvent.click(button);
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Тема блока 1")).toBeDisabled();
    expect(state.success).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(saved); await pending.promise; });
    expect(state.success).toHaveBeenCalledTimes(1);
  });

  it("requires reload after uncertain save, retains the draft, and does not retry writes", async () => {
    state.save.mockRejectedValueOnce(new GroupDocumentScheduleError("Сохранение могло произойти. Обновите данные.", true));
    render(<GroupDocumentScheduleEditor {...props} />);
    fireEvent.change(await screen.findByLabelText("Тема блока 1"), { target: { value: "Тема" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить расписание" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Сохранение могло произойти");
    expect(screen.getByLabelText("Тема блока 1")).toHaveValue("Тема");
    expect(screen.getByRole("button", { name: "Сохранить расписание" })).toBeDisabled();
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(state.success).not.toHaveBeenCalled();
    state.fetch.mockResolvedValueOnce(saved);
    fireEvent.click(screen.getByRole("button", { name: "Обновить расписание" }));
    expect(screen.getByText(/Обновление заменит несохранённое расписание/)).toBeInTheDocument();
    expect(state.fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Загрузить вместо изменений" }));
    await waitFor(() => expect(screen.queryByText("Сохранение могло произойти. Обновите данные.")).not.toBeInTheDocument());
    expect(state.fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Тема блока 1")).toHaveValue("Тема");
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(state.success).not.toHaveBeenCalled();
  });

  it("shows unavailable backend honestly and retries only the read", async () => {
    state.fetch.mockRejectedValueOnce(new GroupDocumentScheduleError("Обновление базы не установлено."));
    render(<GroupDocumentScheduleEditor {...props} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Обновление базы не установлено");
    expect(screen.queryByLabelText("Тема блока 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Обновить расписание" }));
    await screen.findByLabelText("Тема блока 1");
    expect(state.fetch).toHaveBeenCalledTimes(2);
    expect(state.save).not.toHaveBeenCalled();
  });

  it("requires explicit review before adopting a schedule associated with another course", async () => {
    state.fetch.mockResolvedValueOnce({ ...saved, schedule: { ...saved.schedule!, course_id: "old-course" } });
    render(<GroupDocumentScheduleEditor {...props} />);
    expect(await screen.findByText(/Оно не будет автоматически перенесено/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Тема блока 1"), { target: { value: "Проверенная тема" } });
    expect(screen.getByRole("button", { name: "Сохранить расписание" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить расписание" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ reviewedCourseChange: true })));
  });

  it("clears all four fields and restores saved values on cancel without a write", async () => {
    state.fetch.mockResolvedValueOnce(saved);
    render(<GroupDocumentScheduleEditor {...props} />);
    await screen.findByDisplayValue("Тема");
    fireEvent.click(screen.getByRole("button", { name: "Очистить блок 1" }));
    expect(screen.getByLabelText("Тема блока 1")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Отменить изменения расписания" }));
    expect(screen.getByLabelText("Тема блока 1")).toHaveValue("Тема");
    expect(state.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Очистить блок 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить расписание" }));
    expect(state.save.mock.calls[0][0].slots.every((entry: { topic: string }) => entry.topic === "")).toBe(true);
  });

  it("ignores late reads when a different group replaces the editor", async () => {
    const pending = deferred<GroupDocumentScheduleContext>();
    state.fetch.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ ...context, group: { ...context.group, id: "group-2" } });
    const view = render(<GroupDocumentScheduleEditor {...props} />);
    view.rerender(<GroupDocumentScheduleEditor {...props} groupId="group-2" />);
    await screen.findByLabelText("Тема блока 1");
    await act(async () => { pending.resolve(saved); await pending.promise; });
    expect(screen.getByLabelText("Тема блока 1")).toHaveValue("");
    expect(state.success).not.toHaveBeenCalled();
  });

  it.each(["group", "unmount"])("does not deliver a late save to a new card or callbacks after %s", async target => {
    const pending = deferred<GroupDocumentScheduleContext>();
    state.save.mockReturnValueOnce(pending.promise);
    const onDirtyChange = vi.fn();
    const view = render(<GroupDocumentScheduleEditor {...props} onDirtyChange={onDirtyChange} />);
    fireEvent.change(await screen.findByLabelText("Тема блока 1"), { target: { value: "Тема" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить расписание" }));
    if (target === "group") {
      state.fetch.mockResolvedValueOnce({ ...context, group: { ...context.group, id: "group-2" } });
      view.rerender(<GroupDocumentScheduleEditor {...props} groupId="group-2" onDirtyChange={onDirtyChange} />);
      await screen.findByLabelText("Тема блока 1");
    } else view.unmount();
    onDirtyChange.mockClear();
    await act(async () => { pending.resolve(saved); await pending.promise; });
    expect(state.success).not.toHaveBeenCalled();
    expect(onDirtyChange).not.toHaveBeenCalled();
    if (target === "group") expect(screen.getByLabelText("Тема блока 1")).toHaveValue("");
  });

  it("does not read without document permissions and allows canonical write-only access", async () => {
    state.permissions.clear();
    const view = render(<GroupDocumentScheduleEditor {...props} />);
    expect(state.fetch).not.toHaveBeenCalled();
    state.permissions.add("documents.write");
    view.rerender(<GroupDocumentScheduleEditor {...props} />);
    await screen.findByLabelText("Тема блока 1");
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the schedule draft across parent tabs, blocks general save, and confirms closing", async () => {
    mockParentGroup();
    const onOpenChange = vi.fn();
    render(<GroupSettingsDialog {...props} open onOpenChange={onOpenChange} />);
    fireEvent.change(await screen.findByLabelText("Тема блока 1"), { target: { value: "Не терять эту тему" } });
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Обучение" }));
    expect(screen.queryByRole("textbox", { name: "Тема блока 1" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Общие" }));
    expect(screen.getByLabelText("Тема блока 1")).toHaveValue("Не терять эту тему");
    expect(state.fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Вернуться к расписанию" }));
    expect(screen.getByLabelText("Тема блока 1")).toHaveValue("Не терять эту тему");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(await screen.findByRole("button", { name: "Закрыть без несохранённых изменений" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("does not offer saved schedules to another organization even with the same name and INN", async () => {
    const { readOrganization } = mockParentGroup();
    render(<GroupSettingsDialog {...props} organizationId="another-organization" open onOpenChange={vi.fn()} />);
    await screen.findByDisplayValue("Учебная группа");
    expect(screen.queryByLabelText("Расписание для документов группы")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
    expect(readOrganization).not.toHaveBeenCalled();
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });

  it.each([
    ["different INN", { data: { ...exactOrganization, inn: "0000000000" }, error: null }],
    ["different name", { data: { ...exactOrganization, name: "Другая организация" }, error: null }],
    ["foreign returned ID", { data: { ...exactOrganization, id: "another-organization" }, error: null }],
    ["missing identity", { data: null, error: null }],
    ["failed lookup", { data: exactOrganization, error: { code: "42501" } }],
  ] satisfies Array<[string, OrganizationResult]>)("hides the optional editor on %s without disabling general settings", async (_name, result) => {
    const lookup = vi.fn<() => Promise<OrganizationResult>>().mockResolvedValue(result);
    mockParentGroup(lookup);
    render(<GroupSettingsDialog {...props} open onOpenChange={vi.fn()} />);
    await screen.findByDisplayValue("Учебная группа");
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("Расписание для документов группы")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });

  it("waits for the verified exact client profile before reading schedule facts", async () => {
    const pending = deferred<OrganizationResult>();
    const { organizationFilters } = mockParentGroup(vi.fn(() => pending.promise));
    render(<GroupSettingsDialog {...props} open onOpenChange={vi.fn()} />);
    await screen.findByDisplayValue("Учебная группа");
    expect(state.fetch).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Расписание для документов группы")).not.toBeInTheDocument();
    expect(organizationFilters).toEqual([["id", GORELTECH_ORGANIZATION_ID]]);
    await act(async () => { pending.resolve({ data: exactOrganization, error: null }); await pending.promise; });
    await screen.findByLabelText("Тема блока 1");
    expect(state.fetch).toHaveBeenCalledWith(props);
  });

  it("ignores an old exact-client identity response after switching to another organization", async () => {
    const pending = deferred<OrganizationResult>();
    mockParentGroup(vi.fn(() => pending.promise));
    const view = render(<GroupSettingsDialog {...props} open onOpenChange={vi.fn()} />);
    await screen.findByDisplayValue("Учебная группа");
    view.rerender(<GroupSettingsDialog {...props} organizationId="another-organization" open onOpenChange={vi.fn()} />);
    await act(async () => { pending.resolve({ data: exactOrganization, error: null }); await pending.promise; });
    expect(screen.queryByLabelText("Расписание для документов группы")).not.toBeInTheDocument();
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("disables deletion while schedule save/read-back is pending and reenables it after completion", async () => {
    const { deleteGroup } = mockParentGroup();
    const pending = deferred<GroupDocumentScheduleContext>();
    state.save.mockReturnValueOnce(pending.promise);
    const onOpenChange = vi.fn();
    render(<GroupSettingsDialog {...props} open onOpenChange={onOpenChange} />);
    fireEvent.change(await screen.findByLabelText("Тема блока 1"), { target: { value: "Тема" } });
    expect(screen.getByRole("button", { name: "Удалить группу" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить расписание" }));
    const deleteButton = screen.getByRole("button", { name: "Удалить группу" });
    expect(deleteButton).toBeDisabled();
    fireEvent.click(deleteButton);
    expect(deleteGroup).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(saved); await pending.promise; });
    expect(screen.getByRole("button", { name: "Удалить группу" })).toBeEnabled();
    expect(deleteGroup).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("warns about losing unsaved schedule changes before deleting and preserves the draft on cancel", async () => {
    const { deleteGroup } = mockParentGroup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      const onOpenChange = vi.fn();
      render(<GroupSettingsDialog {...props} open onOpenChange={onOpenChange} />);
      fireEvent.change(await screen.findByLabelText("Тема блока 1"), { target: { value: "Не терять расписание" } });
      fireEvent.click(screen.getByRole("button", { name: "Удалить группу" }));
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Несохранённые изменения расписания будут потеряны"));
      expect(deleteGroup).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Тема блока 1")).toHaveValue("Не терять расписание");
      expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    } finally { confirm.mockRestore(); }
  });
});
