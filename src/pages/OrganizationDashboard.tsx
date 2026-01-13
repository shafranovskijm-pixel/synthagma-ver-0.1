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
import { useOrganizationData } from "@/hooks/useOrganizationData";
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
interface CourseCategory {
  id: string;
  name: string;
  color: string;
}
interface Course {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  created_at: string;
  lessonsCount?: number;
  studentsCount?: number;
  duration?: string;
  category_id?: string | null;
}
interface Student {
  id: string;
  user_id: string;
  enrollment_id: string | null;
  name: string;
  email: string;
  login: string | null;
  generated_password: string | null;
  course: string | null;
  course_id: string | null;
  progress: number;
  lastActivity: string | null;
  status: string | null;
}
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
interface StudentDocument {
  id: string;
  type: string;
  name: string;
  file_url: string | null;
}
interface TestAttempt {
  id: string;
  lesson_id: string;
  lesson_title: string;
  score: number;
  max_score: number;
  completed_at: string;
  answers: Record<string, number>;
}
interface TestQuestion {
  id: string;
  question: string;
  options: string[];
  correct_answer: number;
  order_index: number;
}
interface StudentDetails {
  student: Student;
  documents: StudentDocument[];
  testAttempts: TestAttempt[];
}
interface Company {
  id: string;
  name: string;
  inn: string | null;
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
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [courseFilter, setCourseFilter] = useState<"all" | "published" | "draft">("all");
  const [courseViewMode, setCourseViewMode] = useState<"grid" | "list">("grid");
  const [courseSearchQuery, setCourseSearchQuery] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("Организация");
  const [isFrdoEnabled, setIsFrdoEnabled] = useState(false);
  
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

  // Admin view mode
  const [isAdminView, setIsAdminView] = useState(false);
  const [adminViewOrgId, setAdminViewOrgId] = useState<string | null>(null);

  // Organizations state
  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [showOrgDetails, setShowOrgDetails] = useState(false);
  const [orgDocuments, setOrgDocuments] = useState<{
    id: string;
    type: string;
    name: string;
    file_url: string | null;
    created_at: string;
  }[]>([]);
  const [orgStudents, setOrgStudents] = useState<Student[]>([]);
  const [isLoadingOrgDetails, setIsLoadingOrgDetails] = useState(false);
  // Company management hook
  const companyActions = useCompanyActions();

  // Student details dialog - legacy state for old dialog
  const [selectedStudent, setSelectedStudent] = useState<StudentDetails | null>(null);
  const [showStudentDialog, setShowStudentDialog] = useState(false);
  const [isLoadingStudentDetails, setIsLoadingStudentDetails] = useState(false);
  const [testQuestions, setTestQuestions] = useState<Record<string, TestQuestion[]>>({});
  const [studentCompanyId, setStudentCompanyId] = useState<string>("");
  const [isSavingStudentCompany, setIsSavingStudentCompany] = useState(false);
  
  // StudentDetailCard hook
  const studentDetailCard = useStudentDetailCard();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Refresh trigger for data reload
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Student course assignment hook - refresh callback will be set after data loading setup
  const refreshData = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  // Enrollment actions hook
  const enrollmentActions = useEnrollmentActions(organizationId, organizationName, refreshData);

  // Course students manager hook
  const courseStudentsManager = useCourseStudentsManager(organizationId);

  // Email invitation state
  const [showInviteEmailDialog, setShowInviteEmailDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isSendingInvitation, setIsSendingInvitation] = useState(false);
  
  const studentCoursesDialog = useStudentCoursesDialog(courses, refreshData);

  // All profiles (students without enrollments)
  const [allProfiles, setAllProfiles] = useState<Student[]>([]);
  
