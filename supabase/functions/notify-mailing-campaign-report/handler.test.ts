import { describe, expect, it, vi } from "vitest";
import { createMailingReportHandler } from "./handler";

const campaignId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const orgId = "33333333-3333-4333-8333-333333333333";
const platformChat = "-1001234567890";
const orgChat = "-1009876543210";
const serviceKey = "fixture-service-only-not-a-real-key";
const cronSecret = "fixture-cron-secret-with-at-least-24-characters";
const event = { id: eventId, campaign_id: campaignId, scope: "platform", organization_id: null };
const payload = {
  campaign_id: campaignId, campaign_name: "Fixture invitation", status: "completed",
  counts: { total: 11, pending: 0, sent: 11, failed: 0, unresolved: 0 },
  senders: [{ from_email: "fixture@example.invalid" }], occurred_at: "2026-09-08T00:00:00Z",
};

function fixture(options: Record<string, any> = {}) {
  const env: Record<string, string | undefined> = {
    SUPABASE_SERVICE_ROLE_KEY: serviceKey, MAILING_CAMPAIGN_CRON_SECRET: cronSecret,
    TELEGRAM_SUPPORT_CHAT_ID: platformChat, TELEGRAM_BOT_TOKEN: "fixture-bot-not-used-for-network",
    ...options.env,
  };
  const events = options.events ?? [event];
  const states = new Map<string, string>(events.map((row: any) => [row.id, "pending"]));
  const queries: Array<{ table: string; filters: Record<string, unknown>; fields?: string }> = [];
  let nextToken = 0;
  const invoke = vi.fn(async () => {
    if (options.relayThrows) throw new Error("fixture transport unknown");
    return options.relayResult ?? { data: { success: true, message_id: 42 }, error: null };
  });
  const rpc = vi.fn(async (name: string, args: any) => {
    if (name === "list_ordinary_mail_report_candidates") {
      if (options.lookupResult !== undefined) return options.lookupResult;
      const pending = events.filter((row: any) => states.get(row.id) === "pending"
        && (!args.p_campaign_id || row.campaign_id === args.p_campaign_id)
        && (!args.p_event_id || row.id === args.p_event_id));
      // Models the SQL contract: eligibility is applied before LIMIT. This is
      // not a replacement for executing the actual SQL concurrency/ACL tests.
      const eligible = pending.filter((row: any) => args.p_bot_ready && (
        row.scope === "platform" ? args.p_platform_ready
          : row.scope === "org" && row.organization_id && !(options.blockedOrgIds ?? []).includes(row.organization_id)
      ));
      return { data: { events: eligible.slice(0, args.p_limit), blocked: pending.length - eligible.length }, error: null };
    }
    if (name === "claim_ordinary_mail_report") {
      if (options.claimThrows) throw new Error("fixture claim unknown");
      if (options.claimError) return { error: new Error("fixture claim failure") };
      if (options.claimResult !== undefined) return options.claimResult;
      if (states.get(args.p_event_id) !== "pending") return { data: { claimed: false } };
      // Synchronous CAS before any await models the durable SQL claim boundary.
      states.set(args.p_event_id, "claimed");
      return { data: {
        claimed: true, event_id: args.p_event_id, claim_token: args.p_claim_token,
        target_chat_id: args.p_target_chat_id, kind: "run_report", payload,
      }, error: null };
    }
    if (name === "finish_ordinary_mail_report") {
      if (options.finishError) return { error: new Error("fixture finalization unknown") };
      states.set(args.p_event_id, args.p_state);
      return { data: { finished: true, state: args.p_state }, error: null };
    }
    throw new Error(`Unexpected fixture RPC: ${name}`);
  });
  const admin = {
    functions: { invoke }, rpc,
    from(table: string) {
      const query = { table, filters: {} as Record<string, unknown>, fields: "" };
      queries.push(query);
      const result = () => {
        if (table === "organizations") return options.orgResult ?? { data: { telegram_notify_enabled: true, telegram_notify_chat_id: orgChat }, error: null };
        throw new Error(`Unexpected fixture table: ${table}`);
      };
      const chain: any = {
        select(fields: string) { query.fields = fields; return chain; },
        eq(key: string, value: unknown) { query.filters[key] = value; return chain; },
        order() { return chain; }, limit() { return chain; }, maybeSingle: async () => result(),
        then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
      };
      return chain;
    },
  };
  const createAdmin = vi.fn(() => admin);
  const handler = createMailingReportHandler({ env: (key) => env[key], createAdmin, newToken: () => `fixture-token-${++nextToken}` });
  const run = async (body: unknown = {}, settings: { headers?: Record<string, string>; method?: string; raw?: string } = {}) => {
    const method = settings.method ?? "POST";
    const response = await handler(new Request("https://example.invalid/local-fixture", {
      method, headers: settings.headers ?? { Authorization: `Bearer ${serviceKey}` },
      ...(method === "POST" ? { body: settings.raw ?? JSON.stringify(body) } : {}),
    }));
    return { status: response.status, data: await response.json() };
  };
  return { run, createAdmin, queries, rpc, invoke, states };
}

