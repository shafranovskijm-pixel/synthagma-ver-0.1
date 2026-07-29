/**
 * Contract tests for Phase 5C.1.b — canonical recipient resolver.
 *
 * We cannot execute Deno / Postgres from vitest, so these tests verify
 * structural / textual contracts of the promoted Edge Function and the
 * client-side RecipientPicker. Behavioural correctness of the SQL
 * resolver is validated via the migration + read-only diagnostics run
 * during phase application.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RUN = readFileSync(
  resolve(__dirname, "../../../supabase/functions/run-email-campaign/index.ts"),
  "utf8",
);
const PICKER = readFileSync(
  resolve(__dirname, "../../../src/components/admin/broadcast/RecipientPicker.tsx"),
  "utf8",
);
const EDITOR = readFileSync(
  resolve(__dirname, "../../../src/components/admin/broadcast/CampaignEditor.tsx"),
  "utf8",
);

describe("5C.1.b — Edge Function delegates recipient resolution to RPC", () => {
  it("no longer contains a local resolveRecipients function", () => {
    expect(RUN).not.toMatch(/function\s+resolveRecipients\s*\(/);
    expect(RUN).not.toMatch(/async\s+function\s+resolveRecipients\s*\(/);
  });

  it("invokes public.resolve_campaign_recipients via admin.rpc", () => {
    expect(RUN).toMatch(/admin\.rpc\(\s*"resolve_campaign_recipients"/);
  });

  it("does NOT re-filter suppressions in Edge (resolver owns it)", () => {
    // The old code called `.from("email_suppressions").select(...)` — that
    // path must be removed to guarantee a single filtering source.
    expect(RUN).not.toMatch(/from\("email_suppressions"\)/);
  });

  it("resolver errors do NOT downgrade the campaign to completed/empty", () => {
    // On resolver error, status is set to 'failed' and a 500 is returned.
    expect(RUN).toMatch(/status:\s*"failed"/);
    expect(RUN).toMatch(/Resolver failed:/);
  });

  it("uses upsert with onConflict campaign_id,email for idempotency", () => {
    expect(RUN).toMatch(/onConflict:\s*"campaign_id,email"/);
    expect(RUN).toMatch(/ignoreDuplicates:\s*true/);
  });

  it("total_recipients is computed from actual persisted rows", () => {
    // The `count` query must happen AFTER the batched upsert, then be
    // written into email_campaigns.total_recipients.
    expect(RUN).toMatch(/count:\s*actualCount/);
    expect(RUN).toMatch(/total_recipients:\s*actualCount \|\| 0/);
  });
});

describe("5C.1.b — RecipientPicker uses server preview RPC", () => {
  it("calls supabase.rpc('get_campaign_recipient_preview')", () => {
    expect(PICKER).toMatch(/rpc\(\s*\n?\s*"get_campaign_recipient_preview"/);
  });

  it("no longer queries profiles/companies/organizations/sales_companies_db directly for counts", () => {
    expect(PICKER).not.toMatch(/from\("profiles"\)/);
    expect(PICKER).not.toMatch(/from\("companies"\)/);
    expect(PICKER).not.toMatch(/from\("organizations"\)/);
    expect(PICKER).not.toMatch(/from\("sales_companies_db"/);
  });

  it("propagates previewReady flag on success/error/change", () => {
    expect(PICKER).toMatch(/previewReady:\s*true/);
    expect(PICKER).toMatch(/previewReady:\s*false/);
  });

  it("distinguishes permission vs network errors", () => {
    expect(PICKER).toMatch(/permission denied\|42501\|Forbidden/);
  });

  it("manual input is debounced (350ms)", () => {
    expect(PICKER).toMatch(/setTimeout\([^,]+,\s*350\s*\)/);
  });

  it("shows exclusion breakdown when any exclusion category > 0", () => {
    expect(PICKER).toMatch(/duplicate_count/);
    expect(PICKER).toMatch(/invalid_count/);
    expect(PICKER).toMatch(/suppressed_count/);
  });
});

describe("5C.1.b — CampaignEditor blocks launch until preview succeeds", () => {
  it("launch button disables when recipients.previewReady === false", () => {
    expect(EDITOR).toMatch(/recipients\.previewReady === false/);
  });
});

describe("5C.1.b — regression: 5C.1.a authz gate remains", () => {
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

  for (const m of AB_MARKERS) {
    it(`A/B marker preserved: ${m}`, () => expect(RUN).toContain(m));
  }

  it("userClient still handles has_role and can_access_organization", () => {
    expect(RUN).toMatch(/userClient\.rpc\("has_role"/);
    expect(RUN).toMatch(/userClient\.rpc\("can_access_organization"/);
  });
});
