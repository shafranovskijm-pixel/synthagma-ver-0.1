import { supabase } from "@/integrations/supabase/client";
import { CourseCreationError, toCourseCreationError } from "@/api/courses";

interface CreateImportedCourseHeaderInput {
  organizationId: string;
  title: string;
  description?: string | null;
}

/**
 * Creates an imported course header through the atomic server-side gate.
 * The RPC rechecks courses.write and the effective tariff/custom limit in the
 * same transaction as INSERT, so two import tabs cannot both pass a stale
 * client-side count.
 */
export async function createImportedCourseHeader({
  organizationId,
  title,
  description,
}: CreateImportedCourseHeaderInput): Promise<string> {
  const normalizedOrganizationId = organizationId.trim();
  const normalizedTitle = title.trim();

  if (!normalizedOrganizationId || !normalizedTitle) {
    throw new CourseCreationError("invalid_input", "Заполните название курса и повторите попытку");
  }

  const { data, error } = await supabase.rpc("create_imported_course", {
    p_organization_id: normalizedOrganizationId,
    p_title: normalizedTitle,
    p_description: description?.trim() || null,
  });

  if (error) throw toCourseCreationError(error);
  if (typeof data !== "string" || !data) throw toCourseCreationError(null);

  return data;
}
