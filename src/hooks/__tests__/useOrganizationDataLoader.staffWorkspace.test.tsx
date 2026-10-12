import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrganizationDataLoader } from "../useOrganizationDataLoader";

const mocks = vi.hoisted(() => ({
  profile: vi.fn(), owner: vi.fn(), memberships: vi.fn(), core: vi.fn(), dataQuery: vi.fn(), adminView: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/utils/adminViewOrg", () => ({ resolveAdminViewOrg: mocks.adminView }));
vi.mock("sonner", () => ({ toast: { error: mocks.toast, loading: vi.fn(), dismiss: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (name: string, args: unknown) => name === "get_organization_core" ? mocks.core(args) : mocks.owner(name, args),
  from: (table: string) => {
    if (table === "organizations") throw new Error("Staff cannot SELECT the full organization row");
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (column: string, value: string) => { filters[column] = value; return query; },
      or: () => mocks.memberships(),
      maybeSingle: () => table === "profiles" ? mocks.profile() : mocks.dataQuery(table, filters),
      order: () => mocks.dataQuery(table, filters),
    };
    return query;
  },
} }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adminView.mockResolvedValue({ status: "none" });
  mocks.profile.mockResolvedValue({ data: { organization_id: "old-student-school" }, error: null });
  mocks.owner.mockResolvedValue({ data: false, error: null });
  mocks.core.mockResolvedValue({ data: { name: "Рабочая организация", frdo_enabled: true }, error: null });
  mocks.memberships.mockResolvedValue({ data: [{
    organization_id: "new-staff-school", role: "teacher", expires_at: null, sections_access: [],
  }], error: null });
  mocks.dataQuery.mockResolvedValue({ data: [], error: null });
});
afterEach(cleanup);

describe("organization dashboard staff workspace", () => {
  it("scopes all dashboard data to the sole active staff organization instead of the old student's school", async () => {
    const { result } = renderHook(() => useOrganizationDataLoader({ userId: "invited-student" }));
    await waitFor(() => expect(result.current.isLoadingCourses).toBe(false));
    expect(result.current.organizationId).toBe("new-staff-school");
    expect(result.current.organizationName).toBe("Рабочая организация");
    expect(result.current.isFrdoEnabled).toBe(true);
    expect(result.current.coursesError).toBeNull();
    expect(mocks.core).toHaveBeenCalledExactlyOnceWith({ p_org_id: "new-staff-school" });
    expect(mocks.dataQuery.mock.calls).toEqual([
      ["courses", { organization_id: "new-staff-school" }],
      ["course_categories", { organization_id: "new-staff-school" }],
      ["companies", { organization_id: "new-staff-school" }],
    ]);
  });

  it("shows an explicit error and reads no tenant data for ambiguous memberships", async () => {
    mocks.memberships.mockResolvedValue({ data: [
      { organization_id: "first", role: "teacher", expires_at: null, sections_access: [] },
      { organization_id: "second", role: "teacher", expires_at: null, sections_access: [] },
    ], error: null });
    const { result } = renderHook(() => useOrganizationDataLoader({ userId: "staff" }));
    await waitFor(() => expect(result.current.isLoadingCourses).toBe(false));
    expect(result.current.organizationId).toBeNull();
    expect(result.current.coursesError).toContain("нескольким организациям");
    expect(mocks.dataQuery).not.toHaveBeenCalled();
    expect(mocks.core).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining("нескольким организациям"), expect.any(Object));
  });

  it("clears the previously selected tenant when a refresh cannot confirm access", async () => {
    const { result } = renderHook(() => useOrganizationDataLoader({ userId: "staff" }));
    await waitFor(() => expect(result.current.organizationId).toBe("new-staff-school"));
    await waitFor(() => expect(result.current.isLoadingCourses).toBe(false));
    mocks.memberships.mockResolvedValue({ data: null, error: { code: "42501" } });
    act(() => result.current.refreshData());
    await waitFor(() => expect(result.current.coursesError).toContain("Не удалось подтвердить доступ"));
    expect(result.current.organizationId).toBeNull();
    expect(mocks.dataQuery).toHaveBeenCalledTimes(3);
    expect(mocks.core).toHaveBeenCalledTimes(1);
  });

  it("preserves the confirmed global administrator's selected organization", async () => {
    mocks.adminView.mockResolvedValue({ status: "admin", view: { id: "viewed-org", name: "Просмотр" } });
    const { result } = renderHook(() => useOrganizationDataLoader({ userId: "global-admin" }));
    await waitFor(() => expect(result.current.isLoadingCourses).toBe(false));
    expect(result.current.organizationId).toBe("viewed-org");
    expect(result.current.isAdminView).toBe(true);
    expect(mocks.core).toHaveBeenCalledExactlyOnceWith({ p_org_id: "viewed-org" });
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.memberships).not.toHaveBeenCalled();
  });

  it("does not hide courses if optional organization metadata is unavailable", async () => {
    mocks.core.mockResolvedValue({ data: null, error: { code: "42501" } });
    const { result } = renderHook(() => useOrganizationDataLoader({ userId: "teacher" }));
    await waitFor(() => expect(result.current.isLoadingCourses).toBe(false));
    expect(result.current.organizationId).toBe("new-staff-school");
    expect(result.current.coursesError).toBeNull();
    expect(mocks.dataQuery).toHaveBeenCalledWith("courses", { organization_id: "new-staff-school" });
  });
});
