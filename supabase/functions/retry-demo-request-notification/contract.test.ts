import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(
  resolve(process.cwd(), path),
  "utf8",
);

const source = read(
  "supabase/functions/retry-demo-request-notification/index.ts",
);
const submitSource = read(
  "supabase/functions/submit-demo-request/index.ts",
);
const sharedDeliverySource = read(
  "supabase/functions/_shared/demoTelegramDelivery.ts",
);

describe("retry demo Telegram notification bundle contract", () => {
  it("loads delivery code only from _shared for independent function deploys", () => {
    expect(source).toContain('from "../_shared/demoTelegramDelivery.ts"');
    expect(submitSource).toContain('from "../_shared/demoTelegramDelivery.ts"');
    expect(source).not.toMatch(/from\s+["']\.\.\/submit-demo-request\//);
    expect(submitSource).not.toMatch(/from\s+["']\.\.\/retry-demo-request-notification\//);
    expect(sharedDeliverySource).not.toMatch(
      /from\s+["']\.\.\/(submit-demo-request|retry-demo-request-notification)\//,
    );
  });
});

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
