import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { useTheme } from "next-themes";

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

interface Profile {
  full_name: string | null;
  organization_name: string | null;
  organization_id: string | null;
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
  const { user, signOut } = useAuth();
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<"courses" | "chat" | "store">("courses");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [courses, setCourses] = useState<StudentCourse[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>({ showLibrary: true, showAchievements: true, showAiChat: true });
  const [loading, setLoading] = useState(true);
  const [totalTimeSpent, setTotalTimeSpent] = useState(0);
  const [totalCompletedLessons, setTotalCompletedLessons] = useState(0);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);
  const [adminViewStudentName, setAdminViewStudentName] = useState("");
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
    const preview = localStorage.getItem('previewStudentDashboard');
    if (preview === 'true') { setIsPreviewMode(true); localStorage.removeItem('previewStudentDashboard'); }
    const adminView = localStorage.getItem('adminViewAsStudent');
    if (adminView) {
      try {
        const data = JSON.parse(adminView);
        setIsAdminView(true);
        setAdminViewStudentName(data.name || '');
        if (data.userId) setTargetUserId(data.userId);
      } catch (e) { /* ignore */ }
    }
  }, []);

  const effectiveUserId = targetUserId || user?.id || null;

  useEffect(() => {
    if (effectiveUserId) { loadData(); }
    if (user && !isAdminView) { trackUserVisit(); checkNewAchievements(); }
  }, [effectiveUserId]);

  const trackUserVisit = async () => {
    if (!user) return;
    try { await supabase.rpc('track_user_visit', { p_user_id: user!.id }); } catch (e) { console.error("Error tracking visit:", e); }
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
              description: `${achievement.name}: ${achievement.description}`, duration: 5000,
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
        { id: "demo-1", title: "Пример курса: Охрана труда", description: "Демонстрационный курс для ознакомления с платформой", duration: "2ч", progress: 35, totalLessons: 10, completedLessons: 3, status: "in_progress", skip_video_identification: false },
        { id: "demo-2", title: "Пожарная безопасность", description: "Ещё один пример курса", duration: "4ч", progress: 100, totalLessons: 8, completedLessons: 8, status: "completed", skip_video_identification: false },
        { id: "demo-3", title: "Первая помощь", description: "Курс ещё не начат", duration: "1ч", progress: 0, totalLessons: 5, completedLessons: 0, status: "in_progress", skip_video_identification: false },
      ]);
      setTotalTimeSpent(125);
      setTotalCompletedLessons(11);
      setProfile({ full_name: "Иванов Иван Иванович", organization_name: "Демо-организация", organization_id: null });
      setDocumentsProgress({ completed: 2, total: 3 });
      setLoading(false);
      return;
    }

    const uid = effectiveUserId;
    if (!uid) return;
    setLoading(true);
    try {
      const { data: profileData } = await supabase.from("profiles").select("full_name, organization_id, organizations(name, branding, student_dashboard_settings, subscription_plan)").eq("user_id", uid).maybeSingle();
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
        setProfile({ full_name: profileData.full_name, organization_name: effectiveOrgName, organization_id: profileData.organization_id });
      }

      const { data: laborProfile } = await supabase.from("labor_safety_profiles").select("organization_id, full_name, organizations(name, branding, student_dashboard_settings, subscription_plan)").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle();
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
        setBranding({ coverUrl: (b.coverUrl as string) || '', primaryColor: (b.primaryColor as string) || '#6366f1', secondaryColor: (b.secondaryColor as string) || '#8b5cf6', logoUrl: (b.logoUrl as string) || '', showOrgName: b.showOrgName !== false });
      }
      if (effectiveDashboardSettings && typeof effectiveDashboardSettings === 'object') {
        const s = effectiveDashboardSettings as Record<string, unknown>;
        setDashboardSettings({ showLibrary: s.showLibrary === true, showAchievements: s.showAchievements !== false, showAiChat: s.showAiChat !== false });
      }

      const { data: enrollments } = await supabase.from("enrollments").select("id, progress, status, time_spent, course_id, courses(id, title, description, duration, skip_video_identification)").eq("user_id", uid);
      if (enrollments) {
        const coursesData: StudentCourse[] = [];
        let totalTime = 0;
        let completedLessonsTotal = 0;
        for (const enrollment of enrollments) {
          const course = enrollment.courses as any;
          if (!course) continue;
          totalTime += enrollment.time_spent || 0;
          const { count: totalLessons } = await supabase.from("lessons").select("id", { count: "exact", head: true }).eq("course_id", course.id);
          const { data: lessonIds } = await supabase.from("lessons").select("id").eq("course_id", course.id);
          let completedLessons = 0;
          if (lessonIds && lessonIds.length > 0) {
            const { count } = await supabase.from("lesson_progress").select("id", { count: "exact", head: true }).eq("user_id", uid).in("lesson_id", lessonIds.map(l => l.id)).eq("completed", true);
            completedLessons = count || 0;
          }
          completedLessonsTotal += completedLessons;
          coursesData.push({
            id: course.id, title: course.title, description: course.description, duration: course.duration,
            progress: Math.min(enrollment.progress || 0, 100), totalLessons: totalLessons || 0, completedLessons,
            status: enrollment.status === "completed" ? "completed" : "in_progress",
            skip_video_identification: course.skip_video_identification || false
          });
        }
        setCourses(coursesData);
        setTotalTimeSpent(totalTime);
        setTotalCompletedLessons(completedLessonsTotal);
      }

      if (effectiveOrgId) {
        const { data: identityDocs } = await supabase.from("student_identity_documents").select("type").eq("user_id", uid).eq("organization_id", effectiveOrgId);
        if (identityDocs) {
          const hasPassport = identityDocs.some(d => d.type === "passport" || d.type === "birth_certificate");
          const hasSnils = identityDocs.some(d => d.type === "snils");
          const hasEducation = identityDocs.some(d => d.type === "education_document" || d.type === "diploma" || d.type === "attestat");
          setDocumentsProgress({ completed: [hasPassport, hasSnils, hasEducation].filter(Boolean).length, total: 3 });
        }
        const { data: videoId } = await supabase.from("video_identifications").select("status").eq("user_id", uid).eq("organization_id", effectiveOrgId).in("status", ["approved", "verified"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
        setIsVideoIdentified(!!videoId);
      }
    } catch (error) { console.error("Error loading data:", error); } finally { setLoading(false); }
  };

  const handleLogout = async () => { await signOut(); navigate("/"); };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isAiLoading) return;
    const userMessage: ChatMessage = { role: "user", content: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsAiLoading(true);
    try {
      const response = await supabase.functions.invoke("student-chat", { body: { messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })) } });
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

  return {
    user, navigate, isMobile, theme, setTheme,
    activeTab, setActiveTab, messages, inputValue, setInputValue, isAiLoading, handleSendMessage,
    courses, profile, branding, dashboardSettings, loading,
    totalTimeSpent, totalCompletedLessons, totalProgress, firstName, formatTime,
    isPreviewMode, showVideoIdentification, setShowVideoIdentification,
    showConsentForm, setShowConsentForm, showDocumentsUpload, setShowDocumentsUpload,
    showAchievements, setShowAchievements, mobileMenuOpen, setMobileMenuOpen,
    documentsProgress, isVideoIdentified, setIsVideoIdentified, showOnboarding, handleOnboardingClose,
    handleLogout, pullToRefreshRef, pullDistance, isRefreshing, canRefresh,
    signOut, orgPlan, isAdminView, adminViewStudentName,
  };
}
