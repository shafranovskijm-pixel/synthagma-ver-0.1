import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const dateText = z.string();
const testResult = z.object({
  lesson_title: z.string(),
  score: z.number(),
  max_score: z.number(),
  completed_at: dateText,
}).strict();
const assignmentResult = z.object({
  lesson_title: z.string(),
  status: z.string(),
  score: z.number().nullable(),
  submitted_at: dateText,
  reviewed_at: dateText.nullable(),
}).strict();
const registerRecord = z.object({
  record_no: z.number().int().positive(),
  status: z.string(),
  progress: z.number(),
  started_at: dateText,
  completed_at: dateText.nullable(),
  tests: z.array(testResult),
  assignments: z.array(assignmentResult),
}).strict();

export const courseReviewRegisterSchema = z.object({
  course_id: z.string().uuid(),
  recorded_at: dateText,
  enrollment_count: z.number().int().nonnegative(),
  records: z.array(registerRecord),
}).strict().refine((data) => data.enrollment_count === data.records.length, {
  message: "Course register count does not match its records",
});

export type CourseReviewRegisterData = z.infer<typeof courseReviewRegisterSchema>;

const registerRpc = supabase as unknown as {
  rpc(name: "get_course_review_register", params: { p_course_id: string }):
    PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export async function fetchCourseReviewRegister(courseId: string): Promise<CourseReviewRegisterData> {
  const { data, error } = await registerRpc.rpc("get_course_review_register", { p_course_id: courseId });
  if (error) throw new Error(error.message);
  const register = courseReviewRegisterSchema.parse(data);
  if (register.course_id !== courseId) throw new Error("Course register scope mismatch");
  return register;
}
