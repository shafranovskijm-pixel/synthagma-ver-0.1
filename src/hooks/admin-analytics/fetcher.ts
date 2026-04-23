import { supabase } from "@/integrations/supabase/client";
import type { AnalyticsData, CourseAccessRecord, CourseInfo, LoginHistoryRecord, ProfileInfo } from "./types";

export const ADMIN_ANALYTICS_KEY = ["admin", "analytics"] as const;

export async function fetchAnalytics(): Promise<AnalyticsData> {
  const [profilesRes, enrollmentsRes, progressRes, coursesRes, orgsRes, featureUsageRes, aiUsageRes, aiUserLogRes, loginHistoryRes, courseAccessRes, profilesInfoRes, coursesInfoRes] = await Promise.all([
    supabase.from("profiles").select("created_at"),
    supabase.from("enrollments").select("started_at, completed_at, status"),
    supabase.from("lesson_progress").select("completed_at, completed"),
    supabase.from("courses").select("created_at, is_published"),
    supabase.from("organizations").select("id, name, created_at, is_paid, paid_until, tariff_type, monthly_price"),
    supabase.from("organization_feature_usage").select("feature_id, usage_count, organization_id"),
    supabase.from("organization_usage").select("organization_id, ai_generations_count, ai_tokens_used, month_start"),
    supabase.from("ai_usage_log").select("user_id, organization_id, function_name, created_at").order("created_at", { ascending: false }).limit(1000),
    supabase.from("student_login_history").select("user_id, logged_in_at, ip_address, user_agent"),
    supabase.from("course_access_log").select("user_id, course_id, accessed_at, ip_address, user_agent"),
    supabase.from("profiles").select("user_id, full_name, email, login, organization_id"),
    supabase.from("courses").select("id, title"),
  ]);

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
    profilesInfo: (profilesInfoRes.data || []) as ProfileInfo[],
    coursesInfo: (coursesInfoRes.data || []) as CourseInfo[],
  };
}
