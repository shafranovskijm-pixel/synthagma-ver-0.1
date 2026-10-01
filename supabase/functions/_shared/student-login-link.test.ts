import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStudentLoginLinkHandler } from "./student-login-link";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const actor = id(1), learner = id(2), org = id(3), token = id(4);
let role: string, queryFailure: string | null, profile: any, staff: any, tokens: any[], writes: any[], calls: any[];
const authenticate = vi.fn();
const db = {
  rpc: async (name: string, args: any) => {
    calls.push({ name, args });
    if (queryFailure === name) return { data: null, error: new Error("private database detail") };
    return { data: name === "has_role" ? role === "admin" : name === "is_org_owner" ? role === "owner"
      : name === "has_org_staff_permission" ? role === "staff" : name === "is_student_profile" ? role !== "target-not-student" : false, error: null };
  },
  from: (table: string) => {
    const filters: Record<string, any> = {};
    let values: any, operation = "select", max = Infinity;
    const matches = (row: any) => Object.entries(filters).every(([k, v]) => row[k] === v);
    const run = async () => {
      calls.push({ table, operation, filters: { ...filters } });
      if (queryFailure === table || queryFailure === `${table}.${operation}`) return { data: null, error: new Error("private database detail") };
      if (table === "profiles") return { data: profile && matches(profile) ? profile : null, error: null };
      if (table === "org_staff") return { data: staff, error: null };
      if (operation === "insert") {
        writes.push({ table, operation, values });
        const created = { ...values, token, revoked_at: null, id: id(5) };
        tokens.push(created);
        return { data: created, error: null };
      }
      const found = tokens.filter(matches).slice(0, max);
      if (operation === "update") {
        writes.push({ table, operation, values, filters });
        found.forEach(row => Object.assign(row, values));
        return { data: found.map(row => ({ id: row.id })), error: null };
      }
      return { data: found[0] ?? null, error: null };
    };
    const builder: any = {
      select: () => builder,
      eq: (key: string, value: any) => { filters[key] = value; return builder; },
      is: (key: string, value: any) => { filters[key] = value; return builder; },
      order: () => builder, limit: (n: number) => { max = n; return builder; },
      maybeSingle: run, single: run,
      insert: (input: any) => { values = input; operation = "insert"; return builder; },
      update: (input: any) => { values = input; operation = "update"; return builder; },
      then: (resolve: any, reject: any) => run().then(resolve, reject),
    };
    return builder;
  },
};
const invoke = async (action = "create", extra = {}, auth = "Bearer synthetic") => {
  const handler = createStudentLoginLinkHandler({ authenticate, db, now: () => new Date("2026-10-01T00:00:00Z") });
  const response = await handler(new Request("https://example.invalid/student-login-link", {
    method: "POST", headers: auth ? { authorization: auth } : {},
    body: JSON.stringify({ action, user_id: learner, organization_id: org, token, ...extra }),
  }));
  return { status: response.status, body: await response.json(), headers: response.headers };
};

describe("student-login-link authorization and actions", () => {
  beforeEach(() => {
    role = "owner"; queryFailure = null; profile = { user_id: learner, organization_id: org, archived_at: null };
    staff = null; tokens = []; writes = []; calls = [];
    authenticate.mockReset().mockResolvedValue({ userId: actor, error: null });
  });
  it.each(["admin", "owner", "staff"])("permits %s and attributes creation to authenticated actor", async allowedRole => {
    role = allowedRole;
    if (role === "staff") staff = { expires_at: "2026-10-02T00:00:00Z" };
    const result = await invoke("create", { created_by: id(99), actor_id: id(99) });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ token, user_id: learner, organization_id: org });
    expect(writes).toEqual([{ table: "student_login_tokens", operation: "insert", values: { user_id: learner, organization_id: org, created_by: actor } }]);
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["get", "create", "revoke"])("denies read-only staff for %s", async action => {
    role = "readonly"; staff = { expires_at: null };
    expect((await invoke(action)).status).toBe(403);
    expect(writes).toEqual([]);
    expect(calls.some(call => call.table === "student_login_tokens")).toBe(false);
  });
  it.each(["2026-09-30T23:59:59Z", "2026-10-01T00:00:00Z", "invalid"])("denies expired or invalid staff expiry %s", async expires_at => {
    role = "staff"; staff = { expires_at };
    expect((await invoke()).status).toBe(403);
    expect(writes).toEqual([]);
  });
  it("denies unauthenticated or invalid authentication before database access", async () => {
    expect((await invoke("create", {}, "")).status).toBe(401);
    authenticate.mockResolvedValue({ userId: actor, error: new Error("expired") });
    expect((await invoke()).status).toBe(401);
    expect(calls).toEqual([]);
  });
  it.each(["get", "create", "revoke"])("binds %s to the exact organization and learner", async action => {
    expect((await invoke(action, { organization_id: id(99) })).status).toBe(404);
    expect((await invoke(action, { user_id: id(99) })).status).toBe(404);
    expect(writes).toEqual([]);
  });
  it("rejects an archived or privileged target instead of generating a credential", async () => {
    profile.archived_at = "2026-09-30";
    expect((await invoke()).status).toBe(404);
    profile.archived_at = null; role = "target-not-student"; staff = { expires_at: null };
    // Explicitly authorize the actor as owner while the target fails student classification.
    const realRpc = db.rpc;
    const mock = vi.spyOn(db, "rpc").mockImplementation(async (name, args) => name === "is_org_owner" ? { data: true, error: null } : realRpc(name, args));
    expect((await invoke()).status).toBe(403);
    mock.mockRestore();
    expect(writes).toEqual([]);
  });
  it.each(["has_role", "is_org_owner", "profiles", "is_student_profile", "student_login_tokens", "student_login_tokens.insert"])("fails closed on %s failure", async failed => {
    queryFailure = failed;
    const result = await invoke();
    expect(result.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain("private database detail");
    expect(writes).toEqual([]);
  });
  it.each(["org_staff", "has_org_staff_permission"])("fails closed on staff authorization query %s", async failed => {
    role = "staff"; staff = { expires_at: null }; queryFailure = failed;
    expect((await invoke()).status).toBe(503);
    expect(writes).toEqual([]);
  });
  it("get never creates a token; sequential creation and retry reuse an existing token", async () => {
    expect((await invoke("get")).body.token).toBeNull();
    expect(writes).toEqual([]);
    expect((await invoke()).body.token).toBe(token);
    expect((await invoke()).body.token).toBe(token);
    expect(writes).toHaveLength(1);
  });
  it("revokes only the requested learner token and handles a repeat idempotently", async () => {
    tokens = [{ id: id(5), token, user_id: learner, organization_id: org, revoked_at: null },
      { id: id(6), token: id(7), user_id: id(8), organization_id: org, revoked_at: null }];
    expect((await invoke("revoke", { token: id(7) })).status).toBe(404);
    expect((await invoke("revoke")).body.revoked).toBe(true);
    expect((await invoke("revoke")).body.revoked).toBe(true);
    expect(tokens[1].revoked_at).toBeNull();
    expect(writes).toHaveLength(1);
  });
  it("does not claim revocation when persistence fails", async () => {
    await invoke(); writes = []; queryFailure = "student_login_tokens.update";
    expect((await invoke("revoke")).status).toBe(503);
    expect(tokens[0].revoked_at).toBeNull();
  });
  it.each([{ action: "send" }, { user_id: "not-a-uuid" }, { action: "revoke", token: "bad" }])("rejects unsupported input %j", async body => {
    expect((await invoke("create", body)).status).toBe(400);
    expect(calls).toEqual([]);
  });
});
