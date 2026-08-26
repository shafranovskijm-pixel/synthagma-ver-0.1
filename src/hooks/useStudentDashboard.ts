import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { supabase } from "@/integrations/supabase/client";
import { cacheDashboardData, getCachedDashboardData } from "@/utils/courseCache";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { useStudentDashboardSnapshot } from "@/hooks/useStudentDashboardSnapshot";


export interface StudentCourse {
  id: string;
  title: string;
  description: string | null;
  duration: string | null;
  progress: number;
  totalLessons: number;
  completedLessons: number;
  status: "in_progress" | "completed" | "locked";
  skip_video_identification?: boolean;
  cover_image_url?: string | null;
}

export interface CatalogCourse {
  id: string;
  title: string;
  description: string | null;
  cover_image_url?: string | null;
  duration?: string | null;
  price?: number;
  category_id?: string | null;
  category_name?: string | null;
  category_color?: string | null;
  total_lessons?: number;
  is_enrolled?: boolean;
  progress?: number;
  completed_lessons?: number;
  status?: "in_progress" | "completed" | "not_enrolled" | "pending";
  external_card_url?: string | null;
  require_enrollment_approval?: boolean;
}

interface Profile {
  full_name: string | null;
  organization_name: string | null;
  organization_id: string | null;
  org_description?: string | null;
}

interface Branding {
  coverUrl: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  showOrgName: boolean;
}

interface DashboardSettings {
  showLibrary: boolean;
  showAchievements: boolean;
  showAiChat: boolean;
  showRadio: boolean;
  showAnnouncements: boolean;
  catalogMode: "catalog" | "assigned";
  studentTheme: string | null;
}


type RequiredDocumentType = "passport" | "birth_certificate" | "snils" | "education_document";

interface DocumentsProgress {
  completed: number;
  total: number;
  requiredTypes: RequiredDocumentType[];
}

export interface DashboardLoadError {
  message: string;
  /** true, когда вместо свежего ответа оставлены последние корректные данные. */
  usingCachedData: boolean;
}

const DEFAULT_REQUIRED_DOCUMENT_TYPES: RequiredDocumentType[] = ["passport", "snils", "education_document"];

function resolveRequiredDocumentTypes(courses: Array<{ landing_content?: any }>): RequiredDocumentType[] {
  if (!courses.length) return DEFAULT_REQUIRED_DOCUMENT_TYPES;

  const required = new Set<RequiredDocumentType>();
  let hasDocumentSettings = false;

  for (const course of courses) {
    const dc = course.landing_content?.document_collection;
    if (!dc || typeof dc !== "object") {
      DEFAULT_REQUIRED_DOCUMENT_TYPES.forEach(type => required.add(type));
      continue;
    }

    hasDocumentSettings = true;
    if (dc.enabled === false) continue;
    if (dc.passport !== false) required.add("passport");
    if (dc.snils !== false) required.add("snils");
    if (dc.education_document !== false) required.add("education_document");
    if (dc.birth_certificate === true) required.add("birth_certificate");
  }

  return hasDocumentSettings ? Array.from(required) : DEFAULT_REQUIRED_DOCUMENT_TYPES;
}


interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const initialMessages: ChatMessage[] = [
  { role: "assistant", content: "Привет! Я ИИ-помощник платформы СИНТАГМА. Чем могу помочь с обучением?" },
];

