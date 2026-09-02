import { CourseCreationError, toCourseCreationError } from "@/api/courses";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  type StructuredCourseDraftPayload,
  validateCszStructuredCoursePayload,
} from "@/utils/structuredCourseImport";

export interface StructuredCourseImportResult {
  course_id: string;
  is_published: false;
  module_count: 11;
  lesson_count: 46;
  question_count: 67;
  document_count: number;
}

interface CreateStructuredCourseDraftInput {
  organizationId: string;
  title: string;
  payload: StructuredCourseDraftPayload;
}

/**
 * Persists the complete CSZ course through one PostgreSQL function call. The
 * function creates the course, modules, lessons, questions and documents in a
 * single transaction, so any failed validation/insert rolls everything back.
 */
export async function createStructuredCourseDraft({
  organizationId,
  title,
  payload,
}: CreateStructuredCourseDraftInput): Promise<StructuredCourseImportResult> {
  const normalizedOrganizationId = organizationId.trim();
  const normalizedTitle = title.trim();
  if (!normalizedOrganizationId || !normalizedTitle) {
    throw new CourseCreationError("invalid_input", "Заполните название курса и повторите попытку");
  }

  const normalizedPayload: StructuredCourseDraftPayload = {
    ...payload,
    title: normalizedTitle,
  };
  validateCszStructuredCoursePayload(normalizedPayload);

  const { data, error } = await supabase.rpc("import_csz_course_draft_v1", {
    p_organization_id: normalizedOrganizationId,
    p_payload: normalizedPayload as unknown as Json,
  });
  if (error) throw toCourseCreationError(error);

  const result = data as unknown as Partial<StructuredCourseImportResult> | null;
  if (
    !result
    || typeof result.course_id !== "string"
    || result.is_published !== false
    || result.module_count !== 11
    || result.lesson_count !== 46
    || result.question_count !== 67
    || result.document_count !== normalizedPayload.documents.length
  ) {
    throw toCourseCreationError(null);
  }

  return result as StructuredCourseImportResult;
}
