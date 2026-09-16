import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { webcrypto } from "node:crypto";
import { dispatchOrdinaryBatch, requireQuotaDecision } from "./run-lifecycle";
import { platformSenderId, platformSmtp } from "../send-campaign-email/platform-sender";
import { hasVerifiedAdminRole } from "./admin-role";

const source = readFileSync(resolve(__dirname, "index.ts"), "utf8")
  .replace(/^import[^;]+;\s*$/gm, "");
const executable = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function harness(options: Record<string, any> = {}) {
  const campaign = {
    id: "campaign", scope: "platform", updated_at: "2026-09-07T00:00:00Z", status: "draft",
    name: "Client invitation", subject: "Beta", html_body: "<p>Invitation</p>",
    recipient_source: "manual", recipient_filter: {}, consent_confirmed_at: "2026-09-01T00:00:00Z",
    ...options.campaign,
  };
  const calls: Array<{ name: string; args: any }> = [];
  const backgrounds: Promise<unknown>[] = [];
  let countReads = 0;
  const query = (table: string) => {
    if (table === "user_roles") calls.push({ name: "read:user_roles", args: {} });
    const filters: Record<string, any> = {};
    let head = false;
    let mutation = false;
    const result = () => {
      if (options.tableError === table) return { error: new Error("storage") };
      if (mutation) return { data: null, error: options.writeError === table ? new Error("fixture storage") : null };
      if (table === "email_campaigns") return { data: campaign, error: null };
      if (table === "user_roles") return { data: options.authorized !== false ? { role: "admin" } : null, error: null };
      if (table === "email_sender_pool") return { data: options.pool ?? null, error: null };
      if (table === "email_campaign_recipients") return head ? { count: ++countReads === 1 ? (options.existingCount ?? 2) : (options.resolved?.length ?? 2), error: null }
        : { data: [{ id: "one" }, { id: "two" }], error: null };
      return { data: null, error: null };
    };
    const chain: any = {
      select(_fields: string, config?: any) { head = !!config?.head; return chain; },
      eq(key: string, value: any) { filters[key] = value; return chain; },
      not() { return chain; }, in() { return chain; },
      update(payload: any) { mutation = true; calls.push({ name: `update:${table}`, args: payload }); return chain; },
      upsert(payload: any) { mutation = true; calls.push({ name: `upsert:${table}`, args: payload }); return chain; },
      single: async () => result(), maybeSingle: async () => result(),
      then: (yes: any, no: any) => Promise.resolve(result()).then(yes, no),
    };
    return chain;
  };
  const invoke = vi.fn(async (_name: string, args: any) => {
    calls.push({ name: "invoke", args });
    return options.invokeResult || { data: { recorded: true, success: true, state: "sent" }, error: null };
  });
  const reportInvoke = vi.fn(async () => {
    if (options.reportThrows) throw new Error("fixture relay unavailable");
    return { data: options.reportResult || { ok: true } };
  });
  const admin = {
    from: query, auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      if (name === "claim_ordinary_campaign_run") return options.claimResult || { data: { claimed: true } };
      if (name === "consume_email_quota") return options.quotaResult || { data: { allowed: true } };
      if (name === "resolve_campaign_recipients") return { data: options.resolved ?? null, error: null };
      if (name === "finish_ordinary_campaign_run") return { data: { finished: true } };
      return { data: null, error: null };
    }, functions: { invoke: (name: string, args: any) => name === "notify-mailing-campaign-report" ? reportInvoke() : invoke(name, args) },
  };
  let handler!: (req: Request) => Promise<Response>;
  const env: Record<string, string> = {
    SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "service", SUPABASE_ANON_KEY: "anon",
    SMTP_HOST: "smtp.example.invalid", SMTP_PORT: "465", SMTP_USER: "sender@example.invalid", SMTP_PASS: "fixture-only",
  };
  new Function("serve", "createClient", "Deno", "crypto", "platformSenderId", "platformSmtp", "dispatchOrdinaryBatch", "requireQuotaDecision", "hasVerifiedAdminRole", "EdgeRuntime", "setTimeout", executable)(
    (h: typeof handler) => { handler = h; }, () => admin, { env: { get: (key: string) => env[key] } },
    webcrypto, platformSenderId, platformSmtp, dispatchOrdinaryBatch, requireQuotaDecision, hasVerifiedAdminRole,
    { waitUntil: (promise: Promise<unknown>) => backgrounds.push(promise) }, (fn: () => void) => { fn(); },
  );
  return {
    calls, invoke, reportInvoke,
    async run() {
      const response = await handler(new Request("https://example.invalid/run", {
        method: "POST", headers: { Authorization: `Bearer ${options.service ? "service" : "user"}`, "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: "campaign", consent_confirmed: true }),
      }));
      await Promise.all(backgrounds);
      return { status: response.status, data: await response.json() };
    },
  };
}

