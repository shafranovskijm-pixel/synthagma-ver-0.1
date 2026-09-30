import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useStudentDetailCardLogic } from "@/hooks/useStudentDetailCard";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={["/organization?tab=student-details&studentId=old-student"]}>{children}</MemoryRouter>
);

type Response = { data: any; error: any };
const state = vi.hoisted(() => ({
  profiles: new Map<string, Record<string, unknown>>(),
  writes: [] as Array<{ values: Record<string, unknown>; filters: Record<string, unknown> }>,
  writeResponse: null as Promise<Response> | null,
  profileError: null as unknown,
  canWrite: true,
  permissionsLoading: false,
}));
vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({ can: () => state.canWrite, loading: state.permissionsLoading }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: null, error: null }),
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      let update: Record<string, unknown> | null = null;
      const response = () => {
        if (update) {
          state.writes.push({ values: update, filters: { ...filters } });
          if (state.writeResponse) return state.writeResponse;
          const profile = state.profiles.get(String(filters.user_id));
          if (!profile || profile.organization_id !== filters.organization_id) {
            return Promise.resolve({ data: null, error: null });
          }
          Object.assign(profile, update);
          return Promise.resolve({ data: { ...profile }, error: null });
        }
        if (table === "profiles") return Promise.resolve({
          data: state.profiles.get(String(filters.user_id)) || null,
          error: state.profileError,
        });
        return Promise.resolve({ data: table === "student_login_tokens" ? null : [], error: null });
      };
      const builder: any = {
        select: () => builder,
        update: (values: Record<string, unknown>) => { update = values; return builder; },
        eq: (field: string, value: unknown) => { filters[field] = value; return builder; },
        order: () => builder,
        is: () => builder,
        limit: () => builder,
        maybeSingle: response,
        single: response,
        then: (resolve: (value: Response) => unknown, reject: (reason: unknown) => unknown) => response().then(resolve, reject),
      };
      return builder;
    },
  },
}));

const student = (id: string) => ({ id, user_id: id, name: `Student ${id}`, email: `${id}@example.invalid` });
const props = (id = "old-student", organizationId = "org-1") => ({
  isOpen: true, student: student(id), organizationId,
});
const profile = (id: string, department: string | null) => ({
  user_id: id, organization_id: "org-1", department,
  phone: "+70000000000", job_position: "Инженер", full_name: "Старый ученик",
  student_group_id: "existing-group", generated_password: "unchanged",
});

