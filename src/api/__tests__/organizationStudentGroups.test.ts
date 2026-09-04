import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
import { fetchOrganizationStudentGroups } from "@/api/organizationStudentGroups";
import { qk } from "@/lib/queryKeys";

const rows = [{ id: "group-1", name: "Первая группа", organization_id: "org-1", color: "blue", created_at: "2026-09-04", start_date: null, end_date: null }];
let queryClient: QueryClient;
const read = (organizationId = "org-1") => queryClient.fetchQuery({
  queryKey: qk.org.studentGroups(organizationId),
  queryFn: () => fetchOrganizationStudentGroups(organizationId),
  staleTime: 60_000,
});

describe("shared organization student group directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.order.mockResolvedValue({ data: rows, error: null });
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(() => queryClient.clear());

  it("reads only this organization's groups with the same shape for both consumers", async () => {
    expect(await fetchOrganizationStudentGroups("org-1")).toEqual(rows);
    expect(mocks.from).toHaveBeenCalledWith("student_groups");
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(mocks.order).toHaveBeenCalledWith("name");
    expect(mocks.select).toHaveBeenCalledWith("id, name, color, organization_id, created_at, start_date, end_date");
  });

  it.each([null, undefined, ""])("does not read without organization scope: %s", async org => {
    expect(await fetchOrganizationStudentGroups(org)).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("permits a genuinely empty successful directory", async () => {
    mocks.order.mockResolvedValue({ data: [], error: null });
    expect(await read()).toEqual([]);
    expect(queryClient.getQueryState(qk.org.studentGroups("org-1"))?.status).toBe("success");
  });

  it.each(["returned", "thrown"])("does not poison the dialog cache after a %s list read failure", async kind => {
    const error = new Error("Group read unavailable");
    if (kind === "returned") mocks.order.mockResolvedValueOnce({ data: null, error });
    else mocks.order.mockRejectedValueOnce(error);
    await expect(read()).rejects.toBe(error);
    expect(queryClient.getQueryData(qk.org.studentGroups("org-1"))).toBeUndefined();
    expect(queryClient.getQueryState(qk.org.studentGroups("org-1"))?.status).toBe("error");
    // Opening the other consumer immediately must retry, not reuse [] for 60s.
    expect(await read()).toEqual(rows);
    expect(mocks.order).toHaveBeenCalledTimes(2);
  });

  it("keeps prior data and an error instead of replacing it with an empty success on refresh", async () => {
    await read();
    await queryClient.invalidateQueries({ queryKey: qk.org.studentGroups("org-1"), refetchType: "none" });
    const error = new Error("offline");
    mocks.order.mockResolvedValueOnce({ data: null, error });
    await expect(read()).rejects.toBe(error);
    expect(queryClient.getQueryData(qk.org.studentGroups("org-1"))).toEqual(rows);
    expect(queryClient.getQueryState(qk.org.studentGroups("org-1"))?.status).toBe("error");
  });

  it("keeps directory caches separated by organization", async () => {
    await read();
    mocks.order.mockResolvedValueOnce({ data: [], error: null });
    expect(await read("org-2")).toEqual([]);
    expect(queryClient.getQueryData(qk.org.studentGroups("org-1"))).toEqual(rows);
    expect(mocks.eq).toHaveBeenLastCalledWith("organization_id", "org-2");
  });
});
