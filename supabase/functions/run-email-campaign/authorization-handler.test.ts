import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { hasVerifiedAdminRole } from "./admin-role";
import { platformSenderId, platformSmtp } from "../_shared/platform-sender";
import { dispatchOrdinaryBatch, requireQuotaDecision } from "./run-lifecycle";
import { webcrypto } from "node:crypto";

// Execute the actual Edge handler with injected, fail-closed local dependencies.
// No Supabase SDK or remote Deno import is loaded, and no real network is used.
const source = readFileSync(resolve(process.cwd(), "supabase/functions/run-email-campaign/index.ts"), "utf8");
const parsed = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
const imports = parsed.statements.filter(ts.isImportDeclaration);
const withoutImports = [...imports].reverse().reduce(
  (text, statement) => text.slice(0, statement.getFullStart()) + text.slice(statement.end),
  source,
);
const executable = ts.transpileModule(withoutImports, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

const verifiedId = "00000000-0000-4000-8000-000000000001";
const campaignId = "00000000-0000-4000-8000-000000000002";
const organizationId = "00000000-0000-4000-8000-000000000003";
const serviceKey = "handler-test-service-key-not-a-real-secret";

interface Options {
  authenticated?: boolean;
  adminRole?: boolean;
  roleError?: unknown;
  orgPermission?: unknown;
  orgError?: unknown;
  scope?: "platform" | "org";
  status?: string;
  storedConsent?: string | null;
  consentError?: unknown;
}

function harness(options: Options = {}) {
  const forbidden = (name: string) => vi.fn(() => {
    throw new Error(`Unexpected side effect: ${name}`);
  });
  const effects = {
    update: forbidden("database update"),
    insert: forbidden("database insert"),
    upsert: forbidden("database upsert"),
    invoke: forbidden("Edge function / SMTP invocation"),
    fetch: forbidden("network request"),
    waitUntil: forbidden("background job"),
    timer: forbidden("timer"),
  };
  const campaign = {
    id: campaignId,
    scope: options.scope ?? "platform",
    organization_id: options.scope === "org" ? organizationId : null,
    sender_id: null,
    status: options.status ?? "draft",
    delivery_mode: "standard",
    campaign_mode: "standard",
    consent_confirmed_at: options.storedConsent ?? null,
    name: "Authorization fixture", subject: "No real mail", html_body: "<p>Fixture</p>",
    recipient_source: "manual", recipient_filter: {}, updated_at: "2026-09-17T00:00:00Z",
  };
  const campaignQuery = {
    select: vi.fn(), eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: campaign, error: null }),
    update: effects.update, insert: effects.insert, upsert: effects.upsert,
  };
  campaignQuery.select.mockReturnValue(campaignQuery);
  campaignQuery.eq.mockReturnValue(campaignQuery);
  const roleQuery = {
    select: vi.fn(), eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.adminRole ? { role: "admin" } : null,
      error: options.roleError ?? null,
    }),
  };
  roleQuery.select.mockReturnValue(roleQuery);
  roleQuery.eq.mockReturnValue(roleQuery);
  const getUser = vi.fn().mockResolvedValue({
    data: { user: options.authenticated === false ? null : { id: verifiedId } },
    error: null,
  });
  const user = {
    auth: { getUser },
    from: vi.fn((table: string) => {
      if (table !== "user_roles") throw new Error(`Unexpected user table: ${table}`);
      return roleQuery;
    }),
    rpc: vi.fn(async (name: string) => {
      if (name !== "can_access_organization") throw new Error(`Unexpected user RPC: ${name}`);
      return { data: options.orgPermission ?? false, error: options.orgError ?? null };
    }),
  };
  const admin = {
    from: vi.fn((table: string) => {
      if (table !== "email_campaigns") throw new Error(`Unexpected service table: ${table}`);
      return campaignQuery;
    }),
    rpc: vi.fn(async (name: string) => {
      if (name !== "claim_ordinary_campaign_run" || !options.consentError) {
        throw new Error(`Unexpected service RPC: ${name}`);
      }
      return { data: null, error: options.consentError };
    }),
    functions: { invoke: effects.invoke },
  };
  const createClient = vi.fn((
    _url: string, key: string, _options?: { global: { headers: { Authorization: string } } },
  ) => key === serviceKey ? admin : user);
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const serve = vi.fn((callback: typeof handler) => { handler = callback; });
  const env: Record<string, string> = {
    SUPABASE_URL: "https://unused.invalid",
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    SUPABASE_ANON_KEY: "handler-test-anon-key-not-a-real-secret",
    SMTP_HOST: "smtp.example.invalid", SMTP_PORT: "465",
    SMTP_USER: "sender@example.invalid", SMTP_PASS: "fixture-only",
  };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  new Function(
    "serve", "createClient", "hasVerifiedAdminRole", "Deno", "console",
    "platformSenderId", "platformSmtp", "dispatchOrdinaryBatch", "requireQuotaDecision", "crypto",
    "fetch", "EdgeRuntime", "setTimeout", executable,
  )(
    serve, createClient, hasVerifiedAdminRole,
    { env: { get: (key: string) => env[key] } }, logger,
    platformSenderId, platformSmtp, dispatchOrdinaryBatch, requireQuotaDecision, webcrypto,
    effects.fetch, { waitUntil: effects.waitUntil }, effects.timer,
  );
  if (!handler) throw new Error("Actual runner did not register a handler");
  const call = async (body: Record<string, unknown> = {}, bearer = "handler-test-user-jwt") => {
    const response = await handler!(new Request("https://unused.invalid/run-email-campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ campaignId, ...body }),
    }));
    return { response, body: await response.json() };
  };
  return { call, user, admin, roleQuery, createClient, effects, logger };
}

