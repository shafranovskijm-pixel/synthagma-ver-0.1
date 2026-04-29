import { useState, useEffect, useCallback } from "react";
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

import demoCourseSafety from "@/assets/demo/course-safety.jpg";
import demoCourseFire from "@/assets/demo/course-fire.jpg";
import demoCourseFirstaid from "@/assets/demo/course-firstaid.jpg";
import demoCourseElectrical from "@/assets/demo/course-electrical.jpg";
import demoOrgBanner from "@/assets/demo/org-banner.jpg";

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
  catalogMode: "catalog" | "assigned";
  studentTheme: string | null;
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
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>({ showLibrary: true, showAchievements: true, showAiChat: true, catalogMode: "catalog", studentTheme: null });
  const [loading, setLoading] = useState(true);
  const [totalTimeSpent, setTotalTimeSpent] = useState(0);
  const [totalCompletedLessons, setTotalCompletedLessons] = useState(0);
  const [isPreviewMode, setIsPreviewMode] = useState(() => {
    const preview = localStorage.getItem('previewStudentDashboard');
    if (preview === 'true') {
      localStorage.removeItem('previewStudentDashboard');
      return true;
    }
    return false;
  });
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
  const [documentsProgress, setDocumentsProgress] = useState({ completed: 0, total: 3 });
  const [isVideoIdentified, setIsVideoIdentified] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [orgPlan, setOrgPlan] = useState<string>("free");

  // Onboarding
  useEffect(() => {
    if (!user || isAdminView) return;
    const checkOnboarding = async () => {
      const { data } = await supabase.from("profiles").select("onboarding_completed").eq("user_id", user.id).maybeSingle();
      if (data && !data.onboarding_completed) setShowOnboarding(true);
    };
    checkOnboarding();
  }, [user, isAdminView]);

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

  useEffect(() => {
    if (effectiveUserId) { loadData(); }
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
    // In preview mode, show demo data instead of real user data
    const previewFlag = localStorage.getItem('previewStudentDashboard');
    if (previewFlag === 'true' || isPreviewMode) {
      setCourses([
        { id: "demo-1", title: "Охрана труда на предприятии", description: "Основы безопасности на рабочем месте, требования законодательства и практические навыки", duration: "16 часов", progress: 65, totalLessons: 12, completedLessons: 8, status: "in_progress", skip_video_identification: false },
        { id: "demo-2", title: "Пожарная безопасность", description: "Пожарно-технический минимум для руководителей и специалистов", duration: "8 часов", progress: 100, totalLessons: 8, completedLessons: 8, status: "completed", skip_video_identification: false },
        { id: "demo-3", title: "Первая помощь пострадавшим", description: "Навыки оказания первой доврачебной помощи при несчастных случаях", duration: "4 часа", progress: 30, totalLessons: 6, completedLessons: 2, status: "in_progress", skip_video_identification: false },
        { id: "demo-4", title: "Электробезопасность", description: "Требования безопасности при работе с электроустановками", duration: "12 часов", progress: 0, totalLessons: 10, completedLessons: 0, status: "in_progress", skip_video_identification: false },
      ]);
      setCatalogCourses([
        { id: "demo-1", title: "Охрана труда на предприятии", description: "Основы безопасности на рабочем месте", cover_image_url: demoCourseSafety, duration: "16 часов", category_id: "cat-1", category_name: "Охрана труда", category_color: "#14b8a6", total_lessons: 12, is_enrolled: true, progress: 65, completed_lessons: 8, status: "in_progress" },
        { id: "demo-2", title: "Пожарная безопасность", description: "Пожарно-технический минимум для руководителей", cover_image_url: demoCourseFire, duration: "8 часов", category_id: "cat-1", category_name: "Охрана труда", category_color: "#14b8a6", total_lessons: 8, is_enrolled: true, progress: 100, completed_lessons: 8, status: "completed" },
        { id: "demo-3", title: "Первая помощь пострадавшим", description: "Навыки оказания первой доврачебной помощи", cover_image_url: demoCourseFirstaid, duration: "4 часа", category_id: "cat-2", category_name: "Медицина", category_color: "#ef4444", total_lessons: 6, is_enrolled: true, progress: 30, completed_lessons: 2, status: "in_progress" },
        { id: "demo-4", title: "Электробезопасность", description: "Требования безопасности при работе с электроустановками", cover_image_url: demoCourseElectrical, duration: "12 часов", category_id: "cat-3", category_name: "Электробезопасность", category_color: "#3b82f6", total_lessons: 10, is_enrolled: false, status: "not_enrolled" },
      ]);
      setCategories([
        { id: "cat-1", name: "Охрана труда", color: "#14b8a6" },
        { id: "cat-2", name: "Медицина", color: "#ef4444" },
        { id: "cat-3", name: "Электробезопасность", color: "#3b82f6" },
      ]);
      setBranding({ coverUrl: demoOrgBanner, primaryColor: "#0d9488", secondaryColor: "#115e59", logoUrl: "", showOrgName: true });
      setTotalTimeSpent(2450);
      setTotalCompletedLessons(18);
      setProfile({ full_name: "Иванов Иван Иванович", organization_name: "Демо-организация", organization_id: null, org_description: "Учебный центр профессионального развития и повышения квалификации" });
      setDocumentsProgress({ completed: 2, total: 3 });
      setLoading(false);
      return;
    }

    const uid = effectiveUserId;
    if (!uid) { setLoading(false); return; }
    setLoading(true);

    // Safety timeout: never show spinner for more than 15 seconds
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 15000);

    try {
      // Параллельно: профиль + labor_safety + enrollments — независимые источники данных
      const [profileRes, laborRes, enrollmentsRes] = await Promise.all([
        supabase.from("profiles").select("full_name, organization_id, organizations(name, description, branding, student_dashboard_settings, subscription_plan)").eq("user_id", uid).maybeSingle(),
        supabase.from("labor_safety_profiles").select("organization_id, full_name, organizations(name, branding, student_dashboard_settings, subscription_plan)").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("enrollments").select("id, progress, status, time_spent, course_id, courses(id, title, description, duration, skip_video_identification)").eq("user_id", uid),
      ]);

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
        setBranding({ coverUrl: (b.coverUrl as string) || '', primaryColor: (b.primaryColor as string) || '#0d9488', secondaryColor: (b.secondaryColor as string) || '#14b8a6', logoUrl: (b.logoUrl as string) || '', showOrgName: b.showOrgName !== false });
      }
      if (effectiveDashboardSettings && typeof effectiveDashboardSettings === 'object') {
        const s = effectiveDashboardSettings as Record<string, unknown>;
        setDashboardSettings({ showLibrary: s.showLibrary === true, showAchievements: s.showAchievements !== false, showAiChat: s.showAiChat !== false, catalogMode: (s.catalogMode as "catalog" | "assigned") || "catalog", studentTheme: (s.studentTheme as string | null) ?? null });
      }

      let cachedCoursesData: StudentCourse[] = [];
      let cachedTotalTime = 0;
      let cachedCompletedLessonsTotal = 0;

      const enrollments = enrollmentsRes.data;
      if (enrollments) {
        // Collect all course IDs first for batch queries (eliminates N+1 problem)
        const validEnrollments = enrollments.filter(e => e.courses);
        const allCourseIds = validEnrollments.map(e => (e.courses as any).id);

        // Batch fetch: all lessons for all courses in one query
        const { data: allLessons } = allCourseIds.length > 0
          ? await supabase.from("lessons").select("id, course_id").in("course_id", allCourseIds)
          : { data: [] as { id: string; course_id: string }[] };

        // Batch fetch: all completed lesson progress for this user in one query
        const allLessonIds = (allLessons || []).map(l => l.id);
        const { data: allProgress } = allLessonIds.length > 0
          ? await supabase.from("lesson_progress").select("lesson_id").eq("user_id", uid).in("lesson_id", allLessonIds).eq("completed", true)
          : { data: [] as { lesson_id: string }[] };

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
            skip_video_identification: course.skip_video_identification || false
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
        // Параллельно: identity docs + video identification
        const [identityRes, videoIdRes] = await Promise.all([
          supabase.from("student_identity_documents").select("type").eq("user_id", uid).eq("organization_id", effectiveOrgId),
          supabase.from("video_identifications").select("status").eq("user_id", uid).eq("organization_id", effectiveOrgId).in("status", ["approved", "verified"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        const identityDocs = identityRes.data;
        if (identityDocs) {
          const hasPassport = identityDocs.some(d => d.type === "passport" || d.type === "birth_certificate");
          const hasSnils = identityDocs.some(d => d.type === "snils");
          const hasEducation = identityDocs.some(d => d.type === "education_document" || d.type === "diploma" || d.type === "attestat");
          setDocumentsProgress({ completed: [hasPassport, hasSnils, hasEducation].filter(Boolean).length, total: 3 });
        }
        setIsVideoIdentified(!!videoIdRes.data);
      }

      // Cache dashboard data for offline fallback using local variables
      if (uid) {
        const docsProgress = (() => {
          if (!effectiveOrgId) return { completed: 0, total: 3 };
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
    } catch (error) {
      console.error("Error loading data:", error);
      
      // Try loading from cache as fallback
      if (uid) {
        const cached = await getCachedDashboardData(uid);
        if (cached) {
          setCourses(cached.courses || []);
          if (cached.profile) setProfile(cached.profile);
          if (cached.branding) setBranding(cached.branding);
          if (cached.dashboardSettings) setDashboardSettings(cached.dashboardSettings);
          setTotalTimeSpent(cached.totalTimeSpent || 0);
          setTotalCompletedLessons(cached.totalCompletedLessons || 0);
          setDocumentsProgress(cached.documentsProgress || { completed: 0, total: 3 });
          toast.info('Загружены данные из кеша', { description:"'Данные могут быть устаревшими'" });
        }
      }
    } finally { clearTimeout(safetyTimer); setLoading(false); }
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

  const handleRefresh = useCallback(async () => { await loadData(); toast.success("Данные обновлены"); }, []);
  const { ref: pullToRefreshRef, pullDistance, isRefreshing, canRefresh } = usePullToRefresh<HTMLElement>({ onRefresh: handleRefresh, threshold: 80, maxPull: 120 });

  const totalProgress = courses.length > 0 ? Math.round(courses.reduce((acc, c) => acc + c.progress, 0) / courses.length) : 0;
  const nameParts = profile?.full_name?.split(" ") || [];
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
    activeTab, setActiveTab, messages, inputValue, setInputValue, isAiLoading, handleSendMessage,
    courses, catalogCourses, categories, profile, branding, dashboardSettings, loading,
    totalTimeSpent, totalCompletedLessons, totalProgress, firstName, formatTime,
    isPreviewMode, showVideoIdentification, setShowVideoIdentification,
    showConsentForm, setShowConsentForm, showDocumentsUpload, setShowDocumentsUpload,
    showAchievements, setShowAchievements, mobileMenuOpen, setMobileMenuOpen,
    documentsProgress, isVideoIdentified, setIsVideoIdentified, showOnboarding, handleOnboardingClose,
    handleLogout, pullToRefreshRef, pullDistance, isRefreshing, canRefresh,
    signOut, orgPlan, isAdminView, adminViewStudentName,
  };
}
