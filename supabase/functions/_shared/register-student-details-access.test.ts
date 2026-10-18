// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { isEnrollmentAccessExpired } from "./enrollment-access";
import { hasStudentRegistrationDetails, normalizeStudentRegistrationDetails, resolveRegistrationProfile } from "./student-registration-details";
import { persistStudentJobPosition } from "./student-job-position";

const ids = { actor: "a1000000-0000-4000-8000-000000000001", org: "a1000000-0000-4000-8000-000000000002",
  student: "a1000000-0000-4000-8000-000000000003", group: "a1000000-0000-4000-8000-000000000004" };
type ResponseData = { data: unknown; error: unknown };
interface Options {
  prepare?: unknown; prepareError?: boolean; prepareThrows?: boolean; detailsError?: boolean;
  role?: string; staff?: boolean; staffExpires?: string; existing?: boolean;
}

// Execute the actual served function against synthetic SDK doubles. The caller
// and service clients are deliberately separate so a service preflight cannot pass.
function fixture(options: Options = {}) {
  const events: string[] = [];
  const role = options.role ?? "admin";
  const profiles: any[] = [{ user_id: ids.actor, organization_id: ids.org }, ...(options.existing
    ? [{ user_id: ids.student, organization_id: ids.org, login: "qa_student", email: null, archived_at: null, blocked_at: null, full_name: "Synthetic Student" }] : [])];
  const callerRpc = vi.fn(async (name: string, _args: unknown): Promise<ResponseData> => {
    events.push(`caller.rpc:${name}`);
    if (name !== "can_prepare_student_registration_details") throw new Error(`Unexpected caller RPC ${name}`);
    if (options.prepareThrows) throw new Error("Synthetic private permission error");
    return { data: Object.hasOwn(options, "prepare") ? options.prepare : true,
      error: options.prepareError ? { message: "Synthetic private permission error" } : null };
  });
  const adminRpc = vi.fn(async (name: string, args: any) => {
    events.push(`service.rpc:${name}`);
    if (name === "is_org_owner") return { data: role === "organization", error: null };
    if (name === "has_org_staff_permission") return { data: !!options.staff, error: null };
    if (name === "is_student_profile") return { data: args._target_user_id === ids.student, error: null };
    if (name === "get_organization_student_capacity") return { data: { can_add: true, is_unlimited: true }, error: null };
    if (name === "create_student_profile_with_capacity") {
      if (!options.existing) profiles.push({ user_id: ids.student, organization_id: ids.org, full_name: args.p_full_name, login: args.p_login, job_position: null, archived_at: null });
      return { data: { success: true, is_existing: !!options.existing }, error: null };
    }
    if (name === "save_student_registration_details") return options.detailsError
      ? { data: null, error: { message: "Synthetic late authority revocation" } }
      : { data: { success: true, user_id: args.p_user_id, organization_id: args.p_organization_id }, error: null };
    throw new Error(`Unexpected service RPC ${name}`);
  });
  const createUser = vi.fn(async () => { events.push("auth.create"); return { data: { user: { id: ids.student } }, error: null }; });
  const profileUpdate = vi.fn();
  const admin = {
    rpc: adminRpc,
    auth: { admin: { createUser, getUserById: async () => ({ data: { user: { id: ids.student } }, error: null }) } },
    from(table: string) {
      let update: any = null;
      let rows: any[] = table === "profiles" ? profiles : table === "user_roles" ? [{ user_id: ids.actor, role }]
        : table === "org_staff" ? (options.staff ? [{ user_id: ids.actor, organization_id: ids.org, expires_at: options.staffExpires ?? null }] : [])
        : table === "registration_links" ? [{ token: "synthetic-token", organization_id: ids.org, student_group_id: ids.group, used_count: 0 }]
        : [];
      const response = () => {
        if (update) { if (table === "profiles") profileUpdate(update); rows.forEach(row => Object.assign(row, update)); }
        return { data: rows, error: null };
      };
      const chain: any = {
        select: () => chain,
        eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return chain; },
        is: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return chain; },
        limit: (count: number) => Promise.resolve({ data: rows.slice(0, count), error: null }),
        maybeSingle: async () => ({ ...response(), data: response().data[0] ?? null }),
        update: (values: unknown) => { events.push(`update:${table}`); update = values; return chain; },
        upsert: () => { events.push(`upsert:${table}`); return chain; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(response()).then(resolve),
      };
      return chain;
    },
  };
  const caller = { rpc: callerRpc, auth: { getUser: async () => ({ data: { user: { id: ids.actor } }, error: null }) } };
  const createClient = vi.fn((_url: string, key: string, init: any) => {
    if (key === "service-key") return admin;
    expect(key).toBe("anon-key"); expect(init.global.headers.Authorization).toBe("Bearer synthetic-caller");
    return caller;
  });
  let handler!: (request: Request) => Promise<Response>;
  const source = readFileSync("supabase/functions/register-student/index.ts", "utf8").replace(/^import .*;\r?\n/gm, "");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("serve", "createClient", "Deno", "isEnrollmentAccessExpired", "hasStudentRegistrationDetails", "normalizeStudentRegistrationDetails", "resolveRegistrationProfile", "persistStudentJobPosition", compiled)(
    (callback: typeof handler) => { handler = callback; }, createClient,
    { env: { get: (key: string) => key === "SUPABASE_SERVICE_ROLE_KEY" ? "service-key" : key === "SUPABASE_ANON_KEY" ? "anon-key" : "https://synthetic.invalid" } },
    isEnrollmentAccessExpired, hasStudentRegistrationDetails, normalizeStudentRegistrationDetails, resolveRegistrationProfile, persistStudentJobPosition,
  );
  return { events, createUser, callerRpc, adminRpc, profileUpdate, profiles,
    call: async (fields: Record<string, unknown> = {}, method = "POST") => {
      const response = await handler(new Request("https://synthetic.invalid/register-student", { method,
        headers: { authorization: "Bearer synthetic-caller", "content-type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify({ organization_id: ids.org, full_name: "Synthetic Student", custom_login: "qa_student", custom_password: "synthetic-password", ...fields }) } : {}) }));
      return { status: response.status, headers: response.headers, body: await response.json() };
    } };
}
function expectNoMutation(f: ReturnType<typeof fixture>) {
  expect(f.createUser).not.toHaveBeenCalled(); expect(f.profileUpdate).not.toHaveBeenCalled();
  expect(f.adminRpc).not.toHaveBeenCalledWith("create_student_profile_with_capacity", expect.anything());
  expect(f.adminRpc).not.toHaveBeenCalledWith("save_student_registration_details", expect.anything());
  expect(f.events.some(event => /^(?:upsert|update):/.test(event))).toBe(false);
}

describe("register-student current detail authority before Auth/profile mutations", () => {
  it.each([false, null, "true", undefined])("fails closed on an unconfirmed canonical response %s before creating Auth/profile", async prepare => {
    const f = fixture({ prepare }); const result = await f.call({ department: "Synthetic department" });
    expect(result.status).toBe(prepare === false ? 403 : 500); expectNoMutation(f);
    expect(f.callerRpc).toHaveBeenCalledTimes(1); expect(f.adminRpc).not.toHaveBeenCalledWith("can_prepare_student_registration_details", expect.anything());
  });
  it.each([{ prepareError: true }, { prepareThrows: true }])("fails closed without returning private permission errors %j", async options => {
    const f = fixture(options); const result = await f.call({ department: "Synthetic department" });
    expect(result.status).toBe(500); expect(result.body.code).toBe("STUDENT_DETAILS_PERMISSION_UNCONFIRMED");
    expect(JSON.stringify(result.body)).not.toContain("Synthetic private"); expectNoMutation(f);
  });
  it("checks department-only students.write without requesting FRDO or identity privileges, then creates the student", async () => {
    const f = fixture({ role: "organization" }); const result = await f.call({ department: " Synthetic department ", snils: " ", birth_date: "", confirm_identity: false, student_group_id: ids.group });
    expect(result.status).toBe(200); expect(result.body).toMatchObject({ success: true, user_id: ids.student, details_confirmed: true });
    expect(f.callerRpc).toHaveBeenCalledExactlyOnceWith("can_prepare_student_registration_details", { p_organization_id: ids.org, p_group_id: ids.group, p_with_frdo: false, p_confirm_identity: false });
    expect(f.events.indexOf("caller.rpc:can_prepare_student_registration_details")).toBeLessThan(f.events.indexOf("auth.create"));
    expect(f.events.indexOf("auth.create")).toBeLessThan(f.events.indexOf("service.rpc:create_student_profile_with_capacity"));
    expect(f.adminRpc).toHaveBeenCalledWith("save_student_registration_details", expect.objectContaining({ p_department: "Synthetic department", p_snils: null, p_birth_date: null, p_confirm_identity: false }));
  });
  it.each([
    { fields: { snils: "00100199832" }, withFrdo: true, confirm: false },
    { fields: { birth_date: "15.06.1990" }, withFrdo: true, confirm: false },
    { fields: { confirm_identity: true }, withFrdo: false, confirm: true },
    { fields: { snils: "00100199832", birth_date: "1990-06-15", confirm_identity: true }, withFrdo: true, confirm: true },
    { fields: { job_position: "Synthetic position" }, withFrdo: false, confirm: false },
  ])("derives canonical extra-privilege flags only from normalized fields $fields", async ({ fields, withFrdo, confirm }) => {
    const f = fixture(); const result = await f.call(fields); expect(result.body.success).toBe(true);
    expect(f.callerRpc).toHaveBeenCalledExactlyOnceWith("can_prepare_student_registration_details", { p_organization_id: ids.org, p_group_id: null, p_with_frdo: withFrdo, p_confirm_identity: confirm });
  });
  it("does not let a broad admin role substitute for a current canonical grant", async () => {
    const f = fixture({ role: "admin", prepare: false }); const result = await f.call({ snils: "00100199832", confirm_identity: true });
    expect(result.status).toBe(403); expectNoMutation(f);
  });
  it.each([{ role: "student" }, { role: "student", staff: true, staffExpires: "2000-01-01" }])("preserves earlier plain/expired staff denial %j", async options => {
    const f = fixture(options); expect((await f.call({ department: "Synthetic department" })).status).toBe(403); expectNoMutation(f);
  });
  it.each([{ department: "Synthetic department" }, { snils: "00100199832" }, { confirm_identity: true }, { job_position: "Synthetic position" }])("never grants public registration tokens staff detail authority %j", async fields => {
    const f = fixture(); const result = await f.call({ registration_token: "synthetic-token", ...fields });
    expect(result.status).toBe(403); expect(result.body.code).toBe("STUDENT_DETAILS_FORBIDDEN");
    expect(f.callerRpc).not.toHaveBeenCalled(); expectNoMutation(f);
  });
  it("keeps the public token's ordinary core-only registration flow", async () => {
    const f = fixture({ prepareError: true }); const result = await f.call({ registration_token: "synthetic-token", department: " ", snils: "", birth_date: null, confirm_identity: false });
    expect(result.status).toBe(200); expect(result.body).toMatchObject({ success: true, user_id: ids.student });
    expect(result.body.details_confirmed).toBeUndefined(); expect(f.callerRpc).not.toHaveBeenCalled(); expect(f.createUser).toHaveBeenCalledTimes(1);
    expect(f.adminRpc).toHaveBeenCalledWith("create_student_profile_with_capacity", expect.objectContaining({ p_organization_id: ids.org, p_student_group_id: ids.group }));
  });
  it("does not add a new detail preflight to authenticated core-only empty normalized input", async () => {
    const f = fixture({ prepareError: true }); const result = await f.call({ department: " ", job_position: null, snils: "", birth_date: " ", confirm_identity: false });
    expect(result.body.success).toBe(true); expect(f.callerRpc).not.toHaveBeenCalled(); expect(f.createUser).toHaveBeenCalledTimes(1);
  });
  it("checks existing-student details too without creating another Auth account", async () => {
    const f = fixture({ existing: true }); const result = await f.call({ department: "Synthetic department" });
    expect(result.body).toMatchObject({ success: true, is_existing: true, details_confirmed: true });
    expect(f.createUser).not.toHaveBeenCalled(); expect(f.callerRpc).toHaveBeenCalledTimes(1);
  });
  it("keeps honest partial success after an authorized preflight followed by a late save denial", async () => {
    const f = fixture({ detailsError: true }); const result = await f.call({ department: "Synthetic department" });
    expect(result.status).toBe(200); expect(result.body).toMatchObject({ success: false, partial_success: true, profile_persisted: true, student_created: true, details_confirmed: false, code: "STUDENT_DETAILS_NOT_CONFIRMED" });
    expect(f.createUser).toHaveBeenCalledTimes(1); expect(result.body.error).toContain("Зачисление на курс не проверено");
  });
  it("preserves student-import-v6 and exposes a separate security deployment revision on success and harmless GET probe", async () => {
    const f = fixture();
    for (const result of [await f.call(), await f.call({}, "GET")]) {
      expect(result.headers.get("X-Sintagma-Register-Student-Revision")).toBe("student-import-v6");
      expect(result.headers.get("X-Sintagma-Function-Revision")).toBe("uc-ocr-scope-20261019-v1");
      expect(result.headers.get("Access-Control-Expose-Headers")).toContain("X-Sintagma-Function-Revision");
    }
  });
});
