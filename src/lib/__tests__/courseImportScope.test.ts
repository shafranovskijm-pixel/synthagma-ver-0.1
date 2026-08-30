import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCourseImportScope } from "@/lib/courseImportScope";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  resolveAdminViewOrg: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));

vi.mock("@/utils/adminViewOrg", () => ({
  resolveAdminViewOrg: mocks.resolveAdminViewOrg,
}));

describe("resolveCourseImportScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAdminViewOrg.mockResolvedValue({ status: "none" });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "current_organization_id") return { data: "org-1", error: null };
      if (name === "can_access_organization") return { data: true, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    });
  });

  it("uses the server current organization and verifies courses.write", async () => {
    await expect(resolveCourseImportScope({
      userId: "user-1",
      userRole: "organization",
      requestedOrganizationId: "org-1",
    })).resolves.toEqual({
      organizationId: "org-1",
      source: "current_organization",
    });

    expect(mocks.rpc).toHaveBeenCalledWith("can_access_organization", {
      _organization_id: "org-1",
      _permission: "courses.write",
    });
  });

  it("treats a query organization as a consistency check, not a tenant selector", async () => {
    const promise = resolveCourseImportScope({
      userId: "user-1",
      userRole: "organization",
      requestedOrganizationId: "org-from-url",
    });

    await expect(promise).rejects.toMatchObject({
      code: "organization_mismatch",
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith("can_access_organization", expect.anything());
  });

  it("fails closed when courses.write is not granted", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "current_organization_id") return { data: "org-1", error: null };
      return { data: false, error: null };
    });

    await expect(resolveCourseImportScope({
      userId: "teacher-1",
      userRole: "organization",
      requestedOrganizationId: "org-1",
    })).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("uses only the verified admin view organization", async () => {
    mocks.resolveAdminViewOrg.mockResolvedValue({
      status: "admin",
      view: { id: "org-admin-view", name: "Client" },
    });

    await expect(resolveCourseImportScope({
      userId: "admin-1",
      userRole: "admin",
      requestedOrganizationId: "org-admin-view",
    })).resolves.toEqual({
      organizationId: "org-admin-view",
      source: "admin_view",
    });

    expect(mocks.rpc).not.toHaveBeenCalledWith("current_organization_id");
  });

  it("rejects an admin URL that differs from the verified view-as organization", async () => {
    mocks.resolveAdminViewOrg.mockResolvedValue({
      status: "admin",
      view: { id: "org-active", name: "Active" },
    });

    await expect(resolveCourseImportScope({
      userId: "admin-1",
      userRole: "admin",
      requestedOrganizationId: "org-other",
    })).rejects.toMatchObject({ code: "organization_mismatch" });
  });

  it("requires explicit admin view mode instead of accepting an arbitrary URL", async () => {
    await expect(resolveCourseImportScope({
      userId: "admin-1",
      userRole: "admin",
      requestedOrganizationId: "org-from-url",
    })).rejects.toMatchObject({ code: "admin_view_required" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fails closed while the authenticated role is still unknown", async () => {
    await expect(resolveCourseImportScope({
      userId: "user-1",
      userRole: null,
      requestedOrganizationId: "org-1",
    })).rejects.toMatchObject({ code: "scope_unavailable" });

    expect(mocks.resolveAdminViewOrg).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not fall back when admin-view verification is temporarily unknown", async () => {
    mocks.resolveAdminViewOrg.mockResolvedValue({ status: "unknown" });

    await expect(resolveCourseImportScope({
      userId: "admin-1",
      userRole: "admin",
      requestedOrganizationId: "org-1",
    })).rejects.toMatchObject({ code: "scope_unavailable" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
