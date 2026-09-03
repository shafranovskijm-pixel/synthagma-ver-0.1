import { supabase } from "@/integrations/supabase/client";
import type { StudentEnrollment } from "@/types/student";
import {
  isOccupationalSafetyCategory,
  type StudentLaborSafetyCourse,
} from "@/lib/laborSafetyXml";
import {
  fetchStudentLaborSafetyProtocols,
  isLaborSafetyProtocolStorageUnavailable,
} from "@/api/studentLaborSafetyProtocol";
import type { LaborSafetyEnrollmentProtocol } from "@/types/laborSafetyProtocol";

export interface StudentLaborSafetyXmlContext {
  company: { name: string; inn: string | null } | null;
  courses: StudentLaborSafetyCourse[];
  protocolStorageAvailable: boolean;
  legacyProtocolLookupFailed: boolean;
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

  if (completedEnrollments.length === 0) {
    return { company, courses: [], protocolStorageAvailable: true, legacyProtocolLookupFailed: false };
  }

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
  let protocolStorageAvailable = true;
  let legacyProtocolLookupFailed = false;
  const protocolsByEnrollmentId = new Map<string, LaborSafetyEnrollmentProtocol>();
  if (eligibleEnrollments.length > 0) {
    const enrollmentIds = eligibleEnrollments.map(enrollment => enrollment.id);
    try {
      const protocols = await fetchStudentLaborSafetyProtocols({
        organizationId: input.organizationId,
        enrollmentIds,
      }, client);
      for (const protocol of protocols) {
        const enrollment = eligibleEnrollments.find(item => item.id === protocol.source_enrollment_id);
        if (protocol.source_user_id !== input.userId || protocol.source_course_id !== enrollment?.course_id) {
          throw new Error("Источник протокола не совпал с учеником и курсом. Требуется проверка данных");
        }
        protocolsByEnrollmentId.set(protocol.source_enrollment_id, protocol);
      }
    } catch (error) {
      if (!isLaborSafetyProtocolStorageUnavailable(error)) throw error;
      // Deploy order is backend first. An older database still supports a
      // clearly incomplete draft; it must never pretend that saving succeeded.
      protocolStorageAvailable = false;
    }
    const legacyEnrollmentIds = enrollmentIds.filter(id => !protocolsByEnrollmentId.has(id));
    if (legacyEnrollmentIds.length > 0) {
      const { data: protocolRows, error: protocolsError } = await client
        .from("education_document_records")
        .select("id, enrollment_id, protocol_number, created_at")
        .eq("organization_id", input.organizationId)
        .is("deleted_at", null)
        .in("enrollment_id", legacyEnrollmentIds)
        .order("created_at", { ascending: false });
      // A legacy education journal is not a prerequisite for the new protocol.
      // Keep an explicit warning instead of requiring journals.read to use OT.
      legacyProtocolLookupFailed = Boolean(protocolsError);
      for (const row of protocolsError ? [] : protocolRows ?? []) {
        if (row.id && row.enrollment_id && !documentsByEnrollmentId.has(row.enrollment_id)) {
          documentsByEnrollmentId.set(row.enrollment_id, {
            recordId: row.id,
            protocolNumber: row.protocol_number?.trim() || null,
          });
        }
      }
    }
  }

  return {
    company,
    protocolStorageAvailable,
    legacyProtocolLookupFailed,
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
        protocolRecord: protocolsByEnrollmentId.get(enrollment.id) ?? null,
      };
    }),
  };
}
