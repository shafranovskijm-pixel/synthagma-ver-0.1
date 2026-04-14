import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, BookOpen, CreditCard, Handshake, HelpCircle, User, LogOut, Sparkles, Settings, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrgDashboardProvider, useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { OrgDashboardFooter } from "@/components/organization/OrgDashboardFooter";
import { OrgNotifications } from "@/components/organization/OrgNotifications";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { differenceInDays } from "date-fns";
import defaultCoverImg from "@/assets/default-org-cover.jpg";
import { CourseDetailsContent } from "@/components/organization/CourseDetailsContent";
import { OrgSidebar } from "@/components/organization/OrgSidebar";

function getUserInitials(email?: string | null, name?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0][0]?.toUpperCase() || "?";
  }
  if (email) return email[0]?.toUpperCase() || "?";
  return "?";
}

function CoursePageInner({ organizationId, courseId }: { organizationId: string; courseId: string }) {
  const navigate = useNavigate();
  const d = useOrgDashboard();

  const organizationName = d.organizationName;
  const customName = d.branding.brandingSettings.customName;
  const customSubtitle = d.branding.brandingSettings.customSubtitle;
  const logoUrl = d.branding.brandingSettings.logoUrl;
  const coverUrl = d.branding.brandingSettings.coverUrl;
  const coverPosition = d.branding.brandingSettings.coverPosition;
  const displayCover = coverUrl || defaultCoverImg;

  const [paidUntil, setPaidUntil] = useState<string | null>(null);
  const planName = d.subscriptionLimits?.plan;

  // Course data
  const [course, setCourse] = useState<any>(null);
  const [courseStudents, setCourseStudents] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"students" | "materials" | "history" | "tests" | "landing" | "settings" | "reminders" | "groups" | "requests" | "achievements">("students");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    supabase.from("organizations").select("paid_until").eq("id", organizationId).single()
      .then(({ data }) => { if (data?.paid_until) setPaidUntil(data.paid_until); });
  }, [organizationId]);

  // Load course data
  useEffect(() => {
    if (!courseId) return;
    const loadCourse = async () => {
      setLoading(true);
      const { data: courseData } = await supabase
        .from("courses")
        .select("*")
        .eq("id", courseId)
        .single();

      if (courseData) {
        // Get lessons count
        const { count: lessonsCount } = await supabase
          .from("lessons")
          .select("*", { count: "exact", head: true })
          .eq("course_id", courseId);

        // Get enrollments with profiles
        const { data: enrollments } = await supabase
          .from("enrollments")
          .select("id, user_id, progress, status")
          .eq("course_id", courseId);

        const studentsList: any[] = [];
        if (enrollments && enrollments.length > 0) {
          const userIds = enrollments.map(e => e.user_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, full_name, email")
            .in("user_id", userIds);

          const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
          for (const e of enrollments) {
            const prof = profileMap.get(e.user_id);
            studentsList.push({
              id: e.id,
              user_id: e.user_id,
              enrollment_id: e.id,
              name: prof?.full_name || "Без имени",
              email: prof?.email || "",
              progress: e.progress || 0,
              status: e.status,
            });
          }
        }

        setCourse({
          ...courseData,
          lessonsCount: lessonsCount || 0,
          studentsCount: studentsList.length,
        });
        setCourseStudents(studentsList);
      }
      setLoading(false);
    };
    loadCourse();
  }, [courseId]);

  const refreshStudents = async () => {
    if (!courseId) return;
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("id, user_id, progress, status")
      .eq("course_id", courseId);
    const studentsList: any[] = [];
    if (enrollments && enrollments.length > 0) {
      const userIds = enrollments.map(e => e.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      for (const e of enrollments) {
        const prof = profileMap.get(e.user_id);
        studentsList.push({
          id: e.id, user_id: e.user_id, enrollment_id: e.id,
          name: prof?.full_name || "Без имени", email: prof?.email || "",
          progress: e.progress || 0, status: e.status,
        });
      }
    }
    setCourseStudents(studentsList);
    if (course) setCourse({ ...course, studentsCount: studentsList.length });
  };

  const daysRemaining = paidUntil ? Math.max(0, differenceInDays(new Date(paidUntil), new Date())) : null;
  const planLabel = planName === 'free' ? 'Бесплатный' : planName === 'start' ? 'Старт' : planName === 'standard' ? 'Стандарт' : planName === 'professional' ? 'Профессиональный' : planName === 'maximum' ? 'Максимальный' : 'Тариф';

  const userEmail = d.user?.email;
  const initials = getUserInitials(userEmail);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  if (!course) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Курс не найден</div>;
  }

  return (
    <div className="min-h-screen bg-background flex">
      <OrgSidebar />
      <main className="flex-1 flex flex-col min-w-0 lg:ml-[88px]">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 bg-card border-b border-border">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 lg:px-6 h-14">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="rounded-xl hover:bg-primary/10 hover:text-primary transition-all duration-200" onClick={() => navigate("/organization")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2.5">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain rounded-lg" />
              ) : (
                <SigmaLogo size="sm" showText={false} />
              )}
              <span className="font-display font-bold text-sm hidden sm:inline">{customName || organizationName || "СИНТАГМА"}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <button
              onClick={() => navigate("/organization")}
              className="hidden sm:flex items-center gap-2 px-3.5 py-2 bg-primary/10 rounded-full border border-primary/20 hover:bg-primary/20 hover:border-primary/40 hover:shadow-md hover:shadow-primary/10 transition-all duration-200"
            >
              <CreditCard className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-primary">
                {planLabel}
                {daysRemaining !== null && planName !== 'free' && (
                  <span className="ml-1 text-primary/70">— {daysRemaining} дн.</span>
                )}
              </span>
            </button>

            <Button variant="ghost" size="sm" className="hidden lg:flex rounded-full gap-1.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 h-9 px-3 transition-all duration-200" onClick={() => navigate("/partner")}>
              <Handshake className="w-4.5 h-4.5" />
              Партнёрам
            </Button>

            {organizationId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="hover:scale-105 transition-transform"><OrgNotifications organizationId={organizationId} /></div>
                </TooltipTrigger>
                <TooltipContent>Уведомления</TooltipContent>
              </Tooltip>
            )}

            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary hover:bg-primary/25 hover:shadow-md hover:shadow-primary/15 hover:scale-110 transition-all duration-200 font-bold text-sm">{initials}</button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Профиль</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-52 rounded-xl">
                <DropdownMenuItem onClick={() => navigate("/organization/profile")} className="rounded-lg gap-2.5 py-2.5"><User className="w-4 h-4" />Профиль</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/organization/settings")} className="rounded-lg gap-2.5 py-2.5"><Settings className="w-4 h-4" />Настройки</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/organization/documents")} className="rounded-lg gap-2.5 py-2.5"><FileText className="w-4 h-4" />Документы</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/whats-new")} className="rounded-lg gap-2.5 py-2.5"><Sparkles className="w-4 h-4" />Что нового?</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setHelpOpen(true)} className="rounded-lg gap-2.5 py-2.5"><HelpCircle className="w-4 h-4" />Помощь</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={d.handleLogout} className="rounded-lg gap-2.5 py-2.5 text-destructive"><LogOut className="w-4 h-4" />Выйти</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Hero banner */}
        <div className="relative w-full h-36 lg:h-48 overflow-hidden">
          <img
            src={displayCover}
            alt="Обложка организации"
            className="w-full h-full"
            width={1920}
            height={512}
            style={{
              objectFit: coverUrl ? (coverPosition === 'contain' ? 'contain' : 'cover') : 'cover',
              objectPosition: coverPosition === 'top' ? 'center top' : coverPosition === 'bottom' ? 'center bottom' : 'center center',
              backgroundColor: 'hsl(var(--muted))'
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          <div className="absolute bottom-4 left-6 flex items-end gap-3">
            {logoUrl && <img src={logoUrl} alt="" className="w-12 h-12 rounded-xl object-contain bg-white/90 p-1 shadow-md" />}
            <div className="text-white">
              {!coverUrl && <span className="text-xs font-medium opacity-70 block mb-0.5">Онлайн-обучение</span>}
              <h2 className="text-lg lg:text-2xl font-bold drop-shadow-md leading-tight">{customName || organizationName}</h2>
              {customSubtitle && <p className="text-xs lg:text-sm opacity-80 mt-0.5">{customSubtitle}</p>}
            </div>
          </div>
        </div>

        {/* Sub-header */}
        <div className="flex items-center justify-between px-4 lg:px-6 h-12 border-t border-border/50 bg-card/95 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4.5 h-4.5 text-primary" />
            <h1 className="font-display text-base font-semibold text-foreground/80">Курс</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-[1400px] w-full mx-auto px-4 lg:px-6 py-6">
        <CourseDetailsContent
          course={course}
          courseStudents={courseStudents}
          organizationId={organizationId}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onEnrollStudent={() => {}}
          onCourseDeleted={() => navigate("/organization")}
          onCourseUpdated={refreshStudents}
          onRefreshStudents={refreshStudents}
        />
      </div>

      <OrgDashboardFooter />
      </main>
    </div>
  );
}

export default function OrganizationCourseDetails() {
  const { user } = useAuth();
  const { courseId } = useParams();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: prof } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      let orgId = prof?.organization_id || (await supabase.rpc("current_organization_id")).data as string | null;
      if (!orgId) {
        const { data: firstOrg } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
        orgId = firstOrg?.id || null;
      }
      setOrganizationId(orgId);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  if (!organizationId || !courseId) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Курс не найден</div>;
  }

  return (
    <OrgDashboardProvider>
      <CoursePageInner organizationId={organizationId} courseId={courseId} />
    </OrgDashboardProvider>
  );
}
