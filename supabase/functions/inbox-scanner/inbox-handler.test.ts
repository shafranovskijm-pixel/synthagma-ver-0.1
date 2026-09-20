import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { parseRfc822 } from "../_shared/imap-mini";
import { inboxMessagePayload } from "./message-payload";

// Actual Deno handler, with in-memory transport/DB adapters only. No network.
const compiled = ts.transpileModule(readFileSync(resolve(process.cwd(), "supabase/functions/inbox-scanner/index.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const poolId = "00000000-0000-4000-8000-000000000001";
const schoolEmail = "school@example.com";
const inboxEmail = "sender@example.com";
const rawMessage = (id: number) => `From: School <${schoolEmail}>\r\nTo: hidden-alias@example.com\r\nSubject: Re: Invitation\r\nMessage-ID: <reply-${id}@example.com>\r\nIn-Reply-To: <outgoing@fixture.invalid>\r\nReferences: <older@example.com>\r\n <outgoing@fixture.invalid>\r\nDate: Tue, 08 Sep 2026 00:00:00 +1000\r\n\r\nReply ${id}`;

function fixture(options: {
  oldUid?: number; oldValidity?: number | null; currentValidity?: number; uids?: number[];
  fetchFailure?: number; nullFetch?: number; storeFailure?: number; storeRejected?: number;
  checkpointFailure?: number; claimRejected?: boolean; duplicate?: number; flushFailure?: boolean;
  role?: boolean; roleError?: boolean; invalidUser?: boolean; cronSecret?: string; raw?: string;
} = {}) {
  const events: string[] = [];
  const saved: { uid: number; message: ReturnType<typeof inboxMessagePayload> }[] = [];
  let cursor = options.oldUid ?? 0;
  let validity = options.oldValidity === undefined ? 42 : options.oldValidity;
  let activeToken: string | null = null;
  const getPool = vi.fn();
  const roleLookup = vi.fn();
  const getUser = vi.fn(async () => ({ data: { user: options.invalidUser ? null : { id: "fixture-admin-id" } }, error: null }));
  const flush = vi.fn(async (name, args) => {
    expect(name).toBe("notify-mailing-campaign-report"); expect(args).toEqual({ body: {} });
    return { data: {}, error: options.flushFailure ? { message: "fixture report unavailable" } : null };
  });
  const admin = {
    from(table: string) {
      expect(table).toBe("email_sender_pool"); getPool();
      const query = { select: () => query, eq: () => query, not: async () => ({ data: [{ id: poolId, email: inboxEmail, app_password: "fixture-secret", imap_host: "imap.fixture.invalid", imap_port: 993, imap_encryption: "ssl" }], error: null }) };
      return query;
    },
    async rpc(name: string, args: Record<string, any>) {
      if (name === "claim_ordinary_inbox_scan") {
        if (activeToken || options.claimRejected) return { data: { claimed: false, reason: "busy" }, error: null };
        activeToken = args.p_token; events.push("claim");
        return { data: { claimed: true, last_uid: cursor, uid_validity: validity }, error: null };
      }
      if (name === "checkpoint_ordinary_inbox_scan") {
        expect(args.p_token).toBe(activeToken);
        if (args.p_last_uid === options.checkpointFailure) return { data: null, error: { message: "fixture checkpoint unavailable" } };
        if (args.p_last_uid !== 0) expect(saved.some(row => row.uid === args.p_last_uid)).toBe(true);
        cursor = args.p_last_uid; validity = args.p_uid_validity; events.push(`checkpoint:${cursor}`);
        return { data: { updated: true }, error: null };
      }
      if (name === "store_ordinary_inbox_message") {
        expect(args.p_sender_kind).toBe("pool"); expect(args.p_sender_id).toBe(poolId);
        expect(args.p_scan_token).toBe(activeToken); expect(args.p_uid_validity).toBe(validity);
        events.push(`store:${args.p_uid}`);
        if (args.p_uid === options.storeFailure) return { data: null, error: { message: "fixture store unavailable" } };
        if (args.p_uid === options.storeRejected) return { data: { stored: false, reason: "mismatch" }, error: null };
        saved.push({ uid: args.p_uid, message: args.p_message });
        return { data: { stored: true, duplicate: args.p_uid === options.duplicate, attributed: !args.p_message.ignored_reason, campaign_id: "fixture-campaign" }, error: null };
      }
      if (name === "release_ordinary_inbox_scan") {
        expect(args.p_token).toBe(activeToken); events.push(`release:${args.p_outcome}`);
        if (args.p_outcome !== "uncertain") activeToken = null;
        return { data: { released: true }, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    functions: { invoke: flush },
  };
  const userClient = {
    auth: { getUser },
    from(table: string) {
      expect(table).toBe("user_roles"); roleLookup();
      const filters: Record<string, string> = {};
      const query = { select: () => query, eq: (key: string, value: string) => { filters[key] = value; return query; }, maybeSingle: async () => {
        expect(filters).toEqual({ user_id: "fixture-admin-id", role: "admin" });
        return { data: options.role ? { role: "admin" } : null, error: options.roleError ? { message: "fixture role lookup unavailable" } : null };
      } };
      return query;
    },
  };
  const createClient = vi.fn((_url, key) => key === "fixture-anon-key" ? userClient : admin);
  const connectImap = vi.fn(async () => { events.push("connect"); return {}; });
  const examineInbox = vi.fn(async () => ({ uidValidity: options.currentValidity ?? 42 }));
  const searchUidsSince = vi.fn(async (_connection, since) => { events.push(`search:${since}`); return options.uids ?? [1, 2, 3]; });
  const fetchRfc822 = vi.fn(async (_connection, next: number) => {
    events.push(`fetch:${next}`);
    if (next === options.fetchFailure) throw new Error("fixture FETCH rejected");
    return next === options.nullFetch ? null : options.raw || rawMessage(next);
  });
  const closeImap = vi.fn(async () => { events.push("close"); });
  let handler!: (req: Request) => Promise<Response>;
  const env: Record<string, string> = { SUPABASE_URL: "https://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key", SUPABASE_ANON_KEY: "fixture-anon-key", MAILING_CAMPAIGN_CRON_SECRET: options.cronSecret ?? "fixture-cron-secret-at-least-24-chars" };
  const modules: Record<string, unknown> = {
    "https://esm.sh/@supabase/supabase-js@2.45.0?target=deno": { createClient },
    "../_shared/imap-mini.ts": { connectImap, closeImap, examineInbox, searchUidsSince, fetchRfc822, parseRfc822 },
    "./message-payload.ts": { inboxMessagePayload },
  };
  new Function("require", "module", "exports", "Deno", compiled)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected module ${name}`); return modules[name];
  }, { exports: {} }, {}, { env: { get: (key: string) => env[key] }, serve: (fn: typeof handler) => { handler = fn; } });
  const run = async (headers: Record<string, string> = { Authorization: "Bearer fixture-service-key" }) => {
    const response = await handler(new Request("https://fixture.invalid/inbox-scanner", { method: "POST", headers }));
    return { status: response.status, data: await response.json() };
  };
  return { run, events, saved, cursor: () => cursor, validity: () => validity, getPool, roleLookup, getUser, createClient, connectImap, fetchRfc822, searchUidsSince, flush };
}

describe("inbox scanner actual handler transport fixtures", () => {
  it.each([{}, { Authorization: "Bearer anonymous" }])("rejects unauthenticated/non-admin %j before pool access or IMAP", async headers => {
    const f = fixture(); expect((await f.run(headers)).status).toBe(403);
    expect(f.getPool).not.toHaveBeenCalled(); expect(f.connectImap).not.toHaveBeenCalled();
  });
  it.each(["", "too-short"])("does not authorize empty/short cron secret %s", async cronSecret => {
    const f = fixture({ cronSecret }); expect((await f.run({ "x-cron-secret": cronSecret })).status).toBe(403);
    expect(f.getPool).not.toHaveBeenCalled();
  });
  it("accepts the configured long cron secret without browser role lookup", async () => {
    const f = fixture({ uids: [] });
    expect((await f.run({ "x-cron-secret": "fixture-cron-secret-at-least-24-chars" })).status).toBe(200);
    expect(f.getUser).not.toHaveBeenCalled(); expect(f.connectImap).toHaveBeenCalledOnce();
  });
  it("preserves verified admin Unibox scan, without ambiguous has_role RPC", async () => {
    const f = fixture({ role: true, uids: [] }); expect((await f.run({ Authorization: "Bearer user-jwt" })).status).toBe(200);
    expect(f.getUser).toHaveBeenCalledOnce(); expect(f.roleLookup).toHaveBeenCalledOnce(); expect(f.connectImap).toHaveBeenCalledOnce();
  });
  it.each([{ role: true, roleError: true }, { role: true, invalidUser: true }])("fails closed on identity/role errors %j", async options => {
    const f = fixture(options); expect((await f.run({ Authorization: "Bearer user-jwt" })).status).toBe(403);
    expect(f.getPool).not.toHaveBeenCalled(); expect(f.connectImap).not.toHaveBeenCalled();
  });
  it("requires a pool claim before connecting and prevents concurrent duplicate scans", async () => {
    const f = fixture(); await Promise.all([f.run(), f.run()]);
    expect(f.connectImap).toHaveBeenCalledOnce(); expect(f.saved).toHaveLength(3);
    const blocked = fixture({ claimRejected: true }); await blocked.run(); expect(blocked.connectImap).not.toHaveBeenCalled();
  });
  it("saves each reply before checkpoint and keeps BCC/alias To in raw headers only", async () => {
    const f = fixture({ uids: [1] }); const response = await f.run();
    expect(response.data).toMatchObject({ new_messages: 1, attributed: 1, report_flush: "requested" });
    expect(f.events).toEqual(["claim", "connect", "search:0", "fetch:1", "store:1", "checkpoint:1", "close", "release:completed"]);
    expect(f.saved[0].message).toMatchObject({ from_email: schoolEmail, to_email: inboxEmail, in_reply_to: "<outgoing@fixture.invalid>", references_ids: ["<older@example.com>", "<outgoing@fixture.invalid>"] });
    expect(f.saved[0].message.headers_raw).toContain("hidden-alias@example.com");
  });
  it.each([{ oldValidity: null }, { oldValidity: 41 }])("first scan/UIDVALIDITY rollover starts at zero without baseline skipping %j", async options => {
    const f = fixture({ ...options, oldUid: 999, uids: [1, 2], duplicate: 1 }); const response = await f.run();
    expect(f.events.indexOf("checkpoint:0")).toBeLessThan(f.events.indexOf("search:0"));
    expect(f.cursor()).toBe(2); expect(f.validity()).toBe(42); expect(response.data.new_messages).toBe(1);
  });
  it.each([{ fetchFailure: 2 }, { nullFetch: 2 }])("never skips a failed or null FETCH %j", async options => {
    const f = fixture(options); await f.run(); expect(f.cursor()).toBe(1); expect(f.saved.map(row => row.uid)).toEqual([1]);
    expect(f.fetchRfc822.mock.calls.map(call => call[1])).toEqual([1, 2]); expect(f.events).toContain("release:failed");
  });
  it.each([{ storeFailure: 2 }, { checkpointFailure: 2 }])("uncertain durable write stops and parks ownership without skipping %j", async options => {
    const f = fixture(options); await f.run(); expect(f.cursor()).toBe(1); expect(f.events).toContain("release:uncertain");
    expect(f.fetchRfc822.mock.calls.map(call => call[1])).toEqual([1, 2]);
    await f.run(); expect(f.connectImap).toHaveBeenCalledOnce();
  });
  it("known store rejection stops before checkpoint or the next UID", async () => {
    const f = fixture({ storeRejected: 2 }); await f.run(); expect(f.cursor()).toBe(1); expect(f.events).toContain("release:failed");
    expect(f.events).not.toContain("fetch:3");
  });
  it("ignored warmup is durably receipted before advancing but not counted as a reply", async () => {
    const f = fixture({ uids: [1], raw: `X-Warmup-Id: fixture\r\n${rawMessage(1)}` }); const response = await f.run();
    expect(f.saved[0].message.ignored_reason).toBe("warmup"); expect(f.cursor()).toBe(1); expect(response.data.new_messages).toBe(0);
  });
  it("report flush failure never rewinds successfully saved inbox/cursor", async () => {
    const f = fixture({ uids: [1], flushFailure: true }); const response = await f.run();
    expect(response.data.report_flush).toBe("failed"); expect(f.cursor()).toBe(1); expect(f.saved).toHaveLength(1); expect(f.events).toContain("release:completed");
  });
});
