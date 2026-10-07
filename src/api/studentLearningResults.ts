import { supabase } from "@/integrations/supabase/client";

export interface StudentLearningTest {
  lesson_id: string;
  lesson_title: string;
  score: number | null;
  max_score: number | null;
  percent: number | null;
  passing_score: number;
  passed: boolean | null;
  attempts_used: number;
  completed_at: string | null;
  manual_credited_at: string | null;
}
export interface StudentLearningCourse {
  enrollment_id: string;
  course_id: string;
  course_title: string;
  progress: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  time_spent: number;
  manual_credited_at: string | null;
  tests: StudentLearningTest[];
}

export async function fetchStudentLearningResults(organizationId: string, userId: string): Promise<StudentLearningCourse[]> {
  if (!organizationId || !userId) throw new Error("Не указаны организация и ученик");
  const { data, error } = await supabase.rpc("get_student_learning_results" as never, {
    p_organization_id: organizationId, p_user_id: userId,
  } as never);
  if (error) throw error;
  const result = data as { organization_id?: string; user_id?: string; courses?: StudentLearningCourse[] } | null;
  if (result?.organization_id !== organizationId || result.user_id !== userId || !Array.isArray(result.courses)) {
    throw new Error("Сервер не подтвердил результаты ученика");
  }
  const seen = new Set<string>();
  for (const course of result.courses) {
    if (!course.enrollment_id || seen.has(course.enrollment_id) || !Array.isArray(course.tests)) {
      throw new Error("Получены неполные результаты обучения");
    }
    seen.add(course.enrollment_id);
  }
  return result.courses;
}
