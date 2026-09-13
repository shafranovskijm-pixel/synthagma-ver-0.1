import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const nullableText = z.string().nullable();

const courseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: nullableText,
  duration: nullableText,
  is_published: z.literal(false),
  cover_image_url: nullableText,
}).strict();

const countsSchema = z.object({
  modules: z.number().int().nonnegative(),
  elements: z.number().int().nonnegative(),
  homework: z.number().int().nonnegative(),
  tests: z.number().int().nonnegative(),
  questions: z.number().int().nonnegative(),
}).strict();

const moduleSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  order_index: z.number().int(),
}).strict();

const lessonSummarySchema = z.object({
  id: z.string().uuid(),
  module_id: z.string().uuid().nullable(),
  title: z.string(),
  type: z.string(),
  order_index: z.number().int(),
  is_locked: z.boolean(),
  test_passing_score: z.number().int().nullable(),
  test_questions_count: z.number().int().nonnegative(),
  module_number: z.number().int().nullable(),
  final_assessment: z.boolean().nullable(),
  source_article_id: nullableText,
}).strict();

const libraryResourceSchema = z.object({
  id: z.string().uuid(),
  module_id: z.string().uuid().nullable(),
  name: z.string(),
  type: z.string(),
  description: nullableText,
  sort_order: z.number().int().nonnegative(),
  visible_to_students: z.boolean(),
  allow_download: z.boolean(),
  library_category: nullableText,
  source_name: nullableText,
  resource_url: nullableText,
  storage_path: nullableText,
  original_filename: nullableText,
  mime_type: nullableText,
  edition_label: nullableText,
  last_checked_at: nullableText,
  usage_basis: nullableText,
  library_status: nullableText,
}).strict();

export const courseReviewSnapshotSchema = z.object({
  course: courseSchema,
  grant_expires_at: z.string(),
  counts: countsSchema,
  modules: z.array(moduleSchema),
  lessons: z.array(lessonSummarySchema),
  library: z.array(libraryResourceSchema),
}).strict();

const lessonSchema = lessonSummarySchema.extend({
  course_id: z.string().uuid(),
  content: nullableText,
}).strict();

const attachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  file_url: z.string(),
  file_type: nullableText,
  file_size: z.number().nonnegative().nullable(),
  category: z.string(),
  order_index: z.number().int(),
}).strict();

const questionSchema = z.object({
  id: z.string().uuid(),
  question: z.string(),
  options: z.array(z.string()),
  order_index: z.number().int(),
  image_url: nullableText,
}).strict();

export const courseReviewLessonSchema = z.object({
  lesson: lessonSchema,
  attachments: z.array(attachmentSchema),
  questions: z.array(questionSchema),
}).strict();

export type CourseReviewSnapshot = z.infer<typeof courseReviewSnapshotSchema>;
export type CourseReviewLesson = z.infer<typeof courseReviewLessonSchema>;
export type CourseReviewLessonSummary = CourseReviewSnapshot["lessons"][number];

interface ReviewRpcError {
  message: string;
}

interface ReviewRpcResult {
  data: unknown;
  error: ReviewRpcError | null;
}

interface CourseReviewerRpcClient {
  rpc(
    functionName: "get_course_review_snapshot" | "get_course_review_lesson",
    params: Record<string, string>,
  ): PromiseLike<ReviewRpcResult>;
}

// The narrowed client deliberately has no `from`, storage or functions API.
// Reviewer data can only cross this boundary through the two allowlisted RPCs.
const reviewerRpc = supabase as unknown as CourseReviewerRpcClient;

function toReviewError(error: ReviewRpcError | null): Error {
  if (error?.message) return new Error(error.message);
  return new Error("Course review is unavailable");
}

export async function fetchCourseReviewSnapshot(courseId: string): Promise<CourseReviewSnapshot> {
  const { data, error } = await reviewerRpc.rpc("get_course_review_snapshot", {
    p_course_id: courseId,
  });
  if (error) throw toReviewError(error);
  return courseReviewSnapshotSchema.parse(data);
}

export async function fetchCourseReviewLesson(
  courseId: string,
  lessonId: string,
): Promise<CourseReviewLesson> {
  const { data, error } = await reviewerRpc.rpc("get_course_review_lesson", {
    p_course_id: courseId,
    p_lesson_id: lessonId,
  });
  if (error) throw toReviewError(error);
  return courseReviewLessonSchema.parse(data);
}
