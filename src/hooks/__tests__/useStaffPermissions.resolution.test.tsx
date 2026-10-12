import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffPermissionsProvider, useStaffPermissions } from "../useStaffPermissions";
import { StaffOrganizationResolutionError } from "@/utils/resolveStaffOrganization";

const mocks = vi.hoisted(() => ({
  auth: { user: { id: "user" } as { id: string } | null, userRole: "organization", loading: false },
  resolve: vi.fn(), admin: vi.fn(), toastError: vi.fn(), dismissToast: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, dismiss: mocks.dismissToast } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/utils/resolveStaffOrganization", async importOriginal => ({
  ...await importOriginal<typeof import("@/utils/resolveStaffOrganization")>(),
  resolveStaffOrganization: mocks.resolve,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    if (table !== "admin_staff") throw new Error(`Unexpected query: ${table}`);
    const query = { select: () => query, eq: () => query, maybeSingle: () => mocks.admin() };
    return query;
  },
} }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.user = { id: "user" };
  mocks.auth.userRole = "organization";
  mocks.auth.loading = false;
  mocks.resolve.mockResolvedValue({ kind: "staff", organizationId: "new-school", role: "teacher", sectionsAccess: [] });
  mocks.admin.mockResolvedValue({ data: null, error: null });
});
afterEach(cleanup);
const renderPermissions = () => renderHook(() => useStaffPermissions(), { wrapper: StaffPermissionsProvider });

describe("staff permissions use the resolved workspace", () => {
  it("keeps an effective organization role as teacher permissions rather than implicit ownership", async () => {
    const { result } = renderPermissions();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.organizationId).toBe("new-school");
    expect(result.current.isOrgOwner).toBe(false);
    expect(result.current.can("courses.read")).toBe(true);
    expect(result.current.can("staff.write")).toBe(false);
    expect(result.current.canSeeOrgTab("labor-safety")).toBe(false);
  });

  it.each(["LOAD_FAILED", "MULTIPLE_ORGANIZATIONS"] as const)("grants no permissions when workspace resolution returns %s", async code => {
    mocks.resolve.mockRejectedValue(new StaffOrganizationResolutionError(code, "Не удалось подтвердить доступ"));
    const { result } = renderPermissions();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Не удалось подтвердить доступ");
    expect(result.current.organizationId).toBeNull();
    expect(result.current.isOrgOwner).toBe(false);
    expect(result.current.orgPermissions.size).toBe(0);
    expect(result.current.canSeeOrgTab("unmapped-tab")).toBe(false);
  });

  it("grants owner permissions only for a confirmed owner resolution", async () => {
    mocks.resolve.mockResolvedValue({ kind: "owner", organizationId: "owned-school", role: "owner", sectionsAccess: [] });
    const { result } = renderPermissions();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.organizationId).toBe("owned-school");
    expect(result.current.isOrgOwner).toBe(true);
    expect(result.current.can("staff.write")).toBe(true);
  });

  it("grants no staff permissions for an expired or missing membership", async () => {
    mocks.resolve.mockResolvedValue({ kind: "none", organizationId: null, role: null, sectionsAccess: [] });
    const { result } = renderPermissions();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isOrgOwner).toBe(false);
    expect(result.current.orgPermissions.size).toBe(0);
    expect(result.current.canSeeOrgTab("courses")).toBe(false);
  });

  it("does not carry an old owner's rights into another user's pending resolution", async () => {
    mocks.resolve.mockResolvedValueOnce({ kind: "owner", organizationId: "owned-school", role: "owner", sectionsAccess: [] });
    const { result, rerender } = renderPermissions();
    await waitFor(() => expect(result.current.isOrgOwner).toBe(true));
    mocks.resolve.mockReturnValue(new Promise(() => {}));
    mocks.auth.user = { id: "different-user" };
    rerender();
    expect(result.current.loading).toBe(true);
    expect(result.current.isOrgOwner).toBe(false);
    expect(result.current.can("staff.write")).toBe(false);
  });

  it("preserves global administrator section restrictions", async () => {
    mocks.auth.userRole = "admin";
    mocks.admin.mockResolvedValue({ data: { role: "viewer" }, error: null });
    const { result } = renderPermissions();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.can("labor_safety.write")).toBe(true);
    expect(result.current.canSeeAdminTab("staff")).toBe(false);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("retains the global admin fallback only after a successful empty admin_staff query", async () => {
    mocks.auth.userRole = "admin";
    const { result } = renderPermissions();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canSeeAdminTab("staff")).toBe(true);
  });

  it("does not turn an admin_staff query failure into the unrestricted fallback", async () => {
    mocks.auth.userRole = "admin";
    mocks.admin.mockResolvedValue({ data: null, error: { code: "42501" } });
    const { result } = renderPermissions();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.canSeeAdminTab("staff")).toBe(false);
    expect(result.current.can("staff.write")).toBe(false);
  });

  it("provides an explicit retry action for a permissions failure and dismisses the error after recovery", async () => {
    mocks.resolve.mockRejectedValueOnce(new StaffOrganizationResolutionError("LOAD_FAILED", "Не удалось подтвердить доступ"));
    const { result } = renderPermissions();
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    const options = mocks.toastError.mock.calls[0][1];
    expect(options.action.label).toBe("Повторить");
    expect(options.duration).toBe(Infinity);
    act(() => options.action.onClick());
    await waitFor(() => expect(result.current.can("courses.read")).toBe(true));
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(mocks.dismissToast).toHaveBeenCalledWith(options.id);
  });

  it.each(["student", "company", "sales_manager"])("does not issue staff queries or permission-error notices for an ordinary %s account", async role => {
    mocks.auth.userRole = role;
    const { result } = renderPermissions();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(result.current.orgPermissions.size).toBe(0);
  });

  it("waits for authentication to finish before resolving permissions", async () => {
    mocks.auth.loading = true;
    const { result, rerender } = renderPermissions();
    expect(result.current.loading).toBe(true);
    expect(mocks.resolve).not.toHaveBeenCalled();
    mocks.auth.loading = false;
    rerender();
    await waitFor(() => expect(result.current.can("courses.read")).toBe(true));
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
  });
});
