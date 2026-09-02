import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COURSE_LIBRARY_HARD_DENYLIST,
  CSZ_LIBRARY_IMPORT_COURSE_HOURS,
  CSZ_LIBRARY_IMPORT_ORGANIZATION_ID,
  buildCourseLibraryImportDryRun,
  isSafeCourseLibraryStoragePath,
} from "@/lib/courseLibraryImportDryRun";

const courseId = "11111111-1111-4111-8111-111111111111";
const organizationId = CSZ_LIBRARY_IMPORT_ORGANIZATION_ID;
const moduleId = "33333333-3333-4333-8333-333333333333";

function readyManifest() {
  return {
    approval_status: "approved",
    import_ready: true,
    overall_decision: "GO",
    target_course: {
      id: courseId,
      organization_id: organizationId,
      hours: CSZ_LIBRARY_IMPORT_COURSE_HOURS,
      is_published: false,
      landing_content: {
        electronic_library: { enabled: true },
      },
    },
    do_not_modify_course_ids: [...COURSE_LIBRARY_HARD_DENYLIST],
    resources: [{
      candidate_id: "approved-external-1",
      approval_status: "APPROVED",
      import_action: "IMPORT",
      title: "Официальный документ",
      category: "legal_acts",
      description: "Действующий официальный источник.",
      source_name: "МЧС России",
      proposed_url: "https://mchs.gov.ru/document",
      storage_path: null,
      module_no: 1,
      module_id: moduleId,
      edition_label: "редакция 2026 года",
      last_checked_at: "2026-09-03",
      usage_basis: "official_open_source",
      library_status: "active",
      sort_order: 5,
      allow_download: false,
    }, {
      candidate_id: "held-resource",
      approval_status: "HOLD",
      import_action: "HOLD",
      title: "Неутверждённый ресурс",
    }],
  };
}

function buildWithApprovedTarget(
  manifest: ReturnType<typeof readyManifest>,
  approvedTargetCourseId = courseId,
) {
  return buildCourseLibraryImportDryRun(manifest, { approvedTargetCourseId });
}

