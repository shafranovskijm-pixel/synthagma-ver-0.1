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
  const [showAddStudentDialog, setShowAddStudentDialog] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [courseFilter, setCourseFilter] = useState<"all" | "published" | "draft">("all");
  const [courseViewMode, setCourseViewMode] = useState<"grid" | "list">("grid");
  const [courseSearchQuery, setCourseSearchQuery] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("Организация");
  const [isFrdoEnabled, setIsFrdoEnabled] = useState(false);
  const [selectedExistingStudentId, setSelectedExistingStudentId] = useState<string>("");
  const [isEnrollingExisting, setIsEnrollingExisting] = useState(false);
  const [noLoginStudent, setNoLoginStudent] = useState(false);
  
  // Organization features access control
  const { features: orgFeatures, loading: loadingFeatures, isEnabled } = useOrgFeatures(organizationId);

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
  const [showAddCompanyDialog, setShowAddCompanyDialog] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyEmail, setNewCompanyEmail] = useState("");
  const [newCompanyInn, setNewCompanyInn] = useState("");
  const [newCompanyContactName, setNewCompanyContactName] = useState("");
  const [newCompanyPhone, setNewCompanyPhone] = useState("");
  const [isCreatingCompany, setIsCreatingCompany] = useState(false);
  const [showEditCompanyDialog, setShowEditCompanyDialog] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Organization | null>(null);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editCompanyEmail, setEditCompanyEmail] = useState("");
  const [editCompanyInn, setEditCompanyInn] = useState("");
  const [editCompanyContactName, setEditCompanyContactName] = useState("");
  const [editCompanyPhone, setEditCompanyPhone] = useState("");
  const [isSavingCompany, setIsSavingCompany] = useState(false);

  // Student details dialog
  const [selectedStudent, setSelectedStudent] = useState<StudentDetails | null>(null);
  const [showStudentDialog, setShowStudentDialog] = useState(false);
  const [isLoadingStudentDetails, setIsLoadingStudentDetails] = useState(false);
  const [testQuestions, setTestQuestions] = useState<Record<string, TestQuestion[]>>({});
  
  // StudentDetailCard state
  const [showStudentDetailCard, setShowStudentDetailCard] = useState(false);
  const [studentDetailCardData, setStudentDetailCardData] = useState<{
    id: string;
    user_id: string;
    name: string;
    email: string;
    login?: string | null;
    company_name?: string | null;
  } | null>(null);
  const [studentDetailCardEnrollments, setStudentDetailCardEnrollments] = useState<{
    id: string;
    course_id: string;
    course_title: string;
    progress: number;
    status: string;
    started_at: string;
    completed_at?: string | null;
    time_spent: number;
  }[]>([]);
  const [studentCompanyId, setStudentCompanyId] = useState<string>("");
  const [isSavingStudentCompany, setIsSavingStudentCompany] = useState(false);
  const [isSendingCredentials, setIsSendingCredentials] = useState(false);
  const [isSendingCredentialsEmail, setIsSendingCredentialsEmail] = useState(false);
  const [isSendingBulkCredentials, setIsSendingBulkCredentials] = useState(false);
  const [isCreatingCredentials, setIsCreatingCredentials] = useState(false);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);
  const [isCreatingBulkCredentials, setIsCreatingBulkCredentials] = useState(false);
  const [isSendingBulkDocReminders, setIsSendingBulkDocReminders] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showCreateLinkDialog, setShowCreateLinkDialog] = useState(false);
  const [newLinkCompanyName, setNewLinkCompanyName] = useState("");
  const [newLinkInn, setNewLinkInn] = useState("");
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [isCreatingStudent, setIsCreatingStudent] = useState(false);

  // Companies state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");

  // Student selection for bulk actions
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [showBulkFRDOExport, setShowBulkFRDOExport] = useState(false);
  const [enrollCourseId, setEnrollCourseId] = useState<string>("");
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isUnenrolling, setIsUnenrolling] = useState(false);
  const [showUnenrollConfirm, setShowUnenrollConfirm] = useState(false);

  // Course details dialog (for assigning students to course)
  const [showCourseStudentsDialog, setShowCourseStudentsDialog] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [courseStudents, setCourseStudents] = useState<Student[]>([]);
  const [availableStudentsForCourse, setAvailableStudentsForCourse] = useState<Student[]>([]);
  const [isLoadingCourseStudents, setIsLoadingCourseStudents] = useState(false);
  const [selectedStudentsToAdd, setSelectedStudentsToAdd] = useState<Set<string>>(new Set());
  const [isAddingStudentsToCourse, setIsAddingStudentsToCourse] = useState(false);

  // Email invitation state
  const [showInviteEmailDialog, setShowInviteEmailDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isSendingInvitation, setIsSendingInvitation] = useState(false);

  // Student course assignment dialog
  const [showStudentCoursesDialog, setShowStudentCoursesDialog] = useState(false);
  const [selectedStudentForCourses, setSelectedStudentForCourses] = useState<Student | null>(null);
  const [studentEnrollments, setStudentEnrollments] = useState<{
    course: Course;
    enrollment_id: string;
    progress: number;
    status: string;
  }[]>([]);
  const [availableCoursesForStudent, setAvailableCoursesForStudent] = useState<Course[]>([]);
  const [selectedCoursesToAdd, setSelectedCoursesToAdd] = useState<Set<string>>(new Set());
  const [isLoadingStudentCourses, setIsLoadingStudentCourses] = useState(false);
  const [isAddingCoursesToStudent, setIsAddingCoursesToStudent] = useState(false);
  const [studentCoursesSearchQuery, setStudentCoursesSearchQuery] = useState("");

  // All profiles (students without enrollments)
  const [allProfiles, setAllProfiles] = useState<Student[]>([]);

  // Documents stats
  const [documentsStats, setDocumentsStats] = useState<{
    total: number;
    withPassport: number;
    withSnils: number;
    withEducation: number;
    complete: number;
  }>({ total: 0, withPassport: 0, withSnils: 0, withEducation: 0, complete: 0 });

  // Categories state
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#6366f1");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CourseCategory | null>(null);

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

  // Refresh trigger for data reload
  const [refreshKey, setRefreshKey] = useState(0);

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

  // Statistics state
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalCourses: 0,
    completedCount: 0,
    averageProgress: 0
  });

  // Settings state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });
  const [studentDashboardSettings, setStudentDashboardSettings] = useState({
    showLibrary: true,
    showAchievements: true,
    showAiChat: true
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Menu visibility settings
  const [menuSettings, setMenuSettings] = useState({
    showStats: false,
    showLinks: false,
    showDocuments: false,
    showLibrary: true,
    showServices: true
  });

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

  const [brandingSettings, setBrandingSettings] = useState({
    coverUrl: '',
    primaryColor: '#6366f1',
    secondaryColor: '#8b5cf6',
    logoUrl: '',
    showOrgName: true
  });
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  // Load theme and settings on mount
  useEffect(() => {
    // Load theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else if (savedTheme === 'light') {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }

    // Load menu settings
    const savedMenuSettings = localStorage.getItem('orgMenuSettings');
    if (savedMenuSettings) {
      try {
        setMenuSettings(JSON.parse(savedMenuSettings));
      } catch (e) {
        console.error('Error loading menu settings:', e);
      }
    }
  }, []);

  // Load student dashboard settings from organization
  useEffect(() => {
    const loadStudentSettings = async () => {
      if (!organizationId) return;
      try {
        const {
          data,
          error
        } = await supabase.from('organizations').select('student_dashboard_settings').eq('id', organizationId).single();
        if (error) throw error;
        if (data?.student_dashboard_settings && typeof data.student_dashboard_settings === 'object') {
          const settings = data.student_dashboard_settings as Record<string, unknown>;
          setStudentDashboardSettings({
            showLibrary: settings.showLibrary !== false,
            showAchievements: settings.showAchievements !== false,
            showAiChat: settings.showAiChat !== false
          });
        }
      } catch (error) {
        console.error('Error loading student dashboard settings:', error);
      }
    };
    loadStudentSettings();
  }, [organizationId]);

  // Load branding settings from organization
  useEffect(() => {
    const loadBranding = async () => {
      if (!organizationId) return;
      try {
        const {
          data,
          error
        } = await supabase.from('organizations').select('branding').eq('id', organizationId).single();
        if (error) throw error;
        if (data?.branding && typeof data.branding === 'object') {
          const branding = data.branding as Record<string, unknown>;
          setBrandingSettings({
            coverUrl: branding.coverUrl as string || '',
            primaryColor: branding.primaryColor as string || '#6366f1',
            secondaryColor: branding.secondaryColor as string || '#8b5cf6',
            logoUrl: branding.logoUrl as string || '',
            showOrgName: branding.showOrgName !== false
          });
        }
      } catch (error) {
        console.error('Error loading branding:', error);
      }
    };
    loadBranding();
  }, [organizationId]);

  // Handle cover image upload
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл слишком большой. Максимум 5 МБ');
      return;
    }
    setIsUploadingCover(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/cover.${fileExt}`;
      const {
        error: uploadError
      } = await supabase.storage.from('org-branding').upload(filePath, file, {
        upsert: true
      });
      if (uploadError) throw uploadError;
      const {
        data: {
          publicUrl
        }
      } = supabase.storage.from('org-branding').getPublicUrl(filePath);
      setBrandingSettings(prev => ({
        ...prev,
        coverUrl: publicUrl
      }));
      toast.success('Обложка загружена');
    } catch (error) {
      console.error('Error uploading cover:', error);
      toast.error('Ошибка загрузки обложки');
    } finally {
      setIsUploadingCover(false);
    }
  };

  // Handle logo upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Файл слишком большой. Максимум 2 МБ');
      return;
    }
    setIsUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/logo.${fileExt}`;
      const {
        error: uploadError
      } = await supabase.storage.from('org-branding').upload(filePath, file, {
        upsert: true
      });
      if (uploadError) throw uploadError;
      const {
        data: {
          publicUrl
        }
      } = supabase.storage.from('org-branding').getPublicUrl(filePath);
      setBrandingSettings(prev => ({
        ...prev,
        logoUrl: publicUrl
      }));
      toast.success('Логотип загружен');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Ошибка загрузки логотипа');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // Save branding settings
  const handleSaveBranding = async () => {
    if (!organizationId) return;
    setIsSavingBranding(true);
    try {
      const {
        error
      } = await supabase.from('organizations').update({
        branding: brandingSettings
      }).eq('id', organizationId);
      if (error) throw error;
      toast.success('Настройки брендирования сохранены');
    } catch (error) {
      console.error('Error saving branding:', error);
      toast.error('Ошибка сохранения настроек');
    } finally {
      setIsSavingBranding(false);
    }
  };

  // Preview student dashboard
  const handlePreviewStudentDashboard = () => {
    // Store branding and settings for preview
    localStorage.setItem('previewStudentDashboard', 'true');
    localStorage.setItem('studentDashboardSettings', JSON.stringify(studentDashboardSettings));
    window.open('/student', '_blank');
  };

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
        setCategories(categoriesData || []);

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
      setIsLoadingCourseStudents(true);
      try {
        const {
          data: enrollments
        } = await supabase.from("enrollments").select("id, user_id, progress, status").eq("course_id", selectedCourseForDetails.id);
        const enrolledList: Student[] = [];
        for (const enrollment of enrollments || []) {
          const {
            data: profile
          } = await supabase.from("profiles").select("id, user_id, full_name, email, login, generated_password").eq("user_id", enrollment.user_id).single();
          if (profile) {
            enrolledList.push({
              id: profile.id,
              user_id: profile.user_id,
              enrollment_id: enrollment.id,
              name: profile.full_name || "Без имени",
              email: profile.email || "",
              login: profile.login || null,
              generated_password: profile.generated_password || null,
              course: selectedCourseForDetails.title,
              course_id: selectedCourseForDetails.id,
              progress: enrollment.progress,
              lastActivity: null,
              status: enrollment.status
            });
          }
        }
        setCourseStudents(enrolledList);
      } catch (error) {
        console.error("Error loading course students:", error);
      } finally {
        setIsLoadingCourseStudents(false);
      }
    };
    loadCourseStudentsData();
  }, [showCourseDetailsModal, selectedCourseForDetails?.id]);
  const handleLogout = async () => {
    await signOut();
  };
  const generateToken = () => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  };
  const handleCreateRegistrationLink = async () => {
    if (!organizationId) return;
    setIsCreatingLink(true);
    try {
      const token = generateToken();
      const {
        error
      } = await supabase.from("registration_links").insert({
        organization_id: organizationId,
        token,
        name: newLinkCompanyName || null,
        inn: newLinkInn || null
      });
      if (error) throw error;
      setShowCreateLinkDialog(false);
      setNewLinkCompanyName("");
      setNewLinkInn("");
      toast.success("Ссылка для регистрации создана");
      // LinksTab will refetch on mount
    } catch (error) {
      console.error("Error creating link:", error);
      toast.error("Ошибка создания ссылки");
    } finally {
      setIsCreatingLink(false);
    }
  };
  const generatePassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let password = "";
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };
  const handleCreateStudent = async () => {
    if (!organizationId || !newStudentName.trim() || !newStudentEmail.trim()) {
      toast.error("Заполните ФИО и Email");
      return;
    }
    if (!isValidEmail(newStudentEmail)) {
      toast.error("Введите корректный email адрес");
      return;
    }
    setIsCreatingStudent(true);
    try {
      const password = noLoginStudent ? null : generatePassword();
      const {
        data,
        error
      } = await supabase.functions.invoke("register-student", {
        body: {
          token: null,
          email: newStudentEmail || null,
          password,
          full_name: newStudentName,
          organization_id: organizationId,
          course_id: selectedCourseId || null,
          company_id: selectedCompanyId || null,
          no_login: noLoginStudent
        }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Show appropriate message based on response
      if (data.is_no_login) {
        toast.success(data.message || "Ученик добавлен");
      } else if (data.is_existing) {
        toast.success(data.message || "Ученик зачислен на курс");
      } else {
        toast.success(`Ученик создан. Пароль: ${password} (сохраните его!)`);
      }

      // Add or update student in the list
      const course = courses.find(c => c.id === selectedCourseId);
      const newStudent: Student = {
        id: data.user_id,
        user_id: data.user_id,
        enrollment_id: null,
        name: newStudentName,
        email: newStudentEmail || "",
        login: data.login || null,
        generated_password: data.password || null,
        course: course?.title || null,
        course_id: selectedCourseId || null,
        progress: 0,
        lastActivity: new Date().toISOString(),
        status: selectedCourseId ? "active" : null
      };

      // Check if student is already in the list
      const existsInList = students.some(s => s.user_id === data.user_id) || allProfiles.some(s => s.user_id === data.user_id);
      if (data.is_no_login || !data.is_existing) {
        // New student (with or without login) - add to lists
        setStudents(prev => [...prev, newStudent]);
        setAllProfiles(prev => [...prev, newStudent]);
        setStats(prev => ({
          ...prev,
          totalStudents: prev.totalStudents + 1
        }));
      } else if (data.enrollment_created && selectedCourseId) {
        // Existing student enrolled in new course - add enrollment entry
        setStudents(prev => [...prev, newStudent]);
      } else if (!existsInList) {
        // Existing student not in list - add them so they're visible
        setAllProfiles(prev => [...prev, newStudent]);
        setStudents(prev => [...prev, newStudent]);
      }

      // Trigger data refresh to ensure student appears in list
      setRefreshKey(prev => prev + 1);
      setShowAddStudentDialog(false);
      setNewStudentName("");
      setNewStudentEmail("");
      setSelectedCourseId("");
      setSelectedCompanyId("");
      setNoLoginStudent(false);
    } catch (error: any) {
      console.error("Error creating student:", error);
      toast.error(error.message || "Ошибка создания ученика");
    } finally {
      setIsCreatingStudent(false);
    }
  };
  const handleEnrollExistingStudent = async () => {
    if (!selectedExistingStudentId || !selectedCourseId) {
      toast.error("Выберите ученика и курс");
      return;
    }
    setIsEnrollingExisting(true);
    try {
      // Check if already enrolled
      const {
        data: existingEnrollment
      } = await supabase.from("enrollments").select("id").eq("user_id", selectedExistingStudentId).eq("course_id", selectedCourseId).single();
      if (existingEnrollment) {
        toast.error("Ученик уже зачислен на этот курс");
        return;
      }
      const {
        data: enrollment,
        error
      } = await supabase.from("enrollments").insert({
        user_id: selectedExistingStudentId,
        course_id: selectedCourseId,
        status: "active",
        progress: 0
      }).select().single();
      if (error) throw error;

      // Find student info
      const student = [...students, ...allProfiles].find(s => s.user_id === selectedExistingStudentId);
      const course = courses.find(c => c.id === selectedCourseId);
      if (student && course) {
        const newEnrollment: Student = {
          id: student.id,
          user_id: student.user_id,
          enrollment_id: enrollment.id,
          name: student.name,
          email: student.email,
          login: student.login || null,
          generated_password: student.generated_password || null,
          course: course.title,
          course_id: selectedCourseId,
          progress: 0,
          lastActivity: new Date().toISOString(),
          status: "active"
        };
        setStudents(prev => [...prev, newEnrollment]);

        // Generate enrollment order for single student
        if (organizationId) {
          const { data: orgData } = await supabase
            .from("organizations")
            .select("name, director_name, director_position")
            .eq("id", organizationId)
            .single();

          const orderName = await generateEnrollmentOrder({
            organizationId,
            organizationName: orgData?.name || organizationName,
            directorName: orgData?.director_name,
            directorPosition: orgData?.director_position,
            studentNames: [student.name],
            courseName: course.title,
            orderType: "enrollment",
          });

          if (orderName) {
            toast.success(`Приказ о зачислении создан`);
          }
        }
      }
      toast.success("Ученик зачислен на курс");
      setShowAddStudentDialog(false);
      setSelectedExistingStudentId("");
      setSelectedCourseId("");
    } catch (error: any) {
      console.error("Error enrolling student:", error);
      toast.error(error.message || "Ошибка зачисления");
    } finally {
      setIsEnrollingExisting(false);
    }
  };
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
  const toggleStudentSelection = (uniqueId: string) => {
    const newSet = new Set(selectedStudentIds);
    if (newSet.has(uniqueId)) {
      newSet.delete(uniqueId);
    } else {
      newSet.add(uniqueId);
    }
    setSelectedStudentIds(newSet);
  };
  const toggleSelectAll = (filteredList: Student[]) => {
    const filteredIds = filteredList.map(s => s.enrollment_id || s.user_id);
    const allSelected = filteredIds.every(id => selectedStudentIds.has(id)) && filteredIds.length > 0;
    if (allSelected) {
      // Deselect all filtered
      const newSet = new Set(selectedStudentIds);
      filteredIds.forEach(id => newSet.delete(id));
      setSelectedStudentIds(newSet);
    } else {
      // Select all filtered
      const newSet = new Set(selectedStudentIds);
      filteredIds.forEach(id => newSet.add(id));
      setSelectedStudentIds(newSet);
    }
  };
  const getSelectedUserIds = (): string[] => {
    const userIds = new Set<string>();
    for (const student of students) {
      const uniqueId = student.enrollment_id || student.user_id;
      if (selectedStudentIds.has(uniqueId)) {
        userIds.add(student.user_id);
      }
    }
    return Array.from(userIds);
  };
  const handleBulkEnroll = async () => {
    if (!enrollCourseId) {
      toast.error("Выберите курс");
      return;
    }
    const userIds = getSelectedUserIds();
    if (userIds.length === 0) {
      toast.error("Выберите учеников");
      return;
    }
    setIsEnrolling(true);
    try {
      const {
        data: existingEnrollments
      } = await supabase.from("enrollments").select("user_id").eq("course_id", enrollCourseId).in("user_id", userIds);
      const existingUserIds = new Set((existingEnrollments || []).map(e => e.user_id));
      const newUserIds = userIds.filter(id => !existingUserIds.has(id));
      if (newUserIds.length === 0) {
        toast.info("Все выбранные ученики уже зачислены на этот курс");
        setShowEnrollDialog(false);
        return;
      }
      const enrollmentsToInsert = newUserIds.map(userId => ({
        user_id: userId,
        course_id: enrollCourseId,
        status: "active",
        progress: 0
      }));
      const {
        error
      } = await supabase.from("enrollments").insert(enrollmentsToInsert);
      if (error) throw error;

      // Generate enrollment order
      if (organizationId) {
        const enrolledStudentNames = newUserIds
          .map(userId => {
            const student = [...students, ...allProfiles].find(s => s.user_id === userId);
            return student?.name || "Неизвестный";
          });
        const course = courses.find(c => c.id === enrollCourseId);
        
        // Fetch organization details for the order
        const { data: orgData } = await supabase
          .from("organizations")
          .select("name, director_name, director_position")
          .eq("id", organizationId)
          .single();

        const orderName = await generateEnrollmentOrder({
          organizationId,
          organizationName: orgData?.name || organizationName,
          directorName: orgData?.director_name,
          directorPosition: orgData?.director_position,
          studentNames: enrolledStudentNames,
          courseName: course?.title || "Курс",
          orderType: "enrollment",
        });

        if (orderName) {
          toast.success(`Приказ о зачислении создан: ${orderName}`);
        }
      }

      toast.success(`Зачислено ${newUserIds.length} учеников`);
      setShowEnrollDialog(false);
      setSelectedStudentIds(new Set());
      setEnrollCourseId("");
      window.location.reload();
    } catch (error) {
      console.error("Error enrolling students:", error);
      toast.error("Ошибка зачисления");
    } finally {
      setIsEnrolling(false);
    }
  };

  // Bulk unenroll selected students
  const handleBulkUnenroll = async () => {
    // Get enrollment IDs from selected students
    const enrollmentIds = Array.from(selectedStudentIds).filter(id => {
      // Check if it's an enrollment_id (not user_id)
      const student = students.find(s => s.enrollment_id === id);
      return student !== undefined;
    });
    if (enrollmentIds.length === 0) {
      toast.error("Нет выбранных зачислений для отчисления");
      setShowUnenrollConfirm(false);
      return;
    }
    setIsUnenrolling(true);
    try {
      // Collect student names and courses before deletion
      const studentsToUnenroll = enrollmentIds.map(enrollmentId => {
        const student = students.find(s => s.enrollment_id === enrollmentId);
        return {
          name: student?.name || "Неизвестный",
          courseName: student?.course || "Курс",
          courseId: student?.course_id
        };
      });

      const {
        error
      } = await supabase.from("enrollments").delete().in("id", enrollmentIds);
      if (error) throw error;

      // Generate expulsion orders grouped by course
      if (organizationId) {
        const { data: orgData } = await supabase
          .from("organizations")
          .select("name, director_name, director_position")
          .eq("id", organizationId)
          .single();

        // Group students by course
        const studentsByCourse = studentsToUnenroll.reduce((acc, student) => {
          const key = student.courseId || "unknown";
          if (!acc[key]) {
            acc[key] = { courseName: student.courseName, names: [] };
          }
          acc[key].names.push(student.name);
          return acc;
        }, {} as Record<string, { courseName: string; names: string[] }>);

        // Create an order for each course
        for (const courseData of Object.values(studentsByCourse)) {
          const orderName = await generateEnrollmentOrder({
            organizationId,
            organizationName: orgData?.name || organizationName,
            directorName: orgData?.director_name,
            directorPosition: orgData?.director_position,
            studentNames: courseData.names,
            courseName: courseData.courseName,
            orderType: "expulsion",
          });

          if (orderName) {
            toast.success(`Приказ об отчислении создан: ${orderName}`);
          }
        }
      }

      toast.success(`Отчислено ${enrollmentIds.length} учеников`);
      setShowUnenrollConfirm(false);
      setSelectedStudentIds(new Set());
      window.location.reload();
    } catch (error) {
      console.error("Error unenrolling students:", error);
      toast.error("Ошибка отчисления");
    } finally {
      setIsUnenrolling(false);
    }
  };

  // Get count of selected enrollments (not just profiles)
  const getSelectedEnrollmentsCount = () => {
    return Array.from(selectedStudentIds).filter(id => {
      const student = students.find(s => s.enrollment_id === id);
      return student !== undefined;
    }).length;
  };

  // Open course details to assign students
  const handleOpenCourseStudents = async (course: Course) => {
    setSelectedCourse(course);
    setShowCourseStudentsDialog(true);
    setIsLoadingCourseStudents(true);
    setSelectedStudentsToAdd(new Set());
    try {
      const {
        data: enrollments
      } = await supabase.from("enrollments").select("id, user_id, progress, status").eq("course_id", course.id);
      const enrolledStudentIds = new Set((enrollments || []).map(e => e.user_id));
      const enrolledList: Student[] = [];
      for (const enrollment of enrollments || []) {
        const {
          data: profile
        } = await supabase.from("profiles").select("id, user_id, full_name, email, login, generated_password").eq("user_id", enrollment.user_id).single();
        if (profile) {
          enrolledList.push({
            id: profile.id,
            user_id: profile.user_id,
            enrollment_id: enrollment.id,
            name: profile.full_name || "Без имени",
            email: profile.email || "",
            login: profile.login || null,
            generated_password: profile.generated_password || null,
            course: course.title,
            course_id: course.id,
            progress: enrollment.progress,
            lastActivity: null,
            status: enrollment.status
          });
        }
      }
      setCourseStudents(enrolledList);
      if (organizationId) {
        const {
          data: allProfiles
        } = await supabase.from("profiles").select("id, user_id, full_name, email, login, generated_password").eq("organization_id", organizationId);
        const available = (allProfiles || []).filter(p => !enrolledStudentIds.has(p.user_id)).map(p => ({
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
        setAvailableStudentsForCourse(available);
      }
    } catch (error) {
      console.error("Error loading course students:", error);
      toast.error("Ошибка загрузки данных");
    } finally {
      setIsLoadingCourseStudents(false);
    }
  };
  const handleAddStudentsToCourse = async () => {
    if (!selectedCourse || selectedStudentsToAdd.size === 0) return;
    setIsAddingStudentsToCourse(true);
    try {
      const userIds = Array.from(selectedStudentsToAdd);

      // Check for existing enrollments
      const {
        data: existingEnrollments
      } = await supabase.from("enrollments").select("user_id").eq("course_id", selectedCourse.id).in("user_id", userIds);
      const existingUserIds = new Set((existingEnrollments || []).map(e => e.user_id));
      const newUserIds = userIds.filter(id => !existingUserIds.has(id));
      if (newUserIds.length === 0) {
        toast.info("Все выбранные ученики уже зачислены на этот курс");
        setSelectedStudentsToAdd(new Set());
        return;
      }
      const enrollmentsToInsert = newUserIds.map(userId => ({
        user_id: userId,
        course_id: selectedCourse.id,
        status: "active",
        progress: 0
      }));
      const {
        error
      } = await supabase.from("enrollments").insert(enrollmentsToInsert);
      if (error) throw error;
      toast.success(`Зачислено ${newUserIds.length} учеников`);
      setSelectedStudentsToAdd(new Set());
      handleOpenCourseStudents(selectedCourse);
    } catch (error) {
      console.error("Error adding students to course:", error);
      toast.error("Ошибка зачисления");
    } finally {
      setIsAddingStudentsToCourse(false);
    }
  };
  const handleRemoveFromCourse = async (enrollmentId: string) => {
    try {
      const {
        error
      } = await supabase.from("enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;
      toast.success("Ученик удалён из курса");
      if (selectedCourse) {
        handleOpenCourseStudents(selectedCourse);
      }
    } catch (error) {
      console.error("Error removing enrollment:", error);
      toast.error("Ошибка удаления");
    }
  };

  // Open student courses management dialog
  const handleOpenStudentCourses = async (student: Student) => {
    setSelectedStudentForCourses(student);
    setShowStudentCoursesDialog(true);
    setIsLoadingStudentCourses(true);
    setSelectedCoursesToAdd(new Set());
    setStudentCoursesSearchQuery("");
    try {
      // Get all enrollments for this student
      const {
        data: enrollmentsData,
        error: enrollmentsError
      } = await supabase.from("enrollments").select("id, course_id, progress, status").eq("user_id", student.user_id);
      if (enrollmentsError) throw enrollmentsError;
      const enrolledCourseIds = new Set((enrollmentsData || []).map(e => e.course_id));

      // Get course details for enrolled courses
      const enrolledList: {
        course: Course;
        enrollment_id: string;
        progress: number;
        status: string;
      }[] = [];
      for (const enrollment of enrollmentsData || []) {
        const course = courses.find(c => c.id === enrollment.course_id);
        if (course) {
          enrolledList.push({
            course,
            enrollment_id: enrollment.id,
            progress: enrollment.progress || 0,
            status: enrollment.status || "active"
          });
        }
      }
      setStudentEnrollments(enrolledList);

      // Get available courses (not enrolled yet)
      const availableCourses = courses.filter(c => c.is_published && !enrolledCourseIds.has(c.id));
      setAvailableCoursesForStudent(availableCourses);
    } catch (error) {
      console.error("Error loading student courses:", error);
      toast.error("Ошибка загрузки данных");
    } finally {
      setIsLoadingStudentCourses(false);
    }
  };

  // Add multiple courses to student
  const handleAddCoursesToStudent = async () => {
    if (!selectedStudentForCourses || selectedCoursesToAdd.size === 0) return;
    setIsAddingCoursesToStudent(true);
    try {
      const enrollmentsToInsert = Array.from(selectedCoursesToAdd).map(courseId => ({
        user_id: selectedStudentForCourses.user_id,
        course_id: courseId,
        status: "active",
        progress: 0
      }));
      const {
        error
      } = await supabase.from("enrollments").insert(enrollmentsToInsert);
      if (error) throw error;
      toast.success(`Зачислено на ${selectedCoursesToAdd.size} курсов`);
      setSelectedCoursesToAdd(new Set());

      // Refresh data
      handleOpenStudentCourses(selectedStudentForCourses);
    } catch (error) {
      console.error("Error adding courses to student:", error);
      toast.error("Ошибка зачисления");
    } finally {
      setIsAddingCoursesToStudent(false);
    }
  };

  // Remove student from a course (from student courses dialog)
  const handleRemoveStudentFromCourse = async (enrollmentId: string) => {
    if (!selectedStudentForCourses) return;
    try {
      const {
        error
      } = await supabase.from("enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;
      toast.success("Отчислен с курса");
      handleOpenStudentCourses(selectedStudentForCourses);
    } catch (error) {
      console.error("Error removing enrollment:", error);
      toast.error("Ошибка отчисления");
    }
  };

  // Toggle course selection for bulk enrollment
  const toggleCourseSelection = (courseId: string) => {
    const newSelected = new Set(selectedCoursesToAdd);
    if (newSelected.has(courseId)) {
      newSelected.delete(courseId);
    } else {
      newSelected.add(courseId);
    }
    setSelectedCoursesToAdd(newSelected);
  };

  // Send course invitation by email
  const handleSendInvitation = async () => {
    if (!selectedCourse || !inviteEmail.trim()) {
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
          courseName: selectedCourse.title,
          courseId: selectedCourse.id,
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
  const handleCreateCategory = async () => {
    if (!organizationId || !newCategoryName.trim()) {
      toast.error("Введите название категории");
      return;
    }
    setIsCreatingCategory(true);
    try {
      const {
        data,
        error
      } = await supabase.from("course_categories").insert({
        organization_id: organizationId,
        name: newCategoryName.trim(),
        color: newCategoryColor
      }).select().single();
      if (error) throw error;
      setCategories([...categories, data]);
      setNewCategoryName("");
      setNewCategoryColor("#6366f1");
      setShowCategoryDialog(false);
      toast.success("Категория создана");
    } catch (error) {
      console.error("Error creating category:", error);
      toast.error("Ошибка создания категории");
    } finally {
      setIsCreatingCategory(false);
    }
  };
  const handleSetCourseCategory = async (courseId: string, categoryId: string | null) => {
    try {
      const {
        error
      } = await supabase.from("courses").update({
        category_id: categoryId
      }).eq("id", courseId);
      if (error) throw error;
      setCourses(courses.map(c => c.id === courseId ? {
        ...c,
        category_id: categoryId
      } : c));
      toast.success("Категория назначена");
    } catch (error) {
      console.error("Error setting category:", error);
      toast.error("Ошибка назначения категории");
    }
  };
  const getCategoryById = (categoryId: string | null | undefined): CourseCategory | undefined => {
    if (!categoryId) return undefined;
    return categories.find(c => c.id === categoryId);
  };

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
  const handleSendCredentials = async () => {
    if (!selectedStudent) return;
    const student = selectedStudent.student;
    if (!student.login || !student.generated_password) {
      toast.error("У ученика нет логина для входа");
      return;
    }
    if (!student.email) {
      toast.error("У ученика не указан email");
      return;
    }
    setIsSendingCredentials(true);
    try {
      // For now, just copy to clipboard with a message
      const text = `Здравствуйте!\n\nВаши данные для входа в систему обучения:\n\nЛогин: ${student.login}\nПароль: ${student.generated_password}\n\nСсылка для входа: ${window.location.origin}/login`;
      await navigator.clipboard.writeText(text);
      toast.success("Сообщение с данными скопировано в буфер обмена. Отправьте его ученику вручную.");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Ошибка копирования");
    } finally {
      setIsSendingCredentials(false);
    }
  };

  // Send credentials via email to single student
  const handleSendCredentialsEmail = async () => {
    if (!selectedStudent) return;
    const student = selectedStudent.student;
    if (!student.login || !student.generated_password) {
      toast.error("У ученика нет логина для входа");
      return;
    }
    if (!student.email) {
      toast.error("У ученика не указан email");
      return;
    }
    setIsSendingCredentialsEmail(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke("send-credentials", {
        body: {
          email: student.email,
          name: student.name,
          login: student.login,
          password: student.generated_password,
          loginUrl: `https://wpczgwxsriezaubncuom.lovableproject.com/login`,
          organizationName: organizationName
        }
      });
      if (error) throw error;
      toast.success(`Данные для входа отправлены на ${student.email}`);
    } catch (error) {
      console.error("Error sending credentials:", error);
      toast.error("Ошибка отправки email. Проверьте настройки почтового сервиса.");
    } finally {
      setIsSendingCredentialsEmail(false);
    }
  };

  // Send credentials via email to multiple students (bulk)
  const handleBulkSendCredentials = async () => {
    if (selectedStudentIds.size === 0) {
      toast.error("Выберите учеников");
      return;
    }

    // Get selected students with credentials
    const studentsToSend = students.filter(s => selectedStudentIds.has(s.user_id) && s.login && s.generated_password && s.email);
    if (studentsToSend.length === 0) {
      toast.error("У выбранных учеников нет данных для отправки (логин, пароль или email)");
      return;
    }
    setIsSendingBulkCredentials(true);
    let successCount = 0;
    let errorCount = 0;
    try {
      for (const student of studentsToSend) {
        try {
          const {
            error
          } = await supabase.functions.invoke("send-credentials", {
            body: {
              email: student.email,
              name: student.name,
              login: student.login!,
              password: student.generated_password!,
              loginUrl: `https://wpczgwxsriezaubncuom.lovableproject.com/login`,
              organizationName: organizationName
            }
          });
          if (error) {
            errorCount++;
            console.error(`Error sending to ${student.email}:`, error);
          } else {
            successCount++;
          }
        } catch (err) {
          errorCount++;
          console.error(`Error sending to ${student.email}:`, err);
        }
      }
      if (successCount > 0) {
        toast.success(`Отправлено: ${successCount} из ${studentsToSend.length}`);
      }
      if (errorCount > 0) {
        toast.error(`Ошибки отправки: ${errorCount}`);
      }
    } catch (error) {
      console.error("Error in bulk send:", error);
      toast.error("Ошибка массовой отправки");
    } finally {
      setIsSendingBulkCredentials(false);
    }
  };

  // Send document reminders to all students with missing documents
  const handleBulkSendDocReminders = async () => {
    if (!organizationId) return;
    
    setIsSendingBulkDocReminders(true);
    try {
      // Get all students in organization
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("organization_id", organizationId);

      if (!profiles || profiles.length === 0) {
        toast.info("Нет учеников в организации");
        setIsSendingBulkDocReminders(false);
        return;
      }

      // Get identity documents for all students
      const { data: allDocs } = await supabase
        .from("student_identity_documents")
        .select("user_id, type")
        .eq("organization_id", organizationId);

      const docsByUser = new Map<string, string[]>();
      allDocs?.forEach(doc => {
        const existing = docsByUser.get(doc.user_id) || [];
        existing.push(doc.type);
        docsByUser.set(doc.user_id, existing);
      });

      // Find students with missing documents
      const studentsWithMissingDocs: { email: string; name: string; missing: string[] }[] = [];
      
      for (const profile of profiles) {
        const userDocs = docsByUser.get(profile.user_id) || [];
        const missing: string[] = [];
        
        const hasPassport = userDocs.some(t => t === "passport" || t === "birth_certificate");
        const hasSnils = userDocs.includes("snils");
        const hasEducation = userDocs.some(t => t === "education_document" || t === "diploma" || t === "attestat");
        
        if (!hasPassport) missing.push("Паспорт или свидетельство о рождении");
        if (!hasSnils) missing.push("СНИЛС");
        if (!hasEducation) missing.push("Документ об образовании");
        
        if (missing.length > 0 && profile.email) {
          studentsWithMissingDocs.push({
            email: profile.email,
            name: profile.full_name || "Ученик",
            missing
          });
        }
      }

      if (studentsWithMissingDocs.length === 0) {
        toast.success("Все ученики загрузили документы!");
        setIsSendingBulkDocReminders(false);
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const student of studentsWithMissingDocs) {
        try {
          const response = await supabase.functions.invoke("send-documents-reminder", {
            body: {
              email: student.email,
              studentName: student.name,
              missingDocuments: student.missing,
              organizationName: organizationName,
              loginUrl: window.location.origin + "/login",
            },
          });

          if (response.error) throw response.error;
          successCount++;
        } catch (err) {
          errorCount++;
          console.error(`Error sending to ${student.email}:`, err);
        }
      }

      if (successCount > 0) {
        toast.success(`Отправлено напоминаний: ${successCount} из ${studentsWithMissingDocs.length}`);
      }
      if (errorCount > 0) {
        toast.error(`Ошибки отправки: ${errorCount}`);
      }
    } catch (error) {
      console.error("Error in bulk doc reminders:", error);
      toast.error("Ошибка массовой отправки");
    } finally {
      setIsSendingBulkDocReminders(false);
    }
  };

  const handleCreateStudentCredentials = async () => {
    if (!selectedStudent) return;
    const student = selectedStudent.student;
    if (student.login && student.generated_password) {
      toast.info("У ученика уже есть логин и пароль");
      return;
    }
    setIsCreatingCredentials(true);
    try {
      // Generate login from name
      const nameParts = student.name.toLowerCase().split(/\s+/);
      let baseLogin = nameParts.length >= 2 ? nameParts[0].replace(/[^a-zа-яё]/gi, '').substring(0, 10) + '_' + nameParts[1].replace(/[^a-zа-яё]/gi, '').substring(0, 2) : nameParts[0].replace(/[^a-zа-яё]/gi, '').substring(0, 12);

      // Transliterate Russian characters
      const translit: Record<string, string> = {
        'а': 'a',
        'б': 'b',
        'в': 'v',
        'г': 'g',
        'д': 'd',
        'е': 'e',
        'ё': 'e',
        'ж': 'zh',
        'з': 'z',
        'и': 'i',
        'й': 'y',
        'к': 'k',
        'л': 'l',
        'м': 'm',
        'н': 'n',
        'о': 'o',
        'п': 'p',
        'р': 'r',
        'с': 's',
        'т': 't',
        'у': 'u',
        'ф': 'f',
        'х': 'h',
        'ц': 'ts',
        'ч': 'ch',
        'ш': 'sh',
        'щ': 'sch',
        'ъ': '',
        'ы': 'y',
        'ь': '',
        'э': 'e',
        'ю': 'yu',
        'я': 'ya'
      };
      baseLogin = baseLogin.split('').map(c => translit[c] || c).join('');

      // Add random suffix to ensure uniqueness
      const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const login = baseLogin + randomSuffix;

      // Generate password
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let password = '';
      for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      // Update profile with login and password
      const {
        error
      } = await supabase.from("profiles").update({
        login,
        generated_password: password
      }).eq("user_id", student.user_id);
      if (error) throw error;

      // Update local state
      setSelectedStudent({
        ...selectedStudent,
        student: {
          ...student,
          login,
          generated_password: password
        }
      });

      // Update students list
      setStudents(prev => prev.map(s => s.user_id === student.user_id ? {
        ...s,
        login,
        generated_password: password
      } : s));
      setAllProfiles(prev => prev.map(s => s.user_id === student.user_id ? {
        ...s,
        login,
        generated_password: password
      } : s));
      toast.success(`Логин и пароль созданы! Логин: ${login}, Пароль: ${password}`);
    } catch (error) {
      console.error("Error creating credentials:", error);
      toast.error("Ошибка создания логина и пароля");
    } finally {
      setIsCreatingCredentials(false);
    }
  };

  // Delete student completely (profile and all enrollments)
  const handleDeleteStudentCompletely = async () => {
    if (!selectedStudent) return;
    const student = selectedStudent.student;
    if (!confirm(`Вы уверены, что хотите полностью удалить ученика "${student.name}"? Это действие нельзя отменить.`)) {
      return;
    }
    setIsDeletingStudent(true);
    try {
      // Delete all enrollments
      await supabase.from("enrollments").delete().eq("user_id", student.user_id);

      // Delete profile
      const {
        error
      } = await supabase.from("profiles").delete().eq("user_id", student.user_id);
      if (error) throw error;

      // Update local state
      setStudents(prev => prev.filter(s => s.user_id !== student.user_id));
      setAllProfiles(prev => prev.filter(s => s.user_id !== student.user_id));
      setStats(prev => ({
        ...prev,
        totalStudents: Math.max(0, prev.totalStudents - 1)
      }));
      setShowStudentDialog(false);
      setSelectedStudent(null);
      toast.success("Ученик удалён");
    } catch (error) {
      console.error("Error deleting student:", error);
      toast.error("Ошибка удаления ученика");
    } finally {
      setIsDeletingStudent(false);
    }
  };

  // Bulk create credentials for selected students without login
  const handleBulkCreateCredentials = async () => {
    if (selectedStudentIds.size === 0) {
      toast.error("Выберите учеников");
      return;
    }

    // Get selected students without credentials
    const studentsToCreate = students.filter(s => selectedStudentIds.has(s.enrollment_id || s.user_id) && !s.login);
    if (studentsToCreate.length === 0) {
      toast.info("У всех выбранных учеников уже есть логин и пароль");
      return;
    }
    setIsCreatingBulkCredentials(true);
    let successCount = 0;
    let errorCount = 0;
    const createdCredentials: Array<{
      name: string;
      login: string;
      password: string;
    }> = [];

    // Transliteration map
    const translit: Record<string, string> = {
      'а': 'a',
      'б': 'b',
      'в': 'v',
      'г': 'g',
      'д': 'd',
      'е': 'e',
      'ё': 'e',
      'ж': 'zh',
      'з': 'z',
      'и': 'i',
      'й': 'y',
      'к': 'k',
      'л': 'l',
      'м': 'm',
      'н': 'n',
      'о': 'o',
      'п': 'p',
      'р': 'r',
      'с': 's',
      'т': 't',
      'у': 'u',
      'ф': 'f',
      'х': 'h',
      'ц': 'ts',
      'ч': 'ch',
      'ш': 'sh',
      'щ': 'sch',
      'ъ': '',
      'ы': 'y',
      'ь': '',
      'э': 'e',
      'ю': 'yu',
      'я': 'ya'
    };
    try {
      for (const student of studentsToCreate) {
        try {
          // Generate login from name
          const nameParts = student.name.toLowerCase().split(/\s+/);
          let baseLogin = nameParts.length >= 2 ? nameParts[0].replace(/[^a-zа-яё]/gi, '').substring(0, 10) + '_' + nameParts[1].replace(/[^a-zа-яё]/gi, '').substring(0, 2) : nameParts[0].replace(/[^a-zа-яё]/gi, '').substring(0, 12);
          baseLogin = baseLogin.split('').map(c => translit[c] || c).join('');
          const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
          const login = baseLogin + randomSuffix;

          // Generate password
          const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
          let password = '';
          for (let i = 0; i < 8; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
          }

          // Update profile
          const {
            error
          } = await supabase.from("profiles").update({
            login,
            generated_password: password
          }).eq("user_id", student.user_id);
          if (error) throw error;
          createdCredentials.push({
            name: student.name,
            login,
            password
          });
          successCount++;
        } catch (err) {
          errorCount++;
          console.error(`Error creating credentials for ${student.name}:`, err);
        }
      }

      // Update local state
      const credentialsMap = new Map(createdCredentials.map(c => [c.name, c]));
      setStudents(prev => prev.map(s => {
        const creds = createdCredentials.find(c => c.name === s.name && !s.login);
        return creds ? {
          ...s,
          login: creds.login,
          generated_password: creds.password
        } : s;
      }));
      setAllProfiles(prev => prev.map(s => {
        const creds = createdCredentials.find(c => c.name === s.name && !s.login);
        return creds ? {
          ...s,
          login: creds.login,
          generated_password: creds.password
        } : s;
      }));
      if (successCount > 0) {
        toast.success(`Создано логинов: ${successCount} из ${studentsToCreate.length}`);
      }
      if (errorCount > 0) {
        toast.error(`Ошибки: ${errorCount}`);
      }
    } catch (error) {
      console.error("Error in bulk create credentials:", error);
      toast.error("Ошибка массового создания");
    } finally {
      setIsCreatingBulkCredentials(false);
    }
  };

  // View student details with StudentDetailCard
  const handleViewStudent = async (student: Student) => {
    // Find company name if student has company_id
    let companyName: string | null = null;
    
    // Get all enrollments for this student
    const { data: enrollmentsData } = await supabase
      .from("enrollments")
      .select("id, course_id, progress, status, started_at, completed_at, time_spent, courses(title)")
      .eq("user_id", student.user_id);
    
    const enrollments = (enrollmentsData || []).map((e: any) => ({
      id: e.id,
      course_id: e.course_id,
      course_title: e.courses?.title || "Неизвестный курс",
      progress: e.progress || 0,
      status: e.status || "active",
      started_at: e.started_at,
      completed_at: e.completed_at,
      time_spent: e.time_spent || 0,
    }));

    setStudentDetailCardData({
      id: student.id,
      user_id: student.user_id,
      name: student.name,
      email: student.email,
      login: student.login,
      company_name: companyName,
    });
    setStudentDetailCardEnrollments(enrollments);
    setShowStudentDetailCard(true);
  };

  // Company management
  const handleCreateCompany = async () => {
    if (!newCompanyName.trim() || !newCompanyEmail.trim()) {
      toast.error("Заполните название и email");
      return;
    }
    setIsCreatingCompany(true);
    try {
      const {
        error
      } = await supabase.from("organizations").insert({
        name: newCompanyName.trim(),
        email: newCompanyEmail.trim(),
        inn: newCompanyInn || null,
        contact_name: newCompanyContactName || null,
        phone: newCompanyPhone || null
      });
      if (error) throw error;
      toast.success("Компания создана");
      setShowAddCompanyDialog(false);
      setNewCompanyName("");
      setNewCompanyEmail("");
      setNewCompanyInn("");
      setNewCompanyContactName("");
      setNewCompanyPhone("");

      // Refresh
      setActiveTab("courses");
      setTimeout(() => setActiveTab("organizations"), 100);
    } catch (error) {
      console.error("Error creating company:", error);
      toast.error("Ошибка создания компании");
    } finally {
      setIsCreatingCompany(false);
    }
  };
  const handleEditCompany = (org: Organization) => {
    setEditingCompany(org);
    setEditCompanyName(org.name);
    setEditCompanyEmail(org.email);
    setEditCompanyInn(org.inn || "");
    setEditCompanyContactName(org.contact_name || "");
    setEditCompanyPhone(org.phone || "");
    setShowEditCompanyDialog(true);
  };
  const handleSaveCompany = async () => {
    if (!editingCompany) return;
    setIsSavingCompany(true);
    try {
      const {
        error
      } = await supabase.from("organizations").update({
        name: editCompanyName.trim(),
        email: editCompanyEmail.trim(),
        inn: editCompanyInn || null,
        contact_name: editCompanyContactName || null,
        phone: editCompanyPhone || null
      }).eq("id", editingCompany.id);
      if (error) throw error;
      toast.success("Компания обновлена");
      setShowEditCompanyDialog(false);
      setEditingCompany(null);

      // Refresh
      setActiveTab("courses");
      setTimeout(() => setActiveTab("organizations"), 100);
    } catch (error) {
      console.error("Error saving company:", error);
      toast.error("Ошибка сохранения");
    } finally {
      setIsSavingCompany(false);
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
                  <Button className="btn-gradient rounded-xl gap-2 text-xs lg:text-sm" onClick={() => setShowAddStudentDialog(true)}>
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
              isCreatingBulkCredentials={isCreatingBulkCredentials}
              isSendingBulkCredentials={isSendingBulkCredentials}
              isSendingBulkDocReminders={isSendingBulkDocReminders}
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
          {activeTab === "documents" && organizationId && <div className="space-y-4 lg:space-y-6">
              <div className="flex justify-end">
                <Button variant="outline" className="rounded-xl gap-2 text-xs lg:text-sm" onClick={() => setShowBulkUploadDialog(true)}>
                  <Users className="w-4 h-4" />
                  <span className="hidden sm:inline">Массовая загрузка ученикам</span>
                  <span className="sm:hidden">Массовая загрузка</span>
                </Button>
              </div>
              <OrgDocumentsManager organizationId={organizationId} />
            </div>}

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
        open={showAddStudentDialog}
        onOpenChange={setShowAddStudentDialog}
        courses={courses}
        companies={companies}
        onSubmit={async (name, email, courseId, companyId, noLogin) => {
          // Directly call create student logic with provided values
          if (!organizationId) return;
          if (!name.trim()) {
            toast.error("Введите ФИО");
            return;
          }
          if (!noLogin && !email.trim()) {
            toast.error("Введите email");
            return;
          }
          
          setIsCreatingStudent(true);
          try {
            const { data, error } = await supabase.functions.invoke('register-student', {
              body: {
                organizationId,
                fullName: name.trim(),
                email: email.trim() || null,
                courseId: courseId || null,
                companyId: companyId || null,
                noLogin: noLogin
              }
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            toast.success("Ученик успешно добавлен");
            setShowAddStudentDialog(false);
            setRefreshKey(prev => prev + 1);
          } catch (error: any) {
            console.error("Error creating student:", error);
            toast.error(error.message || "Ошибка создания ученика");
          } finally {
            setIsCreatingStudent(false);
          }
        }}
        isCreating={isCreatingStudent}
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
          if (!courseId) {
            toast.error("Выберите курс");
            return;
          }
          const userIds = getSelectedUserIds();
          if (userIds.length === 0) {
            toast.error("Выберите учеников");
            return;
          }
          setIsEnrolling(true);
          try {
            const { data: existingEnrollments } = await supabase
              .from("enrollments")
              .select("user_id")
              .eq("course_id", courseId)
              .in("user_id", userIds);
            const existingUserIds = new Set((existingEnrollments || []).map(e => e.user_id));
            const newUserIds = userIds.filter(id => !existingUserIds.has(id));
            if (newUserIds.length === 0) {
              toast.info("Все выбранные ученики уже зачислены на этот курс");
              setShowEnrollDialog(false);
              return;
            }
            const enrollmentsToInsert = newUserIds.map(userId => ({
              user_id: userId,
              course_id: courseId,
              status: "active",
              progress: 0
            }));
            const { error } = await supabase.from("enrollments").insert(enrollmentsToInsert);
            if (error) throw error;
            toast.success(`Зачислено ${newUserIds.length} учеников`);
            setShowEnrollDialog(false);
            setSelectedStudentIds(new Set());
            setRefreshKey(prev => prev + 1);
          } catch (error) {
            console.error("Error enrolling:", error);
            toast.error("Ошибка зачисления");
          } finally {
            setIsEnrolling(false);
          }
        }}
      />

      <CategoryDialog
        open={showCategoryDialog}
        onOpenChange={setShowCategoryDialog}
        isCreating={isCreatingCategory}
        onCreate={async (name, color) => {
          if (!organizationId || !name.trim()) return;
          setIsCreatingCategory(true);
          try {
            const { error } = await supabase.from("course_categories").insert({
              name: name.trim(),
              color,
              organization_id: organizationId
            });
            if (error) throw error;
            toast.success("Категория создана");
            setShowCategoryDialog(false);
            setRefreshKey(prev => prev + 1);
          } catch (error) {
            console.error("Error creating category:", error);
            toast.error("Ошибка создания категории");
          } finally {
            setIsCreatingCategory(false);
          }
        }}
      />

      <CourseDetailsModal
        open={showCourseDetailsModal}
        onOpenChange={setShowCourseDetailsModal}
        course={selectedCourseForDetails}
        courseStudents={courseStudents}
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
        open={showCourseStudentsDialog}
        onOpenChange={setShowCourseStudentsDialog}
        course={selectedCourse}
        courseStudents={courseStudents}
        availableStudents={availableStudentsForCourse}
        organizationId={organizationId}
        isLoading={isLoadingCourseStudents}
        selectedStudentsToAdd={selectedStudentsToAdd}
        onToggleStudentSelection={(userId) => {
          const newSet = new Set(selectedStudentsToAdd);
          if (newSet.has(userId)) {
            newSet.delete(userId);
          } else {
            newSet.add(userId);
          }
          setSelectedStudentsToAdd(newSet);
        }}
        onAddStudentsToCourse={handleAddStudentsToCourse}
        isAddingStudents={isAddingStudentsToCourse}
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
        courseTitle={selectedCourse?.title}
        isSending={isSendingInvitation}
        onSend={async (email) => {
          if (!selectedCourse) return;
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
                courseName: selectedCourse.title,
                courseId: selectedCourse.id,
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
        isCreatingCredentials={isCreatingCredentials}
        onCreateCredentials={handleCreateStudentCredentials}
        isSendingCredentials={isSendingCredentials}
        onSendCredentials={handleSendCredentials}
        isSendingCredentialsEmail={isSendingCredentialsEmail}
        onSendCredentialsEmail={handleSendCredentialsEmail}
        isDeletingStudent={isDeletingStudent}
        onDeleteStudent={handleDeleteStudentCompletely}
        onCopyCredentials={handleCopyCredentials}
      />

      <AddCompanyDialog
        open={showAddCompanyDialog}
        onOpenChange={setShowAddCompanyDialog}
        name={newCompanyName}
        onNameChange={setNewCompanyName}
        email={newCompanyEmail}
        onEmailChange={setNewCompanyEmail}
        inn={newCompanyInn}
        onInnChange={setNewCompanyInn}
        contactName={newCompanyContactName}
        onContactNameChange={setNewCompanyContactName}
        phone={newCompanyPhone}
        onPhoneChange={setNewCompanyPhone}
        isCreating={isCreatingCompany}
        onCreate={handleCreateCompany}
      />

      <EditCompanyDialog
        open={showEditCompanyDialog}
        onOpenChange={setShowEditCompanyDialog}
        name={editCompanyName}
        onNameChange={setEditCompanyName}
        email={editCompanyEmail}
        onEmailChange={setEditCompanyEmail}
        inn={editCompanyInn}
        onInnChange={setEditCompanyInn}
        contactName={editCompanyContactName}
        onContactNameChange={setEditCompanyContactName}
        phone={editCompanyPhone}
        onPhoneChange={setEditCompanyPhone}
        isSaving={isSavingCompany}
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
        open={showStudentCoursesDialog}
        onOpenChange={setShowStudentCoursesDialog}
        student={selectedStudentForCourses}
        isLoading={isLoadingStudentCourses}
        studentEnrollments={studentEnrollments}
        availableCourses={availableCoursesForStudent}
        selectedCoursesToAdd={selectedCoursesToAdd}
        searchQuery={studentCoursesSearchQuery}
        onSearchQueryChange={setStudentCoursesSearchQuery}
        onToggleCourseSelection={toggleCourseSelection}
        isAddingCourses={isAddingCoursesToStudent}
        onAddCourses={handleAddCoursesToStudent}
        onRemoveEnrollment={handleRemoveStudentFromCourse}
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
          isOpen={showStudentDetailCard}
          onOpenChange={setShowStudentDetailCard}
          student={studentDetailCardData}
          organizationId={organizationId}
          enrollments={studentDetailCardEnrollments}
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