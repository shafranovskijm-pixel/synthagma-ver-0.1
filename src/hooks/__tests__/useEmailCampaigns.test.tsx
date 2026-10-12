import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEmailCampaigns } from "../useEmailCampaigns";

const mocks = vi.hoisted(() => ({ read: vi.fn(), invoke: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, warning: mocks.warning, info: mocks.info, error: mocks.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const filters: Record<string, unknown> = {};
    const query: any = {
      select: () => query, order: () => query, delete: () => { filters.operation = "delete"; return query; },
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      then: (resolve: any, reject: any) => mocks.read(filters).then(resolve, reject),
    };
    return query;
  }, functions: { invoke: mocks.invoke },
} }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue({ data: [], error: null });
});
afterEach(cleanup);

describe("campaign workspace isolation and truthful actions", () => {
  it("does not query all organizations while organization is unresolved", async () => {
    const { result } = renderHook(() => useEmailCampaigns("org", null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.read).not.toHaveBeenCalled();
    expect(result.current.campaigns).toEqual([]);
  });

  it("scopes the query and ignores an old workspace response arriving late", async () => {
    let oldResolve!: (data: unknown) => void;
    mocks.read.mockImplementation(({ organization_id }) => organization_id === "old"
      ? new Promise(resolve => { oldResolve = resolve; })
      : Promise.resolve({ data: [{ id: "new-campaign" }], error: null }));
    const { result, rerender } = renderHook(({ org }) => useEmailCampaigns("org", org), { initialProps: { org: "old" } });
    await waitFor(() => expect(mocks.read).toHaveBeenCalledWith({ scope: "org", organization_id: "old" }));
    rerender({ org: "new" });
    await waitFor(() => expect(result.current.campaigns[0]?.id).toBe("new-campaign"));
    await act(async () => { oldResolve({ data: [{ id: "old-campaign" }], error: null }); });
    expect(result.current.campaigns[0]?.id).toBe("new-campaign");
    expect(result.current.loadError).toBeNull();
  });

  it("exposes a load failure and retries without a false empty success", async () => {
    mocks.read.mockResolvedValueOnce({ data: null, error: new Error("network") })
      .mockResolvedValueOnce({ data: [{ id: "recovered" }], error: null });
    const { result } = renderHook(() => useEmailCampaigns("org", "org"));
    await waitFor(() => expect(result.current.loadError).toContain("Не удалось загрузить"));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.loadError).toBeNull();
    expect(result.current.campaigns[0]?.id).toBe("recovered");
  });

  it("does not let an earlier same-workspace request replace the latest retry", async () => {
    let oldResolve!: (data: unknown) => void;
    mocks.read.mockImplementationOnce(() => new Promise(resolve => { oldResolve = resolve; }))
      .mockResolvedValueOnce({ data: [{ id: "fresh" }], error: null });
    const { result } = renderHook(() => useEmailCampaigns("org", "org"));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
    await act(async () => { await result.current.refresh(); });
    await act(async () => { oldResolve({ data: null, error: new Error("stale failure") }); });
    expect(result.current.campaigns[0]?.id).toBe("fresh");
    expect(result.current.loadError).toBeNull();
  });

  it("reports quota denial as a pause, never launch success", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: false, quotaExceeded: true, remaining: 0 }, error: null });
    const { result } = renderHook(() => useEmailCampaigns("org", "org"));
    await act(async () => { await result.current.launch("campaign"); });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining("пока не началась"));
  });

  it("never claims a row was deleted when RLS removed no rows", async () => {
    const { result } = renderHook(() => useEmailCampaigns("org", "org"));
    await act(async () => { await result.current.remove("missing"); });
    expect(mocks.read).toHaveBeenCalledWith({ operation: "delete", id: "missing", scope: "org", organization_id: "org" });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("Удаление не подтверждено"));
  });

  it("does not leak a rejected invoke promise or announce dispatch", async () => {
    mocks.invoke.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useEmailCampaigns("org", "org"));
    await act(async () => { await result.current.launch("campaign"); });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("Не удалось подтвердить запуск"));
  });

  it("does not toast or refresh the previous workspace after switching during launch", async () => {
    let resolveRun!: (data: unknown) => void;
    mocks.invoke.mockImplementation(() => new Promise(resolve => { resolveRun = resolve; }));
    const { result, rerender } = renderHook(({ org }) => useEmailCampaigns("org", org), { initialProps: { org: "old" } });
    let pending!: Promise<void>;
    act(() => { pending = result.current.launch("campaign"); });
    rerender({ org: "new" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = mocks.read.mock.calls.length;
    await act(async () => { resolveRun({ data: { ok: true, started: 25 }, error: null }); await pending; });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.read).toHaveBeenCalledTimes(before);
  });
});