  // Statistics state
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalCourses: 0,
    completedCount: 0,
    averageProgress: 0
  });

  // Companies state (needed before hooks)
  const [companies, setCompanies] = useState<Company[]>([]);

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

  // Documents stats
  const [documentsStats, setDocumentsStats] = useState<{
    total: number;
    withPassport: number;
    withSnils: number;
    withEducation: number;
    complete: number;
  }>({ total: 0, withPassport: 0, withSnils: 0, withEducation: 0, complete: 0 });

  // Category management hook
  const categoryActions = useCategoryActions(organizationId);
  const { categories, setCategories, showCategoryDialog, setShowCategoryDialog, newCategoryName, setNewCategoryName, newCategoryColor, setNewCategoryColor, isCreatingCategory, selectedCategoryFilter, getCategoryById, createCategory } = categoryActions;
  
  // Enrollment actions aliases
  const { selectedStudentIds, setSelectedStudentIds, showEnrollDialog, setShowEnrollDialog, showUnenrollConfirm, setShowUnenrollConfirm, showBulkFRDOExport, setShowBulkFRDOExport, enrollCourseId, setEnrollCourseId, isEnrolling, isUnenrolling } = enrollmentActions;

  // Student filter state - default to not_enrolled
  const [studentStatusFilter, setStudentStatusFilter] = useState<"all" | "active" | "completed" | "not_enrolled">("not_enrolled");
  const [studentCourseFilter, setStudentCourseFilter] = useState<string>("all");
  const [studentDocsFilter, setStudentDocsFilter] = useState<"all" | "complete" | "no_passport" | "no_snils" | "no_education" | "incomplete">("all");
  
  // Student documents by user_id for filtering
  const [studentDocsByUser, setStudentDocsByUser] = useState<Map<string, string[]>>(new Map());

  // FRDO data status by user_id
  const [studentFrdoStatus, setStudentFrdoStatus] = useState<Map<string, { 
    hasData: boolean; 
    isComplete: boolean; 
    missingFields: string[] 
  }>>(new Map());


  // Course details modal state
  const [showCourseDetailsModal, setShowCourseDetailsModal] = useState(false);
  const [selectedCourseForDetails, setSelectedCourseForDetails] = useState<Course | null>(null);
  const [courseDetailsTab, setCourseDetailsTab] = useState<"students" | "materials" | "history" | "tests">("students");

  // Course documents state
  const [showCourseDocsDialog, setShowCourseDocsDialog] = useState(false);
  const [selectedCourseForDocs, setSelectedCourseForDocs] = useState<Course | null>(null);

  // Student documents state
  const [showStudentDocsDialog, setShowStudentDocsDialog] = useState(false);
  const [selectedStudentForDocs, setSelectedStudentForDocs] = useState<{
    enrollmentId: string;
    studentName: string;
    courseName: string;
  } | null>(null);

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

  // Fetch organization data
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        // Check for admin view mode
        const adminViewData = localStorage.getItem("adminViewAsOrg");
        let orgId: string | null = null;
        if (adminViewData) {
          const adminView = JSON.parse(adminViewData);
          orgId = adminView.id;
          setAdminViewOrgId(adminView.id);
          setOrganizationName(adminView.name);
          setIsAdminView(true);
        } else {
          const {
            data: profile
          } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).single();
          if (!profile?.organization_id) {
            setIsLoadingCourses(false);
            return;
          }
          orgId = profile.organization_id;
          const {
            data: orgData
          } = await supabase.from("organizations").select("name, frdo_enabled").eq("id", orgId).single();
          if (orgData) {
            setOrganizationName(orgData.name);
            setIsFrdoEnabled(orgData.frdo_enabled || false);
          }
        }
        setOrganizationId(orgId);

        // Fetch courses
        const {
          data: coursesData,
          error
        } = await supabase.from("courses").select(`*, lessons(count)`).eq("organization_id", orgId).order("created_at", {
          ascending: false
        });
        if (error) throw error;
        const courseIds = (coursesData || []).map((c: any) => c.id);

        // Get enrollments
        let allEnrollments: any[] = [];
        if (courseIds.length > 0) {
          const {
            data: enrollmentsData
          } = await supabase.from("enrollments").select("*").in("course_id", courseIds);
          allEnrollments = enrollmentsData || [];
        }

        // Fetch students
        const {
          data: allProfilesData
        } = await supabase.from("profiles").select("id, user_id, full_name, email, login, generated_password").eq("organization_id", orgId);
        const userEnrollmentsMap: Record<string, any[]> = {};
        for (const enrollment of allEnrollments) {
          if (!userEnrollmentsMap[enrollment.user_id]) {
            userEnrollmentsMap[enrollment.user_id] = [];
          }
          userEnrollmentsMap[enrollment.user_id].push(enrollment);
        }
        const studentsList: Student[] = [];
        const profilesWithoutEnrollments: Student[] = [];
        for (const profile of allProfilesData || []) {
          const userEnrollments = userEnrollmentsMap[profile.user_id] || [];
          if (userEnrollments.length === 0) {
            profilesWithoutEnrollments.push({
              id: profile.id,
              user_id: profile.user_id,
              enrollment_id: null,
              name: profile.full_name || "Без имени",
              email: profile.email || "",
              login: profile.login || null,
              generated_password: profile.generated_password || null,
              course: null,
              course_id: null,
              progress: 0,
              lastActivity: null,
              status: null
            });
          } else {
            for (const enrollment of userEnrollments) {
              const course = coursesData?.find((c: any) => c.id === enrollment.course_id);
              studentsList.push({
                id: profile.id,
                user_id: profile.user_id,
                enrollment_id: enrollment.id,
                name: profile.full_name || "Без имени",
                email: profile.email || "",
                login: profile.login || null,
                generated_password: profile.generated_password || null,
                course: course?.title || "—",
                course_id: enrollment.course_id,
                progress: enrollment.progress || 0,
                lastActivity: enrollment.started_at,
                status: enrollment.status
              });
            }
          }
        }
        setStudents([...studentsList, ...profilesWithoutEnrollments]);
        setAllProfiles(profilesWithoutEnrollments);
        setIsLoadingStudents(false);

        // Calculate stats
        const totalStudents = (allProfilesData || []).length;
        const totalCourses = coursesData?.length || 0;
        const completedCount = allEnrollments.filter(e => e.status === 'completed').length;
        const averageProgress = allEnrollments.length > 0 ? Math.round(allEnrollments.reduce((sum, e) => sum + (e.progress || 0), 0) / allEnrollments.length) : 0;
        setStats({
          totalStudents,
          totalCourses,
          completedCount,
          averageProgress
        });

        // Fetch documents stats
        const { data: identityDocs } = await supabase
          .from("student_identity_documents")
          .select("user_id, type")
          .eq("organization_id", orgId);

        if (identityDocs && allProfilesData) {
          const docsByUser = new Map<string, string[]>();
          identityDocs.forEach(doc => {
            const existing = docsByUser.get(doc.user_id) || [];
            existing.push(doc.type);
            docsByUser.set(doc.user_id, existing);
          });

          let withPassport = 0;
          let withSnils = 0;
          let withEducation = 0;
          let complete = 0;

          for (const profile of allProfilesData) {
            const userDocs = docsByUser.get(profile.user_id) || [];
            const hasPassport = userDocs.some(t => t === "passport" || t === "birth_certificate");
            const hasSnils = userDocs.includes("snils");
            const hasEducation = userDocs.some(t => t === "education_document" || t === "diploma" || t === "attestat");

            if (hasPassport) withPassport++;
            if (hasSnils) withSnils++;
            if (hasEducation) withEducation++;
            if (hasPassport && hasSnils && hasEducation) complete++;
          }

          setStudentDocsByUser(docsByUser);
          setDocumentsStats({
            total: allProfilesData.length,
            withPassport,
            withSnils,
            withEducation,
            complete
          });
        }

        // Fetch FRDO data status for all students
        const userIds = allProfilesData.map(p => p.user_id);
        if (userIds.length > 0) {
          const { data: frdoData } = await supabase
            .from("student_frdo_data")
            .select("user_id, last_name, first_name, middle_name, birth_date, gender, snils, education_level")
            .eq("organization_id", orgId)
            .in("user_id", userIds);

          const frdoStatusMap = new Map<string, { hasData: boolean; isComplete: boolean; missingFields: string[] }>();
          
          const requiredFields = [
            { key: "last_name", label: "Фамилия" },
            { key: "first_name", label: "Имя" },
            { key: "birth_date", label: "Дата рождения" },
            { key: "gender", label: "Пол" },
            { key: "snils", label: "СНИЛС" },
          ];

          for (const profile of allProfilesData) {
            const data = frdoData?.find(f => f.user_id === profile.user_id);
            const missing: string[] = [];
            
            if (data) {
              for (const field of requiredFields) {
                if (!data[field.key as keyof typeof data]) {
                  missing.push(field.label);
                }
              }
              frdoStatusMap.set(profile.user_id, {
                hasData: true,
                isComplete: missing.length === 0,
                missingFields: missing,
              });
            } else {
              frdoStatusMap.set(profile.user_id, {
                hasData: false,
                isComplete: false,
                missingFields: requiredFields.map(f => f.label),
              });
            }
          }
          
          setStudentFrdoStatus(frdoStatusMap);
        }

        // Fetch categories
        const {
          data: categoriesData
        } = await supabase.from("course_categories").select("*").eq("organization_id", orgId).order("name");
        categoryActions.setCategories(categoriesData || []);

        // Fetch companies
        const {
          data: companiesData
        } = await supabase.from("companies").select("id, name, inn").eq("organization_id", orgId).order("name");
        setCompanies(companiesData || []);

        // Process courses with stats
        const coursesWithStats = (coursesData || []).map((course: any) => {
          const courseEnrollments = allEnrollments.filter(e => e.course_id === course.id);
          return {
            id: course.id,
            title: course.title,
            description: course.description,
            is_published: course.is_published,
            created_at: course.created_at,
            lessonsCount: course.lessons?.[0]?.count || 0,
            studentsCount: courseEnrollments.length,
            duration: course.duration || "—",
            category_id: course.category_id
          };
        });
        setCourses(coursesWithStats);
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Ошибка загрузки данных");
      } finally {
        setIsLoadingCourses(false);
      }
    };
    fetchData();
  }, [user, refreshKey]);

  // Fetch all organizations
  useEffect(() => {
    const fetchAllOrganizations = async () => {
      if (activeTab !== "organizations") return;
      setIsLoadingOrgs(true);
      try {
        const {
          data: orgs,
          error
        } = await supabase.from("organizations").select("*").order("created_at", {
          ascending: false
        });
        if (error) throw error;
        const orgsWithStats = await Promise.all((orgs || []).map(async org => {
          const {
            count: orgCoursesCount
          } = await supabase.from("courses").select("*", {
            count: "exact",
            head: true
          }).eq("organization_id", org.id);
          const {
            data: profiles
          } = await supabase.from("profiles").select("id", {
            count: "exact",
            head: true
          }).eq("organization_id", org.id);
          return {
            ...org,
            coursesCount: orgCoursesCount || 0,
            studentsCount: profiles?.length || 0
          };
        }));
        setAllOrganizations(orgsWithStats);
      } catch (error) {
        console.error("Error fetching organizations:", error);
      } finally {
        setIsLoadingOrgs(false);
      }
    };
    fetchAllOrganizations();
  }, [activeTab]);


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

  // Send course invitation by email
  const handleSendInvitation = async () => {
    const course = courseStudentsManager.selectedCourse;
    if (!course || !inviteEmail.trim()) {
      toast.error("Введите email получателя");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail.trim())) {
      toast.error("Введите корректный email адрес");
      return;
    }
    setIsSendingInvitation(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke("send-course-invitation", {
        body: {
          email: inviteEmail.trim(),
          courseName: course.title,
          courseId: course.id,
          organizationName: organizationName
        }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Приглашение отправлено на ${inviteEmail}`);
      setShowInviteEmailDialog(false);
      setInviteEmail("");
    } catch (error: any) {
      console.error("Error sending invitation:", error);
      if (error.message?.includes("RESEND_API_KEY")) {
        toast.error("Для отправки email необходимо настроить RESEND_API_KEY");
      } else {
        toast.error(error.message || "Ошибка отправки приглашения");
      }
    } finally {
      setIsSendingInvitation(false);
    }
  };

  // Category management
  // Category management - use hook
  const handleCreateCategory = createCategory;
  const handleSetCourseCategory = (courseId: string, categoryId: string | null) => categoryActions.setCourseCategory(courseId, categoryId, setCourses);

  // Copy credentials to clipboard
  const handleCopyCredentials = (login: string, password: string) => {
    const text = `Логин: ${login}\nПароль: ${password}`;
    navigator.clipboard.writeText(text);
    toast.success("Логин и пароль скопированы");
  };

  // Attach student to company
  const handleAttachStudentToCompany = async () => {
    if (!selectedStudent || !studentCompanyId) {
      toast.error("Выберите компанию");
      return;
    }
    setIsSavingStudentCompany(true);
    try {
      const {
        error
      } = await supabase.from("profiles").update({
        company_id: studentCompanyId
      }).eq("user_id", selectedStudent.student.user_id);
      if (error) throw error;
      toast.success("Ученик прикреплён к компании");
      // Update local state
      setStudents(prev => prev.map(s => s.user_id === selectedStudent.student.user_id ? {
        ...s,
        company_id: studentCompanyId
      } : s));
    } catch (error) {
      console.error("Error attaching student to company:", error);
      toast.error("Ошибка прикрепления к компании");
    } finally {
      setIsSavingStudentCompany(false);
    }
  };

  // Send credentials via email (placeholder - needs email service)
  // Use studentActions for credentials operations
  const handleSendCredentials = async () => {
    if (!selectedStudent) return;
    await studentActions.sendCredentialsClipboard(selectedStudent.student);
  };

  const handleSendCredentialsEmail = async () => {
    if (!selectedStudent) return;
    await studentActions.sendCredentialsEmail(selectedStudent.student);
  };

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

  const handleCreateStudentCredentials = async () => {
    if (!selectedStudent) return;
    const result = await studentActions.createCredentials(selectedStudent.student);
    if (result) {
      // Update local state
      setStudents(prev => prev.map(s => s.user_id === selectedStudent.student.user_id ? {
        ...s,
        login: result.login,
        generated_password: result.password
      } : s));
      setAllProfiles(prev => prev.map(s => s.user_id === selectedStudent.student.user_id ? {
        ...s,
        login: result.login,
        generated_password: result.password
      } : s));
    }
  };

  // Delete student completely (profile and all enrollments)
  const handleDeleteStudentCompletely = async () => {
    if (!selectedStudent) return;
    const student = selectedStudent.student;
    if (!confirm(`Вы уверены, что хотите полностью удалить ученика "${student.name}"? Это действие нельзя отменить.`)) {
      return;
    }
    await studentActions.deleteStudentCompletely(student.user_id);
    setStudents(prev => prev.filter(s => s.user_id !== student.user_id));
    setAllProfiles(prev => prev.filter(s => s.user_id !== student.user_id));
    setStats(prev => ({
      ...prev,
      totalStudents: Math.max(0, prev.totalStudents - 1)
    }));
    setShowStudentDialog(false);
    setSelectedStudent(null);
  };

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
  const handleViewOrg = async (org: Organization) => {
    setSelectedOrg(org);
    setShowOrgDetails(true);
    setIsLoadingOrgDetails(true);
    try {
      const {
        data: docs
      } = await supabase.from("org_documents").select("*").eq("organization_id", org.id).order("created_at", {
        ascending: false
      });
      setOrgDocuments(docs || []);
      const {
        data: profiles
      } = await supabase.from("profiles").select("id, user_id, full_name, email, login, generated_password").eq("organization_id", org.id);
      const studentsList: Student[] = (profiles || []).map(p => ({
        id: p.id,
        user_id: p.user_id,
        enrollment_id: null,
        name: p.full_name || "Без имени",
        email: p.email || "",
        login: p.login || null,
        generated_password: p.generated_password || null,
        course: null,
        course_id: null,
        progress: 0,
        lastActivity: null,
        status: null
      }));
      setOrgStudents(studentsList);
    } catch (error) {
      console.error("Error fetching org details:", error);
      toast.error("Ошибка загрузки данных");
    } finally {
      setIsLoadingOrgDetails(false);
    }
  };

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
        onShowInviteEmailDialog={() => setShowInviteEmailDialog(true)}
        onShowStudentDocs={(enrollmentId, studentName, courseName) => {
          setSelectedStudentForDocs({ enrollmentId, studentName, courseName });
          setShowStudentDocsDialog(true);
        }}
      />

      <InviteEmailDialog
        open={showInviteEmailDialog}
        onOpenChange={setShowInviteEmailDialog}
        courseTitle={courseStudentsManager.selectedCourse?.title}
        isSending={isSendingInvitation}
        onSend={async (email) => {
          const course = courseStudentsManager.selectedCourse;
          if (!course) return;
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email.trim())) {
            toast.error("Введите корректный email адрес");
            return;
          }
          setIsSendingInvitation(true);
          try {
            const { data, error } = await supabase.functions.invoke("send-course-invitation", {
              body: {
                email: email.trim(),
                courseName: course.title,
                courseId: course.id,
                organizationName: organizationName
              }
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            toast.success(`Приглашение отправлено на ${email}`);
            setShowInviteEmailDialog(false);
          } catch (error: any) {
            console.error("Error sending invitation:", error);
            toast.error(error.message || "Ошибка отправки приглашения");
          } finally {
            setIsSendingInvitation(false);
          }
        }}
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
      {selectedCourseForDocs && <CourseDocumentsManager courseId={selectedCourseForDocs.id} courseName={selectedCourseForDocs.title} isOpen={showCourseDocsDialog} onClose={() => {
      setShowCourseDocsDialog(false);
      setSelectedCourseForDocs(null);
    }} />}

      {/* Student Documents Manager */}
      {selectedStudentForDocs && <StudentDocumentsManager enrollmentId={selectedStudentForDocs.enrollmentId} studentName={selectedStudentForDocs.studentName} courseName={selectedStudentForDocs.courseName} isOpen={showStudentDocsDialog} onClose={() => {
      setShowStudentDocsDialog(false);
      setSelectedStudentForDocs(null);
    }} />}

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