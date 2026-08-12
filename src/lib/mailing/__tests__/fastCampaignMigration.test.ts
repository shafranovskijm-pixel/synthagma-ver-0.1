import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260812173000_mailing_fast_campaign_queue.sql"),
  "utf8",
);

describe("fast campaign queue migration", () => {
  it("claims due jobs atomically and skips locked rows", () => {
    expect(migration).toContain("FOR UPDATE OF j SKIP LOCKED");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("UNIQUE (campaign_id, recipient_id, step_no)");
    expect(migration).toContain("status = 'claimed'");
  });

  it("keeps imported sender accounts inactive and encrypted", () => {
    const fn = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.import_mailing_senders_batch"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.attest_cold_outreach_campaign"),
    );
    expect(fn).toContain("v_secret");
    expect(fn).toContain("password_encrypted");
    expect(fn).toContain("false,");
    expect(fn).not.toContain("RETURNING password_encrypted");
    expect(fn).not.toMatch(/jsonb_build_object\([^)]*(password|secret)/i);
  });

  it("limits sender imports and worker claims", () => {
    expect(migration).toContain("jsonb_array_length(p_rows) > 50");
    expect(migration).toContain("p_batch_size <> 1");
    expect(migration).toContain("batch_size_must_be_one");
  });

  it("enforces shared-domain counters across campaigns", () => {
    expect(migration).toContain("domain_campaign.organization_id = c.organization_id");
    expect(migration).toContain("split_part(domain_sender.from_email, '@', 2)");
    expect(migration).toContain("'claimed', 'dispatching', 'sent', 'uncertain'");
  });

  it("records cold outreach separately from permission marketing", () => {
    expect(migration).toContain("'cold_outreach', 'permission_marketing'");
    expect(migration).toContain("operator_attested_at = now()");
    expect(migration).toContain("operator_attested_by = auth.uid()");
  });
});
