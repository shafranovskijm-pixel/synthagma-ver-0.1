import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPlanInfo, type SubscriptionPlan, type PlanLimits } from "@/constants/subscriptionPlans";
import { ORG_FEATURE_CATALOG } from "@/constants/orgFeatureCatalog";
import { usePostpaidAccessProfile } from "@/hooks/usePostpaidAccessProfile";
import { postpaidPlanLimits } from "@/lib/postpaidAccess";
import type { LimitCheckResult } from "@/utils/limitToast";

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
  accessReady: boolean;
  loading: boolean;
  error: string | null;
  isPostpaid: boolean;
  planName: string;
  checkLimit: (type: 'course' | 'student' | 'trained' | 'course_settings') => LimitCheckResult;
  refetch: () => Promise<void>;
}

export function useSubscriptionLimits(organizationId: string | null): SubscriptionLimitsState {
  const postpaid = usePostpaidAccessProfile(organizationId);
  const activeOrganization = useRef(organizationId);
  activeOrganization.current = organizationId;
  const sequence = useRef(0);
  const [loadedOrganization, setLoadedOrganization] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<SubscriptionPlan>('free');
  const [coursesCount, setCoursesCount] = useState(0);
  const [studentsCount, setStudentsCount] = useState(0);
  const [trainedThisMonth, setTrainedThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [customOverrides, setCustomOverrides] = useState<{
    maxCourses: number | null;
    maxStudents: number | null;
    maxTrainedPerMonth: number | null;
    aiGenerationsLimit: number | null;
    storageLimitBytes: number | null;
  }>({ maxCourses: null, maxStudents: null, maxTrainedPerMonth: null, aiGenerationsLimit: null, storageLimitBytes: null });
  const [customEnabledCategories, setCustomEnabledCategories] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    if (activeOrganization.current !== organizationId) return;
    const request = ++sequence.current;
    const isCurrent = () => activeOrganization.current === organizationId && sequence.current === request;
    setLoading(!!organizationId);
    setError(null);
    if (!organizationId) {
      setLoadedOrganization(null);
      setLoading(false);
      return;
    }

    try {
      const [orgResult, coursesResult, capacityResult, trainedResult] = await Promise.all([
        supabase
          .from("organizations")
          .select("subscription_plan, custom_max_courses, custom_max_students, custom_max_trained_per_month, custom_ai_generations_limit, custom_storage_limit_bytes, custom_enabled_categories")
          .eq("id", organizationId)
          .single(),
        supabase
          .from("courses")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .is("system_key", null),
        // Canonical student count — active real students, honours custom_max_students.
        supabase.rpc("get_organization_student_capacity" as any, {
          p_organization_id: organizationId,
          p_requested_count: 0,
        }),
        supabase.rpc("count_org_completions_this_month" as any, { org_id: organizationId }),
      ]);

      if (!isCurrent()) return;
      if (orgResult.error || !orgResult.data || coursesResult.error || capacityResult.error || trainedResult.error) {
        throw new Error("subscription_limits_unconfirmed");
      }

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
        setCustomEnabledCategories(Array.isArray(d.custom_enabled_categories) ? d.custom_enabled_categories : []);
      }
      setCoursesCount(coursesResult.count || 0);
      const capRow: any = Array.isArray(capacityResult.data) ? capacityResult.data[0] : capacityResult.data;
      setStudentsCount(Number(capRow?.current_students) || 0);
      setTrainedThisMonth(Number(trainedResult.data) || 0);
      setLoadedOrganization(organizationId);
    } catch (error) {
      console.error("Error fetching subscription limits:", error);
      if (isCurrent()) setError("Не удалось проверить ограничения организации. Повторите проверку.");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchData();
    return () => { sequence.current++; };
  }, [fetchData]);

  // Realtime subscription for plan changes
  useEffect(() => {
    if (!organizationId) return;

    // Уникальное имя канала исключает коллизии при StrictMode/быстром ремаунте,
    // когда старый канал ещё не успел удалиться, а новый пытается переиспользовать имя.
    const uniqueId = `${organizationId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase.channel(`org-plan-${uniqueId}`);
    let active = true;

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'organizations',
          filter: `id=eq.${organizationId}`,
        },
        () => {
          if (!active || activeOrganization.current !== organizationId) return;
          void fetchData();
        }
      )
      .subscribe();

    return () => {
      active = false;
      try {
        supabase.removeChannel(channel);
      } catch {
        // канал уже удалён — игнорируем
      }
    };
  }, [organizationId, fetchData]);

  const currentData = loadedOrganization === organizationId && !!organizationId;
  const currentPlan = currentData ? plan : 'free';
  const planInfo = useMemo(() => getPlanInfo(currentPlan), [currentPlan]);
  const isPostpaid = !postpaid.error && postpaid.data?.active === true;
  const accessLoading = !!organizationId && (loading || postpaid.isLoading || (!currentData && !error));
  const accessError = error || (postpaid.error ? "Не удалось проверить условия постоплаты. Повторите проверку." : null);
  const accessReady = currentData && !accessLoading && !accessError;

  // Merge custom overrides with plan defaults + apply custom-enabled feature flags
  const limits: PlanLimits = useMemo(() => {
    if (isPostpaid && postpaid.data) return postpaidPlanLimits(postpaid.data);
    if (!currentData || !postpaid.data || postpaid.error) return { ...getPlanInfo('free').limits, salesCrmEnabled: false, webinarsEnabled: false, videoServicePlus: false };
    const merged: PlanLimits = {
      ...planInfo.limits,
      maxCourses: customOverrides.maxCourses ?? planInfo.limits.maxCourses,
      maxStudents: customOverrides.maxStudents ?? planInfo.limits.maxStudents,
      maxTrainedPerMonth: customOverrides.maxTrainedPerMonth ?? planInfo.limits.maxTrainedPerMonth,
      storageBytes: customOverrides.storageLimitBytes != null
        ? (customOverrides.storageLimitBytes === -1 ? -1 : customOverrides.storageLimitBytes)
        : planInfo.limits.storageBytes,
    };

    // Apply custom-enabled categories → flip planFlag to true
    for (const key of customEnabledCategories) {
      const def = ORG_FEATURE_CATALOG.find((f) => f.key === key);
      if (def?.planFlag) {
        (merged as any)[def.planFlag] = true;
      }
    }
    return merged;
  }, [planInfo, customOverrides, customEnabledCategories, isPostpaid, postpaid.data, postpaid.error, currentData]);

  const canCreateCourse = accessReady && (limits.maxCourses === -1 || coursesCount < limits.maxCourses);
  const canAddStudent = accessReady && (limits.maxStudents === -1 || studentsCount < limits.maxStudents);
  const canCompleteCourse = accessReady && (limits.maxTrainedPerMonth === -1 || trainedThisMonth < limits.maxTrainedPerMonth);

  const checkLimit = useCallback((type: 'course' | 'student' | 'trained' | 'course_settings'): LimitCheckResult => {
    if (!accessReady) return { allowed: false, reason: accessError ? "verification_error" : "checking", message: accessError || "Проверяем ограничения организации…" };
    if (type === 'course_settings') {
      return limits.courseSettings ? { allowed: true, message: '' } : {
        allowed: false,
        reason: "plan_feature",
        message: 'Настройки курсов доступны начиная с тарифа «Старт». Перейдите на следующий тариф.',
      };
    }
    if (type === 'course') {
      if (canCreateCourse) return { allowed: true, message: '' };
      return {
        allowed: false,
        reason: "quota",
        message: `Лимит тарифа "${planInfo.name}": ${limits.maxCourses} ${limits.maxCourses === 1 ? 'курс' : 'курсов'}. Перейдите на следующий тариф.`,
      };
    }
    if (type === 'trained') {
      if (canCompleteCourse) return { allowed: true, message: '' };
      return {
        allowed: false,
        reason: "quota",
        message: `Лимит тарифа "${planInfo.name}": ${limits.maxTrainedPerMonth} обученных в месяц. Перейдите на следующий тариф.`,
      };
    }
    if (canAddStudent) return { allowed: true, message: '' };
    return {
      allowed: false,
      reason: "quota",
      message: `Лимит тарифа "${planInfo.name}": ${limits.maxStudents} новых учеников в месяц. Перейдите на следующий тариф.`,
    };
  }, [canCreateCourse, canAddStudent, canCompleteCourse, planInfo.name, limits, accessReady, accessError]);

  return {
    plan: currentPlan,
    limits,
    usage: { coursesCount: currentData ? coursesCount : 0, studentsCount: currentData ? studentsCount : 0, trainedThisMonth: currentData ? trainedThisMonth : 0, storageUsedBytes: 0 },
    canCreateCourse,
    canAddStudent,
    canCompleteCourse,
    isAiEnabled: limits.aiEnabled,
    isAiAudioEnabled: limits.aiAudioEnabled,
    hasCourseSettings: limits.courseSettings,
    hasDocumentChecklist: limits.documentChecklist,
    hasVideoIdentification: limits.videoIdentification,
    storageLimit: limits.storageBytes,
    accessReady,
    loading: accessLoading,
    error: accessError,
    isPostpaid,
    planName: isPostpaid ? "Постоплата по договору" : planInfo.name,
    checkLimit,
    refetch: async () => { await Promise.all([fetchData(), postpaid.refetch()]); },
  };
}
