// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as access from "../../functions/_shared/privileged-access";
import * as documents from "../../functions/_shared/document-operation-access";

const user = "00000000-0000-4000-8000-000000000001";
const org = "00000000-0000-4000-8000-000000000002";
const otherOrg = "00000000-0000-4000-8000-000000000003";
const orderId = "00000000-0000-4000-8000-000000000004";
const target = { html: "<html><body>Договор на русском языке</body></html>", fileName: "Договор.pdf",
  storagePath: `${org}/bulk/2026-10/new-contract.pdf` };

function db(options: { invalid?: boolean; revoked?: boolean; writer?: boolean; admin?: boolean;
  missingRenderer?: boolean; uploadError?: boolean; permissionError?: boolean; orderOrg?: string; orderStatus?: string; platformReadonly?: boolean } = {}) {
  const effects = { upload: vi.fn(async () => ({ error: options.uploadError ? new Error("denied") : null })),
    insert: vi.fn(), update: vi.fn(), callAI: vi.fn(), fetch: vi.fn(async () => new Response("%PDF-1.7\nfixture")) };
  const from = vi.fn((table: string) => {
    const rows: Record<string, unknown> = {
      account_deletion_revocations: options.revoked ? { user_id: user } : null,
      user_roles: options.admin ? { role: "admin" } : null,
      service_orders: { id: orderId, organization_id: options.orderOrg ?? org,
        service_id: "self_examination_report_auto", status: options.orderStatus ?? "pending", notes: "{}" },
    };
    if (!(table in rows)) throw new Error(`Unexpected business read: ${table}`);
    const q = { select: vi.fn(() => q), eq: vi.fn(() => q),
      maybeSingle: vi.fn(async () => ({ data: rows[table], error: null })),
      insert: effects.insert, update: effects.update };
    return q;
  });
  const client = { auth: { getUser: vi.fn(async () => ({ data: { user: options.invalid ? null : { id: user } }, error: null })) },
    from, rpc: vi.fn(async (name: string) => ({ data: name === "uc_platform_document_action_allowed" ? !!options.admin && !options.platformReadonly : !!options.writer,
      error: options.permissionError ? new Error("offline") : null })),
    storage: { from: vi.fn(() => ({ upload: effects.upload })) } };
  return { client, effects, options };
}

