import { describe, expect, it } from "vitest";
import {
  assertCourseLibraryImportManifest,
  validateCourseLibraryImportManifest,
  type CourseLibraryImportManifest,
} from "@/lib/courseLibraryManifest";

const readyManifest: CourseLibraryImportManifest = {
  approval_status: "approved",
  import_ready: true,
  target_course: {
    id: "new-course-178",
    organization_id: "csz-organization",
    is_published: false,
    landing_content: {
      electronic_library: {
        enabled: true,
      },
    },
  },
  do_not_modify_course_ids: ["old-course-36"],
  resources: [{
    candidate_id: "official-1",
    title: "Официальный документ",
    category: "legal_acts",
    description: "Действующий официальный источник.",
    source_name: "МЧС России",
    proposed_url: "https://mchs.gov.ru/document",
    module_no: null,
    module_id: null,
    edition_label: "редакция 2026 года",
    last_checked_at: "2026-09-03",
    usage_basis: "official_open_source",
    library_status: "active",
    import_action: "IMPORT",
  }],
};

describe("course library import gate", () => {
  it("accepts only an approved manifest for a confirmed unpublished new course", () => {
    expect(validateCourseLibraryImportManifest(readyManifest)).toEqual([]);
    expect(() => assertCourseLibraryImportManifest(readyManifest)).not.toThrow();
  });

  it("fails closed for the current unapproved candidate without a target course", () => {
    const candidate: CourseLibraryImportManifest = {
      ...readyManifest,
      approval_status: "not_approved",
      import_ready: false,
      target_course: {
        id: null,
        organization_id: "csz-organization",
        is_published: null,
      },
      resources: [{
        ...readyManifest.resources[0],
        proposed_url: null,
        usage_basis: null,
        library_status: "needs_review",
        import_action: "HOLD",
      }],
    };

    const blockers = validateCourseLibraryImportManifest(candidate);
    expect(blockers).toEqual(expect.arrayContaining([
      "manifest_not_approved",
      "manifest_not_marked_import_ready",
      "target_course_id_missing",
      "target_course_must_be_confirmed_unpublished",
      "resource_1:status_not_active",
      "resource_1:import_action_not_import",
      "resource_1:usage_basis_missing_or_invalid",
      "resource_1:exactly_one_location_required",
    ]));
    expect(() => assertCourseLibraryImportManifest(candidate)).toThrow(
      /Course library import blocked/,
    );
  });

  it("protects the old published course and requires resolved module ids", () => {
    const blockers = validateCourseLibraryImportManifest({
      ...readyManifest,
      target_course: {
        id: "old-course-36",
        organization_id: "csz-organization",
        is_published: true,
      },
      resources: [{
        ...readyManifest.resources[0],
        module_no: 3,
        module_id: null,
      }],
    });

    expect(blockers).toContain("target_course_is_protected_old_course");
    expect(blockers).toContain("target_course_must_be_confirmed_unpublished");
    expect(blockers).toContain("resource_1:target_module_id_missing");
  });

  it("fails closed when the target course does not explicitly enable the library", () => {
    const blockers = validateCourseLibraryImportManifest({
      ...readyManifest,
      target_course: {
        ...readyManifest.target_course,
        landing_content: {},
      },
    });

    expect(blockers).toContain("target_course_electronic_library_not_enabled");
  });
});
