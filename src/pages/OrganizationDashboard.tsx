import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedTabContent } from "@/components/ui/AnimatedTabContent";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";
import { OrgDocumentsManager } from "@/components/organization/OrgDocumentsManager";
import { CourseDocumentsManager } from "@/components/organization/CourseDocumentsManager";
import { StudentDocumentsManager } from "@/components/organization/StudentDocumentsManager";
import { BulkDocumentUpload } from "@/components/organization/BulkDocumentUpload";
import { EnrollmentHistory } from "@/components/organization/EnrollmentHistory";
import { CourseTestReport } from "@/components/organization/CourseTestReport";
import { CompaniesManager } from "@/components/organization/CompaniesManager";
import { LibraryManager } from "@/components/organization/LibraryManager";
import { CourseStoreManager } from "@/components/organization/CourseStoreManager";
import { ContractTemplateEditor } from "@/components/organization/ContractTemplateEditor";
import { ConsentGenerator } from "@/components/organization/ConsentGenerator";
import { OrgNotifications } from "@/components/organization/OrgNotifications";
import { StudentDetailCard } from "@/components/organization/StudentDetailCard";
import { ClassJournalExport } from "@/components/organization/ClassJournalExport";
import { DocumentIssuanceLog } from "@/components/organization/DocumentIssuanceLog";
import { BulkFRDOExport } from "@/components/organization/BulkFRDOExport";
import { FRDOManager } from "@/components/organization/FRDOManager";
import { OrgRequisitesForm } from "@/components/organization/OrgRequisitesForm";
import { OrdersArchive } from "@/components/organization/OrdersArchive";
import { DocumentArchiveView } from "@/components/organization/DocumentArchiveView";
import { JournalsManager } from "@/components/organization/JournalsManager";
import { EducationDocumentsJournal } from "@/components/organization/EducationDocumentsJournal";
import { SystemFeaturesReport } from "@/components/organization/SystemFeaturesReport";
import { SystemDiagnostics } from "@/components/organization/SystemDiagnostics";
import { CoursesTab } from "@/components/organization/tabs/CoursesTab";
import { StatsCards } from "@/components/organization/tabs/StatsCards";
import { DocumentsStatsCards } from "@/components/organization/tabs/DocumentsStatsCards";
import { StudentsTab } from "@/components/organization/tabs/StudentsTab";
import { SettingsTab } from "@/components/organization/tabs/SettingsTab";
import { LinksTab } from "@/components/organization/tabs/LinksTab";
import { StatsTab } from "@/components/organization/tabs/StatsTab";
import { DocumentsTab } from "@/components/organization/tabs/DocumentsTab";
import { OrgSidebar, TabType } from "@/components/organization/OrgSidebar";
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
} from "@/components/organization/dialogs";
import { generateEnrollmentOrder } from "@/utils/generateEnrollmentOrder";
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
import { GraduationCap, BookOpen, Users, BarChart3, Settings, LogOut, Plus, Upload, FileSpreadsheet, Search, Eye, TrendingUp, Clock, CheckCircle2, XCircle, Loader2, Edit, Trash2, FileText, Download, X, ChevronRight, ChevronDown, Link, Copy, Building2, Save, Send, FileCheck, Receipt, CheckSquare, LayoutGrid, List, Filter, Tag, Palette, History, Moon, Sun, Library, Trophy, MessageCircle, Image, ExternalLink, ShoppingBag, Mail, Key, Menu, AlertCircle, Award, ClipboardList } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Student, 
  Course, 
  CourseCategory, 
  Company, 
  StudentDocument, 
  TestAttempt, 
  TestQuestion, 
  StudentDetails 
} from "@/types/shared";

