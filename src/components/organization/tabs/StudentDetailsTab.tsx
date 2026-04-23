import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, FileText, Video, BookOpen, Clock, MessageCircle, LogIn, Send } from "lucide-react";
import { SendForSigningDialog, type SendForSigningPayload } from "@/components/signing/SendForSigningDialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { useAuth } from "@/hooks/useAuth";
import { useStudentDetailCardLogic } from "@/hooks/useStudentDetailCard";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { ProfileTab } from "@/components/organization/student-detail/ProfileTab";
import { IdentificationTab } from "@/components/organization/student-detail/IdentificationTab";
import { CoursesTab } from "@/components/organization/student-detail/CoursesTab";
import { DocumentsTab } from "@/components/organization/student-detail/DocumentsTab";
import { ActivityTab } from "@/components/organization/student-detail/ActivityTab";
import { ChatTab } from "@/components/organization/student-detail/ChatTab";
import { FRDOExportDialog } from "@/components/organization/FRDOExportDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

const TABS = [
  { key: "profile", label: "Личное дело", icon: User },
  { key: "identification", label: "Идентификация", icon: Video },
  { key: "courses", label: "Курсы", icon: BookOpen },
  { key: "documents", label: "Документы", icon: FileText },
  { key: "activity", label: "Активность", icon: Clock },
  { key: "chat", label: "Чат", icon: MessageCircle },
];

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

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

export function StudentDetailsTab() {
  const navigate = useNavigate();
  const d = useOrgDashboard();
  const { user } = useAuth();
  const organizationId = d.organizationId;
  const studentId = d.tabNavigation.selectedStudentId;

  const [student, setStudent] = useState<StudentData | null>(null);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingPayload, setSigningPayload] = useState<SendForSigningPayload | null>(null);

  const { plan: orgPlan } = useSubscriptionLimits(organizationId);

  const loadStudent = useCallback(async (showSpinner = true) => {
    if (!studentId || !organizationId) return;
    if (showSpinner) setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, login, generated_password, last_visit_at, organization_id, company_id, companies(name)")
      .eq("user_id", studentId)
      .maybeSingle();

    if (!profile) {
      setStudent(null);
      setEnrollments([]);
      if (showSpinner) setLoading(false);
      return;
    }

    let decryptedPw: string | null = null;
    try {
      const { data: pw, error: pwErr } = await supabase.rpc("get_decrypted_student_password", {
        p_user_id: profile.user_id,
      });
      if (pwErr) {
        console.warn("[StudentDetailsTab] decrypt RPC error:", pwErr);
      }
      const raw = (pw as string) || "";
      decryptedPw = raw && !raw.startsWith("ENC:") ? raw : null;
    } catch (e) {
      console.warn("[StudentDetailsTab] decrypt RPC threw:", e);
      decryptedPw = null;
    }

    setStudent({
      id: profile.user_id,
      user_id: profile.user_id,
      name: profile.full_name || "Без имени",
      email: profile.email || "",
      login: profile.login,
      company_name: (profile as any).companies?.name || null,
      generated_password: decryptedPw,
      last_visit_at: profile.last_visit_at,
    });

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
        expires_at: e.expires_at,
      })));
    } else {
      setEnrollments([]);
    }

    if (showSpinner) setLoading(false);
  }, [studentId, organizationId]);

  useEffect(() => {
    loadStudent(true);
  }, [loadStudent]);

  const h = useStudentDetailCardLogic({
    isOpen: !!student,
    student,
    organizationId,
    enrollments,
    onStudentUpdated: () => {
      loadStudent(false);
    },
  });

  const isOnline = student?.last_visit_at && (Date.now() - new Date(student.last_visit_at).getTime()) < 5 * 60 * 1000;

  if (loading) {
    return <div className="flex items-center justify-center py-12"><SigmaSpinner size="lg" /></div>;
  }

  if (!student) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="gap-1.5 rounded-xl" onClick={() => d.tabNavigation.setActiveTab("students")}>
          <ArrowLeft className="w-4 h-4" /> Назад к ученикам
        </Button>
        <div className="text-center py-12 text-muted-foreground">Ученик не найден</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with back button and login-as */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 rounded-xl" onClick={() => d.tabNavigation.setActiveTab("students")}>
          <ArrowLeft className="w-4 h-4" /> Назад к ученикам
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-xl hover:text-primary hover:bg-primary/10 hover:border-primary/30"
          onClick={() => {
            localStorage.setItem('adminViewAsStudent', JSON.stringify({
              userId: student.user_id,
              name: student.name,
              orgReturn: '/organization',
            }));
            navigate('/student');
          }}
        >
          <LogIn className="w-4 h-4" />
          Войти как ученик
        </Button>
      </div>

      {/* Student info header */}
      <div className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center relative">
          <User className="w-6 h-6 text-primary" />
          <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background ${isOnline ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
        </div>
        <div>
          <div className="text-lg font-semibold flex items-center gap-2">
            {student.name}
            <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${isOnline ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
              {isOnline ? 'онлайн' : student.last_visit_at ? `был(а) ${formatTimeAgo(new Date(student.last_visit_at))}` : 'не заходил(а)'}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">{student.email}</div>
        </div>
      </div>

      {/* Content: sidebar menu + tab content */}
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
                  ${isActive ? 'bg-primary/15 text-primary border-r-2 border-primary' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}
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
                  ${isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}
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
              {h.activeTab === "profile" && <ProfileTab student={student} enrollmentsCount={enrollments.length} h={h} orgPlan={orgPlan} />}
              {h.activeTab === "identification" && <IdentificationTab h={h} />}
              {h.activeTab === "courses" && <CoursesTab enrollments={enrollments} h={h} organizationId={organizationId} studentUserId={student.user_id} />}
              {h.activeTab === "documents" && <DocumentsTab h={h} />}
              {h.activeTab === "activity" && <ActivityTab userId={student.user_id} organizationId={organizationId} studentName={student.name} />}
              {h.activeTab === "chat" && user && <ChatTab studentUserId={student.user_id} organizationId={organizationId} currentUserId={user.id} studentName={student.name} />}
            </>
          )}
        </div>
      </div>

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
    </div>
  );
}
