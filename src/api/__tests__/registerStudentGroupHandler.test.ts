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
const OTHER_COURSE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
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
  existing?: boolean;
  profileResult?: Result | Error;
  savedGroupResult?: Result | Error;
  savedCourseResult?: Result | Error;
  tokenCourseId?: string | null;
  initialEnrollments?: Record<string, Record<string, unknown>>;
  enrollmentReads?: Record<string, readonly (Result | Error)[]>;
  enrollmentInsertResult?: Result | Error;
  persistInsert?: boolean;
  claimResult?: Result;
};
const groupFacts = { id: GROUP, organization_id: ORG, course_id: null };
const result = (data: unknown): Result => ({ data, error: null });

function harness(options: Options = {}) {
  const groupId = Object.prototype.hasOwnProperty.call(options, "groupId") ? options.groupId : GROUP;
  const createUser = vi.fn().mockResolvedValue({ data: { user: { id: STUDENT } }, error: null });
  const reads: { table: string; filters: Record<string, unknown> }[] = [];
  const writes = vi.fn();
  const enrollments = new Map(Object.entries(options.initialEnrollments ?? {}));
  const enrollmentReads = Object.fromEntries(Object.entries(options.enrollmentReads ?? {}).map(([key, values]) => [key, [...values]]));
  let claimed = false;
  const rpc = vi.fn((name: string) => {
    if (name === "create_student_profile_with_capacity") claimed = true;
    const value = name === "has_org_staff_permission" ? result(false)
      : name === "get_organization_student_capacity" ? result({ is_unlimited: true })
      : name === "create_student_profile_with_capacity" ? (options.claimResult ?? result({ success: true, is_existing: !!options.existing }))
      : name === "is_student_profile" ? result(true)
      : name === "increment_registration_link_usage" ? result(null)
      : (() => { throw new Error(`Unexpected RPC: ${name}`); })();
    return Object.assign(Promise.resolve(value), { throwOnError: () => Promise.resolve(value) });
  });
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    let inserted: Record<string, unknown> | null = null;
    const read = async () => {
      if (inserted) {
        writes(table, "insert", inserted);
        const row = { id: `enrollment-${inserted.course_id}`, expires_at: null, ...inserted };
        if (options.persistInsert !== false) enrollments.set(String(inserted.course_id), row);
        if (options.enrollmentInsertResult instanceof Error) throw options.enrollmentInsertResult;
        return options.enrollmentInsertResult ?? result(row);
      }
      reads.push({ table, filters: { ...filters } });
      let value: Result | Error;
      switch (table) {
        case "user_roles": value = result((options.roles ?? ["organization"]).map(role => ({ role }))); break;
        case "profiles": value = filters.user_id === CALLER ? result({ organization_id: ORG })
          : filters.user_id === STUDENT ? (options.profileResult ?? result({ user_id: STUDENT, organization_id: ORG, student_group_id: typeof groupId === "string" ? groupId.toLowerCase() : groupId }))
          : filters.email ? result(options.existing ? [{ user_id: STUDENT, full_name: "Ранее созданный", login: "existing_login", organization_id: ORG, archived_at: null, blocked_at: null }] : [])
          : result(null); break;
        case "org_staff": value = result(options.staff ? { user_id: CALLER, expires_at: null } : null); break;
        case "companies": value = result({ id: "company-1", organization_id: ORG, user_id: CALLER }); break;
        case "registration_links": value = result({ id: "link-1", organization_id: options.tokenOrganization ?? ORG, company_id: null, course_id: options.tokenCourseId ?? null, student_group_id: groupId, used_count: 0, expires_at: null }); break;
        case "student_groups": value = (claimed ? options.savedGroupResult : undefined) ?? options.groupResult ?? result(groupFacts); break;
        case "courses": value = (claimed ? options.savedCourseResult : undefined) ?? options.courseResult ?? result({ id: filters.id, organization_id: ORG }); break;
        case "enrollments": value = enrollmentReads[String(filters.course_id)]?.shift() ?? result(enrollments.get(String(filters.course_id)) ?? null); break;
        default: throw new Error(`Unexpected table read: ${table}`);
      }
      if (value instanceof Error) throw value;
      return value;
    };
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => { filters[column] = value; return query; }),
      limit: vi.fn(() => query),
      insert: vi.fn((data: Record<string, unknown>) => { inserted = data; return query; }),
      maybeSingle: read,
      then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => read().then(resolve, reject),
      upsert: vi.fn((data: unknown) => { writes(table, data); return Promise.resolve(result(null)); }),
    };
    return query;
  });
  const deleteUser = vi.fn();
  const admin = { from, rpc, auth: { admin: { createUser, deleteUser, getUserById: async () => result({ user: { id: STUDENT } }) } } };
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
      ...(options.existing ? { email: "existing@example.test" } : {}),
      ...(options.public ? { registration_token: "synthetic-token" } : {}),
      ...options.body,
    }),
  }));
  return { request, from, reads, rpc, createUser, deleteUser, writes, enrollments };
}

