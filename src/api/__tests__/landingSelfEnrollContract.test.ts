import fs from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const LANDING_SELF_ENROLL_SOURCE = resolve(
  process.cwd(),
  "supabase/functions/landing-self-enroll/index.ts",
);

describe("landing-self-enroll persistence contract", () => {
  it("proves INSERT RETURNING and a fresh read-back before success", () => {
    const source = fs.readFileSync(LANDING_SELF_ENROLL_SOURCE, "utf8");

    const returning = source.indexOf('.select("id, user_id, course_id")');
    const readBack = source.indexOf('.eq("id", insertedEnrollment.id)', returning);
    const success = source.indexOf("enrolled = true", readBack);

    expect(returning).toBeGreaterThan(-1);
    expect(readBack).toBeGreaterThan(returning);
    expect(source.indexOf('.eq("user_id", userId)', readBack)).toBeGreaterThan(readBack);
    expect(source.indexOf('.eq("course_id", course.id)', readBack)).toBeGreaterThan(readBack);
    expect(success).toBeGreaterThan(readBack);
  });

  it("rolls back only a newly created user when persistence is not confirmed", () => {
    const source = fs.readFileSync(LANDING_SELF_ENROLL_SOURCE, "utf8");
    const rollbackDefinition = source.indexOf("const rollbackCreatedUser = async () =>");
    const createdNewGuard = source.indexOf("if (!createdNew) return", rollbackDefinition);
    const deleteUser = source.indexOf("admin.auth.admin.deleteUser(userId)", createdNewGuard);
    const rollbackCalls = source.match(/await rollbackCreatedUser\(\);/g) ?? [];

    expect(rollbackDefinition).toBeGreaterThan(-1);
    expect(createdNewGuard).toBeGreaterThan(rollbackDefinition);
    expect(deleteUser).toBeGreaterThan(createdNewGuard);
    expect(rollbackCalls).toHaveLength(3);
  });
});
