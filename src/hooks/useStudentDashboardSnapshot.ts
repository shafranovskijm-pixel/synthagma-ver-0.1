import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { captureOfflineActor, isOfflineActorCurrent, isOfflineAccessDenied } from '@/utils/courseCache';

export interface StudentSnapshotEnrollment {
  id: string;
  learning_progress_epoch: string;
  learning_progress_reset_at: string | null;
  course_id: string;
  progress: number | null;
  status: string | null;
  time_spent: number | null;
  expires_at: string | null;
  title: string;
  description: string | null;
  duration: string | null;
  skip_video_identification: boolean | null;
  total_lessons: number;
  completed_lessons: number;
  cover_image_url: string | null;
}

export interface StudentSnapshot {
  profile: {
    user_id: string;
    full_name: string | null;
    organization_id: string | null;
    onboarding_completed: boolean;
  };
  org: {
    id: string;
    name: string | null;
    description: string | null;
    branding: Record<string, unknown> | null;
    student_dashboard_settings: Record<string, unknown> | null;
    subscription_plan: string | null;
  } | null;
  enrollments: StudentSnapshotEnrollment[];
  documents: { has_passport: boolean; has_snils: boolean; has_education: boolean };
  video_identified: boolean;
}

/**
 * Один RPC-вызов вместо 6–8 отдельных запросов профиля/организации/
 * enrollments/lessons/lesson_progress/identity_documents/video_id.
 *
 * Используется как «быстрая первая отрисовка». Текущий useStudentDashboard
 * остаётся как fallback-логика на случай ошибки RPC или офлайна.
 */
export function useStudentDashboardSnapshot(userId: string | null | undefined, actorId: string | null | undefined) {
  const revision = captureOfflineActor(actorId);
  const query = useQuery<StudentSnapshot | null>({
    queryKey: ["student-dashboard-snapshot", actorId, revision, userId],
    enabled: !!userId && !!actorId && revision !== null,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: (failureCount, error) => !isOfflineAccessDenied(error) && failureCount < 3,
    queryFn: async () => {
      if (!userId || !actorId || !isOfflineActorCurrent(actorId, revision)) return null;
      const { data, error } = await supabase.rpc("get_student_dashboard_snapshot", {
        p_user_id: userId,
      });
      if (error) throw error;
      if (!isOfflineActorCurrent(actorId, revision)) return null;
      return (data as unknown as StudentSnapshot) || null;
    },
  });
  const accessDenied = isOfflineAccessDenied(query.error);
  const unconfirmed = query.isSuccess && (!query.data || query.data.profile?.user_id !== userId);
  // ReactQuery keeps successful data on a same-key background403. It is history,
  // not current authority: consumers must not continue displaying that snapshot.
  return { ...query, data: accessDenied || unconfirmed ? undefined : query.data, accessDenied, unconfirmed };
}
