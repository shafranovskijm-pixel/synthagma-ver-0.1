import {
  COURSE_LIBRARY_CATEGORIES,
  COURSE_LIBRARY_USAGE_BASES,
  isStrictHttpsUrl,
  type CourseLibraryCategory,
  type CourseLibraryUsageBasis,
} from "@/lib/courseLibrary";

/**
 * The already published CSZ course is an immutable release boundary. Keeping
 * the ID in code means a manifest cannot disable the protection by omitting it
 * from `do_not_modify_course_ids`.
 */
export const COURSE_LIBRARY_HARD_DENYLIST = [
  "e3737d51-c092-4564-b2a6-4c9b86245ff4",
] as const;

/** The importer is intentionally single-tenant and single-program. */
export const CSZ_LIBRARY_IMPORT_ORGANIZATION_ID = "55c536f0-6024-4386-950e-d180a358e841";
export const CSZ_LIBRARY_IMPORT_COURSE_HOURS = 178;

export interface CourseLibraryImportExcludedResource {
  candidateId: string;
  reason: "not_approved";
}

export interface CourseLibraryImportDocumentPlan {
  candidateId: string;
  organizationId: string;
  name: string;
  type: "external_link" | "internal_file";
  description: string;
  sourceName: string;
  externalUrl: string | null;
  storagePath: string | null;
  mimeType: string | null;
  originalFilename: string | null;
  fileSize: number | null;
  editionLabel: string;
  lastCheckedAt: string;
  usageBasis: CourseLibraryUsageBasis;
  libraryStatus: "active";
}

export interface CourseLibraryImportAssignmentPlan {
  courseId: string;
  documentRef: string;
  name: string;
  description: string;
  moduleId: string | null;
  category: CourseLibraryCategory;
  sortOrder: number;
  visibleToStudents: true;
  allowDownload: boolean;
}

export interface CourseLibraryImportOperationPlan {
  candidateId: string;
  document: CourseLibraryImportDocumentPlan;
  assignment: CourseLibraryImportAssignmentPlan;
}

export interface CourseLibraryImportDryRunPlan {
  schemaVersion: 1;
  mode: "DRY_RUN_ONLY";
  targetCourseId: string;
  targetOrganizationId: string;
  transaction: {
    atomic: true;
    isolation: "serializable";
    onAnyError: "rollback_all";
    commitAllowed: false;
  };
  execution: {
    networkCalls: 0;
    databaseWrites: 0;
    storageWrites: 0;
    productionAllowed: false;
  };
  /** Must be checked against staging DB inside the future transaction. */
  unverifiedDatabaseFacts: readonly [
    "target_course_exists",
    "target_course_belongs_to_csz_tenant",
    "target_course_has_178_hours",
    "target_course_is_unpublished",
    "electronic_library_flag_is_enabled",
    "module_ids_belong_to_target_course",
    "resources_are_not_already_imported",
  ];
  operations: CourseLibraryImportOperationPlan[];
}

export interface CourseLibraryImportDryRunReport {
  status: "BLOCKED" | "MANIFEST_VALID";
  blockers: string[];
  excludedResources: CourseLibraryImportExcludedResource[];
  plan: CourseLibraryImportDryRunPlan | null;
}

