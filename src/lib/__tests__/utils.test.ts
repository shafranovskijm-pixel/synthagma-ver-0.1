import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cn, getCourseDetailsPath, getAdminAwareBackPath } from "@/lib/utils";

describe("cn utility", () => {
  it("merges class names", () => {
    const result = cn("px-4", "py-2");
    expect(result).toBe("px-4 py-2");
  });

  it("handles conditional classes", () => {
    const result = cn("base", false && "hidden", "visible");
    expect(result).toBe("base visible");
  });

  it("resolves tailwind conflicts", () => {
    const result = cn("px-4", "px-6");
    expect(result).toBe("px-6");
  });

  it("handles empty input", () => {
    const result = cn();
    expect(result).toBe("");
  });

  it("handles undefined and null", () => {
    const result = cn("base", undefined, null, "end");
    expect(result).toBe("base end");
  });
});

describe("getCourseDetailsPath", () => {
  const COURSE_ID = "5deec6c9-5948-49b5-9470-a0ac3fa1e3af";

  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("returns /organization route for a regular organization user", () => {
    expect(getCourseDetailsPath("123")).toBe("/organization?tab=course-details&courseId=123");
  });

  it("stays on /organization even in adminViewAsOrg mode", () => {
    localStorage.setItem("adminViewAsOrg", "some-org-id");
    expect(getCourseDetailsPath(COURSE_ID)).toBe(
      `/organization?tab=course-details&courseId=${COURSE_ID}`,
    );
  });
});

describe("getAdminAwareBackPath", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("returns default /organization when not impersonating", () => {
    expect(getAdminAwareBackPath()).toBe("/organization");
  });

  it("returns /admin when adminViewAsOrg is active (exit route)", () => {
    localStorage.setItem("adminViewAsOrg", "some-org-id");
    expect(getAdminAwareBackPath()).toBe("/admin");
  });

  it("honors custom default when not impersonating", () => {
    expect(getAdminAwareBackPath("/somewhere")).toBe("/somewhere");
  });
});
