import { captureIdentificationScope, readIdentificationStates } from '@/lib/identification/client';
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useUrlQueryState } from "@/hooks/useUrlNavigation";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStudentPreview } from "@/hooks/useAdminStudentPreview";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { supabase } from "@/integrations/supabase/client";
import { cacheDashboardData, getCachedDashboardData, captureOfflineActor, isOfflineActorCurrent,
  rememberOfflineScope, getOfflineScope, forgetOfflineScope, mayUseOfflineFallback } from "@/utils/courseCache";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { useStudentDashboardSnapshot } from "@/hooks/useStudentDashboardSnapshot";
import { fetchCourseLibraryShell } from "@/api/courseLibrary";


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
  coverPosition?: string;
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
  const { user, signOut, loading: authLoading } = useAuth();
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useUrlQueryState<"catalog" | "library" | "chat" | "store" | "profile">("tab", "catalog", ["catalog", "library", "chat", "store", "profile"], { clear: ["section"] });
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
  const [loadError, setLoadError] = useState<{generation:number;kind:'unavailable'}|null>(null);
  const [totalTimeSpent, setTotalTimeSpent] = useState(0);
  const [totalCompletedLessons, setTotalCompletedLessons] = useState(0);
  const [isPreviewMode] = useState(false);
  const adminPreview = useAdminStudentPreview();
  const isAdminView = adminPreview !== null;
  const adminViewStudentName = adminPreview?.name ?? "";
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

  const targetUserId = adminPreview?.userId ?? null;

  const effectiveUserId = targetUserId || user?.id || null;
  const mode = isAdminView ? 'preview' as const : 'learner' as const;
  const { data: snapshot, accessDenied: snapshotAccessDenied, unconfirmed: snapshotUnconfirmed, refetch: refreshSnapshot } = useStudentDashboardSnapshot(authLoading ? null : effectiveUserId, authLoading ? null : user?.id);
  const identityKey = JSON.stringify([user?.id, effectiveUserId, mode, !!authLoading, captureOfflineActor(user?.id), !!snapshotAccessDenied, !!snapshotUnconfirmed]);
  const identityRef = useRef({ key: identityKey, generation: 0 });
  if (identityRef.current.key !== identityKey) identityRef.current = { key: identityKey, generation: identityRef.current.generation + 1 };
  const requestRef = useRef(0);
  const loadControllerRef = useRef<AbortController|null>(null);
  const [loadedGeneration, setLoadedGeneration] = useState(-1);
  const [settledGeneration, setSettledGeneration] = useState(-1);
  const privateVisible = !!user && !authLoading && !snapshotAccessDenied && !snapshotUnconfirmed && loadedGeneration === identityRef.current.generation;
  const visibleRef = useRef(privateVisible);
  visibleRef.current = privateVisible;
  const captureUiContext = (requireVisible = false) => {
    const actorId = user?.id;
    const revision = captureOfflineActor(actorId);
    const generation = identityRef.current.generation;
    return () => !!actorId && (!requireVisible || visibleRef.current) && generation === identityRef.current.generation && isOfflineActorCurrent(actorId, revision);
  };

  // ⚡ Быстрый снимок дашборда одним RPC — выставляет данные ДО окончания тяжёлого loadData.
  // Если снапшот пришёл раньше — пользователь видит контент мгновенно, фоновый loadData потом
  // обновит каталог и прочие детали.
  useEffect(() => {
    if (!snapshot || authLoading || !user || captureOfflineActor(user.id) === null || snapshot.profile?.user_id !== effectiveUserId) return;
    if (snapshot.profile) {
      setProfile(prev => ({
        full_name: snapshot.profile.full_name ?? prev?.full_name ?? null,
        organization_id: snapshot.profile.organization_id ?? prev?.organization_id ?? null,
        organization_name: snapshot.org?.name ?? prev?.organization_name ?? null,
        org_description: snapshot.org?.description ?? prev?.org_description ?? null,
      }));
    }
    if (snapshot.org?.branding && typeof snapshot.org.branding === 'object') {
      const b = snapshot.org.branding as Record<string, unknown>;
      setBranding({
        coverUrl: (b.coverUrl as string) || '',
        coverPosition: typeof b.coverPosition === 'string' ? b.coverPosition : undefined,
        primaryColor: (b.primaryColor as string) || '#0d9488',
        secondaryColor: (b.secondaryColor as string) || '#14b8a6',
        logoUrl: (b.logoUrl as string) || '',
        showOrgName: b.showOrgName !== false,
      });
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
    }
    if (snapshot.org?.subscription_plan) setOrgPlan(snapshot.org.subscription_plan);
    if (snapshot.enrollments && snapshot.enrollments.length >= 0) {
      const visibleEnrollments = snapshot.enrollments.filter(e => e.status !== "cancelled");
      const mapped: StudentCourse[] = visibleEnrollments.map((e) => ({
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
      setTotalCompletedLessons(mapped.reduce((sum, c) => sum + c.completedLessons, 0));
      setTotalTimeSpent(visibleEnrollments.reduce((sum, e) => sum + (e.time_spent || 0), 0));
    }
    if (snapshot.documents) {
      setDocumentsProgress({
        completed: [snapshot.documents.has_passport, snapshot.documents.has_snils, snapshot.documents.has_education].filter(Boolean).length,
        total: 3,
        requiredTypes: DEFAULT_REQUIRED_DOCUMENT_TYPES,
      });
    }
    // The fast legacy snapshot is not a new identity decision. Canonical status loads below.
    if (typeof snapshot.profile.onboarding_completed === 'boolean' && !snapshot.profile.onboarding_completed && !isAdminView) {
      setShowOnboarding(true);
    }
    // Снимок отдаёт основные данные → можно отключить спиннер сразу
    setLoading(false);
    setLoadedGeneration(identityRef.current.generation);
  }, [snapshot, identityKey]);

  useEffect(() => {
    setCourses([]); setCatalogCourses([]); setCategories([]); setProfile(null); setBranding(null);
    setTotalTimeSpent(0); setTotalCompletedLessons(0); setIsVideoIdentified(false);
    setDocumentsProgress({ completed: 0, total: 3, requiredTypes: DEFAULT_REQUIRED_DOCUMENT_TYPES });
    setShowOnboarding(false); setShowVideoIdentification(false); setShowDocumentsUpload(false); setShowConsentForm(false);
    setMessages(initialMessages); setInputValue(''); setIsAiLoading(false); setLoadedGeneration(-1); setSettledGeneration(-1); setLoadError(null);
    if ((snapshotAccessDenied || snapshotUnconfirmed) && user && effectiveUserId) forgetOfflineScope(user.id, effectiveUserId, mode, 'dashboard');
    if (effectiveUserId && user && !authLoading && !snapshotAccessDenied && !snapshotUnconfirmed) { void loadData(); }
    else { setLoading(false); setSettledGeneration(identityRef.current.generation); }
    if (user && !isAdminView && !snapshotAccessDenied && !snapshotUnconfirmed) {
      // fire-and-forget — не блокируем первый рендер
      trackUserVisit();
      checkNewAchievements();
    }
    return () => { requestRef.current += 1; loadControllerRef.current?.abort(); };
  }, [identityKey]);

  const trackUserVisit = () => {
    if (!user) return;
    // не await — пусть выполняется в фоне
    supabase.rpc('track_user_visit', { p_user_id: user!.id })
      .then(() => {})
      .then(undefined, (e) => console.error("Error tracking visit:", e));
  };

  const checkNewAchievements = async () => {
    if (!user || isAdminView) return;
    const current = captureUiContext();
    if (!current()) return;
    try {
      const { data: unseenAchievements } = await supabase.from("user_achievements").select("id, achievements (name, description, icon, color, rarity)").eq("user_id", user.id).eq("is_seen", false);
      if (!current()) return;
      if (unseenAchievements && unseenAchievements.length > 0) {
        const rarityEmoji: Record<string, string> = { common: "⭐", rare: "💎", epic: "🏆", legendary: "👑" };
        unseenAchievements.forEach((ua, index) => {
          const achievement = ua.achievements as any;
          if (!achievement) return;
          setTimeout(() => {
            if (!current()) return;
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
    if (!uid || !user || authLoading) { setLoading(false); return; }
    const actorId = user.id;
    const revision = captureOfflineActor(actorId);
    if (revision === null) return;
    const generation = identityRef.current.generation;
    const request = ++requestRef.current;
    const active = () => generation === identityRef.current.generation && request === requestRef.current && isOfflineActorCurrent(actorId, revision);
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    const current = () => active() && !controller.signal.aborted;
    const boundedQuery = <T,>(query:T):T => typeof (query as {abortSignal?:unknown}).abortSignal === 'function' ? (query as T & {abortSignal:(signal:AbortSignal)=>T}).abortSignal(controller.signal) : query;
    setLoading(true);
    setLoadError(null);


    // Bound presentation even when a network promise never settles. Late results lose this request identity.
    const safetyTimer = setTimeout(() => {
      if (!active()) return;
      controller.abort();
      requestRef.current += 1;
      setLoadError({generation,kind:'unavailable'});
      setLoading(false);
      setSettledGeneration(generation);
    }, 15000);

    try {
      // Параллельно: профиль + labor_safety + enrollments — независимые источники данных
      const [profileRes, laborRes, enrollmentsRes] = await Promise.all([
        boundedQuery(supabase.from("profiles").select("full_name, organization_id, organizations(name, description, branding, student_dashboard_settings, subscription_plan)").eq("user_id", uid)).maybeSingle(),
        boundedQuery(supabase.from("labor_safety_profiles").select("organization_id, full_name, organizations(name, branding, student_dashboard_settings, subscription_plan)").eq("user_id", uid).order("created_at", { ascending: false }).limit(1)).maybeSingle(),
        boundedQuery(supabase.from("enrollments").select("id, progress, status, time_spent, course_id, courses(id, title, description, duration, skip_video_identification, cover_image_url, landing_content)").eq("user_id", uid).or("status.is.null,status.neq.cancelled")),
      ]);
      if (!current()) return;
      if (profileRes.error) throw profileRes.error;
      if (laborRes.error) throw laborRes.error;
      if (enrollmentsRes.error) throw enrollmentsRes.error;
      if (!profileRes.data && !laborRes.data) throw { status: 403, message: 'Access to the dashboard target is no longer confirmed' };

      const profileData = profileRes.data;
      let effectiveOrgId: string | null = profileData?.organization_id || null;
      let effectiveOrgName: string | null = null;
      let effectiveBranding: any = null;
      let effectiveDashboardSettings: any = null;

      if (profileData) {
        const org = profileData.organizations as any;
        effectiveOrgName = org?.name || null;
        effectiveBranding = org?.branding;
        effectiveDashboardSettings = org?.student_dashboard_settings;
        if (org?.subscription_plan) setOrgPlan(org.subscription_plan);
        setProfile({ full_name: profileData.full_name, organization_name: effectiveOrgName, organization_id: profileData.organization_id, org_description: (org as any)?.description || null });
      }

      const laborProfile = laborRes.data;
      if (laborProfile?.organization_id) {
        effectiveOrgId = laborProfile.organization_id;
        const laborOrg = laborProfile.organizations as any;
        effectiveOrgName = laborOrg?.name || effectiveOrgName;
        effectiveBranding = laborOrg?.branding ?? effectiveBranding;
        effectiveDashboardSettings = laborOrg?.student_dashboard_settings ?? effectiveDashboardSettings;
        if (laborOrg?.subscription_plan) setOrgPlan(laborOrg.subscription_plan);
        setProfile(prev => {
          const prevName = prev?.full_name?.trim() || "";
          const prevParts = prevName ? prevName.split(/\s+/).length : 0;
          const laborName = laborProfile.full_name?.trim() || "";
          const laborParts = laborName ? laborName.split(/\s+/).length : 0;
          const fullName = (laborParts >= 2 && prevParts < 2) ? laborProfile.full_name : (laborParts > prevParts ? laborProfile.full_name : (prev?.full_name || laborProfile.full_name));
          return { full_name: fullName || prev?.full_name || null, organization_id: laborProfile.organization_id, organization_name: effectiveOrgName || prev?.organization_name || null };
        });
      }

      if (effectiveBranding && typeof effectiveBranding === 'object') {
        const b = effectiveBranding as Record<string, unknown>;
        setBranding({ coverUrl: (b.coverUrl as string) || '', coverPosition: typeof b.coverPosition === 'string' ? b.coverPosition : undefined, primaryColor: (b.primaryColor as string) || '#0d9488', secondaryColor: (b.secondaryColor as string) || '#14b8a6', logoUrl: (b.logoUrl as string) || '', showOrgName: b.showOrgName !== false });
      }
      if (effectiveDashboardSettings && typeof effectiveDashboardSettings === 'object') {
        const s = effectiveDashboardSettings as Record<string, unknown>;
        setDashboardSettings({ showLibrary: s.showLibrary === true, showAchievements: s.showAchievements === true, showAiChat: s.showAiChat === true, showRadio: s.showRadio === true, showAnnouncements: s.showAnnouncements === true, catalogMode: (s.catalogMode as "catalog" | "assigned") || "catalog", studentTheme: (s.studentTheme as string | null) ?? null });
      }

      const cachedCoursesData: StudentCourse[] = [];
      let cachedTotalTime = 0;
      let cachedCompletedLessonsTotal = 0;
      let cachedDocumentsProgress: DocumentsProgress = { completed: 0, total: DEFAULT_REQUIRED_DOCUMENT_TYPES.length, requiredTypes: DEFAULT_REQUIRED_DOCUMENT_TYPES };

      const enrollments = enrollmentsRes.data?.filter(e => e.status !== "cancelled");
      if (enrollments) {
        // Collect all course IDs first for batch queries (eliminates N+1 problem)
        const validEnrollments = enrollments.filter(e => e.courses);
        const allCourseIds = validEnrollments.map(e => (e.courses as any).id);

        // Batch fetch: all lessons for all courses in one query
        const { data: allLessons } = allCourseIds.length > 0
          ? await supabase.from("lessons").select("id, course_id").in("course_id", allCourseIds)
          : { data: [] as { id: string; course_id: string }[] };
        if (!current()) return;

        // Batch fetch: all completed lesson progress for this user in one query
        const allLessonIds = (allLessons || []).map(l => l.id);
        const { data: allProgress } = allLessonIds.length > 0
          ? await supabase.from("lesson_progress").select("lesson_id").eq("user_id", uid).in("lesson_id", allLessonIds).eq("completed", true)
          : { data: [] as { lesson_id: string }[] };
        if (!current()) return;

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

        // RLS intentionally hides the full row of an unpublished
        // library-only course. Recover only its column-limited shell so the
        // enrolled reviewer does not lose the course card when this fallback
        // load replaces the faster dashboard snapshot.
        const hiddenCourseEnrollments = enrollments.filter(e => !e.courses);
        const hiddenCourseShells = await Promise.allSettled(
          hiddenCourseEnrollments.map(async (enrollment) => ({
            enrollment,
            shell: await fetchCourseLibraryShell(enrollment.course_id),
          })),
        );
        if (!current()) return;
        for (const result of hiddenCourseShells) {
          if (result.status !== "fulfilled" || !result.value.shell.libraryOnly) continue;
          const { enrollment, shell } = result.value;
          cachedTotalTime += enrollment.time_spent || 0;
          cachedCoursesData.push({
            id: shell.courseId,
            title: shell.title,
            description: null,
            duration: null,
            progress: Math.min(enrollment.progress || 0, 100),
            totalLessons: 0,
            completedLessons: 0,
            status: enrollment.status === "completed" ? "completed" : "in_progress",
            skip_video_identification: true,
            cover_image_url: null,
          });
        }
        setCourses(cachedCoursesData);
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
        if (!current()) return;
        if (coursesRes.error || catsRes.error || pendingRequestsRes.error) throw coursesRes.error || catsRes.error || pendingRequestsRes.error;
        const allOrgCourses = coursesRes.data || [];
        const cats = (catsRes.data || []).filter((c: any) => !c.hidden_from_catalog);
        const hiddenCategoryIds = new Set((catsRes.data || []).filter((c: any) => c.hidden_from_catalog).map((c: any) => c.id));
        const pendingRequests = new Set((pendingRequestsRes.data || []).map(r => r.course_id));
        setCategories(cats);
        const catMap = new Map(cats.map(c => [c.id, c]));
        const enrolledIds = new Set(cachedCoursesData.map(c => c.id));

        // Count lessons per course
        const courseIds = allOrgCourses.map(c => c.id);
        const { data: lessonCounts } = courseIds.length > 0
          ? await supabase.from("lessons").select("course_id").in("course_id", courseIds)
          : { data: [] as { course_id: string }[] };
        if (!current()) return;
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
        cachedDocumentsProgress = { completed: 0, total: requiredTypes.length, requiredTypes };
        // Параллельно: identity docs + video identification
        const [identityRes, videoIdRes] = await Promise.all([
          supabase.from("student_identity_documents").select("type").eq("user_id", uid).eq("organization_id", effectiveOrgId),
          readIdentificationStates(captureIdentificationScope(effectiveOrgId,uid,null,current),[uid]).then(subjects=>({data:subjects[0],error:null})).catch(()=>({data:null,error:null})),
        ]);
        if (!current()) return;
        if (identityRes.error || videoIdRes.error) throw identityRes.error || videoIdRes.error;
        const identityDocs = identityRes.data;
        if (identityDocs) {
          const hasType = (type: RequiredDocumentType) => {
            if (type === "passport") return identityDocs.some(d => d.type === "passport" || d.type === "birth_certificate");
            if (type === "education_document") return identityDocs.some(d => d.type === "education_document" || d.type === "diploma" || d.type === "attestat");
            return identityDocs.some(d => d.type === type);
          };
          cachedDocumentsProgress = { completed: requiredTypes.filter(hasType).length, total: requiredTypes.length, requiredTypes };
        }
        setDocumentsProgress(cachedDocumentsProgress);
        setIsVideoIdentified(videoIdRes.data?.current?.status === "verified" || videoIdRes.data?.compatibility.historicalVerifiedObserved === true);
      }

      // Cache dashboard data for offline fallback using local variables
      if (uid && effectiveOrgId && current()) {
        const scope = rememberOfflineScope({ actorId, effectiveUserId: uid, mode, organizationId: effectiveOrgId }, 'dashboard', revision);
        if (scope) cacheDashboardData(scope, {
          courses: cachedCoursesData,
          profile: profileData ? { full_name: profileData.full_name, organization_name: effectiveOrgName, organization_id: effectiveOrgId } : null,
          branding: effectiveBranding,
          dashboardSettings: effectiveDashboardSettings,
          totalTimeSpent: cachedTotalTime,
          totalCompletedLessons: cachedCompletedLessonsTotal,
          documentsProgress: cachedDocumentsProgress,
        }).catch(() => {});
      }
      if (current()) { setLoadedGeneration(generation); return true; }
      return false;
    } catch (error) {
      if (!current()) return;
      setLoadError({generation,kind:'unavailable'});
      console.error("Error loading data:", error);
      
      // Try loading from cache as fallback
      if (uid) {
        if (!mayUseOfflineFallback(error)) forgetOfflineScope(actorId, uid, mode, 'dashboard');
        const scope = mayUseOfflineFallback(error) ? getOfflineScope(actorId, uid, mode, 'dashboard') : null;
        const cached = scope ? await getCachedDashboardData(scope) : null;
        if (!current()) return;
        if (cached) {
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
          toast.info('Загружены данные из кеша', { description:"'Данные могут быть устаревшими'" });
          setLoadedGeneration(generation);
        } else {
          setCourses([]); setCatalogCourses([]); setProfile(null); setBranding(null); setLoadedGeneration(-1);
          toast.error('Подключитесь к Интернету, чтобы подтвердить доступ к кабинету');
        }
      }
    } finally { clearTimeout(safetyTimer); if (current()) { setLoading(false); setSettledGeneration(generation); } controller.abort(); }
  };

  const handleLogout = async () => { await signOut(); navigate("/"); };

  const handleSendMessage = async () => {
    const current = captureUiContext(true);
    if (!privateVisible || !current() || !inputValue.trim() || isAiLoading) return;
    const userMessage: ChatMessage = { role: "user", content: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsAiLoading(true);
    try {
      const response = await safeInvoke<any>("student-chat", { body: { messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })) } });
      if (!current()) return;
      if (response.error) throw new Error(response.error.message || "Ошибка ИИ");
      const data = response.data;
      if (data.error) throw new Error(data.error);
      setMessages(prev => [...prev, { role: "assistant" as const, content: data.content }]);
    } catch (error: any) {
      if (!current()) return;
      console.error("AI chat error:", error);
      setMessages(prev => [...prev, { role: "assistant" as const, content: "Извините, произошла ошибка. Попробуйте ещё раз позже." }]);
    } finally { if (current()) setIsAiLoading(false); }
  };

  const handleRefresh = useCallback(async () => {
    const current = captureUiContext(); if (!current()) return;
    if (snapshotAccessDenied || snapshotUnconfirmed) { await refreshSnapshot?.(); return; }
    const loaded = await loadData(); if (current() && loaded) toast.success("Данные обновлены");
  }, [identityKey]);
  const { ref: pullToRefreshRef, pullDistance, isRefreshing, canRefresh } = usePullToRefresh<HTMLElement>({ onRefresh: handleRefresh, threshold: 80, maxPull: 120 });

  const totalProgress = courses.length > 0 ? Math.round(courses.reduce((acc, c) => acc + c.progress, 0) / courses.length) : 0;
  const nameParts = profile?.full_name?.split(" ") || [];
  const firstName = nameParts.length >= 2 ? nameParts[1] : "Ученик";

  const formatTime = (seconds: number) => {
    // enrollments.time_spent is the sum of lesson time stored in seconds.
    const minutes = Math.floor(seconds / 60);
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
    activeTab, setActiveTab, messages: privateVisible ? messages : initialMessages,
    inputValue: privateVisible ? inputValue : '', setInputValue, isAiLoading: privateVisible && isAiLoading, handleSendMessage,
    courses: privateVisible ? courses : [], catalogCourses: privateVisible ? catalogCourses : [], categories: privateVisible ? categories : [],
    profile: privateVisible ? profile : null, branding: privateVisible ? branding : null,
    dashboardSettings: privateVisible ? dashboardSettings : { showLibrary: true, showAchievements: true, showAiChat: true, showRadio: false, showAnnouncements: false, catalogMode: 'catalog' as const, studentTheme: null },
    loading: !!user && (!!authLoading || loading || settledGeneration !== identityRef.current.generation),
    loadError: loadError?.generation === identityRef.current.generation || snapshotAccessDenied || snapshotUnconfirmed ? 'unavailable' as const : null,
    totalTimeSpent: privateVisible ? totalTimeSpent : 0, totalCompletedLessons: privateVisible ? totalCompletedLessons : 0,
    totalProgress: privateVisible ? totalProgress : 0, firstName: privateVisible ? firstName : '', formatTime,
    isPreviewMode, showVideoIdentification, setShowVideoIdentification,
    showConsentForm, setShowConsentForm, showDocumentsUpload, setShowDocumentsUpload,
    showAchievements, setShowAchievements, mobileMenuOpen, setMobileMenuOpen,
    documentsProgress: privateVisible ? documentsProgress : { completed: 0, total: 3, requiredTypes: DEFAULT_REQUIRED_DOCUMENT_TYPES },
    isVideoIdentified: privateVisible && isVideoIdentified, setIsVideoIdentified, showOnboarding: privateVisible && showOnboarding, handleOnboardingClose,
    handleLogout, handleRefresh, pullToRefreshRef, pullDistance, isRefreshing, canRefresh,
    signOut, orgPlan: privateVisible ? orgPlan : 'free', isAdminView, adminViewStudentName,
  };
}
