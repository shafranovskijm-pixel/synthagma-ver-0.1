import { useState, useEffect, useCallback } from "react";
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
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useOrganizationsTab } from "@/hooks/useOrganizationsTab";
import { useEmailInvitation } from "@/hooks/useEmailInvitation";
import { useStudentDocsDialog } from "@/hooks/useStudentDocsDialog";
import { useCourseDocsDialog } from "@/hooks/useCourseDocsDialog";
import { useCourseDetailsModal } from "@/hooks/useCourseDetailsModal";
import { useTabNavigation } from "@/hooks/useTabNavigation";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOrgBalance } from "@/hooks/useOrgBalance";
import { useOrgUnreadChats } from "@/hooks/useOrgUnreadChats";
import { supabase } from "@/integrations/supabase/client";
import { fetchUserRolesBatched } from "@/utils/fetchUserRolesBatched";
import { fetchStudentsByUserIds, fetchStudentPasswordsForUsers } from "@/api/students";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";
import { toast } from "sonner";

export function useOrganizationDashboard() {
  const { signOut, user } = useAuth();
  const isMobile = useIsMobile();

  // Local UI state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false);
  const [studentStatusFilter, setStudentStatusFilter] = useState<"all" | "active" | "completed" | "not_enrolled">("all");
  const [studentCourseFilter, setStudentCourseFilter] = useState<string>("all");
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Category management
  const categoryActions = useCategoryActions(null);
  const { categories, setCategories, showCategoryDialog, setShowCategoryDialog, isCreatingCategory, getCategoryById } = categoryActions;

  // Organization data loader
  const dataLoader = useOrganizationDataLoader({
    userId: user?.id,
    onCategoriesLoaded: setCategories,
  });

  const {
    organizationId, organizationName, isFrdoEnabled, isAdminView,
    courses, setCourses, students, setStudents, allProfiles, setAllProfiles,
    companies, stats, setStats, documentsStats, studentDocsByUser, refreshData,
    isLoadingCourses,
  } = dataLoader;

  // Update category actions with organizationId
  useEffect(() => {
    if (organizationId) categoryActions.setOrganizationId(organizationId);
  }, [organizationId]);

  // Check onboarding status
  useEffect(() => {
    if (!user) return;
    const checkOnboarding = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data && !data.onboarding_completed) {
        setShowOnboarding(true);
      }
    };
    checkOnboarding();
  }, [user]);

  const handleOnboardingClose = async () => {
    setShowOnboarding(false);
    if (user) {
      await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("user_id", user.id);
    }
  };

  const { isEnabled } = useOrgFeatures(organizationId);
  const subscriptionLimits = useSubscriptionLimits(organizationId);
  const { checkLimit } = subscriptionLimits;

  // Registration links
  const registrationLinks = useRegistrationLinks(organizationId);

  // Company management
  const companyActions = useCompanyActions();

  // StudentDetailCard
  const studentDetailCard = useStudentDetailCard();

  // Enrollment actions
  const enrollmentActions = useEnrollmentActions(organizationId, organizationName, refreshData);

  // Course students manager
  const courseStudentsManager = useCourseStudentsManager(organizationId);

  // Email invitation
  const emailInvitation = useEmailInvitation({ organizationName });

  const studentCoursesDialog = useStudentCoursesDialog(courses, refreshData);

  // Student management
  const studentManagement = useStudentManagement({
    organizationId, courses, students, allProfiles,
    setStudents, setAllProfiles, setStats, onRefresh: refreshData,
    checkStudentLimit: () => checkLimit('student'),
  });

  // Student actions
  const studentActions = useStudentActions(organizationId, organizationName, refreshData);

  // Student details dialog
  const studentDetailsDialog = useStudentDetailsDialog({
    students, allProfiles, setStudents, setAllProfiles, setStats, studentActions,
  });

  // Course details modal
  const courseDetailsModal = useCourseDetailsModal();

  // Dialog hooks
  const courseDocsDialog = useCourseDocsDialog();
  const studentDocsDialog = useStudentDocsDialog();

  // Dashboard settings
  const dashboardSettings = useDashboardSettings(organizationId);

  // Tab navigation
  const tabNavigation = useTabNavigation({ isMobile, menuSettings: dashboardSettings.menuSettings, isFrdoEnabled, isEnabled });

  // Organizations tab
  const organizationsTab = useOrganizationsTab({ activeTab: tabNavigation.activeTab });

  // Swipe gesture
  const swipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: tabNavigation.handleSwipeLeft,
    onSwipeRight: tabNavigation.handleSwipeRight,
    threshold: 50,
    minSwipeDistance: 30,
  });

  // Branding settings
  const branding = useBrandingSettings(organizationId, user?.id);

  // Balance
  const orgBalance = useOrgBalance(organizationId);

  // Org chats
  const orgChats = useOrgUnreadChats(organizationId, user?.id || null);

  // Load course students when course details modal opens
  const loadCourseStudentsForModal = useCallback(async () => {
    if (!courseDetailsModal.selectedCourseForDetails) return;
    try {
      const selectedCourse = courseDetailsModal.selectedCourseForDetails;
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("id, user_id, progress, status")
        .eq("course_id", selectedCourse.id);

      const enrollmentUserIds = Array.from(new Set((enrollments || []).map(e => e.user_id)));
      let excludedUserIds = new Set<string>();
      if (enrollmentUserIds.length > 0) {
        const rolesData = await fetchUserRolesBatched(enrollmentUserIds, ["organization", "admin"]);
        excludedUserIds = new Set(rolesData.map(r => r.user_id));
      }

      const enrolledList: any[] = [];
      const filteredEnrollments = (enrollments || []).filter(e => !excludedUserIds.has(e.user_id));
      const filteredUserIds = filteredEnrollments.map(e => e.user_id);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, login")
        .in("user_id", filteredUserIds);

      const { data: passwordData } = await supabase
        .rpc('get_decrypted_student_passwords', { p_organization_id: organizationId });
      const passwordMap = new Map((passwordData || []).map((p: any) => [p.user_id, p.decrypted_password]));
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      for (const enrollment of filteredEnrollments) {
        const profile = profileMap.get(enrollment.user_id);
        if (profile) {
          enrolledList.push({
            id: profile.id,
            user_id: profile.user_id,
            enrollment_id: enrollment.id,
            name: profile.full_name || "Без имени",
            email: profile.email || "",
            login: profile.login || null,
            generated_password: passwordMap.get(profile.user_id) || null,
            course: selectedCourse.title,
            course_id: selectedCourse.id,
            progress: enrollment.progress,
            lastActivity: null,
            status: enrollment.status
          });
        }
      }

      courseStudentsManager.setCourseStudentsDirectly(enrolledList);
    } catch (error) {
      console.error("Error loading course students:", error);
    }
  }, [courseDetailsModal.selectedCourseForDetails]);

  useEffect(() => {
    if (courseDetailsModal.showCourseDetailsModal && courseDetailsModal.selectedCourseForDetails) {
      loadCourseStudentsForModal();
    }
  }, [courseDetailsModal.showCourseDetailsModal, courseDetailsModal.selectedCourseForDetails?.id, loadCourseStudentsForModal]);

  // Derived handlers
  const qc = useQueryClient();
  const handleLogout = async () => await signOut();
  const getSelectedEnrollmentsCount = () => enrollmentActions.getSelectedEnrollmentsCount();
  const handleBulkUnenroll = () => enrollmentActions.bulkUnenroll(enrollmentActions.selectedEnrollmentIds);
  const handleViewStudent = useCallback((student: any) => {
    tabNavigation.openStudentDetails(student.user_id);
  }, [tabNavigation]);

  /**
   * Phase 4A: bulk credentials work off explicit selected user_ids.
   * Profiles and (existing) passwords are point-fetched on demand — we no
   * longer filter the legacy d.students snapshot, so passwords cannot be
   * "missing" merely because they weren't preloaded.
   */
  const handleBulkSendCredentials = async (userIds?: string[]) => {
    const ids = (userIds && userIds.length > 0
      ? userIds
      : Array.from(enrollmentActions.selectedStudentIds));
    const uniq = Array.from(new Set(ids)).filter(Boolean);
    if (uniq.length === 0) { toast.error("Выберите учеников"); return; }
    if (!organizationId) { toast.error("Организация не выбрана"); return; }
    try {
      const [fetched, passwords] = await Promise.all([
        fetchStudentsByUserIds(organizationId, uniq, { includeEnrollments: false }),
        fetchStudentPasswordsForUsers(organizationId, uniq),
      ]);
      const merged = fetched.students.map(s => ({
        ...s,
        generated_password: passwords.get(s.user_id) ?? null,
      }));
      await studentActions.bulkSendCredentials(merged);
    } catch (err: any) {
      console.error("[handleBulkSendCredentials] point-fetch failed:", err);
      toast.error(err?.message?.includes("no profiles")
        ? "Не найдены выбранные ученики"
        : "Не удалось загрузить данные для отправки");
    }
  };

  const handleBulkCreateCredentials = async (userIds?: string[], sendEmails?: boolean) => {
    const ids = (userIds && userIds.length > 0
      ? userIds
      : Array.from(enrollmentActions.selectedStudentIds));
    const uniq = Array.from(new Set(ids)).filter(Boolean);
    if (uniq.length === 0) { toast.error("Выберите учеников"); return; }
    if (!organizationId) { toast.error("Организация не выбрана"); return; }
    try {
      // Always resolve existing passwords first — otherwise we could
      // regenerate credentials for a user whose password merely wasn't
      // loaded into memory.
      const [fetched, passwords] = await Promise.all([
        fetchStudentsByUserIds(organizationId, uniq, { includeEnrollments: false }),
        fetchStudentPasswordsForUsers(organizationId, uniq),
      ]);
      const studentsToCreate = fetched.students
        .map(s => ({ ...s, generated_password: passwords.get(s.user_id) ?? null }))
        .filter(s => !s.login || !s.generated_password);
      if (studentsToCreate.length === 0) {
        toast.info("У всех выбранных учеников уже есть логин и пароль");
        return;
      }
      await studentActions.bulkCreateCredentials(studentsToCreate, sendEmails);
      qc.invalidateQueries({ queryKey: qk.org.studentsPageAll(organizationId) });
      // Phase 4A.1: freshly generated passwords must invalidate per-user
      // credential caches so on-demand lookups don't return stale values.
      for (const s of studentsToCreate) {
        qc.invalidateQueries({ queryKey: qk.org.studentCredentials(organizationId, s.user_id) });
      }
    } catch (err: any) {
      console.error("[handleBulkCreateCredentials] point-fetch failed:", err);
      toast.error(err?.message?.includes("no profiles")
        ? "Не найдены выбранные ученики"
        : "Не удалось загрузить данные учеников");
    }
  };

  const handleCompanyCreate = async () => {
    const success = await companyActions.createCompany();
    if (success) { tabNavigation.setActiveTab("courses"); setTimeout(() => tabNavigation.setActiveTab("organizations"), 100); }
  };

  const handleCompanySave = async () => {
    const success = await companyActions.saveCompany();
    if (success) { tabNavigation.setActiveTab("courses"); setTimeout(() => tabNavigation.setActiveTab("organizations"), 100); }
  };

  return {
    // Auth & user
    user, signOut, handleLogout, isMobile,
    // Org data
    organizationId, organizationName, isFrdoEnabled, isAdminView,
    courses, setCourses, students, setStudents, allProfiles, setAllProfiles,
    companies, stats, setStats, documentsStats, studentDocsByUser, refreshData,
    isLoadingCourses,
    // Features & limits
    isEnabled, checkLimit, subscriptionLimits,
    // UI state
    showImportDialog, setShowImportDialog,
    isMobileSidebarOpen, setIsMobileSidebarOpen,
    showBulkUploadDialog, setShowBulkUploadDialog,
    studentStatusFilter, setStudentStatusFilter,
    studentCourseFilter, setStudentCourseFilter,
    showOnboarding, setShowOnboarding, handleOnboardingClose,
    // Categories
    categoryActions, categories, showCategoryDialog, setShowCategoryDialog, isCreatingCategory, getCategoryById,
    // Registration links
    registrationLinks,
    // Companies
    companyActions, handleCompanyCreate, handleCompanySave,
    // Student detail card
    studentDetailCard, handleViewStudent,
    // Enrollments
    enrollmentActions, getSelectedEnrollmentsCount, handleBulkUnenroll,
    // Course students
    courseStudentsManager,
    // Email invitation
    emailInvitation,
    // Student courses dialog
    studentCoursesDialog,
    // Student management
    studentManagement,
    // Student actions
    studentActions, handleBulkSendCredentials, handleBulkCreateCredentials,
    // Student details dialog
    studentDetailsDialog,
    // Course details modal
    courseDetailsModal, loadCourseStudentsForModal,
    // Doc dialogs
    courseDocsDialog, studentDocsDialog,
    // Dashboard settings
    dashboardSettings,
    // Tab navigation
    tabNavigation, swipeRef,
    // Organizations tab
    organizationsTab,
    // Branding
    branding,
    // Balance
    balance: orgBalance.balance,
    orgBalance,
    // Chats
    orgChats,
    unreadChatsCount: orgChats.totalUnread,
  };
}
