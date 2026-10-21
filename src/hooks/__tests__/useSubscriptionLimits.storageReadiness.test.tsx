import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSubscriptionLimits } from "../useSubscriptionLimits";

const mocks = vi.hoisted(() => ({
  organization: vi.fn(), courses: vi.fn(), capacity: vi.fn(), trained: vi.fn(), access: vi.fn(), storage: vi.fn(),
  realtime: new Map<string, (payload: { new: { subscription_plan: string } }) => void>(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let organizationId: string;
      const reply = () => (table === "organizations" ? mocks.organization : mocks.courses)(organizationId);
      const chain = {
        select: () => chain,
        eq: (_column: string, value: string) => { organizationId = value; return chain; },
        is: () => chain,
        single: () => reply(),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(reply()).then(resolve, reject),
      };
      return chain;
    },
    rpc: (name: string, args: Record<string, string>) => {
      if (name === "get_postpaid_access_profile") return mocks.access(args.p_organization_id);
      if (name === "get_organization_student_capacity") return mocks.capacity(args.p_organization_id);
      if (name === "get_organization_training_capacity") return mocks.trained(args.p_organization_id);
      throw new Error(`Unexpected RPC: ${name}`);
    },
    channel: () => {
      const channel = {
        on: (_event: string, filter: { filter: string }, callback: (payload: { new: { subscription_plan: string } }) => void) => { mocks.realtime.set(filter.filter, callback); return channel; },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));
vi.mock("@/lib/storage/organizationStorageUsage", () => ({
  getOrganizationStorageUsage: (_client: unknown, organizationId: string) => mocks.storage(organizationId),
}));

type Reply = { data: unknown; error: unknown; count?: number };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const success = (data: unknown): Reply => ({ data, error: null });
const profile = (organizationId: string, active = true) => success({
  organization_id: organizationId,
  active,
  billing_mode: active ? "postpaid" : "prepaid",
  limits: active ? { maxCourses: -1, maxStudents: -1, maxTrainedStudents: -1 } : null,
  features: { crm: false, webinar: false, videoserviceplus: false, frdoplus: false },
});
const org = success({ subscription_plan: "start", custom_enabled_categories: [] });
const queryClients: QueryClient[] = [];

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: Infinity } } });
  queryClients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(({ organizationId }) => useSubscriptionLimits(organizationId), { wrapper, initialProps: { organizationId: "org-a" as string | null } });
}
function expectDenied(state: ReturnType<typeof useSubscriptionLimits>, reason?: "checking" | "verification_error" | "quota") {
  if (reason !== "quota") expect(state.accessReady).toBe(false);
  expect(state.canCreateCourse).toBe(false);
  expect(state.canAddStudent).toBe(false);
  expect(state.canCompleteCourse).toBe(false);
  for (const kind of ["course", "student", "trained"] as const) {
    expect(state.checkLimit(kind).allowed).toBe(false);
    if (reason) expect(state.checkLimit(kind).reason).toBe(reason);
  }
  if (reason !== "quota") {
    expect(state.checkLimit("course_settings").allowed).toBe(false);
    if (reason) expect(state.checkLimit("course_settings").reason).toBe(reason);
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.realtime.clear();
  mocks.organization.mockResolvedValue(org);
  mocks.courses.mockResolvedValue({ data: null, count: 2, error: null });
  mocks.capacity.mockResolvedValue(success({ current_students: 3 }));
  mocks.trained.mockResolvedValue(success({ current_trainings: 4 }));
  mocks.access.mockImplementation(async (id: string) => profile(id));
  mocks.storage.mockImplementation(() => { throw new Error("Generic access checks must not scan file storage"); });
});
afterEach(() => {
  expect(mocks.storage).not.toHaveBeenCalled();
  cleanup();
  for (const client of queryClients.splice(0)) client.clear();
  vi.restoreAllMocks();
});