export function useStudentDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, signOut } = useAuth();
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<"catalog" | "library" | "chat" | "store" | "profile">(() => {
    const tabFromUrl = searchParams.get("tab");
    if (tabFromUrl === "profile") return "profile";
    return "catalog";
  });
  const [initialTabApplied, setInitialTabApplied] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [courses, setCourses] = useState<StudentCourse[]>([]);
  const [catalogCourses, setCatalogCourses] = useState<CatalogCourse[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>({ showLibrary: true, showAchievements: true, showAiChat: true, showRadio: false, showAnnouncements: false, catalogMode: "catalog", studentTheme: null });
  const [loading, setLoading] = useState(true);
  const [dashboardLoadError, setDashboardLoadError] = useState<DashboardLoadError | null>(null);
  const [hasDashboardData, setHasDashboardData] = useState(false);
  const [isRetryingDashboard, setIsRetryingDashboard] = useState(false);
  const dashboardDataOwnerRef = useRef<string | null>(null);
  const dashboardOrganizationRef = useRef<string | null | undefined>(undefined);
  const activeDashboardUserRef = useRef<string | null>(null);
  const dashboardRequestGenerationRef = useRef(0);
  const dashboardRetryInFlightRef = useRef<{ uid: string; token: symbol; promise: Promise<void> } | null>(null);
  const snapshotErrorRef = useRef<unknown>(null);
  const legacyDashboardErrorRef = useRef<{
    uid: string;
    organizationId: string | null | undefined;
    error: DashboardLoadError;
  } | null>(null);
  const legacyDashboardFreshScopeRef = useRef<{
    uid: string;
    organizationId: string | null;
    observedSnapshotVersion: number;
  } | null>(null);
  const snapshotDataVersionRef = useRef<{
    data: unknown;
    version: number;
  }>({ data: undefined, version: 0 });
  const [totalTimeSpent, setTotalTimeSpent] = useState(0);
  const [totalCompletedLessons, setTotalCompletedLessons] = useState(0);
  const [isPreviewMode] = useState(false);
  const [isAdminView, setIsAdminView] = useState(() => {
    const adminView = localStorage.getItem('adminViewAsStudent');
    if (adminView) {
      try { JSON.parse(adminView); return true; } catch { return false; }
    }
    return false;
  });
  const [adminViewStudentName, setAdminViewStudentName] = useState(() => {
    const adminView = localStorage.getItem('adminViewAsStudent');
    if (adminView) {
      try { return JSON.parse(adminView).name || ''; } catch { return ''; }
    }
    return '';
  });
  const [showVideoIdentification, setShowVideoIdentification] = useState(false);
  const [showConsentForm, setShowConsentForm] = useState(false);
  const [showDocumentsUpload, setShowDocumentsUpload] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [documentsProgress, setDocumentsProgress] = useState<DocumentsProgress>({ completed: 0, total: 3, requiredTypes: DEFAULT_REQUIRED_DOCUMENT_TYPES });
  const [isVideoIdentified, setIsVideoIdentified] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [orgPlan, setOrgPlan] = useState<string>("free");

  // Onboarding flag теперь приходит из get_student_dashboard_snapshot —
  // отдельный запрос к profiles больше не нужен.

  const handleOnboardingClose = async () => {
    setShowOnboarding(false);
    if (user) await supabase.from("profiles").update({ onboarding_completed: true }).eq("user_id", user.id);
  };

  const [targetUserId, setTargetUserId] = useState<string | null>(null);

  useEffect(() => {
    const adminView = localStorage.getItem('adminViewAsStudent');
    if (adminView) {
      try {
        const data = JSON.parse(adminView);
        if (data.userId) setTargetUserId(data.userId);
      } catch (e) { /* ignore */ }
    }
  }, []);

  const effectiveUserId = targetUserId || user?.id || null;

  // ⚡ Быстрый снимок дашборда одним RPC — выставляет данные ДО окончания тяжёлого loadData.
  // Если снапшот пришёл раньше — пользователь видит контент мгновенно, фоновый loadData потом
  // обновит каталог и прочие детали.
  const { data: snapshot, error: snapshotError, refetch: refetchSnapshot } = useStudentDashboardSnapshot(effectiveUserId);
  // Ошибка/её очистка не делают удерживаемый React Query data новым снимком.
  // Версию повышаем только при смене самого data, чтобы более свежий legacy
  // ответ мог стать авторитетным, пока старый snapshot остаётся в кеше.
  if (snapshotDataVersionRef.current.data !== snapshot) {
    snapshotDataVersionRef.current = {
      data: snapshot,
      version: snapshotDataVersionRef.current.version + 1,
    };
  }
  const snapshotDataVersion = snapshotDataVersionRef.current.version;
  const currentSnapshotOrganizationId = (
    effectiveUserId
    && snapshot?.profile?.user_id === effectiveUserId
  ) ? (snapshot.profile.organization_id ?? null) : undefined;
  useEffect(() => {
    snapshotErrorRef.current = snapshotError ?? null;
  }, [snapshotError]);
  useEffect(() => {
    if (!snapshot) return;
    // React Query сохраняет предыдущий data при ошибке refetch. Не применяем
    // снимок другого ученика после смены effective uid/admin-view.
    if (!effectiveUserId || snapshot.profile?.user_id !== effectiveUserId) return;
    const snapshotOrganizationId = snapshot.profile.organization_id ?? null;
    const freshLegacyScope = legacyDashboardFreshScopeRef.current;
    // React Query может удерживать старый data вместе с refetch error. Такой
    // snapshot не является новой границей арендатора и не должен блокировать
    // или перезаписывать подтверждённый legacy-ответ.
    if (snapshotError) return;
    // Snapshot — bootstrap-источник. После полного свежего legacy-ответа того
    // же uid/org он уже не вправе откатывать курсы и прогресс назад.
    if (
      freshLegacyScope?.uid === effectiveUserId
      && freshLegacyScope.organizationId === snapshotOrganizationId
    ) return;
    if (freshLegacyScope?.uid === effectiveUserId) {
      // Удерживаемый старый snapshot A не может снова стать авторитетнее
      // успешного legacy-ответа B. Новая tenant boundary подтверждается только
      // новым data, которого legacy-запрос ещё не наблюдал.
      if (snapshotDataVersion <= freshLegacyScope.observedSnapshotVersion) return;
      // Успешный snapshot другого org — реальная новая tenant boundary.
      legacyDashboardFreshScopeRef.current = null;
    }
    const scopedLegacyError = legacyDashboardErrorRef.current;
    const matchingLegacyError = (
      scopedLegacyError?.uid === effectiveUserId
      && (
        scopedLegacyError.organizationId === undefined
        || scopedLegacyError.organizationId === snapshotOrganizationId
      )
    ) ? scopedLegacyError.error : null;
    const switchingSnapshotOwner = (
      dashboardDataOwnerRef.current !== effectiveUserId
      || (
        dashboardDataOwnerRef.current === effectiveUserId
        && dashboardOrganizationRef.current !== undefined
        && dashboardOrganizationRef.current !== snapshotOrganizationId
      )
    );
    if (switchingSnapshotOwner) {
      // Инвалидируем любой pending legacy load предыдущего uid/org до того,
      // как применить новый snapshot. Иначе поздний org A мог перезаписать B.
      dashboardRequestGenerationRef.current += 1;
      dashboardRetryInFlightRef.current = null;
      setIsRetryingDashboard(false);
      // Новый подтверждённый snapshot — атомарная граница арендатора. Поля,
      // которых нет в snapshot B, не должны наследоваться от ученика A.
      setCatalogCourses([]);
      setCategories([]);
      setMessages(initialMessages);
      setInputValue("");
      setShowVideoIdentification(false);
      setShowConsentForm(false);
      setShowDocumentsUpload(false);
      setShowAchievements(false);
      if (!matchingLegacyError) legacyDashboardErrorRef.current = null;
    }
    dashboardOrganizationRef.current = snapshotOrganizationId;
    setProfile({
      full_name: snapshot.profile.full_name ?? null,
      organization_id: snapshot.profile.organization_id ?? null,
      organization_name: snapshot.org?.name ?? null,
      org_description: snapshot.org?.description ?? null,
    });
    if (snapshot.org?.branding && typeof snapshot.org.branding === 'object') {
      const b = snapshot.org.branding as Record<string, unknown>;
      setBranding({
        coverUrl: (b.coverUrl as string) || '',
        primaryColor: (b.primaryColor as string) || '#0d9488',
        secondaryColor: (b.secondaryColor as string) || '#14b8a6',
        logoUrl: (b.logoUrl as string) || '',
        showOrgName: b.showOrgName !== false,
      });
    } else {
      setBranding(null);
    }
    if (snapshot.org?.student_dashboard_settings && typeof snapshot.org.student_dashboard_settings === 'object') {
      const s = snapshot.org.student_dashboard_settings as Record<string, unknown>;
      setDashboardSettings({
        showLibrary: s.showLibrary === true,
        showAchievements: s.showAchievements === true,
        showAiChat: s.showAiChat === true,
        showRadio: s.showRadio === true,
        showAnnouncements: s.showAnnouncements === true,

        catalogMode: (s.catalogMode as "catalog" | "assigned") || "catalog",
        studentTheme: (s.studentTheme as string | null) ?? null,
      });
    } else {
      setDashboardSettings({ showLibrary: true, showAchievements: true, showAiChat: true, showRadio: false, showAnnouncements: false, catalogMode: "catalog", studentTheme: null });
    }
    setOrgPlan(snapshot.org?.subscription_plan || "free");
    if (snapshot.enrollments && snapshot.enrollments.length >= 0) {
      const mapped: StudentCourse[] = snapshot.enrollments.map((e) => ({
        id: e.course_id,
        title: e.title,
        description: e.description,
        duration: e.duration,
        progress: Math.min(e.progress || 0, 100),
        totalLessons: Number(e.total_lessons) || 0,
        completedLessons: Number(e.completed_lessons) || 0,
        status: (e.status === "completed" ? "completed" : "in_progress") as StudentCourse["status"],
        skip_video_identification: e.skip_video_identification || false,
        cover_image_url: e.cover_image_url ?? null,
      }));
      setCourses(mapped);
      dashboardDataOwnerRef.current = effectiveUserId;
      setHasDashboardData(true);
      // Snapshot подтверждает профиль и зачисления, но не каталог. Ошибка
      // legacy-загрузки каталога для того же uid/org должна оставаться видимой.
      setDashboardLoadError(matchingLegacyError);
      setTotalCompletedLessons(mapped.reduce((sum, c) => sum + c.completedLessons, 0));
      setTotalTimeSpent(snapshot.enrollments.reduce((sum, e) => sum + (e.time_spent || 0), 0));
    }
    if (snapshot.documents) {
      setDocumentsProgress({
        completed: [snapshot.documents.has_passport, snapshot.documents.has_snils, snapshot.documents.has_education].filter(Boolean).length,
        total: 3,
        requiredTypes: DEFAULT_REQUIRED_DOCUMENT_TYPES,
      });
    } else {
      setDocumentsProgress({ completed: 0, total: DEFAULT_REQUIRED_DOCUMENT_TYPES.length, requiredTypes: DEFAULT_REQUIRED_DOCUMENT_TYPES });
    }
    setIsVideoIdentified(!!snapshot.video_identified);
    setShowOnboarding(snapshot.profile.onboarding_completed === false && !isAdminView);
    // Снимок отдаёт основные данные → можно отключить спиннер сразу
    setLoading(false);
  }, [snapshot, snapshotError, snapshotDataVersion, isAdminView, effectiveUserId]);

  useEffect(() => {
    if (effectiveUserId) { loadData(); }
  }, [effectiveUserId, currentSnapshotOrganizationId]);

  useEffect(() => {
    if (user && !isAdminView) {
      // fire-and-forget — не блокируем первый рендер
      trackUserVisit();
      checkNewAchievements();
    }
  }, [effectiveUserId]);

  const trackUserVisit = () => {
    if (!user) return;
    // не await — пусть выполняется в фоне
    supabase.rpc('track_user_visit', { p_user_id: user!.id })
      .then(() => {})
      .then(undefined, (e) => console.error("Error tracking visit:", e));
  };

  const checkNewAchievements = async () => {
    if (!user || isAdminView) return;
    try {
      const { data: unseenAchievements } = await supabase.from("user_achievements").select("id, achievements (name, description, icon, color, rarity)").eq("user_id", user.id).eq("is_seen", false);
      if (unseenAchievements && unseenAchievements.length > 0) {
        const rarityEmoji: Record<string, string> = { common: "⭐", rare: "💎", epic: "🏆", legendary: "👑" };
        unseenAchievements.forEach((ua, index) => {
          const achievement = ua.achievements as any;
          if (!achievement) return;
          setTimeout(() => {
            toast.success(`${rarityEmoji[achievement.rarity] || "🎖️"} Новое достижение!`, {
              description: `${achievement.name}: ${achievement.description}`,
              duration: 5000,
              style: { borderLeft: `4px solid ${achievement.color}` }
            });
          }, index * 1500);
        });
        await supabase.from("user_achievements").update({ is_seen: true }).in("id", unseenAchievements.map(ua => ua.id));
      }
    } catch (e) { console.error("Error checking achievements:", e); }
  };

  const loadData = async () => {
    const uid = effectiveUserId;
    if (!uid) { setLoading(false); return false; }
    const previousActiveUid = activeDashboardUserRef.current;
    activeDashboardUserRef.current = uid;
    const requestGeneration = ++dashboardRequestGenerationRef.current;
    const isCurrentRequest = () => (
      activeDashboardUserRef.current === uid
      && dashboardRequestGenerationRef.current === requestGeneration
    );
    const switchingUser = (
      (previousActiveUid && previousActiveUid !== uid)
      || (dashboardDataOwnerRef.current && dashboardDataOwnerRef.current !== uid)
    );
    if (switchingUser) {
      legacyDashboardErrorRef.current = null;
      legacyDashboardFreshScopeRef.current = null;
      if (dashboardRetryInFlightRef.current?.uid !== uid) {
        dashboardRetryInFlightRef.current = null;
        setIsRetryingDashboard(false);
      }
      // Никогда не показываем кеш/данные одного ученика другому при смене
      // цели режима "просмотр как ученик".
      setCatalogCourses([]);
      setCategories([]);
      setMessages(initialMessages);
      setInputValue("");
      setShowVideoIdentification(false);
      setShowConsentForm(false);
      setShowDocumentsUpload(false);
      setShowAchievements(false);
      // Эффект snapshot выполняется перед legacy loadData. Если он уже дал
      // подтверждённые данные именно B, сохраняем их; очищаем только остатки A,
      // которые snapshot не покрывает. Иначе сбрасываем весь tenant-state.
      if (dashboardDataOwnerRef.current !== uid) {
        dashboardDataOwnerRef.current = null;
        dashboardOrganizationRef.current = undefined;
        setHasDashboardData(false);
        setCourses([]);
        setProfile(null);
        setBranding(null);
        setDashboardSettings({ showLibrary: true, showAchievements: true, showAiChat: true, showRadio: false, showAnnouncements: false, catalogMode: "catalog", studentTheme: null });
        setTotalTimeSpent(0);
        setTotalCompletedLessons(0);
        setDocumentsProgress({ completed: 0, total: DEFAULT_REQUIRED_DOCUMENT_TYPES.length, requiredTypes: DEFAULT_REQUIRED_DOCUMENT_TYPES });
        setIsVideoIdentified(false);
        setOrgPlan("free");
        setDashboardLoadError(null);
        setShowOnboarding(false);
      }
    }
    const hasCurrentData = dashboardDataOwnerRef.current === uid;
    setLoading(!hasCurrentData);


    // Safety timeout: never show spinner for more than 15 seconds
    let requestSettled = false;
    const safetyTimer = setTimeout(() => {
      if (requestSettled || !isCurrentRequest()) return;
      const usingCachedData = dashboardDataOwnerRef.current === uid;
      const timeoutError: DashboardLoadError = {
        message: 'Не удалось загрузить курсы. Проверьте соединение и повторите попытку.',
        usingCachedData,
      };
      legacyDashboardErrorRef.current = {
        uid,
        organizationId: dashboardOrganizationRef.current,
        error: timeoutError,
      };
      setDashboardLoadError(timeoutError);
      setLoading(false);
    }, 15000);

    try {
      // Параллельно: профиль + labor_safety + enrollments — независимые источники данных
      const [profileRes, laborRes, enrollmentsRes] = await Promise.all([
        supabase.from("profiles").select("full_name, organization_id, organizations(name, description, branding, student_dashboard_settings, subscription_plan)").eq("user_id", uid).maybeSingle(),
        supabase.from("labor_safety_profiles").select("organization_id, full_name, organizations(name, branding, student_dashboard_settings, subscription_plan)").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("enrollments").select("id, progress, status, time_spent, course_id, courses(id, title, description, duration, skip_video_identification, cover_image_url, landing_content)").eq("user_id", uid),
      ]);

      if (!isCurrentRequest()) return false;

      const initialLoadError = profileRes.error || laborRes.error || enrollmentsRes.error;
      if (initialLoadError || !Array.isArray(enrollmentsRes.data)) {
        const cause = initialLoadError instanceof Error
          ? initialLoadError
          : new Error('enrollments_unavailable');
        throw cause;
      }

      const profileData = profileRes.data;
      const laborProfile = laborRes.data;
      let effectiveOrgId: string | null = profileData?.organization_id || null;
      const profileOrg = profileData?.organizations as any;
      let effectiveOrgName: string | null = profileOrg?.name || null;
      let effectiveOrgDescription: string | null = profileOrg?.description || null;
      let effectiveBranding: any = profileOrg?.branding ?? null;
      let effectiveDashboardSettings: any = profileOrg?.student_dashboard_settings ?? null;
      let effectiveOrgPlan = profileOrg?.subscription_plan || "free";
      let effectiveFullName: string | null = profileData?.full_name || null;

      if (laborProfile?.organization_id) {
        const organizationChangedByLabor = effectiveOrgId !== laborProfile.organization_id;
        effectiveOrgId = laborProfile.organization_id;
        const laborOrg = laborProfile.organizations as any;
        effectiveOrgName = laborOrg?.name || (organizationChangedByLabor ? null : effectiveOrgName);
        effectiveOrgDescription = organizationChangedByLabor ? null : effectiveOrgDescription;
        effectiveBranding = laborOrg?.branding ?? (organizationChangedByLabor ? null : effectiveBranding);
        effectiveDashboardSettings = laborOrg?.student_dashboard_settings ?? (organizationChangedByLabor ? null : effectiveDashboardSettings);
        effectiveOrgPlan = laborOrg?.subscription_plan || (organizationChangedByLabor ? "free" : effectiveOrgPlan);
        const profileName = effectiveFullName?.trim() || "";
        const profileParts = profileName ? profileName.split(/\s+/).length : 0;
        const laborName = laborProfile.full_name?.trim() || "";
        const laborParts = laborName ? laborName.split(/\s+/).length : 0;
        if (laborParts > profileParts || (laborParts >= 2 && profileParts < 2)) {
          effectiveFullName = laborProfile.full_name;
        } else if (!effectiveFullName) {
          effectiveFullName = laborProfile.full_name || null;
        }
      }

      const organizationChanged = (
        dashboardDataOwnerRef.current === uid
        && dashboardOrganizationRef.current !== undefined
        && dashboardOrganizationRef.current !== effectiveOrgId
      );
      if (organizationChanged) {
        setCatalogCourses([]);
        setCategories([]);
        setMessages(initialMessages);
        setInputValue("");
        setDocumentsProgress({ completed: 0, total: DEFAULT_REQUIRED_DOCUMENT_TYPES.length, requiredTypes: DEFAULT_REQUIRED_DOCUMENT_TYPES });
        setIsVideoIdentified(false);
      }
      dashboardOrganizationRef.current = effectiveOrgId;

      setProfile(profileData || laborProfile ? {
        full_name: effectiveFullName,
        organization_name: effectiveOrgName,
        organization_id: effectiveOrgId,
        org_description: effectiveOrgDescription,
      } : null);
      setOrgPlan(effectiveOrgPlan);

      if (effectiveBranding && typeof effectiveBranding === 'object') {
        const b = effectiveBranding as Record<string, unknown>;
        setBranding({ coverUrl: (b.coverUrl as string) || '', primaryColor: (b.primaryColor as string) || '#0d9488', secondaryColor: (b.secondaryColor as string) || '#14b8a6', logoUrl: (b.logoUrl as string) || '', showOrgName: b.showOrgName !== false });
      } else setBranding(null);
      if (effectiveDashboardSettings && typeof effectiveDashboardSettings === 'object') {
        const s = effectiveDashboardSettings as Record<string, unknown>;
        setDashboardSettings({ showLibrary: s.showLibrary === true, showAchievements: s.showAchievements === true, showAiChat: s.showAiChat === true, showRadio: s.showRadio === true, showAnnouncements: s.showAnnouncements === true, catalogMode: (s.catalogMode as "catalog" | "assigned") || "catalog", studentTheme: (s.studentTheme as string | null) ?? null });
      } else setDashboardSettings({ showLibrary: true, showAchievements: true, showAiChat: true, showRadio: false, showAnnouncements: false, catalogMode: "catalog", studentTheme: null });

      let cachedCoursesData: StudentCourse[] = [];
      let cachedTotalTime = 0;
      let cachedCompletedLessonsTotal = 0;

      const enrollments = enrollmentsRes.data;
      if (enrollments) {
        // Collect all course IDs first for batch queries (eliminates N+1 problem)
        const validEnrollments = enrollments.filter(e => e.courses);
        const allCourseIds = validEnrollments.map(e => (e.courses as any).id);

        // Batch fetch: all lessons for all courses in one query
        const allLessonsResult = allCourseIds.length > 0
          ? await supabase.from("lessons").select("id, course_id").in("course_id", allCourseIds)
          : { data: [] as { id: string; course_id: string }[], error: null };
        if (!isCurrentRequest()) return false;
        if (allLessonsResult.error) throw allLessonsResult.error;
        const allLessons = allLessonsResult.data;

        // Batch fetch: all completed lesson progress for this user in one query
        const allLessonIds = (allLessons || []).map(l => l.id);
        const allProgressResult = allLessonIds.length > 0
          ? await supabase.from("lesson_progress").select("lesson_id").eq("user_id", uid).in("lesson_id", allLessonIds).eq("completed", true)
          : { data: [] as { lesson_id: string }[], error: null };
        if (!isCurrentRequest()) return false;
        if (allProgressResult.error) throw allProgressResult.error;
        const allProgress = allProgressResult.data;

        // Build lookup maps for O(1) access
        const lessonsByCourse = new Map<string, string[]>();
        for (const lesson of allLessons || []) {
          const list = lessonsByCourse.get(lesson.course_id) || [];
          list.push(lesson.id);
          lessonsByCourse.set(lesson.course_id, list);
        }
        const completedLessonIds = new Set((allProgress || []).map(p => p.lesson_id));

        for (const enrollment of validEnrollments) {
          const course = enrollment.courses as any;
          cachedTotalTime += enrollment.time_spent || 0;
          const courseLessonIds = lessonsByCourse.get(course.id) || [];
          const completedLessons = courseLessonIds.filter(id => completedLessonIds.has(id)).length;
          cachedCompletedLessonsTotal += completedLessons;
          cachedCoursesData.push({
            id: course.id, title: course.title, description: course.description, duration: course.duration,
            progress: Math.min(enrollment.progress || 0, 100), totalLessons: courseLessonIds.length, completedLessons,
            status: enrollment.status === "completed" ? "completed" : "in_progress",
            skip_video_identification: course.skip_video_identification || false,
            cover_image_url: course.cover_image_url || null,
          });
        }
        setCourses(cachedCoursesData);
        dashboardDataOwnerRef.current = uid;
        setHasDashboardData(true);
        setTotalTimeSpent(cachedTotalTime);
        setTotalCompletedLessons(cachedCompletedLessonsTotal);
      }

      // Load catalog: all published courses for this org + categories
      if (effectiveOrgId) {
        const [coursesRes, catsRes, pendingRequestsRes] = await Promise.all([
          supabase.from("courses").select("id, title, description, duration, price, category_id, cover_image_url, is_published, landing_content, require_enrollment_approval, hidden_from_catalog").eq("organization_id", effectiveOrgId).eq("is_published", true),
          supabase.from("course_categories").select("id, name, color, hidden_from_catalog").eq("organization_id", effectiveOrgId),
          supabase.from("enrollment_requests").select("course_id, status").eq("user_id", uid).eq("status", "pending"),
        ]);
        if (!isCurrentRequest()) return false;
        const catalogLoadError = coursesRes.error || catsRes.error || pendingRequestsRes.error;
        if (catalogLoadError) throw catalogLoadError;
        const allOrgCourses = coursesRes.data || [];
        const cats = (catsRes.data || []).filter((c: any) => !c.hidden_from_catalog);
        const hiddenCategoryIds = new Set((catsRes.data || []).filter((c: any) => c.hidden_from_catalog).map((c: any) => c.id));
        const pendingRequests = new Set((pendingRequestsRes.data || []).map(r => r.course_id));
        setCategories(cats);
        const catMap = new Map(cats.map(c => [c.id, c]));
        const enrolledIds = new Set(cachedCoursesData.map(c => c.id));

        // Count lessons per course
        const courseIds = allOrgCourses.map(c => c.id);
        const lessonCountsResult = courseIds.length > 0
          ? await supabase.from("lessons").select("course_id").in("course_id", courseIds)
          : { data: [] as { course_id: string }[], error: null };
        if (!isCurrentRequest()) return false;
        if (lessonCountsResult.error) throw lessonCountsResult.error;
        const lessonCounts = lessonCountsResult.data;
        const lessonCountMap = new Map<string, number>();
        for (const l of lessonCounts || []) {
          lessonCountMap.set(l.course_id, (lessonCountMap.get(l.course_id) || 0) + 1);
        }

        const catalogData: CatalogCourse[] = allOrgCourses
          .filter(c => !(c as any).hidden_from_catalog && !hiddenCategoryIds.has(c.category_id || ''))
          .map(c => {
          const enrolled = cachedCoursesData.find(ec => ec.id === c.id);
          const cat = c.category_id ? catMap.get(c.category_id) : null;
          const isPending = pendingRequests.has(c.id);
          return {
            id: c.id, title: c.title, description: c.description,
            cover_image_url: (c as any).cover_image_url || null,
            duration: c.duration, price: c.price,
            category_id: c.category_id, category_name: cat?.name || null, category_color: cat?.color || null,
            total_lessons: lessonCountMap.get(c.id) || 0,
            is_enrolled: enrolledIds.has(c.id),
            progress: enrolled?.progress,
            completed_lessons: enrolled?.completedLessons,
            status: enrolled ? (enrolled.status === "completed" ? "completed" : "in_progress") : (isPending ? "pending" : "not_enrolled"),
            external_card_url: (c as any).landing_content?.external_card_url || null,
            require_enrollment_approval: (c as any).require_enrollment_approval || false,
          };
        });
        setCatalogCourses(catalogData);
      }

      if (effectiveOrgId) {
        const enrolledCoursesForDocs = (enrollments || [])
          .map(e => e.courses as any)
          .filter(Boolean);
        const requiredTypes = resolveRequiredDocumentTypes(enrolledCoursesForDocs);
        // Параллельно: identity docs + video identification
        const [identityRes, videoIdRes] = await Promise.all([
          supabase.from("student_identity_documents").select("type").eq("user_id", uid).eq("organization_id", effectiveOrgId),
          supabase.from("video_identifications").select("status").eq("user_id", uid).eq("organization_id", effectiveOrgId).in("status", ["approved", "verified"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (!isCurrentRequest()) return false;
        const identityLoadError = identityRes.error || videoIdRes.error;
        if (identityLoadError) throw identityLoadError;
        const identityDocs = identityRes.data;
        if (identityDocs) {
          const hasType = (type: RequiredDocumentType) => {
            if (type === "passport") return identityDocs.some(d => d.type === "passport" || d.type === "birth_certificate");
            if (type === "education_document") return identityDocs.some(d => d.type === "education_document" || d.type === "diploma" || d.type === "attestat");
            return identityDocs.some(d => d.type === type);
          };
          setDocumentsProgress({ completed: requiredTypes.filter(hasType).length, total: requiredTypes.length, requiredTypes });
        }
        setIsVideoIdentified(!!videoIdRes.data);
      }

      // Cache dashboard data for offline fallback using local variables
      if (uid) {
        const docsProgress = (() => {
          if (!effectiveOrgId) return { completed: 0, total: 3, requiredTypes: DEFAULT_REQUIRED_DOCUMENT_TYPES };
          return documentsProgress; // already set above via setDocumentsProgress
        })();
        cacheDashboardData(uid, {
          courses: cachedCoursesData,
          profile: profileData ? { full_name: profileData.full_name, organization_name: effectiveOrgName, organization_id: profileData.organization_id } : null,
          branding: effectiveBranding,
          dashboardSettings: effectiveDashboardSettings,
          totalTimeSpent: cachedTotalTime,
          totalCompletedLessons: cachedCompletedLessonsTotal,
          documentsProgress: docsProgress,
        }).catch(() => {});
      }
      legacyDashboardFreshScopeRef.current = {
        uid,
        organizationId: effectiveOrgId,
        observedSnapshotVersion: snapshotDataVersionRef.current.version,
      };
      legacyDashboardErrorRef.current = null;
      setDashboardLoadError(null);
      return true;
    } catch (error) {
      if (!isCurrentRequest()) return false;
      console.error("Error loading data:", error);

      // Не затираем уже показанный корректный snapshot/последний ответ. Кеш
      // поднимаем только если для этого ученика ещё нет надёжных данных.
      let usingCachedData = dashboardDataOwnerRef.current === uid;
      if (!usingCachedData) {
        try {
          const cached = await getCachedDashboardData(uid);
          if (!isCurrentRequest()) return false;
          const cachedOrganizationId = cached?.profile?.organization_id ?? null;
          const confirmedOrganizationId = dashboardOrganizationRef.current;
          const cacheMatchesConfirmedOrganization = (
            confirmedOrganizationId === undefined
            || cachedOrganizationId === confirmedOrganizationId
          );
          if (cached && cacheMatchesConfirmedOrganization) {
            setCourses(cached.courses || []);
            if (cached.profile) setProfile(cached.profile);
            if (cached.branding) setBranding(cached.branding);
            if (cached.dashboardSettings) setDashboardSettings(cached.dashboardSettings);
            setTotalTimeSpent(cached.totalTimeSpent || 0);
            setTotalCompletedLessons(cached.totalCompletedLessons || 0);
            const cachedDocs = cached.documentsProgress as Partial<DocumentsProgress> | undefined;
            setDocumentsProgress({
              completed: cachedDocs?.completed ?? 0,
              total: cachedDocs?.total ?? DEFAULT_REQUIRED_DOCUMENT_TYPES.length,
              requiredTypes: cachedDocs?.requiredTypes ?? DEFAULT_REQUIRED_DOCUMENT_TYPES,
            });
            dashboardDataOwnerRef.current = uid;
            dashboardOrganizationRef.current = cachedOrganizationId;
            setHasDashboardData(true);
            usingCachedData = true;
            toast.info('Загружены данные из кеша', { description: 'Данные могут быть устаревшими' });
          }
        } catch (cacheError) {
          console.error('Error loading dashboard cache:', cacheError);
        }
      }

      const source = snapshotErrorRef.current ? 'снимок и список курсов' : 'список курсов';
      const loadError: DashboardLoadError = {
        message: `Не удалось обновить ${source}. Проверьте соединение и повторите попытку.`,
        usingCachedData,
      };
      legacyDashboardErrorRef.current = {
        uid,
        organizationId: dashboardOrganizationRef.current,
        error: loadError,
      };
      setDashboardLoadError(loadError);
      return false;
    } finally {
      requestSettled = true;
      clearTimeout(safetyTimer);
      if (isCurrentRequest()) setLoading(false);
    }
  };

  const handleLogout = async () => { await signOut(); navigate("/"); };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isAiLoading) return;
    const userMessage: ChatMessage = { role: "user", content: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsAiLoading(true);
    try {
      const response = await safeInvoke<any>("student-chat", { body: { messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })) } });
      if (response.error) throw new Error(response.error.message || "Ошибка ИИ");
      const data = response.data;
      if (data.error) throw new Error(data.error);
      setMessages(prev => [...prev, { role: "assistant" as const, content: data.content }]);
    } catch (error: any) {
      console.error("AI chat error:", error);
      setMessages(prev => [...prev, { role: "assistant" as const, content: "Извините, произошла ошибка. Попробуйте ещё раз позже." }]);
    } finally { setIsAiLoading(false); }
  };

  const retryDashboardLoad = (): Promise<void> => {
    const retryUid = effectiveUserId;
    if (!retryUid) return Promise.resolve();
    const existingRetry = dashboardRetryInFlightRef.current;
    if (existingRetry?.uid === retryUid) return existingRetry.promise;

    const token = Symbol(retryUid);
    setIsRetryingDashboard(true);
    const promise = (async () => {
      try {
        await Promise.allSettled([
          refetchSnapshot(),
          loadData(),
        ]);
      } finally {
        if (dashboardRetryInFlightRef.current?.token === token) {
          dashboardRetryInFlightRef.current = null;
          setIsRetryingDashboard(false);
        }
      }
    })();
    dashboardRetryInFlightRef.current = { uid: retryUid, token, promise };
    return promise;
  };

  const handleRefresh = useCallback(async () => {
    const loaded = await loadData();
    if (loaded) toast.success("Данные обновлены");
  }, [effectiveUserId]);
  const { ref: pullToRefreshRef, pullDistance, isRefreshing, canRefresh } = usePullToRefresh<HTMLElement>({ onRefresh: handleRefresh, threshold: 80, maxPull: 120 });

  // useEffect очищает tenant-state при смене uid, но первый render нового uid
  // происходит до эффекта. На этом render синхронно скрываем данные прежнего
  // владельца, чтобы не было даже краткого межпользовательского показа.
  const freshLegacyScope = (
    legacyDashboardFreshScopeRef.current?.uid === effectiveUserId
  ) ? legacyDashboardFreshScopeRef.current : null;
  const snapshotIsAuthoritative = (
    currentSnapshotOrganizationId !== undefined
    && !snapshotError
    && (
      !freshLegacyScope
      || (
        freshLegacyScope.organizationId !== currentSnapshotOrganizationId
        && snapshotDataVersion > freshLegacyScope.observedSnapshotVersion
      )
    )
  );
  const authoritativeOrganizationId = snapshotIsAuthoritative
    ? currentSnapshotOrganizationId
    : freshLegacyScope?.organizationId;
  const renderedDataBelongsToCurrentUser = (
    dashboardDataOwnerRef.current === null
    || dashboardDataOwnerRef.current === effectiveUserId
  ) && (
    authoritativeOrganizationId === undefined
    || dashboardOrganizationRef.current === authoritativeOrganizationId
  );
  const visibleCourses = renderedDataBelongsToCurrentUser ? courses : [];
  const visibleProfile = renderedDataBelongsToCurrentUser ? profile : null;
  const visibleDashboardSettings = renderedDataBelongsToCurrentUser
    ? dashboardSettings
    : { showLibrary: true, showAchievements: true, showAiChat: true, showRadio: false, showAnnouncements: false, catalogMode: "catalog" as const, studentTheme: null };
  const visibleDocumentsProgress = renderedDataBelongsToCurrentUser
    ? documentsProgress
    : { completed: 0, total: DEFAULT_REQUIRED_DOCUMENT_TYPES.length, requiredTypes: DEFAULT_REQUIRED_DOCUMENT_TYPES };
  const totalProgress = visibleCourses.length > 0 ? Math.round(visibleCourses.reduce((acc, c) => acc + c.progress, 0) / visibleCourses.length) : 0;
  const nameParts = visibleProfile?.full_name?.split(" ") || [];
  const firstName = nameParts.length >= 2 ? nameParts[1] : "Ученик";

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}ч ${mins}м`;
  };

  // catalogMode "assigned" no longer has a separate tab — always stay on catalog
  useEffect(() => {
    if (!loading && !initialTabApplied) {
      setInitialTabApplied(true);
    }
  }, [loading, initialTabApplied]);

  return {
    user, navigate, isMobile, theme, setTheme,
    activeTab, setActiveTab, messages: renderedDataBelongsToCurrentUser ? messages : initialMessages,
    inputValue: renderedDataBelongsToCurrentUser ? inputValue : "", setInputValue, isAiLoading, handleSendMessage,
    courses: visibleCourses,
    catalogCourses: renderedDataBelongsToCurrentUser ? catalogCourses : [],
    categories: renderedDataBelongsToCurrentUser ? categories : [],
    profile: visibleProfile,
    branding: renderedDataBelongsToCurrentUser ? branding : null,
    dashboardSettings: visibleDashboardSettings,
    loading: renderedDataBelongsToCurrentUser ? loading : true,
    dashboardLoadError: renderedDataBelongsToCurrentUser ? dashboardLoadError : null,
    hasDashboardData: renderedDataBelongsToCurrentUser ? hasDashboardData : false,
    isRetryingDashboard, retryDashboardLoad,
    totalTimeSpent: renderedDataBelongsToCurrentUser ? totalTimeSpent : 0,
    totalCompletedLessons: renderedDataBelongsToCurrentUser ? totalCompletedLessons : 0,
    totalProgress, firstName, formatTime,
    isPreviewMode,
    showVideoIdentification: renderedDataBelongsToCurrentUser ? showVideoIdentification : false,
    setShowVideoIdentification,
    showConsentForm: renderedDataBelongsToCurrentUser ? showConsentForm : false,
    setShowConsentForm,
    showDocumentsUpload: renderedDataBelongsToCurrentUser ? showDocumentsUpload : false,
    setShowDocumentsUpload,
    showAchievements: renderedDataBelongsToCurrentUser ? showAchievements : false,
    setShowAchievements, mobileMenuOpen, setMobileMenuOpen,
    documentsProgress: visibleDocumentsProgress,
    isVideoIdentified: renderedDataBelongsToCurrentUser ? isVideoIdentified : false,
    setIsVideoIdentified,
    showOnboarding: renderedDataBelongsToCurrentUser ? showOnboarding : false,
    handleOnboardingClose,
    handleLogout, pullToRefreshRef, pullDistance, isRefreshing, canRefresh,
    signOut, orgPlan: renderedDataBelongsToCurrentUser ? orgPlan : "free", isAdminView, adminViewStudentName,
  };
}
