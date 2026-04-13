import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPlanInfo, type SubscriptionPlan, type PlanLimits } from "@/constants/subscriptionPlans";

interface SubscriptionLimitsState {
  plan: SubscriptionPlan;
  limits: PlanLimits;
  usage: {
    coursesCount: number;
    studentsCount: number;
    trainedThisMonth: number;
    storageUsedBytes: number;
  };
  canCreateCourse: boolean;
  canAddStudent: boolean;
  canCompleteCourse: boolean;
  isAiEnabled: boolean;
  isAiAudioEnabled: boolean;
  hasCourseSettings: boolean;
  hasDocumentChecklist: boolean;
  hasVideoIdentification: boolean;
  storageLimit: number;
  loading: boolean;
  planName: string;
  checkLimit: (type: 'course' | 'student' | 'trained') => { allowed: boolean; message: string };
  refetch: () => Promise<void>;
}

export function useSubscriptionLimits(organizationId: string | null): SubscriptionLimitsState {
  const [plan, setPlan] = useState<SubscriptionPlan>('free');
  const [coursesCount, setCoursesCount] = useState(0);
  const [studentsCount, setStudentsCount] = useState(0);
  const [trainedThisMonth, setTrainedThisMonth] = useState(0);
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [customOverrides, setCustomOverrides] = useState<{
    maxCourses: number | null;
    maxStudents: number | null;
    maxTrainedPerMonth: number | null;
    aiGenerationsLimit: number | null;
    storageLimitBytes: number | null;
  }>({ maxCourses: null, maxStudents: null, maxTrainedPerMonth: null, aiGenerationsLimit: null, storageLimitBytes: null });

  const fetchData = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    try {
      const [orgResult, coursesResult, studentsResult, trainedResult] = await Promise.all([
        supabase
          .from("organizations")
          .select("subscription_plan, custom_max_courses, custom_max_students, custom_max_trained_per_month, custom_ai_generations_limit, custom_storage_limit_bytes")
          .eq("id", organizationId)
          .single(),
        supabase
          .from("courses")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId),
        supabase.rpc("count_org_students" as any, { org_id: organizationId }),
        supabase.rpc("count_org_completions_this_month" as any, { org_id: organizationId }),
      ]);

      if (orgResult.data?.subscription_plan) {
        setPlan(orgResult.data.subscription_plan as SubscriptionPlan);
      }
      const d = orgResult.data as any;
      if (d) {
        setCustomOverrides({
          maxCourses: d.custom_max_courses ?? null,
          maxStudents: d.custom_max_students ?? null,
          maxTrainedPerMonth: d.custom_max_trained_per_month ?? null,
          aiGenerationsLimit: d.custom_ai_generations_limit ?? null,
          storageLimitBytes: d.custom_storage_limit_bytes ?? null,
        });
      }
      setCoursesCount(coursesResult.count || 0);
      setStudentsCount(Number(studentsResult.data) || 0);
      setTrainedThisMonth(Number(trainedResult.data) || 0);
    } catch (error) {
      console.error("Error fetching subscription limits:", error);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription for plan changes
  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel(`org-plan-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'organizations',
          filter: `id=eq.${organizationId}`,
        },
        (payload) => {
          if (payload.new.subscription_plan) {
            setPlan(payload.new.subscription_plan as SubscriptionPlan);
          }
          fetchData();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [organizationId]);

  const planInfo = useMemo(() => getPlanInfo(plan), [plan]);
  
  // Merge custom overrides with plan defaults
  const limits: PlanLimits = useMemo(() => ({
    ...planInfo.limits,
    maxCourses: customOverrides.maxCourses ?? planInfo.limits.maxCourses,
    maxStudents: customOverrides.maxStudents ?? planInfo.limits.maxStudents,
    maxTrainedPerMonth: customOverrides.maxTrainedPerMonth ?? planInfo.limits.maxTrainedPerMonth,
    storageBytes: customOverrides.storageLimitBytes != null
      ? (customOverrides.storageLimitBytes === -1 ? -1 : customOverrides.storageLimitBytes)
      : planInfo.limits.storageBytes,
  }), [planInfo, customOverrides]);

  const canCreateCourse = limits.maxCourses === -1 || coursesCount < limits.maxCourses;
  const canAddStudent = limits.maxStudents === -1 || studentsCount < limits.maxStudents;
  const canCompleteCourse = limits.maxTrainedPerMonth === -1 || trainedThisMonth < limits.maxTrainedPerMonth;

  const checkLimit = useCallback((type: 'course' | 'student' | 'trained') => {
    if (type === 'course') {
      if (canCreateCourse) return { allowed: true, message: '' };
      return {
        allowed: false,
        message: `Лимит тарифа "${planInfo.name}": ${limits.maxCourses} ${limits.maxCourses === 1 ? 'курс' : 'курсов'}. Перейдите на следующий тариф.`,
      };
    }
    if (type === 'trained') {
      if (canCompleteCourse) return { allowed: true, message: '' };
      return {
        allowed: false,
        message: `Лимит тарифа "${planInfo.name}": ${limits.maxTrainedPerMonth} обученных в месяц. Перейдите на следующий тариф.`,
      };
    }
    if (canAddStudent) return { allowed: true, message: '' };
    return {
      allowed: false,
      message: `Лимит тарифа "${planInfo.name}": ${limits.maxStudents} учеников. Перейдите на следующий тариф.`,
    };
  }, [canCreateCourse, canAddStudent, canCompleteCourse, planInfo.name, limits]);

  return {
    plan,
    limits,
    usage: { coursesCount, studentsCount, trainedThisMonth },
    canCreateCourse,
    canAddStudent,
    canCompleteCourse,
    isAiEnabled: limits.aiEnabled,
    isAiAudioEnabled: limits.aiAudioEnabled,
    hasCourseSettings: limits.courseSettings,
    hasDocumentChecklist: limits.documentChecklist,
    hasVideoIdentification: limits.videoIdentification,
    storageLimit: limits.storageBytes,
    loading,
    planName: planInfo.name,
    checkLimit,
    refetch: fetchData,
  };
}
