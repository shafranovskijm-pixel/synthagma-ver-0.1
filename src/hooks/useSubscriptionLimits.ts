import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPlanInfo, type SubscriptionPlan, type PlanLimits } from "@/constants/subscriptionPlans";

interface SubscriptionLimitsState {
  plan: SubscriptionPlan;
  limits: PlanLimits;
  usage: {
    coursesCount: number;
    studentsCount: number;
  };
  canCreateCourse: boolean;
  canAddStudent: boolean;
  isAiEnabled: boolean;
  isAiAudioEnabled: boolean;
  hasCourseSettings: boolean;
  hasDocumentChecklist: boolean;
  hasVideoIdentification: boolean;
  loading: boolean;
  planName: string;
  checkLimit: (type: 'course' | 'student') => { allowed: boolean; message: string };
}

export function useSubscriptionLimits(organizationId: string | null): SubscriptionLimitsState {
  const [plan, setPlan] = useState<SubscriptionPlan>('free');
  const [coursesCount, setCoursesCount] = useState(0);
  const [studentsCount, setStudentsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    try {
      const [orgResult, coursesResult, studentsResult] = await Promise.all([
        supabase
          .from("organizations")
          .select("subscription_plan")
          .eq("id", organizationId)
          .single(),
        supabase
          .from("courses")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId),
        supabase
          .from("profiles")
          .select("id, user_roles!inner(role)", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("user_roles.role", "student"),
      ]);

      if (orgResult.data?.subscription_plan) {
        setPlan(orgResult.data.subscription_plan as SubscriptionPlan);
      }
      setCoursesCount(coursesResult.count || 0);
      setStudentsCount(studentsResult.count || 0);
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
  const limits = planInfo.limits;

  const canCreateCourse = limits.maxCourses === -1 || coursesCount < limits.maxCourses;
  const canAddStudent = limits.maxStudents === -1 || studentsCount < limits.maxStudents;

  const checkLimit = useCallback((type: 'course' | 'student') => {
    if (type === 'course') {
      if (canCreateCourse) return { allowed: true, message: '' };
      return {
        allowed: false,
        message: `Лимит тарифа "${planInfo.name}": ${limits.maxCourses} ${limits.maxCourses === 1 ? 'курс' : 'курсов'}. Перейдите на следующий тариф.`,
      };
    }
    if (canAddStudent) return { allowed: true, message: '' };
    return {
      allowed: false,
      message: `Лимит тарифа "${planInfo.name}": ${limits.maxStudents} учеников. Перейдите на следующий тариф.`,
    };
  }, [canCreateCourse, canAddStudent, planInfo.name, limits]);

  return {
    plan,
    limits,
    usage: { coursesCount, studentsCount },
    canCreateCourse,
    canAddStudent,
    isAiEnabled: limits.aiEnabled,
    isAiAudioEnabled: limits.aiAudioEnabled,
    hasCourseSettings: limits.courseSettings,
    hasDocumentChecklist: limits.documentChecklist,
    hasVideoIdentification: limits.videoIdentification,
    loading,
    planName: planInfo.name,
    checkLimit,
  };
}
