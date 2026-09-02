import {
  COURSE_LIBRARY_CATEGORIES,
  COURSE_LIBRARY_STATUSES,
  COURSE_LIBRARY_USAGE_BASES,
  isStrictHttpsUrl,
  type CourseLibraryCategory,
  type CourseLibraryStatus,
  type CourseLibraryUsageBasis,
} from "@/lib/courseLibrary";

export interface CourseLibraryImportResource {
  candidate_id: string;
  title: string;
  category: CourseLibraryCategory;
  description: string;
  source_name: string;
  proposed_url?: string | null;
  storage_path?: string | null;
  module_no?: number | null;
  module_id?: string | null;
  edition_label: string;
  last_checked_at: string;
  usage_basis: CourseLibraryUsageBasis | null;
  library_status: CourseLibraryStatus;
  import_action: "IMPORT" | "HOLD" | string;
}

export interface CourseLibraryImportManifest {
  approval_status: "approved" | "not_approved" | string;
  import_ready: boolean;
  target_course: {
    id: string | null;
    organization_id: string | null;
    is_published: boolean | null;
  };
  do_not_modify_course_ids: string[];
  resources: CourseLibraryImportResource[];
}

export function validateCourseLibraryImportManifest(
  manifest: CourseLibraryImportManifest,
): string[] {
  const blockers: string[] = [];
  if (manifest.approval_status !== "approved") blockers.push("manifest_not_approved");
  if (manifest.import_ready !== true) blockers.push("manifest_not_marked_import_ready");
  if (!manifest.target_course?.id) blockers.push("target_course_id_missing");
  if (!manifest.target_course?.organization_id) blockers.push("target_organization_id_missing");
  if (manifest.target_course?.is_published !== false) blockers.push("target_course_must_be_confirmed_unpublished");
  if (
    manifest.target_course?.id
    && manifest.do_not_modify_course_ids.includes(manifest.target_course.id)
  ) {
    blockers.push("target_course_is_protected_old_course");
  }
  if (!Array.isArray(manifest.resources) || manifest.resources.length === 0) {
    blockers.push("resources_missing");
    return blockers;
  }

  const ids = new Set<string>();
  manifest.resources.forEach((resource, index) => {
    const prefix = `resource_${index + 1}`;
    if (!resource.candidate_id?.trim()) blockers.push(`${prefix}:candidate_id_missing`);
    if (ids.has(resource.candidate_id)) blockers.push(`${prefix}:candidate_id_duplicate`);
    ids.add(resource.candidate_id);
    if (!resource.title?.trim()) blockers.push(`${prefix}:title_missing`);
    if (!resource.description?.trim()) blockers.push(`${prefix}:description_missing`);
    if (!resource.source_name?.trim()) blockers.push(`${prefix}:source_name_missing`);
    if (!COURSE_LIBRARY_CATEGORIES.includes(resource.category)) blockers.push(`${prefix}:category_invalid`);
    if (!COURSE_LIBRARY_STATUSES.includes(resource.library_status)) blockers.push(`${prefix}:status_invalid`);
    if (resource.library_status !== "active") blockers.push(`${prefix}:status_not_active`);
    if (resource.import_action !== "IMPORT") blockers.push(`${prefix}:import_action_not_import`);
    if (!resource.usage_basis || !COURSE_LIBRARY_USAGE_BASES.includes(resource.usage_basis)) {
      blockers.push(`${prefix}:usage_basis_missing_or_invalid`);
    }
    if (!resource.edition_label?.trim()) blockers.push(`${prefix}:edition_missing`);
    if (!resource.last_checked_at?.trim()) blockers.push(`${prefix}:last_check_missing`);
    if (resource.module_no != null && !resource.module_id?.trim()) {
      blockers.push(`${prefix}:target_module_id_missing`);
    }

    const url = resource.proposed_url?.trim() || null;
    const storagePath = resource.storage_path?.trim() || null;
    if ((url === null) === (storagePath === null)) {
      blockers.push(`${prefix}:exactly_one_location_required`);
    } else if (url && !isStrictHttpsUrl(url)) {
      blockers.push(`${prefix}:external_url_invalid`);
    }
  });

  return blockers;
}

export function assertCourseLibraryImportManifest(
  manifest: CourseLibraryImportManifest,
): void {
  const blockers = validateCourseLibraryImportManifest(manifest);
  if (blockers.length > 0) {
    throw new Error(`Course library import blocked: ${blockers.join(", ")}`);
  }
}
