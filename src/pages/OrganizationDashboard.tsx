import { useState, useEffect } from "react";
import { AnimatedTabContent } from "@/components/ui/AnimatedTabContent";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";
import { useTabNavigation } from "@/hooks/useTabNavigation";
import { OrgSidebar, TabType } from "@/components/organization/OrgSidebar";
import { TabContentRenderer } from "@/components/organization/tabs/TabContentRenderer";
import { DialogsContainer } from "@/components/organization/dialogs/DialogsContainer";
import { useAuth } from "@/hooks/useAuth";
import { useOrgFeatures } from "@/hooks/useOrgFeatures";
import { useRegistrationLinks } from "@/hooks/useRegistrationLinks";
import { useCompanyActions } from "@/hooks/useCompanyActions";
import { useStudentCoursesDialog } from "@/hooks/useStudentCoursesDialog";
import { useStudentManagement } from "@/hooks/useStudentManagement";
import { useCourseStudentsManager } from "@/hooks/useCourseStudentsManager";
import { useStudentActions } from "@/hooks/useStudentActions";
import { useCategoryActions } from "@/hooks/useCategoryActions";
import { useEnrollmentActions } from "@/hooks/useEnrollmentActions";
import { useBrandingSettings } from "@/hooks/useBrandingSettings";
import { useDashboardSettings } from "@/hooks/useDashboardSettings";
import { useStudentDetailCard } from "@/hooks/useStudentDetailCard";
import { useStudentDetailsDialog } from "@/hooks/useStudentDetailsDialog";
import { useOrganizationDataLoader } from "@/hooks/useOrganizationDataLoader";
import { useOrganizationsTab } from "@/hooks/useOrganizationsTab";
import { useEmailInvitation } from "@/hooks/useEmailInvitation";
import { useStudentDocsDialog } from "@/hooks/useStudentDocsDialog";
import { useCourseDocsDialog } from "@/hooks/useCourseDocsDialog";
import { useCourseDetailsModal } from "@/hooks/useCourseDetailsModal";
import { Button } from "@/components/ui/button";
import { Eye, Plus, Upload, FileSpreadsheet, X, Menu } from "lucide-react";
import { toast } from "sonner";

