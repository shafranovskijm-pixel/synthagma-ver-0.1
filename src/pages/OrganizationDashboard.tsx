import { useState, useEffect } from "react";
import ImportStudentsForm from "@/components/ImportStudentsForm";
import { useNavigate } from "react-router-dom";
import { OrgDocumentsManager } from "@/components/organization/OrgDocumentsManager";
import { CourseDocumentsManager } from "@/components/organization/CourseDocumentsManager";
import { StudentDocumentsManager } from "@/components/organization/StudentDocumentsManager";
import { BulkDocumentUpload } from "@/components/organization/BulkDocumentUpload";
import { EnrollmentHistory } from "@/components/organization/EnrollmentHistory";
import { CourseTestReport } from "@/components/organization/CourseTestReport";
import { CompaniesManager } from "@/components/organization/CompaniesManager";
import { LibraryManager } from "@/components/organization/LibraryManager";
import { ServicesManager } from "@/components/organization/ServicesManager";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import {
  GraduationCap,
  BookOpen,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Plus,
  Upload,
  FileSpreadsheet,
  Search,
  Eye,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Edit,
  Trash2,
  FileText,
  Download,
  X,
  ChevronRight,
  Link,
  Copy,
  Building2,
  Save,
  Send,
  FileCheck,
  Receipt,
  CheckSquare,
  LayoutGrid,
  List,
  Filter,
  Tag,
  Palette,
  History,
  Moon,
  Sun,
  Library,
  Trophy,
  MessageCircle,
  Image,
  ExternalLink,
  ShoppingBag,
  Mail,
  Key,
  Menu
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface RegistrationLink {
  id: string;
  token: string;
  name: string | null;
  inn: string | null;
  expires_at: string | null;
  used_count: number;
  created_at: string;
}

interface Company {
  id: string;
  name: string;
  inn: string | null;
}

export default function OrganizationDashboard() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const [activeTab, setActiveTab] = useState<"courses" | "organizations" | "students" | "library" | "stats" | "links" | "documents" | "services" | "settings">("courses");
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
  const [selectedExistingStudentId, setSelectedExistingStudentId] = useState<string>("");
  const [isEnrollingExisting, setIsEnrollingExisting] = useState(false);
  const [noLoginStudent, setNoLoginStudent] = useState(false);
  
  // Admin view mode
  const [isAdminView, setIsAdminView] = useState(false);
  const [adminViewOrgId, setAdminViewOrgId] = useState<string | null>(null);

  // Organizations state
  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [showOrgDetails, setShowOrgDetails] = useState(false);
  const [orgDocuments, setOrgDocuments] = useState<{ id: string; type: string; name: string; file_url: string | null; created_at: string }[]>([]);
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
  const [studentCompanyId, setStudentCompanyId] = useState<string>("");
  const [isSavingStudentCompany, setIsSavingStudentCompany] = useState(false);
  const [isSendingCredentials, setIsSendingCredentials] = useState(false);
  const [isSendingCredentialsEmail, setIsSendingCredentialsEmail] = useState(false);
  const [isSendingBulkCredentials, setIsSendingBulkCredentials] = useState(false);
  const [isCreatingCredentials, setIsCreatingCredentials] = useState(false);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);
  const [isCreatingBulkCredentials, setIsCreatingBulkCredentials] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [registrationLinks, setRegistrationLinks] = useState<RegistrationLink[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
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
  const [studentEnrollments, setStudentEnrollments] = useState<{course: Course; enrollment_id: string; progress: number; status: string}[]>([]);
  const [availableCoursesForStudent, setAvailableCoursesForStudent] = useState<Course[]>([]);
  const [selectedCoursesToAdd, setSelectedCoursesToAdd] = useState<Set<string>>(new Set());
  const [isLoadingStudentCourses, setIsLoadingStudentCourses] = useState(false);
  const [isAddingCoursesToStudent, setIsAddingCoursesToStudent] = useState(false);
  const [studentCoursesSearchQuery, setStudentCoursesSearchQuery] = useState("");

  // All profiles (students without enrollments)
  const [allProfiles, setAllProfiles] = useState<Student[]>([]);

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
  
  // Refresh trigger for data reload
  const [refreshKey, setRefreshKey] = useState(0);

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
    showDocuments: false
  });

  // Branding settings
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
        const { data, error } = await supabase
          .from('organizations')
          .select('student_dashboard_settings')
          .eq('id', organizationId)
          .single();
        
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
        const { data, error } = await supabase
          .from('organizations')
          .select('branding')
          .eq('id', organizationId)
          .single();
        
        if (error) throw error;
        
        if (data?.branding && typeof data.branding === 'object') {
          const branding = data.branding as Record<string, unknown>;
          setBrandingSettings({
            coverUrl: (branding.coverUrl as string) || '',
            primaryColor: (branding.primaryColor as string) || '#6366f1',
            secondaryColor: (branding.secondaryColor as string) || '#8b5cf6',
            logoUrl: (branding.logoUrl as string) || '',
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

      const { error: uploadError } = await supabase.storage
        .from('org-branding')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('org-branding')
        .getPublicUrl(filePath);

      setBrandingSettings(prev => ({ ...prev, coverUrl: publicUrl }));
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

      const { error: uploadError } = await supabase.storage
        .from('org-branding')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('org-branding')
        .getPublicUrl(filePath);

      setBrandingSettings(prev => ({ ...prev, logoUrl: publicUrl }));
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
      const { error } = await supabase
        .from('organizations')
        .update({ branding: brandingSettings })
        .eq('id', organizationId);

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
          const { data: profile } = await supabase
            .from("profiles")
            .select("organization_id")
            .eq("user_id", user.id)
            .single();

          if (!profile?.organization_id) {
            setIsLoadingCourses(false);
            return;
          }

          orgId = profile.organization_id;

          const { data: orgData } = await supabase
            .from("organizations")
            .select("name")
            .eq("id", orgId)
            .single();

          if (orgData) {
            setOrganizationName(orgData.name);
          }
        }
        
        setOrganizationId(orgId);

        // Fetch courses
        const { data: coursesData, error } = await supabase
          .from("courses")
          .select(`*, lessons(count)`)
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const courseIds = (coursesData || []).map((c: any) => c.id);

        // Get enrollments
        let allEnrollments: any[] = [];
        if (courseIds.length > 0) {
          const { data: enrollmentsData } = await supabase
            .from("enrollments")
            .select("*")
            .in("course_id", courseIds);
          allEnrollments = enrollmentsData || [];
        }

        // Fetch students
        const { data: allProfilesData } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, email, login, generated_password")
          .eq("organization_id", orgId);

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
        const averageProgress = allEnrollments.length > 0
          ? Math.round(allEnrollments.reduce((sum, e) => sum + (e.progress || 0), 0) / allEnrollments.length)
          : 0;

        setStats({ totalStudents, totalCourses, completedCount, averageProgress });

        // Fetch categories
        const { data: categoriesData } = await supabase
          .from("course_categories")
          .select("*")
          .eq("organization_id", orgId)
          .order("name");

        setCategories(categoriesData || []);

        // Fetch companies
        const { data: companiesData } = await supabase
          .from("companies")
          .select("id, name, inn")
          .eq("organization_id", orgId)
          .order("name");

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
            category_id: course.category_id,
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
        const { data: orgs, error } = await supabase
          .from("organizations")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;

        const orgsWithStats = await Promise.all((orgs || []).map(async (org) => {
          const { count: orgCoursesCount } = await supabase
            .from("courses")
            .select("*", { count: "exact", head: true })
            .eq("organization_id", org.id);

          const { data: profiles } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", org.id);

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

  // Fetch registration links
  useEffect(() => {
    const fetchLinks = async () => {
      if (!organizationId || activeTab !== "links") return;

      setIsLoadingLinks(true);
      try {
        const { data, error } = await supabase
          .from("registration_links")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setRegistrationLinks(data || []);
      } catch (error) {
        console.error("Error fetching links:", error);
      } finally {
        setIsLoadingLinks(false);
      }
    };

    fetchLinks();
  }, [organizationId, activeTab]);

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

      const { error } = await supabase
        .from("registration_links")
        .insert({
          organization_id: organizationId,
          token,
          name: newLinkCompanyName || null,
          inn: newLinkInn || null
        });

      if (error) throw error;

      const { data } = await supabase
        .from("registration_links")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      setRegistrationLinks(data || []);
      setShowCreateLinkDialog(false);
      setNewLinkCompanyName("");
      setNewLinkInn("");
      toast.success("Ссылка для регистрации создана");
    } catch (error) {
      console.error("Error creating link:", error);
      toast.error("Ошибка создания ссылки");
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    try {
      const { error } = await supabase
        .from("registration_links")
        .delete()
        .eq("id", linkId);

      if (error) throw error;

      setRegistrationLinks(registrationLinks.filter(l => l.id !== linkId));
      toast.success("Ссылка удалена");
    } catch (error) {
      console.error("Error deleting link:", error);
      toast.error("Ошибка удаления");
    }
  };

  const copyLinkToClipboard = (token: string) => {
    const url = `${window.location.origin}/join/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Ссылка скопирована");
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

      const { data, error } = await supabase.functions.invoke("register-student", {
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
      const existsInList = students.some(s => s.user_id === data.user_id) || 
                           allProfiles.some(s => s.user_id === data.user_id);
      
      if (data.is_no_login || !data.is_existing) {
        // New student (with or without login) - add to lists
        setStudents(prev => [...prev, newStudent]);
        setAllProfiles(prev => [...prev, newStudent]);
        setStats(prev => ({ ...prev, totalStudents: prev.totalStudents + 1 }));
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
      const { data: existingEnrollment } = await supabase
        .from("enrollments")
        .select("id")
        .eq("user_id", selectedExistingStudentId)
        .eq("course_id", selectedCourseId)
        .single();

      if (existingEnrollment) {
        toast.error("Ученик уже зачислен на этот курс");
        return;
      }

      const { data: enrollment, error } = await supabase
        .from("enrollments")
        .insert({
          user_id: selectedExistingStudentId,
          course_id: selectedCourseId,
          status: "active",
          progress: 0
        })
        .select()
        .single();

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
      const { error } = await supabase
        .from("enrollments")
        .delete()
        .eq("id", enrollmentId);

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
      const { data: existingEnrollments } = await supabase
        .from("enrollments")
        .select("user_id")
        .eq("course_id", enrollCourseId)
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
        course_id: enrollCourseId,
        status: "active",
        progress: 0
      }));

      const { error } = await supabase
        .from("enrollments")
        .insert(enrollmentsToInsert);

      if (error) throw error;

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
      const { error } = await supabase
        .from("enrollments")
        .delete()
        .in("id", enrollmentIds);

      if (error) throw error;

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
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("id, user_id, progress, status")
        .eq("course_id", course.id);

      const enrolledStudentIds = new Set((enrollments || []).map(e => e.user_id));

      const enrolledList: Student[] = [];
      for (const enrollment of enrollments || []) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, email, login, generated_password")
          .eq("user_id", enrollment.user_id)
          .single();

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
        const { data: allProfiles } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, email, login, generated_password")
          .eq("organization_id", organizationId);

        const available = (allProfiles || [])
          .filter(p => !enrolledStudentIds.has(p.user_id))
          .map(p => ({
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
      const { data: existingEnrollments } = await supabase
        .from("enrollments")
        .select("user_id")
        .eq("course_id", selectedCourse.id)
        .in("user_id", userIds);

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

      const { error } = await supabase
        .from("enrollments")
        .insert(enrollmentsToInsert);

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
      const { error } = await supabase
        .from("enrollments")
        .delete()
        .eq("id", enrollmentId);

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
      const { data: enrollmentsData, error: enrollmentsError } = await supabase
        .from("enrollments")
        .select("id, course_id, progress, status")
        .eq("user_id", student.user_id);

      if (enrollmentsError) throw enrollmentsError;

      const enrolledCourseIds = new Set((enrollmentsData || []).map(e => e.course_id));

      // Get course details for enrolled courses
      const enrolledList: {course: Course; enrollment_id: string; progress: number; status: string}[] = [];
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
      const availableCourses = courses.filter(c => 
        c.is_published && !enrolledCourseIds.has(c.id)
      );
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

      const { error } = await supabase
        .from("enrollments")
        .insert(enrollmentsToInsert);

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
      const { error } = await supabase
        .from("enrollments")
        .delete()
        .eq("id", enrollmentId);

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
      const { data, error } = await supabase.functions.invoke("send-course-invitation", {
        body: {
          email: inviteEmail.trim(),
          courseName: selectedCourse.title,
          courseId: selectedCourse.id,
          organizationName: organizationName,
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
      const { data, error } = await supabase
        .from("course_categories")
        .insert({
          organization_id: organizationId,
          name: newCategoryName.trim(),
          color: newCategoryColor
        })
        .select()
        .single();

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
      const { error } = await supabase
        .from("courses")
        .update({ category_id: categoryId })
        .eq("id", courseId);

      if (error) throw error;

      setCourses(courses.map(c =>
        c.id === courseId ? { ...c, category_id: categoryId } : c
      ));
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
      const { error } = await supabase
        .from("profiles")
        .update({ company_id: studentCompanyId })
        .eq("user_id", selectedStudent.student.user_id);

      if (error) throw error;

      toast.success("Ученик прикреплён к компании");
      // Update local state
      setStudents(prev => prev.map(s => 
        s.user_id === selectedStudent.student.user_id 
          ? { ...s, company_id: studentCompanyId } 
          : s
      ));
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
      const { data, error } = await supabase.functions.invoke("send-credentials", {
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
    const studentsToSend = students.filter(
      s => selectedStudentIds.has(s.user_id) && s.login && s.generated_password && s.email
    );

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
          const { error } = await supabase.functions.invoke("send-credentials", {
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

  // Generate login and password for student without credentials
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
      let baseLogin = nameParts.length >= 2 
        ? nameParts[0].replace(/[^a-zа-яё]/gi, '').substring(0, 10) + '_' + nameParts[1].replace(/[^a-zа-яё]/gi, '').substring(0, 2)
        : nameParts[0].replace(/[^a-zа-яё]/gi, '').substring(0, 12);
      
      // Transliterate Russian characters
      const translit: Record<string, string> = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
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
      const { error } = await supabase
        .from("profiles")
        .update({
          login,
          generated_password: password
        })
        .eq("user_id", student.user_id);

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
      setStudents(prev => prev.map(s => 
        s.user_id === student.user_id 
          ? { ...s, login, generated_password: password }
          : s
      ));
      setAllProfiles(prev => prev.map(s => 
        s.user_id === student.user_id 
          ? { ...s, login, generated_password: password }
          : s
      ));

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
      await supabase
        .from("enrollments")
        .delete()
        .eq("user_id", student.user_id);

      // Delete profile
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("user_id", student.user_id);

      if (error) throw error;

      // Update local state
      setStudents(prev => prev.filter(s => s.user_id !== student.user_id));
      setAllProfiles(prev => prev.filter(s => s.user_id !== student.user_id));
      setStats(prev => ({ ...prev, totalStudents: Math.max(0, prev.totalStudents - 1) }));
      
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
    const studentsToCreate = students.filter(
      s => selectedStudentIds.has(s.enrollment_id || s.user_id) && !s.login
    );

    if (studentsToCreate.length === 0) {
      toast.info("У всех выбранных учеников уже есть логин и пароль");
      return;
    }

    setIsCreatingBulkCredentials(true);
    let successCount = 0;
    let errorCount = 0;
    const createdCredentials: Array<{ name: string; login: string; password: string }> = [];

    // Transliteration map
    const translit: Record<string, string> = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
      'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
      'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
      'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
      'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    };

    try {
      for (const student of studentsToCreate) {
        try {
          // Generate login from name
          const nameParts = student.name.toLowerCase().split(/\s+/);
          let baseLogin = nameParts.length >= 2 
            ? nameParts[0].replace(/[^a-zа-яё]/gi, '').substring(0, 10) + '_' + nameParts[1].replace(/[^a-zа-яё]/gi, '').substring(0, 2)
            : nameParts[0].replace(/[^a-zа-яё]/gi, '').substring(0, 12);
          
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
          const { error } = await supabase
            .from("profiles")
            .update({
              login,
              generated_password: password
            })
            .eq("user_id", student.user_id);

          if (error) throw error;

          createdCredentials.push({ name: student.name, login, password });
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
        return creds ? { ...s, login: creds.login, generated_password: creds.password } : s;
      }));
      setAllProfiles(prev => prev.map(s => {
        const creds = createdCredentials.find(c => c.name === s.name && !s.login);
        return creds ? { ...s, login: creds.login, generated_password: creds.password } : s;
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

  // View student details
  const handleViewStudent = async (student: Student) => {
    setShowStudentDialog(true);
    setIsLoadingStudentDetails(true);

    try {
      let docs: any[] = [];
      if (student.enrollment_id) {
        const { data } = await supabase
          .from("student_documents")
          .select("*")
          .eq("enrollment_id", student.enrollment_id);
        docs = data || [];
      }

      const { data: attempts } = await supabase
        .from("test_attempts")
        .select("*")
        .eq("user_id", student.user_id)
        .order("completed_at", { ascending: false });

      const lessonIds = [...new Set((attempts || []).map(a => a.lesson_id))];
      const testAttemptsWithTitles: TestAttempt[] = [];

      for (const attempt of attempts || []) {
        const { data: lesson } = await supabase
          .from("lessons")
          .select("title, course_id")
          .eq("id", attempt.lesson_id)
          .single();

        if (lesson) {
          const { data: course } = await supabase
            .from("courses")
            .select("organization_id")
            .eq("id", lesson.course_id)
            .single();

          if (course?.organization_id === organizationId) {
            testAttemptsWithTitles.push({
              id: attempt.id,
              lesson_id: attempt.lesson_id,
              lesson_title: lesson.title,
              score: attempt.score,
              max_score: attempt.max_score,
              completed_at: attempt.completed_at,
              answers: attempt.answers as Record<string, number>
            });
          }
        }
      }

      const questionsMap: Record<string, TestQuestion[]> = {};
      for (const lessonId of lessonIds) {
        const { data: questions } = await supabase
          .from("test_questions")
          .select("*")
          .eq("lesson_id", lessonId)
          .order("order_index");

        if (questions) {
          questionsMap[lessonId] = questions.map(q => ({
            id: q.id,
            question: q.question,
            options: q.options as string[],
            correct_answer: q.correct_answer,
            order_index: q.order_index
          }));
        }
      }

      setTestQuestions(questionsMap);
      setSelectedStudent({
        student,
        documents: (docs || []).map(d => ({
          id: d.id,
          type: d.type,
          name: d.name,
          file_url: d.file_url
        })),
        testAttempts: testAttemptsWithTitles
      });
    } catch (error) {
      console.error("Error fetching student details:", error);
      toast.error("Ошибка загрузки данных ученика");
    } finally {
      setIsLoadingStudentDetails(false);
    }
  };

  // Company management
  const handleCreateCompany = async () => {
    if (!newCompanyName.trim() || !newCompanyEmail.trim()) {
      toast.error("Заполните название и email");
      return;
    }

    setIsCreatingCompany(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .insert({
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
      const { error } = await supabase
        .from("organizations")
        .update({
          name: editCompanyName.trim(),
          email: editCompanyEmail.trim(),
          inn: editCompanyInn || null,
          contact_name: editCompanyContactName || null,
          phone: editCompanyPhone || null
        })
        .eq("id", editingCompany.id);

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
      const { data: docs } = await supabase
        .from("org_documents")
        .select("*")
        .eq("organization_id", org.id)
        .order("created_at", { ascending: false });

      setOrgDocuments(docs || []);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, login, generated_password")
        .eq("organization_id", org.id);

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
  const filteredOrganizations = allOrganizations.filter(org =>
    org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    org.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (org.inn && org.inn.includes(searchQuery))
  );

  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (studentStatusFilter === "all") return true;
    if (studentStatusFilter === "active") return s.status === "active";
    if (studentStatusFilter === "completed") return s.status === "completed";
    if (studentStatusFilter === "not_enrolled") return !s.course_id;

    return true;
  });

  const filteredCourses = courses.filter(course => {
    const matchesSearch = course.title.toLowerCase().includes(courseSearchQuery.toLowerCase());
    const matchesFilter = courseFilter === "all" ||
      (courseFilter === "published" && course.is_published) ||
      (courseFilter === "draft" && !course.is_published);
    const matchesCategory = selectedCategoryFilter === "all" ||
      (selectedCategoryFilter === "none" && !course.category_id) ||
      course.category_id === selectedCategoryFilter;

    return matchesSearch && matchesFilter && matchesCategory;
  });

  const exitAdminView = () => {
    localStorage.removeItem("adminViewAsOrg");
    navigate("/admin");
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Admin View Banner */}
      {isAdminView && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground py-2 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span className="text-sm font-medium">Режим просмотра: {organizationName}</span>
          </div>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={exitAdminView}
            className="gap-1"
          >
            <X className="w-3 h-3" />
            Выйти
          </Button>
        </div>
      )}
      
      {/* Mobile Overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`fixed left-0 w-64 bg-card border-r border-border flex flex-col h-screen z-50 transition-transform duration-300 ${isAdminView ? 'top-10' : 'top-0'} ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="p-6 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <SigmaLogo size="md" />
            <button 
              onClick={() => setIsMobileSidebarOpen(false)}
              className="lg:hidden p-2 rounded-lg hover:bg-secondary"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-4 p-3 bg-secondary rounded-xl">
            <div className="font-semibold text-sm">{organizationName}</div>
            <div className="text-xs text-muted-foreground">
              {isAdminView ? "Просмотр от имени" : "Организация"}
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <div className="space-y-1">
            <button
              onClick={() => { setActiveTab("courses"); setIsMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                activeTab === "courses"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <BookOpen className="w-5 h-5" />
              Курсы
            </button>
            <button
              onClick={() => { setActiveTab("organizations"); setIsMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                activeTab === "organizations"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Building2 className="w-5 h-5" />
              Компании
            </button>
            <button
              onClick={() => { setActiveTab("students"); setIsMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                activeTab === "students"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Users className="w-5 h-5" />
              Ученики
            </button>
            <button
              onClick={() => { setActiveTab("library"); setIsMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                activeTab === "library"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Library className="w-5 h-5" />
              Библиотека
            </button>
            {menuSettings.showStats && (
              <button
                onClick={() => { setActiveTab("stats"); setIsMobileSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                  activeTab === "stats"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                <BarChart3 className="w-5 h-5" />
                Статистика
              </button>
            )}
            {menuSettings.showLinks && (
              <button
                onClick={() => { setActiveTab("links"); setIsMobileSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                  activeTab === "links"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                <Link className="w-5 h-5" />
                Ссылки регистрации
              </button>
            )}
            {menuSettings.showDocuments && (
              <button
                onClick={() => { setActiveTab("documents"); setIsMobileSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                  activeTab === "documents"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
              <FileText className="w-5 h-5" />
              Документы
            </button>
            )}
            <button
              onClick={() => { setActiveTab("services"); setIsMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                activeTab === "services"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <ShoppingBag className="w-5 h-5" />
              Услуги
            </button>
            <button
              onClick={() => { setActiveTab("settings"); setIsMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                activeTab === "settings"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Settings className="w-5 h-5" />
              Настройки
            </button>
          </div>
        </nav>

        <div className="p-4 border-t border-border flex-shrink-0 bg-card">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Выйти
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 overflow-auto lg:ml-64 ${isAdminView ? 'mt-10' : ''}`}>
        {/* Header */}
        <header className="bg-card border-b border-border px-4 lg:px-8 py-4 lg:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMobileSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-secondary"
              >
                <Menu className="w-6 h-6" />
              </button>
              <div>
                <h1 className="font-display text-xl lg:text-2xl font-bold">
                  {activeTab === "courses" && "Управление курсами"}
                  {activeTab === "organizations" && "Компании"}
                  {activeTab === "students" && "Все ученики"}
                  {activeTab === "library" && "Библиотека материалов"}
                  {activeTab === "stats" && "Статистика обучения"}
                  {activeTab === "links" && "Ссылки для регистрации"}
                  {activeTab === "documents" && "Документооборот"}
                  {activeTab === "services" && "Услуги"}
                  {activeTab === "settings" && "Настройки"}
                </h1>
                <p className="text-muted-foreground text-sm lg:text-base">{organizationName}</p>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap">
              {activeTab === "links" && (
                <Dialog open={showCreateLinkDialog} onOpenChange={setShowCreateLinkDialog}>
                  <DialogTrigger asChild>
                    <Button className="btn-gradient rounded-xl gap-2">
                      <Plus className="w-4 h-4" />
                      Создать ссылку
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-2xl">
                    <DialogHeader>
                      <DialogTitle className="font-display">Создать ссылку регистрации</DialogTitle>
                      <DialogDescription>
                        Ученики, зарегистрировавшиеся по этой ссылке, автоматически привяжутся к вашей организации
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Название компании</Label>
                        <Input
                          placeholder="ООО Пример"
                          className="rounded-xl"
                          value={newLinkCompanyName}
                          onChange={(e) => setNewLinkCompanyName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>ИНН компании</Label>
                        <Input
                          placeholder="1234567890"
                          className="rounded-xl"
                          value={newLinkInn}
                          onChange={(e) => setNewLinkInn(e.target.value)}
                        />
                      </div>
                      <Button
                        className="w-full btn-gradient rounded-xl"
                        onClick={handleCreateRegistrationLink}
                        disabled={isCreatingLink}
                      >
                        {isCreatingLink ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Создание...
                          </>
                        ) : (
                          "Создать ссылку"
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {activeTab === "organizations" && (
                <Button className="btn-gradient rounded-xl gap-2" onClick={() => setShowAddCompanyDialog(true)}>
                  <Plus className="w-4 h-4" />
                  Добавить компанию
                </Button>
              )}
              {activeTab === "students" && (
                <>
                  <Button variant="outline" className="rounded-xl gap-2" onClick={() => setShowImportDialog(true)}>
                    <FileSpreadsheet className="w-4 h-4" />
                    Импорт учеников
                  </Button>
                  <Button className="btn-gradient rounded-xl gap-2" onClick={() => setShowAddStudentDialog(true)}>
                    <Plus className="w-4 h-4" />
                    Добавить ученика
                  </Button>
                </>
              )}
              {activeTab === "courses" && (
                <>
                  <Button variant="outline" className="rounded-xl gap-2" onClick={() => navigate("/course-import")}>
                    <Upload className="w-4 h-4" />
                    Импорт курса
                  </Button>
                  <Button className="btn-gradient rounded-xl gap-2" onClick={() => navigate("/course-builder")}>
                    <Plus className="w-4 h-4" />
                    Создать курс
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="p-8">
          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-card rounded-2xl p-6 border border-border">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold font-display">{stats.totalStudents}</div>
                  <div className="text-muted-foreground text-sm">Учеников</div>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-2xl p-6 border border-border">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <div className="text-2xl font-bold font-display">{stats.totalCourses}</div>
                  <div className="text-muted-foreground text-sm">Курсов</div>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-2xl p-6 border border-border">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-sigma-green/10 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-sigma-green" />
                </div>
                <div>
                  <div className="text-2xl font-bold font-display">{stats.completedCount}</div>
                  <div className="text-muted-foreground text-sm">Завершили</div>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-2xl p-6 border border-border">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-sigma-orange/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-sigma-orange" />
                </div>
                <div>
                  <div className="text-2xl font-bold font-display">{stats.averageProgress}%</div>
                  <div className="text-muted-foreground text-sm">Ср. прогресс</div>
                </div>
              </div>
            </div>
          </div>

          {/* Courses Tab */}
          {activeTab === "courses" && (
            <div className="space-y-6">
              <div className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Поиск курсов..."
                        value={courseSearchQuery}
                        onChange={(e) => setCourseSearchQuery(e.target.value)}
                        className="pl-10 w-64 rounded-xl"
                      />
                    </div>
                    <Select value={courseFilter} onValueChange={(v) => setCourseFilter(v as any)}>
                      <SelectTrigger className="w-40 rounded-xl">
                        <Filter className="w-4 h-4 mr-2" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все курсы</SelectItem>
                        <SelectItem value="published">Опубликованные</SelectItem>
                        <SelectItem value="draft">Черновики</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={selectedCategoryFilter} onValueChange={setSelectedCategoryFilter}>
                      <SelectTrigger className="w-48 rounded-xl">
                        <Tag className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Категория" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все категории</SelectItem>
                        <SelectItem value="none">Без категории</SelectItem>
                        {categories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                              {cat.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg gap-1"
                      onClick={() => setShowCategoryDialog(true)}
                    >
                      <Plus className="w-4 h-4" />
                      Категория
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={courseViewMode === "grid" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => setCourseViewMode("grid")}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </Button>
                    <Button
                      variant={courseViewMode === "list" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => setCourseViewMode("list")}
                    >
                      <List className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {isLoadingCourses ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : filteredCourses.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Нет курсов</p>
                </div>
              ) : courseViewMode === "grid" ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredCourses.map((course) => (
                    <div
                      key={course.id}
                      className="bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={() => navigate(`/course-preview/${course.id}`)}
                    >
                      <div className="h-32 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                        <BookOpen className="w-12 h-12 text-primary/50" />
                      </div>
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-display font-semibold text-lg line-clamp-1">{course.title}</h3>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            course.is_published
                              ? 'bg-sigma-green/10 text-sigma-green'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {course.is_published ? 'Опубликован' : 'Черновик'}
                          </span>
                        </div>
                        {course.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{course.description}</p>
                        )}
                        {getCategoryById(course.category_id) && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white mb-3"
                            style={{ backgroundColor: getCategoryById(course.category_id)?.color }}
                          >
                            {getCategoryById(course.category_id)?.name}
                          </span>
                        )}
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {course.studentsCount}
                          </div>
                          <div className="flex items-center gap-1">
                            <BookOpen className="w-4 h-4" />
                            {course.lessonsCount} уроков
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="flex-1 rounded-xl gap-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenCourseStudents(course);
                            }}
                          >
                            <Users className="w-4 h-4" />
                            Ученики
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1 rounded-xl gap-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCourseForDocs(course);
                              setShowCourseDocsDialog(true);
                            }}
                          >
                            <FileText className="w-4 h-4" />
                            Материалы
                          </Button>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button
                            variant="outline"
                            className="flex-1 rounded-xl gap-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/course-builder/${course.id}`);
                            }}
                          >
                            <Edit className="w-4 h-4" />
                            Редактировать
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-card rounded-2xl border border-border overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Курс</th>
                        <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Категория</th>
                        <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Статус</th>
                        <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Ученики</th>
                        <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Уроки</th>
                        <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCourses.map((course) => (
                        <tr
                          key={course.id}
                          className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors cursor-pointer"
                          onClick={() => navigate(`/course-preview/${course.id}`)}
                        >
                          <td className="px-6 py-4">
                            <div>
                              <div className="font-medium">{course.title}</div>
                              {course.description && (
                                <div className="text-sm text-muted-foreground line-clamp-1">{course.description}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {getCategoryById(course.category_id) ? (
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getCategoryById(course.category_id)?.color }} />
                                <span className="text-sm">{getCategoryById(course.category_id)?.name}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                              course.is_published
                                ? 'bg-sigma-green/10 text-sigma-green'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              {course.is_published ? 'Опубликован' : 'Черновик'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                              <Users className="w-3 h-3" />
                              {course.studentsCount}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent">
                              <BookOpen className="w-3 h-3" />
                              {course.lessonsCount}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/course-builder/${course.id}`);
                                }}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/course-preview/${course.id}`);
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Organizations/Companies Tab */}
          {activeTab === "organizations" && organizationId && (
            <CompaniesManager organizationId={organizationId} />
          )}

          {/* Students Tab */}
          {activeTab === "students" && (
            <div className="bg-card rounded-2xl border border-border">
              <div className="p-6 border-b border-border flex items-center justify-between flex-wrap gap-4">
                <h2 className="font-display text-xl font-semibold">Все ученики</h2>
                <div className="flex items-center gap-3 flex-wrap">
                  {selectedStudentIds.size > 0 && (
                    <>
                      <Button onClick={() => setShowEnrollDialog(true)} className="btn-gradient rounded-xl gap-2">
                        <GraduationCap className="w-4 h-4" />
                        Зачислить на курс ({selectedStudentIds.size})
                      </Button>
                      <Button 
                        onClick={handleBulkCreateCredentials} 
                        variant="outline"
                        className="rounded-xl gap-2"
                        disabled={isCreatingBulkCredentials}
                      >
                        {isCreatingBulkCredentials ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Key className="w-4 h-4" />
                        )}
                        Создать логины
                      </Button>
                      <Button 
                        onClick={handleBulkSendCredentials} 
                        variant="outline"
                        className="rounded-xl gap-2"
                        disabled={isSendingBulkCredentials}
                      >
                        {isSendingBulkCredentials ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Mail className="w-4 h-4" />
                        )}
                        Отправить на почту
                      </Button>
                      {getSelectedEnrollmentsCount() > 0 && (
                        <Button 
                          onClick={() => setShowUnenrollConfirm(true)} 
                          variant="outline"
                          className="rounded-xl gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <XCircle className="w-4 h-4" />
                          Отчислить ({getSelectedEnrollmentsCount()})
                        </Button>
                      )}
                    </>
                  )}
                  <Button
                    variant="outline"
                    className="rounded-xl gap-2"
                    onClick={() => {
                      import('xlsx').then(XLSX => {
                        const exportData = filteredStudents.map(s => ({
                          'ФИО': s.name,
                          'Email': s.email || '',
                          'Логин': s.login || '',
                          'Пароль': s.generated_password || '',
                          'Курс': s.course || 'Не зачислен',
                          'Прогресс (%)': s.progress,
                          'Статус': s.status === 'completed' ? 'Завершил' : s.status === 'active' ? 'Активный' : '—'
                        }));
                        const ws = XLSX.utils.json_to_sheet(exportData);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, 'Ученики');
                        XLSX.writeFile(wb, `ученики_${new Date().toISOString().split('T')[0]}.xlsx`);
                        toast.success('Список учеников экспортирован');
                      });
                    }}
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Экспорт
                  </Button>
                  <Select value={studentStatusFilter} onValueChange={(v) => setStudentStatusFilter(v as any)}>
                    <SelectTrigger className="w-44 rounded-xl">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все статусы</SelectItem>
                      <SelectItem value="active">Активные</SelectItem>
                      <SelectItem value="completed">Завершили</SelectItem>
                      <SelectItem value="not_enrolled">Не зачислены</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Поиск по имени или email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 w-64 rounded-xl"
                    />
                  </div>
                </div>
              </div>

              {isLoadingStudents ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Нет учеников</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-4 text-sm font-medium text-muted-foreground w-12">
                          <input
                            type="checkbox"
                            checked={filteredStudents.length > 0 && filteredStudents.every(s => selectedStudentIds.has(s.enrollment_id || s.user_id))}
                            onChange={() => toggleSelectAll(filteredStudents)}
                            className="w-4 h-4 rounded border-border"
                          />
                        </th>
                        <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Ученик</th>
                        <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Курс</th>
                        <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Прогресс</th>
                        <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Статус</th>
                        <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student) => {
                        const uniqueId = student.enrollment_id || student.user_id;
                        const isSelected = selectedStudentIds.has(uniqueId);

                        return (
                          <tr 
                            key={uniqueId} 
                            className={`border-b border-border last:border-0 hover:bg-secondary/50 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`}
                            onClick={() => handleViewStudent(student)}
                          >
                            <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleStudentSelection(uniqueId)}
                                className="w-4 h-4 rounded border-border"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <div>
                                <div className="font-medium">{student.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {student.login ? (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="inline-flex items-center gap-2">
                                        <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs font-mono">{student.login}</span>
                                        {student.generated_password && (
                                          <span className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded text-xs font-mono">{student.generated_password}</span>
                                        )}
                                        {student.login && student.generated_password && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleCopyCredentials(student.login!, student.generated_password!);
                                            }}
                                            className="p-1 hover:bg-muted rounded transition-colors"
                                            title="Копировать логин и пароль"
                                          >
                                            <Copy className="w-3 h-3 text-muted-foreground" />
                                          </button>
                                        )}
                                      </span>
                                      {student.email && <span className="text-muted-foreground/50 text-xs">{student.email}</span>}
                                    </div>
                                  ) : (
                                    student.email
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm">
                              {student.course || <span className="text-muted-foreground italic">Не зачислен</span>}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <Progress value={student.progress} className="w-20 h-2" />
                                <span className="text-sm font-medium">{student.progress}%</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                                student.status === 'completed'
                                  ? 'bg-sigma-green/10 text-sigma-green'
                                  : student.status === 'active'
                                  ? 'bg-primary/10 text-primary'
                                  : 'bg-muted text-muted-foreground'
                              }`}>
                                {student.status === 'completed' ? 'Завершил' :
                                 student.status === 'active' ? 'Активный' : '—'}
                              </span>
                            </td>
                            <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                              <div className="flex gap-2">
                                {student.login && student.generated_password && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-lg gap-1"
                                    onClick={() => handleCopyCredentials(student.login!, student.generated_password!)}
                                    title="Копировать логин и пароль"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-lg text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteStudent(student.enrollment_id)}
                                  disabled={!student.enrollment_id}
                                  title="Отчислить с курса"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Stats Tab */}
          {activeTab === "stats" && (
            <div className="space-y-6">
              <div className="bg-card rounded-2xl border border-border p-6">
                <h2 className="font-display text-xl font-semibold mb-6">Общая статистика</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Всего учеников</span>
                      <span className="font-bold">{stats.totalStudents}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Всего курсов</span>
                      <span className="font-bold">{stats.totalCourses}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Завершили обучение</span>
                      <span className="font-bold text-sigma-green">{stats.completedCount}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Средний прогресс</span>
                      <span className="font-bold">{stats.averageProgress}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="relative w-40 h-40">
                      <svg className="w-40 h-40 transform -rotate-90">
                        <circle cx="80" cy="80" r="70" fill="none" stroke="hsl(var(--border))" strokeWidth="12" />
                        <circle
                          cx="80"
                          cy="80"
                          r="70"
                          fill="none"
                          stroke="hsl(var(--primary))"
                          strokeWidth="12"
                          strokeDasharray={`${stats.averageProgress * 4.4} 440`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-4xl font-bold font-display">{stats.averageProgress}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Links Tab */}
          {activeTab === "links" && (
            <div className="bg-card rounded-2xl border border-border">
              <div className="p-6 border-b border-border">
                <h2 className="font-display text-xl font-semibold">Ссылки для регистрации учеников</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Ученики, зарегистрировавшиеся по этим ссылкам, автоматически привяжутся к вашей организации
                </p>
              </div>

              {isLoadingLinks ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : registrationLinks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Link className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Нет ссылок для регистрации</p>
                  <Button
                    className="mt-4 btn-gradient rounded-xl gap-2"
                    onClick={() => setShowCreateLinkDialog(true)}
                  >
                    <Plus className="w-4 h-4" />
                    Создать первую ссылку
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Компания</th>
                        <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">ИНН</th>
                        <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Использований</th>
                        <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Создана</th>
                        <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrationLinks.map((link) => (
                        <tr key={link.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                          <td className="px-6 py-4 font-medium">{link.name || "—"}</td>
                          <td className="px-6 py-4 text-sm">{link.inn || "—"}</td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                              {link.used_count}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">
                            {new Date(link.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg gap-1"
                                onClick={() => copyLinkToClipboard(link.token)}
                              >
                                <Copy className="w-4 h-4" />
                                Копировать
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg text-destructive hover:text-destructive"
                                onClick={() => handleDeleteLink(link.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Library Tab */}
          {activeTab === "library" && organizationId && (
            <LibraryManager organizationId={organizationId} />
          )}

          {/* Documents Tab */}
          {activeTab === "documents" && organizationId && (
            <div className="space-y-6">
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  className="rounded-xl gap-2"
                  onClick={() => setShowBulkUploadDialog(true)}
                >
                  <Users className="w-4 h-4" />
                  Массовая загрузка ученикам
                </Button>
              </div>
              <OrgDocumentsManager organizationId={organizationId} />
            </div>
          )}

          {/* Services Tab */}
          {activeTab === "services" && organizationId && (
            <ServicesManager organizationId={organizationId} />
          )}

          {/* Settings Tab */}
          {activeTab === "settings" && (
            <div className="max-w-2xl space-y-6">
              {/* Theme Settings */}
              <div className="bg-card rounded-2xl border border-border p-6">
                <h3 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Тема оформления
                </h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Режим оформления</p>
                    <p className="text-sm text-muted-foreground">Выберите светлую или тёмную тему</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={!isDarkMode ? "default" : "outline"}
                      className="rounded-xl gap-2"
                      onClick={() => {
                        setIsDarkMode(false);
                        document.documentElement.classList.remove('dark');
                        localStorage.setItem('theme', 'light');
                      }}
                    >
                      <Sun className="w-4 h-4" />
                      Светлая
                    </Button>
                    <Button
                      variant={isDarkMode ? "default" : "outline"}
                      className="rounded-xl gap-2"
                      onClick={() => {
                        setIsDarkMode(true);
                        document.documentElement.classList.add('dark');
                        localStorage.setItem('theme', 'dark');
                      }}
                    >
                      <Moon className="w-4 h-4" />
                      Тёмная
                    </Button>
                  </div>
                </div>
              </div>

              {/* Menu Items Settings - Right after theme */}
              <div className="bg-card rounded-2xl border border-border p-6">
                <h3 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
                  <LayoutGrid className="w-5 h-5" />
                  Разделы меню
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Включите или отключите дополнительные разделы в боковом меню
                </p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                        <BarChart3 className="w-5 h-5 text-accent" />
                      </div>
                      <div>
                        <p className="font-medium">Статистика</p>
                        <p className="text-sm text-muted-foreground">Аналитика и отчёты по обучению</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setMenuSettings(prev => ({ ...prev, showStats: !prev.showStats }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        menuSettings.showStats ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          menuSettings.showStats ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-sigma-green/10 flex items-center justify-center">
                        <Link className="w-5 h-5 text-sigma-green" />
                      </div>
                      <div>
                        <p className="font-medium">Ссылки регистрации</p>
                        <p className="text-sm text-muted-foreground">Ссылки для самостоятельной регистрации учеников</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setMenuSettings(prev => ({ ...prev, showLinks: !prev.showLinks }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        menuSettings.showLinks ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          menuSettings.showLinks ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-sigma-orange/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-sigma-orange" />
                      </div>
                      <div>
                        <p className="font-medium">Документы</p>
                        <p className="text-sm text-muted-foreground">Документооборот организации</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setMenuSettings(prev => ({ ...prev, showDocuments: !prev.showDocuments }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        menuSettings.showDocuments ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          menuSettings.showDocuments ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-border">
                  <Button
                    className="btn-gradient rounded-xl gap-2"
                    onClick={() => {
                      try {
                        localStorage.setItem('orgMenuSettings', JSON.stringify(menuSettings));
                        toast.success('Настройки меню сохранены');
                      } catch (error) {
                        console.error('Error saving menu settings:', error);
                        toast.error('Ошибка сохранения настроек');
                      }
                    }}
                  >
                    <Save className="w-4 h-4" />
                    Сохранить настройки меню
                  </Button>
                </div>
              </div>

              {/* Branding Settings */}
              <div className="bg-card rounded-2xl border border-border p-6">
                <h3 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
                  <Image className="w-5 h-5" />
                  Брендирование
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Настройте внешний вид кабинета с вашим фирменным стилем
                </p>
                
                <div className="space-y-6">
                  {/* Cover Image */}
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Обложка организации</Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Изображение отображается в шапке личного кабинета (рекомендуется 1920×400 px)
                    </p>
                    <div className="relative">
                      {brandingSettings.coverUrl ? (
                        <div className="relative rounded-xl overflow-hidden border border-border">
                          <img 
                            src={brandingSettings.coverUrl} 
                            alt="Обложка" 
                            className="w-full h-32 object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleCoverUpload}
                              />
                              <Button size="sm" variant="secondary" className="rounded-lg pointer-events-none">
                                Заменить
                              </Button>
                            </label>
                            <Button 
                              size="sm" 
                              variant="destructive" 
                              className="rounded-lg"
                              onClick={() => setBrandingSettings(prev => ({ ...prev, coverUrl: '' }))}
                            >
                              Удалить
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleCoverUpload}
                          />
                          <div className="border-2 border-dashed border-border rounded-xl h-32 flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/5 transition-colors">
                            {isUploadingCover ? (
                              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            ) : (
                              <>
                                <Upload className="w-6 h-6 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Загрузить обложку</span>
                              </>
                            )}
                          </div>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Logo */}
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Логотип организации</Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Отображается вместо стандартного логотипа (рекомендуется квадрат или прозрачный PNG)
                    </p>
                    <div className="flex items-start gap-4">
                      {brandingSettings.logoUrl ? (
                        <div className="relative">
                          <img 
                            src={brandingSettings.logoUrl} 
                            alt="Логотип" 
                            className="w-20 h-20 object-contain rounded-xl border border-border bg-background p-2"
                          />
                          <button
                            onClick={() => setBrandingSettings(prev => ({ ...prev, logoUrl: '' }))}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center hover:bg-destructive/80"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleLogoUpload}
                          />
                          <div className="w-20 h-20 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-primary/5 transition-colors">
                            {isUploadingLogo ? (
                              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            ) : (
                              <>
                                <Upload className="w-5 h-5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Логотип</span>
                              </>
                            )}
                          </div>
                        </label>
                      )}
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">Показывать название</p>
                            <p className="text-xs text-muted-foreground">Отображать название организации рядом с логотипом</p>
                          </div>
                          <button
                            onClick={() => setBrandingSettings(prev => ({ ...prev, showOrgName: !prev.showOrgName }))}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              brandingSettings.showOrgName ? 'bg-primary' : 'bg-muted'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                brandingSettings.showOrgName ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Colors */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Основной цвет</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={brandingSettings.primaryColor}
                          onChange={(e) => setBrandingSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                          className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                        />
                        <Input
                          value={brandingSettings.primaryColor}
                          onChange={(e) => setBrandingSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                          className="rounded-xl flex-1"
                          placeholder="#6366f1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Дополнительный цвет</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={brandingSettings.secondaryColor}
                          onChange={(e) => setBrandingSettings(prev => ({ ...prev, secondaryColor: e.target.value }))}
                          className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                        />
                        <Input
                          value={brandingSettings.secondaryColor}
                          onChange={(e) => setBrandingSettings(prev => ({ ...prev, secondaryColor: e.target.value }))}
                          className="rounded-xl flex-1"
                          placeholder="#8b5cf6"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-border">
                  <Button
                    className="btn-gradient rounded-xl gap-2"
                    onClick={handleSaveBranding}
                    disabled={isSavingBranding}
                  >
                    {isSavingBranding ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Сохранение...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Сохранить брендирование
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Student Dashboard Settings - At the bottom */}
              <div className="bg-card rounded-2xl border border-border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Настройки личного кабинета ученика
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl gap-2"
                    onClick={handlePreviewStudentDashboard}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Просмотр кабинета
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Настройте, какие разделы будут отображаться в личном кабинете учеников
                </p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Library className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Библиотека</p>
                        <p className="text-sm text-muted-foreground">Раздел с дополнительными материалами</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setStudentDashboardSettings(prev => ({ ...prev, showLibrary: !prev.showLibrary }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        studentDashboardSettings.showLibrary ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          studentDashboardSettings.showLibrary ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-sigma-orange/10 flex items-center justify-center">
                        <Trophy className="w-5 h-5 text-sigma-orange" />
                      </div>
                      <div>
                        <p className="font-medium">Достижения</p>
                        <p className="text-sm text-muted-foreground">Раздел с наградами и достижениями</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setStudentDashboardSettings(prev => ({ ...prev, showAchievements: !prev.showAchievements }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        studentDashboardSettings.showAchievements ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          studentDashboardSettings.showAchievements ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-sigma-cyan/10 flex items-center justify-center">
                        <MessageCircle className="w-5 h-5 text-sigma-cyan" />
                      </div>
                      <div>
                        <p className="font-medium">ИИ-помощник</p>
                        <p className="text-sm text-muted-foreground">Чат с ИИ для помощи в обучении</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setStudentDashboardSettings(prev => ({ ...prev, showAiChat: !prev.showAiChat }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        studentDashboardSettings.showAiChat ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          studentDashboardSettings.showAiChat ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-border">
                  <Button
                    className="btn-gradient rounded-xl gap-2"
                    onClick={async () => {
                      if (!organizationId) return;
                      setIsSavingSettings(true);
                      try {
                        const { error } = await supabase
                          .from('organizations')
                          .update({ student_dashboard_settings: studentDashboardSettings })
                          .eq('id', organizationId);
                        
                        if (error) throw error;
                        toast.success('Настройки сохранены');
                      } catch (error) {
                        console.error('Error saving settings:', error);
                        toast.error('Ошибка сохранения настроек');
                      } finally {
                        setIsSavingSettings(false);
                      }
                    }}
                    disabled={isSavingSettings}
                  >
                    {isSavingSettings ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Сохранение...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Сохранить настройки
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Dialogs */}
      {/* Import Students Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Импорт учеников</DialogTitle>
            <DialogDescription>
              Загрузите файл Excel или CSV со списком учеников
            </DialogDescription>
          </DialogHeader>
          {organizationId && (
            <ImportStudentsForm 
              organizationId={organizationId} 
              courses={courses.filter(c => c.is_published)}
              companies={companies}
              onSuccess={() => {
                setShowImportDialog(false);
                window.location.reload();
              }} 
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Unenroll Confirmation Dialog */}
      <Dialog open={showUnenrollConfirm} onOpenChange={setShowUnenrollConfirm}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-destructive">Подтвердите отчисление</DialogTitle>
            <DialogDescription>
              Вы действительно хотите отчислить {getSelectedEnrollmentsCount()} учеников с курсов? 
              Это действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setShowUnenrollConfirm(false)}
              disabled={isUnenrolling}
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={handleBulkUnenroll}
              disabled={isUnenrolling}
            >
              {isUnenrolling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Отчисление...
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 mr-2" />
                  Отчислить
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Student Dialog */}
      <Dialog open={showAddStudentDialog} onOpenChange={setShowAddStudentDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Добавить ученика</DialogTitle>
            <DialogDescription>
              Создайте нового ученика или добавьте существующего на курс
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>ФИО *</Label>
              <Input
                placeholder="Иванов Иван Иванович"
                className="rounded-xl"
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Email {!noLoginStudent && "*"}</Label>
              <Input
                type="email"
                placeholder="ivan@example.com"
                className="rounded-xl"
                value={newStudentEmail}
                onChange={(e) => setNewStudentEmail(e.target.value)}
              />
              {!noLoginStudent && (
                <p className="text-xs text-muted-foreground">
                  Если ученик с таким email уже существует — он будет зачислен на курс
                </p>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="noLogin"
                checked={noLoginStudent}
                onChange={(e) => setNoLoginStudent(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="noLogin" className="text-sm font-normal cursor-pointer">
                Без входа в систему (можно использовать одну почту для нескольких учеников)
              </Label>
            </div>
            <div className="space-y-2">
              <Label>Компания (необязательно)</Label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Выберите компанию" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map(company => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name} {company.inn ? `(ИНН: ${company.inn})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Курс (необязательно)</Label>
              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Выберите курс" />
                </SelectTrigger>
                <SelectContent>
                  {courses.filter(c => c.is_published).map(course => (
                    <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full btn-gradient rounded-xl"
              onClick={handleCreateStudent}
              disabled={isCreatingStudent}
            >
              {isCreatingStudent ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Добавление...
                </>
              ) : (
                "Добавить ученика"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enroll Dialog - Enhanced with search */}
      <Dialog open={showEnrollDialog} onOpenChange={setShowEnrollDialog}>
        <DialogContent className="rounded-2xl max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display">Зачислить на курс</DialogTitle>
            <DialogDescription>
              Выберите курс для зачисления {selectedStudentIds.size} учеников
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 flex-1 overflow-hidden flex flex-col">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск курса..."
                value={courseSearchQuery}
                onChange={(e) => setCourseSearchQuery(e.target.value)}
                className="pl-10 rounded-xl"
              />
            </div>
            <div className="flex-1 overflow-auto border border-border rounded-xl p-2 space-y-2 min-h-[200px] max-h-[300px]">
              {courses.filter(c => c.is_published && c.title.toLowerCase().includes(courseSearchQuery.toLowerCase())).length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Курсы не найдены</p>
                </div>
              ) : (
                courses.filter(c => c.is_published && c.title.toLowerCase().includes(courseSearchQuery.toLowerCase())).map(course => {
                  const category = getCategoryById(course.category_id);
                  const isSelected = enrollCourseId === course.id;
                  
                  return (
                    <div
                      key={course.id}
                      onClick={() => setEnrollCourseId(course.id)}
                      className={`p-3 rounded-xl cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-primary/10 border-2 border-primary'
                          : 'bg-secondary/30 hover:bg-secondary/50 border-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                        }`}>
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{course.title}</div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{course.lessonsCount} уроков</span>
                            <span>•</span>
                            <span>{course.studentsCount} учеников</span>
                            {category && (
                              <>
                                <span>•</span>
                                <span
                                  className="px-1.5 py-0.5 rounded text-xs"
                                  style={{ backgroundColor: category.color + '20', color: category.color }}
                                >
                                  {category.name}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-5 h-5 text-primary" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <Button
              className="w-full btn-gradient rounded-xl"
              onClick={handleBulkEnroll}
              disabled={isEnrolling || !enrollCourseId}
            >
              {isEnrolling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Зачисление...
                </>
              ) : (
                <>
                  <GraduationCap className="w-4 h-4 mr-2" />
                  Зачислить на курс
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Создать категорию</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Название</Label>
              <Input
                placeholder="Название категории"
                className="rounded-xl"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Цвет</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={newCategoryColor}
                  onChange={(e) => setNewCategoryColor(e.target.value)}
                  className="w-12 h-10 rounded-lg border border-border cursor-pointer"
                />
                <Input
                  value={newCategoryColor}
                  onChange={(e) => setNewCategoryColor(e.target.value)}
                  className="flex-1 rounded-xl"
                />
              </div>
            </div>
            <Button
              className="w-full btn-gradient rounded-xl"
              onClick={handleCreateCategory}
              disabled={isCreatingCategory}
            >
              {isCreatingCategory ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Создание...
                </>
              ) : (
                "Создать"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Course Students Dialog */}
      <Dialog open={showCourseStudentsDialog} onOpenChange={setShowCourseStudentsDialog}>
        <DialogContent className="max-w-3xl rounded-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Ученики курса: {selectedCourse?.title}</DialogTitle>
          </DialogHeader>
          {isLoadingCourseStudents ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="bg-secondary/30 rounded-xl p-4 space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Link className="w-4 h-4" />
                  Быстрые действия
                </h3>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    className="rounded-xl gap-2"
                    onClick={() => {
                      if (selectedCourse) {
                        const url = `${window.location.origin}/course/${selectedCourse.id}`;
                        navigator.clipboard.writeText(url);
                        toast.success("Ссылка на курс скопирована");
                      }
                    }}
                  >
                    <Copy className="w-4 h-4" />
                    Скопировать ссылку
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-xl gap-2"
                    onClick={() => setShowInviteEmailDialog(true)}
                  >
                    <Send className="w-4 h-4" />
                    Отправить приглашение
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Зачисленные ученики ({courseStudents.length})</h3>
                {courseStudents.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Нет зачисленных учеников</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-auto">
                    {courseStudents.map(s => (
                      <div key={s.enrollment_id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl">
                        <div>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-sm text-muted-foreground">{s.email}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <Progress value={s.progress} className="w-20 h-2" />
                            <span className="text-sm">{s.progress}%</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (s.enrollment_id && selectedCourse) {
                                setSelectedStudentForDocs({
                                  enrollmentId: s.enrollment_id,
                                  studentName: s.name,
                                  courseName: selectedCourse.title
                                });
                                setShowStudentDocsDialog(true);
                              }
                            }}
                            title="Документы ученика"
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => s.enrollment_id && handleRemoveFromCourse(s.enrollment_id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-semibold mb-3">Добавить учеников</h3>
                {availableStudentsForCourse.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Все ученики уже зачислены</p>
                ) : (
                  <>
                    <div className="space-y-2 max-h-40 overflow-auto mb-4">
                      {availableStudentsForCourse.map(s => (
                        <label key={s.user_id} className="flex items-center gap-3 p-3 bg-secondary/30 rounded-xl cursor-pointer hover:bg-secondary/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedStudentsToAdd.has(s.user_id)}
                            onChange={() => {
                              const newSet = new Set(selectedStudentsToAdd);
                              if (newSet.has(s.user_id)) {
                                newSet.delete(s.user_id);
                              } else {
                                newSet.add(s.user_id);
                              }
                              setSelectedStudentsToAdd(newSet);
                            }}
                            className="w-4 h-4"
                          />
                          <div>
                            <div className="font-medium">{s.name}</div>
                            <div className="text-sm text-muted-foreground">{s.email}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <Button
                      className="w-full btn-gradient rounded-xl"
                      onClick={handleAddStudentsToCourse}
                      disabled={selectedStudentsToAdd.size === 0 || isAddingStudentsToCourse}
                    >
                      {isAddingStudentsToCourse ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Добавление...
                        </>
                      ) : (
                        `Зачислить (${selectedStudentsToAdd.size})`
                      )}
                    </Button>
                  </>
                )}
              </div>

              {/* Course Test Report */}
              {selectedCourse && organizationId && (
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Результаты тестирования
                  </h3>
                  <CourseTestReport
                    courseId={selectedCourse.id}
                    courseName={selectedCourse.title}
                    organizationId={organizationId}
                  />
                </div>
              )}

              {/* Enrollment History */}
              {selectedCourse && organizationId && (
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <History className="w-4 h-4" />
                    История зачислений
                  </h3>
                  <EnrollmentHistory 
                    courseId={selectedCourse.id} 
                    organizationId={organizationId}
                    courseName={selectedCourse.title}
                  />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Invite by Email Dialog */}
      <Dialog open={showInviteEmailDialog} onOpenChange={setShowInviteEmailDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Отправить приглашение на курс</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email получателя</Label>
              <Input
                type="email"
                placeholder="student@example.com"
                className="rounded-xl"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="bg-secondary/30 rounded-xl p-3 text-sm">
              <p className="text-muted-foreground">
                Курс: <span className="font-medium text-foreground">{selectedCourse?.title}</span>
              </p>
              <p className="text-muted-foreground mt-1">
                Получатель получит письмо со ссылкой на курс
              </p>
            </div>
            <Button
              className="w-full btn-gradient rounded-xl"
              onClick={handleSendInvitation}
              disabled={isSendingInvitation || !inviteEmail.trim()}
            >
              {isSendingInvitation ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Отправка...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Отправить приглашение
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Student Details Dialog */}
      <Dialog open={showStudentDialog} onOpenChange={setShowStudentDialog}>
        <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Карточка ученика</DialogTitle>
          </DialogHeader>
          {isLoadingStudentDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : selectedStudent && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="bg-secondary/30 rounded-xl p-4">
                <h3 className="font-semibold text-lg">{selectedStudent.student.name}</h3>
                <p className="text-muted-foreground">{selectedStudent.student.email || "Email не указан"}</p>
                
                {/* Login credentials */}
                {selectedStudent.student.login && (
                  <div className="mt-3 p-3 bg-background rounded-lg border border-border">
                    <p className="text-sm text-muted-foreground mb-2">Данные для входа:</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="bg-primary/10 text-primary px-2 py-1 rounded text-sm font-mono">
                        {selectedStudent.student.login}
                      </span>
                      {selectedStudent.student.generated_password && (
                        <span className="bg-muted text-muted-foreground px-2 py-1 rounded text-sm font-mono">
                          {selectedStudent.student.generated_password}
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg gap-1 ml-auto"
                        onClick={() => handleCopyCredentials(
                          selectedStudent.student.login!,
                          selectedStudent.student.generated_password || ""
                        )}
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Копировать
                      </Button>
                    </div>
                  </div>
                )}

                {selectedStudent.student.course && (
                  <p className="text-sm mt-3">Курс: <span className="font-medium">{selectedStudent.student.course}</span></p>
                )}
                <div className="flex items-center gap-3 mt-3">
                  <Progress value={selectedStudent.student.progress} className="flex-1 h-3" />
                  <span className="font-semibold">{selectedStudent.student.progress}%</span>
                </div>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Attach to company */}
                <div className="bg-secondary/30 rounded-xl p-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Прикрепить к компании
                  </h4>
                  <div className="flex gap-2">
                    <Select value={studentCompanyId} onValueChange={setStudentCompanyId}>
                      <SelectTrigger className="flex-1 rounded-lg">
                        <SelectValue placeholder="Выберите компанию" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map(company => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-lg shrink-0"
                      onClick={handleAttachStudentToCompany}
                      disabled={!studentCompanyId || isSavingStudentCompany}
                    >
                      {isSavingStudentCompany ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Create credentials for students without login */}
                {!selectedStudent.student.login && (
                  <div className="bg-secondary/30 rounded-xl p-4">
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Key className="w-4 h-4" />
                      Данные для входа
                    </h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      У ученика нет логина и пароля для входа в систему
                    </p>
                    <Button
                      className="w-full rounded-lg gap-2 btn-gradient"
                      onClick={handleCreateStudentCredentials}
                      disabled={isCreatingCredentials}
                    >
                      {isCreatingCredentials ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Key className="w-4 h-4" />
                      )}
                      Создать логин и пароль
                    </Button>
                  </div>
                )}

                {/* Send credentials */}
                {selectedStudent.student.login && selectedStudent.student.generated_password && (
                  <div className="bg-secondary/30 rounded-xl p-4">
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Send className="w-4 h-4" />
                      Отправить данные для входа
                    </h4>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        className="w-full rounded-lg gap-2"
                        onClick={handleSendCredentials}
                        disabled={isSendingCredentials}
                      >
                        {isSendingCredentials ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        Скопировать сообщение
                      </Button>
                      <Button
                        className="w-full rounded-lg gap-2 btn-gradient"
                        onClick={handleSendCredentialsEmail}
                        disabled={isSendingCredentialsEmail || !selectedStudent.student.email}
                      >
                        {isSendingCredentialsEmail ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Mail className="w-4 h-4" />
                        )}
                        {selectedStudent.student.email ? "Отправить на почту" : "Email не указан"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Delete student */}
                <div className="bg-destructive/10 rounded-xl p-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2 text-destructive">
                    <Trash2 className="w-4 h-4" />
                    Удалить ученика
                  </h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Полностью удалить ученика из системы
                  </p>
                  <Button
                    variant="destructive"
                    className="w-full rounded-lg gap-2"
                    onClick={handleDeleteStudentCompletely}
                    disabled={isDeletingStudent}
                  >
                    {isDeletingStudent ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Удалить ученика
                  </Button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Результаты тестов</h3>
                  {selectedStudent.testAttempts.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg gap-2"
                      onClick={() => {
                        import('xlsx').then(XLSX => {
                          const exportData = selectedStudent.testAttempts.map(attempt => ({
                            'Тест': attempt.lesson_title,
                            'Баллы': attempt.score,
                            'Макс. баллы': attempt.max_score,
                            'Процент': Math.round((attempt.score / attempt.max_score) * 100) + '%',
                            'Результат': attempt.score >= attempt.max_score * 0.7 ? 'Пройден' : 'Не пройден',
                            'Дата': new Date(attempt.completed_at).toLocaleString('ru-RU')
                          }));
                          const ws = XLSX.utils.json_to_sheet(exportData);
                          const wb = XLSX.utils.book_new();
                          XLSX.utils.book_append_sheet(wb, ws, 'Результаты тестов');
                          XLSX.writeFile(wb, `тесты_${selectedStudent.student.name}_${new Date().toISOString().split('T')[0]}.xlsx`);
                          toast.success('Результаты тестов экспортированы');
                        });
                      }}
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Экспорт
                    </Button>
                  )}
                </div>
                {selectedStudent.testAttempts.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Нет пройденных тестов</p>
                ) : (
                  <div className="space-y-3">
                    {selectedStudent.testAttempts.map(attempt => (
                      <div key={attempt.id} className="bg-secondary/30 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{attempt.lesson_title}</span>
                          <span className={`font-bold ${attempt.score >= attempt.max_score * 0.7 ? 'text-sigma-green' : 'text-destructive'}`}>
                            {attempt.score} / {attempt.max_score}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {new Date(attempt.completed_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Company Dialog */}
      <Dialog open={showAddCompanyDialog} onOpenChange={setShowAddCompanyDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Добавить компанию</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Название *</Label>
              <Input
                placeholder="ООО Пример"
                className="rounded-xl"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                placeholder="info@example.com"
                className="rounded-xl"
                value={newCompanyEmail}
                onChange={(e) => setNewCompanyEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>ИНН</Label>
              <Input
                placeholder="1234567890"
                className="rounded-xl"
                value={newCompanyInn}
                onChange={(e) => setNewCompanyInn(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Контактное лицо</Label>
              <Input
                placeholder="Иванов Иван"
                className="rounded-xl"
                value={newCompanyContactName}
                onChange={(e) => setNewCompanyContactName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Телефон</Label>
              <Input
                placeholder="+7 (999) 123-45-67"
                className="rounded-xl"
                value={newCompanyPhone}
                onChange={(e) => setNewCompanyPhone(e.target.value)}
              />
            </div>
            <Button
              className="w-full btn-gradient rounded-xl"
              onClick={handleCreateCompany}
              disabled={isCreatingCompany}
            >
              {isCreatingCompany ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Создание...
                </>
              ) : (
                "Создать компанию"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Company Dialog */}
      <Dialog open={showEditCompanyDialog} onOpenChange={setShowEditCompanyDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Редактировать компанию</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Название *</Label>
              <Input
                className="rounded-xl"
                value={editCompanyName}
                onChange={(e) => setEditCompanyName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                className="rounded-xl"
                value={editCompanyEmail}
                onChange={(e) => setEditCompanyEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>ИНН</Label>
              <Input
                className="rounded-xl"
                value={editCompanyInn}
                onChange={(e) => setEditCompanyInn(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Контактное лицо</Label>
              <Input
                className="rounded-xl"
                value={editCompanyContactName}
                onChange={(e) => setEditCompanyContactName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Телефон</Label>
              <Input
                className="rounded-xl"
                value={editCompanyPhone}
                onChange={(e) => setEditCompanyPhone(e.target.value)}
              />
            </div>
            <Button
              className="w-full btn-gradient rounded-xl"
              onClick={handleSaveCompany}
              disabled={isSavingCompany}
            >
              {isSavingCompany ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : (
                "Сохранить"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Org Details Dialog */}
      <Dialog open={showOrgDetails} onOpenChange={setShowOrgDetails}>
        <DialogContent className="max-w-3xl rounded-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{selectedOrg?.name}</DialogTitle>
          </DialogHeader>
          {isLoadingOrgDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : selectedOrg && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-secondary/30 rounded-xl p-4">
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedOrg.email}</p>
                </div>
                <div className="bg-secondary/30 rounded-xl p-4">
                  <p className="text-sm text-muted-foreground">ИНН</p>
                  <p className="font-medium">{selectedOrg.inn || "—"}</p>
                </div>
                <div className="bg-secondary/30 rounded-xl p-4">
                  <p className="text-sm text-muted-foreground">Контактное лицо</p>
                  <p className="font-medium">{selectedOrg.contact_name || "—"}</p>
                </div>
                <div className="bg-secondary/30 rounded-xl p-4">
                  <p className="text-sm text-muted-foreground">Телефон</p>
                  <p className="font-medium">{selectedOrg.phone || "—"}</p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Ученики ({orgStudents.length})</h3>
                {orgStudents.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Нет учеников</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-auto">
                    {orgStudents.map(s => (
                      <div key={s.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-xl">
                        <div>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-sm text-muted-foreground">{s.email}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Student Courses Management Dialog */}
      <Dialog open={showStudentCoursesDialog} onOpenChange={setShowStudentCoursesDialog}>
        <DialogContent className="max-w-3xl rounded-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              Курсы ученика: {selectedStudentForCourses?.name}
            </DialogTitle>
            <DialogDescription>
              Управление зачислениями на курсы
            </DialogDescription>
          </DialogHeader>
          
          {isLoadingStudentCourses ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Current enrollments */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5" />
                  Текущие курсы ({studentEnrollments.length})
                </h3>
                {studentEnrollments.length === 0 ? (
                  <p className="text-muted-foreground text-sm bg-secondary/30 rounded-xl p-4">
                    Ученик не зачислен ни на один курс
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {studentEnrollments.map(({ course, enrollment_id, progress, status }) => (
                      <div key={enrollment_id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-xl">
                        <div className="flex-1">
                          <div className="font-medium">{course.title}</div>
                          <div className="flex items-center gap-3 mt-1">
                            <Progress value={progress} className="w-24 h-2" />
                            <span className="text-sm text-muted-foreground">{progress}%</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              status === 'completed' ? 'bg-sigma-green/10 text-sigma-green' : 'bg-primary/10 text-primary'
                            }`}>
                              {status === 'completed' ? 'Завершён' : 'В процессе'}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg text-destructive hover:text-destructive ml-3"
                          onClick={() => handleRemoveStudentFromCourse(enrollment_id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Available courses to add */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Зачислить на курсы
                </h3>
                
                {availableCoursesForStudent.length === 0 ? (
                  <p className="text-muted-foreground text-sm bg-secondary/30 rounded-xl p-4">
                    Все доступные курсы уже назначены
                  </p>
                ) : (
                  <>
                    <div className="relative mb-3">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Поиск курсов..."
                        value={studentCoursesSearchQuery}
                        onChange={(e) => setStudentCoursesSearchQuery(e.target.value)}
                        className="pl-10 rounded-xl"
                      />
                    </div>
                    
                    <div className="space-y-2 max-h-48 overflow-auto border border-border rounded-xl p-2">
                      {availableCoursesForStudent
                        .filter(c => 
                          studentCoursesSearchQuery === "" || 
                          c.title.toLowerCase().includes(studentCoursesSearchQuery.toLowerCase())
                        )
                        .map(course => {
                          const isSelected = selectedCoursesToAdd.has(course.id);
                          const category = getCategoryById(course.category_id);
                          
                          return (
                            <div
                              key={course.id}
                              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                                isSelected ? 'bg-primary/10 border border-primary' : 'bg-secondary/30 hover:bg-secondary/50'
                              }`}
                              onClick={() => toggleCourseSelection(course.id)}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleCourseSelection(course.id)}
                                className="w-4 h-4 rounded"
                              />
                              <div className="flex-1">
                                <div className="font-medium">{course.title}</div>
                                {category && (
                                  <span
                                    className="text-xs px-2 py-0.5 rounded-full mt-1 inline-block"
                                    style={{ backgroundColor: category.color + '20', color: category.color }}
                                  >
                                    {category.name}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                    
                    {selectedCoursesToAdd.size > 0 && (
                      <Button
                        className="w-full btn-gradient rounded-xl mt-4"
                        onClick={handleAddCoursesToStudent}
                        disabled={isAddingCoursesToStudent}
                      >
                        {isAddingCoursesToStudent ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Зачисление...
                          </>
                        ) : (
                          <>
                            <GraduationCap className="w-4 h-4 mr-2" />
                            Зачислить на {selectedCoursesToAdd.size} курсов
                          </>
                        )}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Course Documents Manager */}
      {selectedCourseForDocs && (
        <CourseDocumentsManager
          courseId={selectedCourseForDocs.id}
          courseName={selectedCourseForDocs.title}
          isOpen={showCourseDocsDialog}
          onClose={() => {
            setShowCourseDocsDialog(false);
            setSelectedCourseForDocs(null);
          }}
        />
      )}

      {/* Student Documents Manager */}
      {selectedStudentForDocs && (
        <StudentDocumentsManager
          enrollmentId={selectedStudentForDocs.enrollmentId}
          studentName={selectedStudentForDocs.studentName}
          courseName={selectedStudentForDocs.courseName}
          isOpen={showStudentDocsDialog}
          onClose={() => {
            setShowStudentDocsDialog(false);
            setSelectedStudentForDocs(null);
          }}
        />
      )}

      {/* Bulk Document Upload */}
      {organizationId && (
        <BulkDocumentUpload
          organizationId={organizationId}
          isOpen={showBulkUploadDialog}
          onClose={() => setShowBulkUploadDialog(false)}
        />
      )}
    </div>
  );
}
