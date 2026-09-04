import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preflightRegistrationStudentGroup } from "../../../supabase/functions/_shared/registration-student-group.ts";
import { isEnrollmentAccessExpired } from "../../../supabase/functions/_shared/enrollment-access.ts";

// Execute the actual Edge handler, replacing only Deno's entrypoint and its
// external client dependencies. No network, auth users, or DB writes are made.
const source = ts.createSourceFile("register-student.ts", readFileSync(resolve(process.cwd(), "supabase/functions/register-student/index.ts"), "utf8"), ts.ScriptTarget.Latest, true);
const body = ts.factory.updateSourceFile(source, source.statements.filter(statement => !ts.isImportDeclaration(statement)));
const executable = ts.transpileModule(ts.createPrinter().printFile(body), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const evaluate = new Function("serve", "createClient", "Deno", "isEnrollmentAccessExpired", "preflightRegistrationStudentGroup", executable);

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const GROUP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COURSE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CALLER = "44444444-4444-4444-8444-444444444444";
const STUDENT = "55555555-5555-4555-8555-555555555555";
type Result = { data: unknown; error: unknown };
type Options = {
  public?: boolean;
  groupId?: unknown;
  groupResult?: Result | Error;
  courseResult?: Result | Error;
  roles?: readonly string[];
  staff?: boolean;
  tokenOrganization?: string;
  body?: Record<string, unknown>;
  authorization?: boolean;
};
const groupFacts = { id: GROUP, organization_id: ORG, course_id: null };
const result = (data: unknown): Result => ({ data, error: null });

function harness(options: Options = {}) {
  const groupId = Object.prototype.hasOwnProperty.call(options, "groupId") ? options.groupId : GROUP;
  const createUser = vi.fn().mockResolvedValue({ data: { user: { id: STUDENT } }, error: null });
  const reads: { table: string; filters: Record<string, unknown> }[] = [];
  const writes = vi.fn();
  const rpc = vi.fn((name: string) => {
    const value = name === "has_org_staff_permission" ? result(false)
      : name === "get_organization_student_capacity" ? result({ is_unlimited: true })
      : name === "create_student_profile_with_capacity" ? result({ success: true, is_existing: false })
      : name === "increment_registration_link_usage" ? result(null)
      : (() => { throw new Error(`Unexpected RPC: ${name}`); })();
    return Object.assign(Promise.resolve(value), { throwOnError: () => Promise.resolve(value) });
  });
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const read = async () => {
      reads.push({ table, filters: { ...filters } });
      let value: Result | Error;
      switch (table) {
        case "user_roles": value = result((options.roles ?? ["organization"]).map(role => ({ role }))); break;
        case "profiles": value = result(filters.user_id === CALLER ? { organization_id: ORG } : null); break;
        case "org_staff": value = result(options.staff ? { user_id: CALLER, expires_at: null } : null); break;
        case "companies": value = result({ id: "company-1", organization_id: ORG, user_id: CALLER }); break;
        case "registration_links": value = result({ id: "link-1", organization_id: options.tokenOrganization ?? ORG, company_id: null, course_id: null, student_group_id: groupId, used_count: 0, expires_at: null }); break;
        case "student_groups": value = options.groupResult ?? result(groupFacts); break;
        case "courses": value = options.courseResult ?? result({ id: COURSE, organization_id: ORG }); break;
        default: throw new Error(`Unexpected table read: ${table}`);
      }
      if (value instanceof Error) throw value;
      return value;
    };
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => { filters[column] = value; return query; }),
      maybeSingle: read,
      then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => read().then(resolve, reject),
      upsert: vi.fn((data: unknown) => { writes(table, data); return Promise.resolve(result(null)); }),
    };
    return query;
  });
  const admin = { from, rpc, auth: { admin: { createUser } } };
  const auth = { auth: { getUser: async () => ({ data: { user: { id: CALLER } }, error: null }) } };
  const createClient = vi.fn((_url: string, _key: string, config: { auth?: unknown }) => config.auth ? admin : auth);
  let handler: (request: Request) => Promise<Response>;
  evaluate((value: typeof handler) => { handler = value; }, createClient, { env: { get: () => "test" } }, isEnrollmentAccessExpired, preflightRegistrationStudentGroup);
  const request = () => handler(new Request("https://example.test/register-student", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(!options.public && options.authorization !== false ? { Authorization: "Bearer test" } : {}) },
    body: JSON.stringify({
      full_name: "Тестовый Ученик", organization_id: ORG, student_group_id: groupId,
      custom_login: "fixture_student", custom_password: "FixturePassword123",
      ...(options.public ? { registration_token: "synthetic-token" } : {}),
      ...options.body,
    }),
  }));
  return { request, from, reads, rpc, createUser, writes };
}

