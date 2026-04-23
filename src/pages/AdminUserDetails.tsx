import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, User, Video, BookOpen, FileText, Clock, MessageCircle, LogIn, Shield, Building2, GraduationCap, Copy, Eye, EyeOff, KeyRound, Pencil, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStudentDetailCardLogic } from "@/hooks/useStudentDetailCard";
import { ProfileTab } from "@/components/organization/student-detail/ProfileTab";
import { IdentificationTab } from "@/components/organization/student-detail/IdentificationTab";
import { CoursesTab } from "@/components/organization/student-detail/CoursesTab";
import { DocumentsTab } from "@/components/organization/student-detail/DocumentsTab";
import { ActivityTab } from "@/components/organization/student-detail/ActivityTab";
import { ChatTab } from "@/components/organization/student-detail/ChatTab";
import { FRDOExportDialog } from "@/components/organization/FRDOExportDialog";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin: { label: "Админ", color: "bg-purple-100 text-purple-700" },
  organization: { label: "Организация", color: "bg-blue-100 text-blue-700" },
  student: { label: "Слушатель", color: "bg-green-100 text-green-700" } };

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
}

const TABS = [
  { key: "profile", label: "Личное дело", icon: User },
  { key: "identification", label: "Идентификация", icon: Video },
  { key: "courses", label: "Курсы", icon: BookOpen },
  { key: "documents", label: "Документы", icon: FileText },
  { key: "activity", label: "Активность", icon: Clock },
  { key: "chat", label: "Чат", icon: MessageCircle },
];

