import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { User, Video, BookOpen, FileText } from "lucide-react";
import { useLaborSafetyStudent } from "@/hooks/useLaborSafetyStudent";
import { LSProfileTab } from "./labor-safety/LSProfileTab";
import { LSIdentificationTab } from "./labor-safety/LSIdentificationTab";
import { LSCoursesTab } from "./labor-safety/LSCoursesTab";
import { LSDocumentsTab } from "./labor-safety/LSDocumentsTab";

interface LaborSafetyRecord {
  id: string;
  group_id: string;
  full_name: string;
  snils: string | null;
  position: string | null;
  inn: string | null;
  organization_name: string | null;
  protocol_number: string | null;
  program_name: string | null;
  exam_date: string | null;
  is_passed: boolean;
  created_at?: string;
}

interface LaborSafetyStudentDetailCardProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  record: LaborSafetyRecord | null;
  organizationId: string;
  onRecordUpdated?: () => void;
}

export function LaborSafetyStudentDetailCard({ isOpen, onOpenChange, record, organizationId, onRecordUpdated }: LaborSafetyStudentDetailCardProps) {
  const s = useLaborSafetyStudent(isOpen, record, organizationId, onRecordUpdated);

  if (!record) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="font-display flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="text-xl">{record.full_name}</div>
              <div className="text-sm font-normal text-muted-foreground">{s.profile?.email || record.organization_name || "Охрана труда"}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={s.activeTab} onValueChange={s.setActiveTab} className="flex-1">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-6 h-12">
            <TabsTrigger value="profile" className="rounded-lg data-[state=active]:bg-primary/10 gap-2"><User className="w-4 h-4" />Личное дело</TabsTrigger>
            <TabsTrigger value="identification" className="rounded-lg data-[state=active]:bg-primary/10 gap-2"><Video className="w-4 h-4" />Идентификация</TabsTrigger>
            <TabsTrigger value="courses" className="rounded-lg data-[state=active]:bg-primary/10 gap-2"><BookOpen className="w-4 h-4" />Курсы</TabsTrigger>
            <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-primary/10 gap-2"><FileText className="w-4 h-4" />Документы</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[60vh]">
            <div className="p-6">
              {s.isLoading ? (
                <div className="flex items-center justify-center py-12"><SigmaSpinner size="lg" /></div>
              ) : (
                <>
                  <TabsContent value="profile" className="m-0">
                    <LSProfileTab
                      profile={s.profile}
                      enrollmentsCount={s.enrollments.length}
                      isEditingCredentials={s.isEditingCredentials}
                      setIsEditingCredentials={s.setIsEditingCredentials}
                      newLogin={s.newLogin}
                      setNewLogin={s.setNewLogin}
                      newPassword={s.newPassword}
                      setNewPassword={s.setNewPassword}
                      isUpdatingCredentials={s.isUpdatingCredentials}
                      copiedField={s.copiedField}
                      showPassword={s.showPassword}
                      setShowPassword={s.setShowPassword}
                      isCreatingProfile={s.isCreatingProfile}
                      isSendingCredentials={s.isSendingCredentials}
                      isSendingReminder={s.isSendingReminder}
                      uploadingType={s.uploadingType}
                      checklistItems={s.checklistItems}
                      fileInputRef={s.fileInputRef}
                      createProfileForRecord={s.createProfileForRecord}
                      sendCredentialsToUser={s.sendCredentialsToUser}
                      copyToClipboard={s.copyToClipboard}
                      handleUpdateCredentials={s.handleUpdateCredentials}
                      handleUploadClick={s.handleUploadClick}
                      handleFileChange={s.handleFileChange}
                      handleSendDocReminder={s.handleSendDocReminder}
                    />
                  </TabsContent>

                  <TabsContent value="identification" className="m-0">
                    <LSIdentificationTab
                      hasProfile={!!s.profile}
                      verifications={s.verifications}
                      latestVerification={s.latestVerification}
                      handleManualVerification={s.handleManualVerification}
                    />
                  </TabsContent>

                  <TabsContent value="courses" className="m-0">
                    <LSCoursesTab
                      hasProfile={!!s.profile}
                      enrollments={s.enrollments}
                      coursesToEnroll={s.coursesToEnroll}
                      isAddingCourse={s.isAddingCourse}
                      setIsAddingCourse={s.setIsAddingCourse}
                      selectedCourseIds={s.selectedCourseIds}
                      setSelectedCourseIds={s.setSelectedCourseIds}
                      isEnrolling={s.isEnrolling}
                      handleEnrollToCourse={s.handleEnrollToCourse}
                      handleRemoveEnrollment={s.handleRemoveEnrollment}
                      handleResetProgress={s.handleResetProgress}
                    />
                  </TabsContent>

                  <TabsContent value="documents" className="m-0">
                    <LSDocumentsTab
                      hasProfile={!!s.profile}
                      identityDocs={s.identityDocs}
                      handleDeleteDoc={s.handleDeleteDoc}
                    />
                  </TabsContent>
                </>
              )}
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
