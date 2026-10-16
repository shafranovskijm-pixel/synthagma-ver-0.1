import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentsTab } from "../useDocumentsTab";

const mocks = vi.hoisted(() => ({ active: true, loading: false, rpc: vi.fn(), insert: vi.fn(), invoiceHtml: vi.fn(), toast: vi.fn() }));
vi.mock("@/contexts/OrgDashboardContext", () => ({ useOrgDashboard: () => ({ organizationName: "Организация" }) }));
vi.mock("../useSubscriptionLimits", () => ({ useSubscriptionLimits: () => ({ plan: "free" }) }));
vi.mock("../usePostpaidAccessProfile", () => ({ usePostpaidAccessProfile: () => ({ data: mocks.loading ? undefined : { active: mocks.active }, isLoading: mocks.loading, error: null }) }));
vi.mock("@/constants/invoiceTemplate", () => ({ generateInvoiceHtml: mocks.invoiceHtml }));
vi.mock("sonner", () => ({ toast: { error: mocks.toast, success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc,
  from: () => { const response = { data: [], error: null, count: 0 }; const chain: any = new Proxy({}, { get: (_target, key) => key === "then" ? Promise.resolve(response).then.bind(Promise.resolve(response)) : key === "insert" ? mocks.insert : () => chain }); return chain; },
} }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.active = true; mocks.loading = false;
  mocks.rpc.mockResolvedValue({ data: { organization_id: "org", active: true, billing_mode: "postpaid", limits: { maxCourses: -1, maxStudents: -1, maxTrainedStudents: -1 }, features: { crm: false, webinar: false, videoserviceplus: false, frdoplus: false } }, error: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("organization document advance invoice guard", () => {
  it.each(["postpaid", "loading", "stale-prepaid-cache"])("does not produce printable advance documents for %s", async scenario => {
    mocks.active = scenario === "postpaid";
    mocks.loading = scenario === "loading";
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { result } = renderHook(() => useDocumentsTab("org", "Организация"));
    await act(async () => { await result.current.handleGenerateInvoiceFromDocs(); });
    expect(mocks.invoiceHtml).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(result.current.pendingInvoice).toBeNull();
    if (scenario === "stale-prepaid-cache") expect(mocks.rpc).toHaveBeenCalledWith("get_postpaid_access_profile", { p_organization_id: "org" });
  });
});
