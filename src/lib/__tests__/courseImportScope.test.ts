import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCourseImportScope } from "@/lib/courseImportScope";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  profile: vi.fn(),
  memberships: vi.fn(),
  resolveAdminViewOrg: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));

vi.mock("@/utils/adminViewOrg", () => ({
  resolveAdminViewOrg: mocks.resolveAdminViewOrg,
}));

describe("resolveCourseImportScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAdminViewOrg.mockResolvedValue({ status: "none" });
    mocks.profile.mockResolvedValue({ data: { organization_id: "org-1" }, error: null });
    mocks.memberships.mockResolvedValue({
      data: [{ organization_id: "org-1", role: "course_editor", sections_access: [], expires_at: null }], error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      if (!["profiles", "org_staff"].includes(table)) throw new Error(`Unexpected table: ${table}`);
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => mocks.profile(),
        or: () => mocks.memberships(),
      };
      return query;
    });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "is_org_owner") return { data: false, error: null };
      if (name === "can_access_organization") return { data: true, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    });
  });

  it("uses the confirmed staff workspace and verifies courses.write", async () => {
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
      if (name === "is_org_owner") return { data: false, error: null };
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
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("can_access_organization", {
      _organization_id: "org-admin-view", _permission: "courses.write",
    });
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

  it("uses the invited employee's new staff organization instead of the old learner profile school", async () => {
    mocks.profile.mockResolvedValue({ data: { organization_id: "old-learner-school" }, error: null });
    mocks.memberships.mockResolvedValue({ data: [{
      organization_id: "new-staff-school", role: "course_editor", sections_access: [], expires_at: null,
    }], error: null });

    await expect(resolveCourseImportScope({
      userId: "former-learner", userRole: "organization", requestedOrganizationId: "new-staff-school",
    })).resolves.toEqual({ organizationId: "new-staff-school", source: "current_organization" });
    expect(mocks.rpc).toHaveBeenCalledWith("can_access_organization", {
      _organization_id: "new-staff-school", _permission: "courses.write",
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith("current_organization_id");
  });

  it("does not use a URL to resolve ambiguous staff memberships", async () => {
    mocks.memberships.mockResolvedValue({ data: [
      { organization_id: "org-1", role: "course_editor", sections_access: [], expires_at: null },
      { organization_id: "org-2", role: "course_editor", sections_access: [], expires_at: null },
    ], error: null });

    await expect(resolveCourseImportScope({
      userId: "staff", userRole: "organization", requestedOrganizationId: "org-1",
    })).rejects.toMatchObject({ code: "scope_unavailable" });
    expect(mocks.rpc).not.toHaveBeenCalledWith("can_access_organization", expect.anything());
  });

  it("retains a confirmed owner's organization even if they have a staff membership elsewhere", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(resolveCourseImportScope({
      userId: "owner", userRole: "organization", requestedOrganizationId: "org-1",
    })).resolves.toMatchObject({ organizationId: "org-1" });
    expect(mocks.memberships).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("can_access_organization", {
      _organization_id: "org-1", _permission: "courses.write",
    });
  });

  it("reports organization_not_found when no staff access remains without falling back to the learner profile", async () => {
    mocks.memberships.mockResolvedValue({ data: [], error: null });

    await expect(resolveCourseImportScope({
      userId: "expired-staff", userRole: "organization", requestedOrganizationId: "org-1",
    })).rejects.toMatchObject({ code: "organization_not_found" });
    expect(mocks.rpc).not.toHaveBeenCalledWith("can_access_organization", expect.anything());
  });

  it("keeps scope_unavailable mapping for a failed membership read", async () => {
    mocks.memberships.mockResolvedValue({ data: null, error: { code: "42501" } });

    await expect(resolveCourseImportScope({
      userId: "staff", userRole: "organization",
    })).rejects.toMatchObject({ code: "scope_unavailable" });
    expect(mocks.rpc).not.toHaveBeenCalledWith("can_access_organization", expect.anything());
  });

  it("keeps scope_unavailable mapping for an unavailable write authorization check", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "is_org_owner"
      ? { data: false, error: null }
      : { data: null, error: { code: "PGRST" } });

    await expect(resolveCourseImportScope({
      userId: "staff", userRole: "organization",
    })).rejects.toMatchObject({ code: "scope_unavailable" });
  });
});
