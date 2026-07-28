/**
 * Shared loader for "students of a single course".
 *
 * Both CourseDetailsTab and useCourseStudentsManager must use this — it
 *  - fetches enrollments and profiles in bounded batches (no N+1 per user),
 *  - propagates errors instead of silently returning an empty list,
 *  - de-duplicates user IDs and filters out organization/admin accounts,
 *  - detects a total profile-access failure (RLS/permission) rather than
 *    rendering a list full of "Без имени",
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
  /** true when profile row could not be loaded for this enrollment. */
  profile_missing?: boolean;
}

export interface LoadCourseStudentsInput {
  courseId: string;
  courseTitle?: string | null;
}

/**
 * Thrown when enrollments were fetched successfully but ZERO profiles
 * came back for their user_ids — this signals an access / integrity problem,
 * not an empty course. The caller must show a diagnostic message instead
 * of a list of "Без имени" rows.
 */
export class CourseProfilesUnavailableError extends Error {
  code = "PROFILES_UNAVAILABLE" as const;
  constructor(public expectedUserIds: string[]) {
    super("Профили учеников недоступны для этих зачислений");
  }
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

  // 4a) Enrollments exist but ZERO profiles came back → treat as permission /
  // integrity failure, NOT as a valid list of "Без имени" rows.
  if (studentUserIds.length > 0 && profileMap.size === 0) {
    throw new CourseProfilesUnavailableError(studentUserIds);
  }

  // 4b) Partially missing profiles — log a diagnostic, mark each row so
  // the UI can render "Профиль недоступен" instead of a fake name.
  const missingProfileUserIds = studentUserIds.filter((id) => !profileMap.has(id));
  if (missingProfileUserIds.length > 0) {
    console.warn(
      "[loadCourseStudents] partial profile access: %d/%d profiles unavailable",
      missingProfileUserIds.length,
      studentUserIds.length,
      { courseId, missingProfileUserIds }
    );
  }

  // 5) Merge — one row per enrollment (skipping enrollments whose user is org/admin).
  const result: CourseStudentRow[] = [];
  for (const e of rows) {
    if (excludedUserIds.has(e.user_id)) continue;
    const prof = profileMap.get(e.user_id);
    const profileMissing = !prof;
    result.push({
      id: prof?.id ?? e.user_id,
      user_id: e.user_id,
      enrollment_id: e.id,
      name: prof?.full_name || (profileMissing ? "Профиль недоступен" : "Без имени"),
      email: prof?.email || "",
      login: prof?.login ?? null,
      generated_password: null,
      course: courseTitle ?? null,
      course_id: e.course_id,
      progress: e.progress ?? 0,
      lastActivity: (e as any).started_at ?? null,
      status: e.status ?? null,
      profile_missing: profileMissing || undefined,
    });
  }

  return result;
}

// -----------------------------------------------------------------------------
// Phase 2 — server-side paginated loaders. These call the SECURITY DEFINER RPCs
// created in the earlier migration and return small pages instead of the full
// list, so opening a course with hundreds of enrollments is O(1) requests.
// -----------------------------------------------------------------------------

export interface CourseStudentPageRow {
  id: string;
  user_id: string;
  enrollment_id: string;
  name: string;
  email: string;
  login: string | null;
  progress: number;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
  time_spent: number | null;
  archived_at: string | null;
}

export interface CourseStudentsPage {
  rows: CourseStudentPageRow[];
  totalFiltered: number;
  nextOffset: number | null;
}

export interface FetchCourseStudentsPageInput {
  courseId: string;
  limit?: number;
  offset?: number;
  search?: string | null;
  status?: "all" | "active" | "completed" | null;
}

export async function fetchCourseStudentsPage({
  courseId, limit = 10, offset = 0, search, status,
}: FetchCourseStudentsPageInput): Promise<CourseStudentsPage> {
  const { data, error } = await supabase.rpc("get_course_students_page", {
    p_course_id: courseId,
    p_limit: limit,
    p_offset: offset,
    p_search: search && search.trim() ? search.trim() : undefined,
    p_status: status && status !== "all" ? status : undefined,
  });
  if (error) throw error;

  const list = (data ?? []) as any[];
  const totalFiltered = list.length > 0 ? Number(list[0].total_count ?? 0) : 0;

  const rows: CourseStudentPageRow[] = list.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    enrollment_id: r.enrollment_id,
    name: r.full_name || "Профиль недоступен",
    email: r.email || "",
    login: r.login ?? null,
    progress: Number(r.progress ?? 0),
    status: r.status ?? null,
    started_at: r.started_at ?? null,
    completed_at: r.completed_at ?? null,
    time_spent: r.time_spent ?? null,
    archived_at: r.archived_at ?? null,
  }));

  const nextOffset = offset + rows.length < totalFiltered ? offset + rows.length : null;
  return { rows, totalFiltered, nextOffset };
}

export interface CourseStudentsStats {
  totalStudents: number;
  activeStudents: number;
  completedStudents: number;
  averageProgress: number;
}

export async function fetchCourseStudentsStats(courseId: string): Promise<CourseStudentsStats> {
  const { data, error } = await supabase.rpc("get_course_students_stats", {
    p_course_id: courseId,
  });
  if (error) throw error;
  const row = (data ?? [])[0] as any | undefined;
  return {
    totalStudents: Number(row?.total_count ?? 0),
    activeStudents: Number(row?.active_count ?? 0),
    completedStudents: Number(row?.completed_count ?? 0),
    averageProgress: Number(row?.average_progress ?? 0),
  };
}

export interface AvailableStudentRow {
  id: string;
  user_id: string;
  name: string;
  email: string;
  login: string | null;
}

export interface AvailableStudentsPage {
  rows: AvailableStudentRow[];
  totalFiltered: number;
  nextOffset: number | null;
}

export async function fetchAvailableStudentsForCoursePage({
  courseId, limit = 20, offset = 0, search,
}: {
  courseId: string; limit?: number; offset?: number; search?: string | null;
}): Promise<AvailableStudentsPage> {
  const { data, error } = await supabase.rpc("get_available_students_for_course_page", {
    p_course_id: courseId,
    p_limit: limit,
    p_offset: offset,
    p_search: search && search.trim() ? search.trim() : undefined,
  });
  if (error) throw error;

  const list = (data ?? []) as any[];
  const totalFiltered = list.length > 0 ? Number(list[0].total_count ?? 0) : 0;

  const rows: AvailableStudentRow[] = list.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    name: r.full_name || "Без имени",
    email: r.email || "",
    login: r.login ?? null,
  }));

  const nextOffset = offset + rows.length < totalFiltered ? offset + rows.length : null;
  return { rows, totalFiltered, nextOffset };
}
