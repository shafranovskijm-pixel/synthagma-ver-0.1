import { describe, expect, it } from "vitest";
import { hasStudentRegistrationDetails, normalizeBirthDate, normalizeStudentRegistrationDetails, resolveRegistrationProfile } from "./student-registration-details";

describe("staff registration details", () => {
  it("omits blanks and false without instructions to erase saved data", () => {
    const details = normalizeStudentRegistrationDetails({ department: "  ", job_position: "  ", snils: null, birth_date: "", confirm_identity: false });
    expect(details).toEqual({});
    expect(hasStudentRegistrationDetails(details)).toBe(false);
  });
  it("preserves leading zeros and normalizes the display format", () => {
    expect(normalizeStudentRegistrationDetails({ department: " Участок 2 ", snils: "00100199832", birth_date: "15.06.1990", confirm_identity: true })).toEqual({
      department: "Участок 2", snils: "001-001-998 32", birth_date: "1990-06-15", confirm_identity: true,
    });
  });
  it("recognizes a current job position as a staff-only detail", () => {
    const details = normalizeStudentRegistrationDetails({ job_position: " Водитель ", qualification: "Квалификация после обучения" });
    expect(details).toEqual({ job_position: "Водитель" });
    expect(hasStudentRegistrationDetails(details)).toBe(true);
  });
  it.each([123, "x".repeat(201), "Водитель\nМеханик"])("rejects an invalid job position %j", (job_position) => {
    expect(() => normalizeStudentRegistrationDetails({ job_position })).toThrow("Должность");
  });
  it.each(["да", "true", 1, {}, []])("refuses implicit approval %j", (confirm_identity) => {
    expect(() => normalizeStudentRegistrationDetails({ confirm_identity })).toThrow("явной отметкой");
  });
  it.each(["31.02.2020", "2021-02-29", "2100-01-01", "01/02/1990", "0000-01-01"])("rejects invalid dates %s", (value) => {
    expect(() => normalizeBirthDate(value, new Date("2026-09-29"))).toThrow();
  });
  it("accepts a real leap day", () => expect(normalizeBirthDate("29.02.2000")).toBe("2000-02-29"));
  it.each([1234567890, "1234567890", "001001998ab", "1e10"])("does not guess lost SNILS digits %j", (snils) => {
    expect(() => normalizeStudentRegistrationDetails({ snils })).toThrow("СНИЛС");
  });
  it("rejects oversized and multiline department", () => {
    expect(() => normalizeStudentRegistrationDetails({ department: "x".repeat(201) })).toThrow();
    expect(() => normalizeStudentRegistrationDetails({ department: "a\nb" })).toThrow();
  });
  it("resolves a repeated email-less import by exact login without changing the identity", () => {
    const profile = { user_id: "user-1", login: "Sgt104910", email: null };
    expect(resolveRegistrationProfile([profile], "", "Sgt104910")).toEqual(profile);
    expect(resolveRegistrationProfile([profile, profile], "", "Sgt104910")).toEqual(profile);
  });
  it("rejects mismatched email/login identities", () => {
    const profile = { user_id: "user-1", login: "one", email: "one@example.test" };
    expect(() => resolveRegistrationProfile([profile, { ...profile, user_id: "user-2" }], "", "one")).toThrow();
    expect(() => resolveRegistrationProfile([profile], "two@example.test", "one")).toThrow();
    expect(() => resolveRegistrationProfile([profile], "one@example.test", "two")).toThrow();
  });
});