function request(body = target as Record<string, unknown>, token: string | null = "verified-user", method = "POST") {
  return new Request("https://example.invalid/function", { method,
    headers: token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {},
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
}

function actualHandler(name: string, fixture: ReturnType<typeof db>) {
  const source = readFileSync(resolve(process.cwd(), `supabase/functions/${name}/index.ts`), "utf8");
  const ast = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const stripped = [...ast.statements.filter(ts.isImportDeclaration)].reverse().reduce(
    (text, statement) => text.slice(0, statement.getFullStart()) + text.slice(statement.end), source);
  const executable = ts.transpileModule(stripped, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  let handler!: (req: Request) => Promise<Response>;
  const serve = (fn: typeof handler) => { handler = fn; };
  const dependencies = { ...access, ...documents, createClient: () => fixture.client,
    serve, fetch: fixture.effects.fetch, callAI: fixture.effects.callAI,
    Deno: { serve, env: { get: (key: string) => key === "BROWSERLESS_TOKEN" ? (fixture.options.missingRenderer ? undefined : "fixture-token") : "https://example.invalid" } },
    console: { log() {}, error() {} } };
  new Function(...Object.keys(dependencies), executable)(...Object.values(dependencies));
  return handler;
}

describe("document renderer boundary (actual handler)", () => {
  it.each([{ token: null, status: 401 }, { token: "bad", invalid: true, status: 401 },
    { token: "valid", revoked: true, status: 403 }, { token: "valid", status: 403 },
    { token: "valid", permissionError: true, status: 503 }])("denies before rendering or storage: %j", async c => {
    const f = db(c); const response = await actualHandler("html-to-pdf", f)(request(target, c.token));
    expect(response.status).toBe(c.status);
    expect(response.headers.get("X-Sintagma-Function-Revision")).toBe("uc-permissions-20261018-v2");
    expect(f.effects.fetch).not.toHaveBeenCalled(); expect(f.effects.upload).not.toHaveBeenCalled();
  });
  it("resolves write access for the path organization using the user JWT", async () => {
    const f = db({ writer: true }); const response = await actualHandler("html-to-pdf", f)(request());
    expect(response.status).toBe(200);
    expect(f.client.rpc).toHaveBeenCalledWith("uc_document_action_allowed", { p_org: org, p_action: "write", p_group: null, p_enrollment: null });
    expect(f.effects.upload).toHaveBeenCalledWith(target.storagePath, expect.any(Uint8Array), { contentType: "application/pdf", upsert: false });
    expect(await response.json()).toMatchObject({ success: true, renderer: "browserless" });
  });
  it("authorizes a group draft using its exact storage-path group, ignoring a body-supplied alternative", async () => {
    const f = db({ writer: true });
    const storagePath = `${org}/contracts/${orderId}/draft/file.pdf`;
    expect((await actualHandler("html-to-pdf", f)(request({ ...target, storagePath, groupId: otherOrg }))).status).toBe(200);
    expect(f.client.rpc).toHaveBeenCalledWith("uc_document_action_allowed", { p_org: org, p_action: "write", p_group: orderId, p_enrollment: null });
  });
  it("denies an unassigned group before rendering or upload", async () => {
    const f = db();
    expect((await actualHandler("html-to-pdf", f)(request({ ...target, storagePath: `${org}/contracts/${orderId}/draft/file.pdf` }))).status).toBe(403);
    expect(f.effects.fetch).not.toHaveBeenCalled(); expect(f.effects.upload).not.toHaveBeenCalled();
  });
  it.each([`${org}/bulk/../other.pdf`, `${org}/bulk/%2e%2e/other.pdf`, `${org}/bulk//other.pdf`,
    `${org}/other/2026/other.pdf`, `${org}/contracts/x/other.pdf?token=x`])("rejects an unsafe destination %s", async storagePath => {
    const f = db({ writer: true });
    expect((await actualHandler("html-to-pdf", f)(request({ ...target, storagePath }))).status).toBe(400);
    expect(f.effects.fetch).not.toHaveBeenCalled(); expect(f.effects.upload).not.toHaveBeenCalled();
  });
  it.each(["missing", "failure", "nonpdf", "network"])('never stores a fallback on renderer %s', async scenario => {
    const f = db({ writer: true, missingRenderer: scenario === "missing" });
    if (scenario === "failure") f.effects.fetch.mockResolvedValueOnce(new Response("failed", { status: 500 }));
    if (scenario === "nonpdf") f.effects.fetch.mockResolvedValueOnce(new Response("<html>error</html>"));
    if (scenario === "network") f.effects.fetch.mockRejectedValueOnce(new Error("offline"));
    expect((await actualHandler("html-to-pdf", f)(request())).status).toBe(503);
    expect(f.effects.upload).not.toHaveBeenCalled();
  });
  it("surfaces storage failure without an overwrite or successful result", async () => {
    const f = db({ writer: true, uploadError: true });
    const response = await actualHandler("html-to-pdf", f)(request());
    expect(response.status).toBe(409); expect(await response.json()).not.toHaveProperty("success");
    expect(f.effects.upload.mock.calls[0][2]).toMatchObject({ upsert: false });
  });
});

describe("self-examination fulfilment access", () => {
  it("completes only the observed matching order state and never replaces the questionnaire", async () => {
    const q = { eq: vi.fn(() => q), select: vi.fn(() => q), maybeSingle: vi.fn(async () => ({ data: { id: orderId }, error: null })) };
    const update = vi.fn(() => q);
    const f = db(); f.client.from.mockReturnValueOnce({ update } as any);
    await documents.completeSelfExaminationOrder(f.client, { id: orderId, organization_id: org, service_id: "self_examination_report_auto", status: "pending" });
    expect(update.mock.calls[0][0]).not.toHaveProperty("notes");
    expect(q.eq).toHaveBeenCalledWith("status", "pending");
    expect(q.eq).toHaveBeenCalledWith("organization_id", org);
  });
  it("does not overwrite a cancellation made during report generation", async () => {
    const q = { eq: vi.fn(() => q), select: vi.fn(() => q), maybeSingle: vi.fn(async () => ({ data: null, error: null })) };
    const f = db(); f.client.from.mockReturnValueOnce({ update: () => q } as any);
    await expect(documents.completeSelfExaminationOrder(f.client, { id: orderId, organization_id: org, service_id: "self_examination_report_auto", status: "pending" })).rejects.toHaveProperty("status", 409);
  });
  it("allows a completion retry after the order is already completed", async () => {
    const f = db(); await documents.completeSelfExaminationOrder(f.client, { status: "completed" });
    expect(f.client.from).not.toHaveBeenCalled();
  });
  it.each([{}, { admin: true, platformReadonly: true }, { admin: true, orderOrg: otherOrg }, { admin: true, orderStatus: "cancelled" }])("does not read organization facts or call AI before authorization %j", async options => {
    const f = db(options);
    const response = await actualHandler("generate-self-examination-report", f)(request({ organizationId: org, orderId }));
    expect([403, 409]).toContain(response.status);
    expect(f.client.from).not.toHaveBeenCalledWith("organizations");
    expect(f.effects.callAI).not.toHaveBeenCalled(); expect(f.effects.upload).not.toHaveBeenCalled();
    expect(f.effects.update).not.toHaveBeenCalled(); expect(f.effects.insert).not.toHaveBeenCalled();
  });
  it("preserves an authorized administrator's matching service order and manual workflow", async () => {
    const f = db({ admin: true }); const actor = { userId: user, service: false };
    await expect(documents.requireSelfExaminationOrder(f.client, actor, org, orderId)).resolves.toMatchObject({ id: orderId });
    await expect(documents.requireSelfExaminationOrder(f.client, actor, org, null)).resolves.toBeNull();
  });
  it("does not treat a service credential as a logged-in administrator", async () => {
    const f = db({ admin: true });
    await expect(documents.requireSelfExaminationOrder(f.client, { userId: null, service: true }, org, orderId)).rejects.toMatchObject({ status: 403 });
  });
  it.each(["html-to-pdf", "generate-self-examination-report"])("rejects GET before any work: %s", async name => {
    const f = db({ writer: true, admin: true });
    expect((await actualHandler(name, f)(request(target, "valid", "GET"))).status).toBe(405);
    expect(f.client.from).not.toHaveBeenCalled(); expect(f.effects.fetch).not.toHaveBeenCalled();
  });
});
