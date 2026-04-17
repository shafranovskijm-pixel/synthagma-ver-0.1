import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, User, CreditCard, Handshake, HelpCircle, LogOut, Sparkles, Settings, FileText, Video, BookOpen, Clock, MessageCircle, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { OrgDashboardFooter } from "@/components/organization/OrgDashboardFooter";
import { OrgNotifications } from "@/components/organization/OrgNotifications";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HelpCenterDialog } from "@/components/shared/HelpCenterDialog";
import { differenceInDays } from "date-fns";
import defaultCoverImg from "@/assets/default-org-cover.jpg";
import { OrgSidebar } from "@/components/organization/OrgSidebar";
import { useStudentDetailCardLogic } from "@/hooks/useStudentDetailCard";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { ProfileTab } from "@/components/organization/student-detail/ProfileTab";
import { IdentificationTab } from "@/components/organization/student-detail/IdentificationTab";
import { CoursesTab } from "@/components/organization/student-detail/CoursesTab";
import { DocumentsTab } from "@/components/organization/student-detail/DocumentsTab";
import { ActivityTab } from "@/components/organization/student-detail/ActivityTab";
import { ChatTab } from "@/components/organization/student-detail/ChatTab";
import { FRDOExportDialog } from "@/components/organization/FRDOExportDialog";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

function getUserInitials(email?: string | null, name?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0][0]?.toUpperCase() || "?";
  }
  if (email) return email[0]?.toUpperCase() || "?";
  return "?";
}

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

interface StudentData {
  id: string;
  user_id: string;
  name: string;
  email: string;
  login?: string | null;
  company_name?: string | null;
  generated_password?: string | null;
  last_visit_at?: string | null;
}

interface StudentEnrollment {
  id: string;
  course_id: string;
  course_title: string;
  progress: number;
  status: string;
  started_at: string;
  completed_at?: string | null;
  time_spent: number;
  access_days?: number | null;
  expires_at?: string | null;
}

const TABS = [
  { key: "profile", label: "Личное дело", icon: User },
  { key: "identification", label: "Идентификация", icon: Video },
  { key: "courses", label: "Курсы", icon: BookOpen },
  { key: "documents", label: "Документы", icon: FileText },
  { key: "activity", label: "Активность", icon: Clock },
  { key: "chat", label: "Чат", icon: MessageCircle },
];

