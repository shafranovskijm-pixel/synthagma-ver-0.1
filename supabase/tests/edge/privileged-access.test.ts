// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as access from "../../functions/_shared/privileged-access";
import * as skillspaceSource from "../../functions/_shared/skillspace-source";
import { mergeCookiesFromResponse, getCookieHeader, getAuthToken } from "../../functions/_shared/skillspace-auth";
import { signatureSha256 } from "../../functions/_shared/signature-finalizer";

const actorId = "00000000-0000-4000-8000-000000000001";
const orgId = "00000000-0000-4000-8000-000000000002";
const objectId = "00000000-0000-4000-8000-000000000003";
const otherId = "00000000-0000-4000-8000-000000000004";
const serviceKey = "test-server-only-key";
const actor = { userId: actorId, service: false };
type Options = {
  invalidToken?: boolean; revoked?: boolean; admin?: boolean; platformSales?: boolean;
  owner?: boolean; staff?: { expires_at: string | null }; permission?: boolean;
  errorTable?: string; deleted?: boolean; recipient?: string; courseOrg?: string;
  companyOrg?: string | null; importJobs?: Array<Record<string, unknown>>;
};

function database(options: Options = {}) {
  const effects = { upload: vi.fn(), update: vi.fn(), insert: vi.fn(), fetch: vi.fn() };
  const rows: Record<string, unknown> = {
    account_deletion_revocations: options.revoked ? { user_id: actorId } : null,
    user_roles: options.admin ? { role: "admin" } : null,
    document_signatures: { id: objectId, organization_id: orgId, recipient_user_id: options.recipient ?? otherId, deleted_at: options.deleted ? "2026-10-01" : null },
    org_staff: options.staff ?? null,
    courses: { id: objectId, organization_id: options.courseOrg ?? orgId },
    sales_companies_db: { id: objectId, organization_id: options.companyOrg ?? null },
    skillspace_import_jobs: options.importJobs ?? [],
  };
  const db = {
    auth: { getUser: vi.fn(async () => ({ data: { user: options.invalidToken ? null : { id: actorId } }, error: null })) },
    from: vi.fn((table: string) => {
      if (!(table in rows)) throw new Error(`Unauthorized business table read: ${table}`);
      const q = {
        select: vi.fn(() => q), eq: vi.fn(() => q),
        order: vi.fn(() => q), limit: vi.fn(async () => ({data: rows[table], error: null})),
        maybeSingle: vi.fn(async () => ({ data: rows[table], error: table === options.errorTable ? new Error("DB offline") : null })),
        update: effects.update, insert: effects.insert,
      };
      return q;
    }),
    rpc: vi.fn(async (name: string) => ({ data: name === "is_platform_sales_manager" ? !!options.platformSales : name === "is_org_owner" ? !!options.owner : name === "has_org_staff_permission" ? !!options.permission : false, error: null })),
    storage: { from: vi.fn(() => ({ upload: effects.upload })) },
  };
  return { db, effects };
}

function request(token: string | null = "verified-user-token", method = "POST") {
  return new Request("https://example.invalid/function", {
    method, headers: token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {},
    ...(method === "POST" ? { body: JSON.stringify({ signatureId: objectId, courseId: objectId, organizationId: orgId, companyDbId: objectId, urls: ["https://example.invalid/course"] }) } : {}),
  });
}

