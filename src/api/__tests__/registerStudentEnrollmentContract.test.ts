import fs from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REGISTER_STUDENT_SOURCE = resolve(
  process.cwd(),
  "supabase/functions/register-student/index.ts",
);

describe("register-student enrollment deployment contract", () => {
  const readSource = () => fs.readFileSync(REGISTER_STUDENT_SOURCE, "utf8");

  it("fails closed unless the first course enrollment is persisted", () => {
    const source = readSource();

    expect(source).toContain('const REGISTER_STUDENT_REVISION = "enrollment-persistence-v2"');
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
});
