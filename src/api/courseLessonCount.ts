import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/retryFetch";

/** Count visible lesson rows without fetching their potentially large content. */
export async function fetchCourseLessonCount(courseId: string): Promise<number> {
  const lessons = await fetchAllRows<{ id: string }>(async ({ from, to }) => {
    const result = await supabase
      .from("lessons")
      .select("id")
      .eq("course_id", courseId)
      .order("id")
      .range(from, to);

    // Only an actual empty list establishes zero. A missing response is unknown.
    if (!result.error && !Array.isArray(result.data)) {
      throw new Error("Lesson list response is missing");
    }
    return result;
  });
  return lessons.length;
}
