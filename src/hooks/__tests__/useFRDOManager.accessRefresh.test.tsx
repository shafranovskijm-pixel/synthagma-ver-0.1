import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { org, pupil, enrollment, course } from "@/lib/educationIssuance/__tests__/fixtures";

const mock = vi.hoisted(() => ({
  allowed: true, loading: false, from: vi.fn(), rpc: vi.fn(), error: vi.fn(), roles: vi.fn(),
}));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({
  organizationId: "00000000-0000-4000-8000-000000000002", loading: mock.loading, error: null,
  can: (permission: string) => mock.allowed && permission !== "documents.issue",
}) }));
vi.mock("@/utils/fetchUserRolesBatched", () => ({ fetchUserRolesBatched: mock.roles }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mock.from, rpc: mock.rpc } }));
vi.mock("sonner", () => ({ toast: { error: mock.error, success: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/organization/FRDOExportDialog", () => ({ FRDOExportDialog: () => null }));
vi.mock("@/components/organization/FrdoFileSanitizerDialog", () => ({ FrdoFileSanitizerDialog: () => null }));
vi.mock("@/components/organization/education-issuance/ExistingExportDialog", () => ({ ExistingIssuanceExportDialog: () => null }));
vi.mock("@/components/organization/frdo-packets/Workbench", () => ({ FrdoPacketWorkbenchDialog: () => null }));
vi.mock("@/components/organization/GroupContextBanner", () => ({ GroupContextBanner: () => null }));

// Use the real epoch and issuance scope. A changed snapshot must notify React itself.
import { captureOfflineAuthRevision, observeOfflineAccess, setOfflineAuthActor } from "@/utils/courseCache";
import { useFRDOManager } from "../useFRDOManager";
import { FRDOManager } from "@/components/organization/FRDOManager";
const actor = "00000000-0000-4000-8000-000000000001";
type Reply = { data: any; error: null | { code?: string; message: string } };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const profile = (name: string) => ({ user_id: pupil, full_name: name, email: "", student_group_id: null });
let profileReads: Promise<Reply>[];
function chain(reply: Promise<Reply>): any {
  const value: any = new Proxy({}, { get: (_, key) => key === "then" ? reply.then.bind(reply) : () => value });
  return value;
}
const intro = "Автоматизируйте отчётность в ФИС ФРДО";
beforeEach(() => {
  vi.clearAllMocks(); mock.allowed = true; mock.loading = false; mock.roles.mockResolvedValue([]);
  setOfflineAuthActor(null); setOfflineAuthActor(actor); observeOfflineAccess(actor, "server-role:admin");
  profileReads = [Promise.resolve({ data: [profile("Первый ученик")], error: null })];
  mock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      const next = profileReads.shift();
      if (!next) throw new Error("Unexpected additional profiles read");
      return chain(next);
    }
    return chain(Promise.resolve({ error: null, data: table === "enrollments" ? [{
      id: enrollment, user_id: pupil, course_id: course, started_at: "2026-10-01", completed_at: null,
      time_spent: 0, courses: { id: course, title: "Текущий курс", duration: "16 часов" },
    }] : [] }));
  });
});
afterEach(() => { cleanup(); setOfflineAuthActor(null); });
const profilesReadCount = () => mock.from.mock.calls.filter(([table]) => table === "profiles").length;

describe("FRDO access revision refresh and honest load states", () => {
  it("automatically reloads on a revision-only change and masks old rows until the new authorized read", async () => {
    const hook = renderHook(() => useFRDOManager(org));
    await waitFor(() => expect(hook.result.current.students[0]?.name).toBe("Первый ученик"));
    const next = deferred<Reply>(); profileReads.push(next.promise);
    act(() => observeOfflineAccess(actor, "role-hint:organization"));
    // No manual rerender, focus, or timer: the authoritative epoch itself wakes this reader.
    await waitFor(() => expect(profilesReadCount()).toBe(2));
    expect(hook.result.current.students).toEqual([]);
    expect(hook.result.current.courses).toEqual([]);
    expect(hook.result.current.isLoading).toBe(true);
    await act(async () => next.resolve({ data: [profile("Подтверждённый ученик")], error: null }));
    await waitFor(() => expect(hook.result.current.students[0]?.name).toBe("Подтверждённый ученик"));
    expect(hook.result.current.isLoading).toBe(false);
    expect(hook.result.current.loadError).toBeNull();
  });

  it("rejects a previous epoch's late response after the current read has already completed", async () => {
    const old = deferred<Reply>(), current = deferred<Reply>(); profileReads = [old.promise, current.promise];
    const hook = renderHook(() => useFRDOManager(org));
    await waitFor(() => expect(profilesReadCount()).toBe(1));
    act(() => observeOfflineAccess(actor, "role-hint:organization"));
    await waitFor(() => expect(profilesReadCount()).toBe(2));
    await act(async () => current.resolve({ data: [profile("Новая область")], error: null }));
    await waitFor(() => expect(hook.result.current.students[0]?.name).toBe("Новая область"));
    await act(async () => old.resolve({ data: [profile("Старая область")], error: null }));
    expect(hook.result.current.students[0]?.name).toBe("Новая область");
    expect(hook.result.current.isLoading).toBe(false);
    expect(mock.error).not.toHaveBeenCalled();
  });

  it("does not invalidate or reload for an unchanged actor and confirmed role fingerprint", async () => {
    const hook = renderHook(() => useFRDOManager(org));
    await waitFor(() => expect(hook.result.current.students).toHaveLength(1));
    const revision = captureOfflineAuthRevision();
    act(() => { setOfflineAuthActor(actor); observeOfflineAccess(actor, "server-role:admin"); });
    expect(captureOfflineAuthRevision()).toBe(revision);
    expect(profilesReadCount()).toBe(1);
    expect(hook.result.current.students).toHaveLength(1);
    expect(hook.result.current.isLoading).toBe(false);
  });

  it("closes access immediately on permission revocation and rejects the pending old read", async () => {
    const hook = renderHook(() => useFRDOManager(org));
    await waitFor(() => expect(hook.result.current.students).toHaveLength(1));
    const old = deferred<Reply>(); profileReads.push(old.promise);
    let pending!: Promise<void>;
    act(() => { pending = hook.result.current.refresh(); });
    mock.allowed = false; hook.rerender();
    expect(hook.result.current.canExport).toBe(false);
    expect(hook.result.current.students).toEqual([]);
    expect(hook.result.current.loadError).toMatch(/Доступ/);
    await act(async () => { old.resolve({ data: [profile("Отозванные данные")], error: null }); await pending; });
    await act(async () => hook.result.current.handleBulkExport("dpo"));
    expect(hook.result.current.students).toEqual([]);
    expect(hook.result.current.existingExport).toBeNull();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("shows loading rather than the empty-organization introduction until an authorized empty response", async () => {
    const response = deferred<Reply>(); profileReads = [response.promise];
    render(<FRDOManager organizationId={org} />);
    expect(screen.getByRole("status", { name: "Загрузка сведений ФРДО" })).toBeTruthy();
    expect(screen.queryByText(intro)).toBeNull();
    await act(async () => response.resolve({ data: [], error: null }));
    await waitFor(() => expect(screen.getByText(intro)).toBeTruthy());
    expect(screen.queryByRole("status", { name: "Загрузка сведений ФРДО" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a closed error instead of empty data and recovers only through a fresh authorized read", async () => {
    profileReads = [Promise.resolve({ data: null, error: { code: "42501", message: "permission denied" } })];
    render(<FRDOManager organizationId={org} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText(intro)).toBeNull();
    profileReads.push(Promise.resolve({ data: [profile("После проверки доступа")], error: null }));
    fireEvent.click(screen.getByRole("button", { name: "Обновить данные" }));
    await waitFor(() => expect(screen.getByText("После проверки доступа")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("confirms an empty learner set after successfully excluding organization accounts", async () => {
    mock.roles.mockResolvedValue([{ user_id: pupil }]);
    const hook = renderHook(() => useFRDOManager(org));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(hook.result.current.students).toEqual([]);
    expect(hook.result.current.loadError).toBeNull();
    expect(profilesReadCount()).toBe(1);
  });

  it("clears previous course and enrollment rows after a fresh confirmed-empty read", async () => {
    const hook = renderHook(() => useFRDOManager(org));
    await waitFor(() => expect(hook.result.current.students).toHaveLength(1));
    expect(hook.result.current.courses).toHaveLength(1);
    profileReads.push(Promise.resolve({ data: [], error: null }));
    await act(async () => hook.result.current.refresh());
    expect(hook.result.current.isLoading).toBe(false);
    expect(hook.result.current.students).toEqual([]);
    expect(hook.result.current.courses).toEqual([]);
    expect(hook.result.current.enrollmentsMap.size).toBe(0);
    expect(hook.result.current.loadError).toBeNull();
  });

  it("closes a capture failure without an unhandled load or any personal-data query", async () => {
    setOfflineAuthActor(null);
    const hook = renderHook(() => useFRDOManager(org));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(hook.result.current.loadError).toMatch(/Не удалось подтвердить/);
    expect(hook.result.current.students).toEqual([]);
    expect(mock.from).not.toHaveBeenCalled();
  });
});
