import { describe, expect, it } from "vitest";
import {
  hasOrganizationCourse,
  isSystemWelcomeCourse,
  SYSTEM_WELCOME_COURSE_KEY,
} from "@/lib/organization/firstRun";

describe("organization first-run course detection", () => {
  it("does not count the seeded welcome course as an organization course", () => {
    expect(hasOrganizationCourse([{ system_key: SYSTEM_WELCOME_COURSE_KEY }])).toBe(false);
  });

  it("counts any additional course as the organization's own course", () => {
    expect(
      hasOrganizationCourse([
        { system_key: SYSTEM_WELCOME_COURSE_KEY },
        { system_key: null },
      ]),
    ).toBe(true);
  });

  it("keeps system identity stable when the editable title changes", () => {
    expect(isSystemWelcomeCourse({ system_key: SYSTEM_WELCOME_COURSE_KEY })).toBe(true);
    expect(isSystemWelcomeCourse({ system_key: null })).toBe(false);
    expect(isSystemWelcomeCourse({})).toBe(false);
  });
});
