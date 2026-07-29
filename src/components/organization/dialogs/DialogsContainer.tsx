import { 
  ImportStudentsDialog,
  UnenrollConfirmDialog,
  AddStudentDialog,
  EnrollDialog,
  CategoryDialog,
  OrgDetailsDialog,
  AddCompanyDialog,
  EditCompanyDialog,
  CreateLinkDialog,
} from "./index";
import { CourseDocumentsManager } from "@/components/organization/CourseDocumentsManager";
import { StudentDocumentsManager } from "@/components/organization/StudentDocumentsManager";
import { BulkDocumentUpload } from "@/components/organization/BulkDocumentUpload";

import { BulkFRDOExport } from "@/components/organization/BulkFRDOExport";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

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
          await d.enrollmentActions.bulkEnroll(
            courseId,
            Array.from(d.enrollmentActions.selectedStudentIds),
            d.courses,
          );
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

      <BulkFRDOExport
        isOpen={d.enrollmentActions.showBulkFRDOExport}
        onOpenChange={d.enrollmentActions.setShowBulkFRDOExport}
        organizationId={d.organizationId || ""}
        selectedUserIds={Array.from(d.enrollmentActions.selectedStudentIds)}
      />

      {/* Bulk Archive Confirmation Dialog (single confirmation for the archive flow) */}
      <AlertDialog open={d.enrollmentActions.showBulkDeleteConfirm} onOpenChange={d.enrollmentActions.setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Перенести учеников в архив?</AlertDialogTitle>
            <AlertDialogDescription>
              Выбранные ученики ({d.enrollmentActions.selectedStudentIds.size}) будут перенесены в архив.
              Действие обратимо — их можно восстановить во вкладке «Архив».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={d.enrollmentActions.isBulkDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => d.enrollmentActions.bulkDelete(Array.from(d.enrollmentActions.selectedStudentIds))}
              disabled={d.enrollmentActions.isBulkDeleting}
            >
              {d.enrollmentActions.isBulkDeleting ? (
                <>
                  <SigmaSpinner size="sm" className="mr-2" />
                  Перенос...
                </>
              ) : (
                "Перенести в архив"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