function StudentPageInner({ studentId }: { studentId: string }) {
  const navigate = useNavigate();
  const d = useOrgDashboard();
  const organizationId = d.organizationId;
  const { user } = useAuth();

  const organizationName = d.organizationName;
  const customName = d.branding.brandingSettings.customName;
  const customSubtitle = d.branding.brandingSettings.customSubtitle;
  const logoUrl = d.branding.brandingSettings.logoUrl;
  const coverUrl = d.branding.brandingSettings.coverUrl;
  const coverPosition = d.branding.brandingSettings.coverPosition;
  const displayCover = coverUrl || defaultCoverImg;

  const [paidUntil, setPaidUntil] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const planName = d.subscriptionLimits?.plan;

  const [student, setStudent] = useState<StudentData | null>(null);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [loading, setLoading] = useState(true);

  const { plan: orgPlan } = useSubscriptionLimits(organizationId);

  // Load student data
  const loadStudent = async (showSpinner = true) => {
    if (!studentId || !organizationId) return;
    if (showSpinner) setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, login, generated_password, last_visit_at, organization_id, company_id, companies(name)")
      .eq("user_id", studentId)
      .maybeSingle();

    if (!profile) {
      if (showSpinner) setLoading(false);
      return;
    }

    const companyName = (profile as any).companies?.name || null;

    // Decrypt password via RPC (profiles.generated_password is stored as ENC:...)
    let decryptedPw: string | null = null;
    try {
      const { data: pw, error: pwErr } = await supabase.rpc("get_decrypted_student_password", {
        p_user_id: profile.user_id,
      });
      if (pwErr) {
        console.warn("[StudentDetails] decrypt RPC error:", pwErr);
      }
      const raw = (pw as string) || "";
      // Защита: если RPC вернула null/пусто или почему-то ENC:... — показываем "—"
      decryptedPw = raw && !raw.startsWith("ENC:") ? raw : null;
    } catch (e) {
      console.warn("[StudentDetails] decrypt RPC threw:", e);
      decryptedPw = null;
    }

    setStudent({
      id: profile.user_id,
      user_id: profile.user_id,
      name: profile.full_name || "Без имени",
      email: profile.email || "",
      login: profile.login,
      company_name: companyName,
      generated_password: decryptedPw,
      last_visit_at: profile.last_visit_at });

    // Load enrollments for courses belonging to this org
    const { data: orgCourses } = await supabase
      .from("courses")
      .select("id")
      .eq("organization_id", organizationId);

    const courseIds = (orgCourses || []).map(c => c.id);

    if (courseIds.length > 0) {
      const { data: enrs } = await supabase
        .from("enrollments")
        .select("id, course_id, progress, status, started_at, completed_at, time_spent, access_days, expires_at, courses(title)")
        .eq("user_id", profile.user_id)
        .in("course_id", courseIds);

      setEnrollments((enrs || []).map((e: any) => ({
        id: e.id,
        course_id: e.course_id,
        course_title: e.courses?.title || "Без названия",
        progress: e.progress || 0,
        status: e.status || "active",
        started_at: e.started_at,
        completed_at: e.completed_at,
        time_spent: e.time_spent || 0,
        access_days: e.access_days,
        expires_at: e.expires_at })));
    }

    if (showSpinner) setLoading(false);
  };

  useEffect(() => {
    loadStudent(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    supabase.from("organizations").select("paid_until").eq("id", organizationId).single()
      .then(({ data }) => { if (data?.paid_until) setPaidUntil(data.paid_until); });
  }, [organizationId]);

  // Hook for student detail logic (reuses existing logic)
  const h = useStudentDetailCardLogic({
    isOpen: !!student,
    student,
    organizationId,
    enrollments,
    onStudentUpdated: () => {
      // Reload
      window.location.reload();
    } });

  const isOnline = student?.last_visit_at && (Date.now() - new Date(student.last_visit_at).getTime()) < 5 * 60 * 1000;

  const daysRemaining = paidUntil ? Math.max(0, differenceInDays(new Date(paidUntil), new Date())) : null;
  const planLabel = planName === 'free' ? 'Бесплатный' : planName === 'start' ? 'Старт' : planName === 'standard' ? 'Стандарт' : planName === 'professional' ? 'Профессиональный' : planName === 'maximum' ? 'Максимальный' : 'Тариф';

  const userEmail = d.user?.email;
  const initials = getUserInitials(userEmail);

  if (!organizationId) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Организация не найдена</div>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex">
        <OrgSidebar />
        <main className="flex-1 flex items-center justify-center lg:ml-[88px]">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </main>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-background flex">
        <OrgSidebar />
        <main className="flex-1 flex items-center justify-center lg:ml-[88px] text-muted-foreground">
          Ученик не найден
        </main>
      </div>
    );
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
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:flex gap-1.5 rounded-full text-xs hover:text-primary hover:bg-primary/10 hover:border-primary/30 transition-all duration-200"
                onClick={() => {
                  localStorage.setItem('adminViewAsStudent', JSON.stringify({
                    userId: student.user_id,
                    name: student.name,
                    orgReturn: '/organization'
                  }));
                  navigate('/student');
                }}
              >
                <LogIn className="w-4 h-4" />
                Войти как ученик
              </Button>

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
                  <DropdownMenuItem onClick={() => navigate("/organization/whats-new")} className="rounded-lg gap-2.5 py-2.5"><Sparkles className="w-4 h-4" />Что нового?</DropdownMenuItem>
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
              style={{
                objectFit: coverUrl ? (coverPosition === 'contain' ? 'contain' : 'cover') : 'cover',
                objectPosition: coverPosition === 'top' ? 'center top' : coverPosition === 'bottom' ? 'center bottom' : 'center center',
                backgroundColor: 'hsl(var(--muted))'
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            <div className="absolute bottom-4 left-6 flex items-end gap-3">
              <div className="w-14 h-14 rounded-xl bg-white/90 flex items-center justify-center shadow-md">
                <User className="w-7 h-7 text-primary" />
              </div>
              <div className="text-white">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg lg:text-2xl font-bold drop-shadow-md leading-tight">{student.name}</h2>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isOnline ? 'bg-green-500/20 text-green-300' : 'bg-white/20 text-white/70'}`}>
                    {isOnline ? 'онлайн' : student.last_visit_at ? `был(а) ${formatTimeAgo(new Date(student.last_visit_at))}` : 'не заходил(а)'}
                  </span>
                </div>
                <p className="text-xs lg:text-sm opacity-80 mt-0.5">{student.email}</p>
              </div>
            </div>
          </div>

          {/* Sub-header */}
          <div className="flex items-center justify-between px-4 lg:px-6 h-12 border-t border-border/50 bg-card/95 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <User className="w-4.5 h-4.5 text-primary" />
              <h1 className="font-display text-base font-semibold text-foreground/80">Карточка ученика</h1>
            </div>
          </div>
        </header>

        {/* Content: sidebar menu + tab content */}
        <div className="flex-1 max-w-[1400px] w-full mx-auto px-4 lg:px-6 py-6">
          <div className="flex gap-6">
            {/* Vertical sidebar menu */}
            <nav className="hidden md:flex flex-col w-56 shrink-0 space-y-1">
              {TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = h.activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => h.setActiveTab(tab.key)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 text-left
                      ${isActive
                        ? 'bg-primary/15 text-primary border-r-2 border-primary'
                        : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                      }`}
                  >
                    <Icon className="w-4.5 h-4.5 shrink-0" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>

            {/* Mobile horizontal tabs */}
            <div className="md:hidden flex overflow-x-auto gap-1 pb-4 -mx-4 px-4 scrollbar-hide">
              {TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = h.activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => h.setActiveTab(tab.key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all
                      ${isActive
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                      }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="flex-1 min-w-0">
              {h.isLoading ? (
                <div className="flex items-center justify-center py-12"><SigmaSpinner size="lg" /></div>
              ) : (
                <>
                  {h.activeTab === "profile" && (
                    <ProfileTab student={student} enrollmentsCount={enrollments.length} h={h} orgPlan={orgPlan} />
                  )}
                  {h.activeTab === "identification" && (
                    <IdentificationTab h={h} />
                  )}
                  {h.activeTab === "courses" && (
                    <CoursesTab enrollments={enrollments} h={h} organizationId={organizationId} studentUserId={student.user_id} />
                  )}
                  {h.activeTab === "documents" && (
                    <DocumentsTab h={h} />
                  )}
                  {h.activeTab === "activity" && (
                    <ActivityTab userId={student.user_id} organizationId={organizationId} studentName={student.name} />
                  )}
                  {h.activeTab === "chat" && user && (
                    <ChatTab studentUserId={student.user_id} organizationId={organizationId} currentUserId={user.id} studentName={student.name} />
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <OrgDashboardFooter />
      </main>

      {/* Preview Dialog */}
      {h.previewDoc && (
        <Dialog open={!!h.previewDoc} onOpenChange={() => h.setPreviewDoc(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] rounded-2xl">
            <DialogHeader><DialogTitle>{h.previewDoc.name}</DialogTitle></DialogHeader>
            <div className="flex-1 overflow-auto">
              {h.previewDoc.type === 'image' && <img src={h.previewDoc.url} alt={h.previewDoc.name} className="max-w-full rounded-xl" />}
              {h.previewDoc.type === 'pdf' && <iframe src={h.previewDoc.url} className="w-full h-[70vh] rounded-xl" />}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* View Consent Dialog */}
      {h.viewConsentDialog && (
        <Dialog open={!!h.viewConsentDialog} onOpenChange={() => h.setViewConsentDialog(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] rounded-2xl">
            <DialogHeader><DialogTitle>Согласие на обработку ПД</DialogTitle></DialogHeader>
            <ScrollArea className="h-[70vh]">
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: h.viewConsentDialog.content_html }} />
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}

      {/* FRDO Export Dialog */}
      {h.isFRDODialogOpen && h.selectedEnrollmentForFRDO && (
        <FRDOExportDialog
          isOpen={h.isFRDODialogOpen}
          onOpenChange={h.setIsFRDODialogOpen}
          student={{ id: student.id, user_id: student.user_id, name: student.name, email: student.email }}
          enrollment={h.selectedEnrollmentForFRDO}
          organizationId={organizationId}
        />
      )}

      <HelpCenterDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

export default function OrganizationStudentDetails() {
  const { studentId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (studentId) {
      navigate(`/organization?tab=student-details&studentId=${studentId}`, { replace: true });
    } else {
      navigate('/organization', { replace: true });
    }
  }, [studentId, navigate]);

  return <div className="min-h-screen flex items-center justify-center"><SigmaSpinner size="lg" /></div>;
}
