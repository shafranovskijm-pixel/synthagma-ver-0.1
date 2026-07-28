import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/retryFetch";
import { fetchUserRolesBatched } from "@/utils/fetchUserRolesBatched";
import { logStudentDeletion } from "@/utils/logStudentDeletion";
import type { Student, StudentFRDOStatus, StudentEnrollment } from "@/types";

// ============= Students API =============

export async function fetchStudents(
  organizationId: string,
  courseIds: string[]
): Promise<{ students: Student[]; allProfiles: Student[]; groupMap: Map<string, string | null> }> {
  // Passwords are intentionally NOT fetched here — the decrypted-password RPC
  // can be slow or hang, and it must not block the primary student list.
  // See fetchStudentPasswords() below and useStudents() for the separate
  // secondary query that merges passwords in once they arrive.
  const enrollmentsPromise = courseIds.length > 0
    ? fetchAllRows<any>(({ from, to }) =>
        supabase
          .from("enrollments")
          .select("id, user_id, course_id, progress, status, started_at, completed_at, time_spent")
          .in("course_id", courseIds)
          .range(from, to)
          .then(r => ({ data: r.data as any[] | null, error: r.error }))
      )
    : Promise.resolve([] as any[]);

  const profilesPromise = fetchAllRows<any>(({ from, to }) =>
    supabase
      .from("profiles")
      .select("id, user_id, full_name, email, login, company_id, last_visit_at, student_group_id, archived_at")
      .eq("organization_id", organizationId)
      .range(from, to)
      .then(r => ({ data: r.data as any[] | null, error: r.error }))
  );

  const coursesPromise = supabase
    .from("courses")
    .select("id, title")
    .eq("organization_id", organizationId);

  const [allEnrollments, allProfilesData, coursesRes] = await Promise.all([
    enrollmentsPromise,
    profilesPromise,
    coursesPromise,
  ]);

  // Profiles / enrollments / courses must succeed — otherwise the UI would
  // silently render an empty student list and the org would think everyone
  // disappeared.
  if ((coursesRes as any).error) {
    throw (coursesRes as any).error;
  }

  // Fetch user roles only for users that actually have enrollments OR appear once -
  // but we still need to filter out org/admin from the full profile list.
  const userIds = (allProfilesData || []).map(p => p.user_id);
  let orgAdminUserIds = new Set<string>();

  if (userIds.length > 0) {
    try {
      const rolesData = await fetchUserRolesBatched(userIds, ["organization", "admin"]);
      orgAdminUserIds = new Set(rolesData.map(r => r.user_id));
    } catch (err) {
      // Role filter is not critical for correctness of the list —
      // worst case org/admin accounts appear as "students". Log and continue.
      console.warn("[fetchStudents] role filter failed:", err);
    }
  }

  const coursesData = coursesRes.data;

  // Build enrollment map by user
  const userEnrollmentsMap: Record<string, any[]> = {};
  for (const enrollment of allEnrollments) {
    if (!userEnrollmentsMap[enrollment.user_id]) {
      userEnrollmentsMap[enrollment.user_id] = [];
    }
    userEnrollmentsMap[enrollment.user_id].push(enrollment);
  }

  // Build a Map once so per-student loop is O(1) instead of O(courses).
  const courseTitleMap = new Map<string, string>((coursesData ?? []).map((c: any) => [c.id, c.title]));

  const studentsList: Student[] = [];

  for (const profile of allProfilesData || []) {
    // Skip organization and admin users - they are not students
    if (orgAdminUserIds.has(profile.user_id)) {
      continue;
    }

    const userEnrollments = userEnrollmentsMap[profile.user_id] || [];

    // Build enrollments array for this student
    const enrollments = userEnrollments.map(enrollment => ({
      id: enrollment.id,
      course_id: enrollment.course_id,
      course_title: courseTitleMap.get(enrollment.course_id) || "—",
      progress: enrollment.progress || 0,
      status: enrollment.status,
      started_at: enrollment.started_at,
      completed_at: enrollment.completed_at,
      time_spent: enrollment.time_spent
    }));

    // Calculate aggregate progress and status
    const totalProgress = enrollments.length > 0 
      ? Math.round(enrollments.reduce((sum, e) => sum + e.progress, 0) / enrollments.length)
      : 0;
    
    const hasCompleted = enrollments.some(e => e.status === 'completed');
    const hasActive = enrollments.some(e => e.status === 'active');
    const aggregateStatus = hasCompleted ? 'completed' : hasActive ? 'active' : null;

    // Create course display string
    const courseNames = enrollments.map(e => e.course_title);

    studentsList.push({
      id: profile.id,
      user_id: profile.user_id,
      enrollment_id: enrollments.length === 1 ? enrollments[0].id : null,
      name: profile.full_name || "Без имени",
      email: profile.email || "",
      login: profile.login || null,
      // Passwords are merged in by useStudents() from fetchStudentPasswords().
      generated_password: null,
      course: courseNames.length > 0 ? courseNames.join(", ") : null,
      course_id: enrollments.length === 1 ? enrollments[0].course_id : null,
      progress: totalProgress,
      lastActivity: enrollments[0]?.started_at || null,
      last_visit_at: profile.last_visit_at || null,
      status: aggregateStatus,
      enrollments: enrollments,
      archived_at: profile.archived_at ?? null,
    } as Student);
  }

  // Sort: enrolled students first, then by name
  studentsList.sort((a, b) => {
    const aEnrolled = (a.enrollments?.length || 0) > 0;
    const bEnrolled = (b.enrollments?.length || 0) > 0;
    if (aEnrolled !== bEnrolled) return bEnrolled ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  // Build groupMap from the same profiles fetch (avoids a second roundtrip)
  const groupMap = new Map<string, string | null>();
  for (const profile of allProfilesData || []) {
    if (orgAdminUserIds.has(profile.user_id)) continue;
    groupMap.set(profile.user_id, profile.student_group_id ?? null);
  }

  return {
    students: studentsList,
    allProfiles: studentsList.filter(s => !s.enrollments || s.enrollments.length === 0),
    groupMap,
  };
}

/**
 * Fetches decrypted passwords for students of an organization.
 * Intentionally SEPARATE from fetchStudents() — this RPC can be slow or hang,
 * and it must not block the primary list. Errors here are non-critical.
 */
export async function fetchStudentPasswords(
  organizationId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .rpc("get_decrypted_student_passwords", { p_organization_id: organizationId });

  if (error) {
    console.warn("[fetchStudentPasswords] RPC failed:", error);
    throw error;
  }

  const map = new Map<string, string>();
  for (const row of (data || []) as any[]) {
    if (row.decrypted_password) map.set(row.user_id, row.decrypted_password);
  }
  return map;
}


export async function fetchStudentEnrollments(userId: string): Promise<StudentEnrollment[]> {
  const { data: enrollments, error } = await supabase
    .from("enrollments")
    .select(`
      id,
      course_id,
      progress,
      status,
      started_at,
      completed_at,
      time_spent,
      courses (title)
    `)
    .eq("user_id", userId);

  if (error) {
    console.error("Error fetching student enrollments:", error);
    return [];
  }

  return (enrollments || []).map((e: any) => ({
    id: e.id,
    course_id: e.course_id,
    course_title: e.courses?.title || "—",
    progress: e.progress,
    status: e.status,
    started_at: e.started_at,
    completed_at: e.completed_at,
    time_spent: e.time_spent
  }));
}

export async function fetchFRDOStatus(
  organizationId: string,
  userIds: string[]
): Promise<Map<string, StudentFRDOStatus>> {
  if (userIds.length === 0) return new Map();

  const { data: frdoData } = await supabase
    .from("student_frdo_data")
    .select("user_id, last_name, first_name, middle_name, birth_date, gender, snils, education_level")
    .eq("organization_id", organizationId)
    .in("user_id", userIds);

  const requiredFields = [
    { key: "last_name", label: "Фамилия" },
    { key: "first_name", label: "Имя" },
    { key: "birth_date", label: "Дата рождения" },
    { key: "gender", label: "Пол" },
    { key: "snils", label: "СНИЛС" },
  ];

  const statusMap = new Map<string, StudentFRDOStatus>();

  for (const userId of userIds) {
    const data = frdoData?.find(f => f.user_id === userId);
    const missing: string[] = [];

    if (data) {
      for (const field of requiredFields) {
        if (!data[field.key as keyof typeof data]) {
          missing.push(field.label);
        }
      }
      statusMap.set(userId, {
        hasData: true,
        isComplete: missing.length === 0,
        missingFields: missing
      });
    } else {
      statusMap.set(userId, {
        hasData: false,
        isComplete: false,
        missingFields: requiredFields.map(f => f.label)
      });
    }
  }

  return statusMap;
}

export async function createStudent(params: {
  organizationId: string;
  name: string;
  email: string;
  courseId?: string;
  companyId?: string;
  noLogin?: boolean;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  const password = params.noLogin ? null : generatePassword();

  const { data, error } = await supabase.functions.invoke("register-student", {
    body: {
      token: null,
      email: params.email || null,
      password,
      full_name: params.name,
      organization_id: params.organizationId,
      course_id: params.courseId || null,
      company_id: params.companyId || null,
      no_login: params.noLogin
    }
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (data?.error) {
    return { success: false, error: data.error };
  }

  return { success: true, data: { ...data, password } };
}

export async function enrollStudent(userId: string, courseId: string): Promise<{ success: boolean; enrollmentId?: string; error?: string }> {
  // Check if already enrolled
  const { data: existing } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .single();

  if (existing) {
    return { success: false, error: "Ученик уже зачислен на этот курс" };
  }

  const { data, error } = await supabase
    .from("enrollments")
    .insert({
      user_id: userId,
      course_id: courseId,
      status: "active",
      progress: 0,
      time_spent: 0
    })
    .select("id")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, enrollmentId: data.id };
}

export async function unenrollStudent(enrollmentId: string): Promise<boolean> {
  const { error } = await supabase
    .from("enrollments")
    .delete()
    .eq("id", enrollmentId);

  return !error;
}

export async function bulkEnrollStudents(userIds: string[], courseId: string): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const userId of userIds) {
    const result = await enrollStudent(userId, courseId);
    if (result.success) {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed };
}

export async function bulkUnenrollStudents(enrollmentIds: string[]): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const enrollmentId of enrollmentIds) {
    const result = await unenrollStudent(enrollmentId);
    if (result) {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed };
}

export async function updateStudentCompany(userId: string, companyId: string | null): Promise<boolean> {
  const { error } = await supabase
    .from("profiles")
    .update({ company_id: companyId })
    .eq("user_id", userId);

  return !error;
}

export async function deleteStudent(userId: string): Promise<boolean> {
  // SOFT DELETE: do NOT physically remove profile or enrollments.
  // We archive the profile so the student stays in the database (history preserved)
  // but is hidden from the active list. Restoring is a single click.
  // Physical deletion previously caused students to "disappear" with no trace
  // (no audit row, no enrollments, no test attempts) — this is what the
  // Vladivostok center reported about Газукина А. Н. and similar cases.
  const { error } = await supabase
    .from("profiles")
    .update({ archived_at: new Date().toISOString() } as any)
    .eq("user_id", userId);
  if (!error) {
    await logStudentDeletion({ userId, deletionType: "soft", reason: "deleteStudent (api)" });
  }
  return !error;
}

export async function setStudentArchived(userId: string, archived: boolean): Promise<boolean> {
  const { error } = await supabase
    .from("profiles")
    .update({ archived_at: archived ? new Date().toISOString() : null } as any)
    .eq("user_id", userId);
  if (!error && archived) {
    await logStudentDeletion({ userId, deletionType: "archive", reason: "setStudentArchived" });
  }
  return !error;
}

function generatePassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

// =============================================================================
// Phase 3: server-side paginated students of the organization
// =============================================================================

export interface OrgStudentPageRow {
  student: Student;
  total_count: number;
  active_count: number;
  archived_count: number;
}

export interface OrgStudentsPage {
  rows: Student[];
  totalFiltered: number;
  activeTotal: number;
  archivedTotal: number;
  nextOffset: number | null;
}

export interface FetchOrgStudentsPageInput {
  organizationId: string;
  limit?: number;
  offset?: number;
  search?: string | null;
  courseId?: string | null;
  groupFilter?: string | null;
  status?: string | null;
  docsFilter?: string | null;
  archiveMode?: "active" | "archive";
}

function toStudentFromServerRow(r: any): Student {
  const enrollmentsRaw = Array.isArray(r.enrollments) ? r.enrollments : [];
  const enrollments: StudentEnrollment[] = enrollmentsRaw.map((e: any) => ({
    id: e.id,
    course_id: e.course_id,
    course_title: e.course_title || "—",
    progress: Number(e.progress ?? 0),
    status: e.status,
    started_at: e.started_at,
    completed_at: e.completed_at ?? null,
    time_spent: Number(e.time_spent ?? 0),
  }));

  const courseNames = enrollments.map(e => e.course_title);
  return {
    id: r.id,
    user_id: r.user_id,
    enrollment_id: enrollments.length === 1 ? enrollments[0].id : null,
    name: r.full_name || "Без имени",
    email: r.email || "",
    login: r.login ?? null,
    // Passwords are loaded on demand only — see fetchStudentPasswordsForUsers().
    generated_password: null,
    course: courseNames.length > 0 ? courseNames.join(", ") : null,
    course_id: enrollments.length === 1 ? enrollments[0].course_id : null,
    progress: Number(r.progress ?? 0),
    lastActivity: r.last_activity ?? null,
    last_visit_at: r.last_visit_at ?? null,
    status: (r.status as string | null) ?? null,
    enrollments,
    archived_at: r.archived_at ?? null,
    student_group_id: r.student_group_id ?? null,
    has_passport: !!r.has_passport,
    has_snils: !!r.has_snils,
    has_education: !!r.has_education,
    frdo_has_data: !!r.frdo_has_data,
    frdo_complete: !!r.frdo_complete,
  };
}

export async function fetchOrganizationStudentsPage(
  input: FetchOrgStudentsPageInput,
): Promise<OrgStudentsPage> {
  const limit = Math.max(1, Math.min(100, input.limit ?? 10));
  const offset = Math.max(0, input.offset ?? 0);
  const { data, error } = await supabase.rpc("get_organization_students_page", {
    p_organization_id: input.organizationId,
    p_limit: limit,
    p_offset: offset,
    p_search: input.search && input.search.trim() ? input.search.trim() : undefined,
    p_course_id: input.courseId && input.courseId !== "all" ? input.courseId : undefined,
    p_group_filter: input.groupFilter && input.groupFilter !== "all" ? input.groupFilter : undefined,
    p_status: input.status && input.status !== "all" ? input.status : undefined,
    p_docs_filter: input.docsFilter && input.docsFilter !== "all" ? input.docsFilter : undefined,
    p_archive_mode: input.archiveMode ?? "active",
  } as any);
  if (error) throw error;

  const list = (data ?? []) as any[];
  const first = list[0];
  const totalFiltered = first ? Number(first.total_count ?? 0) : 0;
  const activeTotal = first ? Number(first.active_count ?? 0) : 0;
  const archivedTotal = first ? Number(first.archived_count ?? 0) : 0;
  const rows = list.map(toStudentFromServerRow);
  const nextOffset = offset + rows.length < totalFiltered ? offset + rows.length : null;
  return { rows, totalFiltered, activeTotal, archivedTotal, nextOffset };
}

export interface OrgStudentsCounts {
  active_count: number;
  archived_count: number;
  total_count: number;
}

export async function fetchOrganizationStudentsCounts(
  organizationId: string,
): Promise<OrgStudentsCounts> {
  const { data, error } = await supabase.rpc("get_organization_students_counts", {
    p_organization_id: organizationId,
  } as any);
  if (error) throw error;
  const row = (data ?? [])[0] as any | undefined;
  return {
    active_count: Number(row?.active_count ?? 0),
    archived_count: Number(row?.archived_count ?? 0),
    total_count: Number(row?.total_count ?? 0),
  };
}

export interface OrgStudentGroupCount {
  group_id: string | null;
  total_count: number;
  active_count: number;
  archived_count: number;
}

export async function fetchOrganizationStudentGroupCounts(
  organizationId: string,
): Promise<OrgStudentGroupCount[]> {
  const { data, error } = await supabase.rpc("get_organization_student_group_counts", {
    p_organization_id: organizationId,
  } as any);
  if (error) throw error;
  return ((data ?? []) as any[]).map(r => ({
    group_id: r.group_id ?? null,
    total_count: Number(r.total_count ?? 0),
    active_count: Number(r.active_count ?? 0),
    archived_count: Number(r.archived_count ?? 0),
  }));
}

export async function fetchStudentPasswordsForUsers(
  organizationId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  // Server enforces max 100; batch client-side just in case.
  const uniq = Array.from(new Set(userIds));
  for (let i = 0; i < uniq.length; i += 100) {
    const chunk = uniq.slice(i, i + 100);
    const { data, error } = await supabase.rpc("get_decrypted_student_passwords_for_users", {
      p_organization_id: organizationId,
      p_user_ids: chunk,
    } as any);
    if (error) throw error;
    for (const row of (data ?? []) as any[]) {
      if (row.decrypted_password) map.set(row.user_id, row.decrypted_password);
    }
  }
  return map;
}
