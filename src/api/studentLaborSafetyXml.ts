import {captureIssuanceScope,issuanceScopeCurrent} from '@/lib/educationIssuance/client';
import {readActiveIssuanceSources,activeSourceMessages} from '@/lib/educationIssuance/activeSources';
import { supabase } from "@/integrations/supabase/client";
import type { StudentEnrollment } from "@/types/student";
import {
  isOccupationalSafetyCategory,
  type StudentLaborSafetyCourse,
} from "@/lib/laborSafetyXml";

export interface StudentLaborSafetyXmlContext {
  company: { name: string; inn: string | null } | null;
  courses: StudentLaborSafetyCourse[];
}

interface FetchStudentLaborSafetyXmlContextInput {
  organizationId: string;
  userId: string;
  companyId?: string | null;
  enrollments: StudentEnrollment[];
}

type StudentLaborSafetyXmlClient = Pick<typeof supabase, "from">;

/**
 * Loads only stored, tenant-scoped metadata required by the organization-side
 * XML draft. Enrollments themselves have already been confirmed by the
 * organization-scoped student RPC before this function is called.
 */
export async function fetchStudentLaborSafetyXmlContext(
  input: FetchStudentLaborSafetyXmlContextInput,
  client: StudentLaborSafetyXmlClient = supabase,
): Promise<StudentLaborSafetyXmlContext> {
  if (!input.organizationId || !input.userId) {
    throw new Error("Не указан контекст организации или ученика");
  }

  const scope=captureIssuanceScope(input.organizationId,{kind:'organization'},()=>true);
  const completedEnrollments = input.enrollments.filter(enrollment => (
    enrollment.status === "completed" && Boolean(enrollment.completed_at)
  ));

  let company: StudentLaborSafetyXmlContext["company"] = null;
  if (input.companyId) {
    const { data, error } = await client
      .from("companies")
      .select("id, name, inn")
      .eq("organization_id", input.organizationId)
      .eq("id", input.companyId)
      .maybeSingle();
    if (error) throw error;
    company = data ? { name: data.name, inn: data.inn ?? null } : null;
  }

  if (completedEnrollments.length === 0) {if(!issuanceScopeCurrent(scope))throw new Error('Доступ изменился. Повторите проверку.');return { company, courses: [] };}

  const courseIds = Array.from(new Set(completedEnrollments.map(enrollment => enrollment.course_id)));
  const { data: courseRows, error: coursesError } = await client
    .from("courses")
    .select("id, title, category_id")
    .eq("organization_id", input.organizationId)
    .in("id", courseIds);
  if (coursesError) throw coursesError;

  const coursesById = new Map<string, { id: string; title: string; category_id: string | null }>(
    (courseRows ?? []).map(row => [row.id, row]),
  );
  if (coursesById.size !== courseIds.length) {
    throw new Error("Не удалось подтвердить категории всех завершённых курсов ученика");
  }

  const categoryIds = Array.from(new Set(
    (courseRows ?? []).map(course => course.category_id).filter(Boolean),
  )) as string[];
  const categoriesById = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: categoryRows, error: categoriesError } = await client
      .from("course_categories")
      .select("id, name")
      .eq("organization_id", input.organizationId)
      .in("id", categoryIds);
    if (categoriesError) throw categoriesError;
    for (const category of categoryRows ?? []) categoriesById.set(category.id, category.name);
    if (categoriesById.size !== categoryIds.length) {
      throw new Error("Не удалось подтвердить названия всех категорий завершённых курсов");
    }
  }

  const eligibleEnrollments = completedEnrollments.filter(enrollment => {
    const course = coursesById.get(enrollment.course_id);
    if (!course?.category_id) return false;
    return isOccupationalSafetyCategory(categoriesById.get(course.category_id));
  });

  const documentsByEnrollmentId = new Map<string, {
    recordId: string;
    protocolNumber: string | null;
  }>();
  if (eligibleEnrollments.length > 0) {
    const sources=await readActiveIssuanceSources(scope,eligibleEnrollments.map(row=>({enrollmentId:row.id,courseId:row.course_id,userId:input.userId})));
    for(const enrollment of eligibleEnrollments){
      const source=sources.get(enrollment.id);
      if(!source||source.kind!=='confirmed')throw new Error('Источник протокола не подтверждён: '+(source?.kind==='unavailable'?activeSourceMessages[source.reason]:'нет доступной записи')+'. Проверьте журнал документов; XML не подготовлен.');
      documentsByEnrollmentId.set(enrollment.id,{recordId:source.record.official.id,protocolNumber:source.record.official.protocol_number?.trim()||null});
    }
  }
  if(!issuanceScopeCurrent(scope))throw new Error('Доступ изменился. Повторите проверку.');
  return {
    company,
    courses: eligibleEnrollments.map(enrollment => {
      const course = coursesById.get(enrollment.course_id)!;
      const educationDocument = documentsByEnrollmentId.get(enrollment.id);
      return {
        enrollmentId: enrollment.id,
        educationDocumentRecordId: educationDocument?.recordId ?? null,
        courseId: course.id,
        courseTitle: course.title,
        categoryName: course.category_id ? categoriesById.get(course.category_id) ?? null : null,
        status: enrollment.status,
        completedAt: enrollment.completed_at ?? null,
        protocolNumber: educationDocument?.protocolNumber ?? null,
      };
    }),
  };
}
