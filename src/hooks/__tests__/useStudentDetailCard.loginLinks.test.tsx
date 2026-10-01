import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { useStudentDetailCardLogic } from "@/hooks/useStudentDetailCard";

const state = vi.hoisted(() => ({ invoke: vi.fn(), clipboard: vi.fn(), canWrite: true }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: (...args: any[]) => state.invoke(...args) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({ can: () => state.canWrite, loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async () => ({ data: null, error: null }),
  from: (table: string) => {
    if (table === "student_login_tokens") throw new Error("Direct token table access is forbidden in the UI");
    const response = async () => ({ data: table === "profiles" ? { department: null } : [], error: null });
    const builder: any = { select: () => builder, eq: () => builder, is: () => builder, order: () => builder,
      limit: () => builder, maybeSingle: response, then: (resolve: any, reject: any) => response().then(resolve, reject) };
    return builder;
  },
} }));
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
const props = (id = "student-a") => ({ isOpen: true, organizationId: "org-1",
  student: { id, user_id: id, name: id, email: `${id}@example.invalid`, login: id } });
const response = (body: any, token: string | null) => ({ data: { token, user_id: body.user_id, organization_id: body.organization_id }, error: null });
const actions = () => state.invoke.mock.calls.map(([, options]) => options.body.action);
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

