import fs from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { hasStudentRegistrationDetails, normalizeStudentRegistrationDetails, resolveRegistrationProfile } from "../../../supabase/functions/_shared/student-registration-details";

const REGISTER_STUDENT_SOURCE = resolve(
  process.cwd(),
  "supabase/functions/register-student/index.ts",
);

const ORGANIZATION_STUDENT_MANAGEMENT_SOURCE = resolve(
  process.cwd(),
  "src/hooks/useStudentManagement.ts",
);

describe("register-student enrollment deployment contract", () => {
  const readSource = () => fs.readFileSync(REGISTER_STUDENT_SOURCE, "utf8");

  it("fails closed unless the first course enrollment is persisted", () => {
    const source = readSource();

    expect(source).toContain('const REGISTER_STUDENT_REVISION = "student-details-v4"');
    expect(source).toContain('"X-Sintagma-Register-Student-Revision"');
    expect(source).toContain('.select("id, user_id, course_id")');
    expect(source).toContain('.eq("id", insertedEnrollment.id)');
    expect(source).toMatch(/enrollmentFailureResponse\(\s*"ENROLLMENT_PREFLIGHT_FAILED"/);
    expect(source).toMatch(/enrollmentFailureResponse\(\s*"ENROLLMENT_NOT_CONFIRMED"/);
    expect(source).toContain("already_enrolled: alreadyEnrolled");
    expect(source).not.toContain("if (!enrollError) enrollmentCreated = true");
  });

  it("validates course tenant ownership before creating the auth user", () => {
    const source = readSource();

    const scopeCheck = source.indexOf('code: "COURSE_ORGANIZATION_MISMATCH"');
    const authCreation = source.indexOf("supabaseAdmin.auth.admin.createUser");
    expect(scopeCheck).toBeGreaterThan(-1);
    expect(authCreation).toBeGreaterThan(scopeCheck);
    expect(source).toContain('.select("id, organization_id")');
    expect(source).toContain('code: "COURSE_NOT_FOUND"');
    expect(source).toContain('code: "COURSE_PREFLIGHT_FAILED"');
  });

  it("fails closed while resolving an existing student identity", () => {
    const source = readSource();

    const emailLookup = source.indexOf('.eq("email", email)');
    const lookupFailure = source.indexOf('code: "PROFILE_LOOKUP_FAILED"', emailLookup);
    const studentProfileCheck = source.indexOf('"is_student_profile"', emailLookup);
    const authIdentityCheck = source.indexOf("supabaseAdmin.auth.admin.getUserById", studentProfileCheck);
    const capacityLookup = source.lastIndexOf('"get_organization_student_capacity"');
    const authCreation = source.indexOf("supabaseAdmin.auth.admin.createUser");

    expect(emailLookup).toBeGreaterThan(-1);
    expect(lookupFailure).toBeGreaterThan(emailLookup);
    expect(studentProfileCheck).toBeGreaterThan(lookupFailure);
    expect(authIdentityCheck).toBeGreaterThan(studentProfileCheck);
    expect(capacityLookup).toBeGreaterThan(authIdentityCheck);
    expect(authCreation).toBeGreaterThan(capacityLookup);
    expect(source).toContain('code: "PROFILE_LOOKUP_FAILED"');
    expect(source).toContain('code: "EMAIL_PROFILE_AMBIGUOUS"');
    expect(source).toContain('"is_student_profile"');
    expect(source).toContain('code: "PROFILE_NOT_STUDENT"');
    expect(source).toContain("supabaseAdmin.auth.admin.getUserById");
    expect(source).toContain('code: "PROFILE_AUTH_MISSING"');
  });

  it("keeps auth creation deterministic and never deletes a claimed profile on enrollment failure", () => {
    const source = readSource();
    const enrollmentMarker = source.indexOf("// ── Enrollment (idempotent) ──");
    const ambiguousClaimStart = source.indexOf("if (claimError || !claim)");
    const definitiveClaimFailure = source.indexOf("if (!claim.success)", ambiguousClaimStart);

    expect(source).toMatch(/const\s+createdAuthUserThisAttempt\s*=/);
    expect(source.match(/\bcreatedAuthUserThisAttempt\s*=/g)).toHaveLength(1);
    expect(source).not.toContain("if (!isExisting && userId)");
    expect(source).not.toContain("Promise.race");
    expect(source).not.toContain("AUTH_TIMEOUT");
    expect(ambiguousClaimStart).toBeGreaterThan(-1);
    expect(definitiveClaimFailure).toBeGreaterThan(ambiguousClaimStart);
    expect(source.slice(ambiguousClaimStart, definitiveClaimFailure)).not.toContain(
      "compensateUnclaimedAuthUser",
    );
    expect(source.slice(ambiguousClaimStart, definitiveClaimFailure)).toContain(
      '"CLAIM_RESULT_UNKNOWN"',
    );
    expect(enrollmentMarker).toBeGreaterThan(-1);
    expect(source.slice(enrollmentMarker)).not.toContain("auth.admin.deleteUser");
    expect(source).toContain("partial_success: true");
    expect(source).toContain("profile_persisted: true");
    expect(source).toContain("enrollment_confirmed: false");
  });

  it("reconciles a unique enrollment race through an exact read-back", () => {
    const source = readSource();
    const uniqueConflict = source.indexOf('"23505"');
    const conflictReadBack = source.indexOf('.from("enrollments")', uniqueConflict);

    expect(uniqueConflict).toBeGreaterThan(-1);
    expect(conflictReadBack).toBeGreaterThan(uniqueConflict);
    const reconciliation = source.slice(conflictReadBack);
    expect(reconciliation).toContain('.eq("user_id", userId)');
    expect(reconciliation).toContain('.eq("course_id", effectiveCourseId)');
    expect(reconciliation).toContain("alreadyEnrolled = true");
  });

  it("rejects an expired existing enrollment before reporting already enrolled", () => {
    const source = readSource();
    const organizationUiSource = fs.readFileSync(
      ORGANIZATION_STUDENT_MANAGEMENT_SOURCE,
      "utf8",
    );

    const existingRead = source.indexOf(
      '.select("id, status, expires_at")',
    );
    const organizationSourceGuard = source.indexOf(
      '&& enrollment_request_source === "organization_add_student"',
      existingRead,
    );
    const authenticatedGuard = source.indexOf(
      "&& !publicRegistration",
      organizationSourceGuard,
    );
    const expiryGuard = source.indexOf(
      "&& isEnrollmentAccessExpired(existingEnrollment)",
      authenticatedGuard,
    );
    const expiredCode = source.indexOf(
      '"ENROLLMENT_ACCESS_EXPIRED"',
      expiryGuard,
    );
    const alreadyEnrolled = source.indexOf(
      "alreadyEnrolled = true",
      expiryGuard,
    );

    expect(source).toContain(
      'import { isEnrollmentAccessExpired } from "../_shared/enrollment-access.ts"',
    );
    expect(organizationUiSource).toContain(
      'enrollment_request_source: "organization_add_student"',
    );

    const requestMarker = organizationUiSource.indexOf(
      'enrollment_request_source: "organization_add_student"',
    );
    const uiErrorGuard = organizationUiSource.indexOf(
      "if (error) throw error",
      requestMarker,
    );
    const uiSuccessToast = organizationUiSource.indexOf(
      "toast.success",
      uiErrorGuard,
    );

    expect(uiErrorGuard).toBeGreaterThan(requestMarker);
    expect(uiSuccessToast).toBeGreaterThan(uiErrorGuard);

    for (const excludedCaller of [
      "src/components/ImportStudentsForm.tsx",
      "src/components/admin/StudentBulkImportDialog.tsx",
      "src/hooks/useCourseGroups.ts",
      "src/pages/JoinByLink.tsx",
    ]) {
      expect(
        fs.readFileSync(resolve(process.cwd(), excludedCaller), "utf8"),
      ).not.toContain("enrollment_request_source");
    }

    expect(existingRead).toBeGreaterThan(-1);
    expect(organizationSourceGuard).toBeGreaterThan(existingRead);
    expect(authenticatedGuard).toBeGreaterThan(organizationSourceGuard);
    expect(expiryGuard).toBeGreaterThan(authenticatedGuard);
    expect(expiredCode).toBeGreaterThan(expiryGuard);
    expect(alreadyEnrolled).toBeGreaterThan(expiredCode);
  });

  it("does not turn a concurrent expired enrollment into an idempotent success", () => {
    const source = readSource();

    const duplicateRace = source.indexOf(
      'if (enrollError?.code === "23505")',
    );
    const concurrentRead = source.indexOf(
      '.select("id, user_id, course_id, status, expires_at")',
      duplicateRace,
    );
    const exactReadback = source.indexOf(
      "concurrentEnrollment.course_id !== effectiveCourseId",
      concurrentRead,
    );
    const expiryGuard = source.indexOf(
      "isEnrollmentAccessExpired(concurrentEnrollment)",
      exactReadback,
    );
    const expiredCode = source.indexOf(
      '"ENROLLMENT_ACCESS_EXPIRED"',
      expiryGuard,
    );
    const alreadyEnrolled = source.indexOf(
      "alreadyEnrolled = true",
      expiryGuard,
    );

    expect(duplicateRace).toBeGreaterThan(-1);
    expect(concurrentRead).toBeGreaterThan(duplicateRace);
    expect(exactReadback).toBeGreaterThan(concurrentRead);
    expect(expiryGuard).toBeGreaterThan(exactReadback);
    expect(expiredCode).toBeGreaterThan(expiryGuard);
    expect(alreadyEnrolled).toBeGreaterThan(expiredCode);
  });

});

// Execute the real handler with local SDK responses. No auth users or remote rows are created.
function edgeFixture(options: { role?: string; staff?: boolean; expires?: string; studentOrg?: string; existing?: boolean; detailsError?: boolean; email?: string } = {}) {
  const role = options.role || "organization";
  const existing = options.existing !== false;
  const profiles = [{ user_id: "actor", organization_id: "org-1" }, ...(existing ? [{ user_id: "student", organization_id: options.studentOrg || "org-1", login: "Sgt001", email: options.email || null, full_name: "Иванов" }] : [])];
  const rpc = vi.fn(async (name: string, args: any) => {
    if (name === "is_org_owner") return { data: role === "organization", error: null };
    if (name === "has_org_staff_permission") return { data: !!options.staff, error: null };
    if (name === "is_student_profile") return { data: args._target_user_id === "student", error: null };
    if (name === "get_organization_student_capacity") return { data: { can_add: true, is_unlimited: true }, error: null };
    if (name === "create_student_profile_with_capacity") return { data: { success: true, is_existing: existing }, error: null };
    if (name === "save_student_registration_details") return options.detailsError
      ? { data: null, error: { message: "synthetic database failure" } }
      : { data: { success: true, user_id: args.p_user_id, organization_id: args.p_organization_id }, error: null };
    throw new Error(`Unexpected RPC ${name}`);
  });
  const createUser = vi.fn(async () => ({ data: { user: { id: "student" } }, error: null }));
  const client = {
    rpc,
    auth: { getUser: async () => ({ data: { user: { id: "actor" } }, error: null }), admin: { createUser, getUserById: async () => ({ data: { user: { id: "student" } }, error: null }) } },
    from(table: string) {
      let rows: any[] = table === "profiles" ? profiles : table === "user_roles" ? [{ user_id: "actor", role }] : table === "org_staff" ? (options.staff ? [{ user_id: "actor", organization_id: "org-1", expires_at: options.expires || null }] : []) : table === "registration_links" ? [{ token: "token", organization_id: "org-1" }] : [];
      const chain: any = {
        select: () => chain,
        eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return chain; },
        limit: (count: number) => Promise.resolve({ data: rows.slice(0, count), error: null }),
        maybeSingle: () => Promise.resolve({ data: rows[0] || null, error: null }),
        upsert: () => chain,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return chain;
    },
  };
  let handler: (request: Request) => Promise<Response>;
  const source = fs.readFileSync(REGISTER_STUDENT_SOURCE, "utf8").replace(/^import .*;\r?\n/gm, "");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("serve", "createClient", "Deno", "isEnrollmentAccessExpired", "hasStudentRegistrationDetails", "normalizeStudentRegistrationDetails", "resolveRegistrationProfile", compiled)(
    (callback: typeof handler) => { handler = callback; }, () => client, { env: { get: () => "fixture" } }, () => false,
    hasStudentRegistrationDetails, normalizeStudentRegistrationDetails, resolveRegistrationProfile,
  );
  return { rpc, createUser, call: async (body: Record<string, unknown> = {}) => {
    const response = await handler!(new Request("https://fixture.invalid", { method: "POST", headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" }, body: JSON.stringify({ organization_id: "org-1", full_name: "Иванов", custom_login: "Sgt001", department: "Участок 2", ...body }) }));
    return { status: response.status, revision: response.headers.get("X-Sintagma-Register-Student-Revision"), body: await response.json() };
  } };
}

describe("register-student staff details execution", () => {
  it("updates repeated imports without email instead of creating another account", async () => {
    const fixture = edgeFixture();
    const result = await fixture.call({ confirm_identity: true });
    expect(result.body).toMatchObject({ success: true, user_id: "student", is_existing: true, details_confirmed: true });
    expect(result.revision).toBe("student-details-v4");
    expect(fixture.createUser).not.toHaveBeenCalled();
    expect(result.body.password).toBeUndefined();
    expect(fixture.rpc).toHaveBeenCalledWith("save_student_registration_details", expect.objectContaining({ p_actor_id: "actor", p_user_id: "student", p_confirm_identity: true }));
  });
  it("supports active staff whose global role is student", async () => {
    const fixture = edgeFixture({ role: "student", staff: true });
    expect((await fixture.call()).body.success).toBe(true);
  });
  it("refuses expired staff, plain students and public approval before account mutation", async () => {
    for (const options of [{ role: "student", staff: true, expires: "2000-01-01" }, { role: "student" }, {}]) {
      const fixture = edgeFixture(options);
      const result = await fixture.call(Object.keys(options).length ? {} : { registration_token: "token", confirm_identity: true });
      expect(result.status).toBe(403);
      expect(fixture.createUser).not.toHaveBeenCalled();
      expect(fixture.rpc).not.toHaveBeenCalledWith("create_student_profile_with_capacity", expect.anything());
    }
  });
  it("rejects another tenant's existing login before changing a profile", async () => {
    const fixture = edgeFixture({ studentOrg: "org-2" });
    expect((await fixture.call()).body.code).toBe("PROFILE_IN_OTHER_ORG");
    expect(fixture.rpc).not.toHaveBeenCalledWith("save_student_registration_details", expect.anything());
    expect(fixture.createUser).not.toHaveBeenCalled();
  });
  it("rejects mismatched email on an existing login", async () => {
    const fixture = edgeFixture({ email: "old@example.test" });
    expect((await fixture.call({ email: "new@example.test" })).body.code).toBe("STUDENT_IDENTITY_CONFLICT");
    expect(fixture.createUser).not.toHaveBeenCalled();
  });
  it("returns partial state and new credentials when detail persistence fails", async () => {
    const fixture = edgeFixture({ existing: false, detailsError: true });
    const result = await fixture.call({ custom_password: "synthetic-password" });
    expect(result.body).toMatchObject({ success: false, partial_success: true, profile_persisted: true, details_confirmed: false, login: "Sgt001", password: "synthetic-password", code: "STUDENT_DETAILS_NOT_CONFIRMED" });
    expect(result.body.enrollment_created).toBeUndefined();
    expect(result.body.error).toContain("Зачисление на курс не проверено");
  });
});