// Extended Organization interface for dashboard
interface Organization {
  id: string;
  name: string;
  email: string;
  contact_name: string | null;
  phone: string | null;
  inn: string | null;
  ai_enabled: boolean;
  created_at: string;
  studentsCount?: number;
  coursesCount?: number;
}
export default function OrganizationDashboard() {
  const navigate = useNavigate();
  const {
    signOut,
    user
  } = useAuth();
  const isMobile = useIsMobile();
  
  const [activeTab, setActiveTab] = useState<TabType>("courses");
  const [isDocumentsMenuOpen, setIsDocumentsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [courseFilter, setCourseFilter] = useState<"all" | "published" | "draft">("all");
  const [courseViewMode, setCourseViewMode] = useState<"grid" | "list">("grid");
  const [courseSearchQuery, setCourseSearchQuery] = useState("");

  // Category management hook - initialize before data loader
  const categoryActions = useCategoryActions(null);
  const { categories, setCategories, showCategoryDialog, setShowCategoryDialog, newCategoryName, setNewCategoryName, newCategoryColor, setNewCategoryColor, isCreatingCategory, selectedCategoryFilter, getCategoryById, createCategory } = categoryActions;

  // Organization data loader hook
  const dataLoader = useOrganizationDataLoader({
    userId: user?.id,
    onCategoriesLoaded: setCategories,
  });
  
  const {
    organizationId,
    organizationName,
    isFrdoEnabled,
    isAdminView,
    adminViewOrgId,
    courses,
    setCourses,
    students,
    setStudents,
    allProfiles,
    setAllProfiles,
    companies,
    setCompanies,
    isLoadingCourses,
    isLoadingStudents,
    stats,
    setStats,
    documentsStats,
    studentDocsByUser,
    studentFrdoStatus,
    refreshData,
  } = dataLoader;

  // Update category actions with organizationId after it loads
  useEffect(() => {
    if (organizationId) {
      categoryActions.setOrganizationId(organizationId);
    }
  }, [organizationId]);
  
  // Organization features access control
  const { features: orgFeatures, loading: loadingFeatures, isEnabled } = useOrgFeatures(organizationId);

  // Registration links hook
  const {
    showCreateLinkDialog,
    setShowCreateLinkDialog,
    newLinkCompanyName,
    setNewLinkCompanyName,
    newLinkInn,
    setNewLinkInn,
    isCreatingLink,
    createLink: handleCreateRegistrationLink,
  } = useRegistrationLinks(organizationId);

  // Organizations tab hook
  const organizationsTab = useOrganizationsTab({ activeTab });
  const { allOrganizations, isLoadingOrgs, selectedOrg, showOrgDetails, setShowOrgDetails, orgStudents, isLoadingOrgDetails, handleViewOrg, filterOrganizations } = organizationsTab;
  
  // Company management hook
  const companyActions = useCompanyActions();
  
  // StudentDetailCard hook
  const studentDetailCard = useStudentDetailCard();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Enrollment actions hook
  const enrollmentActions = useEnrollmentActions(organizationId, organizationName, refreshData);

  // Course students manager hook
  const courseStudentsManager = useCourseStudentsManager(organizationId);

  // Email invitation hook
  const emailInvitation = useEmailInvitation({ organizationName });
  
  const studentCoursesDialog = useStudentCoursesDialog(courses, refreshData);

  // Student management hook
  const studentManagement = useStudentManagement({
    organizationId,
    courses,
    students,
    allProfiles,
    setStudents,
    setAllProfiles,
    setStats,
    onRefresh: refreshData,
  });

  // Student actions hook (credentials, delete, etc.)
  const studentActions = useStudentActions(organizationId, organizationName, refreshData);

  // Student details dialog hook
  const studentDetailsDialog = useStudentDetailsDialog({
    students,
    allProfiles,
    setStudents,
    setAllProfiles,
    setStats,
    studentActions,
  });
  
  const { selectedStudent, setSelectedStudent, showStudentDialog, setShowStudentDialog, isLoadingStudentDetails, studentCompanyId, setStudentCompanyId, isSavingStudentCompany, handleAttachStudentToCompany, handleSendCredentials, handleSendCredentialsEmail, handleCreateStudentCredentials, handleDeleteStudentCompletely, handleCopyCredentials } = studentDetailsDialog;

  // Enrollment actions aliases
  const { selectedStudentIds, setSelectedStudentIds, showEnrollDialog, setShowEnrollDialog, showUnenrollConfirm, setShowUnenrollConfirm, showBulkFRDOExport, setShowBulkFRDOExport, enrollCourseId, setEnrollCourseId, isEnrolling, isUnenrolling } = enrollmentActions;

  // Student filter state - default to not_enrolled
  const [studentStatusFilter, setStudentStatusFilter] = useState<"all" | "active" | "completed" | "not_enrolled">("not_enrolled");
  const [studentCourseFilter, setStudentCourseFilter] = useState<string>("all");
  const [studentDocsFilter, setStudentDocsFilter] = useState<"all" | "complete" | "no_passport" | "no_snils" | "no_education" | "incomplete">("all");


  // Course details modal hook
  const courseDetailsModal = useCourseDetailsModal();
  const { showCourseDetailsModal, setShowCourseDetailsModal, selectedCourseForDetails, setSelectedCourseForDetails, courseDetailsTab, setCourseDetailsTab } = courseDetailsModal;

  // Course documents dialog hook
  const courseDocsDialog = useCourseDocsDialog();
  const { showCourseDocsDialog, selectedCourseForDocs, closeCourseDocs } = courseDocsDialog;

  // Student documents dialog hook
  const studentDocsDialog = useStudentDocsDialog();
  const { showStudentDocsDialog, selectedStudentForDocs, closeStudentDocs } = studentDocsDialog;

  // Bulk document upload state
  const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false);

  // Dashboard settings hook
  const dashboardSettings = useDashboardSettings(organizationId);
  const { isDarkMode, setIsDarkMode, studentDashboardSettings, setStudentDashboardSettings, menuSettings, setMenuSettings, isSavingSettings, setIsSavingSettings, previewStudentDashboard } = dashboardSettings;

  // Swipe navigation for mobile tabs
  
  const getVisibleTabs = useCallback((): TabType[] => {
    const baseTabs: TabType[] = [];
    
    // Add tabs based on org feature access
    if (isEnabled("courses")) baseTabs.push("courses");
    if (isEnabled("companies")) baseTabs.push("organizations");
    if (isEnabled("students")) baseTabs.push("students");
    if (menuSettings.showLibrary && isEnabled("library")) baseTabs.push("library");
    if (menuSettings.showStats) baseTabs.push("stats");
    if (menuSettings.showLinks && isEnabled("links")) baseTabs.push("links");
    if (menuSettings.showDocuments && isEnabled("documents")) baseTabs.push("documents");
    if (isEnabled("journals")) baseTabs.push("journals");
    if (isFrdoEnabled && isEnabled("frdo")) baseTabs.push("frdo");
    if (menuSettings.showServices && isEnabled("services")) baseTabs.push("services");
    if (isEnabled("settings")) baseTabs.push("settings");
    
    return baseTabs;
  }, [menuSettings.showLibrary, menuSettings.showStats, menuSettings.showLinks, menuSettings.showDocuments, menuSettings.showServices, isFrdoEnabled, isEnabled]);

  // Animation direction for tab transitions (1 = swipe left/go right, -1 = swipe right/go left)
  const [swipeDirection, setSwipeDirection] = useState(0);

  // Haptic feedback helper
  const triggerHapticFeedback = useCallback(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10); // Short 10ms vibration
    }
  }, []);

  const handleSwipeLeft = useCallback(() => {
    if (!isMobile) return;
    const tabs = getVisibleTabs();
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex < tabs.length - 1) {
      triggerHapticFeedback();
      setSwipeDirection(1);
      setActiveTab(tabs[currentIndex + 1]);
    }
  }, [activeTab, getVisibleTabs, isMobile, triggerHapticFeedback]);

  const handleSwipeRight = useCallback(() => {
    if (!isMobile) return;
    const tabs = getVisibleTabs();
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex > 0) {
      triggerHapticFeedback();
      setSwipeDirection(-1);
      setActiveTab(tabs[currentIndex - 1]);
    }
  }, [activeTab, getVisibleTabs, isMobile, triggerHapticFeedback]);

  const swipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    threshold: 50,
    minSwipeDistance: 30,
  });

  // Tab animation variants
  const tabAnimationVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 100 : -100,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -100 : 100,
      opacity: 0,
    }),
  };

  // Branding settings hook
  const branding = useBrandingSettings(organizationId, user?.id);
  const { brandingSettings, setBrandingSettings, isUploadingCover, isUploadingLogo, isSavingBranding, handleCoverUpload, handleLogoUpload, saveBranding: handleSaveBranding } = branding;
  
  // Preview student dashboard
  const handlePreviewStudentDashboard = previewStudentDashboard;


  // Load course students when course details modal opens
  // Load course students when course details modal opens
  useEffect(() => {
    const loadCourseStudentsData = async () => {
      if (!showCourseDetailsModal || !selectedCourseForDetails) return;
      // Load students for course details modal via hook
      courseStudentsManager.openCourseStudents(selectedCourseForDetails);
    };
    loadCourseStudentsData();
  }, [showCourseDetailsModal, selectedCourseForDetails?.id]);
  const handleLogout = async () => {
    await signOut();
  };
  // Use studentManagement hook for createStudent and enrollExistingStudent
  const handleCreateStudent = studentManagement.createStudent;
  const handleEnrollExistingStudent = studentManagement.enrollExistingStudent;

  const handleDeleteStudent = async (enrollmentId: string | null) => {
    if (!enrollmentId) {
      toast.error("Нельзя удалить — нет зачисления");
      return;
    }
    try {
      const {
        error
      } = await supabase.from("enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;
      setStudents(students.filter(s => s.enrollment_id !== enrollmentId));
      toast.success("Ученик удалён из курса");
    } catch (error) {
      console.error("Error deleting enrollment:", error);
      toast.error("Ошибка удаления");
    }
  };
  // Use enrollment actions from hook
  const toggleStudentSelection = enrollmentActions.toggleStudentSelection;
  const toggleSelectAll = enrollmentActions.toggleSelectAll;
  const getSelectedUserIds = () => enrollmentActions.getSelectedUserIds(students);
  const getSelectedEnrollmentsCount = () => enrollmentActions.getSelectedEnrollmentsCount(students);
  // Use enrollment actions from hook for bulk operations
  const handleBulkEnroll = () => enrollmentActions.bulkEnroll(enrollmentActions.enrollCourseId, students, allProfiles, courses);
  const handleBulkUnenroll = () => enrollmentActions.bulkUnenroll(students);

  // Open course details to assign students - using hook
  const handleOpenCourseStudents = courseStudentsManager.openCourseStudents;
  const handleAddStudentsToCourse = courseStudentsManager.addStudentsToCourse;
  const handleRemoveFromCourse = courseStudentsManager.removeStudentFromCourse;

  // Send course invitation by email - using hook
  const handleSendInvitation = () => emailInvitation.sendInvitation(courseStudentsManager.selectedCourse);

  // Category management
  // Category management - use hook
  const handleCreateCategory = createCategory;
  const handleSetCourseCategory = (courseId: string, categoryId: string | null) => categoryActions.setCourseCategory(courseId, categoryId, setCourses);

  const handleBulkSendCredentials = async () => {
    if (selectedStudentIds.size === 0) {
      toast.error("Выберите учеников");
      return;
    }
    const studentsToSend = students.filter(s => selectedStudentIds.has(s.user_id));
    await studentActions.bulkSendCredentials(studentsToSend);
  };

  // Use studentActions hook for bulk operations
  const handleBulkSendDocReminders = studentActions.bulkSendDocReminders;

  // Bulk create credentials for selected students without login
  const handleBulkCreateCredentials = async () => {
    if (selectedStudentIds.size === 0) {
      toast.error("Выберите учеников");
      return;
    }
    const studentsToCreate = students.filter(s => selectedStudentIds.has(s.enrollment_id || s.user_id) && !s.login);
    if (studentsToCreate.length === 0) {
      toast.info("У всех выбранных учеников уже есть логин и пароль");
      return;
    }
    await studentActions.bulkCreateCredentials(studentsToCreate);
  };

  // View student details with StudentDetailCard - using hook
  const handleViewStudent = studentDetailCard.viewStudent;

  // Company management - using hooks
  const handleCreateCompany = async () => {
    const success = await companyActions.createCompany();
    if (success) {
      // Refresh
      setActiveTab("courses");
      setTimeout(() => setActiveTab("organizations"), 100);
    }
  };
  
  const handleEditCompany = companyActions.openEditDialog;
  
  const handleSaveCompany = async () => {
    const success = await companyActions.saveCompany();
    if (success) {
      // Refresh
      setActiveTab("courses");
      setTimeout(() => setActiveTab("organizations"), 100);
    }
  };
  // handleViewOrg is now provided by organizationsTab hook

  // Filter organizations
  const filteredOrganizations = allOrganizations.filter(org => org.name.toLowerCase().includes(searchQuery.toLowerCase()) || org.email.toLowerCase().includes(searchQuery.toLowerCase()) || org.inn && org.inn.includes(searchQuery));
  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.email.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    // Filter by course
    if (studentCourseFilter !== "all") {
      if (studentStatusFilter === "not_enrolled") {
        // For "not_enrolled" status with a specific course, we want students not enrolled in THIS course
        // but they might be enrolled in other courses or not enrolled at all
        if (s.course_id === studentCourseFilter) return false;
      } else {
        // For other statuses, filter to only show students enrolled in this course
        if (s.course_id !== studentCourseFilter) return false;
      }
    }
    
    // Filter by documents status
    if (studentDocsFilter !== "all") {
      const userDocs = studentDocsByUser.get(s.user_id) || [];
      const hasPassport = userDocs.some(t => t === "passport" || t === "birth_certificate");
      const hasSnils = userDocs.includes("snils");
      const hasEducation = userDocs.some(t => t === "education_document" || t === "diploma" || t === "attestat");
      const isComplete = hasPassport && hasSnils && hasEducation;
      
      if (studentDocsFilter === "complete" && !isComplete) return false;
      if (studentDocsFilter === "incomplete" && isComplete) return false;
      if (studentDocsFilter === "no_passport" && hasPassport) return false;
      if (studentDocsFilter === "no_snils" && hasSnils) return false;
      if (studentDocsFilter === "no_education" && hasEducation) return false;
    }
    
    if (studentStatusFilter === "all") return true;
    if (studentStatusFilter === "active") return s.status === "active";
    if (studentStatusFilter === "completed") return s.status === "completed";
    if (studentStatusFilter === "not_enrolled") return !s.course_id;
    return true;
  });
  const filteredCourses = courses.filter(course => {
    const matchesSearch = course.title.toLowerCase().includes(courseSearchQuery.toLowerCase());
    const matchesFilter = courseFilter === "all" || courseFilter === "published" && course.is_published || courseFilter === "draft" && !course.is_published;
    const matchesCategory = selectedCategoryFilter === "all" || selectedCategoryFilter === "none" && !course.category_id || course.category_id === selectedCategoryFilter;
    return matchesSearch && matchesFilter && matchesCategory;
  });
  const exitAdminView = () => {
    localStorage.removeItem("adminViewAsOrg");
    navigate("/admin");
  };
  return <div className="min-h-screen bg-background flex">
      {/* Admin View Banner */}
      {isAdminView && <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground py-2 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span className="text-sm font-medium">Режим просмотра: {organizationName}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={exitAdminView} className="gap-1">
            <X className="w-3 h-3" />
            Выйти
          </Button>
        </div>}
      
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
              {activeTab === "links" && <>
                  <Button className="btn-gradient rounded-xl gap-2 text-xs lg:text-sm" onClick={() => setShowCreateLinkDialog(true)}>
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Создать ссылку</span>
                    <span className="sm:hidden">Создать</span>
                  </Button>
                  <CreateLinkDialog
                    open={showCreateLinkDialog}
                    onOpenChange={setShowCreateLinkDialog}
                    companyName={newLinkCompanyName}
                    onCompanyNameChange={setNewLinkCompanyName}
                    inn={newLinkInn}
                    onInnChange={setNewLinkInn}
                    isCreating={isCreatingLink}
                    onCreate={handleCreateRegistrationLink}
                  />
                </>}
              {activeTab === "students" && <>
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
                </>}
              {activeTab === "courses" && <>
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
                </>}
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-8 overflow-hidden">
          <AnimatedTabContent tabKey={activeTab} direction={swipeDirection} isMobile={isMobile}>
          {/* Stats cards - hidden for organizations, services, settings, students, library, documents, journals, and frdo tabs */}
          {activeTab !== "organizations" && activeTab !== "services" && activeTab !== "settings" && activeTab !== "students" && activeTab !== "frdo" && activeTab !== "library" && activeTab !== "journals" && !activeTab.startsWith("documents") && (
            <StatsCards stats={stats} />
          )}
          
          {activeTab === "students" && (
            <DocumentsStatsCards stats={documentsStats} />
          )}

          {/* Courses Tab */}
          {activeTab === "courses" && organizationId && (
            <CoursesTab 
              organizationId={organizationId} 
              onOpenCourseDetails={(course) => {
                setSelectedCourseForDetails(course);
                setCourseDetailsTab("students");
                setShowCourseDetailsModal(true);
              }}
            />
          )}

          {/* Organizations/Companies Tab */}
          {activeTab === "organizations" && organizationId && <CompaniesManager organizationId={organizationId} />}

          {/* Students Tab */}
          {activeTab === "students" && organizationId && (
            <StudentsTab
              organizationId={organizationId}
              courses={courses}
              studentDocsByUser={studentDocsByUser}
              onViewStudent={handleViewStudent}
              onCopyCredentials={handleCopyCredentials}
              onBulkCreateCredentials={async (userIds) => {
                await handleBulkCreateCredentials();
              }}
              onBulkSendCredentials={async (userIds) => {
                await handleBulkSendCredentials();
              }}
              onBulkSendDocReminders={handleBulkSendDocReminders}
              onShowEnrollDialog={(ids) => {
                if (studentCourseFilter !== "all") {
                  setEnrollCourseId(studentCourseFilter);
                }
                setShowEnrollDialog(true);
              }}
              onShowUnenrollConfirm={() => setShowUnenrollConfirm(true)}
              onShowBulkFRDOExport={() => setShowBulkFRDOExport(true)}
              isCreatingBulkCredentials={studentActions.isCreatingBulkCredentials}
              isSendingBulkCredentials={studentActions.isSendingBulkCredentials}
              isSendingBulkDocReminders={studentActions.isSendingBulkDocReminders}
            />
          )}

          {/* Stats Tab */}
          {activeTab === "stats" && organizationId && (
            <StatsTab organizationId={organizationId} stats={stats} />
          )}

          {/* Links Tab */}
          {activeTab === "links" && organizationId && (
            <LinksTab 
              organizationId={organizationId} 
              onCreateLinkClick={() => setShowCreateLinkDialog(true)} 
            />
          )}

          {/* Library Tab */}
          {activeTab === "library" && organizationId && <LibraryManager organizationId={organizationId} />}

          {/* Documents Tab */}
          {activeTab === "documents" && organizationId && (
            <div className="space-y-4 lg:space-y-6">
              <div className="flex justify-end">
                <Button variant="outline" className="rounded-xl gap-2 text-xs lg:text-sm" onClick={() => setShowBulkUploadDialog(true)}>
                  <Users className="w-4 h-4" />
                  <span className="hidden sm:inline">Массовая загрузка ученикам</span>
                  <span className="sm:hidden">Массовая загрузка</span>
                </Button>
              </div>
              <DocumentsTab organizationId={organizationId} />
            </div>
          )}

          {/* Documents Orders Tab */}
          {activeTab === "documents-orders" && organizationId && (
            <DocumentArchiveView
              organizationId={organizationId}
              categoryId="enrollment_orders"
              title="Приказы о зачислении / отчислении"
              docTypes={["enrollment_order", "expulsion_order"]}
            />
          )}

          {/* Documents Protocols Tab */}
          {activeTab === "documents-protocols" && organizationId && (
            <DocumentArchiveView
              organizationId={organizationId}
              categoryId="attestation_protocols"
              title="Протоколы аттестационной комиссии"
              docTypes={["attestation_protocol"]}
            />
          )}

          {/* Documents Certificates Tab - Удостоверения */}
          {activeTab === "documents-certificates" && organizationId && (
            <EducationDocumentsJournal
              organizationId={organizationId}
              onClose={() => setActiveTab("courses")}
              documentTypeFilter="certificate"
            />
          )}

          {/* Documents Diplomas Tab - Дипломы */}
          {activeTab === "documents-diplomas" && organizationId && (
            <EducationDocumentsJournal
              organizationId={organizationId}
              onClose={() => setActiveTab("courses")}
              documentTypeFilter="diploma"
            />
          )}

          {/* Documents Testimonials Tab - Свидетельства */}
          {activeTab === "documents-testimonials" && organizationId && (
            <EducationDocumentsJournal
              organizationId={organizationId}
              onClose={() => setActiveTab("courses")}
              documentTypeFilter="qualification"
            />
          )}

          {/* Journals Tab */}
          {activeTab === "journals" && organizationId && <JournalsManager organizationId={organizationId} />}

          {/* FRDO Tab */}
          {activeTab === "frdo" && organizationId && <FRDOManager organizationId={organizationId} />}

          {/* Course Store Tab */}
          {activeTab === "services" && organizationId && <CourseStoreManager organizationId={organizationId} userId={user?.id} />}

          {/* Diagnostics Tab */}
          {activeTab === "diagnostics" && organizationId && <SystemDiagnostics organizationId={organizationId} />}

          {/* Settings Tab */}
          {activeTab === "settings" && (
            <SettingsTab
              organizationId={organizationId}
              organizationName={organizationName}
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
              onPreviewStudentDashboard={handlePreviewStudentDashboard}
            />
          )}
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
                  tab === activeTab 
                    ? 'w-6 h-2 bg-primary' 
                    : 'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                }`}
                aria-label={`Перейти к вкладке ${tab}`}
              />
            ))}
          </div>
        )}
      </main>

      {/* Dialogs */}
      <ImportStudentsDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        organizationId={organizationId}
        courses={courses}
        companies={companies}
      />

      <UnenrollConfirmDialog
        open={showUnenrollConfirm}
        onOpenChange={setShowUnenrollConfirm}
        selectedCount={getSelectedEnrollmentsCount()}
        isUnenrolling={isUnenrolling}
        onConfirm={handleBulkUnenroll}
      />

      <AddStudentDialog
        open={studentManagement.showAddStudentDialog}
        onOpenChange={studentManagement.setShowAddStudentDialog}
        courses={courses}
        companies={companies}
        onSubmit={async (name, email, courseId, companyId, noLogin) => {
          // Set values and call createStudent
          studentManagement.setNewStudentName(name);
          studentManagement.setNewStudentEmail(email);
          studentManagement.setSelectedCourseId(courseId);
          studentManagement.setSelectedCompanyId(companyId);
          studentManagement.setNoLoginStudent(noLogin);
          await studentManagement.createStudent();
        }}
        isCreating={studentManagement.isCreatingStudent}
      />

      <EnrollDialog
        open={showEnrollDialog}
        onOpenChange={setShowEnrollDialog}
        selectedCount={selectedStudentIds.size}
        courses={courses}
        categories={categories}
        getCategoryById={getCategoryById}
        isEnrolling={isEnrolling}
        onEnroll={async (courseId) => {
          enrollmentActions.setEnrollCourseId(courseId);
          await enrollmentActions.bulkEnroll(courseId, students, allProfiles, courses);
        }}
      />

      <CategoryDialog
        open={showCategoryDialog}
        onOpenChange={setShowCategoryDialog}
        isCreating={isCreatingCategory}
        onCreate={async (name, color) => {
          categoryActions.setNewCategoryName(name);
          categoryActions.setNewCategoryColor(color);
          await categoryActions.createCategory();
        }}
      />

      <CourseDetailsModal
        open={showCourseDetailsModal}
        onOpenChange={setShowCourseDetailsModal}
        course={selectedCourseForDetails}
        courseStudents={courseStudentsManager.courseStudents}
        organizationId={organizationId}
        activeTab={courseDetailsTab}
        onTabChange={setCourseDetailsTab}
        onEnrollStudent={() => {
          if (selectedCourseForDetails) {
            setStudentCourseFilter(selectedCourseForDetails.id);
            setStudentStatusFilter("not_enrolled");
            setActiveTab("students");
            setShowCourseDetailsModal(false);
          }
        }}
      />

      <CourseStudentsDialog
        open={courseStudentsManager.showCourseStudentsDialog}
        onOpenChange={courseStudentsManager.setShowCourseStudentsDialog}
        course={courseStudentsManager.selectedCourse}
        courseStudents={courseStudentsManager.courseStudents}
        availableStudents={courseStudentsManager.availableStudentsForCourse}
        organizationId={organizationId}
        isLoading={courseStudentsManager.isLoadingCourseStudents}
        selectedStudentsToAdd={courseStudentsManager.selectedStudentsToAdd}
        onToggleStudentSelection={courseStudentsManager.toggleStudentSelection}
        onAddStudentsToCourse={handleAddStudentsToCourse}
        isAddingStudents={courseStudentsManager.isAddingStudentsToCourse}
        onRemoveFromCourse={handleRemoveFromCourse}
        onShowInviteEmailDialog={() => emailInvitation.setShowInviteEmailDialog(true)}
        onShowStudentDocs={(enrollmentId, studentName, courseName) => studentDocsDialog.openStudentDocs(enrollmentId, studentName, courseName)}
      />

      <InviteEmailDialog
        open={emailInvitation.showInviteEmailDialog}
        onOpenChange={emailInvitation.setShowInviteEmailDialog}
        courseTitle={courseStudentsManager.selectedCourse?.title}
        isSending={emailInvitation.isSendingInvitation}
        onSend={(email) => emailInvitation.sendInvitationDirect(email, courseStudentsManager.selectedCourse)}
      />

      <StudentDetailsDialog
        open={showStudentDialog}
        onOpenChange={setShowStudentDialog}
        studentDetails={selectedStudent}
        isLoading={isLoadingStudentDetails}
        companies={companies}
        studentCompanyId={studentCompanyId}
        onStudentCompanyIdChange={setStudentCompanyId}
        isSavingStudentCompany={isSavingStudentCompany}
        onAttachToCompany={handleAttachStudentToCompany}
        isCreatingCredentials={studentActions.isCreatingCredentials}
        onCreateCredentials={handleCreateStudentCredentials}
        isSendingCredentials={studentActions.isSendingCredentials}
        onSendCredentials={handleSendCredentials}
        isSendingCredentialsEmail={studentActions.isSendingCredentialsEmail}
        onSendCredentialsEmail={handleSendCredentialsEmail}
        isDeletingStudent={studentActions.isDeletingStudent}
        onDeleteStudent={handleDeleteStudentCompletely}
        onCopyCredentials={handleCopyCredentials}
      />

      <AddCompanyDialog
        open={companyActions.showAddCompanyDialog}
        onOpenChange={companyActions.setShowAddCompanyDialog}
        name={companyActions.newCompanyName}
        onNameChange={companyActions.setNewCompanyName}
        email={companyActions.newCompanyEmail}
        onEmailChange={companyActions.setNewCompanyEmail}
        inn={companyActions.newCompanyInn}
        onInnChange={companyActions.setNewCompanyInn}
        contactName={companyActions.newCompanyContactName}
        onContactNameChange={companyActions.setNewCompanyContactName}
        phone={companyActions.newCompanyPhone}
        onPhoneChange={companyActions.setNewCompanyPhone}
        isCreating={companyActions.isCreatingCompany}
        onCreate={handleCreateCompany}
      />

      <EditCompanyDialog
        open={companyActions.showEditCompanyDialog}
        onOpenChange={companyActions.setShowEditCompanyDialog}
        name={companyActions.editCompanyName}
        onNameChange={companyActions.setEditCompanyName}
        email={companyActions.editCompanyEmail}
        onEmailChange={companyActions.setEditCompanyEmail}
        inn={companyActions.editCompanyInn}
        onInnChange={companyActions.setEditCompanyInn}
        contactName={companyActions.editCompanyContactName}
        onContactNameChange={companyActions.setEditCompanyContactName}
        phone={companyActions.editCompanyPhone}
        onPhoneChange={companyActions.setEditCompanyPhone}
        isSaving={companyActions.isSavingCompany}
        onSave={handleSaveCompany}
      />

      <OrgDetailsDialog
        open={showOrgDetails}
        onOpenChange={setShowOrgDetails}
        organization={selectedOrg}
        students={orgStudents}
        isLoading={isLoadingOrgDetails}
      />

      <StudentCoursesDialog
        open={studentCoursesDialog.showStudentCoursesDialog}
        onOpenChange={studentCoursesDialog.setShowStudentCoursesDialog}
        student={studentCoursesDialog.selectedStudentForCourses}
        isLoading={studentCoursesDialog.isLoadingStudentCourses}
        studentEnrollments={studentCoursesDialog.studentEnrollments}
        availableCourses={studentCoursesDialog.availableCoursesForStudent}
        selectedCoursesToAdd={studentCoursesDialog.selectedCoursesToAdd}
        searchQuery={studentCoursesDialog.studentCoursesSearchQuery}
        onSearchQueryChange={studentCoursesDialog.setStudentCoursesSearchQuery}
        onToggleCourseSelection={studentCoursesDialog.toggleCourseSelection}
        isAddingCourses={studentCoursesDialog.isAddingCoursesToStudent}
        onAddCourses={studentCoursesDialog.addCourses}
        onRemoveEnrollment={studentCoursesDialog.removeEnrollment}
        getCategoryById={getCategoryById}
      />

      {/* Course Documents Manager */}
      {selectedCourseForDocs && <CourseDocumentsManager courseId={selectedCourseForDocs.id} courseName={selectedCourseForDocs.title} isOpen={showCourseDocsDialog} onClose={closeCourseDocs} />}

      {/* Student Documents Manager */}
      {selectedStudentForDocs && <StudentDocumentsManager enrollmentId={selectedStudentForDocs.enrollmentId} studentName={selectedStudentForDocs.studentName} courseName={selectedStudentForDocs.courseName} isOpen={showStudentDocsDialog} onClose={closeStudentDocs} />}

      {/* Bulk Document Upload */}
      {organizationId && <BulkDocumentUpload organizationId={organizationId} isOpen={showBulkUploadDialog} onClose={() => setShowBulkUploadDialog(false)} />}

      {/* Student Detail Card */}
      {organizationId && (
        <StudentDetailCard
          isOpen={studentDetailCard.showStudentDetailCard}
          onOpenChange={studentDetailCard.setShowStudentDetailCard}
          student={studentDetailCard.studentDetailCardData}
          organizationId={organizationId}
          enrollments={studentDetailCard.studentDetailCardEnrollments}
        />
      )}
      
      <BulkFRDOExport
        isOpen={showBulkFRDOExport}
        onOpenChange={setShowBulkFRDOExport}
        organizationId={organizationId}
        selectedStudentIds={selectedStudentIds}
        students={students}
      />
    </div>;
}