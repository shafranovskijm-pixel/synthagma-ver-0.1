export interface LoginHistoryRecord {
  user_id: string;
  logged_in_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

export interface CourseAccessRecord {
  user_id: string;
  course_id: string;
  accessed_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

export interface ProfileInfo {
  user_id: string;
  full_name: string | null;
  email: string | null;
  login: string | null;
  organization_id: string | null;
}

export interface CourseInfo {
  id: string;
  title: string;
}

export interface AnalyticsData {
  profiles: { created_at: string }[];
  enrollments: { started_at: string; completed_at: string | null; status: string }[];
  lessonProgress: { completed_at: string | null; completed: boolean }[];
  courses: { created_at: string; is_published: boolean }[];
  organizations: {
    id: string;
    name: string;
    created_at: string;
    is_paid: boolean;
    paid_until: string | null;
    tariff_type: string;
    monthly_price: number;
  }[];
  featureUsage: { feature_id: string; usage_count: number; organization_id: string }[];
  aiUsage: { organization_id: string; ai_generations_count: number; ai_tokens_used: number; month_start: string }[];
  aiUserLog: { user_id: string; organization_id: string; function_name: string; created_at: string }[];
  loginHistory: LoginHistoryRecord[];
  courseAccessLog: CourseAccessRecord[];
  profilesInfo: ProfileInfo[];
  coursesInfo: CourseInfo[];
}
