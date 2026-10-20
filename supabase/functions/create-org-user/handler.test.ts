// @vitest-environment node
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createOrgUserHandler } from "../_shared/create-org-user.ts";

const actor = "00000000-0000-4000-8000-000000000001";
const created = "00000000-0000-4000-8000-000000000002";
const existing = "00000000-0000-4000-8000-000000000003";
const organization = "00000000-0000-4000-8000-000000000004";
let rows: Record<string, any[]>;
let failRead: string | undefined;
let failDelete: string | undefined;
let db: any;
let report: Mock<(userId: string, stage: string) => void>;
let deleted: Array<[string, string]>;

beforeEach(() => {
  rows = {
    account_deletion_revocations: [], organizations: [{ id: organization }],
    profiles: [{ user_id: existing, organization_id: organization, full_name: "Existing" }],
    user_roles: [{ user_id: actor, role: "admin" }, { user_id: existing, role: "organization" }],
  };
  failRead = undefined; failDelete = undefined; deleted = []; report = vi.fn();
  db = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: actor } }, error: null })),
      admin: {
        createUser: vi.fn(async () => {
          // Reproduce the signup trigger: both rows already exist before RPC.
          rows.profiles.push({ user_id: created, organization_id: null });
          rows.user_roles.push({ user_id: created, role: "student" });
          return { data: { user: { id: created } }, error: null };
        }),
        deleteUser: vi.fn(async () => ({ error: null })),
      },
    },
    from: vi.fn((table: string) => {
      const filters: Array<[string, unknown]> = [];
      let remove = false;
      const matches = (row: any) => filters.every(([key, value]) => row[key] === value);
      const execute = () => {
        if (remove) {
          const id = filters.find(([key]) => key === "user_id")?.[1] as string;
          deleted.push([table, id]);
          if (failDelete === table) return { data: null, error: new Error("cleanup failed") };
          rows[table] = rows[table].filter(row => !matches(row));
          return { data: null, error: null };
        }
        return { data: rows[table].find(matches) ?? null, error: failRead === table ? new Error("db unavailable") : null };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        maybeSingle: async () => execute(),
        delete: () => { remove = true; return query; },
        then: (resolve: any, reject: any) => Promise.resolve(execute()).then(resolve, reject),
      };
      return query;
    }),
    rpc: vi.fn(async () => ({ data: { userId: created, organizationId: organization, role: "organization" }, error: null })),
  };
});

const body = { email: "new@example.test", password: "test-password", fullName: " Новый администратор ", organizationId: organization };
async function invoke(input: unknown = body, authorization: string | null = "Bearer valid") {
  const response = await createOrgUserHandler({ db, reportCleanupFailure: report })(new Request("https://local/create-org-user", {
    method: "POST", headers: authorization ? { authorization, "Content-Type": "application/json" } : {}, body: JSON.stringify(input),
  }));
  return { status: response.status, body: await response.json() };
}

describe("create-org-user confirmed provisioning", () => {
  it("returns success only after the atomic RPC confirms the created user's role and organization", async () => {
    expect(await invoke()).toEqual({ status: 200, body: { success: true, userId: created } });
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("finalize_created_org_user", {
      p_user_id: created, p_organization_id: organization, p_full_name: "Новый администратор",
    });
    expect(db.auth.admin.createUser).toHaveBeenCalledExactlyOnceWith({ email: body.email, password: body.password, email_confirm: true });
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it.each(["anonymous", "invalid", "student", "revoked", "role-error", "revocation-error"])("denies %s before creating anything", async condition => {
    if (condition === "invalid") db.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid token") });
    if (condition === "student") rows.user_roles[0].role = "student";
    if (condition === "revoked") rows.account_deletion_revocations.push({ user_id: actor });
    if (condition === "role-error") failRead = "user_roles";
    if (condition === "revocation-error") failRead = "account_deletion_revocations";
    const result = await invoke(body, condition === "anonymous" ? null : "Bearer valid");
    expect(result.status).toBe(condition === "anonymous" || condition === "invalid" ? 401 : condition.endsWith("error") ? 503 : 403);
    expect(db.auth.admin.createUser).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it.each(["missing", "read-error"])("does not create an Auth account when the organization is %s", async condition => {
    if (condition === "missing") rows.organizations = [];
    else failRead = "organizations";
    expect((await invoke()).status).toBe(condition === "missing" ? 404 : 503);
    expect(db.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("never deletes an existing user when Auth refuses a duplicate email, even if the error contains an id", async () => {
    db.auth.admin.createUser.mockResolvedValue({ data: { user: { id: existing } }, error: new Error("already exists") });
    expect((await invoke()).status).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(rows.profiles).toHaveLength(1);
  });

  it.each(["rpc-error", "rpc-throws", "no-result", "wrong-org", "wrong-role", "wrong-user"])("cleans only the new account after %s and cannot return success", async condition => {
    if (condition === "rpc-throws") db.rpc.mockRejectedValue(new Error("timeout"));
    else db.rpc.mockResolvedValue({
      data: condition === "no-result" ? null : { userId: condition === "wrong-user" ? existing : created,
        organizationId: condition === "wrong-org" ? existing : organization, role: condition === "wrong-role" ? "student" : "organization" },
      error: condition === "rpc-error" ? new Error("failed transaction") : null,
    });
    const result = await invoke();
    expect(result.status).toBeGreaterThanOrEqual(500);
    expect(result.body.success).not.toBe(true);
    expect(deleted).toEqual([["user_roles", created], ["profiles", created]]);
    expect(db.auth.admin.deleteUser).toHaveBeenCalledExactlyOnceWith(created);
    expect(rows.profiles).toEqual([{ user_id: existing, organization_id: organization, full_name: "Existing" }]);
    expect(rows.user_roles).toContainEqual({ user_id: existing, role: "organization" });
  });

  it("still attempts Auth cleanup when a profile deletion fails, and reports incomplete cleanup", async () => {
    db.rpc.mockResolvedValue({ data: null, error: new Error("failure") });
    failDelete = "profiles";
    const result = await invoke();
    expect(result.status).toBe(503);
    expect(result.body.error).toContain("очистка");
    expect(db.auth.admin.deleteUser).toHaveBeenCalledExactlyOnceWith(created);
    expect(report).toHaveBeenCalledExactlyOnceWith(created, "profile");
  });

  it("reports an Auth cleanup failure without exposing provider errors or credentials", async () => {
    db.rpc.mockResolvedValue({ data: null, error: new Error("failure") });
    db.auth.admin.deleteUser.mockResolvedValue({ error: new Error("secret provider details") });
    const result = await invoke();
    expect(result.status).toBe(503);
    expect(result.body.error).toContain("очистка");
    expect(JSON.stringify(result.body)).not.toContain("secret");
    expect(report).toHaveBeenCalledExactlyOnceWith(created, "auth");
  });

  it.each([{}, { ...body, organizationId: "invalid" }, { ...body, email: "invalid" }, { ...body, password: "" }])("validates input before Auth creation", async input => {
    expect((await invoke(input)).status).toBe(400);
    expect(db.auth.admin.createUser).not.toHaveBeenCalled();
  });
});
