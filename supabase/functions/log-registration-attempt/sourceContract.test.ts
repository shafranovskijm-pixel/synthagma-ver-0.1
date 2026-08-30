import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/log-registration-attempt/index.ts"),
  "utf8",
);
const migrationSource = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260830224000_registration_attempt_delivery_claims.sql"),
  "utf8",
);

describe("log-registration-attempt deployment contract", () => {
  it("uses persistent opaque claims and awaits failure delivery", () => {
    expect(indexSource).toContain('admin.rpc("claim_registration_attempt_rate"');
    expect(indexSource).toContain('admin.rpc("claim_registration_failure_alert"');
    expect(indexSource).toContain('admin.rpc("complete_registration_failure_alert"');
    expect(indexSource).toContain("await notifyTelegramOnFailure");
    expect(indexSource).toContain("await completeFailureAlert");
    expect(indexSource).toContain("hmacSha256Hex");
    expect(indexSource).not.toContain("new Map");
  });

  it("checks per-client budgets before consuming global budgets", () => {
    const failureStart = indexSource.indexOf("async function notifyTelegramOnFailure");
    const failureEnd = indexSource.indexOf("const identity =", failureStart);
    const failureRateSection = indexSource.slice(failureStart, failureEnd);
    expect(failureRateSection.indexOf('"failure_client"')).toBeGreaterThan(-1);
    expect(failureRateSection.indexOf('"failure_client"')).toBeLessThan(
      failureRateSection.indexOf('"failure_global"'),
    );

    const eventStart = indexSource.indexOf("const clientIdentity =");
    const eventEnd = indexSource.indexOf("const row = rowFromPayload", eventStart);
    const eventRateSection = indexSource.slice(eventStart, eventEnd);
    expect(eventRateSection.indexOf('"event_client"')).toBeGreaterThan(-1);
    expect(eventRateSection.indexOf('"event_client"')).toBeLessThan(
      eventRateSection.indexOf('"event_global"'),
    );
  });

  it("keeps the claim table and RPC service-only", () => {
    expect(migrationSource).toContain("registration_attempt_rate_limits");
    expect(migrationSource).toContain("registration_failure_alert_claims");
    expect(migrationSource).toContain("REVOKE ALL ON TABLE public.registration_attempt_rate_limits FROM PUBLIC, anon, authenticated");
    expect(migrationSource).toContain("REVOKE ALL ON TABLE public.registration_failure_alert_claims FROM PUBLIC, anon, authenticated");
    expect(migrationSource).toContain("REVOKE ALL ON FUNCTION public.claim_registration_attempt_rate");
    expect(migrationSource).toContain("REVOKE ALL ON FUNCTION public.claim_registration_failure_alert");
    expect(migrationSource).toContain("REVOKE ALL ON FUNCTION public.complete_registration_failure_alert");
    expect(migrationSource).toContain("Every call inserts a row, including a byte-for-byte replay");
    expect(migrationSource).toContain("state text NOT NULL DEFAULT 'pending'");
    expect(migrationSource).toContain("state = 'delivered'");
    expect(migrationSource).toContain("TO service_role");
  });
});
