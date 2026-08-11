import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  groupOrder: vi.fn(),
  groupInsert: vi.fn(),
  groupDelete: vi.fn(),
  groupDeleteIdEq: vi.fn(),
  groupDeleteOrganizationEq: vi.fn(),
  groupDeleteSelect: vi.fn(),
  registrationLinkInsert: vi.fn(),
  profileSelect: vi.fn(),
  profileUpdate: vi.fn(),
  profileUpdateEq: vi.fn(),
  profileUpdateIn: vi.fn(),
  profileUpdateSelect: vi.fn(),
  clipboardWriteText: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    warning: mocks.toastWarning,
    info: vi.fn(),
  },
}));

import { useCourseGroups, type StudentGroup } from "@/hooks/useCourseGroups";

const group: StudentGroup = {
  id: "group-1",
  name: "Group 1",
  color: null,
  organization_id: "org-1",
  course_id: "course-1",
  start_date: null,
  end_date: null,
  created_at: "2026-08-11T00:00:00.000Z",
};

describe("useCourseGroups", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.groupOrder.mockResolvedValue({ data: [], error: null });
    mocks.groupInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "group-new" }, error: null }),
      }),
    });
    mocks.groupDeleteSelect.mockResolvedValue({ data: [{ id: "group-new" }], error: null });
    mocks.groupDeleteOrganizationEq.mockReturnValue({ select: mocks.groupDeleteSelect });
    mocks.groupDeleteIdEq.mockReturnValue({ eq: mocks.groupDeleteOrganizationEq });
    mocks.groupDelete.mockReturnValue({ eq: mocks.groupDeleteIdEq });
    mocks.registrationLinkInsert.mockResolvedValue({ data: null, error: null });
    mocks.profileSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockResolvedValue({
          data: [
            { user_id: "student-1", full_name: "Student 1", email: null },
            { user_id: "student-2", full_name: "Student 2", email: null },
          ],
          error: null,
        }),
      }),
    });
    mocks.profileUpdateSelect.mockResolvedValue({ data: [], error: null });
    mocks.profileUpdateIn.mockReturnValue({ select: mocks.profileUpdateSelect });
    mocks.profileUpdateEq.mockReturnValue({ in: mocks.profileUpdateIn });
    mocks.profileUpdate.mockReturnValue({ eq: mocks.profileUpdateEq });

    mocks.from.mockImplementation((table: string) => {
      if (table === "student_groups") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ order: mocks.groupOrder }),
          }),
          insert: mocks.groupInsert,
          delete: mocks.groupDelete,
        };
      }
      if (table === "registration_links") {
        return { insert: mocks.registrationLinkInsert };
      }
      if (table === "profiles") {
        return {
          select: mocks.profileSelect,
          update: mocks.profileUpdate,
        };
      }
      throw new Error(`Unexpected Supabase table: ${table}`);
    });

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.clipboardWriteText.mockResolvedValue(undefined) },
    });
  });

  async function renderCourseGroups(onGroupingChanged = vi.fn(), onGroupDirectoryChanged = vi.fn()) {
    const hook = renderHook(() => useCourseGroups("course-1", "org-1", { onGroupingChanged, onGroupDirectoryChanged }));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return { ...hook, onGroupingChanged, onGroupDirectoryChanged };
  }

  async function openGroupAndSelectStudents(
    result: { current: ReturnType<typeof useCourseGroups> },
    studentIds: string[],
  ) {
    await act(async () => {
      await result.current.handleOpenAddStudents(group);
    });
    act(() => {
      studentIds.forEach((studentId) => result.current.toggleStudent(studentId));
    });
  }

  it("persists the course id when creating a group", async () => {
    const { result } = await renderCourseGroups();

    act(() => result.current.setNewGroupName("New group"));
    await act(async () => {
      await result.current.handleCreateGroup();
    });

    expect(mocks.groupInsert).toHaveBeenCalledWith(expect.objectContaining({
      name: "New group",
      organization_id: "org-1",
      course_id: "course-1",
    }));
  });

  it("does not report success when the registration link insert fails", async () => {
    const { result, onGroupDirectoryChanged } = await renderCourseGroups();
    mocks.registrationLinkInsert.mockResolvedValueOnce({
      data: null,
      error: { message: "registration link denied" },
    });

    act(() => {
      result.current.setShowCreateDialog(true);
      result.current.setNewGroupName("New group");
    });
    await act(async () => {
      await result.current.handleCreateGroup();
    });

    expect(mocks.clipboardWriteText).not.toHaveBeenCalled();
    expect(mocks.groupDeleteIdEq).toHaveBeenCalledWith("id", "group-new");
    expect(mocks.groupDeleteOrganizationEq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(mocks.groupDeleteSelect).toHaveBeenCalledWith("id");
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledOnce();
    expect(mocks.toastWarning).not.toHaveBeenCalled();
    expect(result.current.showCreateDialog).toBe(true);
    expect(result.current.newGroupName).toBe("New group");
    expect(onGroupDirectoryChanged).not.toHaveBeenCalled();
  });

  it("reports and refreshes a partial group when registration-link rollback fails", async () => {
    const { result, onGroupDirectoryChanged } = await renderCourseGroups();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.registrationLinkInsert.mockResolvedValueOnce({
      data: null,
      error: { message: "registration link denied" },
    });
    mocks.groupDeleteSelect.mockResolvedValueOnce({
      data: null,
      error: { message: "rollback denied" },
    });

    act(() => {
      result.current.setShowCreateDialog(true);
      result.current.setNewGroupName("New group");
    });
    await act(async () => {
      await result.current.handleCreateGroup();
    });

    expect(mocks.groupDeleteIdEq).toHaveBeenCalledWith("id", "group-new");
    expect(mocks.groupDeleteOrganizationEq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(mocks.groupDeleteSelect).toHaveBeenCalledWith("id");
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.toastWarning).toHaveBeenCalledOnce();
    expect(result.current.showCreateDialog).toBe(false);
    expect(result.current.newGroupName).toBe("");
    expect(mocks.groupOrder).toHaveBeenCalledTimes(2);
    expect(onGroupDirectoryChanged).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("treats a zero-row registration-link rollback as a partial group", async () => {
    const { result, onGroupDirectoryChanged } = await renderCourseGroups();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.registrationLinkInsert.mockResolvedValueOnce({
      data: null,
      error: { message: "registration link denied" },
    });
    mocks.groupDeleteSelect.mockResolvedValueOnce({ data: [], error: null });

    act(() => {
      result.current.setShowCreateDialog(true);
      result.current.setNewGroupName("New group");
    });
    await act(async () => {
      await result.current.handleCreateGroup();
    });

    expect(mocks.groupDeleteSelect).toHaveBeenCalledWith("id");
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.toastWarning).toHaveBeenCalledOnce();
    expect(result.current.showCreateDialog).toBe(false);
    expect(mocks.groupOrder).toHaveBeenCalledTimes(2);
    expect(onGroupDirectoryChanged).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("completes group creation when clipboard access is denied", async () => {
    const { result, onGroupDirectoryChanged } = await renderCourseGroups();
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.clipboardWriteText.mockRejectedValueOnce(new Error("clipboard denied"));

    act(() => {
      result.current.setShowCreateDialog(true);
      result.current.setNewGroupName("New group");
    });
    await act(async () => {
      await result.current.handleCreateGroup();
    });

    expect(mocks.toastSuccess).toHaveBeenCalledOnce();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(result.current.showCreateDialog).toBe(false);
    expect(result.current.newGroupName).toBe("");
    expect(mocks.groupOrder).toHaveBeenCalledTimes(2);
    expect(onGroupDirectoryChanged).toHaveBeenCalledOnce();
    expect(consoleWarn).toHaveBeenCalledOnce();
  });

  it("copies the link and reports success after a complete group creation", async () => {
    const { result, onGroupDirectoryChanged } = await renderCourseGroups();

    act(() => {
      result.current.setShowCreateDialog(true);
      result.current.setNewGroupName("New group");
    });
    await act(async () => {
      await result.current.handleCreateGroup();
    });

    expect(mocks.clipboardWriteText).toHaveBeenCalledWith(expect.stringMatching(/\/join\/.+/));
    expect(mocks.toastSuccess).toHaveBeenCalledOnce();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(result.current.showCreateDialog).toBe(false);
    expect(mocks.groupOrder).toHaveBeenCalledTimes(2);
    expect(onGroupDirectoryChanged).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open when Supabase rejects the profile update", async () => {
    const { result, onGroupingChanged } = await renderCourseGroups();
    mocks.profileUpdateSelect.mockResolvedValue({ data: null, error: { message: "denied" } });
    await openGroupAndSelectStudents(result, ["student-1"]);

    await act(async () => {
      await result.current.handleAddStudentsToGroup();
    });

    expect(mocks.profileUpdateEq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(mocks.profileUpdateIn).toHaveBeenCalledWith("user_id", ["student-1"]);
    expect(mocks.profileUpdateSelect).toHaveBeenCalledWith("user_id");
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalled();
    expect(result.current.showAddStudentsDialog).toBe(true);
    expect(onGroupingChanged).not.toHaveBeenCalled();
  });

  it("keeps the dialog open when fewer profiles were updated than selected", async () => {
    const { result, onGroupingChanged } = await renderCourseGroups();
    mocks.profileUpdateSelect.mockResolvedValue({
      data: [{ user_id: "student-1" }],
      error: null,
    });
    await openGroupAndSelectStudents(result, ["student-1", "student-2"]);

    await act(async () => {
      await result.current.handleAddStudentsToGroup();
    });

    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalled();
    expect(result.current.showAddStudentsDialog).toBe(true);
    expect(onGroupingChanged).not.toHaveBeenCalled();
  });

  it("reports success only after every selected profile is returned", async () => {
    const { result, onGroupingChanged } = await renderCourseGroups();
    mocks.profileUpdateSelect.mockResolvedValue({
      data: [{ user_id: "student-1" }, { user_id: "student-2" }],
      error: null,
    });
    await openGroupAndSelectStudents(result, ["student-1", "student-2"]);

    await act(async () => {
      await result.current.handleAddStudentsToGroup();
    });

    expect(mocks.toastSuccess).toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(result.current.showAddStudentsDialog).toBe(false);
    expect(onGroupingChanged).toHaveBeenCalledOnce();
  });
});
