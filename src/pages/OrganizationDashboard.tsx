import { useState, useEffect } from "react";
import ImportStudentsForm from "@/components/ImportStudentsForm";
import { useNavigate } from "react-router-dom";
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
  FileSpreadsheet,
  Search,
  Eye,
  TrendingUp,
  Clock,
  CheckCircle2,
  Loader2,
  Edit,
  Trash2,
  FileText,
  Download,
  Link,
  Copy,
  Building2,
  Save,
  Upload,
  LayoutGrid,
  List,
  Filter,
  Tag,
  Palette
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
  course: string | null;
  course_id: string | null;
  progress: number;
  lastActivity: string | null;
  status: string | null;
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

export default function OrganizationDashboard() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const [activeTab, setActiveTab] = useState<"courses" | "students" | "stats" | "links">("courses");
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

  // Registration links state
  const [registrationLinks, setRegistrationLinks] = useState<RegistrationLink[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [showCreateLinkDialog, setShowCreateLinkDialog] = useState(false);
  const [newLinkCompanyName, setNewLinkCompanyName] = useState("");
  const [newLinkInn, setNewLinkInn] = useState("");
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [isCreatingStudent, setIsCreatingStudent] = useState(false);

  // Student selection for bulk actions
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [enrollCourseId, setEnrollCourseId] = useState<string>("");
  const [isEnrolling, setIsEnrolling] = useState(false);

  // Categories state
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#6366f1");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  // Student filter state
  const [studentStatusFilter, setStudentStatusFilter] = useState<"all" | "active" | "completed" | "not_enrolled">("all");

  // Statistics state
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalCourses: 0,
    completedCount: 0,
    averageProgress: 0
  });

  // Fetch organization data
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("user_id", user.id)
          .single();

        if (!profile?.organization_id) {
          setIsLoadingCourses(false);
          return;
        }

        const orgId = profile.organization_id;
        setOrganizationId(orgId);

        const { data: orgData } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", orgId)
          .single();

        if (orgData) {
          setOrganizationName(orgData.name);
        }

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
          .select("id, user_id, full_name, email")
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
  }, [user]);

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
      const password = generatePassword();

      const { data, error } = await supabase.functions.invoke("register-student", {
        body: {
          token: null,
          email: newStudentEmail,
          password,
          full_name: newStudentName,
          organization_id: organizationId,
          course_id: selectedCourseId || null
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Ученик создан. Пароль: ${password} (сохраните его!)`);
      window.location.reload();

      setShowAddStudentDialog(false);
      setNewStudentName("");
      setNewStudentEmail("");
      setSelectedCourseId("");
    } catch (error: any) {
      console.error("Error creating student:", error);
      toast.error(error.message || "Ошибка создания ученика");
    } finally {
      setIsCreatingStudent(false);
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

  const toggleSelectAll = () => {
    if (selectedStudentIds.size === students.length) {
      setSelectedStudentIds(new Set());
    } else {
      const allIds = students.map(s => s.enrollment_id || s.user_id);
      setSelectedStudentIds(new Set(allIds));
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

  const getCategoryById = (categoryId: string | null | undefined): CourseCategory | undefined => {
    if (!categoryId) return undefined;
    return categories.find(c => c.id === categoryId);
  };

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

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col">
        <div className="p-6 border-b border-border">
          <SigmaLogo size="md" />
          <div className="mt-4 p-3 bg-secondary rounded-xl">
            <div className="font-semibold text-sm">{organizationName}</div>
            <div className="text-xs text-muted-foreground">Организация</div>
          </div>
        </div>

        <nav className="flex-1 p-4">
          <div className="space-y-1">
            <button
              onClick={() => setActiveTab("courses")}
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
              onClick={() => setActiveTab("students")}
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
              onClick={() => setActiveTab("stats")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                activeTab === "stats"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              Статистика
            </button>
            <button
              onClick={() => setActiveTab("links")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                activeTab === "links"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Link className="w-5 h-5" />
              Ссылки регистрации
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-secondary transition-colors">
              <Settings className="w-5 h-5" />
              Настройки
            </button>
          </div>
        </nav>

        <div className="p-4 border-t border-border">
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
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold">
                {activeTab === "courses" && "Управление курсами"}
                {activeTab === "students" && "Все ученики"}
                {activeTab === "stats" && "Статистика обучения"}
                {activeTab === "links" && "Ссылки для регистрации"}
              </h1>
              <p className="text-muted-foreground">{organizationName}</p>
            </div>
            <div className="flex gap-3">
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
                  <Button variant="outline" className="rounded-xl gap-2" onClick={() => navigate("/course/new/edit?import=github")}>
                    <Upload className="w-4 h-4" />
                    Импорт из GitHub
                  </Button>
                  <Button className="btn-gradient rounded-xl gap-2" onClick={() => navigate("/course/new/edit")}>
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
                <div className="text-center py-12 bg-card rounded-2xl border border-border">
                  <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">Нет курсов</p>
                </div>
              ) : courseViewMode === "grid" ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredCourses.map((course) => {
                    const category = getCategoryById(course.category_id);
                    return (
                      <div
                        key={course.id}
                        className="bg-card rounded-2xl border border-border overflow-hidden hover-lift group cursor-pointer"
                        onClick={() => navigate(`/course/${course.id}/edit`)}
                      >
                        <div className={`h-32 relative ${
                          course.is_published
                            ? "bg-gradient-to-br from-primary via-accent to-sigma-purple"
                            : "bg-gradient-to-br from-muted to-secondary"
                        }`}>
                          {category && (
                            <div
                              className="absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: category.color }}
                            >
                              {category.name}
                            </div>
                          )}
                          <span className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-medium ${
                            course.is_published
                              ? 'bg-white/20 text-white'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {course.is_published ? 'Опубликован' : 'Черновик'}
                          </span>
                        </div>
                        <div className="p-6">
                          <h3 className="font-display font-semibold text-lg mb-2">{course.title}</h3>
                          {course.description && (
                            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{course.description}</p>
                          )}
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <BookOpen className="w-4 h-4" />
                              {course.lessonsCount} уроков
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {course.studentsCount} учеников
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                      {filteredCourses.map((course) => {
                        const category = getCategoryById(course.category_id);
                        return (
                          <tr key={course.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                            <td className="px-6 py-4">
                              <div>
                                <div className="font-medium">{course.title}</div>
                                {course.description && (
                                  <div className="text-sm text-muted-foreground line-clamp-1">{course.description}</div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {category ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />
                                  <span className="text-sm">{category.name}</span>
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
                                  onClick={() => navigate(`/course/${course.id}/edit`)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-lg"
                                  onClick={() => navigate(`/course/${course.id}`)}
                                >
                                  <Eye className="w-4 h-4" />
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

          {/* Students Tab */}
          {activeTab === "students" && (
            <div className="bg-card rounded-2xl border border-border">
              <div className="p-6 border-b border-border flex items-center justify-between flex-wrap gap-4">
                <h2 className="font-display text-xl font-semibold">Все ученики</h2>
                <div className="flex items-center gap-3 flex-wrap">
                  {selectedStudentIds.size > 0 && (
                    <Button onClick={() => setShowEnrollDialog(true)} className="btn-gradient rounded-xl gap-2">
                      <GraduationCap className="w-4 h-4" />
                      Зачислить на курс ({selectedStudentIds.size})
                    </Button>
                  )}
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
                            checked={selectedStudentIds.size === filteredStudents.length && filteredStudents.length > 0}
                            onChange={toggleSelectAll}
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
                          <tr key={uniqueId} className={`border-b border-border last:border-0 hover:bg-secondary/50 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
                            <td className="px-4 py-4">
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
                                <div className="text-sm text-muted-foreground">{student.email}</div>
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
                            <td className="px-6 py-4">
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" className="rounded-lg">
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-lg text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteStudent(student.enrollment_id)}
                                  disabled={!student.enrollment_id}
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
        </div>
      </main>

      {/* Import Students Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="sm:max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Импорт учеников из CSV</DialogTitle>
            <DialogDescription>
              Загрузите CSV файл с данными учеников для массового добавления
            </DialogDescription>
          </DialogHeader>
          {organizationId && (
            <ImportStudentsForm
              organizationId={organizationId}
              courses={courses}
              onSuccess={() => window.location.reload()}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Add Student Dialog */}
      <Dialog open={showAddStudentDialog} onOpenChange={setShowAddStudentDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Добавить ученика</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>ФИО ученика *</Label>
              <Input
                placeholder="Иванов Иван Иванович"
                className="rounded-xl"
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                placeholder="student@example.com"
                type="email"
                className="rounded-xl"
                value={newStudentEmail}
                onChange={(e) => setNewStudentEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Курс (опционально)</Label>
              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Выберите курс" />
                </SelectTrigger>
                <SelectContent>
                  {courses.filter(c => c.is_published).map(course => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.title}
                    </SelectItem>
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
                  Создание...
                </>
              ) : (
                "Создать ученика"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Enroll Dialog */}
      <Dialog open={showEnrollDialog} onOpenChange={setShowEnrollDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Зачислить на курс</DialogTitle>
            <DialogDescription>
              Выбрано учеников: {selectedStudentIds.size}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Выберите курс</Label>
              <Select value={enrollCourseId} onValueChange={setEnrollCourseId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Выберите курс" />
                </SelectTrigger>
                <SelectContent>
                  {courses.filter(c => c.is_published).map(course => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                "Зачислить"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Новая категория</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Название категории</Label>
              <Input
                placeholder="Например: Охрана труда"
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
                  className="w-12 h-12 rounded-lg border border-border cursor-pointer"
                />
                <Input
                  value={newCategoryColor}
                  onChange={(e) => setNewCategoryColor(e.target.value)}
                  className="rounded-xl flex-1"
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
                "Создать категорию"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
