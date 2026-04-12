import { User, FileText, Video, BookOpen, Loader2, Clock, MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FRDOExportDialog } from "./FRDOExportDialog";
import { useStudentDetailCardLogic } from "@/hooks/useStudentDetailCard";
import { ProfileTab } from "./student-detail/ProfileTab";
import { IdentificationTab } from "./student-detail/IdentificationTab";
import { CoursesTab } from "./student-detail/CoursesTab";
import { DocumentsTab } from "./student-detail/DocumentsTab";
import { ActivityTab } from "./student-detail/ActivityTab";
import { ChatTab } from "./student-detail/ChatTab";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useAuth } from "@/hooks/useAuth";

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

interface StudentDetailCardProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  student: {
    id: string;
    user_id: string;
    name: string;
    email: string;
    login?: string | null;
    company_name?: string | null;
    generated_password?: string | null;
    last_visit_at?: string | null;
  } | null;
  organizationId: string;
  onStudentUpdated?: () => void;
  enrollments?: {
    id: string;
    course_id: string;
    course_title: string;
    progress: number;
    status: string;
    started_at: string;
    completed_at?: string | null;
    time_spent: number;
  }[];
}

export function StudentDetailCard({
  isOpen, onOpenChange, student, organizationId, enrollments = [], onStudentUpdated,
}: StudentDetailCardProps) {
  const h = useStudentDetailCardLogic({ isOpen, student, organizationId, enrollments, onStudentUpdated });
  const { plan: orgPlan } = useSubscriptionLimits(organizationId);
  const { user } = useAuth();

  const isOnline = student?.last_visit_at && (Date.now() - new Date(student.last_visit_at).getTime()) < 5 * 60 * 1000;

  if (!student) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="font-display flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center relative">
              <User className="w-6 h-6 text-primary" />
              <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background ${isOnline ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
            </div>
            <div>
              <div className="text-xl flex items-center gap-2">
                {student.name}
                <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${isOnline ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                  {isOnline ? 'онлайн' : student.last_visit_at ? `был(а) ${formatTimeAgo(new Date(student.last_visit_at))}` : 'не заходил(а)'}
                </span>
              </div>
              <div className="text-sm font-normal text-muted-foreground">{student.email}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={h.activeTab} onValueChange={h.setActiveTab} className="flex-1">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-6 h-12">
            <TabsTrigger value="profile" className="rounded-lg data-[state=active]:bg-primary/10 gap-2"><User className="w-4 h-4" />Личное дело</TabsTrigger>
            <TabsTrigger value="identification" className="rounded-lg data-[state=active]:bg-primary/10 gap-2"><Video className="w-4 h-4" />Идентификация</TabsTrigger>
            <TabsTrigger value="courses" className="rounded-lg data-[state=active]:bg-primary/10 gap-2"><BookOpen className="w-4 h-4" />Курсы</TabsTrigger>
            <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-primary/10 gap-2"><FileText className="w-4 h-4" />Документы</TabsTrigger>
            <TabsTrigger value="activity" className="rounded-lg data-[state=active]:bg-primary/10 gap-2"><Clock className="w-4 h-4" />Активность</TabsTrigger>
            <TabsTrigger value="chat" className="rounded-lg data-[state=active]:bg-primary/10 gap-2"><MessageCircle className="w-4 h-4" />Чат</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[60vh]">
            <div className="p-6">
              {h.isLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
              ) : (
                <>
                  <TabsContent value="profile" className="m-0">
                    <ProfileTab student={student} enrollmentsCount={enrollments.length} h={h} orgPlan={orgPlan} />
                  </TabsContent>
                  <TabsContent value="identification" className="m-0">
                    <IdentificationTab h={h} />
                  </TabsContent>
                  <TabsContent value="courses" className="m-0">
                    <CoursesTab enrollments={enrollments} h={h} organizationId={organizationId} studentUserId={student.user_id} />
                  </TabsContent>
                  <TabsContent value="documents" className="m-0">
                    <DocumentsTab h={h} />
                  </TabsContent>
                  <TabsContent value="activity" className="m-0">
                    <ActivityTab userId={student.user_id} organizationId={organizationId} studentName={student.name} />
                  </TabsContent>
                  <TabsContent value="chat" className="m-0">
                    {user && <ChatTab studentUserId={student.user_id} organizationId={organizationId} currentUserId={user.id} studentName={student.name} />}
                  </TabsContent>
                </>
              )}
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>

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
    </Dialog>
  );
}