describe("existing student's department", () => {
  beforeEach(() => {
    state.profiles.clear();
    state.profiles.set("old-student", profile("old-student", null));
    state.profiles.set("student-b", profile("student-b", "Подразделение B"));
    state.writes.length = 0;
    state.writeResponse = null;
    state.profileError = null;
    state.canWrite = true;
    state.permissionsLoading = false;
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("assigns, changes and clears a legacy empty department without rewriting other data", async () => {
    const updated = vi.fn();
    const before = { ...state.profiles.get("old-student")! };
    const { result } = renderHook(() => useStudentDetailCardLogic({ ...props(), onStudentUpdated: updated }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.department).toBe("");
    for (const [input, expected] of [["  Карьер № 1  ", "Карьер № 1"], ["Участок 2", "Участок 2"], ["   ", null]] as const) {
      await act(async () => { expect(await result.current.saveDepartment(input)).toBe(true); });
      expect(result.current.department).toBe(expected || "");
      expect(state.profiles.get("old-student")).toEqual({ ...before, department: expected });
      expect(state.writes.at(-1)).toEqual({
        values: { department: expected }, filters: { user_id: "old-student", organization_id: "org-1" },
      });
    }
    expect(updated).toHaveBeenCalledTimes(3);
  });

  it.each(["x".repeat(201), "Участок\n2"])("rejects invalid department without a write", async (value) => {
    const { result } = renderHook(() => useStudentDetailCardLogic(props()), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { expect(await result.current.saveDepartment(value)).toBe(false); });
    expect(state.writes).toHaveLength(0);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { message: "permission denied" } },
    { data: { user_id: "old-student", organization_id: "other-org", department: "Участок" }, error: null },
    { data: { user_id: "other-student", organization_id: "org-1", department: "Участок" }, error: null },
    { data: { user_id: "old-student", organization_id: "org-1", department: "Old value" }, error: null },
  ])("does not report a successful save without the exact confirmed row %#", async (response) => {
    state.writeResponse = Promise.resolve(response);
    const updated = vi.fn();
    const { result } = renderHook(() => useStudentDetailCardLogic({ ...props(), onStudentUpdated: updated }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { expect(await result.current.saveDepartment("Участок")).toBe(false); });
    expect(result.current.department).toBe("");
    expect(result.current.savingDepartment).toBe(false);
    expect(updated).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it.each(["missing-org", "load-error", "readonly", "permissions-loading"])("refuses save when %s", async (mode) => {
    if (mode === "load-error") state.profileError = { message: "offline" };
    if (mode === "readonly") state.canWrite = false;
    if (mode === "permissions-loading") state.permissionsLoading = true;
    const { result } = renderHook(() => useStudentDetailCardLogic(props("old-student", mode === "missing-org" ? "" : "org-1")), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { expect(await result.current.saveDepartment("Участок")).toBe(false); });
    expect(state.writes).toHaveLength(0);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not let A's pending save overwrite B or report success in B's card", async () => {
    let resolve!: (value: Response) => void;
    state.writeResponse = new Promise(done => { resolve = done; });
    const updated = vi.fn();
    const { result, rerender } = renderHook(({ id }) => useStudentDetailCardLogic({ ...props(id), onStudentUpdated: updated }), {
      initialProps: { id: "old-student" },
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.saveDepartment("Участок A"); });
    expect(result.current.savingDepartment).toBe(true);
    rerender({ id: "student-b" });
    await waitFor(() => expect(result.current.department).toBe("Подразделение B"));
    await act(async () => {
      resolve({ data: { user_id: "old-student", organization_id: "org-1", department: "Участок A" }, error: null });
      expect(await pending).toBe(false);
    });
    expect(result.current.department).toBe("Подразделение B");
    expect(result.current.savingDepartment).toBe(false);
    expect(updated).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("rejects a stale editor callback after switching to another student", async () => {
    const { result, rerender } = renderHook(({ id }) => useStudentDetailCardLogic(props(id)), {
      initialProps: { id: "old-student" },
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const staleSave = result.current.saveDepartment;
    rerender({ id: "student-b" });
    await waitFor(() => expect(result.current.department).toBe("Подразделение B"));
    await act(async () => { expect(await staleSave("Чужое подразделение")).toBe(false); });
    expect(state.writes).toHaveLength(0);
  });

  it("restores the previous student section with Back and Forward through real router history", async () => {
    const { result } = renderHook(() => ({
      card: useStudentDetailCardLogic(props()),
      navigate: useNavigate(),
      location: useLocation(),
    }), { wrapper });
    await waitFor(() => expect(result.current.card.isLoading).toBe(false));
    expect(result.current.card.activeTab).toBe("profile");

    act(() => result.current.card.setActiveTab("courses"));
    expect(result.current.card.activeTab).toBe("courses");
    expect(new URLSearchParams(result.current.location.search).get("studentSection")).toBe("courses");
    act(() => result.current.card.setActiveTab("documents"));
    expect(result.current.card.activeTab).toBe("documents");

    act(() => result.current.navigate(-1));
    expect(result.current.card.activeTab).toBe("courses");
    act(() => result.current.navigate(-1));
    expect(result.current.card.activeTab).toBe("profile");
    expect(new URLSearchParams(result.current.location.search).has("studentSection")).toBe(false);

    act(() => result.current.navigate(1));
    expect(result.current.card.activeTab).toBe("courses");
    act(() => result.current.navigate(1));
    expect(result.current.card.activeTab).toBe("documents");
    expect(result.current.location.pathname).toBe("/organization");
    expect(new URLSearchParams(result.current.location.search).get("studentId")).toBe("old-student");
    expect(state.writes).toHaveLength(0);
  });
});
