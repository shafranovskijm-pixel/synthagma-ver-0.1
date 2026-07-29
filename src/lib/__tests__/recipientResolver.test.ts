/**
 * Contract tests for Phase 5C.1.b + 5C.1.b.1 (corrective) —
 * canonical recipient resolver.
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
    expect(RUN).not.toMatch(/from\("email_suppressions"\)/);
  });

  it("resolver errors do NOT downgrade the campaign to completed/empty", () => {
    expect(RUN).toMatch(/status:\s*"failed"/);
    expect(RUN).toMatch(/Resolver failed:/);
  });

  it("uses upsert with onConflict campaign_id,email for idempotency", () => {
    expect(RUN).toMatch(/onConflict:\s*"campaign_id,email"/);
    expect(RUN).toMatch(/ignoreDuplicates:\s*true/);
  });

  it("total_recipients is computed from actual persisted rows", () => {
    expect(RUN).toMatch(/count:\s*actualCount/);
    expect(RUN).toMatch(/total_recipients:\s*actualCount \|\| 0/);
  });
});

describe("5C.1.b.1 — corrective: hardened error handling in Edge Function", () => {
  it("checks error on existingCount and fails without downgrading", () => {
    expect(RUN).toMatch(/existingCount,\s*error:\s*existingErr/);
    expect(RUN).toMatch(/existingErr[\s\S]{0,200}status:\s*"failed"/);
  });

  it("checks error on actualCount and does NOT write total_recipients=0 on failure", () => {
    expect(RUN).toMatch(/actualCount,\s*error:\s*actualErr/);
    expect(RUN).toMatch(/actualErr[\s\S]{0,200}status:\s*"failed"/);
  });

  it("pendingQuery error does NOT mark campaign as completed", () => {
    expect(RUN).toMatch(/data:\s*pending,\s*error:\s*pendingErr/);
    expect(RUN).toMatch(/pendingErr[\s\S]{0,200}status:\s*"failed"/);
  });

  it("leftovers error parks campaign as paused, NOT completed", () => {
    expect(RUN).toMatch(/leftovers,\s*error:\s*leftErr/);
    // On leftErr, status is 'paused' (not completed).
    expect(RUN).toMatch(/leftErr[\s\S]{0,300}status:\s*"paused"/);
  });

  it("total_recipients UPDATE error is surfaced as failed", () => {
    expect(RUN).toMatch(/totalUpdErr/);
  });

  it("does NOT leak raw internal messages beyond the resolver channel", () => {
    // Existing/actual/pending/leftovers paths return a user-facing string,
    // not the raw pg error object.
    expect(RUN).toMatch(/Не удалось проверить существующих получателей/);
    expect(RUN).toMatch(/Не удалось подсчитать получателей/);
    expect(RUN).toMatch(/Не удалось получить очередь отправки/);
  });

  it("carries a 5C.1.d TODO for atomic campaign-run claim", () => {
    expect(RUN).toMatch(/5C\.1\.d/);
    expect(RUN).toMatch(/atomic campaign-run claim/i);
  });
});

describe("5C.1.b.1 — unique index guards duplicate recipient rows only", () => {
  // Renamed from the earlier "concurrent double-send" phrasing.
  // The unique index prevents duplicate rows; it does NOT yet
  // prevent duplicate SMTP dispatch under concurrent invocations.
  it("upsert onConflict enforces recipient-row uniqueness", () => {
    expect(RUN).toMatch(/onConflict:\s*"campaign_id,email"/);
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

  it("manual input is debounced (350ms) — RPC only", () => {
    expect(PICKER).toMatch(/setTimeout\([\s\S]+?,\s*350\s*\)/);
  });

  it("shows exclusion breakdown when any exclusion category > 0", () => {
    expect(PICKER).toMatch(/duplicate_count/);
    expect(PICKER).toMatch(/invalid_count/);
    expect(PICKER).toMatch(/suppressed_count/);
  });
});

describe("5C.1.b.1 — RecipientPicker: race + stale-response protection", () => {
  it("Textarea onChange synchronously marks previewReady=false", () => {
    // The Textarea's onChange body must call onChange({..., previewReady: false })
    // BEFORE the debounce timer fires.
    expect(PICKER).toMatch(
      /onChange=\{\(e\)\s*=>\s*\{[\s\S]+?previewReady:\s*false[\s\S]+?\}\}/,
    );
  });

  it("parses raw manual tokens WITHOUT Set-based dedup", () => {
    // parseManualRaw must NOT wrap the result in `new Set(...)`.
    const fn = PICKER.match(/function parseManualRaw[\s\S]+?\n\}/);
    expect(fn, "parseManualRaw not found").toBeTruthy();
    expect(fn![0]).not.toMatch(/new Set\(/);
  });

  it("file import preserves duplicates so the server can count them", () => {
    // Old code deduped with `new Set(collected)`; corrective phase must not.
    const handler = PICKER.match(/handleFileImport[\s\S]+?\n  \};/);
    expect(handler, "handleFileImport not found").toBeTruthy();
    expect(handler![0]).not.toMatch(/Array\.from\(new Set\(collected\)\)/);
    expect(handler![0]).not.toMatch(/new Set\(\[\.\.\.existing,\s*\.\.\.unique\]\)/);
  });

  it("uses a monotonic request sequence guard", () => {
    expect(PICKER).toMatch(/requestSeqRef/);
    expect(PICKER).toMatch(/mySeq\s*!==\s*requestSeqRef\.current/);
  });

  it("aborts previous request via AbortController", () => {
    expect(PICKER).toMatch(/new AbortController\(\)/);
    expect(PICKER).toMatch(/abortRef\.current\.abort\(\)/);
  });

  it("tracks mounted state and guards setState after unmount", () => {
    expect(PICKER).toMatch(/mountedRef/);
    expect(PICKER).toMatch(/!mountedRef\.current/);
  });

  it("source/scope/organizationId change invalidates the previous preview", () => {
    // The auto-source effect must mark previewReady=false before firing
    // the new RPC (so the launch button locks in the same render).
    expect(PICKER).toMatch(/value\.source,\s*scope,\s*organizationId/);
    expect(PICKER).toMatch(/onChange\(\{\s*\.\.\.value,\s*previewReady:\s*false\s*\}\)/);
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
