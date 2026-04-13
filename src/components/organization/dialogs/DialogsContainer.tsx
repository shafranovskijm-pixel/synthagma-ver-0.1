import { 
  ImportStudentsDialog,
  UnenrollConfirmDialog,
  AddStudentDialog,
  EnrollDialog,
  CategoryDialog,
  InviteEmailDialog,
  StudentDetailsDialog,
  StudentCoursesDialog,
  OrgDetailsDialog,
  AddCompanyDialog,
  EditCompanyDialog,
  CreateLinkDialog,
  CourseStudentsDialog
} from "./index";
import { CourseDocumentsManager } from "@/components/organization/CourseDocumentsManager";
import { StudentDocumentsManager } from "@/components/organization/StudentDocumentsManager";
import { BulkDocumentUpload } from "@/components/organization/BulkDocumentUpload";
import { StudentDetailCard } from "@/components/organization/StudentDetailCard";
import { BulkFRDOExport } from "@/components/organization/BulkFRDOExport";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";

export function DialogsContainer() {
  const d = useOrgDashboard();

  return (
    <>
      <ImportStudentsDialog
        open={d.showImportDialog}
        onOpenChange={d.setShowImportDialog}
        organizationId={d.organizationId}
        courses={d.courses}
        companies={d.companies}
      />

      <UnenrollConfirmDialog
        open={d.enrollmentActions.showUnenrollConfirm}
        onOpenChange={d.enrollmentActions.setShowUnenrollConfirm}
        selectedCount={d.getSelectedEnrollmentsCount()}
        isUnenrolling={d.enrollmentActions.isUnenrolling}
        onConfirm={d.handleBulkUnenroll}
      />

      <AddStudentDialog
        open={d.studentManagement.showAddStudentDialog}
        onOpenChange={d.studentManagement.setShowAddStudentDialog}
        courses={d.courses}
        companies={d.companies}
        onSubmit={async (name, email, courseIds, companyId, login, password) => {
          await d.studentManagement.createStudent({ name, email, courseIds, companyId, login, password });
        }}
        isCreating={d.studentManagement.isCreatingStudent}
      />

      <EnrollDialog
        open={d.enrollmentActions.showEnrollDialog}
        onOpenChange={d.enrollmentActions.setShowEnrollDialog}
        selectedCount={d.enrollmentActions.selectedStudentIds.size}
        courses={d.courses}
        categories={d.categories}
        getCategoryById={d.getCategoryById}
        isEnrolling={d.enrollmentActions.isEnrolling}
        onEnroll={async (courseId) => {
          d.enrollmentActions.setEnrollCourseId(courseId);
          await d.enrollmentActions.bulkEnroll(courseId, d.students, d.allProfiles, d.courses);
        }}
      />

      <CategoryDialog
        open={d.showCategoryDialog}
        onOpenChange={d.setShowCategoryDialog}
        isCreating={d.isCreatingCategory}
        onCreate={async (name, color) => {
          d.categoryActions.setNewCategoryName(name);
          d.categoryActions.setNewCategoryColor(color);
          await d.categoryActions.createCategory();
        }}
      />

      {/* CourseDetailsModal removed — now a full page at /organization/course/:courseId */}

      <CourseStudentsDialog
        open={d.courseStudentsManager.showCourseStudentsDialog}
        onOpenChange={d.courseStudentsManager.setShowCourseStudentsDialog}
        course={d.courseStudentsManager.selectedCourse}
        courseStudents={d.courseStudentsManager.courseStudents}
        availableStudents={d.courseStudentsManager.availableStudentsForCourse}
        organizationId={d.organizationId}
        isLoading={d.courseStudentsManager.isLoadingCourseStudents}
        selectedStudentsToAdd={d.courseStudentsManager.selectedStudentsToAdd}
        onToggleStudentSelection={d.courseStudentsManager.toggleStudentSelection}
        onAddStudentsToCourse={d.courseStudentsManager.addStudentsToCourse}
        isAddingStudents={d.courseStudentsManager.isAddingStudentsToCourse}
        onRemoveFromCourse={d.courseStudentsManager.removeStudentFromCourse}
        onShowInviteEmailDialog={() => d.emailInvitation.setShowInviteEmailDialog(true)}
        onShowStudentDocs={d.studentDocsDialog.openStudentDocs}
        onRefresh={d.refreshData}
      />

      <InviteEmailDialog
        open={d.emailInvitation.showInviteEmailDialog}
        onOpenChange={d.emailInvitation.setShowInviteEmailDialog}
        courseTitle={d.courseStudentsManager.selectedCourse?.title}
        isSending={d.emailInvitation.isSendingInvitation}
        onSend={async (email) => { await d.emailInvitation.sendInvitationDirect(email, d.courseStudentsManager.selectedCourse); }}
      />

      <StudentDetailsDialog
        open={d.studentDetailsDialog.showStudentDialog}
        onOpenChange={d.studentDetailsDialog.setShowStudentDialog}
        studentDetails={d.studentDetailsDialog.selectedStudent}
        isLoading={d.studentDetailsDialog.isLoadingStudentDetails}
        companies={d.companies}
        studentCompanyId={d.studentDetailsDialog.studentCompanyId}
        onStudentCompanyIdChange={d.studentDetailsDialog.setStudentCompanyId}
        isSavingStudentCompany={d.studentDetailsDialog.isSavingStudentCompany}
        onAttachToCompany={d.studentDetailsDialog.handleAttachStudentToCompany}
        isCreatingCredentials={d.studentActions.isCreatingCredentials}
        onCreateCredentials={d.studentDetailsDialog.handleCreateStudentCredentials}
        isSendingCredentials={d.studentActions.isSendingCredentials}
        onSendCredentials={d.studentDetailsDialog.handleSendCredentials}
        isSendingCredentialsEmail={d.studentActions.isSendingCredentialsEmail}
        onSendCredentialsEmail={d.studentDetailsDialog.handleSendCredentialsEmail}
        isDeletingStudent={d.studentActions.isDeletingStudent}
        onDeleteStudent={d.studentDetailsDialog.handleDeleteStudentCompletely}
        onCopyCredentials={d.studentDetailsDialog.handleCopyCredentials}
      />

      <AddCompanyDialog
        open={d.companyActions.showAddCompanyDialog}
        onOpenChange={d.companyActions.setShowAddCompanyDialog}
        name={d.companyActions.newCompanyName}
        onNameChange={d.companyActions.setNewCompanyName}
        email={d.companyActions.newCompanyEmail}
        onEmailChange={d.companyActions.setNewCompanyEmail}
        inn={d.companyActions.newCompanyInn}
        onInnChange={d.companyActions.setNewCompanyInn}
        contactName={d.companyActions.newCompanyContactName}
        onContactNameChange={d.companyActions.setNewCompanyContactName}
        phone={d.companyActions.newCompanyPhone}
        onPhoneChange={d.companyActions.setNewCompanyPhone}
        isCreating={d.companyActions.isCreatingCompany}
        onCreate={d.handleCompanyCreate}
      />

      <EditCompanyDialog
        open={d.companyActions.showEditCompanyDialog}
        onOpenChange={d.companyActions.setShowEditCompanyDialog}
        name={d.companyActions.editCompanyName}
        onNameChange={d.companyActions.setEditCompanyName}
        email={d.companyActions.editCompanyEmail}
        onEmailChange={d.companyActions.setEditCompanyEmail}
        inn={d.companyActions.editCompanyInn}
        onInnChange={d.companyActions.setEditCompanyInn}
        contactName={d.companyActions.editCompanyContactName}
        onContactNameChange={d.companyActions.setEditCompanyContactName}
        phone={d.companyActions.editCompanyPhone}
        onPhoneChange={d.companyActions.setEditCompanyPhone}
        isSaving={d.companyActions.isSavingCompany}
        onSave={d.handleCompanySave}
      />

      <OrgDetailsDialog
        open={d.organizationsTab.showOrgDetails}
        onOpenChange={d.organizationsTab.setShowOrgDetails}
        organization={d.organizationsTab.selectedOrg}
        students={d.organizationsTab.orgStudents}
        isLoading={d.organizationsTab.isLoadingOrgDetails}
      />

      <StudentCoursesDialog
        open={d.studentCoursesDialog.showStudentCoursesDialog}
        onOpenChange={d.studentCoursesDialog.setShowStudentCoursesDialog}
        student={d.studentCoursesDialog.selectedStudentForCourses}
        isLoading={d.studentCoursesDialog.isLoadingStudentCourses}
        studentEnrollments={d.studentCoursesDialog.studentEnrollments}
        availableCourses={d.studentCoursesDialog.availableCoursesForStudent}
        selectedCoursesToAdd={d.studentCoursesDialog.selectedCoursesToAdd}
        searchQuery={d.studentCoursesDialog.studentCoursesSearchQuery}
        onSearchQueryChange={d.studentCoursesDialog.setStudentCoursesSearchQuery}
        onToggleCourseSelection={d.studentCoursesDialog.toggleCourseSelection}
        isAddingCourses={d.studentCoursesDialog.isAddingCoursesToStudent}
        onAddCourses={d.studentCoursesDialog.addCourses}
        onRemoveEnrollment={d.studentCoursesDialog.removeEnrollment}
        onResetProgress={d.studentCoursesDialog.resetProgress}
        getCategoryById={d.getCategoryById}
      />

      <CreateLinkDialog
        open={d.registrationLinks.showCreateLinkDialog}
        onOpenChange={d.registrationLinks.setShowCreateLinkDialog}
        companyName={d.registrationLinks.newLinkCompanyName}
        onCompanyNameChange={d.registrationLinks.setNewLinkCompanyName}
        inn={d.registrationLinks.newLinkInn}
        onInnChange={d.registrationLinks.setNewLinkInn}
        isCreating={d.registrationLinks.isCreatingLink}
        onCreate={d.registrationLinks.createLink}
      />

      {/* Course Documents Manager */}
      {d.courseDocsDialog.selectedCourseForDocs && (
        <CourseDocumentsManager 
          courseId={d.courseDocsDialog.selectedCourseForDocs.id} 
          courseName={d.courseDocsDialog.selectedCourseForDocs.title} 
          isOpen={d.courseDocsDialog.showCourseDocsDialog} 
          onClose={d.courseDocsDialog.closeCourseDocs} 
        />
      )}

      {/* Student Documents Manager */}
      {d.studentDocsDialog.selectedStudentForDocs && (
        <StudentDocumentsManager 
          enrollmentId={d.studentDocsDialog.selectedStudentForDocs.enrollmentId} 
          studentName={d.studentDocsDialog.selectedStudentForDocs.studentName} 
          courseName={d.studentDocsDialog.selectedStudentForDocs.courseName} 
          isOpen={d.studentDocsDialog.showStudentDocsDialog} 
          onClose={d.studentDocsDialog.closeStudentDocs} 
        />
      )}

      {/* Bulk Document Upload */}
      {d.organizationId && (
        <BulkDocumentUpload 
          organizationId={d.organizationId} 
          isOpen={d.showBulkUploadDialog} 
          onClose={() => d.setShowBulkUploadDialog(false)} 
        />
      )}

      {/* Student Detail Card */}
      {d.organizationId && (
        <StudentDetailCard
          isOpen={d.studentDetailCard.showStudentDetailCard}
          onOpenChange={d.studentDetailCard.setShowStudentDetailCard}
          student={d.studentDetailCard.studentDetailCardData}
          organizationId={d.organizationId}
          enrollments={d.studentDetailCard.studentDetailCardEnrollments}
        />
      )}
      
      <BulkFRDOExport
        isOpen={d.enrollmentActions.showBulkFRDOExport}
        onOpenChange={d.enrollmentActions.setShowBulkFRDOExport}
        organizationId={d.organizationId}
        selectedStudentIds={d.enrollmentActions.selectedStudentIds}
        students={d.students}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={d.enrollmentActions.showBulkDeleteConfirm} onOpenChange={d.enrollmentActions.setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить учеников?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить {d.enrollmentActions.selectedStudentIds.size} учеников?
              Это действие нельзя отменить. Все данные учеников, включая зачисления и документы, будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={d.enrollmentActions.isBulkDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => d.enrollmentActions.bulkDelete(d.students)} 
              disabled={d.enrollmentActions.isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {d.enrollmentActions.isBulkDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Удаление...
                </>
              ) : (
                "Удалить"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