describe("actual ordinary run handler, local fake transport only", () => {
  it("rejects unauthorized user before claim/quota/materialization", async () => {
    const h = harness({ authorized: false });
    expect((await h.run()).status).toBe(403);
    expect(h.calls.map((c) => c.name)).toEqual(["read:user_roles"]);
  });
  it("stops on role read errors before claim or dispatch", async () => {
    const h = harness({ tableError: "user_roles" });
    expect((await h.run()).status).toBe(500);
    expect(h.calls.map((c) => c.name)).toEqual(["read:user_roles"]);
    expect(h.invoke).not.toHaveBeenCalled();
  });
  it("rejects missing selected pool before claim/quota", async () => {
    const h = harness({ campaign: { recipient_filter: { platform_sender_pool_id: "11111111-1111-1111-1111-111111111111" } } });
    expect((await h.run()).status).toBe(500);
    expect(h.calls.some((c) => c.name.includes("claim") || c.name.includes("quota"))).toBe(false);
  });
  it("rejects another Reply-To inbox before claim, quota or materialization", async () => {
    const h = harness({
      campaign: { reply_to: "another@example.invalid", recipient_filter: { platform_sender_pool_id: "11111111-1111-1111-1111-111111111111" } },
      pool: { id: "11111111-1111-1111-1111-111111111111", email: "sender@example.invalid", app_password: "fixture-only", host: "smtp.example.invalid", port: 465, encryption: "ssl", is_active: true },
    });
    expect((await h.run()).status).toBe(400);
    expect(h.calls.some((c) => /claim|quota|upsert/.test(c.name))).toBe(false);
    expect(h.invoke).not.toHaveBeenCalled();
  });
  it("accepts the verified Reply-To inbox case-insensitively", async () => {
    const h = harness({
      campaign: { reply_to: " Sender@EXAMPLE.invalid ", recipient_filter: { platform_sender_pool_id: "11111111-1111-1111-1111-111111111111" } },
      pool: { id: "11111111-1111-1111-1111-111111111111", email: "sender@example.invalid", app_password: "fixture-only", host: "smtp.example.invalid", port: 465, encryption: "ssl", is_active: true },
    });
    expect((await h.run()).status).toBe(200);
    expect(h.invoke).toHaveBeenCalledTimes(2);
  });
  it("does not trust old stored consent after the audience changed on service resume", async () => {
    const h = harness({ service: true, campaign: { status: "paused", recipient_filter: { draft_consent_confirmed: false } } });
    expect((await h.run()).status).toBe(400);
    expect(h.calls).toEqual([]);
  });
  it("a losing run does not consume quota or invoke SMTP", async () => {
    const h = harness({ claimResult: { data: { claimed: false, reason: "run_active" } } });
    expect((await h.run()).status).toBe(409);
    expect(h.calls.map((c) => c.name)).toEqual(["read:user_roles", "claim_ordinary_campaign_run"]);
  });
  it("an unconfirmed claim is not retried or released by an unproven owner", async () => {
    const h = harness({ claimResult: { error: new Error("timeout") } });
    expect((await h.run()).status).toBe(503);
    expect(h.calls.map((c) => c.name)).toEqual(["read:user_roles", "claim_ordinary_campaign_run"]);
  });
  it("quota timeout locks the owned run as uncertain and sends nothing", async () => {
    const h = harness({ quotaResult: { error: new Error("reservation timeout") } });
    expect((await h.run()).status).toBe(500);
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.calls.filter((c) => c.name === "consume_email_quota")).toHaveLength(1);
    expect(h.calls.at(-1)?.args.p_outcome).toBe("uncertain");
  });
  it("explicit denied quota safely pauses without dispatch", async () => {
    const h = harness({ quotaResult: { data: { allowed: false } } });
    expect((await h.run()).data.quotaExceeded).toBe(true);
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.calls.at(-1)?.args.p_outcome).toBe("paused");
  });
  it("forwards the token and finalizes only explicit saved results", async () => {
    const h = harness();
    expect((await h.run()).data.started).toBe(2);
    expect(h.invoke).toHaveBeenCalledTimes(2);
    const token = h.calls.find((c) => c.name === "claim_ordinary_campaign_run")?.args.p_token;
    expect(h.invoke.mock.calls[0][1].body.runToken).toBe(token);
    expect(h.calls.at(-1)?.args).toMatchObject({ p_token: token, p_outcome: "completed" });
  });
  it("HTTP-success containing a missing/unconfirmed result halts instead of advancing", async () => {
    const h = harness({ invokeResult: { data: { success: false, recorded: false, state: "dispatching" } } });
    await h.run();
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.calls.at(-1)?.args.p_outcome).toBe("uncertain");
  });
  it("materializes >500 recipients in one atomic write, never a partial batch prefix", async () => {
    const resolved = Array.from({ length: 501 }, (_, n) => ({ email: `fixture${n}@example.invalid`, recipient_name: null }));
    const h = harness({ existingCount: 0, resolved });
    await h.run();
    const writes = h.calls.filter((c) => c.name === "upsert:email_campaign_recipients");
    expect(writes).toHaveLength(1);
    expect(writes[0].args).toHaveLength(501);
  });
  it("unknown resolver result is not an empty-success campaign", async () => {
    const h = harness({ existingCount: 0 });
    expect((await h.run()).status).toBe(500);
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.calls.at(-1)?.args.p_outcome).toBe("preflight_failed");
  });
  it("materialization failure exits before quota with an owned preflight result", async () => {
    const h = harness({ existingCount: 0, resolved: [{ email: "fixture@example.invalid" }], writeError: "email_campaign_recipients" });
    expect((await h.run()).status).toBe(500);
    expect(h.calls.some((c) => c.name === "consume_email_quota")).toBe(false);
    expect(h.calls.at(-1)?.args).toMatchObject({ p_outcome: "preflight_failed", p_reason: "recipient_write_failed" });
  });
  it("AB timestamp error after quota never starts SMTP or pretends to finish", async () => {
    const h = harness({ campaign: { ab_test_enabled: true, subject_b: "Variant B" }, writeError: "email_campaigns" });
    expect((await h.run()).status).toBe(500);
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.calls.at(-1)?.args.p_outcome).toBe("uncertain");
  });
  it("flushes the durable report only after finish; unavailable Telegram cannot resend SMTP", async () => {
    const h = harness({ reportThrows: true });
    expect((await h.run()).data.started).toBe(2);
    expect(h.invoke).toHaveBeenCalledTimes(2);
    expect(h.reportInvoke).toHaveBeenCalledTimes(1);
    expect(h.calls.filter((c) => c.name === "finish_ordinary_campaign_run")).toHaveLength(1);
    expect(h.calls.at(-1)?.args.p_outcome).toBe("completed");
  });
});