function actualHandler(name: string, db: ReturnType<typeof database>["db"], fetch: ReturnType<typeof vi.fn>) {
  const source = readFileSync(resolve(process.cwd(), `supabase/functions/${name}/index.ts`), "utf8");
  const parsed = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const noImports = [...parsed.statements.filter(ts.isImportDeclaration)].reverse().reduce(
    (text, statement) => text.slice(0, statement.getFullStart()) + text.slice(statement.end), source,
  );
  const executable = ts.transpileModule(noImports, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  let handler: (req: Request) => Promise<Response>;
  const serve = (fn: typeof handler) => { handler = fn; };
  const deps = { ...access, ...skillspaceSource, mergeCookiesFromResponse, getCookieHeader, getAuthToken, signatureSha256,
    createClient: () => db, serve, fetch, console: { log() {}, error() {} }, Deno: { serve, env: { get: (key: string) => key === "SUPABASE_SERVICE_ROLE_KEY" ? serviceKey : "https://example.invalid" } } };
  new Function(...Object.keys(deps), executable)(...Object.values(deps));
  return handler!;
}

describe("privileged operations fail closed", () => {
  it("requires verified JWT, never treats the publishable key as a user", async () => {
    const { db } = database({ invalidToken: true });
    await expect(access.requireActiveUser(request(null), db)).rejects.toMatchObject({ status: 401 });
    await expect(access.requireActiveUser(request("publishable-key"), db)).rejects.toMatchObject({ status: 401 });
    expect(db.from).not.toHaveBeenCalled();
  });
  it("rejects a revoked user even with an otherwise valid JWT", async () => {
    await expect(access.requireActiveUser(request(), database({ revoked: true }).db)).rejects.toMatchObject({ status: 403 });
  });
  it("fails closed when revocation or permission checks are unavailable", async () => {
    await expect(access.requireActiveUser(request(), database({ errorTable: "account_deletion_revocations" }).db)).rejects.toMatchObject({ status: 503 });
    await expect(access.requirePlatformAdmin(database({ admin: true, errorTable: "user_roles" }).db, actor)).rejects.toMatchObject({ status: 503 });
  });
  it("opts in to the exact internal certificate credential only", async () => {
    const { db } = database({ invalidToken: true });
    await expect(access.requireActiveUser(request(serviceKey), db)).rejects.toMatchObject({ status: 401 });
    await expect(access.requireActiveUser(request(serviceKey), db, serviceKey)).resolves.toEqual({ userId: null, service: true });
    await expect(access.requireActiveUser(request(serviceKey + "x"), db, serviceKey)).rejects.toMatchObject({ status: 401 });
  });
  it("separates platform sales from an organization membership", async () => {
    await expect(access.requirePlatformSales(database({ staff: { expires_at: null } }).db, actor)).rejects.toMatchObject({ status: 403 });
    const { db } = database({ platformSales: true });
    await expect(access.requirePlatformSales(db, actor)).resolves.toBeUndefined();
    expect(db.rpc).toHaveBeenCalledWith("is_platform_sales_manager", { _uid: actorId });
  });
  it("checks the migration course belongs to the requested organization", async () => {
    await expect(access.requireMigrationCourse(database({ admin: true, courseOrg: otherId }).db, actor, objectId, orgId)).rejects.toMatchObject({ status: 403 });
    await expect(access.requireMigrationCourse(database({ admin: true }).db, actor, objectId, orgId)).resolves.toBeUndefined();
  });
});

describe("certificate object authorization", () => {
  it.each([{ recipient: actorId }, { admin: true }, { owner: true }, { staff: { expires_at: null }, permission: true }])("allows authorized participant %j", async options => {
    await expect(access.requireSignatureAccess(database(options).db, actor, objectId)).resolves.toBeUndefined();
  });
  it.each([{}, { staff: { expires_at: null }, permission: false }, { staff: { expires_at: "2026-10-15T00:00:00Z" }, permission: true }])("denies an outsider, missing permission or expired staff %j", async options => {
    await expect(access.requireSignatureAccess(database(options).db, actor, objectId, new Date("2026-10-16T00:00:00Z"))).rejects.toMatchObject({ status: 403 });
  });
  it("does not regenerate a deleted signature even for an administrator", async () => {
    await expect(access.requireSignatureAccess(database({ admin: true, deleted: true }).db, actor, objectId)).rejects.toMatchObject({ status: 404 });
  });
});

describe("privileged operation scope", () => {
  it("does not convert an organization company into a platform lead", async () => {
    const { db, effects } = database({ platformSales: true, companyOrg: orgId });
    const response = await actualHandler("convert-company-to-lead", db, effects.fetch)(request());
    expect(response.status).toBe(403);
    expect(effects.insert).not.toHaveBeenCalled();
    expect(effects.update).not.toHaveBeenCalled();
  });
  it.each([
    { options: { admin: true, importJobs: [{id:objectId,created_by:actorId,authorization_verified_at:null}] }, status:409 },
    { options: { revoked:true, importJobs: [{id:objectId,created_by:actorId,authorization_verified_at:"2026-10-16"}] }, status:403 },
    { options: { importJobs: [{id:objectId,created_by:actorId,authorization_verified_at:"2026-10-16"}] }, status:403 },
  ])("background import rechecks creator and proof before reading credentials: %j", async ({options,status}) => {
    const {db,effects} = database(options);
    const req = new Request("https://example.invalid/function", {method:"POST",headers:{Authorization:`Bearer ${serviceKey}`},body:JSON.stringify({processBatchId:objectId})});
    expect((await actualHandler("batch-skillspace-import",db,effects.fetch)(req)).status).toBe(status);
    for (const effect of Object.values(effects)) expect(effect).not.toHaveBeenCalled();
    const jobsQueries = db.from.mock.results.filter((_,i)=>db.from.mock.calls[i][0]==="skillspace_import_jobs");
    for (const query of jobsQueries) expect(query.value.select).not.toHaveBeenCalledWith("login, password");
  });
  it("does not allow the recursive mode to bypass user authentication", async () => {
    const {db,effects}=database({invalidToken:true});
    const req=new Request("https://example.invalid/function",{method:"POST",headers:{Authorization:"Bearer public-key"},body:JSON.stringify({processBatchId:objectId})});
    expect((await actualHandler("batch-skillspace-import",db,effects.fetch)(req)).status).toBe(401);
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe.each(["generate-signature-certificate", "send-signing-email", "migrate-course-media", "reimport-skillspace-batch", "convert-company-to-lead", "parse-skillspace-course", "batch-skillspace-import"])("actual %s handler", name => {
  it.each([
    { token: null, options: {}, status: 401 },
    { token: "publishable-key", options: { invalidToken: true }, status: 401 },
    { token: "valid-user", options: { revoked: true }, status: 403 },
    { token: "valid-user", options: {}, status: 403 },
    { token: "valid-user", options: { errorTable: "account_deletion_revocations" }, status: 503 },
  ])("rejects unauthorized request before business reads or side effects: %j", async ({ token, options, status }) => {
    const { db, effects } = database(options);
    const response = await actualHandler(name, db, effects.fetch)(request(token));
    expect(response.status).toBe(status);
    for (const effect of Object.values(effects)) expect(effect).not.toHaveBeenCalled();
    expect(db.from.mock.calls.every(([table]) => ["account_deletion_revocations", "user_roles", "org_staff", "document_signatures"].includes(table))).toBe(true);
  });
  it("answers preflight without authenticating or mutating", async () => {
    const { db, effects } = database();
    expect((await actualHandler(name, db, effects.fetch)(request(null, "OPTIONS"))).status).toBe(200);
    expect(db.auth.getUser).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe('actual organization contract sender authorization', () => {
  it.each([
    { token: null, options: {}, status: 401 },
    { token: 'publishable-key', options: { invalidToken: true }, status: 401 },
    { token: 'valid-user', options: { revoked: true }, status: 403 },
    { token: 'valid-user', options: {}, status: 403 },
    { token: 'valid-user', options: { errorTable: 'account_deletion_revocations' }, status: 503 },
  ])('rejects unauthorized signature creation before insert/SMTP: %j', async ({token,options,status}) => {
    const {db,effects}=database(options);
    const req=new Request('https://example.invalid/function', {method:'POST',
      headers: token ? {Authorization:`Bearer ${token}`, 'Content-Type':'application/json'} : {'Content-Type':'application/json'},
      body:JSON.stringify({organization_id:orgId,document_title:'Synthetic contract',document_html:'<p>Synthetic</p>',recipient_email:'synthetic@example.invalid',recipient_name:'Synthetic Recipient'}),
    });
    const response=await actualHandler('org-create-contract-signature',db,effects.fetch)(req);
    expect(response.status).toBe(status);
    for(const effect of Object.values(effects))expect(effect).not.toHaveBeenCalled();
    expect(response.headers.get('X-Sintagma-Function-Revision')).toBe('uc-permissions-20261018-v2');
  });
});

describe("actual SkillSpace parser source and auth redirects", () => {
  const sourceRequest = (url = "https://school.skillspace.ru/course/123/lesson/456?view=student#step") => new Request("https://example.invalid/function", {
    method: "POST", headers: { Authorization: "Bearer valid-admin" },
    body: JSON.stringify({ url, login: "fixture@example.invalid", password: "synthetic-password", organizationId: orgId }),
  });
  it.each([
    "https://evil.test/#https://school.skillspace.ru/course/123",
    "https://user@school.skillspace.ru/course/123",
    "https://school.skillspace.ru@evil.test/course/123",
    "http://school.skillspace.ru/course/123",
    "https://school.skillspace.ru:8443/course/123",
  ])("rejects unsafe source before sending credentials: %s", async url => {
    const { db, effects } = database({ admin: true });
    expect((await actualHandler("parse-skillspace-course", db, effects.fetch)(sourceRequest(url))).status).toBe(400);
    expect(effects.fetch).not.toHaveBeenCalled();
    expect(effects.insert).not.toHaveBeenCalled();
  });
  it("derives the auth destination from a valid parsed school origin", async () => {
    const { db, effects } = database({ admin: true });
    effects.fetch.mockResolvedValue(new Response("", { status: 401 }));
    expect((await actualHandler("parse-skillspace-course", db, effects.fetch)(sourceRequest())).status).toBe(401);
    expect(effects.fetch).toHaveBeenCalledTimes(1);
    expect(effects.fetch).toHaveBeenCalledWith("https://school.skillspace.ru/api/user/auth", expect.objectContaining({ method: "POST", redirect: "manual" }));
  });
  it.each(["https://evil.test/collect", "//other.skillspace.ru/collect", "http://school.skillspace.ru/collect", "https://user@school.skillspace.ru/collect"])("never forwards auth cookies through an unsafe first redirect %s", async location => {
    const { db, effects } = database({ admin: true });
    effects.fetch.mockResolvedValue(new Response("", { status: 302, headers: { Location: location, "Set-Cookie": "Auth-Token=synthetic-session; Secure" } }));
    expect((await actualHandler("parse-skillspace-course", db, effects.fetch)(sourceRequest())).status).toBe(502);
    expect(effects.fetch).toHaveBeenCalledTimes(1);
  });
  it("checks the second redirect as well, before sending cookies to its target", async () => {
    const { db, effects } = database({ admin: true });
    effects.fetch.mockResolvedValueOnce(new Response("", { status: 302, headers: { Location: "/session/first", "Set-Cookie": "Auth-Token=synthetic-session; Secure" } }))
      .mockResolvedValueOnce(new Response("", { status: 302, headers: { Location: "https://evil.test/collect" } }));
    expect((await actualHandler("parse-skillspace-course", db, effects.fetch)(sourceRequest())).status).toBe(502);
    expect(effects.fetch).toHaveBeenCalledTimes(2);
    expect(effects.fetch.mock.calls[1]).toEqual(["https://school.skillspace.ru/session/first", { headers: { Cookie: "Auth-Token=synthetic-session" }, redirect: "manual" }]);
  });
  it("retains same-origin absolute and relative authentication redirects", async () => {
    const { db, effects } = database({ admin: true });
    effects.fetch.mockResolvedValueOnce(new Response("", { status: 302, headers: { Location: "https://school.skillspace.ru/session/first", "Set-Cookie": "Session=synthetic-session; Secure" } }))
      .mockResolvedValueOnce(new Response("", { status: 302, headers: { Location: "../done" } }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    // Without an Auth-Token the handler stops before course API calls.
    expect((await actualHandler("parse-skillspace-course", db, effects.fetch)(sourceRequest())).status).toBe(401);
    expect(effects.fetch).toHaveBeenCalledTimes(3);
    expect(effects.fetch.mock.calls[2]).toEqual(["https://school.skillspace.ru/done", { headers: { Cookie: "Session=synthetic-session" }, redirect: "manual" }]);
  });
});
