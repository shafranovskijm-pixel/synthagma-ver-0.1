import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrgDetailsView, type Organization } from "../useOrgDetailsView";
import { observeOfflineAccess, setOfflineAuthActor } from "@/utils/courseCache";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), usage: vi.fn(), write: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("@/hooks/useUrlNavigation", () => ({ useUrlQueryState: () => ["courses", vi.fn()] }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (name: string, args: { p_organization_id: string }) => {
    if (name !== "get_postpaid_access_profile") throw new Error(`Unexpected RPC ${name}`);
    return mocks.profile(args.p_organization_id);
  },
  from: (table: string) => {
    let organizationId: string;
    const response = () => table === "organization_usage" ? mocks.usage(organizationId) : { data: table === "organizations" ? {} : [], error: null };
    const chain = {
      select: () => chain, order: () => chain, is: () => chain,
      eq: (_key: string, value: string) => { if (_key === "organization_id" || _key === "id") organizationId = value; return chain; },
      single: () => Promise.resolve(response()), maybeSingle: () => Promise.resolve(response()),
      then: (done: (value: unknown) => unknown, fail: (error: unknown) => unknown) => Promise.resolve(response()).then(done, fail),
      update: (payload: Record<string, unknown>) => ({ eq: (_key: string, id: string) => { mocks.write(id, payload); return Promise.resolve({ data: null, error: null }); } }),
    };
    return chain;
  },
} }));

const organization = (id = "org-a", plan = "free"): Organization => ({
  id, name: "Synthetic organization", email: "synthetic@example.test", phone: null, inn: null, contact_name: null,
  ai_enabled: true, ai_provider: "gigachat", frdo_enabled: false, created_at: "2026-10-01", subscription_plan: plan, storage_limit_bytes: 100,
});
const profile = (id: string, active = true) => ({ data: {
  organization_id: id, active, billing_mode: active ? "postpaid" : "prepaid",
  limits: active ? { maxCourses: -1, maxStudents: -1, maxTrainedStudents: -1 } : null,
  features: { crm: false, webinar: false, videoserviceplus: false, frdoplus: false },
}, error: null });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const clients: QueryClient[] = [];
function setup(initial = organization()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: Infinity } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(({ org }) => useOrgDetailsView(org), { initialProps: { org: initial }, wrapper });
}
beforeEach(() => {
  vi.clearAllMocks();
  setOfflineAuthActor(null); setOfflineAuthActor("admin-a");
  mocks.profile.mockImplementation(async (id: string) => profile(id));
  mocks.usage.mockResolvedValue({ data: { storage_bytes: 200, ai_generations_count: 10 }, error: null });
});
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); setOfflineAuthActor(null); vi.restoreAllMocks(); });

