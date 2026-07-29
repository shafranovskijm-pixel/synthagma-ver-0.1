import { describe, it, expect } from "vitest";
import { authorizeCampaignAction } from "@/lib/campaignAuthz";

const ORG_A = "00000000-0000-0000-0000-00000000000a";

// Baseline: someone signed in but with no elevated rights.
const baseUser = {
  isServiceRole: false,
  hasUser: true,
  isAdmin: false,
  hasSalesWrite: false,
};

describe("authorizeCampaignAction — phase 5C.1.a G1–G6", () => {
  // G1: student of the organization must not touch campaigns/SMTP.
  it("G1: student → 403 for run(org) and test_org_smtp", () => {
    const run = authorizeCampaignAction(baseUser, {
      kind: "run", scope: "org", organizationId: ORG_A,
    });
    const test = authorizeCampaignAction(baseUser, {
      kind: "test_org_smtp", organizationId: ORG_A,
    });
    expect(run).toEqual({ ok: false, status: 403, reason: "Forbidden" });
    expect(test).toEqual({ ok: false, status: 403, reason: "Forbidden" });
  });

  // G2: staff with sales.read only — CAN read via RLS (not tested here),
  // but the run/test Edge Function must reject (write action).
  it("G2: sales.read only → 403 for run(org) and test_org_smtp", () => {
    const salesReadOnly = { ...baseUser, hasSalesWrite: false };
    expect(
      authorizeCampaignAction(salesReadOnly, {
        kind: "run", scope: "org", organizationId: ORG_A,
      }),
    ).toEqual({ ok: false, status: 403, reason: "Forbidden" });
    expect(
      authorizeCampaignAction(salesReadOnly, {
        kind: "test_org_smtp", organizationId: ORG_A,
      }),
    ).toEqual({ ok: false, status: 403, reason: "Forbidden" });
  });

  // G3: staff with sales.write can configure SMTP and launch org campaign.
  it("G3: sales.write staff → OK for run(org) and test_org_smtp", () => {
    const salesWrite = { ...baseUser, hasSalesWrite: true };
    expect(
      authorizeCampaignAction(salesWrite, {
        kind: "run", scope: "org", organizationId: ORG_A,
      }).ok,
    ).toBe(true);
    expect(
      authorizeCampaignAction(salesWrite, {
        kind: "test_org_smtp", organizationId: ORG_A,
      }).ok,
    ).toBe(true);
  });

  // G4: owner and admin retain access. Owner is modelled by
  // can_access_organization returning true for sales.write. Admin is
  // modelled by isAdmin=true (global bypass).
  it("G4: owner (hasSalesWrite=true) and admin → OK", () => {
    const owner = { ...baseUser, hasSalesWrite: true };
    const admin = { ...baseUser, isAdmin: true, hasSalesWrite: false };
    expect(authorizeCampaignAction(owner, {
      kind: "run", scope: "org", organizationId: ORG_A,
    }).ok).toBe(true);
    expect(authorizeCampaignAction(admin, {
      kind: "run", scope: "org", organizationId: ORG_A,
    }).ok).toBe(true);
    expect(authorizeCampaignAction(admin, {
      kind: "run", scope: "platform", organizationId: null,
    }).ok).toBe(true);
    expect(authorizeCampaignAction(admin, { kind: "test_platform_smtp" }).ok).toBe(true);
  });

  // G5: staff of a different org must not launch a campaign for org A
  // even by supplying its UUID. hasSalesWrite is computed for the target
  // org, so a staff of org B gets hasSalesWrite=false here.
  it("G5: other-org staff → 403 (hasSalesWrite=false for target org)", () => {
    const otherOrgStaff = { ...baseUser, hasSalesWrite: false };
    expect(
      authorizeCampaignAction(otherOrgStaff, {
        kind: "run", scope: "org", organizationId: ORG_A,
      }),
    ).toEqual({ ok: false, status: 403, reason: "Forbidden" });
  });

  // G6: ordinary authenticated user cannot use platform SMTP test.
  it("G6: non-admin → 403 for test_platform_smtp and platform run", () => {
    expect(
      authorizeCampaignAction(baseUser, { kind: "test_platform_smtp" }),
    ).toEqual({ ok: false, status: 403, reason: "Forbidden" });
    expect(
      authorizeCampaignAction(baseUser, {
        kind: "run", scope: "platform", organizationId: null,
      }),
    ).toEqual({ ok: false, status: 403, reason: "Forbidden" });
  });

  it("service_role bypass works for cron internal calls", () => {
    const cron = { ...baseUser, hasUser: false, isServiceRole: true };
    expect(authorizeCampaignAction(cron, {
      kind: "run", scope: "org", organizationId: ORG_A,
    }).ok).toBe(true);
    expect(authorizeCampaignAction(cron, {
      kind: "run", scope: "platform", organizationId: null,
    }).ok).toBe(true);
  });

  it("no user, no service role → 401", () => {
    const anon = { ...baseUser, hasUser: false };
    expect(authorizeCampaignAction(anon, {
      kind: "run", scope: "org", organizationId: ORG_A,
    })).toEqual({ ok: false, status: 401, reason: "Unauthorized" });
  });

  it("missing organizationId on org-scoped action → 400", () => {
    const admin = { ...baseUser, isAdmin: true };
    expect(
      authorizeCampaignAction(admin, {
        kind: "test_org_smtp", organizationId: null,
      }),
    ).toEqual({ ok: false, status: 400, reason: "organizationId required" });
  });
});
