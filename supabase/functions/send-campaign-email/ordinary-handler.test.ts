import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { OrdinaryDispatch, validOrdinaryIdentity } from "./ordinary-dispatch";
import { SmtpDeliveryError } from "../_shared/smtp-sender";
import { platformSenderId, reservePlatformSender } from "./platform-sender";
import { ordinaryMessageFacts } from "./ordinary-message";

vi.mock("../_shared/rate-limiter.ts", () => ({ checkRateLimit: vi.fn() }));

// Execute the actual Deno entrypoint in memory. Only imports/runtime adapters are
// substituted; the handler's authorization, queries and control flow are intact.
const compiled = ts.transpileModule(readFileSync(resolve(process.cwd(), "supabase/functions/send-campaign-email/index.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const campaignId = "00000000-0000-4000-8000-000000000001";
const recipientId = "00000000-0000-4000-8000-000000000002";
const runToken = "00000000-0000-4000-8000-000000000003";

function fixture(options: { suppressionError?: boolean; historyBlock?: boolean; historyWriteError?: boolean; sentWriteError?: boolean; smtpError?: Error; prepareError?: boolean; prepareRejected?: boolean; prepareWrongId?: boolean; invalidFromName?: boolean } = {}) {
  const mutations: string[] = [];
  const rpcNames: string[] = [];
  const events: string[] = [];
  let attempt: { token: string; state: string; messageId: string | null } | null = null;
  let snapshot: ReturnType<typeof ordinaryMessageFacts> | null = null;
  const campaign = { id: campaignId, scope: "platform", recipient_filter: {}, name: "Fixture", subject: "Hello {{name}}", html_body: "<p>Welcome {{name}}</p>", from_name: options.invalidFromName ? "Fake <other@example.com>" : "Fixture", reply_to: "reply@example.com" };
  const recipient = { id: recipientId, campaign_id: campaignId, email: "school@example.com", recipient_name: "School", open_token: "open-fixture" };
  const admin = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let write: string | null = null;
      const result = () => {
        if (write) { mutations.push(`${table}:${write}`); return { data: {}, error: null }; }
        if (table === "email_campaigns") return { data: filters.id === campaignId ? campaign : null, error: null };
        if (table === "email_campaign_recipients") return { data: filters.id === recipientId && filters.campaign_id === campaignId ? recipient : null, error: null };
        if (table === "mailing_send_jobs") return { data: { id: "fast-job", campaign_id: campaignId, recipient_id: recipientId, status: "claimed", claim_token: "correct-claim" }, error: null };
        if (table === "broadcast_companies_db") return { data: options.historyBlock ? { email: recipient.email } : null, error: null };
        return { data: null, error: null };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        in: () => query,
        single: async () => result(),
        maybeSingle: async () => result(),
        update: () => { write = "update"; return query; },
        upsert: async () => { mutations.push(`${table}:upsert`); return { error: options.historyWriteError ? { message: "history DB unavailable" } : null }; },
        then: (success: (value: unknown) => unknown, failure?: (reason: unknown) => unknown) => Promise.resolve(result()).then(success, failure),
      };
      return query;
    },
    async rpc(name: string, args: Record<string, any>) {
      rpcNames.push(name);
      if (name === "claim_ordinary_campaign_recipient") {
        if (args.p_run_token !== runToken) return { data: { claimed: false, reason: "run_not_active" }, error: null };
        if (attempt) return { data: { claimed: false, state: attempt.state, reason: "attempt_exists" }, error: null };
        attempt = { token: args.p_attempt_token, state: "claimed", messageId: null };
        events.push("claimed");
        return { data: { claimed: true, attempt_token: attempt.token, state: "claimed" }, error: null };
      }
      if (name === "transition_ordinary_campaign_attempt") {
        if (!attempt || args.p_attempt_token !== attempt.token || args.p_run_token !== runToken) throw new Error("unexpected mismatch");
        if (args.p_state === "sent" && options.sentWriteError) return { data: null, error: { message: "ledger unavailable after SMTP250" } };
        if (args.p_state === "dispatching") expect(snapshot?.smtp_message_id).toBe(args.p_smtp_message_id);
        attempt.state = args.p_state;
        if (args.p_smtp_message_id) attempt.messageId = args.p_smtp_message_id;
        events.push(attempt.state);
        return { data: { transitioned: true, state: attempt.state }, error: null };
      }
      if (name === "prepare_ordinary_campaign_message") {
        expect(attempt?.state).toBe("claimed");
        expect(args.p_attempt_token).toBe(attempt?.token);
        if (options.prepareError) return { data: null, error: { message: "snapshot storage unavailable" } };
        if (options.prepareRejected) return { data: { prepared: false, reason: "snapshot_conflict" }, error: null };
        snapshot = args.p_payload;
        events.push("prepared");
        return { data: { prepared: true, message_id: options.prepareWrongId ? "<wrong@fixture.invalid>" : snapshot!.smtp_message_id }, error: null };
      }
      if (name === "is_email_suppressed") {
        expect(attempt?.state).toBe("claimed");
        return options.suppressionError ? { data: null, error: { message: "suppression unavailable" } } : { data: false, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };
  const smtp = vi.fn(async (_config, sentOptions) => {
    expect(attempt?.state).toBe("dispatching");
    expect(sentOptions.messageId).toBe(attempt?.messageId);
    expect(snapshot).not.toBeNull();
    expect(sentOptions.subject).toBe(snapshot?.subject);
    expect(sentOptions.html).toBe(snapshot?.html_body);
    expect(sentOptions.text).toBe(snapshot?.text_body);
    expect(sentOptions.fromOverride).toBe(`${snapshot?.from_name} <${snapshot?.from_email}>`);
    expect(sentOptions.replyTo).toBe(snapshot?.reply_to);
    events.push("SMTP");
    if (options.smtpError) throw options.smtpError;
    return { messageId: sentOptions.messageId };
  });
  const createClient = vi.fn(() => admin);
  let handler!: (request: Request) => Promise<Response>;
  const modules: Record<string, unknown> = {
    "https://deno.land/std@0.168.0/http/server.ts": { serve: (value: typeof handler) => { handler = value; } },
    "https://esm.sh/@supabase/supabase-js@2.45.0": { createClient },
    "../_shared/smtp-sender.ts": { sendSmtpEmail: smtp },
    "../_shared/ics.ts": { buildIcs: () => "" },
    "../_shared/email-html-utils.ts": { processCampaignHtml: (html: string) => html },
    "../_shared/mailing-variables.ts": { buildListUnsubscribeHeaders: () => ({}) },
    "./platform-sender.ts": { platformSenderId, reservePlatformSender },
    "./ordinary-dispatch.ts": { OrdinaryDispatch, validOrdinaryIdentity },
    "./ordinary-message.ts": { ordinaryMessageFacts },
  };
  const env: Record<string, string> = { SUPABASE_URL: "https://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key", SMTP_HOST: "smtp.fixture.invalid", SMTP_PORT: "465", SMTP_USER: "sender@example.com", SMTP_PASS: "fixture-secret", SMTP_FROM: "sender@example.com" };
  new Function("require", "module", "exports", "Deno", compiled)((name: string) => {
    if (!(name in modules)) throw new Error(`unexpected import ${name}`);
    return modules[name];
  }, { exports: {} }, {}, { env: { get: (key: string) => env[key] } });
  const send = async (body: unknown = { campaignId, recipientId, runToken }, auth = "fixture-service-key") => {
    const response = await handler(new Request("https://fixture.invalid/send-campaign-email", { method: "POST", headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    return { status: response.status, data: await response.json() };
  };
  return { send, mutations, rpcNames, events, smtp, createClient, attempt: () => attempt, snapshot: () => snapshot };
}

describe("ordinary actual handler adapter tests", () => {
  it("rejects browser credentials before creating the DB client", async () => {
    const f = fixture();
    expect((await f.send(undefined, "user-session-key")).status).toBe(403);
    expect(f.createClient).not.toHaveBeenCalled();
    expect(f.mutations).toEqual([]);
  });

  it("missing run token rejects without DB mutations or suppression queries", async () => {
    const f = fixture();
    expect((await f.send({ campaignId, recipientId })).data).toMatchObject({ recorded: false, error_category: "invalid_claim" });
    expect(f.rpcNames).toEqual([]);
    expect(f.mutations).toEqual([]);
  });

  it("wrong run claim cannot invoke suppression, quota, SMTP or mutations", async () => {
    const f = fixture();
    expect((await f.send({ campaignId, recipientId, runToken: "00000000-0000-4000-8000-000000000099" })).data).toMatchObject({ recorded: false, error_category: "run_not_active" });
    expect(f.rpcNames).toEqual(["claim_ordinary_campaign_recipient"]);
    expect(f.mutations).toEqual([]);
    expect(f.smtp).not.toHaveBeenCalled();
  });

  it("recipient mismatch and fast claim mismatch cannot trigger the old blanket catch writes", async () => {
    const f = fixture();
    await f.send({ campaignId, recipientId: "00000000-0000-4000-8000-000000000099", runToken });
    await f.send({ campaignId, recipientId, jobId: "fast-job", claimToken: "wrong-claim" });
    expect(f.mutations).toEqual([]);
    expect(f.rpcNames).toEqual([]);
    expect(f.smtp).not.toHaveBeenCalled();
  });

  it("same recipient dispatched twice gets one SMTP call and no direct counter/status writes", async () => {
    const f = fixture();
    const results = await Promise.all([f.send(), f.send()]);
    expect(f.smtp).toHaveBeenCalledTimes(1);
    expect(results.filter(row => row.data.recorded && row.data.state === "sent")).toHaveLength(1);
    expect(f.mutations).toEqual(["broadcast_companies_db:upsert"]);
    expect(f.events).toEqual(["claimed", "prepared", "dispatching", "SMTP", "sent"]);
  });

  it("suppression service failure finalizes a known preSMTP failure without sender quota/send", async () => {
    const f = fixture({ suppressionError: true });
    expect((await f.send()).data).toMatchObject({ recorded: true, state: "failed", error_category: "suppression_lookup_failed" });
    expect(f.mutations).toEqual([]);
    expect(f.smtp).not.toHaveBeenCalled();
  });

  it("keeps the existing legacy-history block separate from unsubscribe", async () => {
    const f = fixture({ historyBlock: true });
    expect((await f.send()).data).toMatchObject({ recorded: true, state: "failed", error_category: "legacy_history_blocked", alreadyInBroadcastDb: true });
    expect(f.smtp).not.toHaveBeenCalled();
  });

  it("lost DATA outcome is recorded uncertain, never failed", async () => {
    const f = fixture({ smtpError: new SmtpDeliveryError("DATA EOF", "unknown") });
    expect((await f.send()).data).toMatchObject({ recorded: true, state: "uncertain" });
    expect(f.attempt()?.state).toBe("uncertain");
    expect(f.mutations).toEqual([]);
  });

  it("SMTP250 plus ledger write failure is uncertain and not eligible for resend", async () => {
    const f = fixture({ sentWriteError: true });
    expect((await f.send()).data).toMatchObject({ recorded: true, state: "uncertain", error_category: "accepted_storage_unconfirmed" });
    expect((await f.send()).data).toMatchObject({ recorded: false, state: "uncertain" });
    expect(f.smtp).toHaveBeenCalledTimes(1);
  });

  it("legacy history-write failure does not turn a durably sent attempt into failed", async () => {
    const f = fixture({ historyWriteError: true });
    expect((await f.send()).data).toMatchObject({ success: true, recorded: true, state: "sent", history_recorded: false });
    expect(f.attempt()?.state).toBe("sent");
  });

  it.each(["prepareError", "prepareRejected", "prepareWrongId"] as const)("%s blocks SMTP and never counts prepared facts as sent", async (key) => {
    const f = fixture({ [key]: true });
    expect((await f.send()).data).toMatchObject({ recorded: true, state: "failed", error_category: "message_snapshot_failed" });
    expect(f.smtp).not.toHaveBeenCalled();
    expect(f.events).not.toContain("dispatching");
    expect(f.mutations).toEqual([]);
  });

  it("persists actual personalized MIME content and verified sender facts before SMTP", async () => {
    const f = fixture();
    await f.send();
    expect(f.snapshot()).toMatchObject({ from_email: "sender@example.com", from_name: "Fixture", reply_to: "reply@example.com", sender_kind: "platform_env", sender_pool_id: null, mailing_sender_id: null, subject: "Hello School" });
    expect(f.snapshot()?.html_body).toContain("Welcome School");
    expect(f.snapshot()?.html_body).toContain("track-email-open");
    expect(f.snapshot()?.text_body).toContain("Welcome School");
    expect(f.events.indexOf("prepared")).toBeLessThan(f.events.indexOf("SMTP"));
  });

  it("rejects a display-name envelope override before preparing or sending", async () => {
    const f = fixture({ invalidFromName: true });
    expect((await f.send()).data).toMatchObject({ recorded: true, state: "failed" });
    expect(f.snapshot()).toBeNull();
    expect(f.smtp).not.toHaveBeenCalled();
  });
});