describe("actual register-student handler group preflight", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("identifies v4 through a read-only unauthorized probe before any database read or write", async () => {
    const h = harness({ authorization: false });
    const response = await h.request();
    expect(response.status).toBe(401);
    expect(response.headers.get("X-Sintagma-Register-Student-Revision")).toBe("enrollment-persistence-v4");
    expect(response.headers.get("Access-Control-Expose-Headers")).toContain("X-Sintagma-Register-Student-Revision");
    expect(h.from).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.createUser).not.toHaveBeenCalled();
  });

  for (const publicRegistration of [false, true]) {
    describe(publicRegistration ? "public registration token" : "authenticated organization", () => {
      it.each([
        ["invalid UUID", { groupId: "not-uuid" }, 400, "INVALID_STUDENT_GROUP_ID"],
        ["missing group", { groupResult: result(null) }, 404, "STUDENT_GROUP_NOT_FOUND"],
        ["foreign group", { groupResult: result({ ...groupFacts, organization_id: OTHER }) }, 403, "STUDENT_GROUP_ORGANIZATION_MISMATCH"],
        ["group read error", { groupResult: { data: null, error: new Error("offline") } }, 500, "GROUP_PREFLIGHT_FAILED"],
        ["group read rejection", { groupResult: new Error("offline") }, 500, "GROUP_PREFLIGHT_FAILED"],
        ["foreign implicit course", { groupResult: result({ ...groupFacts, course_id: COURSE }), courseResult: result({ id: COURSE, organization_id: OTHER }) }, 403, "GROUP_COURSE_ORGANIZATION_MISMATCH"],
        ["missing implicit course", { groupResult: result({ ...groupFacts, course_id: COURSE }), courseResult: result(null) }, 404, "GROUP_COURSE_NOT_FOUND"],
        ["course read error", { groupResult: result({ ...groupFacts, course_id: COURSE }), courseResult: { data: null, error: new Error("offline") } }, 500, "GROUP_COURSE_PREFLIGHT_FAILED"],
      ] as const)("rejects %s before creating auth or profile", async (_label, input, status, code) => {
        const h = harness({ public: publicRegistration, ...input });
        const response = await h.request();
        expect(response.status).toBe(status);
        expect(response.headers.get("X-Sintagma-Register-Student-Revision")).toBe("enrollment-persistence-v4");
        expect(await response.json()).toMatchObject({ code });
        expect(h.createUser).not.toHaveBeenCalled();
        expect(h.rpc.mock.calls.some(([name]) => name === "create_student_profile_with_capacity")).toBe(false);
        expect(h.writes).not.toHaveBeenCalled();
      });

      it.each([null, GROUP])("preserves successful registration with group %s", async groupId => {
        const h = harness({ public: publicRegistration, groupId });
        const response = await h.request();
        expect(response.status).toBe(200);
        expect(response.headers.get("X-Sintagma-Register-Student-Revision")).toBe("enrollment-persistence-v4");
        const data = await response.json();
        expect(data).toMatchObject({ success: true, user_id: STUDENT });
        if (publicRegistration) expect(data.password).toBeUndefined();
        expect(h.createUser).toHaveBeenCalledTimes(1);
        expect(h.rpc).toHaveBeenCalledWith("create_student_profile_with_capacity", expect.objectContaining({ p_organization_id: ORG, p_student_group_id: groupId }));
        expect(h.reads.filter(read => read.table === "student_groups")).toHaveLength(groupId ? 1 : 0);
      });

      it("accepts the group's same-tenant course without a separate form course", async () => {
        const h = harness({ public: publicRegistration, groupResult: result({ ...groupFacts, course_id: COURSE }) });
        expect((await h.request()).status).toBe(200);
        expect(h.reads).toContainEqual({ table: "courses", filters: { id: COURSE } });
        expect(h.createUser).toHaveBeenCalledTimes(1);
      });
    });
  }

  it("ignores caller-supplied group/org overrides for public token registration", async () => {
    const h = harness({ public: true, body: { organization_id: OTHER, student_group_id: "malicious-override" } });
    expect((await h.request()).status).toBe(200);
    expect(h.rpc).toHaveBeenCalledWith("create_student_profile_with_capacity", expect.objectContaining({ p_organization_id: ORG, p_student_group_id: GROUP }));
    expect(h.reads).toContainEqual({ table: "student_groups", filters: { id: GROUP } });
  });

  it("does not let platform admin bypass group tenant consistency", async () => {
    const h = harness({ roles: ["admin"], groupResult: result({ ...groupFacts, organization_id: OTHER }) });
    const response = await h.request();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "STUDENT_GROUP_ORGANIZATION_MISMATCH" });
    expect(h.createUser).not.toHaveBeenCalled();
  });

  it.each([
    ["missing authorization", { authorization: false }, 401],
    ["learner role", { roles: ["student"] }, 403],
    ["foreign organization", { body: { organization_id: OTHER } }, 403],
    ["company scope override", { roles: ["company"], body: { organization_id: OTHER } }, 403],
    ["staff without students.write", { staff: true }, 403],
  ] as const)("preserves refusal for %s", async (_label, options, status) => {
    const h = harness(options);
    expect((await h.request()).status).toBe(status);
    expect(h.from).not.toHaveBeenCalledWith("student_groups");
    expect(h.createUser).not.toHaveBeenCalled();
    expect(h.writes).not.toHaveBeenCalled();
  });
});
