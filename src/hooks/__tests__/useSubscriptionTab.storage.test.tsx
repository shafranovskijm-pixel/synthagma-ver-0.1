import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";
import { useSubscriptionTab } from "../useSubscriptionTab";

const mocks = vi.hoisted(() => ({ organizationId: "org-a" as string | null, scan: vi.fn(), navigate: vi.fn() }));
const sharedLimits = {
  plan: "start" as const,
  limits: SUBSCRIPTION_PLANS.start.limits,
  usage: { coursesCount: 41, studentsCount: 632, trainedThisMonth: 12, storageUsedBytes: 0 },
  canAddStudent: true,
};
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({ organizationId: mocks.organizationId, subscriptionLimits: sharedLimits }),
}));
vi.mock("../usePostpaidAccessProfile", () => ({ usePostpaidAccessProfile: () => ({ data: { active: true }, isLoading: false, error: null, refetch: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const chain = {
        select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
        single: async () => ({ data: {}, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return chain;
    },
  },
}));
vi.mock("@/lib/storage/organizationStorageUsage", () => ({
  getOrganizationStorageUsage: (_client: unknown, organizationId: string) => mocks.scan(organizationId),
}));

function deferred() {
  let resolve!: (bytes: number) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<number>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const requests: Array<ReturnType<typeof deferred>> = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.organizationId = "org-a";
  requests.length = 0;
  mocks.scan.mockImplementation(() => {
    const request = deferred();
    requests.push(request);
    return request.promise;
  });
});
afterEach(cleanup);

describe("storage usage belongs to the mounted subscription page", () => {
  it("scans on mount, labels pending data, and enriches usage without mutating shared access state", async () => {
    expect(mocks.scan).not.toHaveBeenCalled();
    const { result, rerender } = renderHook(() => useSubscriptionTab());
    expect(mocks.scan).toHaveBeenCalledExactlyOnceWith("org-a");
    expect(result.current.storageUsageLoading).toBe(true);
    expect(result.current.storageUsageError).toBeNull();
    expect(result.current.subscriptionLimits.canAddStudent).toBe(true);
    await act(async () => { requests[0].resolve(12345); });
    expect(result.current.storageUsageLoading).toBe(false);
    expect(result.current.subscriptionLimits.usage).toEqual({ ...sharedLimits.usage, storageUsedBytes: 12345 });
    expect(sharedLimits.usage.storageUsedBytes).toBe(0);
    rerender();
    expect(mocks.scan).toHaveBeenCalledTimes(1);
  });

  it("clears the old measurement immediately on organization change", async () => {
    const { result, rerender } = renderHook(() => useSubscriptionTab());
    await act(async () => { requests[0].resolve(100); });
    expect(result.current.subscriptionLimits.usage.storageUsedBytes).toBe(100);
    mocks.organizationId = "org-b";
    rerender();
    expect(result.current.subscriptionLimits.usage.storageUsedBytes).toBe(0);
    expect(result.current.storageUsageLoading).toBe(true);
    expect(mocks.scan).toHaveBeenLastCalledWith("org-b");
    await act(async () => { requests[1].resolve(200); });
    expect(result.current.subscriptionLimits.usage.storageUsedBytes).toBe(200);
  });

  it("ignores a late response from the previous organization", async () => {
    const { result, rerender } = renderHook(() => useSubscriptionTab());
    mocks.organizationId = "org-b";
    rerender();
    await act(async () => { requests[1].resolve(200); });
    await act(async () => { requests[0].resolve(999); });
    expect(result.current.subscriptionLimits.usage.storageUsedBytes).toBe(200);
  });

  it("rejects a stale response even after switching back to the same organization", async () => {
    const { result, rerender } = renderHook(() => useSubscriptionTab());
    mocks.organizationId = "org-b";
    rerender();
    mocks.organizationId = "org-a";
    rerender();
    await act(async () => { requests[2].resolve(300); });
    await act(async () => { requests[0].resolve(999); requests[1].resolve(888); });
    expect(result.current.subscriptionLimits.usage.storageUsedBytes).toBe(300);
    expect(result.current.storageUsageError).toBeNull();
  });

  it("marks a failed scan as unavailable without changing access", async () => {
    const { result } = renderHook(() => useSubscriptionTab());
    await act(async () => { requests[0].reject(new Error("storage unavailable")); });
    expect(result.current.storageUsageLoading).toBe(false);
    expect(result.current.storageUsageError).toBe("Не удалось рассчитать объём хранилища.");
    expect(result.current.subscriptionLimits.canAddStudent).toBe(true);
    expect(result.current.isPostpaid).toBe(true);
    expect(result.current.subscriptionLimits.limits).toBe(sharedLimits.limits);
  });

  it("does not apply a previous organization's failure to the current measurement", async () => {
    const { result, rerender } = renderHook(() => useSubscriptionTab());
    mocks.organizationId = "org-b";
    rerender();
    await act(async () => { requests[1].resolve(200); requests[0].reject(new Error("old storage unavailable")); });
    expect(result.current.storageUsageError).toBeNull();
    expect(result.current.subscriptionLimits.usage.storageUsedBytes).toBe(200);
  });

  it("does not scan without an organization and settles an unmounted page safely", async () => {
    mocks.organizationId = null;
    const empty = renderHook(() => useSubscriptionTab());
    expect(mocks.scan).not.toHaveBeenCalled();
    expect(empty.result.current.storageUsageLoading).toBe(false);
    empty.unmount();
    mocks.organizationId = "org-a";
    const mounted = renderHook(() => useSubscriptionTab());
    const lastResult = mounted.result.current;
    mounted.unmount();
    await act(async () => { requests[0].reject(new Error("page closed")); });
    expect(mounted.result.current).toBe(lastResult);
  });
});
