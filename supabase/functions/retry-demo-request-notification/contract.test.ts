import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "supabase/functions/retry-demo-request-notification/index.ts"), "utf8");

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
    expect(source).toContain("attemptDemoTelegramDelivery(admin, record)");
  });
});
