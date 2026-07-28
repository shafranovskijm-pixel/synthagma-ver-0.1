/**
 * Shared loader for "students of a single course".
 *
 * Both CourseDetailsTab and useCourseStudentsManager must use this — it
 *  - fetches enrollments and profiles in bounded batches (no N+1 per user),
 *  - propagates errors instead of silently returning an empty list,
 *  - de-duplicates user IDs and filters out organization/admin accounts,
 *  - keeps the shape identical for both callers.
 */

import { supabase } from "@/integrations/supabase/client";
import { fetchUserRolesBatched } from "@/utils/fetchUserRolesBatched";

const PROFILE_BATCH_SIZE = 50;

export interface CourseStudentRow {
  id: string;
  user_id: string;
  enrollment_id: string;
  name: string;
  email: string;
  login: string | null;
  generated_password: string | null;
  course: string | null;
  course_id: string;
  progress: number;
  lastActivity: string | null;
  status: string | null;
}

export interface LoadCourseStudentsInput {
  courseId: string;
  courseTitle?: string | null;
}

async function chunk<T, R>(items: T[], size: number, fn: (batch: T[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const rows = await fn(items.slice(i, i + size));
    out.push(...rows);
  }
  return out;
}

export async function loadCourseStudents(
  { courseId, courseTitle }: LoadCourseStudentsInput
): Promise<CourseStudentRow[]> {
  // 1) Enrollments — hard requirement.
  const { data: enrollments, error: enrollmentsError } = await supabase
    .from("enrollments")
    .select("id, user_id, course_id, progress, status, started_at")
    .eq("course_id", courseId);

  if (enrollmentsError) {
    throw enrollmentsError;
  }

  const rows = enrollments ?? [];
  if (rows.length === 0) return [];

  // 2) Dedup user IDs.
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));

  // 3) Exclude organization/admin accounts.
  let excludedUserIds = new Set<string>();
  try {
    const roles = await fetchUserRolesBatched(userIds, ["organization", "admin"]);
    excludedUserIds = new Set(roles.map((r) => r.user_id));
  } catch (err) {
    // Roles being unreachable must NOT hide students — log and continue.
    console.warn("[loadCourseStudents] role filter failed, showing all users:", err);
  }
  const studentUserIds = userIds.filter((id) => !excludedUserIds.has(id));
  if (studentUserIds.length === 0) return [];

  // 4) Batch-fetch profiles — hard requirement.
  const profileRows = await chunk(studentUserIds, PROFILE_BATCH_SIZE, async (batch) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, full_name, email, login")
      .in("user_id", batch);
    if (error) throw error;
    return data ?? [];
  });

  const profileMap = new Map(profileRows.map((p) => [p.user_id, p]));

  // 5) Merge — one row per enrollment (skipping enrollments whose user is org/admin).
  const result: CourseStudentRow[] = [];
  for (const e of rows) {
    if (excludedUserIds.has(e.user_id)) continue;
    const prof = profileMap.get(e.user_id);
    // profile can legitimately be missing (e.g. deleted user) — still show enrollment.
    result.push({
      id: prof?.id ?? e.user_id,
      user_id: e.user_id,
      enrollment_id: e.id,
      name: prof?.full_name || "Без имени",
      email: prof?.email || "",
      login: prof?.login ?? null,
      generated_password: null,
      course: courseTitle ?? null,
      course_id: e.course_id,
      progress: e.progress ?? 0,
      lastActivity: (e as any).started_at ?? null,
      status: e.status ?? null,
    });
  }

  return result;
}
