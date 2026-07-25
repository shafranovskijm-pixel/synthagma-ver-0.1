import { supabase } from "@/integrations/supabase/client";
import type { AnalyticsData, CourseAccessRecord, CourseInfo, LoginHistoryRecord, ProfileInfo } from "./types";

export const ADMIN_ANALYTICS_KEY = ["admin", "analytics"] as const;

export async function fetchAnalytics(): Promise<AnalyticsData> {
  const [profilesRes, enrollmentsRes, progressRes, coursesRes, orgsRes, featureUsageRes, aiUsageRes, aiUserLogRes, loginHistoryRes, courseAccessRes, profilesInfoRes, coursesInfoRes, userRolesRes] = await Promise.all([
    supabase.from("profiles").select("created_at"),
    supabase.from("enrollments").select("started_at, completed_at, status"),
    supabase.from("lesson_progress").select("completed_at, completed"),
    supabase.from("courses").select("created_at, is_published"),
    supabase.from("organizations").select("id, name, created_at, is_paid, paid_until, tariff_type, monthly_price"),
    supabase.from("organization_feature_usage").select("feature_id, usage_count, organization_id"),
    supabase.from("organization_usage").select("organization_id, ai_generations_count, ai_tokens_used, month_start"),
    supabase.from("ai_usage_log").select("user_id, organization_id, function_name, created_at, tokens_used").order("created_at", { ascending: false }).limit(2000),
    supabase.from("student_login_history").select("user_id, logged_in_at, ip_address, user_agent"),
    supabase.from("course_access_log").select("user_id, course_id, accessed_at, ip_address, user_agent"),
    supabase.from("profiles").select("user_id, full_name, email, login, organization_id"),
    supabase.from("courses").select("id, title"),
    supabase.from("user_roles").select("user_id, role"),
  ]);

  const rolesByUser = new Map<string, string>();
  const rolePriority: Record<string, number> = { admin: 5, organization: 4, company: 3, sales_manager: 2, student: 1 };
  ((userRolesRes.data || []) as { user_id: string; role: string }[]).forEach(r => {
    const cur = rolesByUser.get(r.user_id);
    if (!cur || (rolePriority[r.role] || 0) > (rolePriority[cur] || 0)) rolesByUser.set(r.user_id, r.role);
  });
  const profilesInfo: ProfileInfo[] = ((profilesInfoRes.data || []) as any[]).map(p => ({
    user_id: p.user_id, full_name: p.full_name, email: p.email, login: p.login,
    organization_id: p.organization_id, role: rolesByUser.get(p.user_id) || null,
  }));

  return {
    profiles: profilesRes.data || [],
    enrollments: enrollmentsRes.data || [],
    lessonProgress: progressRes.data || [],
    courses: coursesRes.data || [],
    organizations: orgsRes.data || [],
    featureUsage: featureUsageRes.data || [],
    aiUsage: (aiUsageRes.data || []) as any,
    aiUserLog: (aiUserLogRes.data || []) as any,
    loginHistory: (loginHistoryRes.data || []) as LoginHistoryRecord[],
    courseAccessLog: (courseAccessRes.data || []) as CourseAccessRecord[],
    profilesInfo,
    coursesInfo: (coursesInfoRes.data || []) as CourseInfo[],
  };
}
