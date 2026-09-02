import { describe, expect, it } from "vitest";

import {
  isCourseElectronicLibraryEnabled,
  resolveCourseElectronicLibraryView,
} from "@/lib/courseLibrary";

describe("course electronic library feature gate", () => {
  it.each([
    null,
    undefined,
    {},
    [],
    { electronic_library: null },
    { electronic_library: {} },
    { electronic_library: { enabled: false } },
    { electronic_library: { enabled: "true" } },
    { electronic_library: true },
  ])("is disabled by default for existing or malformed course settings", (landingContent) => {
    expect(isCourseElectronicLibraryEnabled(landingContent)).toBe(false);
  });

  it("is enabled only by the explicit course-local boolean flag", () => {
    expect(isCourseElectronicLibraryEnabled({
      electronic_library: { enabled: true },
    })).toBe(true);
  });

  it("rejects and clears a direct library view for an existing course", () => {
    expect(resolveCourseElectronicLibraryView({}, "library")).toEqual({
      enabled: false,
      requested: true,
      open: false,
      shouldClearRequestedView: true,
    });
  });

  it("opens a direct library view only for an explicitly enabled course", () => {
    expect(resolveCourseElectronicLibraryView(
      { electronic_library: { enabled: true } },
      "library",
    )).toEqual({
      enabled: true,
      requested: true,
      open: true,
      shouldClearRequestedView: false,
    });
  });
});