describe("student login links", () => {
  beforeEach(() => {
    state.canWrite = true;
    state.invoke.mockReset().mockImplementation(async (_name, { body }) => response(body, body.action === "get" ? null : "created-token"));
    state.clipboard.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: state.clipboard } });
    vi.mocked(toast.error).mockClear(); vi.mocked(toast.success).mockClear();
  });
  it("creates through the dedicated endpoint and never invokes email sending", async () => {
    const { result } = renderHook(() => useStudentDetailCardLogic(props()), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.copyAutoLoginLink(); });
    expect(actions()).toEqual(["get", "create"]);
    expect(state.invoke.mock.calls.every(([name]) => name === "student-login-link")).toBe(true);
    expect(state.clipboard).toHaveBeenCalledOnce();
    expect(state.clipboard).toHaveBeenCalledWith(expect.stringContaining("/auto-login?token=created-token"));
  });
  it("waits for the original read and coalesces repeated clicks without creating another token", async () => {
    const pending = deferred<any>();
    state.invoke.mockImplementation(() => pending.promise);
    const { result } = renderHook(() => useStudentDetailCardLogic(props()), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let copy!: Promise<void>;
    act(() => { copy = result.current.copyAutoLoginLink(); });
    await act(async () => { await result.current.copyAutoLoginLink(); });
    await act(async () => { pending.resolve(response({ user_id: "student-a", organization_id: "org-1" }, "existing-token")); await copy; });
    expect(actions()).toEqual(["get"]);
    expect(state.clipboard).toHaveBeenCalledOnce();
    expect(state.clipboard).toHaveBeenCalledWith(expect.stringContaining("existing-token"));
  });
  it("does not turn an initial read failure into a create while the click is waiting", async () => {
    const pending = deferred<any>(); state.invoke.mockImplementation(() => pending.promise);
    const { result } = renderHook(() => useStudentDetailCardLogic(props()), { wrapper });
    let copy!: Promise<void>;
    act(() => { copy = result.current.copyAutoLoginLink(); });
    await act(async () => { pending.resolve({ data: null, error: new Error("Чтение недоступно") }); await copy; });
    expect(actions()).toEqual(["get"]);
    expect(state.clipboard).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Чтение недоступно");
  });
  it("shows a selectable fallback when clipboard access is denied", async () => {
    state.clipboard.mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    const { result } = renderHook(() => useStudentDetailCardLogic(props()), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.copyAutoLoginLink(); });
    expect(result.current.autoLoginCopyFallback).toContain("created-token");
    expect(result.current.isLoginLinkBusy).toBe(false);
    expect(toast.success).not.toHaveBeenCalled();
  });
  it("clears the fallback on identity change and ignores a stale handler", async () => {
    state.clipboard.mockRejectedValue(new Error("Denied"));
    const { result, rerender } = renderHook(({ id }) => useStudentDetailCardLogic(props(id)), { initialProps: { id: "student-a" }, wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.copyAutoLoginLink(); });
    const staleCopy = result.current.copyAutoLoginLink;
    rerender({ id: "student-b" });
    expect(result.current.autoLoginCopyFallback).toBeNull();
    state.clipboard.mockClear();
    await act(async () => { await staleCopy(); });
    expect(state.clipboard).not.toHaveBeenCalled();
  });
  it("does not copy A's token when selection changes before creation completes", async () => {
    const pending = deferred<any>();
    state.invoke.mockImplementation(async (_name, { body }) => body.action === "create" ? pending.promise : response(body, null));
    const { result, rerender } = renderHook(({ id }) => useStudentDetailCardLogic(props(id)), { initialProps: { id: "student-a" }, wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let copy!: Promise<void>; act(() => { copy = result.current.copyAutoLoginLink(); });
    rerender({ id: "student-b" });
    await act(async () => { pending.resolve(response({ user_id: "student-a", organization_id: "org-1" }, "token-a")); await copy; });
    expect(state.clipboard).not.toHaveBeenCalled();
    expect(result.current.autoLoginToken).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });
  it("refuses a mismatched response and reports server creation failure without clipboard success", async () => {
    state.invoke.mockImplementation(async (_name, { body }) => body.action === "get" ? response(body, null) : response({ ...body, user_id: "wrong" }, "secret"));
    const { result } = renderHook(() => useStudentDetailCardLogic(props()), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.copyAutoLoginLink(); });
    expect(state.clipboard).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Не удалось подтвердить ссылку ученика");
    state.invoke.mockResolvedValue({ data: null, error: new Error("Недостаточно прав") });
    await act(async () => { await result.current.copyAutoLoginLink(); });
    expect(toast.error).toHaveBeenCalledWith("Недостаточно прав");
  });
  it("ignores an old creation after navigating A → B → A", async () => {
    const pending = deferred<any>();
    state.invoke.mockImplementation(async (_name, { body }) => body.action === "create" ? pending.promise : response(body, null));
    const { result, rerender } = renderHook(({ id }) => useStudentDetailCardLogic(props(id)), { initialProps: { id: "student-a" }, wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let copy!: Promise<void>; act(() => { copy = result.current.copyAutoLoginLink(); });
    await waitFor(() => expect(actions()).toContain("create"));
    rerender({ id: "student-b" });
    rerender({ id: "student-a" });
    await act(async () => { pending.resolve(response({ user_id: "student-a", organization_id: "org-1" }, "old-token-a")); await copy; });
    expect(state.clipboard).not.toHaveBeenCalled();
    expect(result.current.autoLoginToken).toBeNull();
    expect(result.current.autoLoginCopyFallback).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });
  it("does not read or create credentials for read-only staff", async () => {
    state.canWrite = false;
    const { result } = renderHook(() => useStudentDetailCardLogic(props()), { wrapper });
    await act(async () => { await result.current.copyAutoLoginLink(); });
    expect(state.invoke).not.toHaveBeenCalled(); expect(state.clipboard).not.toHaveBeenCalled();
  });
  it("uses a scoped revoke action and preserves the token if revocation is unconfirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    state.invoke.mockImplementation(async (_name, { body }) => response(body, "existing-token"));
    const { result } = renderHook(() => useStudentDetailCardLogic(props()), { wrapper });
    await waitFor(() => expect(result.current.autoLoginToken).toBe("existing-token"));
    await act(async () => { await result.current.revokeAutoLoginToken(); });
    expect(result.current.autoLoginToken).toBe("existing-token");
    expect(state.invoke).toHaveBeenLastCalledWith("student-login-link", { body: { action: "revoke", user_id: "student-a", organization_id: "org-1", token: "existing-token" } });
    state.invoke.mockResolvedValue({ data: { revoked: true, user_id: "student-a", organization_id: "org-1" }, error: null });
    await act(async () => { await result.current.revokeAutoLoginToken(); });
    expect(result.current.autoLoginToken).toBeNull();
    vi.mocked(window.confirm).mockRestore();
  });
});
