import fs from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REGISTER_STUDENT_SOURCE = resolve(
  process.cwd(),
  "supabase/functions/register-student/index.ts",
);

describe("register-student enrollment deployment contract", () => {
  it("fails closed unless the first course enrollment is persisted", () => {
    const source = fs.readFileSync(REGISTER_STUDENT_SOURCE, "utf8");

    expect(source).toContain('const REGISTER_STUDENT_REVISION = "enrollment-persistence-v1"');
    expect(source).toContain('"X-Sintagma-Register-Student-Revision"');
    expect(source).toContain('.select("id, user_id, course_id")');
    expect(source).toContain('.eq("id", insertedEnrollment.id)');
    expect(source).toContain('code: "ENROLLMENT_PREFLIGHT_FAILED"');
    expect(source).toContain('code: "ENROLLMENT_NOT_CONFIRMED"');
    expect(source).toContain("already_enrolled: alreadyEnrolled");
    expect(source).not.toContain("if (!enrollError) enrollmentCreated = true");
  });

  it("validates course tenant ownership before creating the auth user", () => {
    const source = fs.readFileSync(REGISTER_STUDENT_SOURCE, "utf8");

    const scopeCheck = source.indexOf('code: "COURSE_ORGANIZATION_MISMATCH"');
    const authCreation = source.indexOf("supabaseAdmin.auth.admin.createUser");
    expect(scopeCheck).toBeGreaterThan(-1);
    expect(authCreation).toBeGreaterThan(scopeCheck);
    expect(source).toContain('.select("id, organization_id")');
    expect(source).toContain('code: "COURSE_NOT_FOUND"');
    expect(source).toContain('code: "COURSE_PREFLIGHT_FAILED"');
  });
});
