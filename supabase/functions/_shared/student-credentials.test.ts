import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStudentCredentialsHandler } from "./student-credentials";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const actor = id(1), learner = id(2), org = id(3), otherOrg = id(4);
const now = "2026-10-12T00:00:00Z";
let tables: Record<string, any[]>;
let rpcValues: Record<string, any>;
let failure: string | null;
let noWriteRows: boolean;
let calls: any[], writes: any[];
const authenticate = vi.fn();
const updateAuthUser = vi.fn();
const sendEmail = vi.fn();
const db = {
  rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === failure) return { data: null, error: new Error("private database detail") };
    // Production has ambiguous has_role overloads. This handler must not use them.
    if (name === "has_role") return { data: null, error: { code: "PGRST203" } };
    return { data: rpcValues[name], error: null };
  },
  from: (table: string) => {
    const filters: { op: string; key: string; value: any }[] = [];
    let limit = Infinity, operation = "select", values: any, single = false;
    const run = async () => {
      calls.push({ table, operation, filters: [...filters] });
      if (failure === table || failure === `${table}.${operation}`) return { data: null, error: new Error("private database detail") };
      const matches = (tables[table] || []).filter(row => filters.every(({ op, key, value }) =>
        op === "neq" ? row[key] !== value : op === "in" ? value.includes(row[key]) : row[key] === value)).slice(0, limit);
      if (operation === "update") {
        writes.push({ table, values, filters });
        if (noWriteRows) return { data: [], error: null };
        matches.forEach(row => Object.assign(row, values));
      }
      return single && matches.length > 1 ? { data: null, error: new Error("Multiple rows") }
        : { data: single ? matches[0] ?? null : matches, error: null };
    };
    const query: any = {
      select: () => query,
      limit: (n: number) => { limit = n; return query; },
      maybeSingle: () => { single = true; return run(); },
      update: (v: any) => { values = v; operation = "update"; return query; },
      then: (resolve: any, reject: any) => run().then(resolve, reject),
    };
    for (const op of ["eq", "neq", "in", "is"]) query[op] = (key: string, value: any) => {
      filters.push({ op, key, value }); return query;
    };
    return query;
  },
};
function handler(action: "send" | "update") {
  return createStudentCredentialsHandler(action, { db, authenticate, updateAuthUser, sendEmail, now: () => new Date(now) });
}
async function invoke(action: "send" | "update" = "send", extra: any = {}, authorization = "Bearer synthetic") {
  const response = await handler(action)(new Request("https://example.invalid/credentials", {
    method: "POST", headers: authorization ? { authorization } : {},
    body: JSON.stringify({ user_id: learner, organization_id: org, ...extra }),
  }));
  return { status: response.status, headers: response.headers, body: await response.json() };
}
const assertNoSideEffects = () => {
  expect(updateAuthUser).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
  expect(writes).toEqual([]);
};

beforeEach(() => {
  tables = {
    account_deletion_revocations: [],
    // The employee's legacy student role and null profile must not deny their
    // actual, active membership in this organization.
    profiles: [{ user_id: actor, organization_id: null }, {
      user_id: learner, organization_id: org, archived_at: null,
      email: "learner@example.org", login: "learner_login", full_name: "Иван <Иванов>", generated_password: "ENC:stored",
    }],
    labor_safety_profiles: [],
    user_roles: [{ user_id: actor, role: "student" }, { user_id: learner, role: "student" }],
    org_staff: [{ user_id: actor, organization_id: org, role: "admin", expires_at: null }],
    organizations: [{ id: org, name: "Учебная <организация>" }],
  };
  rpcValues = { is_org_owner: false, has_org_staff_permission: true, is_student_profile: true, decrypt_password: "real<&password" };
  failure = null; noWriteRows = false; calls = []; writes = [];
  authenticate.mockReset().mockResolvedValue({ userId: actor, error: null });
  updateAuthUser.mockReset().mockResolvedValue({ error: null });
  sendEmail.mockReset().mockResolvedValue(undefined);
});

