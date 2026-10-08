import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const myCourseReviewSchema = z.object({
  course_id: z.string().uuid(),
  title: z.string(),
  duration: z.string().nullable(),
  grant_expires_at: z.string(),
}).strict();

export type MyCourseReview = z.infer<typeof myCourseReviewSchema>;

export function activeCourseReviews(value: unknown, now = Date.now()): MyCourseReview[] {
  return z.array(myCourseReviewSchema).parse(value).filter((item) => {
    if (["infinity", "+infinity"].includes(item.grant_expires_at.toLowerCase())) return true;
    const expires = Date.parse(item.grant_expires_at);
    return Number.isFinite(expires) && expires > now;
  });
}

export async function fetchMyCourseReviews(): Promise<MyCourseReview[]> {
  // No target-user argument: the server derives the caller from auth.uid().
  const client = supabase as unknown as { rpc: (
    name: "get_my_course_reviews",
  ) => Promise<{ data: unknown; error: { message: string } | null }> };
  const { data, error } = await client.rpc("get_my_course_reviews");
  if (error) throw new Error(error.message);
  return activeCourseReviews(data);
}
