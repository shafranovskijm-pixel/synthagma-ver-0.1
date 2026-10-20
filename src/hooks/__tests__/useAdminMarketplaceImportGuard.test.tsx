import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";
import { observeOfflineAccess, setOfflineAuthActor } from "@/utils/courseCache";
import { useAdminMarketplaceImportGuard } from "../useAdminMarketplaceImportGuard";

const mocks = vi.hoisted(() => ({ auth: { user: { id: "admin-a" } as { id: string } | null, userRole: "admin" as string | null, loading: false }, role: vi.fn(), organization: vi.fn(), permission: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (name: string) => name === "get_user_role" ? mocks.role() : mocks.permission(),
  from: () => { const query = { select: () => query, eq: () => query, single: () => mocks.organization() }; return query; },
} }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.user = { id: "admin-a" }; mocks.auth.userRole = "admin"; mocks.auth.loading = false;
  setOfflineAuthActor(null); setOfflineAuthActor("admin-a");
  mocks.role.mockResolvedValue({ data: "admin", error: null });
  mocks.organization.mockResolvedValue({ data: { id: MARKETPLACE_ORG_ID }, error: null });
  mocks.permission.mockResolvedValue({ data: true, error: null });
});
afterEach(() => { cleanup(); setOfflineAuthActor(null); });

describe("admin import operation identity and reentry", () => {
  it.each(["loading", "missing-role", "non-admin", "missing-actor"])("does not start while %s", mode => {
    if (mode === "loading") mocks.auth.loading = true;
    if (mode === "missing-role") mocks.auth.userRole = null;
    if (mode === "non-admin") mocks.auth.userRole = "organization";
    if (mode === "missing-actor") setOfflineAuthActor(null);
    const { result } = renderHook(() => useAdminMarketplaceImportGuard());
    expect(result.current.canStart).toBe(false);
    expect(() => result.current.start()).toThrow();
    expect(mocks.role).not.toHaveBeenCalled();
  });

  it("blocks synchronous double start until the current operation finishes", async () => {
    const { result } = renderHook(() => useAdminMarketplaceImportGuard());
    let operation!: ReturnType<typeof result.current.start>;
    act(() => { operation = result.current.start(); });
    expect(result.current.isBusy).toBe(true);
    expect(() => result.current.start()).toThrow();
    await expect(operation.verify()).resolves.toEqual({ organizationId: MARKETPLACE_ORG_ID });
    act(() => { operation.finish(); });
    expect(result.current.isBusy).toBe(false);
  });

  it.each(["actor-ABA", "access-revision"])("rejects %s during a pending server role read without relying on a React render", async mode => {
    const pending = deferred<{ data: string; error: null }>(); mocks.role.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useAdminMarketplaceImportGuard());
    let operation!: ReturnType<typeof result.current.start>;
    act(() => { operation = result.current.start(); });
    const verification = operation.verify();
    if (mode === "actor-ABA") { setOfflineAuthActor("admin-b"); setOfflineAuthActor("admin-a"); }
    else observeOfflineAccess("admin-a", "roles:changed");
    pending.resolve({ data: "admin", error: null });
    await expect(verification).rejects.toMatchObject({ kind: "stale" });
    expect(mocks.organization).not.toHaveBeenCalled();
    expect(mocks.permission).not.toHaveBeenCalled();
  });

  it("does not let an old finish clear a new actor's busy operation after rerender", () => {
    const hook = renderHook(() => useAdminMarketplaceImportGuard());
    let oldOperation!: ReturnType<typeof hook.result.current.start>;
    act(() => { oldOperation = hook.result.current.start(); });
    setOfflineAuthActor("admin-b"); mocks.auth.user = { id: "admin-b" }; hook.rerender();
    expect(hook.result.current.isBusy).toBe(false);
    let newOperation!: ReturnType<typeof hook.result.current.start>;
    act(() => { newOperation = hook.result.current.start(); oldOperation.finish(); });
    expect(oldOperation.isCurrent()).toBe(false);
    expect(newOperation.isCurrent()).toBe(true);
    expect(hook.result.current.isBusy).toBe(true);
    act(() => { newOperation.finish(); });
  });

  it("rejects the captured start callback after an A→B→A render sequence", () => {
    const hook = renderHook(() => useAdminMarketplaceImportGuard());
    const oldStart = hook.result.current.start;
    setOfflineAuthActor("admin-b"); mocks.auth.user = { id: "admin-b" }; hook.rerender();
    setOfflineAuthActor("admin-a"); mocks.auth.user = { id: "admin-a" }; hook.rerender();
    expect(() => oldStart()).toThrow();
    expect(mocks.role).not.toHaveBeenCalled();
  });

  it.each(["actor-ABA", "access-revision"])("rejects an old start callback after %s even without a React render", mode => {
    const hook = renderHook(() => useAdminMarketplaceImportGuard());
    const oldStart = hook.result.current.start;
    if (mode === "actor-ABA") { setOfflineAuthActor("admin-b"); setOfflineAuthActor("admin-a"); }
    else observeOfflineAccess("admin-a", "roles:changed");
    expect(() => oldStart()).toThrow();
    expect(mocks.role).not.toHaveBeenCalled();
  });

  it("discards pending verification after unmount", async () => {
    const pending = deferred<{ data: string; error: null }>(); mocks.role.mockReturnValueOnce(pending.promise);
    const hook = renderHook(() => useAdminMarketplaceImportGuard());
    let operation!: ReturnType<typeof hook.result.current.start>;
    act(() => { operation = hook.result.current.start(); });
    const verification = operation.verify(); hook.unmount();
    pending.resolve({ data: "admin", error: null });
    await expect(verification).rejects.toMatchObject({ kind: "stale" });
    expect(mocks.organization).not.toHaveBeenCalled();
  });
});
