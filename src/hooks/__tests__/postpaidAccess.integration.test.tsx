import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useSubscriptionLimits } from "../useSubscriptionLimits";
import { useOrgCrmAccess } from "../useOrgCrmAccess";
import { useOrgFeatures } from "../useOrgFeatures";
import { fetchPostpaidAccessProfile, type PostpaidAccessProfile } from "@/lib/postpaidAccess";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), featureError: false, featureDeferred: null as Promise<unknown> | null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from,
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; }, removeChannel: vi.fn(),
} }));
vi.mock("@/hooks/useOrganizationCore", () => ({ useOrganizationCore: (org: string) => ({ data: { id: org, subscription_plan: "free", custom_enabled_categories: ["webinars"] }, isLoading: false, error: null, refetch: vi.fn(async () => {}) }) }));
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
  vi.clearAllMocks(); access = profile(); mocks.featureError = false; mocks.featureDeferred = null;
  mocks.rpc.mockImplementation(async (name, args) => {
    if (name === "get_postpaid_access_profile") return { data: args.p_organization_id === "org" ? access : profile(args.p_organization_id, false), error: null };
    if (name === "get_organization_student_capacity") return { data: { current_students: 500 }, error: null };
    if (name === "get_organization_training_capacity") return { data: { current_trainings: 900 }, error: null };
    if (name === "get_organization_core") return { data: { id: args.p_org_id, subscription_plan: "free", custom_enabled_categories: [] }, error: null };
    throw new Error(name);
  });
  mocks.from.mockImplementation(table => {
    const response = table === "organizations" ? { data: { subscription_plan: "free", custom_max_courses: 1, custom_max_students: 1, custom_max_trained_per_month: 1, custom_enabled_categories: ["webinars"] }, error: null }
      : table === "courses" ? { data: null, count: 80, error: null } : { data: [], error: mocks.featureError ? { message: "Synthetic feature availability outage" } : null };
    const responsePromise = table.includes("feature") && mocks.featureDeferred ? mocks.featureDeferred : Promise.resolve(response);
    const chain: any = { select: () => chain, eq: () => chain, is: () => chain, single: async () => response, then: (resolve: any, reject: any) => responsePromise.then(resolve, reject) };
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
    expect(result.current.limits.limits.maxStudents).toBe(1);
    expect(result.current.limits.usage.studentsCount).toBe(500);
    // A full assignment quota never caps creation or storage of personal files.
    expect(result.current.limits.canAddStudent).toBe(true);
    expect(result.current.limits.checkLimit("student").allowed).toBe(true);
    expect(result.current.limits.canCreateCourse).toBe(false);
    expect(result.current.limits.canCompleteCourse).toBe(false);
    expect(result.current.crm.mailingEnabled).toBe(false);
  });

  it("rejects an otherwise valid access profile for another organization", async () => {
    access = profile("foreign");
    await expect(fetchPostpaidAccessProfile("org")).rejects.toThrow("Сервер не подтвердил");
  });
});

describe("administrative feature grants and current-tenant verification", () => {
  it("enables all platform features without fabricating billable consent or changing the recorded plan", async () => {
    access = { ...profile(), entitlements: { all_platform_features: true } };
    const original = structuredClone(access);
    const { result } = setup();
    await waitFor(() => expect(result.current.features.ready && result.current.limits.accessReady && !result.current.crm.loading).toBe(true));
    expect(result.current.limits.plan).toBe("free");
    expect(result.current.limits.limits).toMatchObject({ salesCrmEnabled: true, webinarsEnabled: true, videoServicePlus: true, trainersEnabled: true, storageBytes: -1 });
    expect(result.current.crm.enabled).toBe(true);
    for (const key of ["courses", "library", "labor_safety", "services", "webinars"] as const) expect(result.current.features.isEnabled(key)).toBe(true);
    expect(access).toEqual(original);
    expect(access.features).toEqual({ crm: false, webinar: false, videoserviceplus: false, frdoplus: false });
  });
  it("does not honor a stale grant after the postpaid agreement ends", async () => {
    access = { ...profile("org", false), entitlements: { all_platform_features: true } };
    const { result } = setup();
    await waitFor(() => expect(result.current.features.ready && result.current.limits.accessReady).toBe(true));
    expect(result.current.limits.isPostpaid).toBe(false);
    expect(result.current.limits.limits.trainersEnabled).toBe(false);
    expect(result.current.crm.enabled).toBe(false);
    expect(result.current.limits.canCreateCourse).toBe(false);
  });
  it.each([null, { all_platform_features: "true" }, {}])("rejects malformed administrative entitlements %j", async entitlements => {
    access = { ...profile(), entitlements } as PostpaidAccessProfile;
    await expect(fetchPostpaidAccessProfile("org")).rejects.toThrow("Сервер не подтвердил");
  });
  it("keeps feature access unconfirmed while its own query is pending even when billing is ready", async () => {
    let resolveFeatures!: (value: unknown) => void;
    mocks.featureDeferred = new Promise(resolve => { resolveFeatures = resolve; });
    const { result } = setup();
    await waitFor(() => expect(result.current.limits.accessReady).toBe(true));
    expect(result.current.features).toMatchObject({ ready: false, loading: true, error: null });
    expect(result.current.features.isEnabled("courses")).toBe(false);
    await act(async () => { resolveFeatures({ data: [], error: null }); });
    await waitFor(() => expect(result.current.features.ready).toBe(true));
    expect(result.current.features.isEnabled("courses")).toBe(true);
  });
  it("withdraws stale feature data on a refetch error and recovers only after successful retry", async () => {
    const { result, client } = setup();
    await waitFor(() => expect(result.current.features.ready).toBe(true));
    mocks.featureError = true;
    await act(async () => { await client.invalidateQueries({ queryKey: ["org-features", "org"] }); });
    await waitFor(() => expect(result.current.features.error).not.toBeNull());
    expect(result.current.features).toMatchObject({ ready: false, loading: false });
    expect(result.current.features.isEnabled("courses")).toBe(false);
    expect(result.current.limits.accessReady).toBe(true);
    mocks.featureError = false;
    await act(async () => { await result.current.features.refetch(); });
    await waitFor(() => expect(result.current.features.ready).toBe(true));
    expect(result.current.features.error).toBeNull();
    expect(result.current.features.isEnabled("courses")).toBe(true);
  });
});
