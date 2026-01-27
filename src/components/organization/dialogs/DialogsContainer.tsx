import { 
  ImportStudentsDialog,
  UnenrollConfirmDialog,
  AddStudentDialog,
  EnrollDialog,
  CategoryDialog,
  InviteEmailDialog,
  CourseDetailsModal,
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
import type { Course, Company, Student, CourseCategory } from "@/types/shared";

// Local organization interface for admin view
interface Organization {
  id: string;
  name: string;
  email: string;
  contact_name: string | null;
  phone: string | null;
  inn: string | null;
  ai_enabled: boolean;
  created_at: string;
  coursesCount?: number;
  studentsCount?: number;
}

type CourseDetailsTabType = "students" | "materials" | "history" | "tests" | "settings";

interface DialogsContainerProps {
  organizationId: string | null;
  courses: Course[];
  companies: Company[];
  categories: CourseCategory[];
  getCategoryById: (id: string) => CourseCategory | undefined;
  students: Student[];
  allProfiles: any[];
  
  // Import dialog
  showImportDialog: boolean;
  setShowImportDialog: (v: boolean) => void;
  
  // Unenroll dialog
  showUnenrollConfirm: boolean;
  setShowUnenrollConfirm: (v: boolean) => void;
  selectedEnrollmentsCount: number;
  isUnenrolling: boolean;
  onBulkUnenroll: () => void;
  
  // Add student dialog
  showAddStudentDialog: boolean;
  setShowAddStudentDialog: (v: boolean) => void;
  isCreatingStudent: boolean;
  onCreateStudent: (name: string, email: string, courseId: string, companyId: string, noLogin: boolean) => Promise<void>;
  
  // Enroll dialog
  showEnrollDialog: boolean;
  setShowEnrollDialog: (v: boolean) => void;
  selectedStudentIdsSize: number;
  isEnrolling: boolean;
  onEnroll: (courseId: string) => Promise<void>;
  
  // Category dialog
  showCategoryDialog: boolean;
  setShowCategoryDialog: (v: boolean) => void;
  isCreatingCategory: boolean;
  onCreateCategory: (name: string, color: string) => Promise<void>;
  
  // Course details modal
  showCourseDetailsModal: boolean;
  setShowCourseDetailsModal: (v: boolean) => void;
  selectedCourseForDetails: Course | null;
  courseStudents: any[];
  courseDetailsTab: CourseDetailsTabType;
  onTabChange: (tab: CourseDetailsTabType) => void;
  onEnrollStudent: () => void;
  onCourseDeleted?: () => void;
  onCourseUpdated?: () => void;
  
  // Course students dialog
  showCourseStudentsDialog: boolean;
  setShowCourseStudentsDialog: (v: boolean) => void;
  selectedCourse: Course | null;
  availableStudentsForCourse: any[];
  isLoadingCourseStudents: boolean;
  selectedStudentsToAdd: Set<string>;
  onToggleStudentSelection: (id: string) => void;
  onAddStudentsToCourse: () => void;
  isAddingStudentsToCourse: boolean;
  onRemoveFromCourse: (enrollmentId: string) => void;
  onCourseStudentsRefresh?: () => void;
  
  // Email invitation dialog
  showInviteEmailDialog: boolean;
  setShowInviteEmailDialog: (v: boolean) => void;
  isSendingInvitation: boolean;
  onSendInvitation: (email: string) => Promise<void>;
  
  // Student details dialog
  showStudentDialog: boolean;
  setShowStudentDialog: (v: boolean) => void;
  selectedStudent: any;
  isLoadingStudentDetails: boolean;
  studentCompanyId: string;
  setStudentCompanyId: (id: string) => void;
  isSavingStudentCompany: boolean;
  onAttachStudentToCompany: () => void;
  isCreatingCredentials: boolean;
  onCreateStudentCredentials: () => void;
  isSendingCredentials: boolean;
  onSendCredentials: () => void;
  isSendingCredentialsEmail: boolean;
  onSendCredentialsEmail: () => void;
  isDeletingStudent: boolean;
  onDeleteStudent: () => void;
  onCopyCredentials: (login: string, password: string) => void;
  
  // Company dialogs
  showAddCompanyDialog: boolean;
  setShowAddCompanyDialog: (v: boolean) => void;
  newCompanyName: string;
  setNewCompanyName: (v: string) => void;
  newCompanyEmail: string;
  setNewCompanyEmail: (v: string) => void;
  newCompanyInn: string;
  setNewCompanyInn: (v: string) => void;
  newCompanyContactName: string;
  setNewCompanyContactName: (v: string) => void;
  newCompanyPhone: string;
  setNewCompanyPhone: (v: string) => void;
  isCreatingCompany: boolean;
  onCreateCompany: () => void;
  
  showEditCompanyDialog: boolean;
  setShowEditCompanyDialog: (v: boolean) => void;
  editCompanyName: string;
  setEditCompanyName: (v: string) => void;
  editCompanyEmail: string;
  setEditCompanyEmail: (v: string) => void;
  editCompanyInn: string;
  setEditCompanyInn: (v: string) => void;
  editCompanyContactName: string;
  setEditCompanyContactName: (v: string) => void;
  editCompanyPhone: string;
  setEditCompanyPhone: (v: string) => void;
  isSavingCompany: boolean;
  onSaveCompany: () => void;
  
  // Org details dialog
  showOrgDetails: boolean;
  setShowOrgDetails: (v: boolean) => void;
  selectedOrg: Organization | null;
  orgStudents: any[];
  isLoadingOrgDetails: boolean;
  
  // Student courses dialog
  showStudentCoursesDialog: boolean;
  setShowStudentCoursesDialog: (v: boolean) => void;
  selectedStudentForCourses: any;
  isLoadingStudentCourses: boolean;
  studentEnrollments: any[];
  availableCoursesForStudent: Course[];
  selectedCoursesToAdd: Set<string>;
  studentCoursesSearchQuery: string;
  setStudentCoursesSearchQuery: (v: string) => void;
  onToggleCourseSelection: (id: string) => void;
  isAddingCoursesToStudent: boolean;
  onAddCourses: () => void;
  onRemoveEnrollment: (enrollmentId: string) => void;
  onResetProgress: (enrollmentId: string, courseTitle: string) => void;
  
  // Create link dialog
  showCreateLinkDialog: boolean;
  setShowCreateLinkDialog: (v: boolean) => void;
  newLinkCompanyName: string;
  setNewLinkCompanyName: (v: string) => void;
  newLinkInn: string;
  setNewLinkInn: (v: string) => void;
  isCreatingLink: boolean;
  onCreateLink: () => void;
  
  // Course docs dialog
  showCourseDocsDialog: boolean;
  selectedCourseForDocs: { id: string; title: string } | null;
  closeCourseDocs: () => void;
  
  // Student docs dialog
  showStudentDocsDialog: boolean;
  selectedStudentForDocs: { enrollmentId: string; studentName: string; courseName: string } | null;
  closeStudentDocs: () => void;
  openStudentDocs: (enrollmentId: string, studentName: string, courseName: string) => void;
  
  // Bulk upload dialog
  showBulkUploadDialog: boolean;
  setShowBulkUploadDialog: (v: boolean) => void;
  
  // Student detail card
  showStudentDetailCard: boolean;
  setShowStudentDetailCard: (v: boolean) => void;
  studentDetailCardData: any;
  studentDetailCardEnrollments: any[];
  
  // Bulk FRDO export
  showBulkFRDOExport: boolean;
  setShowBulkFRDOExport: (v: boolean) => void;
  selectedStudentIds: Set<string>;
  
  // Bulk delete
  showBulkDeleteConfirm: boolean;
  setShowBulkDeleteConfirm: (v: boolean) => void;
  isBulkDeleting: boolean;
  onBulkDelete: () => void;
}

export function DialogsContainer(props: DialogsContainerProps) {
  return (
    <>
      <ImportStudentsDialog
        open={props.showImportDialog}
        onOpenChange={props.setShowImportDialog}
        organizationId={props.organizationId}
        courses={props.courses}
        companies={props.companies}
      />

      <UnenrollConfirmDialog
        open={props.showUnenrollConfirm}
        onOpenChange={props.setShowUnenrollConfirm}
        selectedCount={props.selectedEnrollmentsCount}
        isUnenrolling={props.isUnenrolling}
        onConfirm={props.onBulkUnenroll}
      />

      <AddStudentDialog
        open={props.showAddStudentDialog}
        onOpenChange={props.setShowAddStudentDialog}
        courses={props.courses}
        companies={props.companies}
        onSubmit={props.onCreateStudent}
        isCreating={props.isCreatingStudent}
      />

      <EnrollDialog
        open={props.showEnrollDialog}
        onOpenChange={props.setShowEnrollDialog}
        selectedCount={props.selectedStudentIdsSize}
        courses={props.courses}
        categories={props.categories}
        getCategoryById={props.getCategoryById}
        isEnrolling={props.isEnrolling}
        onEnroll={props.onEnroll}
      />

      <CategoryDialog
        open={props.showCategoryDialog}
        onOpenChange={props.setShowCategoryDialog}
        isCreating={props.isCreatingCategory}
        onCreate={props.onCreateCategory}
      />

      <CourseDetailsModal
        open={props.showCourseDetailsModal}
        onOpenChange={props.setShowCourseDetailsModal}
        course={props.selectedCourseForDetails}
        courseStudents={props.courseStudents}
        organizationId={props.organizationId}
        activeTab={props.courseDetailsTab}
        onTabChange={props.onTabChange}
        onEnrollStudent={props.onEnrollStudent}
        onCourseDeleted={props.onCourseDeleted}
        onCourseUpdated={props.onCourseUpdated}
      />

      <CourseStudentsDialog
        open={props.showCourseStudentsDialog}
        onOpenChange={props.setShowCourseStudentsDialog}
        course={props.selectedCourse}
        courseStudents={props.courseStudents}
        availableStudents={props.availableStudentsForCourse}
        organizationId={props.organizationId}
        isLoading={props.isLoadingCourseStudents}
        selectedStudentsToAdd={props.selectedStudentsToAdd}
        onToggleStudentSelection={props.onToggleStudentSelection}
        onAddStudentsToCourse={props.onAddStudentsToCourse}
        isAddingStudents={props.isAddingStudentsToCourse}
        onRemoveFromCourse={props.onRemoveFromCourse}
        onShowInviteEmailDialog={() => props.setShowInviteEmailDialog(true)}
        onShowStudentDocs={props.openStudentDocs}
        onRefresh={props.onCourseStudentsRefresh}
      />

      <InviteEmailDialog
        open={props.showInviteEmailDialog}
        onOpenChange={props.setShowInviteEmailDialog}
        courseTitle={props.selectedCourse?.title}
        isSending={props.isSendingInvitation}
        onSend={props.onSendInvitation}
      />

      <StudentDetailsDialog
        open={props.showStudentDialog}
        onOpenChange={props.setShowStudentDialog}
        studentDetails={props.selectedStudent}
        isLoading={props.isLoadingStudentDetails}
        companies={props.companies}
        studentCompanyId={props.studentCompanyId}
        onStudentCompanyIdChange={props.setStudentCompanyId}
        isSavingStudentCompany={props.isSavingStudentCompany}
        onAttachToCompany={props.onAttachStudentToCompany}
        isCreatingCredentials={props.isCreatingCredentials}
        onCreateCredentials={props.onCreateStudentCredentials}
        isSendingCredentials={props.isSendingCredentials}
        onSendCredentials={props.onSendCredentials}
        isSendingCredentialsEmail={props.isSendingCredentialsEmail}
        onSendCredentialsEmail={props.onSendCredentialsEmail}
        isDeletingStudent={props.isDeletingStudent}
        onDeleteStudent={props.onDeleteStudent}
        onCopyCredentials={props.onCopyCredentials}
      />

      <AddCompanyDialog
        open={props.showAddCompanyDialog}
        onOpenChange={props.setShowAddCompanyDialog}
        name={props.newCompanyName}
        onNameChange={props.setNewCompanyName}
        email={props.newCompanyEmail}
        onEmailChange={props.setNewCompanyEmail}
        inn={props.newCompanyInn}
        onInnChange={props.setNewCompanyInn}
        contactName={props.newCompanyContactName}
        onContactNameChange={props.setNewCompanyContactName}
        phone={props.newCompanyPhone}
        onPhoneChange={props.setNewCompanyPhone}
        isCreating={props.isCreatingCompany}
        onCreate={props.onCreateCompany}
      />

      <EditCompanyDialog
        open={props.showEditCompanyDialog}
        onOpenChange={props.setShowEditCompanyDialog}
        name={props.editCompanyName}
        onNameChange={props.setEditCompanyName}
        email={props.editCompanyEmail}
        onEmailChange={props.setEditCompanyEmail}
        inn={props.editCompanyInn}
        onInnChange={props.setEditCompanyInn}
        contactName={props.editCompanyContactName}
        onContactNameChange={props.setEditCompanyContactName}
        phone={props.editCompanyPhone}
        onPhoneChange={props.setEditCompanyPhone}
        isSaving={props.isSavingCompany}
        onSave={props.onSaveCompany}
      />

      <OrgDetailsDialog
        open={props.showOrgDetails}
        onOpenChange={props.setShowOrgDetails}
        organization={props.selectedOrg}
        students={props.orgStudents}
        isLoading={props.isLoadingOrgDetails}
      />

      <StudentCoursesDialog
        open={props.showStudentCoursesDialog}
        onOpenChange={props.setShowStudentCoursesDialog}
        student={props.selectedStudentForCourses}
        isLoading={props.isLoadingStudentCourses}
        studentEnrollments={props.studentEnrollments}
        availableCourses={props.availableCoursesForStudent}
        selectedCoursesToAdd={props.selectedCoursesToAdd}
        searchQuery={props.studentCoursesSearchQuery}
        onSearchQueryChange={props.setStudentCoursesSearchQuery}
        onToggleCourseSelection={props.onToggleCourseSelection}
        isAddingCourses={props.isAddingCoursesToStudent}
        onAddCourses={props.onAddCourses}
        onRemoveEnrollment={props.onRemoveEnrollment}
        onResetProgress={props.onResetProgress}
        getCategoryById={props.getCategoryById}
      />

      <CreateLinkDialog
        open={props.showCreateLinkDialog}
        onOpenChange={props.setShowCreateLinkDialog}
        companyName={props.newLinkCompanyName}
        onCompanyNameChange={props.setNewLinkCompanyName}
        inn={props.newLinkInn}
        onInnChange={props.setNewLinkInn}
        isCreating={props.isCreatingLink}
        onCreate={props.onCreateLink}
      />

      {/* Course Documents Manager */}
      {props.selectedCourseForDocs && (
        <CourseDocumentsManager 
          courseId={props.selectedCourseForDocs.id} 
          courseName={props.selectedCourseForDocs.title} 
          isOpen={props.showCourseDocsDialog} 
          onClose={props.closeCourseDocs} 
        />
      )}

      {/* Student Documents Manager */}
      {props.selectedStudentForDocs && (
        <StudentDocumentsManager 
          enrollmentId={props.selectedStudentForDocs.enrollmentId} 
          studentName={props.selectedStudentForDocs.studentName} 
          courseName={props.selectedStudentForDocs.courseName} 
          isOpen={props.showStudentDocsDialog} 
          onClose={props.closeStudentDocs} 
        />
      )}

      {/* Bulk Document Upload */}
      {props.organizationId && (
        <BulkDocumentUpload 
          organizationId={props.organizationId} 
          isOpen={props.showBulkUploadDialog} 
          onClose={() => props.setShowBulkUploadDialog(false)} 
        />
      )}

      {/* Student Detail Card */}
      {props.organizationId && (
        <StudentDetailCard
          isOpen={props.showStudentDetailCard}
          onOpenChange={props.setShowStudentDetailCard}
          student={props.studentDetailCardData}
          organizationId={props.organizationId}
          enrollments={props.studentDetailCardEnrollments}
        />
      )}
      
      <BulkFRDOExport
        isOpen={props.showBulkFRDOExport}
        onOpenChange={props.setShowBulkFRDOExport}
        organizationId={props.organizationId}
        selectedStudentIds={props.selectedStudentIds}
        students={props.students}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={props.showBulkDeleteConfirm} onOpenChange={props.setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить учеников?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить {props.selectedStudentIds.size} учеников?
              Это действие нельзя отменить. Все данные учеников, включая зачисления и документы, будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={props.isBulkDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction 
              onClick={props.onBulkDelete} 
              disabled={props.isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {props.isBulkDeleting ? (
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
