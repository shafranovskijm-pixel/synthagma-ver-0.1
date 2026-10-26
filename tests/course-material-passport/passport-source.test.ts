import { describe, expect, it, vi } from "vitest";
import fixtureJson from "./fixtures/materialSource.json?raw";
import {
  courseMaterialPassports, findCourseMaterialPassport, isPlatformPassportCourse,
  parsePassportCatalog, sha256ExactUtf8, verifyPassportSource, verifyPlatformCourseOwnership,
} from "../../src/lib/courseMaterialPassport";

const source = JSON.parse(fixtureJson);
const passport = findCourseMaterialPassport(source.course_id)!;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

describe("exact source-derived material passports", () => {
  it("has fifty unique source-bound passports with consistent plans and explicit unknown decisions", () => {
    expect(courseMaterialPassports).toHaveLength(50);
    expect(new Set(courseMaterialPassports.map(row => row.courseId)).size).toBe(50);
    expect(new Set(courseMaterialPassports.map(row => row.source.lessonId)).size).toBe(50);
    for (const row of courseMaterialPassports) {
      expect(isPlatformPassportCourse(row.courseId)).toBe(true);
      expect(row.source.courseId).toBe(row.courseId);
      expect(row.sourceDeclared.studyPlan.rows.reduce((sum, item) => sum + item.hours.total, 0)).toBe(row.sourceDeclared.academicHours);
      expect(row.assessment.status).toBe("UNKNOWN");
      expect(row.unknown).toEqual({ document: null, author: null, rights: null, methodist: null, factsApproval: null });
    }
  });
  it("rejects missing outcomes, duplicate identities and inconsistent plan arithmetic without partial data", () => {
    const missing = copy(passport); missing.sourceDeclared.outcomes = [];
    expect(parsePassportCatalog({ schemaVersion: 1, courses: [passport, missing] })).toBeNull();
    expect(parsePassportCatalog({ schemaVersion: 1, courses: [passport, passport] })).toBeNull();
    const badPlan = copy(passport); badPlan.sourceDeclared.studyPlan.rows[0].hours.total += 1;
    expect(parsePassportCatalog({ schemaVersion: 1, courses: [badPlan] })).toBeNull();
  });
  it("hashes exact UTF-8 content without trimming or serializing HTML", async () => {
    expect(await sha256ExactUtf8(source.content)).toBe(passport.source.contentSha256);
    expect(await sha256ExactUtf8(source.content + "\n")).not.toBe(passport.source.contentSha256);
    expect(await sha256ExactUtf8("ё")).not.toBe(await sha256ExactUtf8("е"));
  });
  it("verifies the exact course, lesson and content from the source read", async () => {
    await expect(verifyPassportSource(passport, source.course_id, source)).resolves.toEqual({ status: "verified" });
  });
  it("fails closed for wrong course or lesson, missing source and read errors", async () => {
    const other = courseMaterialPassports.find(row => row.courseId !== passport.courseId)!;
    for (const row of [null, { ...source, course_id: other.courseId }, { ...source, id: other.source.lessonId }, { ...source, content: null }]) {
      await expect(verifyPassportSource(passport, source.course_id, row)).resolves.toEqual({ status: "unconfirmed" });
    }
    await expect(verifyPassportSource(passport, other.courseId, source)).resolves.toEqual({ status: "unconfirmed" });
    await expect(verifyPassportSource(passport, source.course_id, source, { message: "SYNTHETIC_RLS_FAILURE" })).resolves.toEqual({ status: "unconfirmed" });
  });
  it("fails closed for changed HTML and unavailable hashing", async () => {
    await expect(verifyPassportSource(passport, source.course_id, { ...source, content: source.content + " " })).resolves.toEqual({ status: "unconfirmed" });
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest").mockRejectedValueOnce(new Error("SYNTHETIC_HASH_FAILURE"));
    await expect(verifyPassportSource(passport, source.course_id, source)).resolves.toEqual({ status: "unconfirmed" });
    digest.mockRestore();
  });
  it("never assigns a platform passport to a customer copy or unknown exact course ID", () => {
    const customerId = "10000000-0000-4000-8000-000000000099";
    expect(isPlatformPassportCourse(customerId)).toBe(false);
    expect(findCourseMaterialPassport(customerId)).toBeNull();
  });
  it("requires current exact course ownership even for an ID in the frozen platform list", () => {
    const row = { id: passport.courseId, organization_id: "4ac2c05a-d8b5-4e72-ba31-f2c743091d95" };
    expect(verifyPlatformCourseOwnership(passport.courseId, row)).toBe(true);
    expect(verifyPlatformCourseOwnership(passport.courseId, { ...row, organization_id: "10000000-0000-4000-8000-000000000099" })).toBe(false);
    expect(verifyPlatformCourseOwnership(passport.courseId, { ...row, id: "10000000-0000-4000-8000-000000000098" })).toBe(false);
    expect(verifyPlatformCourseOwnership(passport.courseId, null)).toBe(false);
    expect(verifyPlatformCourseOwnership(passport.courseId, row, { message: "SYNTHETIC_RLS_FAILURE" })).toBe(false);
  });
});