describe("admin usage warnings and settings follow confirmed postpaid access", () => {
  it.each([
    ["storage_bytes", NaN], ["storage_bytes", Infinity], ["storage_bytes", -1], ["storage_bytes", 0.5], ["storage_bytes", Number.MAX_SAFE_INTEGER + 1], ["storage_bytes", "200"],
    ["ai_generations_count", NaN], ["ai_generations_count", Infinity], ["ai_generations_count", -1], ["ai_generations_count", 0.5], ["ai_generations_count", Number.MAX_SAFE_INTEGER + 1], ["ai_generations_count", null],
  ])("rejects unconfirmed usage %s=%s instead of normalizing it to valid zero or infinity", async (key, value) => {
    mocks.usage.mockResolvedValue({ data: { storage_bytes: 200, ai_generations_count: 10, [key as string]: value }, error: null });
    const { result } = setup();
    await waitFor(() => expect(result.current.usageAccessError).not.toBeNull());
    expect(result.current.usageLimitsReady).toBe(false);
    await act(async () => { await result.current.saveSettings(); });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("keeps a confirmed absent monthly usage row at zero for a new organization", async () => {
    mocks.usage.mockResolvedValue({ data: null, error: null });
    const { result } = setup();
    await waitFor(() => expect(result.current.usageLimitsReady).toBe(true));
    expect(result.current.usage).toEqual({ storage_bytes: 0, ai_generations_count: 0 });
  });

  it("does not grant ready access or save without a current authenticated actor context", async () => {
    setOfflineAuthActor(null);
    const { result } = setup();
    await waitFor(() => expect(mocks.profile).toHaveBeenCalled());
    await act(async () => { await result.current.saveSettings(); });
    expect(result.current.usageLimitsReady).toBe(false);
    expect(result.current.isPostpaid).toBe(false);
    expect(mocks.usage).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each(["actor-ABA", "access-revision"])("rejects a fresh save reply after %s without changing or remounting the organization", async mode => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.usageLimitsReady).toBe(true));
    const oldSave = hook.result.current.saveSettings;
    const pending = deferred<ReturnType<typeof profile>>(); mocks.profile.mockReturnValueOnce(pending.promise);
    let work!: Promise<void>;
    act(() => { work = oldSave(); });
    if (mode === "actor-ABA") { setOfflineAuthActor("admin-b"); setOfflineAuthActor("admin-a"); }
    else observeOfflineAccess("admin-a", "roles:changed");
    await act(async () => { pending.resolve(profile("org-a")); await work; });
    await act(async () => { await oldSave(); });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("does not commit an old usage reply after auth A→B→A at the same organization", async () => {
    const pending = deferred<{ data: { storage_bytes: number; ai_generations_count: number }; error: null }>();
    mocks.usage.mockReturnValueOnce(pending.promise);
    const hook = setup();
    await waitFor(() => expect(mocks.usage).toHaveBeenCalledTimes(1));
    setOfflineAuthActor("admin-b"); setOfflineAuthActor("admin-a");
    await act(async () => { pending.resolve({ data: { storage_bytes: 9999, ai_generations_count: 9999 }, error: null }); });
    expect(hook.result.current.usage.ai_generations_count).toBe(0);
    hook.rerender({ org: organization("org-a") });
    await waitFor(() => expect(hook.result.current.usageLimitsReady).toBe(true));
    expect(hook.result.current.usage.ai_generations_count).toBe(10);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each(["actor-change", "access-revision"])("resets a stale save busy state on %s and keeps a new save busy until its own reply", async mode => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.usageLimitsReady).toBe(true));
    const oldProfile = deferred<ReturnType<typeof profile>>();
    mocks.profile.mockReturnValueOnce(oldProfile.promise);
    let oldWork!: Promise<void>;
    act(() => { oldWork = hook.result.current.saveSettings(); });
    expect(hook.result.current.isSaving).toBe(true);
    if (mode === "actor-change") setOfflineAuthActor("admin-b");
    else observeOfflineAccess("admin-a", "settings:access-revised");
    hook.rerender({ org: organization("org-a") });
    await waitFor(() => {
      expect(hook.result.current.usageLimitsReady).toBe(true);
      expect(hook.result.current.isSaving).toBe(false);
    });
    const currentProfile = deferred<ReturnType<typeof profile>>();
    mocks.profile.mockReturnValueOnce(currentProfile.promise);
    let currentWork!: Promise<void>;
    act(() => { currentWork = hook.result.current.saveSettings(); });
    expect(hook.result.current.isSaving).toBe(true);
    await act(async () => { oldProfile.resolve(profile("org-a")); await oldWork; });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(hook.result.current.isSaving).toBe(true);
    await act(async () => { currentProfile.resolve(profile("org-a")); await currentWork; });
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith("org-a", expect.objectContaining({ ai_enabled: true }));
    expect(hook.result.current.isSaving).toBe(false);
  });

  it("does not warn or force AI off for active postpaid with its preserved free legacy plan", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.usageLimitsReady).toBe(true));
    expect(result.current).toMatchObject({ isPostpaid: true, shouldBlockAI: false, isAiGenExceeded: false, isStorageExceeded: false, storageLimitPercent: 0, aiGenerationsLimit: Infinity, effectiveStorageLimit: -1, planKey: "free" });
    await act(async () => { await result.current.saveSettings(); });
    expect(mocks.profile).toHaveBeenCalledTimes(2);
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith("org-a", expect.objectContaining({ ai_enabled: true, ai_provider: "gigachat", frdo_enabled: false, storage_limit_bytes: 100 }));
  });

  it("preserves an explicitly disabled AI setting under postpaid", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.usageLimitsReady).toBe(true));
    act(() => result.current.setSettings(previous => ({ ...previous, ai_enabled: false })));
    await act(async () => { await result.current.saveSettings(); });
    expect(mocks.write).toHaveBeenCalledWith("org-a", expect.objectContaining({ ai_enabled: false }));
  });

  it("retains the existing free-prepaid warning and AI-off behavior after three generations", async () => {
    mocks.profile.mockImplementation(async (id: string) => profile(id, false));
    const { result } = setup();
    await waitFor(() => expect(result.current.usageLimitsReady).toBe(true));
    expect(result.current).toMatchObject({ isPostpaid: false, shouldBlockAI: true, isAiGenExceeded: true, isStorageExceeded: true, aiGenerationsLimit: 3, effectiveStorageLimit: 100 });
    await act(async () => { await result.current.saveSettings(); });
    expect(mocks.write).toHaveBeenCalledWith("org-a", expect.objectContaining({ ai_enabled: false }));
  });

  it("does not assert unlimited access or save before the profile is confirmed", async () => {
    const pending = deferred<ReturnType<typeof profile>>(); mocks.profile.mockReturnValue(pending.promise);
    const { result } = setup();
    await waitFor(() => expect(mocks.usage).toHaveBeenCalled());
    expect(result.current.usageLimitsReady).toBe(false);
    expect(result.current.isPostpaid).toBe(false);
    expect(result.current.aiGenerationsLimit).toBe(3);
    await act(async () => { await result.current.saveSettings(); });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.error.mock.calls[0][1]).not.toHaveProperty("action");
    await act(async () => pending.resolve(profile("org-a")));
  });

  it.each(["error", "foreign-profile"])("does not save with an unconfirmed profile: %s", async kind => {
    mocks.profile.mockImplementation(async () => kind === "error" ? { data: null, error: new Error("unavailable") } : profile("foreign-org"));
    const { result } = setup();
    await waitFor(() => expect(result.current.usageAccessError).not.toBeNull());
    expect(result.current.usageLimitsReady).toBe(false);
    await act(async () => { await result.current.saveSettings(); });
    expect(mocks.write).not.toHaveBeenCalled();
    const retry = mocks.error.mock.calls[0][1].action;
    expect(retry.label).toBe("Повторить проверку");
    await act(async () => { await retry.onClick(); });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each(["pending", "error"])("does not save while usage is %s even with a confirmed postpaid agreement", async kind => {
    const pending = deferred<{ data: { storage_bytes: number; ai_generations_count: number }; error: null }>();
    if (kind === "pending") mocks.usage.mockReturnValue(pending.promise);
    else mocks.usage.mockResolvedValue({ data: null, error: new Error("usage unavailable") });
    const { result } = setup();
    await waitFor(() => expect(result.current.isPostpaid).toBe(true));
    expect(result.current.usageLimitsReady).toBe(false);
    await act(async () => { await result.current.saveSettings(); });
    expect(mocks.write).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ data: { storage_bytes: 200, ai_generations_count: 10 }, error: null }));
  });

  it("fails closed and offers a read-only retry when the fresh pre-save profile read fails", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.usageLimitsReady).toBe(true));
    mocks.profile.mockResolvedValueOnce({ data: null, error: new Error("fresh verification unavailable") });
    await act(async () => { await result.current.saveSettings(); });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(result.current.usageLimitsReady).toBe(false);
    const retry = mocks.error.mock.calls[0][1].action;
    expect(retry.label).toBe("Повторить проверку");
    await act(async () => { await retry.onClick(); });
    await waitFor(() => expect(result.current.usageLimitsReady).toBe(true));
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("rechecks a newly active agreement before a stale prepaid presentation could force AI off", async () => {
    mocks.profile.mockImplementation(async (id: string) => profile(id, false));
    const { result } = setup();
    await waitFor(() => expect(result.current.shouldBlockAI).toBe(true));
    mocks.profile.mockImplementation(async (id: string) => profile(id, true));
    await act(async () => { await result.current.saveSettings(); });
    expect(mocks.write).toHaveBeenCalledWith("org-a", expect.objectContaining({ ai_enabled: true }));
  });

  it("does not let an old A save resume after A→B→A during fresh authorization", async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.usageLimitsReady).toBe(true));
    const oldSave = hook.result.current.saveSettings;
    const pending = deferred<ReturnType<typeof profile>>(); mocks.profile.mockReturnValueOnce(pending.promise);
    let work!: Promise<void>;
    act(() => { work = oldSave(); });
    hook.rerender({ org: organization("org-b") });
    hook.rerender({ org: organization("org-a") });
    await act(async () => { pending.resolve(profile("org-a")); await work; });
    await act(async () => { await oldSave(); });
    expect(mocks.write).not.toHaveBeenCalled();
    await waitFor(() => expect(hook.result.current.usageLimitsReady).toBe(true));
  });

  it("does not write if access becomes unconfirmed while the fresh pre-save read is pending", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.usageLimitsReady).toBe(true));
    const saveProfile = deferred<ReturnType<typeof profile>>();
    const refreshProfile = deferred<ReturnType<typeof profile>>();
    mocks.profile.mockReturnValueOnce(saveProfile.promise).mockReturnValueOnce(refreshProfile.promise);
    let saving!: Promise<void>, refreshing!: Promise<void>;
    act(() => { saving = result.current.saveSettings(); });
    act(() => { refreshing = result.current.retryUsageAccess(); });
    await waitFor(() => expect(result.current.usageLimitsReady).toBe(false));
    await act(async () => { saveProfile.resolve(profile("org-a")); await saving; });
    expect(mocks.write).not.toHaveBeenCalled();
    await act(async () => { refreshProfile.resolve(profile("org-a")); await refreshing; });
  });

  it("ignores old A usage after A→B→A instead of reusing it for a warning or write decision", async () => {
    const oldUsage = deferred<{ data: { storage_bytes: number; ai_generations_count: number }; error: null }>();
    mocks.usage.mockReturnValueOnce(oldUsage.promise);
    const hook = setup();
    await waitFor(() => expect(mocks.usage).toHaveBeenCalledTimes(1));
    hook.rerender({ org: organization("org-b") });
    hook.rerender({ org: organization("org-a") });
    await waitFor(() => expect(hook.result.current.usageLimitsReady).toBe(true));
    await act(async () => oldUsage.resolve({ data: { storage_bytes: 9999, ai_generations_count: 9999 }, error: null }));
    expect(hook.result.current.usage.ai_generations_count).toBe(10);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
