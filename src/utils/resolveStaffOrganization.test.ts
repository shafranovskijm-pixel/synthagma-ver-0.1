import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveStaffOrganization } from "./resolveStaffOrganization";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), memberships: vi.fn(), owner: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: mocks.from,
  rpc: mocks.owner,
} }));

const member = (organization_id: string, expires_at: string | null = null) => ({
  organization_id, role: "teacher", sections_access: ["labor_safety.read"], expires_at,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T00:00:00Z"));
  mocks.profile.mockResolvedValue({ data: { organization_id: "old-school" }, error: null });
  mocks.owner.mockResolvedValue({ data: false, error: null });
  mocks.memberships.mockResolvedValue({ data: [member("staff-school")], error: null });
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: () => mocks.profile(),
      or: () => mocks.memberships(),
    };
    if (!["profiles", "org_staff"].includes(table)) throw new Error(`Unexpected read: ${table}`);
    return query;
  });
});
afterEach(() => vi.useRealTimers());

describe("resolveStaffOrganization", () => {
  it("opens the sole staff workspace despite a student's profile belonging to another school", async () => {
    await expect(resolveStaffOrganization("student-now-staff")).resolves.toEqual({
      kind: "staff", organizationId: "staff-school", role: "teacher", sectionsAccess: ["labor_safety.read"],
    });
    expect(mocks.owner).toHaveBeenCalledExactlyOnceWith("is_org_owner", {
      _user_id: "student-now-staff", _organization_id: "old-school",
    });
  });

  it("preserves a confirmed owner's workspace even when they are staff elsewhere", async () => {
    mocks.owner.mockResolvedValue({ data: true, error: null });
    await expect(resolveStaffOrganization("owner")).resolves.toEqual({
      kind: "owner", organizationId: "old-school", role: "owner", sectionsAccess: [],
    });
    expect(mocks.memberships).not.toHaveBeenCalled();
  });

  it.each(["profile", "owner", "memberships"] as const)("does not infer a workspace when the %s query fails", async (query) => {
    mocks[query].mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(resolveStaffOrganization("user")).rejects.toMatchObject({ code: "LOAD_FAILED" });
  });

  it("does not choose an arbitrary organization when more than one membership is active", async () => {
    mocks.memberships.mockResolvedValue({ data: [member("first"), member("second")], error: null });
    await expect(resolveStaffOrganization("user")).rejects.toMatchObject({ code: "MULTIPLE_ORGANIZATIONS" });
  });

  it("excludes expired memberships, including one that expires exactly now", async () => {
    mocks.memberships.mockResolvedValue({ data: [
      member("expired", "2026-10-11T23:59:59Z"),
      member("expires-now", "2026-10-12T00:00:00Z"),
      member("active", "2026-10-12T01:00:00Z"),
    ], error: null });
    await expect(resolveStaffOrganization("user")).resolves.toMatchObject({ kind: "staff", organizationId: "active" });
  });

  it("does not fall back to the student's school when all staff access has expired", async () => {
    mocks.memberships.mockResolvedValue({ data: [member("expired", "2026-10-11T23:59:59Z")], error: null });
    await expect(resolveStaffOrganization("user")).resolves.toMatchObject({ kind: "none", organizationId: null, role: null });
  });

  it("does not treat an unavailable ownership result as false", async () => {
    mocks.owner.mockResolvedValue({ data: null, error: null });
    await expect(resolveStaffOrganization("user")).rejects.toMatchObject({ code: "LOAD_FAILED" });
    expect(mocks.memberships).not.toHaveBeenCalled();
  });
});
