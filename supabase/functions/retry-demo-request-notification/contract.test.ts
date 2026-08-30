import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(
    process.cwd(),
    "supabase/functions/retry-demo-request-notification/index.ts",
  ),
  "utf8",
);

describe("retry demo Telegram notification authorization contract", () => {
  it("requires a real user and the platform admin role before service-role access", () => {
    const getUser = source.indexOf("auth.getUser()");
    const roleGate = source.indexOf('userClient.rpc("has_role"');
    const adminClient = source.indexOf("const admin = createClient");
    expect(getUser).toBeGreaterThan(-1);
    expect(roleGate).toBeGreaterThan(getUser);
    expect(adminClient).toBeGreaterThan(roleGate);
    expect(source).toContain("isAdmin !== true");
  });

  it("loads only the requested durable notification and validates its kind", () => {
    expect(source).toContain('.eq("id", notificationId)');
    expect(source).toContain("isDemoNotificationRecord(record)");
    expect(source).toMatch(
      /attemptDemoTelegramDelivery\(\s*admin,\s*record,\s*\{\s*preclaimedKey,?\s*\}/,
    );
  });

  it("requires an explicit duplicate-risk acknowledgement for an uncertain force retry", () => {
    expect(source).toContain("force_retry_confirmation_required");
    expect(source).toContain("DEMO_FORCE_RETRY_CONFIRMATION");
    expect(source).toMatch(
      /forceReclaimDemoTelegramClaim\(\s*admin,\s*metadata\s*\)/,
    );
    expect(source).toContain("confirmDemoTelegramDelivery(admin, record)");
    expect(source).toContain("duplicate_risk: true");
    expect(source).toContain("preclaimedKey = forceClaim.claim_key");
  });
});