describe("actual register-student handler group preflight", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("identifies v5 through a read-only unauthorized probe before any database read or write", async () => {
    const h = harness({ authorization: false });
    const response = await h.request();
    expect(response.status).toBe(401);
    expect(response.headers.get("X-Sintagma-Register-Student-Revision")).toBe("enrollment-persistence-v5");
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
        expect(response.headers.get("X-Sintagma-Register-Student-Revision")).toBe("enrollment-persistence-v5");
        expect(await response.json()).toMatchObject({ code });
        expect(h.createUser).not.toHaveBeenCalled();
        expect(h.rpc.mock.calls.some(([name]) => name === "create_student_profile_with_capacity")).toBe(false);
        expect(h.writes).not.toHaveBeenCalled();
      });

      it.each([null, GROUP])("preserves successful registration with group %s", async groupId => {
        const h = harness({ public: publicRegistration, groupId });
        const response = await h.request();
        expect(response.status).toBe(200);
        expect(response.headers.get("X-Sintagma-Register-Student-Revision")).toBe("enrollment-persistence-v5");
        const data = await response.json();
        expect(data).toMatchObject({ success: true, user_id: STUDENT });
        if (publicRegistration) expect(data.password).toBeUndefined();
        expect(h.createUser).toHaveBeenCalledTimes(1);
        expect(h.rpc).toHaveBeenCalledWith("create_student_profile_with_capacity", expect.objectContaining({ p_organization_id: ORG, p_student_group_id: groupId }));
        expect(data).toMatchObject({ group_confirmed: groupId ? true : null, group_course_id: null, group_enrollment_confirmed: null });
        expect(h.reads.filter(read => read.table === "student_groups")).toHaveLength(groupId ? 2 : 0);
      });

      it("accepts the group's same-tenant course without a separate form course", async () => {
        const h = harness({ public: publicRegistration, groupResult: result({ ...groupFacts, course_id: COURSE }) });
        expect((await h.request()).status).toBe(200);
        expect(h.reads).toContainEqual({ table: "courses", filters: { id: COURSE } });
        expect(h.createUser).toHaveBeenCalledTimes(1);
        expect(h.enrollments.get(COURSE)).toMatchObject({ user_id: STUDENT, course_id: COURSE, status: "active", progress: 0 });
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

  const enrollment = (courseId = COURSE, overrides: Record<string, unknown> = {}) => ({
    id: `enrollment-${courseId}`, user_id: STUDENT, course_id: courseId,
    status: "active", expires_at: null, progress: 73, ...overrides,
  });
  const withGroupCourse = { groupResult: result({ ...groupFacts, course_id: COURSE }) };
  const enrollmentWrites = (h: ReturnType<typeof harness>) => h.writes.mock.calls.filter(([table]) => table === "enrollments");

  it.each([false, true])("confirms an implicit course created by the profile trigger, public=%s", async publicRegistration => {
    const original = enrollment();
    const h = harness({ ...withGroupCourse, public: publicRegistration, initialEnrollments: { [COURSE]: original } });
    const response = await h.request();
    expect(await response.json()).toMatchObject({ success: true, group_confirmed: true, group_course_id: COURSE,
      group_enrollment_confirmed: true, enrollment_confirmed: true, already_enrolled: true, enrollment_created: false });
    expect(enrollmentWrites(h)).toHaveLength(0);
    expect(h.enrollments.get(COURSE)).toEqual(original);
  });

  it("creates and reads back a missing group enrollment after profile save", async () => {
    const h = harness(withGroupCourse);
    expect(await (await h.request()).json()).toMatchObject({ success: true, group_enrollment_confirmed: true,
      enrollment_created: true, already_enrolled: false, enrollment_confirmed: true });
    expect(enrollmentWrites(h)).toHaveLength(1);
    expect(h.reads).toContainEqual({ table: "enrollments", filters: { id: `enrollment-${COURSE}`, user_id: STUDENT, course_id: COURSE } });
  });

  it.each([false, true])("confirms both different courses but keeps old flags about the explicit course, public=%s", async publicRegistration => {
    const h = harness({ ...withGroupCourse, public: publicRegistration, body: { course_id: OTHER_COURSE },
      tokenCourseId: publicRegistration ? OTHER_COURSE : null, initialEnrollments: { [OTHER_COURSE]: enrollment(OTHER_COURSE) } });
    expect(await (await h.request()).json()).toMatchObject({ success: true, group_course_id: COURSE,
      group_enrollment_confirmed: true, enrollment_confirmed: true, enrollment_created: false, already_enrolled: true });
    expect([...h.enrollments.keys()].sort()).toEqual([COURSE, OTHER_COURSE].sort());
    expect(enrollmentWrites(h)).toHaveLength(1);
    expect(enrollmentWrites(h)[0][2]).toMatchObject({ course_id: COURSE });
  });

  it("deduplicates the same explicit and group course", async () => {
    const h = harness({ ...withGroupCourse, body: { course_id: COURSE } });
    expect(await (await h.request()).json()).toMatchObject({ success: true, group_enrollment_confirmed: true, enrollment_created: true });
    expect(enrollmentWrites(h)).toHaveLength(1);
    expect(h.reads.filter(read => read.table === "enrollments")).toHaveLength(2);
  });

  it("does not use the untrusted form course or group instead of public token values", async () => {
    const h = harness({ ...withGroupCourse, public: true, tokenCourseId: OTHER_COURSE,
      body: { course_id: "malicious-course", student_group_id: "malicious-group", organization_id: OTHER } });
    expect(await (await h.request()).json()).toMatchObject({ success: true, group_course_id: COURSE, group_enrollment_confirmed: true });
    expect([...h.enrollments.keys()].sort()).toEqual([COURSE, OTHER_COURSE].sort());
    expect(h.reads.some(read => Object.values(read.filters).some(value => String(value).startsWith("malicious")))).toBe(false);
  });

  it("uses the actual course after the profile claim, not stale preflight facts", async () => {
    const h = harness({ ...withGroupCourse, savedGroupResult: result({ ...groupFacts, course_id: OTHER_COURSE }) });
    expect(await (await h.request()).json()).toMatchObject({ success: true, group_course_id: OTHER_COURSE, group_enrollment_confirmed: true });
    expect([...h.enrollments.keys()]).toEqual([OTHER_COURSE]);
  });

  it.each([false, true])("refuses expired group access without reviving progress, public=%s", async publicRegistration => {
    const original = enrollment(COURSE, { expires_at: "2000-01-01T00:00:00Z", test_results: { passed: true } });
    const h = harness({ ...withGroupCourse, public: publicRegistration, initialEnrollments: { [COURSE]: original } });
    const response = await h.request();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ success: false, partial_success: true, profile_persisted: true,
      code: "ENROLLMENT_ACCESS_EXPIRED", group_confirmed: true, group_course_id: COURSE,
      group_enrollment_confirmed: false, enrollment_confirmed: false, user_id: STUDENT });
    expect(data.password).toBe(publicRegistration ? undefined : "FixturePassword123");
    expect(h.enrollments.get(COURSE)).toEqual(original);
    expect(enrollmentWrites(h)).toHaveLength(0);
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it("keeps expired completed group enrollment accessible and unchanged", async () => {
    const original = enrollment(COURSE, { status: "completed", progress: 100, expires_at: "2000-01-01T00:00:00Z" });
    const h = harness({ ...withGroupCourse, initialEnrollments: { [COURSE]: original } });
    expect(await (await h.request()).json()).toMatchObject({ success: true, group_enrollment_confirmed: true, already_enrolled: true });
    expect(h.enrollments.get(COURSE)).toEqual(original);
    expect(enrollmentWrites(h)).toHaveLength(0);
  });

  it("returns group-related partial failure for an existing student's saved profile too", async () => {
    const h = harness({ ...withGroupCourse, existing: true,
      initialEnrollments: { [COURSE]: enrollment(COURSE, { expires_at: "2000-01-01T00:00:00Z" }) } });
    const response = await h.request();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ success: false, partial_success: true, profile_persisted: true,
      created_auth_user: false, student_created: false, is_existing: true, code: "ENROLLMENT_ACCESS_EXPIRED" });
    expect(data.password).toBeUndefined();
    expect(h.createUser).not.toHaveBeenCalled();
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    ["missing profile", { profileResult: result(null) }, "STUDENT_GROUP_NOT_CONFIRMED", false],
    ["foreign profile", { profileResult: result({ user_id: STUDENT, organization_id: OTHER, student_group_id: GROUP }) }, "STUDENT_GROUP_NOT_CONFIRMED", false],
    ["wrong user profile", { profileResult: result({ user_id: OTHER, organization_id: ORG, student_group_id: GROUP }) }, "STUDENT_GROUP_NOT_CONFIRMED", false],
    ["group not saved", { profileResult: result({ user_id: STUDENT, organization_id: ORG, student_group_id: null }) }, "STUDENT_GROUP_NOT_CONFIRMED", true],
    ["wrong saved group", { profileResult: result({ user_id: STUDENT, organization_id: ORG, student_group_id: OTHER }) }, "STUDENT_GROUP_NOT_CONFIRMED", true],
    ["thrown profile read", { profileResult: new Error("offline") }, "STUDENT_GROUP_NOT_CONFIRMED", null],
    ["returned profile read error", { profileResult: { data: null, error: { message: "offline" } } }, "STUDENT_GROUP_NOT_CONFIRMED", null],
    ["profile facts with read error", { profileResult: { data: { user_id: STUDENT, organization_id: ORG, student_group_id: GROUP }, error: { message: "offline" } } }, "STUDENT_GROUP_NOT_CONFIRMED", null],
    ["missing saved group", { savedGroupResult: result(null) }, "STUDENT_GROUP_NOT_FOUND", true],
    ["foreign saved group", { savedGroupResult: result({ ...groupFacts, organization_id: OTHER }) }, "STUDENT_GROUP_ORGANIZATION_MISMATCH", true],
    ["group read failed", { savedGroupResult: new Error("offline") }, "GROUP_PREFLIGHT_FAILED", true],
    ["missing course", { savedCourseResult: result(null) }, "GROUP_COURSE_NOT_FOUND", true],
    ["foreign course", { savedCourseResult: result({ id: COURSE, organization_id: OTHER }) }, "GROUP_COURSE_ORGANIZATION_MISMATCH", true],
    ["course read failed", { savedCourseResult: new Error("offline") }, "GROUP_COURSE_PREFLIGHT_FAILED", true],
  ] as const)("preserves credentials and reports only proven profile state on post-save %s", async (_label, options, code, persisted) => {
    const h = harness({ ...withGroupCourse, ...options });
    const response = await h.request();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ success: false, partial_success: true, profile_persisted: persisted,
      created_auth_user: true, group_confirmed: false, enrollment_confirmed: false, code, user_id: STUDENT, password: "FixturePassword123" });
    if (persisted !== true) expect(data.message).not.toContain("Профиль ученика сохранён");
    expect(h.createUser).toHaveBeenCalledTimes(1);
    expect(h.deleteUser).not.toHaveBeenCalled();
    expect(enrollmentWrites(h)).toHaveLength(0);
  });

  it.each([
    ["returned read error", { enrollmentReads: { [COURSE]: [{ data: null, error: { message: "offline" } }] } }],
    ["thrown read error", { enrollmentReads: { [COURSE]: [new Error("offline")] } }],
    ["missing insert readback", { persistInsert: false }],
    ["thrown write after commit", { enrollmentInsertResult: new Error("response lost") }],
    ["lost insert response", { enrollmentInsertResult: result(null) }],
    ["expired insert readback", { enrollmentReads: { [COURSE]: [result(null), result(enrollment(COURSE, { expires_at: "2000-01-01T00:00:00Z" }))] } }],
    ["wrong existing identity", { enrollmentReads: { [COURSE]: [result(enrollment(OTHER_COURSE))] } }],
  ] as const)("never reports group-course success or retries after %s", async (_label, options) => {
    const h = harness({ ...withGroupCourse, ...options });
    const response = await h.request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: false, partial_success: true, profile_persisted: true,
      group_confirmed: true, group_enrollment_confirmed: false, enrollment_confirmed: false, user_id: STUDENT });
    expect(enrollmentWrites(h).length).toBeLessThanOrEqual(1);
    expect(h.createUser).toHaveBeenCalledTimes(1);
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it.each([false, true])("reconciles a group enrollment unique race only when access is valid, expired=%s", async expired => {
    const row = enrollment(COURSE, { expires_at: expired ? "2000-01-01T00:00:00Z" : null });
    const h = harness({ ...withGroupCourse, enrollmentInsertResult: { data: null, error: { code: "23505" } },
      enrollmentReads: { [COURSE]: [result(null), result(row)] }, persistInsert: false });
    const data = await (await h.request()).json();
    expect(data).toMatchObject({ success: !expired, group_enrollment_confirmed: !expired, already_enrolled: !expired });
    if (expired) expect(data).toMatchObject({ partial_success: true, code: "ENROLLMENT_ACCESS_EXPIRED" });
    expect(enrollmentWrites(h)).toHaveLength(1);
  });

  it("reports partial when only the group course succeeds and the different explicit course fails", async () => {
    const h = harness({ ...withGroupCourse, body: { course_id: OTHER_COURSE },
      enrollmentReads: { [OTHER_COURSE]: [{ data: null, error: { message: "offline" } }] } });
    expect(await (await h.request()).json()).toMatchObject({ success: false, partial_success: true,
      group_course_id: COURSE, group_enrollment_confirmed: true, enrollment_confirmed: false, enrollment_created: false });
    expect([...h.enrollments.keys()]).toEqual([COURSE]);
  });

  it.each([false, true])("refuses expired independent course too on grouped registration, public=%s", async publicRegistration => {
    const original = enrollment(OTHER_COURSE, { expires_at: "2000-01-01T00:00:00Z" });
    const h = harness({ ...withGroupCourse, public: publicRegistration, tokenCourseId: OTHER_COURSE,
      body: { course_id: OTHER_COURSE }, initialEnrollments: { [OTHER_COURSE]: original } });
    expect(await (await h.request()).json()).toMatchObject({ success: false, partial_success: true,
      code: "ENROLLMENT_ACCESS_EXPIRED", group_enrollment_confirmed: true, enrollment_confirmed: false });
    expect(h.enrollments.get(OTHER_COURSE)).toEqual(original);
  });

  it("confirms the group/course after a lost profile-claim response without another create", async () => {
    const h = harness({ ...withGroupCourse, claimResult: { data: null, error: { message: "response lost" } } });
    expect(await (await h.request()).json()).toMatchObject({ success: true, group_enrollment_confirmed: true });
    expect(h.createUser).toHaveBeenCalledTimes(1);
    expect(h.rpc.mock.calls.filter(([name]) => name === "create_student_profile_with_capacity")).toHaveLength(1);
    expect(enrollmentWrites(h)).toHaveLength(1);
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it("preserves explicit-only existing-student expiry errors and creates no new account", async () => {
    const h = harness({ groupId: null, existing: true,
      body: { course_id: COURSE, enrollment_request_source: "organization_add_student" },
      initialEnrollments: { [COURSE]: enrollment(COURSE, { expires_at: "2000-01-01T00:00:00Z" }) } });
    const response = await h.request();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "ENROLLMENT_ACCESS_EXPIRED" });
    expect(h.createUser).not.toHaveBeenCalled();
    expect(enrollmentWrites(h)).toHaveLength(0);
  });
});