describe("authenticated student credential authorization", () => {
  it.each(["send", "update"] as const)("allows active employee with null profile and global student role: %s", async action => {
    const result = await invoke(action, action === "update" ? { new_password: "updated_password" } : {});
    expect(result.status).toBe(200);
    expect(calls).toContainEqual({ name: "has_org_staff_permission", args: { _user_id: actor, _organization_id: org, _permission: "students.write" } });
    expect(calls.some(call => call.name === "has_role")).toBe(false);
  });
  it.each(["owner", "admin"])("preserves %s authorization", async role => {
    tables.org_staff = [];
    rpcValues.has_org_staff_permission = false;
    if (role === "owner") rpcValues.is_org_owner = true;
    else tables.user_roles.push({ user_id: actor, role: "admin" });
    expect((await invoke()).status).toBe(200);
  });
  it("authenticates before any database query and ignores payload actor", async () => {
    expect((await invoke("send", {}, "")).status).toBe(401);
    authenticate.mockResolvedValue({ userId: null, error: new Error("expired") });
    expect((await invoke("send", { actor_id: id(99) })).status).toBe(401);
    expect(calls).toEqual([]);
    assertNoSideEffects();
  });
  it.each(["send", "update"] as const)("denies read-only, cross-organization and absent memberships for %s", async action => {
    rpcValues.has_org_staff_permission = false;
    expect((await invoke(action, { new_password: "updated_password" })).status).toBe(403);
    rpcValues.has_org_staff_permission = true;
    tables.org_staff[0].organization_id = otherOrg;
    expect((await invoke(action, { new_password: "updated_password" })).status).toBe(403);
    tables.org_staff = [];
    expect((await invoke(action, { new_password: "updated_password" })).status).toBe(403);
    assertNoSideEffects();
  });
  it.each(["2026-10-11T23:59:59Z", now, "invalid"])("denies expired or invalid staff expiry %s", async expiresAt => {
    tables.org_staff[0].expires_at = expiresAt;
    expect((await invoke()).status).toBe(403);
    assertNoSideEffects();
  });
  it("accepts future expiry", async () => {
    tables.org_staff[0].expires_at = "2026-10-12T00:00:01Z";
    expect((await invoke()).status).toBe(200);
  });
  it("binds the target and organization before performing an operation", async () => {
    expect((await invoke("send", { organization_id: otherOrg })).status).toBe(403);
    expect((await invoke("send", { user_id: id(99) })).status).toBe(409);
    assertNoSideEffects();
  });
  it.each(["admin", "organization", "company", "sales_manager"])("protects target with additional role %s", async role => {
    tables.user_roles.push({ user_id: learner, role });
    expect((await invoke("update", { new_password: "updated_password" })).status).toBe(403);
    assertNoSideEffects();
  });
  it.each([org, otherOrg])("protects a globally student account that is active staff in %s", async staffOrg => {
    tables.org_staff.push({ user_id: learner, organization_id: staffOrg, expires_at: null });
    expect((await invoke("update", { new_password: "updated_password" })).status).toBe(403);
    assertNoSideEffects();
  });
  it("requires both student classification and a positive student role", async () => {
    rpcValues.is_student_profile = false;
    expect((await invoke()).status).toBe(403);
    rpcValues.is_student_profile = true;
    tables.user_roles = tables.user_roles.filter(row => row.user_id !== learner);
    expect((await invoke()).status).toBe(403);
    assertNoSideEffects();
  });
  it.each([actor, learner])("denies account deletion revocation for %s", async revoked => {
    tables.account_deletion_revocations.push({ user_id: revoked });
    expect((await invoke()).status).toBe(403);
    assertNoSideEffects();
  });
  it("rejects archived targets and conflicting organizations", async () => {
    tables.profiles[1].archived_at = now;
    expect((await invoke()).status).toBe(403);
    tables.profiles[1].archived_at = null;
    tables.labor_safety_profiles.push({ ...tables.profiles[1], organization_id: otherOrg });
    expect((await invoke()).status).toBe(409);
    assertNoSideEffects();
  });
  it.each(["account_deletion_revocations", "profiles", "labor_safety_profiles", "user_roles", "org_staff", "is_org_owner", "has_org_staff_permission", "is_student_profile"])("fails closed on %s read failure", async query => {
    failure = query;
    const result = await invoke("update", { new_password: "updated_password" });
    expect(result.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain("private database detail");
    assertNoSideEffects();
  });
  it("identifies deployed revision without authenticated or write requests", async () => {
    for (const method of ["GET", "OPTIONS", "POST"]) {
      const response = await handler("send")(new Request("https://example.invalid/credentials", { method }));
      expect(response.headers.get("x-sintagma-function-revision")).toBe("s047-credentials-20261012");
      expect(response.status).toBe(method === "GET" ? 405 : method === "POST" ? 401 : 200);
    }
    expect(calls).toEqual([]);
  });
});

describe("server-authoritative credentials email", () => {
  it("sends stored destination and decrypted credentials, escapes HTML, and ignores forged payload", async () => {
    const result = await invoke("send", { email: "attacker@example.net", password: "forged_password", login: "forged_login", studentName: "forged_name", organizationName: "forged_org", loginUrl: "https://attacker.invalid" });
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    const message = sendEmail.mock.calls[0][0];
    expect(message.to).toBe("learner@example.org");
    expect(message.html).toContain("real&lt;&amp;password");
    expect(message.html).toContain("Иван &lt;Иванов&gt;");
    expect(message.html).toContain("Учебная &lt;организация&gt;");
    expect(message.html).toContain("https://xn--80aaiswd0ak.xn--p1ai/login");
    expect(message.html).not.toMatch(/forged|attacker|ENC:/);
    expect(JSON.stringify(result.body)).not.toMatch(/password|learner@example/);
  });
  it("supports ID-only labor-safety student with a null general profile organization", async () => {
    tables.labor_safety_profiles.push({ ...tables.profiles[1], email: "labor@example.org", login: "labor_login" });
    tables.profiles[1].organization_id = null;
    const result = await invoke("send", { organization_id: undefined });
    expect(result.status).toBe(200);
    expect(sendEmail.mock.calls[0][0].to).toBe("labor@example.org");
    expect(sendEmail.mock.calls[0][0].html).toContain("labor_login");
  });
  it("supports existing legacy send clients only via an exact stored login/email lookup", async () => {
    const result = await invoke("send", { user_id: undefined, login: "learner_login", email: "learner@example.org", password: "forged" });
    expect(result.status).toBe(200);
    expect(sendEmail.mock.calls[0][0].html).not.toContain("forged");
  });
  it("rejects legacy lookup ambiguity or changed destination", async () => {
    tables.profiles.push({ ...tables.profiles[1], user_id: id(99) });
    expect((await invoke("send", { user_id: undefined, login: "learner_login", email: "learner@example.org" })).status).toBe(404);
    expect((await invoke("send", { user_id: undefined, login: "learner_login", email: "attacker@example.net" })).status).toBe(404);
    assertNoSideEffects();
  });
  it.each(["", "not-an-email", "login@student.local", "name@demo.invalid"])("refuses unusable stored email %s", async email => {
    tables.profiles[1].email = email;
    expect((await invoke()).status).toBe(400);
    assertNoSideEffects();
  });
  it("does not send ciphertext or claim success when decrypt or delivery fails", async () => {
    failure = "decrypt_password";
    expect((await invoke()).status).toBe(503);
    expect(sendEmail).not.toHaveBeenCalled();
    failure = null; rpcValues.decrypt_password = null;
    expect((await invoke()).status).toBe(409);
    expect(sendEmail).not.toHaveBeenCalled();
    rpcValues.decrypt_password = "valid_password";
    sendEmail.mockRejectedValue(new Error("secret transport detail"));
    const result = await invoke();
    expect(result.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain("secret transport detail");
  });
});

describe("credential updates", () => {
  it("updates authenticated account and only the verified learner profile", async () => {
    const result = await invoke("update", { new_login: "new_login", new_password: "new_password", actor_id: id(99) });
    expect(result.status).toBe(200);
    expect(updateAuthUser).toHaveBeenCalledWith(learner, { email: "new_login@student.local", email_confirm: true, password: "new_password" });
    expect(writes).toEqual([{ table: "profiles", values: { login: "new_login", generated_password: "new_password" }, filters: [
      { op: "eq", key: "user_id", value: learner }, { op: "eq", key: "organization_id", value: org },
    ] }]);
    expect(result.body).toMatchObject({ success: true, user_id: learner, login: "new_login", password: "new_password" });
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("supports login-only edits without exposing or rewriting stored password", async () => {
    const result = await invoke("update", { new_login: "new_login" });
    expect(result.status).toBe(200);
    expect(result.body).not.toHaveProperty("password");
    expect(writes[0].values).toEqual({ login: "new_login" });
    expect(updateAuthUser).toHaveBeenCalledWith(learner, { email: "new_login@student.local", email_confirm: true });
  });
  it("updates labor and null-org general profile together for the same account", async () => {
    tables.labor_safety_profiles.push({ ...tables.profiles[1] });
    tables.profiles[1].organization_id = null;
    expect((await invoke("update", { new_password: "new_password" })).status).toBe(200);
    expect(writes.map(w => w.table)).toEqual(["profiles", "labor_safety_profiles"]);
    expect(writes[0].filters).toContainEqual({ op: "is", key: "organization_id", value: null });
    expect(writes[1].filters).toContainEqual({ op: "eq", key: "organization_id", value: org });
  });
  it.each(["profiles", "labor_safety_profiles"])("rejects occupied login in %s before auth mutation", async table => {
    tables[table].push({ user_id: id(99), organization_id: otherOrg, login: "taken" });
    expect((await invoke("update", { new_login: "taken" })).status).toBe(409);
    assertNoSideEffects();
  });
  it.each([{}, { new_login: "bad login" }, { new_password: "short" }])("validates new credentials before mutation: %j", async fields => {
    expect((await invoke("update", fields)).status).toBe(400);
    assertNoSideEffects();
  });
  it("does not persist a profile or claim success after auth failure", async () => {
    updateAuthUser.mockResolvedValue({ error: new Error("auth collision detail") });
    const result = await invoke("update", { new_login: "new_login" });
    expect(result.status).toBe(409);
    expect(result.body).not.toHaveProperty("partial_success");
    expect(writes).toEqual([]);
    expect(JSON.stringify(result.body)).not.toContain("auth collision detail");
  });
  it.each(["failed", "zero-rows"])("reports partial success if auth changed but profile update is %s", async mode => {
    if (mode === "failed") failure = "profiles.update";
    else noWriteRows = true;
    const result = await invoke("update", { new_password: "new_password" });
    expect(updateAuthUser).toHaveBeenCalledOnce();
    expect(result.status).toBe(409);
    expect(result.body.partial_success).toBe(true);
    expect(result.body.error).toContain("Вход в аккаунт обновлён");
    expect(result.body).not.toHaveProperty("success");
  });
});