export interface CourseLibraryImportDryRunOptions {
  /**
   * An explicitly approved course ID supplied by the caller, not read from the
   * manifest. This proves only approval of the identifier; it does not prove
   * any database fact about that course.
   */
  approvedTargetCourseId?: string | null;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isUuid(value: string | null): value is string {
  return value !== null
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function isIsoDate(value: string | null): value is string {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Accept only an existing private-bucket object name owned by the target
 * organisation. Local drive paths, traversal, URL syntax and encoded
 * traversal are deliberately rejected.
 */
export function isSafeCourseLibraryStoragePath(
  value: unknown,
  organizationId: string,
): value is string {
  const containsControlOrWhitespace = typeof value === "string"
    && [...value].some(character => {
      const code = character.charCodeAt(0);
      return code <= 0x20 || code === 0x7f;
    });
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || containsControlOrWhitespace
    || value.includes("\\")
    || value.includes("?")
    || value.includes("#")
    || value.startsWith("/")
    || /^[a-z]:/iu.test(value)
    || value.includes("//")
  ) {
    return false;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return false;
  }

  if (decoded.includes("\\") || decoded.startsWith("/") || /^[a-z]:/iu.test(decoded)) {
    return false;
  }

  const parts = decoded.split("/");
  if (parts.some(part => part.length === 0 || part === "." || part === "..")) {
    return false;
  }

  return parts.length >= 3
    && parts[0] === "library"
    && parts[1] === organizationId
    && parts.slice(2).join("/").length > 0;
}

function blockedReport(
  blockers: string[],
  excludedResources: CourseLibraryImportExcludedResource[],
): CourseLibraryImportDryRunReport {
  return {
    status: "BLOCKED",
    blockers: [...new Set(blockers)],
    excludedResources,
    plan: null,
  };
}

/**
 * Build an import plan without performing any I/O. There is intentionally no
 * apply/commit function in this module. An eventual executor must re-check all
 * preconditions inside one SERIALIZABLE transaction and commit only after a
 * separately approved production release.
 */
export function buildCourseLibraryImportDryRun(
  manifestValue: unknown,
  options: Readonly<CourseLibraryImportDryRunOptions> = {},
): CourseLibraryImportDryRunReport {
  const blockers: string[] = [];
  const excludedResources: CourseLibraryImportExcludedResource[] = [];
  const manifest = asRecord(manifestValue);
  if (!manifest) return blockedReport(["manifest_invalid"], excludedResources);

  if (manifest.approval_status !== "approved") blockers.push("manifest_not_approved");
  if (manifest.import_ready !== true) blockers.push("manifest_not_marked_import_ready");
  if (manifest.overall_decision !== "GO") blockers.push("overall_decision_not_go");

  const targetCourse = asRecord(manifest.target_course);
  const targetCourseId = nonEmptyString(targetCourse?.id);
  const organizationId = nonEmptyString(targetCourse?.organization_id);
  const approvedTargetCourseId = nonEmptyString(options.approvedTargetCourseId);
  if (!isUuid(targetCourseId)) blockers.push("target_course_id_missing_or_invalid");
  if (!isUuid(approvedTargetCourseId)) {
    blockers.push("approved_target_course_id_missing_or_invalid");
  } else if (targetCourseId !== approvedTargetCourseId) {
    blockers.push("manifest_target_course_id_does_not_match_approved_target");
  }
  if (!isUuid(organizationId)) blockers.push("target_organization_id_missing_or_invalid");
  if (organizationId !== CSZ_LIBRARY_IMPORT_ORGANIZATION_ID) {
    blockers.push("target_organization_is_not_approved_csz_tenant");
  }
  if (targetCourse?.hours !== CSZ_LIBRARY_IMPORT_COURSE_HOURS) {
    blockers.push("target_course_hours_must_equal_178");
  }
  if (targetCourse?.is_published !== false) {
    blockers.push("target_course_must_be_confirmed_unpublished");
  }

  const landingContent = asRecord(targetCourse?.landing_content);
  const electronicLibrary = asRecord(landingContent?.electronic_library);
  if (electronicLibrary?.enabled !== true) {
    blockers.push("target_course_electronic_library_not_enabled");
  }

  const manifestDenylist = Array.isArray(manifest.do_not_modify_course_ids)
    ? manifest.do_not_modify_course_ids
        .map(nonEmptyString)
        .filter((value): value is string => value !== null)
    : [];
  COURSE_LIBRARY_HARD_DENYLIST.forEach(id => {
    if (!manifestDenylist.includes(id)) blockers.push(`hard_denylist_entry_missing:${id}`);
  });
  if (
    targetCourseId !== null
    && (manifestDenylist.includes(targetCourseId)
      || COURSE_LIBRARY_HARD_DENYLIST.includes(
        targetCourseId as (typeof COURSE_LIBRARY_HARD_DENYLIST)[number],
      ))
  ) {
    blockers.push("target_course_is_protected_old_course");
  }

  if (!Array.isArray(manifest.resources) || manifest.resources.length === 0) {
    blockers.push("resources_missing");
    return blockedReport(blockers, excludedResources);
  }

  const candidateIds = new Set<string>();
  const moduleNumberToId = new Map<number, string>();
  const moduleIdToNumber = new Map<string, number>();
  const operations: CourseLibraryImportOperationPlan[] = [];

  manifest.resources.forEach((resourceValue, index) => {
    const prefix = `resource_${index + 1}`;
    const resource = asRecord(resourceValue);
    if (!resource) {
      blockers.push(`${prefix}:invalid`);
      return;
    }

    const candidateId = nonEmptyString(resource.candidate_id);
    if (!candidateId) blockers.push(`${prefix}:candidate_id_missing`);
    if (candidateId && candidateIds.has(candidateId)) {
      blockers.push(`${prefix}:candidate_id_duplicate`);
    }
    if (candidateId) candidateIds.add(candidateId);

    const resourceApproval = resource.approval_status;
    const importAction = resource.import_action;
    if (resourceApproval !== "APPROVED") {
      if (importAction === "IMPORT") blockers.push(`${prefix}:import_requires_approved_resource`);
      excludedResources.push({
        candidateId: candidateId ?? `${prefix}:unknown`,
        reason: "not_approved",
      });
      return;
    }
    if (importAction !== "IMPORT") {
      blockers.push(`${prefix}:approved_resource_must_have_import_action`);
    }

    const title = nonEmptyString(resource.title);
    const description = nonEmptyString(resource.description);
    const sourceName = nonEmptyString(resource.source_name);
    const editionLabel = nonEmptyString(resource.edition_label);
    const lastCheckedAt = nonEmptyString(resource.last_checked_at);
    const category = resource.category;
    const usageBasis = resource.usage_basis;
    if (!title) blockers.push(`${prefix}:title_missing`);
    if (!description) blockers.push(`${prefix}:description_missing`);
    if (!sourceName) blockers.push(`${prefix}:source_name_missing`);
    if (!editionLabel) blockers.push(`${prefix}:edition_missing`);
    if (!isIsoDate(lastCheckedAt)) blockers.push(`${prefix}:last_check_invalid`);
    if (!COURSE_LIBRARY_CATEGORIES.includes(category as CourseLibraryCategory)) {
      blockers.push(`${prefix}:category_invalid`);
    }
    if (!COURSE_LIBRARY_USAGE_BASES.includes(usageBasis as CourseLibraryUsageBasis)) {
      blockers.push(`${prefix}:usage_basis_missing_or_invalid`);
    }
    if (resource.library_status !== "active") blockers.push(`${prefix}:status_not_active`);

    const externalUrl = nonEmptyString(resource.proposed_url);
    const storagePath = nonEmptyString(resource.storage_path);
    if ((externalUrl === null) === (storagePath === null)) {
      blockers.push(`${prefix}:exactly_one_location_required`);
    } else if (externalUrl !== null && !isStrictHttpsUrl(externalUrl)) {
      blockers.push(`${prefix}:external_url_invalid`);
    } else if (
      storagePath !== null
      && (!organizationId || !isSafeCourseLibraryStoragePath(storagePath, organizationId))
    ) {
      blockers.push(`${prefix}:storage_path_invalid_or_outside_organization`);
    }

    const moduleNo = resource.module_no;
    const moduleId = nonEmptyString(resource.module_id);
    if (moduleNo !== null && moduleNo !== undefined) {
      if (!Number.isSafeInteger(moduleNo) || Number(moduleNo) <= 0) {
        blockers.push(`${prefix}:module_no_invalid`);
      }
      if (!isUuid(moduleId)) blockers.push(`${prefix}:target_module_id_missing_or_invalid`);
      if (Number.isSafeInteger(moduleNo) && moduleId) {
        const normalizedModuleNo = Number(moduleNo);
        const knownId = moduleNumberToId.get(normalizedModuleNo);
        const knownNumber = moduleIdToNumber.get(moduleId);
        if (knownId && knownId !== moduleId) blockers.push(`${prefix}:module_mapping_conflict`);
        if (knownNumber && knownNumber !== normalizedModuleNo) {
          blockers.push(`${prefix}:module_mapping_conflict`);
        }
        moduleNumberToId.set(normalizedModuleNo, moduleId);
        moduleIdToNumber.set(moduleId, normalizedModuleNo);
      }
    } else if (moduleId !== null) {
      blockers.push(`${prefix}:module_id_without_module_no`);
    }

    const sortOrder = resource.sort_order ?? index;
    if (!Number.isSafeInteger(sortOrder) || Number(sortOrder) < 0) {
      blockers.push(`${prefix}:sort_order_invalid`);
    }
    const allowDownload = resource.allow_download ?? true;
    if (typeof allowDownload !== "boolean") blockers.push(`${prefix}:allow_download_invalid`);

    let mimeType: string | null = null;
    let originalFilename: string | null = null;
    let fileSize: number | null = null;
    if (storagePath !== null) {
      mimeType = nonEmptyString(resource.mime_type);
      originalFilename = nonEmptyString(resource.original_filename);
      fileSize = typeof resource.file_size === "number" ? resource.file_size : null;
      if (!mimeType) blockers.push(`${prefix}:mime_type_missing`);
      if (!originalFilename) blockers.push(`${prefix}:original_filename_missing`);
      if (!Number.isSafeInteger(fileSize) || Number(fileSize) < 0) {
        blockers.push(`${prefix}:file_size_invalid`);
      }
    }

    if (
      candidateId
      && title
      && description
      && sourceName
      && editionLabel
      && isIsoDate(lastCheckedAt)
      && COURSE_LIBRARY_CATEGORIES.includes(category as CourseLibraryCategory)
      && COURSE_LIBRARY_USAGE_BASES.includes(usageBasis as CourseLibraryUsageBasis)
      && (externalUrl !== null || storagePath !== null)
      && targetCourseId
      && organizationId
    ) {
      operations.push({
        candidateId,
        document: {
          candidateId,
          organizationId,
          name: title,
          type: storagePath === null ? "external_link" : "internal_file",
          description,
          sourceName,
          externalUrl,
          storagePath,
          mimeType,
          originalFilename,
          fileSize,
          editionLabel,
          lastCheckedAt,
          usageBasis: usageBasis as CourseLibraryUsageBasis,
          libraryStatus: "active",
        },
        assignment: {
          courseId: targetCourseId,
          documentRef: `candidate:${candidateId}`,
          name: title,
          description,
          moduleId,
          category: category as CourseLibraryCategory,
          sortOrder: Number(sortOrder),
          visibleToStudents: true,
          allowDownload: allowDownload as boolean,
        },
      });
    }
  });

  if (operations.length === 0) blockers.push("approved_resources_missing");
  if (blockers.length > 0 || !targetCourseId || !organizationId) {
    return blockedReport(blockers, excludedResources);
  }

  operations.sort((left, right) => (
    left.assignment.sortOrder - right.assignment.sortOrder
    || left.candidateId.localeCompare(right.candidateId, "en")
  ));

  return {
    status: "MANIFEST_VALID",
    blockers: [],
    excludedResources,
    plan: {
      schemaVersion: 1,
      mode: "DRY_RUN_ONLY",
      targetCourseId,
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
      operations,
    },
  };
}
