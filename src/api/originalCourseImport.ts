import { supabase } from "@/integrations/supabase/client";
import { toCourseCreationError } from "@/api/courses";
import { parseOriginalCoursePackage, type OriginalCoursePackage } from "@/utils/originalCoursePackage";

export interface OriginalCourseReceipt {
  course_id: string;
  package_id: string;
  payload_sha256: string;
  is_published: false;
  module_count: number;
  lesson_count: number;
  question_count: number;
  replayed: boolean;
}
export async function createOriginalCourseDraft(organizationId: string, payload: OriginalCoursePackage): Promise<OriginalCourseReceipt> {
  const checked = parseOriginalCoursePackage(JSON.stringify(payload));
  // The migration adds this RPC; using a narrow transport type avoids changing
  // generated database types unrelated to this new entrypoint.
  const transport = supabase as unknown as { rpc(name: "import_original_course_draft_v1", args: { p_organization_id: string; p_payload: OriginalCoursePackage }): Promise<{data: OriginalCourseReceipt | null; error: unknown}> };
  const { data, error } = await transport.rpc("import_original_course_draft_v1", { p_organization_id: organizationId, p_payload: checked });
  if (error) throw toCourseCreationError(error);
  if (!data || !/^[0-9a-f-]{36}$/i.test(data.course_id) || data.package_id !== checked.package_id
    || data.is_published !== false || data.module_count !== checked.modules.length || data.lesson_count !== checked.lessons.length
    || data.question_count !== checked.lessons.reduce((n, l) => n + l.questions.length, 0)) throw toCourseCreationError(null);
  return data;
}
