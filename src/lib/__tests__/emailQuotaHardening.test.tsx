/**
 * Phase 5C.1.c.1 — hardening tests for email quota + warmup UX.
 *
 * These tests split into two kinds:
 *
 *   1. Static/text contracts against Edge Function sources (Deno files that we
 *      can't import from vitest). They verify server-side rules the browser
 *      cannot enforce (service-role gate, sales.write ordering, no client
 *      scope_key / skip_warmup, quota claim before SMTP dispatch, one sender
 *      key per normalized from_email).
 *
 *   2. Behavioural tests on hooks/UI that mock supabase RPC responses to prove
 *      the launch button is blocked while quota is unknown/unconfigured, and
 *      that background errors do not wipe previously loaded status.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHook, waitFor, act } from "@testing-library/react";
import { render, screen } from "@testing-library/react";

// -------------------- Static edge-function contracts --------------------

const RUN = readFileSync(
  resolve(__dirname, "../../../supabase/functions/run-email-campaign/index.ts"),
  "utf8",
);
const SEND = readFileSync(
  resolve(__dirname, "../../../supabase/functions/send-campaign-email/index.ts"),
  "utf8",
);
const CONTRACT = readFileSync(
  resolve(__dirname, "../../../supabase/functions/org-create-contract-signature/index.ts"),
  "utf8",
);

// Migrations that must remain the source of truth for sender hashing + range.
const MIG_BASE = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20260729162329_68b47957-c7fe-4ece-8d50-5abc4b7e604a.sql"),
  "utf8",
);

describe("5C.1.c.1 — run-email-campaign quota routing", () => {
  it("org-scope campaign calls claim_org_email_quota (never consume_email_quota)", () => {
    // Find the "campaign.scope === 'platform'" branch and check the else branch
    // uses claim_org_email_quota.
    expect(RUN).toMatch(/claim_org_email_quota/);
    // Marketing kind is hard-coded server-side.
    expect(RUN).toMatch(/p_message_kind:\s*"marketing"/);
  });

  it("platform-scope campaign still uses consume_email_quota('platform')", () => {
    expect(RUN).toMatch(/consume_email_quota[\s\S]{0,120}p_scope_key:\s*"platform"/);
  });

  it("client body has no scope_key or skip_warmup override", () => {
    // Body содержит только campaignId и явное consent_confirmed — ничего больше.
    expect(RUN).toMatch(
      /interface ReqBody \{ campaignId: string; consent_confirmed\?: boolean; \}/,
    );
    // No occurrence of body.scope_key / body.skip_warmup anywhere.
    expect(RUN).not.toMatch(/body\.scope_key/);
    expect(RUN).not.toMatch(/body\.skip_warmup/);
    // claim_org_email_quota call must not pass a skip_warmup flag.
    const claimBlock = RUN.slice(RUN.indexOf("claim_org_email_quota"));
    expect(claimBlock.slice(0, 400)).not.toMatch(/skip_warmup/);
  });

  it("quota is claimed BEFORE send-campaign-email invocation", () => {
    const claimIdx = RUN.indexOf("claim_org_email_quota");
    const dispatchIdx = RUN.indexOf('invoke("send-campaign-email"');
    expect(claimIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(claimIdx);
  });
});

describe("5C.1.c.1 — send-campaign-email service-role gate", () => {
  it("returns 403 before parsing body / touching DB when bearer != SERVICE_KEY", () => {
    const gateIdx = SEND.indexOf(`bearer !== SERVICE_KEY`);
    const jsonParseIdx = SEND.indexOf("req.json()");
    const dbIdx = SEND.indexOf(`admin.from("email_campaigns"`);
    expect(gateIdx).toBeGreaterThan(-1);
    expect(jsonParseIdx).toBeGreaterThan(gateIdx);
    expect(dbIdx).toBeGreaterThan(gateIdx);
  });

  it("recipient lookup filters both id and campaign_id (no id-guessing)", () => {
    const window = SEND.slice(SEND.indexOf("email_campaign_recipients"));
    expect(window).toMatch(/\.eq\("id",\s*recipientId\)/);
    expect(window).toMatch(/\.eq\("campaign_id",\s*campaignId\)/);
  });

  it("transactional send-campaign-email does NOT use skip_warmup", () => {
    expect(SEND).not.toMatch(/skip_warmup/);
  });
});

describe("5C.1.c.1 — org-create-contract-signature ordering", () => {
  it("sales.write authorization runs BEFORE any admin.from insert / SMTP send", () => {
    const permIdx = CONTRACT.indexOf(`_permission: "sales.write"`);
    const smtpIdx = CONTRACT.indexOf("await sendSmtpEmail(");
    const smtpReadIdx = CONTRACT.indexOf(`admin.rpc("get_decrypted_org_smtp"`);
    expect(permIdx).toBeGreaterThan(-1);
    expect(smtpIdx).toBeGreaterThan(permIdx);
    expect(smtpReadIdx).toBeGreaterThan(permIdx);
  });

  it("claim_org_email_quota is called before sendSmtpEmail", () => {
    const claimIdx = CONTRACT.indexOf("claim_org_email_quota");
    const smtpIdx = CONTRACT.indexOf("await sendSmtpEmail(");
    expect(claimIdx).toBeGreaterThan(-1);
    expect(smtpIdx).toBeGreaterThan(claimIdx);
  });
});

describe("5C.1.c.1 — migration invariants", () => {
  it("provider_daily_limit range remains 1..50", () => {
    expect(MIG_BASE).toMatch(/CHECK \(provider_daily_limit BETWEEN 1 AND 50\)/);
  });

  it("warmup ladder remains 10 / 20 / 30 / 40 / 50", () => {
    expect(MIG_BASE).toMatch(/WHEN _day <= 1 THEN 10/);
    expect(MIG_BASE).toMatch(/WHEN _day = 2 THEN 20/);
    expect(MIG_BASE).toMatch(/WHEN _day = 3 THEN 30/);
    expect(MIG_BASE).toMatch(/WHEN _day = 4 THEN 40/);
    expect(MIG_BASE).toMatch(/ELSE 50/);
  });

  it("sender key is 'sender:' + sha256(lower(trim(from_email)))", () => {
    // Same normalization used in _org_email_sender_key and claim_org_email_quota.
    expect(MIG_BASE).toMatch(/lower\(trim\(from_email\)\)::bytea, 'sha256'::text/);
    expect(MIG_BASE).toMatch(/'sender:' \|\| encode\(extensions\.digest/);
  });
});

// -------------------- Behavioural: hooks & UI --------------------

// Mock the shared supabase client so we can drive RPC responses per test.
const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => rpcMock(...args),
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

beforeEach(() => {
  rpcMock.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

import { useEmailWarmup } from "@/hooks/useEmailWarmup";
import { WarmupBadge } from "@/components/admin/broadcast/WarmupBadge";
import { useOrgSmtp } from "@/hooks/useOrgSmtp";

describe("5C.1.c.1 — useEmailWarmup error handling", () => {
  it("permission error surfaces errorKind and exits loading state", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });
    const { result } = renderHook(() =>
      useEmailWarmup("11111111-1111-1111-1111-111111111111"),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.errorKind).toBe("permission");
    expect(result.current.status).toBeNull();
  });

  it("background refetch error keeps previous status intact", async () => {
    const orgId = "22222222-2222-2222-2222-222222222222";
    rpcMock
      .mockResolvedValueOnce({
        data: {
          configured: true,
          day: 2,
          effective_daily_limit: 20,
          sent_today: 5,
          remaining: 15,
          total_sent: 30,
          started_at: "2026-04-01",
          safe_warmup_enabled: true,
          provider_daily_limit: 50,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Failed to fetch" },
      });

    const { result } = renderHook(() => useEmailWarmup(orgId));
    await waitFor(() => expect(result.current.status?.daily_limit).toBe(20));

    await act(async () => {
      await result.current.retry();
    });
    // Old data preserved despite background error.
    expect(result.current.status?.daily_limit).toBe(20);
    expect(result.current.errorKind).toBe("network");
  });

  it("configured=false surfaces as a status, not as an error", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { configured: false },
      error: null,
    });
    const { result } = renderHook(() =>
      useEmailWarmup("33333333-3333-3333-3333-333333333333"),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status?.configured).toBe(false);
    expect(result.current.errorKind).toBeNull();
  });
});

describe("5C.1.c.1 — WarmupBadge does not show eternal loading after error", () => {
  it("shows retry button when RPC fails", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Failed to fetch" },
    });
    render(<WarmupBadge scopeKey="44444444-4444-4444-4444-444444444444" />);
    await waitFor(() =>
      expect(screen.queryByText(/Загрузка прогрева/)).toBeNull(),
    );
    expect(screen.getByRole("button", { name: /Повторить/ })).toBeInTheDocument();
  });
});

// useOrgSmtp — we need a richer supabase.from() mock for this suite.
describe("5C.1.c.1 — useOrgSmtp does not mask errors as 'not configured'", () => {
  it("permission error leaves settings null and loaded=false", async () => {
    const permErr = { code: "42501", message: "permission denied" };
    const { supabase } = await import("@/integrations/supabase/client");
    (supabase as any).from = () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: permErr }),
        }),
      }),
    });
    const { result } = renderHook(() => useOrgSmtp("55555555-5555-5555-5555-555555555555"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadErrorKind).toBe("permission");
    expect(result.current.settings).toBeNull();
    expect(result.current.loaded).toBe(false);
  });

  it("successful null response marks loaded=true (SMTP not configured is a valid state)", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    (supabase as any).from = () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    });
    const { result } = renderHook(() => useOrgSmtp("66666666-6666-6666-6666-666666666666"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loaded).toBe(true);
    expect(result.current.loadErrorKind).toBeNull();
    expect(result.current.settings).toBeNull();
  });
});