export default function OrganizationDashboard() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const isMobile = useIsMobile();
  
  const [isDocumentsMenuOpen, setIsDocumentsMenuOpen] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false);
  const [studentStatusFilter, setStudentStatusFilter] = useState<"all" | "active" | "completed" | "not_enrolled">("not_enrolled");
  const [studentCourseFilter, setStudentCourseFilter] = useState<string>("all");

  // Category management hook
  const categoryActions = useCategoryActions(null);
  const { categories, setCategories, showCategoryDialog, setShowCategoryDialog, isCreatingCategory, getCategoryById } = categoryActions;

  // Organization data loader hook
  const dataLoader = useOrganizationDataLoader({
    userId: user?.id,
    onCategoriesLoaded: setCategories,
  });
  
  const {
    organizationId, organizationName, isFrdoEnabled, isAdminView,
    courses, setCourses, students, setStudents, allProfiles, setAllProfiles,
    companies, stats, setStats, documentsStats, studentDocsByUser, refreshData,
  } = dataLoader;

  // Update category actions with organizationId
  useEffect(() => {
    if (organizationId) categoryActions.setOrganizationId(organizationId);
  }, [organizationId]);
  
  const { isEnabled } = useOrgFeatures(organizationId);

  // Registration links hook
  const registrationLinks = useRegistrationLinks(organizationId);
  const { showCreateLinkDialog, setShowCreateLinkDialog, newLinkCompanyName, setNewLinkCompanyName, newLinkInn, setNewLinkInn, isCreatingLink, createLink: handleCreateRegistrationLink } = registrationLinks;

  // Company management hook
  const companyActions = useCompanyActions();
  
  // StudentDetailCard hook
  const studentDetailCard = useStudentDetailCard();

  // Enrollment actions hook
  const enrollmentActions = useEnrollmentActions(organizationId, organizationName, refreshData);
  const { selectedStudentIds, setSelectedStudentIds, showEnrollDialog, setShowEnrollDialog, showUnenrollConfirm, setShowUnenrollConfirm, showBulkFRDOExport, setShowBulkFRDOExport, enrollCourseId, setEnrollCourseId, isEnrolling, isUnenrolling } = enrollmentActions;

  // Course students manager hook
  const courseStudentsManager = useCourseStudentsManager(organizationId);

  // Email invitation hook
  const emailInvitation = useEmailInvitation({ organizationName });
  
  const studentCoursesDialog = useStudentCoursesDialog(courses, refreshData);

  // Student management hook
  const studentManagement = useStudentManagement({
    organizationId, courses, students, allProfiles,
    setStudents, setAllProfiles, setStats, onRefresh: refreshData,
  });

  // Student actions hook
  const studentActions = useStudentActions(organizationId, organizationName, refreshData);

  // Student details dialog hook
  const studentDetailsDialog = useStudentDetailsDialog({
    students, allProfiles, setStudents, setAllProfiles, setStats, studentActions,
  });
  
  const { selectedStudent, setSelectedStudent, showStudentDialog, setShowStudentDialog, isLoadingStudentDetails, studentCompanyId, setStudentCompanyId, isSavingStudentCompany, handleAttachStudentToCompany, handleSendCredentials, handleSendCredentialsEmail, handleCreateStudentCredentials, handleDeleteStudentCompletely, handleCopyCredentials } = studentDetailsDialog;

  // Course details modal hook
  const courseDetailsModal = useCourseDetailsModal();
  const { showCourseDetailsModal, setShowCourseDetailsModal, selectedCourseForDetails, setSelectedCourseForDetails, courseDetailsTab, setCourseDetailsTab } = courseDetailsModal;

  // Dialog hooks
  const courseDocsDialog = useCourseDocsDialog();
  const studentDocsDialog = useStudentDocsDialog();

  // Dashboard settings hook
  const dashboardSettings = useDashboardSettings(organizationId);
  const { isDarkMode, setIsDarkMode, studentDashboardSettings, setStudentDashboardSettings, menuSettings, setMenuSettings, isSavingSettings, setIsSavingSettings, previewStudentDashboard } = dashboardSettings;

  // Tab navigation hook
  const tabNavigation = useTabNavigation({ isMobile, menuSettings, isFrdoEnabled, isEnabled });
  const { activeTab, setActiveTab, swipeDirection, setSwipeDirection, getVisibleTabs, handleSwipeLeft, handleSwipeRight, triggerHapticFeedback } = tabNavigation;

  // Organizations tab hook
  const organizationsTab = useOrganizationsTab({ activeTab });
  const { selectedOrg, showOrgDetails, setShowOrgDetails, orgStudents, isLoadingOrgDetails } = organizationsTab;

  // Swipe gesture for mobile navigation
  const swipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    threshold: 50,
    minSwipeDistance: 30,
  });

  // Branding settings hook
  const branding = useBrandingSettings(organizationId, user?.id);
  const { brandingSettings, setBrandingSettings, isUploadingCover, isUploadingLogo, isSavingBranding, handleCoverUpload, handleLogoUpload, saveBranding: handleSaveBranding } = branding;

  // Load course students when course details modal opens
  useEffect(() => {
    if (showCourseDetailsModal && selectedCourseForDetails) {
      courseStudentsManager.openCourseStudents(selectedCourseForDetails);
    }
  }, [showCourseDetailsModal, selectedCourseForDetails?.id]);

  const handleLogout = async () => await signOut();
  const getSelectedEnrollmentsCount = () => enrollmentActions.getSelectedEnrollmentsCount(students);
  const handleBulkUnenroll = () => enrollmentActions.bulkUnenroll(students);
  const handleViewStudent = studentDetailCard.viewStudent;

  const handleBulkSendCredentials = async () => {
    if (selectedStudentIds.size === 0) { toast.error("Выберите учеников"); return; }
    await studentActions.bulkSendCredentials(students.filter(s => selectedStudentIds.has(s.user_id)));
  };

  const handleBulkCreateCredentials = async () => {
    if (selectedStudentIds.size === 0) { toast.error("Выберите учеников"); return; }
    const studentsToCreate = students.filter(s => selectedStudentIds.has(s.enrollment_id || s.user_id) && !s.login);
    if (studentsToCreate.length === 0) { toast.info("У всех выбранных учеников уже есть логин и пароль"); return; }
    await studentActions.bulkCreateCredentials(studentsToCreate);
  };

  const handleCompanyCreate = async () => {
    const success = await companyActions.createCompany();
    if (success) { setActiveTab("courses"); setTimeout(() => setActiveTab("organizations"), 100); }
  };
  
  const handleCompanySave = async () => {
    const success = await companyActions.saveCompany();
    if (success) { setActiveTab("courses"); setTimeout(() => setActiveTab("organizations"), 100); }
  };

  const exitAdminView = () => { localStorage.removeItem("adminViewAsOrg"); navigate("/admin"); };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Admin View Banner */}
      {isAdminView && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground py-2 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span className="text-sm font-medium">Режим просмотра: {organizationName}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={exitAdminView} className="gap-1">
            <X className="w-3 h-3" />
            Выйти
          </Button>
        </div>
      )}
      
      {/* Mobile Overlay */}
      {isMobileSidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsMobileSidebarOpen(false)} />}
      
      {/* Sidebar */}
      <OrgSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        organizationName={organizationName}
        isFrdoEnabled={isFrdoEnabled}
        menuSettings={menuSettings}
        isEnabled={isEnabled}
        isDocumentsMenuOpen={isDocumentsMenuOpen}
        setIsDocumentsMenuOpen={setIsDocumentsMenuOpen}
        isMobileSidebarOpen={isMobileSidebarOpen}
        setIsMobileSidebarOpen={setIsMobileSidebarOpen}
        onLogout={handleLogout}
      />

      {/* Main content */}
      <main ref={swipeRef} className={`flex-1 overflow-auto lg:ml-64 ${isAdminView ? 'mt-10' : ''}`}>
        {/* Header */}
        <header className="bg-card border-b border-border px-4 lg:px-8 py-4 lg:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setIsMobileSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-secondary">
                <Menu className="w-6 h-6" />
              </button>
              <div>
                {activeTab !== "organizations" && activeTab !== "frdo" && (
                  <h1 className="font-display text-xl lg:text-2xl font-bold">
                    {activeTab === "courses" && "Управление курсами"}
                    {activeTab === "students" && "Все ученики"}
                    {activeTab === "library" && "Библиотека материалов"}
                    {activeTab === "stats" && "Статистика обучения"}
                    {activeTab === "links" && "Ссылки для регистрации"}
                    {activeTab === "documents" && "Документооборот"}
                    {activeTab === "documents-orders" && "Приказы о зачислении / отчислении"}
                    {activeTab === "documents-protocols" && "Протоколы аттестационной комиссии"}
                    {activeTab === "documents-certificates" && "Удостоверения"}
                    {activeTab === "documents-diplomas" && "Дипломы"}
                    {activeTab === "documents-testimonials" && "Свидетельства"}
                    {activeTab === "journals" && "Журналы учёта"}
                    {activeTab === "services" && "Магазин курсов"}
                    {activeTab === "diagnostics" && "Самодиагностика системы"}
                    {activeTab === "settings" && "Настройки"}
                  </h1>
                )}
                {activeTab !== "organizations" && activeTab !== "frdo" && (
                  <p className="text-muted-foreground text-sm lg:text-base">{organizationName}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 lg:gap-3 flex-wrap">
              {activeTab === "links" && (
                <Button className="btn-gradient rounded-xl gap-2 text-xs lg:text-sm" onClick={() => setShowCreateLinkDialog(true)}>
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Создать ссылку</span>
                  <span className="sm:hidden">Создать</span>
                </Button>
              )}
              {activeTab === "students" && (
                <>
                  <Button variant="outline" className="rounded-xl gap-2 text-xs lg:text-sm" onClick={() => setShowImportDialog(true)}>
                    <FileSpreadsheet className="w-4 h-4" />
                    <span className="hidden sm:inline">Импорт учеников</span>
                    <span className="sm:hidden">Импорт</span>
                  </Button>
                  <Button className="btn-gradient rounded-xl gap-2 text-xs lg:text-sm" onClick={() => studentManagement.setShowAddStudentDialog(true)}>
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Добавить ученика</span>
                    <span className="sm:hidden">Добавить</span>
                  </Button>
                </>
              )}
              {activeTab === "courses" && (
                <>
                  <Button variant="outline" className="rounded-xl gap-2 text-xs lg:text-sm" onClick={() => navigate("/course-import")}>
                    <Upload className="w-4 h-4" />
                    <span className="hidden sm:inline">Импорт курса</span>
                    <span className="sm:hidden">Импорт</span>
                  </Button>
                  <Button className="btn-gradient rounded-xl gap-2 text-xs lg:text-sm" onClick={() => navigate("/course-builder")}>
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Создать курс</span>
                    <span className="sm:hidden">Создать</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-8 overflow-hidden">
          <AnimatedTabContent tabKey={activeTab} direction={swipeDirection} isMobile={isMobile}>
            <TabContentRenderer
              activeTab={activeTab}
              organizationId={organizationId}
              organizationName={organizationName}
              userId={user?.id}
              stats={stats}
              documentsStats={documentsStats}
              courses={courses}
              studentDocsByUser={studentDocsByUser}
              onOpenCourseDetails={(course) => {
                setSelectedCourseForDetails(course);
                setCourseDetailsTab("students");
                setShowCourseDetailsModal(true);
              }}
              onShowBulkUploadDialog={() => setShowBulkUploadDialog(true)}
              setActiveTab={setActiveTab}
              onCreateLinkClick={() => setShowCreateLinkDialog(true)}
              onViewStudent={handleViewStudent}
              onCopyCredentials={handleCopyCredentials}
              onBulkCreateCredentials={async () => { await handleBulkCreateCredentials(); }}
              onBulkSendCredentials={async () => { await handleBulkSendCredentials(); }}
              onBulkSendDocReminders={studentActions.bulkSendDocReminders}
              onShowEnrollDialog={() => {
                if (studentCourseFilter !== "all") setEnrollCourseId(studentCourseFilter);
                setShowEnrollDialog(true);
              }}
              onShowUnenrollConfirm={() => setShowUnenrollConfirm(true)}
              onShowBulkFRDOExport={() => setShowBulkFRDOExport(true)}
              isCreatingBulkCredentials={studentActions.isCreatingBulkCredentials}
              isSendingBulkCredentials={studentActions.isSendingBulkCredentials}
              isSendingBulkDocReminders={studentActions.isSendingBulkDocReminders}
              isDarkMode={isDarkMode}
              setIsDarkMode={setIsDarkMode}
              menuSettings={menuSettings}
              setMenuSettings={setMenuSettings}
              studentDashboardSettings={studentDashboardSettings}
              setStudentDashboardSettings={setStudentDashboardSettings}
              brandingSettings={brandingSettings}
              setBrandingSettings={setBrandingSettings}
              isSavingSettings={isSavingSettings}
              setIsSavingSettings={setIsSavingSettings}
              isSavingBranding={isSavingBranding}
              onSaveBranding={handleSaveBranding}
              onCoverUpload={handleCoverUpload}
              onLogoUpload={handleLogoUpload}
              isUploadingCover={isUploadingCover}
              isUploadingLogo={isUploadingLogo}
              onPreviewStudentDashboard={previewStudentDashboard}
            />
          </AnimatedTabContent>
        </div>

        {/* Mobile Tab Indicator Dots */}
        {isMobile && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-card/80 backdrop-blur-sm px-3 py-2 rounded-full border border-border shadow-lg z-40">
            {getVisibleTabs().map((tab, index) => (
              <button
                key={tab}
                onClick={() => {
                  triggerHapticFeedback();
                  const currentIndex = getVisibleTabs().indexOf(activeTab);
                  setSwipeDirection(index > currentIndex ? 1 : -1);
                  setActiveTab(tab);
                }}
                className={`transition-all duration-200 rounded-full ${
                  tab === activeTab ? 'w-6 h-2 bg-primary' : 'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                }`}
                aria-label={`Перейти к вкладке ${tab}`}
              />
            ))}
          </div>
        )}
      </main>

      {/* All Dialogs */}
      <DialogsContainer
        organizationId={organizationId}
        courses={courses}
        companies={companies}
        categories={categories}
        getCategoryById={getCategoryById}
        students={students}
        allProfiles={allProfiles}
        showImportDialog={showImportDialog}
        setShowImportDialog={setShowImportDialog}
        showUnenrollConfirm={showUnenrollConfirm}
        setShowUnenrollConfirm={setShowUnenrollConfirm}
        selectedEnrollmentsCount={getSelectedEnrollmentsCount()}
        isUnenrolling={isUnenrolling}
        onBulkUnenroll={handleBulkUnenroll}
        showAddStudentDialog={studentManagement.showAddStudentDialog}
        setShowAddStudentDialog={studentManagement.setShowAddStudentDialog}
        isCreatingStudent={studentManagement.isCreatingStudent}
        onCreateStudent={async (name, email, courseId, companyId, noLogin) => {
          studentManagement.setNewStudentName(name);
          studentManagement.setNewStudentEmail(email);
          studentManagement.setSelectedCourseId(courseId);
          studentManagement.setSelectedCompanyId(companyId);
          studentManagement.setNoLoginStudent(noLogin);
          await studentManagement.createStudent();
        }}
        showEnrollDialog={showEnrollDialog}
        setShowEnrollDialog={setShowEnrollDialog}
        selectedStudentIdsSize={selectedStudentIds.size}
        isEnrolling={isEnrolling}
        onEnroll={async (courseId) => {
          enrollmentActions.setEnrollCourseId(courseId);
          await enrollmentActions.bulkEnroll(courseId, students, allProfiles, courses);
        }}
        showCategoryDialog={showCategoryDialog}
        setShowCategoryDialog={setShowCategoryDialog}
        isCreatingCategory={isCreatingCategory}
        onCreateCategory={async (name, color) => {
          categoryActions.setNewCategoryName(name);
          categoryActions.setNewCategoryColor(color);
          await categoryActions.createCategory();
        }}
        showCourseDetailsModal={showCourseDetailsModal}
        setShowCourseDetailsModal={setShowCourseDetailsModal}
        selectedCourseForDetails={selectedCourseForDetails}
        courseStudents={courseStudentsManager.courseStudents}
        courseDetailsTab={courseDetailsTab}
        onTabChange={setCourseDetailsTab}
        onEnrollStudent={() => {
          if (selectedCourseForDetails) {
            setStudentCourseFilter(selectedCourseForDetails.id);
            setStudentStatusFilter("not_enrolled");
            setActiveTab("students");
            setShowCourseDetailsModal(false);
          }
        }}
        showCourseStudentsDialog={courseStudentsManager.showCourseStudentsDialog}
        setShowCourseStudentsDialog={courseStudentsManager.setShowCourseStudentsDialog}
        selectedCourse={courseStudentsManager.selectedCourse}
        availableStudentsForCourse={courseStudentsManager.availableStudentsForCourse}
        isLoadingCourseStudents={courseStudentsManager.isLoadingCourseStudents}
        selectedStudentsToAdd={courseStudentsManager.selectedStudentsToAdd}
        onToggleStudentSelection={courseStudentsManager.toggleStudentSelection}
        onAddStudentsToCourse={courseStudentsManager.addStudentsToCourse}
        isAddingStudentsToCourse={courseStudentsManager.isAddingStudentsToCourse}
        onRemoveFromCourse={courseStudentsManager.removeStudentFromCourse}
        showInviteEmailDialog={emailInvitation.showInviteEmailDialog}
        setShowInviteEmailDialog={emailInvitation.setShowInviteEmailDialog}
        isSendingInvitation={emailInvitation.isSendingInvitation}
        onSendInvitation={async (email) => { await emailInvitation.sendInvitationDirect(email, courseStudentsManager.selectedCourse); }}
        showStudentDialog={showStudentDialog}
        setShowStudentDialog={setShowStudentDialog}
        selectedStudent={selectedStudent}
        isLoadingStudentDetails={isLoadingStudentDetails}
        studentCompanyId={studentCompanyId}
        setStudentCompanyId={setStudentCompanyId}
        isSavingStudentCompany={isSavingStudentCompany}
        onAttachStudentToCompany={handleAttachStudentToCompany}
        isCreatingCredentials={studentActions.isCreatingCredentials}
        onCreateStudentCredentials={handleCreateStudentCredentials}
        isSendingCredentials={studentActions.isSendingCredentials}
        onSendCredentials={handleSendCredentials}
        isSendingCredentialsEmail={studentActions.isSendingCredentialsEmail}
        onSendCredentialsEmail={handleSendCredentialsEmail}
        isDeletingStudent={studentActions.isDeletingStudent}
        onDeleteStudent={handleDeleteStudentCompletely}
        onCopyCredentials={handleCopyCredentials}
        showAddCompanyDialog={companyActions.showAddCompanyDialog}
        setShowAddCompanyDialog={companyActions.setShowAddCompanyDialog}
        newCompanyName={companyActions.newCompanyName}
        setNewCompanyName={companyActions.setNewCompanyName}
        newCompanyEmail={companyActions.newCompanyEmail}
        setNewCompanyEmail={companyActions.setNewCompanyEmail}
        newCompanyInn={companyActions.newCompanyInn}
        setNewCompanyInn={companyActions.setNewCompanyInn}
        newCompanyContactName={companyActions.newCompanyContactName}
        setNewCompanyContactName={companyActions.setNewCompanyContactName}
        newCompanyPhone={companyActions.newCompanyPhone}
        setNewCompanyPhone={companyActions.setNewCompanyPhone}
        isCreatingCompany={companyActions.isCreatingCompany}
        onCreateCompany={handleCompanyCreate}
        showEditCompanyDialog={companyActions.showEditCompanyDialog}
        setShowEditCompanyDialog={companyActions.setShowEditCompanyDialog}
        editCompanyName={companyActions.editCompanyName}
        setEditCompanyName={companyActions.setEditCompanyName}
        editCompanyEmail={companyActions.editCompanyEmail}
        setEditCompanyEmail={companyActions.setEditCompanyEmail}
        editCompanyInn={companyActions.editCompanyInn}
        setEditCompanyInn={companyActions.setEditCompanyInn}
        editCompanyContactName={companyActions.editCompanyContactName}
        setEditCompanyContactName={companyActions.setEditCompanyContactName}
        editCompanyPhone={companyActions.editCompanyPhone}
        setEditCompanyPhone={companyActions.setEditCompanyPhone}
        isSavingCompany={companyActions.isSavingCompany}
        onSaveCompany={handleCompanySave}
        showOrgDetails={showOrgDetails}
        setShowOrgDetails={setShowOrgDetails}
        selectedOrg={selectedOrg}
        orgStudents={orgStudents}
        isLoadingOrgDetails={isLoadingOrgDetails}
        showStudentCoursesDialog={studentCoursesDialog.showStudentCoursesDialog}
        setShowStudentCoursesDialog={studentCoursesDialog.setShowStudentCoursesDialog}
        selectedStudentForCourses={studentCoursesDialog.selectedStudentForCourses}
        isLoadingStudentCourses={studentCoursesDialog.isLoadingStudentCourses}
        studentEnrollments={studentCoursesDialog.studentEnrollments}
        availableCoursesForStudent={studentCoursesDialog.availableCoursesForStudent}
        selectedCoursesToAdd={studentCoursesDialog.selectedCoursesToAdd}
        studentCoursesSearchQuery={studentCoursesDialog.studentCoursesSearchQuery}
        setStudentCoursesSearchQuery={studentCoursesDialog.setStudentCoursesSearchQuery}
        onToggleCourseSelection={studentCoursesDialog.toggleCourseSelection}
        isAddingCoursesToStudent={studentCoursesDialog.isAddingCoursesToStudent}
        onAddCourses={studentCoursesDialog.addCourses}
        onRemoveEnrollment={studentCoursesDialog.removeEnrollment}
        showCreateLinkDialog={showCreateLinkDialog}
        setShowCreateLinkDialog={setShowCreateLinkDialog}
        newLinkCompanyName={newLinkCompanyName}
        setNewLinkCompanyName={setNewLinkCompanyName}
        newLinkInn={newLinkInn}
        setNewLinkInn={setNewLinkInn}
        isCreatingLink={isCreatingLink}
        onCreateLink={handleCreateRegistrationLink}
        showCourseDocsDialog={courseDocsDialog.showCourseDocsDialog}
        selectedCourseForDocs={courseDocsDialog.selectedCourseForDocs}
        closeCourseDocs={courseDocsDialog.closeCourseDocs}
        showStudentDocsDialog={studentDocsDialog.showStudentDocsDialog}
        selectedStudentForDocs={studentDocsDialog.selectedStudentForDocs}
        closeStudentDocs={studentDocsDialog.closeStudentDocs}
        openStudentDocs={studentDocsDialog.openStudentDocs}
        showBulkUploadDialog={showBulkUploadDialog}
        setShowBulkUploadDialog={setShowBulkUploadDialog}
        showStudentDetailCard={studentDetailCard.showStudentDetailCard}
        setShowStudentDetailCard={studentDetailCard.setShowStudentDetailCard}
        studentDetailCardData={studentDetailCard.studentDetailCardData}
        studentDetailCardEnrollments={studentDetailCard.studentDetailCardEnrollments}
        showBulkFRDOExport={showBulkFRDOExport}
        setShowBulkFRDOExport={setShowBulkFRDOExport}
        selectedStudentIds={selectedStudentIds}
      />
    </div>
  );
}
