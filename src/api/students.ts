import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/retryFetch";
import type { Student, StudentFRDOStatus, StudentEnrollment } from "@/types";

// ============= Students API =============

export async function fetchStudents(
  organizationId: string,
  courseIds: string[]
): Promise<{ students: Student[]; allProfiles: Student[]; groupMap: Map<string, string | null> }> {
  // Run independent queries in parallel to cut waterfall latency.
  // - profiles: include student_group_id so we don't need a second profiles roundtrip
  // - enrollments: trim select to only the columns we actually use
  // - passwords + courses: kick off in parallel
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
      .select("id, user_id, full_name, email, login, company_id, last_visit_at, student_group_id")
      .eq("organization_id", organizationId)
      .range(from, to)
      .then(r => ({ data: r.data as any[] | null, error: r.error }))
  );

  const passwordsPromise = supabase
    .rpc("get_decrypted_student_passwords", { p_organization_id: organizationId });

  const coursesPromise = supabase
    .from("courses")
    .select("id, title")
    .eq("organization_id", organizationId);

  const [allEnrollments, allProfilesData, passwordsRes, coursesRes] = await Promise.all([
    enrollmentsPromise,
    profilesPromise,
    passwordsPromise,
    coursesPromise,
  ]);

  const passwordMap = new Map<string, string>();
  (passwordsRes.data || []).forEach((row: any) => {
    if (row.decrypted_password) passwordMap.set(row.user_id, row.decrypted_password);
  });

  // Fetch user roles only for users that actually have enrollments OR appear once -
  // but we still need to filter out org/admin from the full profile list.
  const userIds = (allProfilesData || []).map(p => p.user_id);
  let orgAdminUserIds = new Set<string>();

  if (userIds.length > 0) {
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds)
      .in("role", ["organization", "admin"]);

    orgAdminUserIds = new Set((rolesData || []).map(r => r.user_id));
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

  const studentsList: Student[] = [];

  for (const profile of allProfilesData || []) {
    // Skip organization and admin users - they are not students
    if (orgAdminUserIds.has(profile.user_id)) {
      continue;
    }

    const userEnrollments = userEnrollmentsMap[profile.user_id] || [];
    
    // Build enrollments array for this student
    const enrollments = userEnrollments.map(enrollment => {
      const course = coursesData?.find(c => c.id === enrollment.course_id);
      return {
        id: enrollment.id,
        course_id: enrollment.course_id,
        course_title: course?.title || "—",
        progress: enrollment.progress || 0,
        status: enrollment.status,
        started_at: enrollment.started_at,
        completed_at: enrollment.completed_at,
        time_spent: enrollment.time_spent
      };
    });

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
      enrollment_id: enrollments.length === 1 ? enrollments[0].id : null, // Only set if single enrollment
      name: profile.full_name || "Без имени",
      email: profile.email || "",
      login: profile.login || null,
      generated_password: passwordMap.get(profile.user_id) || null,
      course: courseNames.length > 0 ? courseNames.join(", ") : null,
      course_id: enrollments.length === 1 ? enrollments[0].course_id : null, // Only set if single enrollment
      progress: totalProgress,
      lastActivity: enrollments[0]?.started_at || null,
      last_visit_at: profile.last_visit_at || null,
      status: aggregateStatus,
      enrollments: enrollments // Add all enrollments for detail view
    });
  }

  // Sort: enrolled students first, then by name
  studentsList.sort((a, b) => {
    const aEnrolled = (a.enrollments?.length || 0) > 0;
    const bEnrolled = (b.enrollments?.length || 0) > 0;
    if (aEnrolled !== bEnrolled) return bEnrolled ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return {
    students: studentsList,
    allProfiles: studentsList.filter(s => !s.enrollments || s.enrollments.length === 0)
  };
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
  // Delete enrollments first
  await supabase
    .from("enrollments")
    .delete()
    .eq("user_id", userId);

  // Delete profile
  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("user_id", userId);

  return !error;
}

// ============= Helpers =============

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