describe("generic subscription access does not scan file storage", () => {
  it.each([true, false])("allows confirmed %s-postpaid access without starting a storage scan", async postpaid => {
    mocks.access.mockImplementation(async (id: string) => profile(id, postpaid));
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.isPostpaid).toBe(postpaid);
    expect(result.current.accessReady).toBe(true);
    expect(result.current.canCreateCourse).toBe(true);
    expect(result.current.canAddStudent).toBe(true);
    expect(result.current.canCompleteCourse).toBe(true);
    expect(result.current.limits.maxCourses).toBe(postpaid ? -1 : 15);
    expect(result.current.usage.storageUsedBytes).toBe(0);
    expect(mocks.organization).toHaveBeenCalledWith("org-a");
    expect(mocks.courses).toHaveBeenCalledWith("org-a");
    expect(mocks.capacity).toHaveBeenCalledWith("org-a");
    expect(mocks.trained).toHaveBeenCalledWith("org-a");
    expect(mocks.storage).not.toHaveBeenCalled();
  });

  it.each(["organization", "courses", "capacity", "trained"] as const)("waits for the %s prerequisite before permitting access", async prerequisite => {
    const core = deferred<Reply>();
    mocks[prerequisite].mockReturnValue(core.promise);
    const { result } = setup();
    await waitFor(() => expect(result.current.isPostpaid).toBe(true));
    expect(result.current.loading).toBe(true);
    expectDenied(result.current, "checking");
    expect(mocks.storage).not.toHaveBeenCalled();
    await act(async () => {
      core.resolve(prerequisite === "organization" ? org : prerequisite === "courses" ? { data: null, count: 2, error: null } : success(prerequisite === "capacity" ? { current_students: 3 } : { current_trainings: 4 }));
    });
    await waitFor(() => expect(result.current.canAddStudent).toBe(true));
  });

  it.each(["organization", "courses", "capacity", "trained"] as const)("keeps failed %s verification closed even with confirmed postpayment", async prerequisite => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks[prerequisite].mockResolvedValue({ data: null, error: new Error("core unavailable") });
    const { result } = setup();
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
      expect(result.current.isPostpaid).toBe(true);
    });
    expectDenied(result.current, "verification_error");
    expect(mocks.storage).not.toHaveBeenCalled();
  });

  it("does not grant access while the postpaid profile is pending", async () => {
    const access = deferred<Reply>();
    mocks.access.mockReturnValue(access.promise);
    const { result } = setup();
    await waitFor(() => expect(mocks.trained).toHaveBeenCalledWith("org-a"));
    expect(result.current.loading).toBe(true);
    expectDenied(result.current, "checking");
    await act(async () => { access.resolve(profile("org-a")); });
    await waitFor(() => expect(result.current.canAddStudent).toBe(true));
  });

  it("does not grant access when the postpaid profile fails", async () => {
    mocks.access.mockResolvedValue({ data: null, error: new Error("billing unavailable") });
    const { result } = setup();
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expectDenied(result.current, "verification_error");
  });

  it("keeps confirmed prepaid capacity restrictions without a storage scan", async () => {
    mocks.access.mockImplementation(async (id: string) => profile(id, false));
    mocks.courses.mockResolvedValue({ data: null, count: 15, error: null });
    mocks.capacity.mockResolvedValue(success({ current_students: 100 }));
    mocks.trained.mockResolvedValue(success({ current_trainings: 60 }));
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.accessReady).toBe(true);
    expect(result.current.canCreateCourse).toBe(false);
    expect(result.current.canCompleteCourse).toBe(false);
    expect(result.current.checkLimit("trained")).toMatchObject({ allowed: false, reason: "quota" });
    expect(result.current.canAddStudent).toBe(true);
    expect(result.current.checkLimit("student")).toMatchObject({ allowed: true });
    expect(mocks.storage).not.toHaveBeenCalled();
  });

  it.each([null, {}, { current_trainings: -1 }, { current_trainings: "4" }])("keeps unconfirmed monthly training usage closed: %j", async data => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.trained.mockResolvedValue(success(data));
    const { result } = setup();
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expectDenied(result.current, "verification_error");
  });

  it("allows the 60th Start completion and stores unlimited personal files", async () => {
    mocks.access.mockImplementation(async (id: string) => profile(id, false));
    mocks.capacity.mockResolvedValue(success({ current_students: 100 }));
    mocks.trained.mockResolvedValue(success({ current_trainings: 59 }));
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.limits.maxTrainedPerMonth).toBe(60);
    expect(result.current.canCompleteCourse).toBe(true);
    expect(result.current.canAddStudent).toBe(true);
    expect(result.current.usage.studentsCount).toBe(100);
    expect(result.current.usage.trainedThisMonth).toBe(59);
  });

  it("keeps access closed until the latest organization is verified without scanning storage", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.canAddStudent).toBe(true));
    rerender({ organizationId: "org-b" });
    expectDenied(result.current);
    await waitFor(() => expect(result.current.canAddStudent).toBe(true));
    expect(mocks.access).toHaveBeenCalledWith("org-b");
    expect(result.current.usage.storageUsedBytes).toBe(0);
  });

  it("finishes a refetch without starting storage work", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.canAddStudent).toBe(true));
    await act(async () => { await result.current.refetch(); });
    expect(result.current.loading).toBe(false);
    expect(result.current.canAddStudent).toBe(true);
    expect(mocks.organization).toHaveBeenCalledTimes(2);
    expect(mocks.storage).not.toHaveBeenCalled();
  });

  it("does not let a retry from a previous organization invalidate the current verification", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.canAddStudent).toBe(true));
    const oldRetry = result.current.refetch;
    const currentCore = deferred<Reply>();
    mocks.organization.mockImplementation((id: string) => id === "org-b" ? currentCore.promise : Promise.resolve(org));
    rerender({ organizationId: "org-b" });
    expectDenied(result.current, "checking");
    await act(async () => { await oldRetry(); });
    expect(mocks.organization.mock.calls.filter(([id]) => id === "org-a")).toHaveLength(1);
    await act(async () => { currentCore.resolve(org); });
    await waitFor(() => expect(result.current.canAddStudent).toBe(true));
    expect(result.current.loading).toBe(false);
  });

  it("ignores a captured old-organization realtime event after the new organization is ready", async () => {
    mocks.access.mockImplementation(async (id: string) => profile(id, false));
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    const oldEvent = mocks.realtime.get("id=eq.org-a")!;
    rerender({ organizationId: "org-b" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plan).toBe("start");
    const requests = mocks.organization.mock.calls.length;
    await act(async () => { oldEvent({ new: { subscription_plan: "maximum" } }); });
    expect(result.current.plan).toBe("start");
    expect(result.current.limits.maxCourses).toBe(15);
    expect(result.current.canCreateCourse).toBe(true);
    expect(mocks.organization).toHaveBeenCalledTimes(requests);
  });

  it("ignores a captured realtime event after its subscription is removed", async () => {
    const { result, unmount } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    const oldEvent = mocks.realtime.get("id=eq.org-a")!;
    const requests = mocks.organization.mock.calls.length;
    unmount();
    await act(async () => { oldEvent({ new: { subscription_plan: "maximum" } }); });
    expect(mocks.organization).toHaveBeenCalledTimes(requests);
  });

  it.each([true, false])("classifies course settings only after confirmed %s-postpaid access", async postpaid => {
    mocks.organization.mockResolvedValue(success({ subscription_plan: "free", custom_enabled_categories: [] }));
    mocks.access.mockImplementation(async (id: string) => profile(id, postpaid));
    const { result } = setup();
    expect(result.current.checkLimit("course_settings")).toMatchObject({ allowed: false, reason: "checking" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Settings are currently included in both the free plan and postpayment.
    expect(result.current.checkLimit("course_settings")).toMatchObject({ allowed: true });
  });

  it("does not multiply storage lists when access checks mount in several editors", async () => {
    const first = setup();
    const second = setup();
    const third = setup();
    await waitFor(() => {
      expect(first.result.current.canAddStudent).toBe(true);
      expect(second.result.current.canAddStudent).toBe(true);
      expect(third.result.current.canAddStudent).toBe(true);
    });
    expect(mocks.storage).not.toHaveBeenCalled();
  });

  it("does not scan storage or preserve access after losing organization context", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.canAddStudent).toBe(true));
    rerender({ organizationId: null });
    expect(result.current.accessReady).toBe(false);
    expectDenied(result.current);
    expect(result.current.usage.storageUsedBytes).toBe(0);
  });
});