function expectNoSending(h: ReturnType<typeof harness>) {
  for (const effect of Object.values(h.effects)) expect(effect).not.toHaveBeenCalled();
  expect(h.admin.from).toHaveBeenCalledExactlyOnceWith("email_campaigns");
}

describe("run-email-campaign real handler authorization (no network)", () => {
  it("loads only the explicitly injected authorization and lifecycle imports", () => {
    expect(imports.map((item) => (item.moduleSpecifier as ts.StringLiteral).text)).toEqual([
      "https://deno.land/std@0.168.0/http/server.ts",
      "https://esm.sh/@supabase/supabase-js@2.45.0",
      "./admin-role.ts",
      "../_shared/platform-sender.ts",
      "./run-lifecycle.ts",
    ]);
  });

  it("rejects an unauthenticated user with 401 before reading roles", async () => {
    const h = harness({ authenticated: false, adminRole: true });
    const result = await h.call({ consent_confirmed: true });
    expect(result.response.status).toBe(401);
    expect(result.body.error).toBe("Unauthorized");
    expect(h.user.from).not.toHaveBeenCalled();
    expect(h.user.rpc).not.toHaveBeenCalled();
    expect(h.admin.rpc).not.toHaveBeenCalled();
    expectNoSending(h);
  });

  it("rejects a non-admin platform caller and ignores spoofed role/userId body fields", async () => {
    const h = harness();
    const result = await h.call({ consent_confirmed: true, userId: "different-user", role: "admin" });
    expect(result.response.status).toBe(403);
    expect(result.body.error).toBe("Forbidden");
    expect(h.roleQuery.eq.mock.calls).toEqual([["user_id", verifiedId], ["role", "admin"]]);
    expect(h.user.rpc).not.toHaveBeenCalled();
    expect(h.admin.rpc).not.toHaveBeenCalled();
    expectNoSending(h);
  });

  it("fails closed with a generic 500 when the role query errors, even with admin data", async () => {
    const h = harness({ adminRole: true, roleError: { message: "private database detail" } });
    const result = await h.call({ consent_confirmed: true });
    expect(result.response.status).toBe(500);
    expect(result.body.error).toBe("Не удалось проверить права запуска рассылки");
    expect(JSON.stringify(result.body)).not.toContain("private database detail");
    expect(h.logger.error).toHaveBeenCalledTimes(1);
    expect(h.admin.rpc).not.toHaveBeenCalled();
    expectNoSending(h);
  });

  it("lets a verified platform admin reach the still-required initial consent gate", async () => {
    const h = harness({ adminRole: true });
    const result = await h.call();
    expect(result.response.status).toBe(400);
    expect(result.body.consentRequired).toBe(true);
    expect(result.body.error).toContain("consent_confirmed");
    expect(h.user.from).toHaveBeenCalledExactlyOnceWith("user_roles");
    expect(h.admin.rpc).not.toHaveBeenCalled();
    expectNoSending(h);
  });

  it("uses the caller JWT client, not the service client, to read roles", async () => {
    const h = harness({ adminRole: true });
    await h.call();
    expect(h.createClient).toHaveBeenNthCalledWith(2,
      "https://unused.invalid", "handler-test-anon-key-not-a-real-secret",
      { global: { headers: { Authorization: "Bearer handler-test-user-jwt" } } },
    );
    expect(h.user.from).toHaveBeenCalledExactlyOnceWith("user_roles");
    expect(h.user.auth.getUser.mock.invocationCallOrder[0])
      .toBeLessThan(h.user.from.mock.invocationCallOrder[0]);
    expectNoSending(h);
  });

  it.each([false, null, "true"])("denies org sending unless sales.write returns literal true (%j)", async (permission) => {
    const h = harness({ scope: "org", orgPermission: permission });
    const result = await h.call({ consent_confirmed: true });
    expect(result.response.status).toBe(403);
    expect(h.user.rpc).toHaveBeenCalledExactlyOnceWith("can_access_organization", {
      _organization_id: organizationId, _permission: "sales.write",
    });
    expect(h.admin.rpc).not.toHaveBeenCalled();
    expectNoSending(h);
  });

  it("preserves non-admin org sales.write authorization without bypassing consent", async () => {
    const h = harness({ scope: "org", orgPermission: true });
    const result = await h.call();
    expect(result.response.status).toBe(400);
    expect(result.body.consentRequired).toBe(true);
    expect(h.user.rpc).toHaveBeenCalledExactlyOnceWith("can_access_organization", {
      _organization_id: organizationId, _permission: "sales.write",
    });
    expect(h.admin.rpc).not.toHaveBeenCalled();
    expectNoSending(h);
  });

  it("requires stored consent for the exact service-role bearer, even when body consent is true", async () => {
    const h = harness({ authenticated: false });
    const result = await h.call({ consent_confirmed: true }, serviceKey);
    expect(result.response.status).toBe(400);
    expect(result.body.consentRequired).toBe(true);
    expect(result.body.error).toContain("Согласие получателей не подтверждено");
    expect(h.user.from).not.toHaveBeenCalled();
    expect(h.user.rpc).not.toHaveBeenCalled();
    expect(h.admin.rpc).not.toHaveBeenCalled();
    expectNoSending(h);
  });

  it.each([`${serviceKey}-suffix`, "service_role", ""])("does not treat a different bearer as service-role (%s)", async (bearer) => {
    const h = harness({ authenticated: false });
    const result = await h.call({ consent_confirmed: true }, bearer);
    expect(result.response.status).toBe(401);
    expect(h.user.from).not.toHaveBeenCalled();
    expect(h.admin.rpc).not.toHaveBeenCalled();
    expectNoSending(h);
  });

  it("does not replace missing persisted resume consent with body consent", async () => {
    const h = harness({ adminRole: true, status: "paused" });
    const result = await h.call({ consent_confirmed: true });
    expect(result.response.status).toBe(400);
    expect(result.body.consentRequired).toBe(true);
    expect(h.admin.rpc).not.toHaveBeenCalled();
    expectNoSending(h);
  });

  it("stops before materialization/quota/SMTP if atomic consent and run claim fail", async () => {
    const h = harness({ adminRole: true, consentError: { message: "fixture consent failure" } });
    const result = await h.call({ consent_confirmed: true });
    expect(result.response.status).toBe(503);
    expect(result.body.error).toBe("Не удалось подтвердить захват запуска; повторная отправка не выполнялась");
    expect(h.admin.rpc).toHaveBeenCalledExactlyOnceWith("claim_ordinary_campaign_run", {
      p_campaign_id: campaignId, p_requested_by: verifiedId,
      p_token: expect.any(String), p_expected_updated_at: "2026-09-17T00:00:00Z",
      p_is_service_role: false, p_consent_confirmed: true,
    });
    expectNoSending(h);
  });
});