describe("mailing report handler factory, no real HTTP or Telegram calls", () => {
  it.each([
    {}, { Authorization: "Bearer wrong" }, { "X-Cron-Secret": "wrong" },
    { Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.fixture-signature" },
    { Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.fixture-signature" },
  ])("rejects unauthorized request before creating DB client", async (headers) => {
    const f = fixture();
    expect((await f.run({}, { headers })).status).toBe(401);
    expect(f.createAdmin).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it("accepts an exact service credential even when the cron header is wrong", async () => {
    const f = fixture();
    expect((await f.run({}, { headers: { Authorization: `Bearer ${serviceKey}`, "X-Cron-Secret": "wrong" } })).data.sent).toBe(1);
  });
  it("accepts a configured sufficiently long cron secret without service bearer", async () => {
    const f = fixture();
    expect((await f.run({}, { headers: { "X-Cron-Secret": cronSecret } })).data.sent).toBe(1);
  });
  it("fails before creating DB client when cron is valid but service configuration is missing", async () => {
    const f = fixture({ env: { SUPABASE_SERVICE_ROLE_KEY: undefined } });
    expect((await f.run({}, { headers: { "X-Cron-Secret": cronSecret } })).status).toBe(503);
    expect(f.createAdmin).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it.each(["", "short", "12345678901234567890123"])("rejects configured weak cron secret of length %s before DB", async (secret) => {
    const f = fixture({ env: { MAILING_CAMPAIGN_CRON_SECRET: secret } });
    expect((await f.run({}, { headers: { "X-Cron-Secret": secret } })).status).toBe(401);
    expect(f.createAdmin).not.toHaveBeenCalled();
  });
  it("accepts the minimum 24-character cron secret", async () => {
    const secret = "123456789012345678901234";
    const f = fixture({ env: { MAILING_CAMPAIGN_CRON_SECRET: secret } });
    expect((await f.run({}, { headers: { "X-Cron-Secret": secret } })).data.sent).toBe(1);
  });
  it("rejects non-POST methods before DB", async () => {
    const f = fixture();
    expect((await f.run({}, { method: "GET" })).status).toBe(405);
    expect(f.createAdmin).not.toHaveBeenCalled();
  });
  it.each([{ chat_id: orgChat }, { text: "Injected" }, { message: "Injected" }, { token: "Injected" }, { campaignId, eventId, scope: "platform" }, [], null])("rejects caller-controlled targets or payloads before DB", async (body) => {
    const f = fixture();
    expect((await f.run(body)).status).toBe(400);
    expect(f.createAdmin).not.toHaveBeenCalled();
  });
  it.each([{ campaignId: "bad" }, { eventId: 12 }, { eventId: null }, { campaignId: "" }])("rejects invalid identifiers before DB", async (body) => {
    const f = fixture();
    expect((await f.run(body)).data.error).toBe("invalid_id");
    expect(f.createAdmin).not.toHaveBeenCalled();
  });
  it("rejects malformed and oversized JSON before DB", async () => {
    const f = fixture();
    expect((await f.run({}, { raw: "{" })).data.error).toBe("invalid_json");
    expect((await f.run({}, { raw: "x".repeat(4097) })).status).toBe(413);
    expect(f.createAdmin).not.toHaveBeenCalled();
  });
  it("filters only pending server events by the exact permitted IDs", async () => {
    const f = fixture();
    expect((await f.run({ campaignId, eventId })).data.sent).toBe(1);
    expect(f.rpc.mock.calls[0]).toEqual(["list_ordinary_mail_report_candidates", {
      p_platform_ready: true, p_bot_ready: true, p_campaign_id: campaignId, p_event_id: eventId, p_limit: 20,
    }]);
    expect(f.queries.some((query) => query.table === "ordinary_mail_report_events")).toBe(false);
    expect(f.invoke).toHaveBeenCalledWith("send-telegram-notification", { body: { chat_id: platformChat, message: expect.stringContaining("Приём SMTP не подтверждает") } });
  });
  it.each([
    { TELEGRAM_SUPPORT_CHAT_ID: undefined }, { TELEGRAM_SUPPORT_CHAT_ID: "https://t.me/not-a-chat-id" },
    { TELEGRAM_BOT_TOKEN: undefined }, { TELEGRAM_BOT_TOKEN: " " },
  ])("leaves the event pending when existing Telegram configuration is absent or malformed", async (env) => {
    const f = fixture({ env });
    expect((await f.run()).data).toMatchObject({ sent: 0, blocked: 1 });
    expect(f.states.get(eventId)).toBe("pending");
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["list_ordinary_mail_report_candidates"]);
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it("uses the event organization binding rather than platform Telegram", async () => {
    const f = fixture({ events: [{ ...event, scope: "org", organization_id: orgId }] });
    expect((await f.run()).data.sent).toBe(1);
    expect(f.queries.find((q) => q.table === "organizations")?.filters).toEqual({ id: orgId });
    expect(f.invoke.mock.calls[0]).toEqual(["send-telegram-notification", { body: { chat_id: orgChat, message: expect.any(String) } }]);
  });
  it.each([
    { data: { telegram_notify_enabled: false, telegram_notify_chat_id: orgChat } },
    { data: null }, { data: null, error: new Error("fixture org read failure") },
  ])("never falls back to platform chat when organization binding is disabled or unreadable", async (orgResult) => {
    const f = fixture({ events: [{ ...event, scope: "org", organization_id: orgId }], orgResult });
    expect((await f.run()).data.blocked).toBe(1);
    expect(f.states.get(eventId)).toBe("pending");
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["list_ordinary_mail_report_candidates"]);
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it.each([
    { error: new Error("fixture lookup failure") }, { data: null }, { data: {} },
    { data: { events: [], blocked: -1 } }, { data: { events: [], blocked: "0" } },
  ])("fails closed on event lookup failure", async (lookupResult) => {
    const f = fixture({ lookupResult });
    expect((await f.run()).status).toBe(503);
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["list_ordinary_mail_report_candidates"]);
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it("twenty older blocked organizations do not starve a newer eligible platform report", async () => {
    const blockedEvents = Array.from({ length: 20 }, (_, n) => ({
      ...event, id: `55555555-5555-4555-8555-${String(n + 1).padStart(12, "0")}`,
      scope: "org", organization_id: orgId,
    }));
    const f = fixture({ events: [...blockedEvents, event], blockedOrgIds: [orgId] });
    expect((await f.run()).data).toMatchObject({ inspected: 1, blocked: 20, sent: 1 });
    expect(f.invoke).toHaveBeenCalledTimes(1);
    expect(f.rpc.mock.calls.find(([name]) => name === "claim_ordinary_mail_report")![1].p_event_id).toBe(eventId);
    expect(blockedEvents.every((row) => f.states.get(row.id) === "pending")).toBe(true);
    expect(f.states.get(eventId)).toBe("sent");
  });
  it.each([{ claimError: true }, { claimThrows: true }, { claimResult: { data: { claimed: false } } }])("does not relay after unknown or lost claim", async (options) => {
    const f = fixture(options);
    const result = await f.run();
    expect(result.data.sent).toBe(0);
    expect(f.invoke).not.toHaveBeenCalled();
    expect(f.rpc.mock.calls.filter(([name]) => name === "claim_ordinary_mail_report")).toHaveLength(1);
    expect(f.rpc.mock.calls.filter(([name]) => name === "finish_ordinary_mail_report")).toHaveLength(0);
  });
  it("two concurrent handler invocations sharing a claim store relay a pending event once", async () => {
    const f = fixture();
    const responses = await Promise.all([f.run(), f.run()]);
    expect(responses.reduce((sum, result) => sum + result.data.sent, 0)).toBe(1);
    expect(f.invoke).toHaveBeenCalledTimes(1);
    expect(f.states.get(eventId)).toBe("sent");
  });
  it("stores the Telegram message ID with the same owner token as the claim", async () => {
    const f = fixture();
    await f.run();
    const claim = f.rpc.mock.calls.find(([name]) => name === "claim_ordinary_mail_report")![1];
    const finish = f.rpc.mock.calls.find(([name]) => name === "finish_ordinary_mail_report")![1];
    expect(finish).toEqual({ p_event_id: eventId, p_claim_token: claim.p_claim_token, p_state: "sent", p_telegram_message_id: 42, p_error_category: null });
  });
  it.each([
    { relayResult: { data: { success: true } } },
    { relayResult: { data: { success: true, message_id: 0 } } },
    { relayThrows: true },
  ])("stores an ambiguous relay outcome as uncertain and never retries it", async (options) => {
    const f = fixture(options);
    expect((await f.run()).data.uncertain).toBe(1);
    expect(f.states.get(eventId)).toBe("uncertain");
    expect((await f.run()).data.inspected).toBe(0);
    expect(f.invoke).toHaveBeenCalledTimes(1);
    expect(f.rpc.mock.calls.find(([name]) => name === "finish_ordinary_mail_report")![1]).toMatchObject({ p_state: "uncertain", p_telegram_message_id: null });
  });
  it("does not resend a claimed event after accepted relay but failed finalization", async () => {
    const f = fixture({ finishError: true });
    expect((await f.run()).data.uncertain).toBe(1);
    expect(f.states.get(eventId)).toBe("claimed");
    expect((await f.run()).data.inspected).toBe(0);
    expect(f.invoke).toHaveBeenCalledTimes(1);
  });
});
