/**
 * Contract tests for Phase 5C.1.a.1 pending Edge Functions.
 *
 * We cannot import Deno files from vitest, so these tests exercise
 * structural / textual contracts of the pending source. They catch
 * regressions in:
 *
 *   1. Which Supabase client each RPC is invoked through
 *      (can_access_organization / has_role → USER client; SMTP reads
 *      and org_smtp_settings mutations → SERVICE-ROLE client).
 *   2. That the service-role client is not read/mutated before the
 *      authorization gate.
 *   3. That the A/B pipeline from the current run-email-campaign is
 *      preserved verbatim after the authorization gate (subject_variant
 *      assignment, sampleSize, ab_sample_started_at, ab_winner gating,
 *      subject_variant filter on pending).
 *   4. That body.to is not read in test-org-smtp (org-scope recipient
 *      is always the stored from_email).
 *   5. That test-org-smtp uses the pending-relative import path
 *      ("../../functions/_shared/smtp-sender.ts") — the PROMOTION.md
 *      procedure rewrites it to "../_shared/..." on copy.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RUN = readFileSync(
  resolve(__dirname, "../../../supabase/functions-pending-5c1a/run-email-campaign/index.ts"),
  "utf8",
);
const SMTP = readFileSync(
  resolve(__dirname, "../../../supabase/functions-pending-5c1a/test-org-smtp/index.ts"),
  "utf8",
);
const CURRENT_RUN = readFileSync(
  resolve(__dirname, "../../../supabase/functions/run-email-campaign/index.ts"),
  "utf8",
);

describe("5C.1.a.1 — RPC client routing (run-email-campaign)", () => {
  it("can_access_organization is invoked via userClient (never via admin)", () => {
    expect(RUN).toMatch(/userClient\.rpc\("can_access_organization"/);
    expect(RUN).not.toMatch(/admin\.rpc\("can_access_organization"/);
  });

  it("has_role is invoked via userClient (never via admin)", () => {
    expect(RUN).toMatch(/userClient\.rpc\("has_role"/);
    expect(RUN).not.toMatch(/admin\.rpc\("has_role"/);
  });

  it("service-role campaign mutation only happens inside the authorized branch", () => {
    // The authorization gate must return before any UPDATE on email_campaigns.
    const gateIdx = RUN.indexOf('return json({ error: "Forbidden" }, 403)');
    const firstAdminUpdate = RUN.indexOf('admin.from("email_campaigns").update');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(firstAdminUpdate).toBeGreaterThan(gateIdx);
  });
});

describe("5C.1.a.1 — RPC client routing (test-org-smtp)", () => {
  it("can_access_organization is invoked via userClient", () => {
    expect(SMTP).toMatch(/userClient\.rpc\("can_access_organization"/);
    expect(SMTP).not.toMatch(/admin\.rpc\("can_access_organization"/);
  });

  it("has_role is invoked via userClient", () => {
    expect(SMTP).toMatch(/userClient\.rpc\("has_role"/);
    expect(SMTP).not.toMatch(/admin\.rpc\("has_role"/);
  });

  it("get_decrypted_org_smtp is invoked via service-role client only", () => {
    expect(SMTP).toMatch(/admin\.rpc\("get_decrypted_org_smtp"/);
    expect(SMTP).not.toMatch(/userClient\.rpc\("get_decrypted_org_smtp"/);
  });

  it("SMTP is read AFTER the auth gate — Forbidden returns before admin.rpc", () => {
    const forbidIdx = SMTP.indexOf('return json({ error: "Forbidden" }, 403)');
    const smtpReadIdx = SMTP.indexOf('admin.rpc("get_decrypted_org_smtp"');
    expect(forbidIdx).toBeGreaterThan(-1);
    expect(smtpReadIdx).toBeGreaterThan(forbidIdx);
  });

  it("is_verified/last_test_* update happens AFTER the auth gate", () => {
    const forbidIdx = SMTP.indexOf('return json({ error: "Forbidden" }, 403)');
    const updateIdx = SMTP.indexOf('admin.from("org_smtp_settings").update');
    expect(updateIdx).toBeGreaterThan(forbidIdx);
  });

  it("body.to is NOT read (org recipient is always stored from_email)", () => {
    expect(SMTP).not.toMatch(/body\.to/);
    // Recipient must be assigned from smtp.from_email.
    expect(SMTP).toMatch(/const recipient = smtp\.from_email/);
  });

  it("uses pending-relative import path; promotion rewrites it to ../_shared", () => {
    // Pending physical path is two levels above supabase/functions/_shared.
    expect(SMTP).toMatch(
      /from "\.\.\/\.\.\/functions\/_shared\/smtp-sender\.ts"/,
    );
  });
});

describe("5C.1.a.1 — A/B pipeline preserved in pending run-email-campaign", () => {
  // These strings all exist in the current, working run-email-campaign.
  // The pending file MUST retain them verbatim so A/B behaviour is
  // identical after the authorization gate.
  const AB_MARKERS = [
    "ab_test_enabled",
    "subject_b",
    "ab_sample_percent",
    "ab_sample_started_at",
    "ab_winner",
    'subject_variant: abAssign?.get(r.email) || null',
    'pendingQuery.not("subject_variant", "is", null)',
    "sampleSize",
  ];

  for (const marker of AB_MARKERS) {
    it(`preserves A/B marker: ${marker}`, () => {
      expect(RUN).toContain(marker);
      // Also assert the same marker exists in the current file — this
      // guards against silently drifting away from the working pipeline.
      expect(CURRENT_RUN).toContain(marker);
    });
  }

  it("sample-only send happens only while ab_winner is null", () => {
    // Same guard condition as current file.
    expect(RUN).toMatch(
      /campaign\.ab_test_enabled && campaign\.subject_b && !campaign\.ab_winner/,
    );
  });

  it("recipient insert includes subject_variant column", () => {
    // If A/B is disabled, subject_variant resolves to null; if enabled,
    // sample rows get 'a'/'b'. Column MUST be present in the insert.
    expect(RUN).toMatch(/subject_variant: abAssign\?\.get\(r\.email\) \|\| null/);
  });
});

describe("5C.1.a.1 — service-role bypass and 401/403 semantics", () => {
  it("run: service-role bearer bypasses user auth", () => {
    expect(RUN).toMatch(/isServiceRole = bearer\.length > 0 && bearer === SERVICE_KEY/);
    expect(RUN).toMatch(/if \(isServiceRole\) \{[\s\n]*authorized = true;/);
  });

  it("smtp: service-role bearer bypasses user auth", () => {
    expect(SMTP).toMatch(/isServiceRole = bearer\.length > 0 && bearer === SERVICE_KEY/);
  });

  it("run: missing user → 401 (before any authorization decision)", () => {
    expect(RUN).toMatch(/if \(!userData\?\.user\) return json\(\{ error: "Unauthorized" \}, 401\)/);
  });

  it("smtp: missing user → 401", () => {
    expect(SMTP).toMatch(/if \(!userData\?\.user\) return json\(\{ error: "Unauthorized" \}, 401\)/);
  });
});
