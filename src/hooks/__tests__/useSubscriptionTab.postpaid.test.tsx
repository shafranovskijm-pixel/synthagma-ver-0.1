import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSubscriptionTab } from "../useSubscriptionTab";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";

const mocks = vi.hoisted(() => ({ status: "postpaid", insert: vi.fn(), invoke: vi.fn(), toast: vi.fn(), navigate: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("sonner", () => ({ toast: { error: mocks.toast, success: vi.fn() } }));
vi.mock("../usePostpaidAccessProfile", () => ({ usePostpaidAccessProfile: () => ({ data: mocks.status === "postpaid" ? { active: true } : undefined, isLoading: mocks.status === "loading", error: mocks.status === "error" ? new Error("unavailable") : null, refetch: vi.fn() }) }));
vi.mock("@/contexts/OrgDashboardContext", () => ({ useOrgDashboard: () => ({ organizationId: "org", organizationName: "Организация", subscriptionLimits: { plan: "free", limits: SUBSCRIPTION_PLANS.free.limits, usage: { coursesCount: 0, studentsCount: 0, trainedThisMonth: 0 } } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => { const chain: any = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, single: async () => ({ data: {}, error: null }), then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve), insert: mocks.insert }; return chain; },
  functions: { invoke: mocks.invoke },
} }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("legacy prepaid actions", () => {
  it.each(["postpaid", "loading", "error"])("does not create an advance invoice, payment or upgrade request for %s billing status", async status => {
    mocks.status = status;
    const { result } = renderHook(() => useSubscriptionTab());
    await act(async () => result.current.setSelectedPlan("start"));
    await act(async () => {
      await result.current.handleGenerateInvoice();
      await result.current.handlePayOnline();
      await result.current.handleRequestUpgrade();
    });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledTimes(3);
    expect(result.current.allowPrepaidActions).toBe(false);
  });
});