export default function AdminUserDetails() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const { user: currentUser } = useAuth();

  const [student, setStudent] = useState<StudentData | null>(null);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Credentials editing
  const [credEdit, setCredEdit] = useState({ login: "", password: "", editing: false, saving: false });
  const [credPasswordVisible, setCredPasswordVisible] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      setLoading(true);

      // Get profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, login, generated_password, last_visit_at, organization_id, company_id, companies(name)")
        .eq("user_id", userId)
        .maybeSingle();

      if (!profile) {
        setLoading(false);
        return;
      }

      const companyName = (profile as any).companies?.name || null;
      const orgId = profile.organization_id;

      setStudent({
        id: profile.user_id,
        user_id: profile.user_id,
        name: profile.full_name || "Без имени",
        email: profile.email || "",
        login: profile.login,
        company_name: companyName,
        generated_password: profile.generated_password,
        last_visit_at: profile.last_visit_at });

      setOrganizationId(orgId);

      // Get org name
      if (orgId) {
        const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
        setOrganizationName(org?.name || null);
      }

      // Get role
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
      setUserRole(roleData?.role || null);

      // Load ALL enrollments for user
      const { data: enrs } = await supabase
        .from("enrollments")
        .select("id, course_id, progress, status, started_at, completed_at, time_spent, courses(title)")
        .eq("user_id", profile.user_id);

      setEnrollments((enrs || []).map((e: any) => ({
        id: e.id,
        course_id: e.course_id,
        course_title: e.courses?.title || "Без названия",
        progress: e.progress || 0,
        status: e.status || "active",
        started_at: e.started_at,
        completed_at: e.completed_at,
        time_spent: e.time_spent || 0 })));

      setLoading(false);
    };
    load();
  }, [userId]);

  const h = useStudentDetailCardLogic({
    isOpen: !!student,
    student,
    organizationId: organizationId || "",
    enrollments,
    onStudentUpdated: () => window.location.reload() });

  const handleSaveCredentials = async () => {
    if (!student) return;
    setCredEdit(prev => ({ ...prev, saving: true }));
    try {
      const { error } = await safeInvoke<any>("update-student-credentials", {
        body: {
          userId: student.user_id,
          login: credEdit.login.trim(),
          password: credEdit.password.trim() } });
      if (error) throw error;
      setStudent(prev => prev ? { ...prev, login: credEdit.login.trim(), generated_password: credEdit.password.trim() } : prev);
      setCredEdit(prev => ({ ...prev, editing: false, saving: false }));
      toast.success("Учётные данные обновлены");
    } catch (error: any) {
      toast.error("Ошибка", { description: getErrorMessage(error, "Не удалось сохранить") });
      setCredEdit(prev => ({ ...prev, saving: false }));
    }
  };

  const copyCredentials = (login: string, password: string) => {
    navigator.clipboard.writeText(`Логин: ${login}\nПароль: ${password}`);
    toast.success("Скопировано");
  };

  const isOnline = student?.last_visit_at && (Date.now() - new Date(student.last_visit_at).getTime()) < 5 * 60 * 1000;
  const roleInfo = userRole ? ROLE_LABELS[userRole] : null;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><SigmaSpinner size="lg" /></div>;
  }

  if (!student) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Пользователь не найден</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card border-b border-border">
        <div className="flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate("/admin")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center relative">
                <User className="w-5 h-5 text-primary" />
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${isOnline ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold">{student.name}</h1>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isOnline ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                    {isOnline ? 'онлайн' : student.last_visit_at ? `был(а) ${formatTimeAgo(new Date(student.last_visit_at))}` : 'не заходил(а)'}
                  </span>
                  {roleInfo && (
                    <Badge variant="outline" className={`text-xs ${roleInfo.color}`}>{roleInfo.label}</Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  {student.email}
                  {organizationName && <span className="text-xs">• {organizationName}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {userRole === 'student' && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs rounded-full"
                onClick={() => {
                  localStorage.setItem('adminViewAsStudent', JSON.stringify({
                    userId: student.user_id,
                    name: student.name,
                    orgName: organizationName || '',
                    orgReturn: '/admin' }));
                  navigate('/student');
                }}
              >
                <LogIn className="w-4 h-4" />
                Войти как ученик
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-[1400px] w-full mx-auto px-6 py-6">
        <div className="flex gap-6">
          {/* Vertical sidebar menu */}
          <nav className="hidden md:flex flex-col w-56 shrink-0 space-y-1">
            {/* Admin info card */}
            <div className="bg-card rounded-xl border border-border p-4 mb-4 space-y-3">
              <div className="text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 mb-1"><KeyRound className="w-3.5 h-3.5" /> Учётные данные</div>
                {!credEdit.editing ? (
                  <>
                    {student.login ? (
                      <div className="space-y-1 mt-2">
                        <div><span className="text-muted-foreground">Логин:</span> <code className="bg-muted px-1 py-0.5 rounded text-xs">{student.login}</code></div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Пароль:</span>
                          <code className="bg-muted px-1 py-0.5 rounded text-xs">{credPasswordVisible ? (student.generated_password || "—") : "••••••"}</code>
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setCredPasswordVisible(!credPasswordVisible)}>
                            {credPasswordVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </Button>
                          {student.generated_password && (
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyCredentials(student.login!, student.generated_password!)}>
                              <Copy className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1">Не заданы</p>
                    )}
                    <Button variant="ghost" size="sm" className="h-6 text-xs mt-2 w-full" onClick={() => setCredEdit({ login: student.login || "", password: student.generated_password || "", editing: true, saving: false })}>
                      {student.login ? <><Pencil className="w-3 h-3 mr-1" />Изменить</> : <><Plus className="w-3 h-3 mr-1" />Добавить</>}
                    </Button>
                  </>
                ) : (
                  <div className="space-y-2 mt-2">
                    <div>
                      <Label className="text-xs">Логин</Label>
                      <Input value={credEdit.login} onChange={e => setCredEdit(p => ({ ...p, login: e.target.value }))} className="h-7 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs">Пароль</Label>
                      <Input type="text" value={credEdit.password} onChange={e => setCredEdit(p => ({ ...p, password: e.target.value }))} className="h-7 text-xs" />
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-6 text-xs flex-1" onClick={() => setCredEdit(p => ({ ...p, editing: false }))}>Отмена</Button>
                      <Button size="sm" className="h-6 text-xs flex-1" disabled={credEdit.saving || !credEdit.login.trim() || !credEdit.password.trim()} onClick={handleSaveCredentials}>
                        {credEdit.saving ? <SigmaSpinner size="xs" /> : <Save className="w-3 h-3 mr-1" />}Сохранить
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                <span>User ID:</span>
                <code className="bg-muted px-1 py-0.5 rounded text-[10px] block mt-0.5 break-all">{student.user_id}</code>
              </div>
            </div>

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
                  <ProfileTab student={student} enrollmentsCount={enrollments.length} h={h} orgPlan={null} />
                )}
                {h.activeTab === "identification" && (
                  <IdentificationTab h={h} />
                )}
                {h.activeTab === "courses" && (
                  <CoursesTab enrollments={enrollments} h={h} organizationId={organizationId || ""} studentUserId={student.user_id} />
                )}
                {h.activeTab === "documents" && (
                  <DocumentsTab h={h} />
                )}
                {h.activeTab === "activity" && (
                  <ActivityTab userId={student.user_id} organizationId={organizationId || ""} studentName={student.name} />
                )}
                {h.activeTab === "chat" && currentUser && (
                  <ChatTab studentUserId={student.user_id} organizationId={organizationId || ""} currentUserId={currentUser.id} studentName={student.name} />
                )}
              </>
            )}
          </div>
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
          organizationId={organizationId || ""}
        />
      )}
    </div>
  );
}
