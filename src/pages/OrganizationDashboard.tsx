import { useNavigate } from "react-router-dom";
import { AnimatedTabContent } from "@/components/ui/AnimatedTabContent";
import { OrgSidebar } from "@/components/organization/OrgSidebar";
import { TabContentRenderer } from "@/components/organization/tabs/TabContentRenderer";
import { DialogsContainer } from "@/components/organization/dialogs/DialogsContainer";
import { MissingCredentialsAlert } from "@/components/organization/MissingCredentialsAlert";
import { OrgDashboardHeader } from "@/components/organization/OrgDashboardHeader";
import { Button } from "@/components/ui/button";
import { Eye, X } from "lucide-react";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import { organizationOnboardingSteps } from "@/constants/onboardingSteps";
import { useOrganizationDashboard } from "@/hooks/useOrganizationDashboard";

export default function OrganizationDashboard() {
  const navigate = useNavigate();
  const d = useOrganizationDashboard();

  const exitAdminView = () => { localStorage.removeItem("adminViewAsOrg"); navigate("/admin"); };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Admin View Banner */}
      {d.isAdminView && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground py-2 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span className="text-sm font-medium">Режим просмотра: {d.organizationName}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={exitAdminView} className="gap-1">
            <X className="w-3 h-3" />
            Выйти
          </Button>
        </div>
      )}
      
      {/* Mobile Overlay */}
      {d.isMobileSidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => d.setIsMobileSidebarOpen(false)} />}
      
      {/* Sidebar */}
      <OrgSidebar
        activeTab={d.tabNavigation.activeTab}
        setActiveTab={d.tabNavigation.setActiveTab}
        organizationName={d.organizationName}
        customName={d.branding.brandingSettings.customName}
        customSubtitle={d.branding.brandingSettings.customSubtitle}
        logoUrl={d.branding.brandingSettings.logoUrl}
        isFrdoEnabled={d.isFrdoEnabled}
        menuSettings={d.dashboardSettings.menuSettings}
        isEnabled={d.isEnabled}
        isMobileSidebarOpen={d.isMobileSidebarOpen}
        setIsMobileSidebarOpen={d.setIsMobileSidebarOpen}
        onLogout={d.handleLogout}
      />

      {/* Main content */}
      <main ref={d.swipeRef} className={`flex-1 overflow-auto lg:ml-64 ${d.isAdminView ? 'mt-10' : ''}`}>
        {/* Cover Image */}
        {d.branding.brandingSettings.coverUrl && (
          <div className="relative w-full h-32 lg:h-48 overflow-hidden">
            <img 
              src={d.branding.brandingSettings.coverUrl} 
              alt="Обложка организации" 
              className="w-full h-full"
              style={{
                objectFit: d.branding.brandingSettings.coverPosition === 'contain' ? 'contain' : 'cover',
                objectPosition: 
                  d.branding.brandingSettings.coverPosition === 'top' ? 'center top' 
                  : d.branding.brandingSettings.coverPosition === 'bottom' ? 'center bottom' 
                  : d.branding.brandingSettings.coverPosition === 'contain' ? 'center center'
                  : 'center center',
                backgroundColor: 'hsl(var(--muted))'
              }}
            />
          </div>
        )}
        
        {/* Header */}
        <OrgDashboardHeader
          activeTab={d.tabNavigation.activeTab}
          organizationName={d.organizationName}
          customName={d.branding.brandingSettings.customName}
          isMobile={d.isMobile}
          onOpenMobileSidebar={() => d.setIsMobileSidebarOpen(true)}
          onCreateLink={() => d.registrationLinks.setShowCreateLinkDialog(true)}
          onImportStudents={() => d.setShowImportDialog(true)}
          onAddStudent={() => d.studentManagement.setShowAddStudentDialog(true)}
          checkStudentLimit={() => d.checkLimit('student')}
        />

        <div className="p-4 lg:p-8 overflow-hidden">
          <MissingCredentialsAlert 
            students={d.students}
            isCreating={d.studentActions.isCreatingBulkCredentials}
            onCreateCredentials={d.handleBulkCreateCredentials}
          />
          
          <AnimatedTabContent tabKey={d.tabNavigation.activeTab} direction={d.tabNavigation.swipeDirection} isMobile={d.isMobile}>
            <TabContentRenderer
              activeTab={d.tabNavigation.activeTab}
              organizationId={d.organizationId}
              organizationName={d.organizationName}
              userId={d.user?.id}
              stats={d.stats}
              documentsStats={d.documentsStats}
              courses={d.courses}
              studentDocsByUser={d.studentDocsByUser}
              onOpenCourseDetails={(course) => {
                d.courseDetailsModal.setSelectedCourseForDetails(course);
                d.courseDetailsModal.setCourseDetailsTab("students");
                d.courseDetailsModal.setShowCourseDetailsModal(true);
              }}
              onShowBulkUploadDialog={() => d.setShowBulkUploadDialog(true)}
              setActiveTab={d.tabNavigation.setActiveTab}
              onCreateLinkClick={() => d.registrationLinks.setShowCreateLinkDialog(true)}
              onCoursesDeleted={d.refreshData}
              onViewStudent={d.handleViewStudent}
              onCopyCredentials={d.studentDetailsDialog.handleCopyCredentials}
              onBulkCreateCredentials={d.handleBulkCreateCredentials}
              onBulkSendCredentials={d.handleBulkSendCredentials}
              onBulkSendDocReminders={d.studentActions.bulkSendDocReminders}
              onShowEnrollDialog={(selectedIds) => {
                if (selectedIds && selectedIds.length > 0) {
                  d.enrollmentActions.setSelectedStudentIds(new Set(selectedIds));
                }
                if (d.studentCourseFilter !== "all") d.enrollmentActions.setEnrollCourseId(d.studentCourseFilter);
                d.enrollmentActions.setShowEnrollDialog(true);
              }}
              onShowUnenrollConfirm={(selectedIds) => {
                if (selectedIds && selectedIds.length > 0) {
                  d.enrollmentActions.setSelectedStudentIds(new Set(selectedIds));
                }
                d.enrollmentActions.setShowUnenrollConfirm(true);
              }}
              onShowBulkFRDOExport={(selectedIds) => {
                if (selectedIds && selectedIds.length > 0) {
                  d.enrollmentActions.setSelectedStudentIds(new Set(selectedIds));
                }
                d.enrollmentActions.setShowBulkFRDOExport(true);
              }}
              onShowBulkDeleteConfirm={(selectedUserIds) => {
                if (selectedUserIds && selectedUserIds.length > 0) {
                  const selectionIds = d.students.filter(s => selectedUserIds.includes(s.user_id))
                    .map(s => s.enrollment_id || s.user_id);
                  d.enrollmentActions.setSelectedStudentIds(new Set(selectionIds));
                }
                d.enrollmentActions.setShowBulkDeleteConfirm(true);
              }}
              isCreatingBulkCredentials={d.studentActions.isCreatingBulkCredentials}
              isSendingBulkCredentials={d.studentActions.isSendingBulkCredentials}
              isSendingBulkDocReminders={d.studentActions.isSendingBulkDocReminders}
              isDarkMode={d.dashboardSettings.isDarkMode}
              setIsDarkMode={d.dashboardSettings.setIsDarkMode}
              menuSettings={d.dashboardSettings.menuSettings}
              setMenuSettings={d.dashboardSettings.setMenuSettings}
              studentDashboardSettings={d.dashboardSettings.studentDashboardSettings}
              setStudentDashboardSettings={d.dashboardSettings.setStudentDashboardSettings}
              brandingSettings={d.branding.brandingSettings}
              setBrandingSettings={d.branding.setBrandingSettings}
              isSavingSettings={d.dashboardSettings.isSavingSettings}
              setIsSavingSettings={d.dashboardSettings.setIsSavingSettings}
              isSavingBranding={d.branding.isSavingBranding}
              onSaveBranding={d.branding.saveBranding}
              onCoverUpload={d.branding.handleCoverUpload}
              onLogoUpload={d.branding.handleLogoUpload}
              isUploadingCover={d.branding.isUploadingCover}
              isUploadingLogo={d.branding.isUploadingLogo}
              onPreviewStudentDashboard={d.dashboardSettings.previewStudentDashboard}
            />
          </AnimatedTabContent>
        </div>

        {/* Mobile Tab Indicator Dots */}
        {d.isMobile && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-card/80 backdrop-blur-sm px-3 py-2 rounded-full border border-border shadow-lg z-40">
            {d.tabNavigation.getVisibleTabs().map((tab, index) => (
              <button
                key={tab}
                onClick={() => {
                  d.tabNavigation.triggerHapticFeedback();
                  const currentIndex = d.tabNavigation.getVisibleTabs().indexOf(d.tabNavigation.activeTab);
                  d.tabNavigation.setSwipeDirection(index > currentIndex ? 1 : -1);
                  d.tabNavigation.setActiveTab(tab);
                }}
                className={`transition-all duration-200 rounded-full ${
                  tab === d.tabNavigation.activeTab ? 'w-6 h-2 bg-primary' : 'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                }`}
                aria-label={`Перейти к вкладке ${tab}`}
              />
            ))}
          </div>
        )}
      </main>

      {/* All Dialogs */}
      <DialogsContainer
        organizationId={d.organizationId}
        courses={d.courses}
        companies={d.companies}
        categories={d.categories}
        getCategoryById={d.getCategoryById}
        students={d.students}
        allProfiles={d.allProfiles}
        showImportDialog={d.showImportDialog}
        setShowImportDialog={d.setShowImportDialog}
        showUnenrollConfirm={d.enrollmentActions.showUnenrollConfirm}
        setShowUnenrollConfirm={d.enrollmentActions.setShowUnenrollConfirm}
        selectedEnrollmentsCount={d.getSelectedEnrollmentsCount()}
        isUnenrolling={d.enrollmentActions.isUnenrolling}
        onBulkUnenroll={d.handleBulkUnenroll}
        showAddStudentDialog={d.studentManagement.showAddStudentDialog}
        setShowAddStudentDialog={d.studentManagement.setShowAddStudentDialog}
        isCreatingStudent={d.studentManagement.isCreatingStudent}
        onCreateStudent={async (name, email, courseId, companyId, noLogin) => {
          d.studentManagement.setNewStudentName(name);
          d.studentManagement.setNewStudentEmail(email);
          d.studentManagement.setSelectedCourseId(courseId);
          d.studentManagement.setSelectedCompanyId(companyId);
          d.studentManagement.setNoLoginStudent(noLogin);
          await d.studentManagement.createStudent();
        }}
        showEnrollDialog={d.enrollmentActions.showEnrollDialog}
        setShowEnrollDialog={d.enrollmentActions.setShowEnrollDialog}
        selectedStudentIdsSize={d.enrollmentActions.selectedStudentIds.size}
        isEnrolling={d.enrollmentActions.isEnrolling}
        onEnroll={async (courseId) => {
          d.enrollmentActions.setEnrollCourseId(courseId);
          await d.enrollmentActions.bulkEnroll(courseId, d.students, d.allProfiles, d.courses);
        }}
        showCategoryDialog={d.showCategoryDialog}
        setShowCategoryDialog={d.setShowCategoryDialog}
        isCreatingCategory={d.isCreatingCategory}
        onCreateCategory={async (name, color) => {
          d.categoryActions.setNewCategoryName(name);
          d.categoryActions.setNewCategoryColor(color);
          await d.categoryActions.createCategory();
        }}
        showCourseDetailsModal={d.courseDetailsModal.showCourseDetailsModal}
        setShowCourseDetailsModal={d.courseDetailsModal.setShowCourseDetailsModal}
        selectedCourseForDetails={d.courseDetailsModal.selectedCourseForDetails}
        courseStudents={d.courseStudentsManager.courseStudents}
        courseDetailsTab={d.courseDetailsModal.courseDetailsTab}
        onTabChange={d.courseDetailsModal.setCourseDetailsTab}
        onEnrollStudent={() => {
          if (d.courseDetailsModal.selectedCourseForDetails) {
            d.setStudentCourseFilter(d.courseDetailsModal.selectedCourseForDetails.id);
            d.setStudentStatusFilter("not_enrolled");
            d.tabNavigation.setActiveTab("students");
            d.courseDetailsModal.setShowCourseDetailsModal(false);
          }
        }}
        onCourseDeleted={d.refreshData}
        onCourseUpdated={d.refreshData}
        onRefreshCourseStudents={d.loadCourseStudentsForModal}
        showCourseStudentsDialog={d.courseStudentsManager.showCourseStudentsDialog}
        setShowCourseStudentsDialog={d.courseStudentsManager.setShowCourseStudentsDialog}
        selectedCourse={d.courseStudentsManager.selectedCourse}
        availableStudentsForCourse={d.courseStudentsManager.availableStudentsForCourse}
        isLoadingCourseStudents={d.courseStudentsManager.isLoadingCourseStudents}
        selectedStudentsToAdd={d.courseStudentsManager.selectedStudentsToAdd}
        onToggleStudentSelection={d.courseStudentsManager.toggleStudentSelection}
        onAddStudentsToCourse={d.courseStudentsManager.addStudentsToCourse}
        isAddingStudentsToCourse={d.courseStudentsManager.isAddingStudentsToCourse}
        onRemoveFromCourse={d.courseStudentsManager.removeStudentFromCourse}
        onCourseStudentsRefresh={d.refreshData}
        showInviteEmailDialog={d.emailInvitation.showInviteEmailDialog}
        setShowInviteEmailDialog={d.emailInvitation.setShowInviteEmailDialog}
        isSendingInvitation={d.emailInvitation.isSendingInvitation}
        onSendInvitation={async (email) => { await d.emailInvitation.sendInvitationDirect(email, d.courseStudentsManager.selectedCourse); }}
        showStudentDialog={d.studentDetailsDialog.showStudentDialog}
        setShowStudentDialog={d.studentDetailsDialog.setShowStudentDialog}
        selectedStudent={d.studentDetailsDialog.selectedStudent}
        isLoadingStudentDetails={d.studentDetailsDialog.isLoadingStudentDetails}
        studentCompanyId={d.studentDetailsDialog.studentCompanyId}
        setStudentCompanyId={d.studentDetailsDialog.setStudentCompanyId}
        isSavingStudentCompany={d.studentDetailsDialog.isSavingStudentCompany}
        onAttachStudentToCompany={d.studentDetailsDialog.handleAttachStudentToCompany}
        isCreatingCredentials={d.studentActions.isCreatingCredentials}
        onCreateStudentCredentials={d.studentDetailsDialog.handleCreateStudentCredentials}
        isSendingCredentials={d.studentActions.isSendingCredentials}
        onSendCredentials={d.studentDetailsDialog.handleSendCredentials}
        isSendingCredentialsEmail={d.studentActions.isSendingCredentialsEmail}
        onSendCredentialsEmail={d.studentDetailsDialog.handleSendCredentialsEmail}
        isDeletingStudent={d.studentActions.isDeletingStudent}
        onDeleteStudent={d.studentDetailsDialog.handleDeleteStudentCompletely}
        onCopyCredentials={d.studentDetailsDialog.handleCopyCredentials}
        showAddCompanyDialog={d.companyActions.showAddCompanyDialog}
        setShowAddCompanyDialog={d.companyActions.setShowAddCompanyDialog}
        newCompanyName={d.companyActions.newCompanyName}
        setNewCompanyName={d.companyActions.setNewCompanyName}
        newCompanyEmail={d.companyActions.newCompanyEmail}
        setNewCompanyEmail={d.companyActions.setNewCompanyEmail}
        newCompanyInn={d.companyActions.newCompanyInn}
        setNewCompanyInn={d.companyActions.setNewCompanyInn}
        newCompanyContactName={d.companyActions.newCompanyContactName}
        setNewCompanyContactName={d.companyActions.setNewCompanyContactName}
        newCompanyPhone={d.companyActions.newCompanyPhone}
        setNewCompanyPhone={d.companyActions.setNewCompanyPhone}
        isCreatingCompany={d.companyActions.isCreatingCompany}
        onCreateCompany={d.handleCompanyCreate}
        showEditCompanyDialog={d.companyActions.showEditCompanyDialog}
        setShowEditCompanyDialog={d.companyActions.setShowEditCompanyDialog}
        editCompanyName={d.companyActions.editCompanyName}
        setEditCompanyName={d.companyActions.setEditCompanyName}
        editCompanyEmail={d.companyActions.editCompanyEmail}
        setEditCompanyEmail={d.companyActions.setEditCompanyEmail}
        editCompanyInn={d.companyActions.editCompanyInn}
        setEditCompanyInn={d.companyActions.setEditCompanyInn}
        editCompanyContactName={d.companyActions.editCompanyContactName}
        setEditCompanyContactName={d.companyActions.setEditCompanyContactName}
        editCompanyPhone={d.companyActions.editCompanyPhone}
        setEditCompanyPhone={d.companyActions.setEditCompanyPhone}
        isSavingCompany={d.companyActions.isSavingCompany}
        onSaveCompany={d.handleCompanySave}
        showOrgDetails={d.organizationsTab.showOrgDetails}
        setShowOrgDetails={d.organizationsTab.setShowOrgDetails}
        selectedOrg={d.organizationsTab.selectedOrg}
        orgStudents={d.organizationsTab.orgStudents}
        isLoadingOrgDetails={d.organizationsTab.isLoadingOrgDetails}
        showStudentCoursesDialog={d.studentCoursesDialog.showStudentCoursesDialog}
        setShowStudentCoursesDialog={d.studentCoursesDialog.setShowStudentCoursesDialog}
        selectedStudentForCourses={d.studentCoursesDialog.selectedStudentForCourses}
        isLoadingStudentCourses={d.studentCoursesDialog.isLoadingStudentCourses}
        studentEnrollments={d.studentCoursesDialog.studentEnrollments}
        availableCoursesForStudent={d.studentCoursesDialog.availableCoursesForStudent}
        selectedCoursesToAdd={d.studentCoursesDialog.selectedCoursesToAdd}
        studentCoursesSearchQuery={d.studentCoursesDialog.studentCoursesSearchQuery}
        setStudentCoursesSearchQuery={d.studentCoursesDialog.setStudentCoursesSearchQuery}
        onToggleCourseSelection={d.studentCoursesDialog.toggleCourseSelection}
        isAddingCoursesToStudent={d.studentCoursesDialog.isAddingCoursesToStudent}
        onAddCourses={d.studentCoursesDialog.addCourses}
        onRemoveEnrollment={d.studentCoursesDialog.removeEnrollment}
        onResetProgress={d.studentCoursesDialog.resetProgress}
        showCreateLinkDialog={d.registrationLinks.showCreateLinkDialog}
        setShowCreateLinkDialog={d.registrationLinks.setShowCreateLinkDialog}
        newLinkCompanyName={d.registrationLinks.newLinkCompanyName}
        setNewLinkCompanyName={d.registrationLinks.setNewLinkCompanyName}
        newLinkInn={d.registrationLinks.newLinkInn}
        setNewLinkInn={d.registrationLinks.setNewLinkInn}
        isCreatingLink={d.registrationLinks.isCreatingLink}
        onCreateLink={d.registrationLinks.createLink}
        showCourseDocsDialog={d.courseDocsDialog.showCourseDocsDialog}
        selectedCourseForDocs={d.courseDocsDialog.selectedCourseForDocs}
        closeCourseDocs={d.courseDocsDialog.closeCourseDocs}
        showStudentDocsDialog={d.studentDocsDialog.showStudentDocsDialog}
        selectedStudentForDocs={d.studentDocsDialog.selectedStudentForDocs}
        closeStudentDocs={d.studentDocsDialog.closeStudentDocs}
        openStudentDocs={d.studentDocsDialog.openStudentDocs}
        showBulkUploadDialog={d.showBulkUploadDialog}
        setShowBulkUploadDialog={d.setShowBulkUploadDialog}
        showStudentDetailCard={d.studentDetailCard.showStudentDetailCard}
        setShowStudentDetailCard={d.studentDetailCard.setShowStudentDetailCard}
        studentDetailCardData={d.studentDetailCard.studentDetailCardData}
        studentDetailCardEnrollments={d.studentDetailCard.studentDetailCardEnrollments}
        showBulkFRDOExport={d.enrollmentActions.showBulkFRDOExport}
        setShowBulkFRDOExport={d.enrollmentActions.setShowBulkFRDOExport}
        selectedStudentIds={d.enrollmentActions.selectedStudentIds}
        showBulkDeleteConfirm={d.enrollmentActions.showBulkDeleteConfirm}
        setShowBulkDeleteConfirm={d.enrollmentActions.setShowBulkDeleteConfirm}
        isBulkDeleting={d.enrollmentActions.isBulkDeleting}
        onBulkDelete={() => d.enrollmentActions.bulkDelete(d.students)}
      />

      {/* Onboarding Tour */}
      <OnboardingDialog
        open={d.showOnboarding}
        onClose={d.handleOnboardingClose}
        steps={organizationOnboardingSteps}
        onNavigateToTab={(tab) => d.tabNavigation.setActiveTab(tab as any)}
      />
    </div>
  );
}
