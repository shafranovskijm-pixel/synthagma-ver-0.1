import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useSubscriptionLimits } from "../useSubscriptionLimits";
import { useOrgCrmAccess } from "../useOrgCrmAccess";
import { useOrgFeatures } from "../useOrgFeatures";
import { fetchPostpaidAccessProfile, type PostpaidAccessProfile } from "@/lib/postpaidAccess";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from,
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; }, removeChannel: vi.fn(),
} }));
vi.mock("@/hooks/useOrganizationCore", () => ({ useOrganizationCore: (org: string) => ({ data: { id: org, subscription_plan: "free", custom_enabled_categories: ["webinars"] } }) }));
vi.mock("@/lib/storage/organizationStorageUsage", () => ({ getOrganizationStorageUsage: async () => 123456 }));
const profile = (org = "org", active = true): PostpaidAccessProfile => ({ organization_id: org, active, billing_mode: active ? "postpaid" : "prepaid", limits: active ? { maxCourses: -1, maxStudents: -1, maxTrainedStudents: -1 } : null, features: { crm: false, webinar: false, videoserviceplus: false, frdoplus: false } });
let access: PostpaidAccessProfile;
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const result = renderHook(({ org }) => ({ limits: useSubscriptionLimits(org), crm: useOrgCrmAccess(org), features: useOrgFeatures(org) }), { wrapper, initialProps: { org: "org" } });
  return { ...result, client };
}
beforeEach(() => {
  vi.clearAllMocks(); access = profile();
  mocks.rpc.mockImplementation(async (name, args) => {
    if (name === "get_postpaid_access_profile") return { data: args.p_organization_id === "org" ? access : profile(args.p_organization_id, false), error: null };
    if (name === "get_organization_student_capacity") return { data: { current_students: 500 }, error: null };
    if (name === "count_org_completions_this_month") return { data: 900, error: null };
    if (name === "get_organization_core") return { data: { id: args.p_org_id, subscription_plan: "free", custom_enabled_categories: [] }, error: null };
    throw new Error(name);
  });
  mocks.from.mockImplementation(table => {
    const response = table === "organizations" ? { data: { subscription_plan: "free", custom_max_courses: 1, custom_max_students: 1, custom_max_trained_per_month: 1, custom_enabled_categories: ["webinars"] }, error: null }
      : table === "courses" ? { data: null, count: 80, error: null } : { data: [], error: null };
    const chain: any = { select: () => chain, eq: () => chain, is: () => chain, single: async () => response, then: (resolve: any, reject: any) => Promise.resolve(response).then(resolve, reject) };
    return chain;
  });
});
afterEach(cleanup);

describe("postpaid access stays separate from invoiced tier", () => {
  it("shares one profile read and lifts free capacities without silently enabling paid functions", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.limits.loading || result.current.crm.loading || result.current.features.loading).toBe(false));
    expect(result.current.limits).toMatchObject({ plan: "free", isPostpaid: true, canAddStudent: true, canCreateCourse: true, canCompleteCourse: true, storageLimit: -1 });
    expect(result.current.limits.limits).toMatchObject({ maxCourses: -1, maxStudents: -1, maxTrainedPerMonth: -1, emailCampaignsEnabled: true, salesCrmEnabled: false, webinarsEnabled: false, videoServicePlus: false });
    expect(result.current.crm).toMatchObject({ enabled: false, mailingEnabled: true });
    expect(result.current.features.isEnabled("webinars")).toBe(false);
    expect(result.current.features.isEnabled("courses")).toBe(true);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "get_postpaid_access_profile")).toHaveLength(1);
  });

  it("applies paid-function consent on refetch without assigning a price or changing the legacy plan", async () => {
    const { result, client } = setup();
    await waitFor(() => expect(result.current.limits.loading).toBe(false));
    access = { ...access, features: { crm: true, webinar: true, videoserviceplus: true, frdoplus: true } };
    await act(async () => { await client.invalidateQueries({ queryKey: ["postpaid-access", "org"] }); });
    await waitFor(() => expect(result.current.crm.enabled).toBe(true));
    expect(result.current.limits.plan).toBe("free");
    expect(result.current.limits.limits).toMatchObject({ webinarsEnabled: true, videoServicePlus: true });
    expect(result.current.features.isEnabled("webinars")).toBe(true);
  });

  it("does not grant postpaid or paid functions when the profile cannot be confirmed", async () => {
    const normal = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name, args) => name === "get_postpaid_access_profile" ? Promise.resolve({ data: null, error: { message: "denied" } }) : normal(name, args));
    const { result } = setup();
    await waitFor(() => expect(result.current.limits.error).not.toBeNull());
    expect(result.current.limits.isPostpaid).toBe(false);
    expect(result.current.limits.checkLimit("student").allowed).toBe(false);
    expect(result.current.crm).toMatchObject({ enabled: false, mailingEnabled: false });
    expect(result.current.features.isEnabled("webinars")).toBe(false);
  });

  it("does not carry unlimited access into another organization", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.limits.canAddStudent).toBe(true));
    rerender({ org: "other" });
    expect(result.current.limits.canAddStudent).toBe(false);
    await waitFor(() => expect(result.current.limits.loading).toBe(false));
    expect(result.current.limits.isPostpaid).toBe(false);
    expect(result.current.limits.canAddStudent).toBe(false);
    expect(result.current.crm.mailingEnabled).toBe(false);
  });

  it("rejects an otherwise valid access profile for another organization", async () => {
    access = profile("foreign");
    await expect(fetchPostpaidAccessProfile("org")).rejects.toThrow("Сервер не подтвердил");
  });
});