describe("course library manifest dry-run importer", () => {
  it("builds a deterministic zero-I/O atomic plan only for APPROVED resources", () => {
    const report = buildWithApprovedTarget(readyManifest());

    expect(report.status).toBe("MANIFEST_VALID");
    expect(report.blockers).toEqual([]);
    expect(report.excludedResources).toEqual([{
      candidateId: "held-resource",
      reason: "not_approved",
    }]);
    expect(report.plan).toMatchObject({
      mode: "DRY_RUN_ONLY",
      targetCourseId: courseId,
      targetOrganizationId: organizationId,
      transaction: {
        atomic: true,
        isolation: "serializable",
        onAnyError: "rollback_all",
        commitAllowed: false,
      },
      execution: {
        networkCalls: 0,
        databaseWrites: 0,
        storageWrites: 0,
        productionAllowed: false,
      },
      unverifiedDatabaseFacts: [
        "target_course_exists",
        "target_course_belongs_to_csz_tenant",
        "target_course_has_178_hours",
        "target_course_is_unpublished",
        "electronic_library_flag_is_enabled",
        "module_ids_belong_to_target_course",
        "resources_are_not_already_imported",
      ],
    });
    expect(report.plan?.operations).toHaveLength(1);
    expect(report.plan?.operations[0]).toMatchObject({
      candidateId: "approved-external-1",
      document: {
        type: "external_link",
        externalUrl: "https://mchs.gov.ru/document",
        storagePath: null,
        libraryStatus: "active",
      },
      assignment: {
        courseId,
        moduleId,
        category: "legal_acts",
        sortOrder: 5,
        visibleToStudents: true,
        allowDownload: false,
      },
    });
  });

  it("never validates a target course solely from self-declared manifest facts", () => {
    const withoutIndependentTarget = buildCourseLibraryImportDryRun(readyManifest());
    expect(withoutIndependentTarget.status).toBe("BLOCKED");
    expect(withoutIndependentTarget.plan).toBeNull();
    expect(withoutIndependentTarget.blockers).toContain(
      "approved_target_course_id_missing_or_invalid",
    );

    const mismatchedTarget = buildCourseLibraryImportDryRun(readyManifest(), {
      approvedTargetCourseId: "44444444-4444-4444-8444-444444444444",
    });
    expect(mismatchedTarget.status).toBe("BLOCKED");
    expect(mismatchedTarget.plan).toBeNull();
    expect(mismatchedTarget.blockers).toContain(
      "manifest_target_course_id_does_not_match_approved_target",
    );
  });

  it("fails closed for the checked-in candidate manifest", () => {
    const candidate = JSON.parse(readFileSync(
      resolve(process.cwd(), "docs/course-library/csz-178h/candidate-manifest.json"),
      "utf8",
    )) as unknown;

    const report = buildCourseLibraryImportDryRun(candidate);

    expect(report.status).toBe("BLOCKED");
    expect(report.plan).toBeNull();
    expect(report.blockers).toEqual(expect.arrayContaining([
      "manifest_not_approved",
      "manifest_not_marked_import_ready",
      "overall_decision_not_go",
      "target_course_id_missing_or_invalid",
      "target_course_must_be_confirmed_unpublished",
      "approved_resources_missing",
    ]));
    expect(report.excludedResources).toHaveLength(28);
  });

  it.each([
    ["manifest approval", (manifest: ReturnType<typeof readyManifest>) => {
      manifest.approval_status = "not_approved";
    }, "manifest_not_approved"],
    ["GO decision", (manifest: ReturnType<typeof readyManifest>) => {
      manifest.overall_decision = "NO_GO";
    }, "overall_decision_not_go"],
    ["unpublished state", (manifest: ReturnType<typeof readyManifest>) => {
      manifest.target_course.is_published = true;
    }, "target_course_must_be_confirmed_unpublished"],
    ["feature flag", (manifest: ReturnType<typeof readyManifest>) => {
      manifest.target_course.landing_content.electronic_library.enabled = false;
    }, "target_course_electronic_library_not_enabled"],
    ["exact CSZ tenant", (manifest: ReturnType<typeof readyManifest>) => {
      manifest.target_course.organization_id = "22222222-2222-4222-8222-222222222222";
    }, "target_organization_is_not_approved_csz_tenant"],
    ["178-hour duration", (manifest: ReturnType<typeof readyManifest>) => {
      manifest.target_course.hours = 177;
    }, "target_course_hours_must_equal_178"],
    ["module id", (manifest: ReturnType<typeof readyManifest>) => {
      manifest.resources[0].module_id = null as unknown as string;
    }, "resource_1:target_module_id_missing_or_invalid"],
  ])("blocks a missing %s precondition", (_label, mutate, expected) => {
    const manifest = readyManifest();
    mutate(manifest);
    const report = buildWithApprovedTarget(manifest);
    expect(report.status).toBe("BLOCKED");
    expect(report.plan).toBeNull();
    expect(report.blockers).toContain(expected);
  });

  it("cannot unprotect the old published course by editing the manifest denylist", () => {
    const manifest = readyManifest();
    manifest.target_course.id = COURSE_LIBRARY_HARD_DENYLIST[0];
    manifest.do_not_modify_course_ids = [];

    const report = buildWithApprovedTarget(manifest, COURSE_LIBRARY_HARD_DENYLIST[0]);

    expect(report.status).toBe("BLOCKED");
    expect(report.blockers).toEqual(expect.arrayContaining([
      `hard_denylist_entry_missing:${COURSE_LIBRARY_HARD_DENYLIST[0]}`,
      "target_course_is_protected_old_course",
    ]));
  });

  it("rejects unapproved IMPORT actions and ambiguous or insecure locations", () => {
    const manifest = readyManifest();
    manifest.resources[1].import_action = "IMPORT";
    manifest.resources[0].storage_path = `library/${organizationId}/duplicate.pdf`;
    manifest.resources[0].proposed_url = "https://user:secret@example.test/document";

    const report = buildWithApprovedTarget(manifest);

    expect(report.status).toBe("BLOCKED");
    expect(report.blockers).toEqual(expect.arrayContaining([
      "resource_1:exactly_one_location_required",
      "resource_2:import_requires_approved_resource",
    ]));
  });

  it("accepts only tenant-scoped private storage paths and requires file metadata", () => {
    const manifest = readyManifest();
    manifest.resources[0] = {
      ...manifest.resources[0],
      proposed_url: null,
      storage_path: `library/${organizationId}/manual.pdf`,
      mime_type: "application/pdf",
      original_filename: "manual.pdf",
      file_size: 1024,
    } as typeof manifest.resources[0];

    expect(buildWithApprovedTarget(manifest).status).toBe("MANIFEST_VALID");
    expect(isSafeCourseLibraryStoragePath(
      `library/${organizationId}/manual.pdf`,
      organizationId,
    )).toBe(true);

    for (const unsafePath of [
      "D:/files/manual.pdf",
      `library/${organizationId}/../other/manual.pdf`,
      `library/${organizationId}/%2e%2e/other/manual.pdf`,
      "library/44444444-4444-4444-8444-444444444444/manual.pdf",
      `library\\${organizationId}\\manual.pdf`,
    ]) {
      const unsafe = structuredClone(manifest);
      unsafe.resources[0].storage_path = unsafePath;
      const report = buildWithApprovedTarget(unsafe);
      expect(report.status, unsafePath).toBe("BLOCKED");
      expect(report.blockers, unsafePath).toContain(
        "resource_1:storage_path_invalid_or_outside_organization",
      );
    }
  });

  it("blocks conflicting module-number mappings", () => {
    const manifest = readyManifest();
    manifest.resources.push({
      ...manifest.resources[0],
      candidate_id: "approved-external-2",
      proposed_url: "https://mchs.gov.ru/another-document",
      module_id: "44444444-4444-4444-8444-444444444444",
    });

    const report = buildWithApprovedTarget(manifest);

    expect(report.status).toBe("BLOCKED");
    expect(report.blockers).toContain("resource_3:module_mapping_conflict");
    expect(report.plan).toBeNull();
  });
});
