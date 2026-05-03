import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { safeInvoke } from "@/utils/safeInvoke";
import { getPlanInfo, type SubscriptionPlan } from "@/constants/subscriptionPlans";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";

export interface Organization {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  inn: string | null;
  contact_name: string | null;
  ai_enabled: boolean;
  ai_provider?: string;
  frdo_enabled?: boolean;
  created_at: string;
  storage_limit_bytes?: number;
  notify_on_limit_80?: boolean;
  notify_on_limit_exceeded?: boolean;
  subscription_plan?: string;
  tariff_custom_label?: string;
  paid_until?: string;
}

export interface Student {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  login: string | null;
  enrollments: {
    course_title: string;
    progress: number;
    status: string;
    started_at: string;
  }[];
}

export interface Course {
  id: string;
  title: string;
  is_published: boolean;
  students_count: number;
  lessons_count: number;
  catalog_order: number;
}

export interface OrgDocument {
  id: string;
  name: string;
  type: string;
  file_url: string | null;
  created_at: string;
}

export interface UsageData {
  storage_bytes: number;
  ai_generations_count: number;
}

export interface UsageHistoryItem {
  month: string;
  month_label: string;
  ai_generations_count: number;
  storage_bytes: number;
}

export function useOrgDetailsView(organization: Organization) {
  const [activeTab, setActiveTab] = useState("courses");
  const [showSkillspaceImport, setShowSkillspaceImport] = useState(false);
  const [showSkillspaceBatchImport, setShowSkillspaceBatchImport] = useState(false);
  const [showStudentBulkImport, setShowStudentBulkImport] = useState(false);
  const [pendingEnrollmentsCount, setPendingEnrollmentsCount] = useState(0);
  const [skillspaceUpdateCourse, setSkillspaceUpdateCourse] = useState<{ id: string; title: string } | null>(null);
  const [loading, setLoading] = useState(false); // No longer block UI on initial load — progressive rendering
  const loadedTabs = useState(() => new Set<string>())[0];
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [documents, setDocuments] = useState<OrgDocument[]>([]);
  const [usage, setUsage] = useState<UsageData>({
    storage_bytes: 0,
    ai_generations_count: 0,
  });
  const [usageHistory, setUsageHistory] = useState<UsageHistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const planKey = (organization.subscription_plan as SubscriptionPlan) || 'free';
  const planInfo = getPlanInfo(planKey);

  const [settings, setSettings] = useState({
    ai_enabled: organization.ai_enabled,
    ai_provider: organization.ai_provider || "gigachat",
    frdo_enabled: organization.frdo_enabled ?? false,
    name: organization.name,
    email: organization.email,
    phone: organization.phone || "",
    inn: organization.inn || "",
    contact_name: organization.contact_name || "",
    storage_limit_bytes: organization.storage_limit_bytes || planInfo.limits.storageBytes,
    notify_on_limit_80: organization.notify_on_limit_80 ?? true,
    notify_on_limit_exceeded: organization.notify_on_limit_exceeded ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [credentials, setCredentials] = useState<{ login_email: string; login_password: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [generatingCredentials, setGeneratingCredentials] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [migratingCourseId, setMigratingCourseId] = useState<string | null>(null);
  const [migrationResult, setMigrationResult] = useState<Record<string, { status: 'success' | 'error'; message: string }>>({});
  const [orgBranding, setOrgBranding] = useState<{ coverUrl?: string; primaryColor?: string; logoUrl?: string }>({});
  const [tariffCustomLabel, setTariffCustomLabel] = useState(organization.tariff_custom_label || "");
  // paid_until приходит из БД как ISO timestamp, но <input type="date"> ждёт YYYY-MM-DD
  const [tariffPaidUntil, setTariffPaidUntil] = useState(
    organization.paid_until ? organization.paid_until.slice(0, 10) : ""
  );
  const [isSavingTariff, setIsSavingTariff] = useState(false);
  const [customLimits, setCustomLimits] = useState({
    maxCourses: (organization as any).custom_max_courses as number | null,
    maxStudents: (organization as any).custom_max_students as number | null,
    maxTrainedPerMonth: (organization as any).custom_max_trained_per_month as number | null,
    aiGenerationsLimit: (organization as any).custom_ai_generations_limit as number | null,
    storageLimitBytes: (organization as any).custom_storage_limit_bytes as number | null,
  });
  const [customCategories, setCustomCategories] = useState<string[]>(
    (organization as any).custom_enabled_categories || []
  );
  const [customPrice, setCustomPrice] = useState<number | null>((organization as any).custom_price ?? null);
  const [customDiscount, setCustomDiscount] = useState<number | null>((organization as any).custom_discount ?? null);

  const [stats, setStats] = useState({
    totalStudents: 0,
    totalCourses: 0,
    completedEnrollments: 0,
    averageProgress: 0,
  });

  // Limits
  const storageLimitPercent = (usage.storage_bytes / settings.storage_limit_bytes) * 100;
  const aiGenerationsLimit = planKey === 'free' ? 3 : Infinity;
  const aiGenerationsPercent = aiGenerationsLimit === Infinity ? 0 : (usage.ai_generations_count / aiGenerationsLimit) * 100;
  const isStorageWarning = storageLimitPercent >= 80;
  const isStorageExceeded = storageLimitPercent >= 100;
  const isAiGenWarning = aiGenerationsLimit !== Infinity && aiGenerationsPercent >= 80;
  const isAiGenExceeded = aiGenerationsLimit !== Infinity && aiGenerationsPercent >= 100;
  const shouldBlockAI = isAiGenExceeded;

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleCourseDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = courses.findIndex(c => c.id === active.id);
    const newIndex = courses.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(courses, oldIndex, newIndex);
    setCourses(reordered);
    const updates = reordered.map((c, i) =>
      supabase.from("courses").update({ catalog_order: i } as any).eq("id", c.id)
    );
    await Promise.all(updates);
  }, [courses]);

  const fetchStudents = useCallback(async () => {
    try {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, login")
        .eq("organization_id", organization.id);
      if (error) { console.error("Error fetching students:", error); return; }
      if (!profiles || profiles.length === 0) {
        setStudents([]);
        setStats(prev => ({ ...prev, totalStudents: 0 }));
        return;
      }
      const { data: orgCourses } = await supabase
        .from("courses").select("id, title").eq("organization_id", organization.id);
      const courseIds = (orgCourses || []).map(c => c.id);
      const coursesMap: Record<string, string> = Object.fromEntries(
        (orgCourses || []).map(c => [c.id, c.title])
      );
      let enrollments: any[] = [];
      if (courseIds.length > 0) {
        const { data: enrollmentsData, error: enrollError } = await supabase
          .from("enrollments")
          .select("user_id, course_id, progress, status, started_at")
          .in("course_id", courseIds);
        if (!enrollError) enrollments = enrollmentsData || [];
      }
      const studentsWithEnrollments = profiles.map(profile => ({
        ...profile,
        enrollments: enrollments
          .filter(e => e.user_id === profile.user_id)
          .map(e => ({
            course_title: coursesMap[e.course_id] || "Неизвестный курс",
            progress: e.progress, status: e.status, started_at: e.started_at,
          })),
      }));
      setStudents(studentsWithEnrollments);
      const totalEnrollments = enrollments.length;
      const completedEnrollments = enrollments.filter(e => e.status === "completed").length;
      const avgProgress = totalEnrollments > 0
        ? enrollments.reduce((sum, e) => sum + (e.progress || 0), 0) / totalEnrollments : 0;
      setStats(prev => ({ ...prev, totalStudents: profiles.length, completedEnrollments, averageProgress: Math.round(avgProgress) }));
    } catch (err) { console.error("Error in fetchStudents:", err); }
  }, [organization.id]);

  const fetchCourses = useCallback(async () => {
    // Single query with embedded counts — eliminates N+1 (was 1 + 2*N requests)
    const { data: coursesData, error } = await supabase
      .from("courses")
      .select("id, title, is_published, catalog_order, lessons(count), enrollments(count)")
      .eq("organization_id", organization.id)
      .order("catalog_order", { ascending: true });
    if (error) { console.error("Error fetching courses:", error); return; }
    const coursesWithStats = (coursesData || []).map((c: any) => ({
      id: c.id,
      title: c.title,
      is_published: c.is_published,
      catalog_order: c.catalog_order || 0,
      lessons_count: c.lessons?.[0]?.count || 0,
      students_count: c.enrollments?.[0]?.count || 0,
    }));
    setCourses(coursesWithStats);
    setStats(prev => ({ ...prev, totalCourses: coursesData?.length || 0 }));
  }, [organization.id]);

  const fetchDocuments = useCallback(async () => {
    const { data, error } = await supabase
      .from("org_documents").select("*").eq("organization_id", organization.id)
      .order("created_at", { ascending: false });
    if (!error) setDocuments(data || []);
  }, [organization.id]);

  const fetchCredentials = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_decrypted_org_credentials", { p_organization_id: organization.id });
      if (!error && data && data.length > 0) setCredentials(data[0]);
    } catch (err) { console.error("Error fetching credentials:", err); }
  }, [organization.id]);

  const fetchUsage = useCallback(async () => {
    // Read pre-aggregated values from organization_usage instead of scanning all storage buckets.
    // Storage scanning is slow (50-150 list requests) and is now done by a background recalculation.
    const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
    const { data: usageRow } = await supabase
      .from("organization_usage")
      .select("ai_generations_count, storage_bytes")
      .eq("organization_id", organization.id)
      .eq("month_start", currentMonth)
      .maybeSingle();
    setUsage({
      storage_bytes: (usageRow as any)?.storage_bytes || 0,
      ai_generations_count: (usageRow as any)?.ai_generations_count || 0,
    });
  }, [organization.id]);

  const [recalculatingStorage, setRecalculatingStorage] = useState(false);
  const recalculateStorage = useCallback(async () => {
    // On-demand storage recalculation — scans buckets client-side.
    // Heavy (50-150 storage list requests), so run only when user explicitly asks.
    setRecalculatingStorage(true);
    try {
      let totalBytes = 0;
      const scanPath = async (client: any, bucket: string, prefix: string, depth = 0) => {
        try {
          const { data: items } = await client.storage.from(bucket).list(prefix, { limit: 500 });
          if (!items) return;
          for (const f of items) {
            if (f.id === null && depth < 2) await scanPath(client, bucket, `${prefix}/${f.name}`, depth + 1);
            else if (f.id !== null) totalBytes += (f.metadata as any)?.size || 0;
          }
        } catch { /* bucket/path doesn't exist */ }
      };
      const { data: orgCourses } = await supabase.from("courses").select("id").eq("organization_id", organization.id);
      const courseIds = orgCourses?.map(c => c.id) || [];
      const courseScans = courseIds.flatMap(courseId => [
        scanPath(supabase, "course-files", courseId),
        scanPath(supabase, "presentations", courseId),
      ]);
      const orgScans = [
        scanPath(supabase, "org-documents", organization.id),
        scanPath(supabase, "company-documents", organization.id),
        scanPath(supabase, "org-branding", organization.id),
        scanPath(supabase, "library-files", `library/${organization.id}`),
        scanPath(supabase, "billing-documents", organization.id),
        scanPath(supabase, "student-documents", organization.id),
      ];
      await Promise.all([...courseScans, ...orgScans]);
      try {
        const { data: config } = await safeInvoke<any>("get-external-storage-config");
        if (config?.configured && config?.url && config?.key) {
          const { createClient } = await import("@supabase/supabase-js");
          const extClient = createClient(config.url, config.key);
          await Promise.all(courseIds.map(courseId => scanPath(extClient, "course-videos", courseId)));
        }
      } catch { /* external not configured */ }
      setUsage(prev => ({ ...prev, storage_bytes: totalBytes }));
      // Persist to organization_usage so future opens show this value instantly
      const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
      await supabase.from("organization_usage").upsert({
        organization_id: organization.id,
        month_start: currentMonth,
        storage_bytes: totalBytes,
      } as any, { onConflict: "organization_id,month_start" });
      toast.success("Хранилище пересчитано");
    } catch (err) {
      console.error("Recalc storage error:", err);
      toast.error("Не удалось пересчитать хранилище");
    } finally {
      setRecalculatingStorage(false);
    }
  }, [organization.id]);

  const fetchUsageHistory = useCallback(async () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const startDate = sixMonthsAgo.toISOString().slice(0, 7) + "-01";
    const { data, error } = await supabase
      .from("organization_usage").select("month_start, ai_generations_count, storage_bytes")
      .eq("organization_id", organization.id).gte("month_start", startDate).order("month_start", { ascending: true });
    if (error) { console.error("Error fetching usage history:", error); return; }
    const months: UsageHistoryItem[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = date.toISOString().slice(0, 10);
      const existingData = data?.find(d => d.month_start === monthStr);
      months.push({
        month: monthStr,
        month_label: format(date, "MMM yy", { locale: ru }),
        ai_generations_count: (existingData as any)?.ai_generations_count || 0,
        storage_bytes: existingData?.storage_bytes || 0,
      });
    }
    setUsageHistory(months);
  }, [organization.id]);

  const fetchBranding = useCallback(async () => {
    const { data } = await supabase.from("organizations").select("branding").eq("id", organization.id).single();
    if (data?.branding) {
      const b = data.branding as any;
      setOrgBranding({ coverUrl: b.coverUrl || b.cover_url, primaryColor: b.primaryColor || b.primary_color, logoUrl: b.logoUrl || b.logo_url });
    }
  }, [organization.id]);

  const fetchPendingEnrollmentsCount = useCallback(async () => {
    const { count } = await supabase
      .from("pending_enrollments").select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id).eq("status", "pending");
    setPendingEnrollmentsCount(count || 0);
  }, [organization.id]);

  // Initial load — only essentials needed for header and the default tab.
  // Header: branding. Default tab "courses": fetchCourses. Stats badge: usage.
  useEffect(() => {
    loadedTabs.clear();
    fetchBranding();
    fetchUsage();
    fetchCourses();
    loadedTabs.add("courses");
  }, [organization.id, fetchBranding, fetchUsage, fetchCourses, loadedTabs]);

  // Lazy-load per-tab data when user opens a tab for the first time
  useEffect(() => {
    if (loadedTabs.has(activeTab)) return;
    loadedTabs.add(activeTab);
    switch (activeTab) {
      case "students":
        fetchStudents();
        fetchPendingEnrollmentsCount();
        break;
      case "courses":
        fetchCourses();
        break;
      case "overview":
        fetchUsageHistory();
        break;
      case "settings":
        fetchCredentials();
        fetchDocuments();
        break;
      case "history":
      case "comments":
      case "reminders":
      case "tariffs":
        // these panels fetch their own data internally
        break;
    }
  }, [activeTab, loadedTabs, fetchStudents, fetchCourses, fetchUsageHistory, fetchCredentials, fetchDocuments, fetchPendingEnrollmentsCount]);

  const saveTariffSettings = async () => {
    setIsSavingTariff(true);
    try {
      const updatePayload: Record<string, unknown> = {
        tariff_custom_label: tariffCustomLabel || null, paid_until: tariffPaidUntil || null,
        custom_max_courses: customLimits.maxCourses, custom_max_students: customLimits.maxStudents,
        custom_max_trained_per_month: customLimits.maxTrainedPerMonth,
        custom_ai_generations_limit: customLimits.aiGenerationsLimit,
        custom_storage_limit_bytes: customLimits.storageLimitBytes,
        custom_enabled_categories: customCategories, custom_price: customPrice, custom_discount: customDiscount,
      };
      const { error } = await supabase.from("organizations").update(updatePayload as any).eq("id", organization.id);
      if (error) throw error;
      toast.success("Тарифные настройки сохранены");
    } catch (err) { console.error(err); toast.error("Ошибка сохранения тарифных настроек"); }
    finally { setIsSavingTariff(false); }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const aiEnabled = shouldBlockAI ? false : settings.ai_enabled;
      const { error } = await supabase.from("organizations").update({
        name: settings.name, email: settings.email, phone: settings.phone || null,
        inn: settings.inn || null, contact_name: settings.contact_name || null,
        ai_enabled: aiEnabled, ai_provider: settings.ai_provider, frdo_enabled: settings.frdo_enabled,
        storage_limit_bytes: settings.storage_limit_bytes,
        notify_on_limit_80: settings.notify_on_limit_80, notify_on_limit_exceeded: settings.notify_on_limit_exceeded,
      } as any).eq("id", organization.id);
      if (error) throw error;
      if (shouldBlockAI && settings.ai_enabled) toast.success("Настройки сохранены. ИИ-помощник заблокирован из-за превышения лимита генераций.");
      else toast.success("Настройки сохранены");
    } catch (error) { console.error("Error saving settings:", error); toast.error("Ошибка сохранения настроек"); }
    finally { setIsSaving(false); }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Б";
    const k = 1024;
    const sizes = ["Б", "КБ", "МБ", "ГБ"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const filteredStudents = students.filter(s => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (s.full_name?.toLowerCase() || "").includes(query) ||
      (s.email?.toLowerCase() || "").includes(query) ||
      (s.login?.toLowerCase() || "").includes(query);
  });

  return {
    activeTab, setActiveTab, loading, students, courses, setCourses, documents, usage, usageHistory,
    searchQuery, setSearchQuery, settings, setSettings, isSaving, credentials, setCredentials,
    showPassword, setShowPassword, generatingCredentials, setGeneratingCredentials,
    resettingPassword, setResettingPassword, migratingCourseId, setMigratingCourseId,
    migrationResult, setMigrationResult, orgBranding, tariffCustomLabel, setTariffCustomLabel,
    tariffPaidUntil, setTariffPaidUntil, isSavingTariff, customLimits, setCustomLimits,
    customCategories, setCustomCategories, customPrice, setCustomPrice, customDiscount, setCustomDiscount,
    stats, planKey, planInfo, storageLimitPercent, aiGenerationsLimit, aiGenerationsPercent,
    isStorageWarning, isStorageExceeded, isAiGenWarning, isAiGenExceeded, shouldBlockAI,
    dndSensors, handleCourseDragEnd, filteredStudents, formatBytes,
    saveTariffSettings, saveSettings, fetchCourses, fetchStudents, fetchPendingEnrollmentsCount, recalculateStorage, recalculatingStorage,
    showSkillspaceImport, setShowSkillspaceImport, showSkillspaceBatchImport, setShowSkillspaceBatchImport,
    showStudentBulkImport, setShowStudentBulkImport, pendingEnrollmentsCount,
    skillspaceUpdateCourse, setSkillspaceUpdateCourse,
  };
}
