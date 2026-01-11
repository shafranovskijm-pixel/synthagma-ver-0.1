import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { RegistrationLinksManager } from "@/components/organization/RegistrationLinksManager";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  LogOut, 
  BookOpen, 
  Users, 
  BarChart3, 
  Plus,
  Settings,
  Search,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  FileText,
  Clock,
  TrendingUp,
  Link2
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Course {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  created_at: string;
  duration: string | null;
}

interface Student {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
}

interface Enrollment {
  id: string;
  progress: number;
  status: string;
  user_id: string;
  course_id: string;
  started_at: string;
}

const OrganizationDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateCourseOpen, setIsCreateCourseOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  
  // New course form
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newCourseDescription, setNewCourseDescription] = useState("");
  const [newCourseDuration, setNewCourseDuration] = useState("");

  useEffect(() => {
    fetchData();
    fetchOrganizationId();
  }, []);

  const fetchOrganizationId = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user?.id)
      .single();
    
    if (data?.organization_id) {
      setOrganizationId(data.organization_id);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    await Promise.all([
      fetchCourses(),
      fetchStudents(),
      fetchEnrollments()
    ]);
    setIsLoading(false);
  };

  const fetchCourses = async () => {
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data && !error) {
      setCourses(data);
    }
  };

  const fetchStudents = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data && !error) {
      setStudents(data);
    }
  };

  const fetchEnrollments = async () => {
    const { data, error } = await supabase
      .from('enrollments')
      .select('*');
    
    if (data && !error) {
      setEnrollments(data);
    }
  };

  const handleCreateCourse = async () => {
    if (!newCourseTitle.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите название курса",
        variant: "destructive",
      });
      return;
    }

    // Get current user's organization_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user?.id)
      .single();

    if (!profile?.organization_id) {
      toast({
        title: "Ошибка",
        description: "Организация не найдена. Создайте организацию сначала.",
        variant: "destructive",
      });
      return;
    }

    const { data, error } = await supabase
      .from('courses')
      .insert({
        title: newCourseTitle,
        description: newCourseDescription || null,
        duration: newCourseDuration || null,
        organization_id: profile.organization_id,
        is_published: false
      })
      .select()
      .single();

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось создать курс",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно!",
        description: "Курс создан",
      });
      setCourses([data, ...courses]);
      setIsCreateCourseOpen(false);
      setNewCourseTitle("");
      setNewCourseDescription("");
      setNewCourseDuration("");
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    const { error } = await supabase
      .from('courses')
      .delete()
      .eq('id', courseId);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить курс",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Удалено",
        description: "Курс удалён",
      });
      setCourses(courses.filter(c => c.id !== courseId));
    }
  };

  const handleTogglePublish = async (course: Course) => {
    const { error } = await supabase
      .from('courses')
      .update({ is_published: !course.is_published })
      .eq('id', course.id);

    if (!error) {
      setCourses(courses.map(c => 
        c.id === course.id ? { ...c, is_published: !c.is_published } : c
      ));
      toast({
        title: course.is_published ? "Снято с публикации" : "Опубликовано",
        description: course.is_published 
          ? "Курс больше не доступен ученикам" 
          : "Курс теперь доступен ученикам",
      });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const filteredCourses = courses.filter(course =>
    course.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredStudents = students.filter(student =>
    (student.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.email?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Stats
  const totalCourses = courses.length;
  const publishedCourses = courses.filter(c => c.is_published).length;
  const totalStudents = students.length;
  const activeEnrollments = enrollments.filter(e => e.status === 'active').length;
  const avgProgress = enrollments.length > 0 
    ? Math.round(enrollments.reduce((sum, e) => sum + e.progress, 0) / enrollments.length)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-card border-r border-border p-6 hidden lg:block">
        <SigmaLogo size="md" className="mb-10" />
        
        <nav className="space-y-2">
          <Button variant="ghost" className="w-full justify-start gap-3 bg-primary/10 text-primary">
            <BarChart3 className="w-5 h-5" />
            Обзор
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-3">
            <BookOpen className="w-5 h-5" />
            Курсы
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-3">
            <Users className="w-5 h-5" />
            Ученики
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-3">
            <FileText className="w-5 h-5" />
            Документы
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-3">
            <Settings className="w-5 h-5" />
            Настройки
          </Button>
        </nav>

        <div className="absolute bottom-6 left-6 right-6">
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 text-muted-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="w-5 h-5" />
            Выйти
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-64">
        {/* Header */}
        <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
          <div className="lg:hidden">
            <SigmaLogo size="sm" />
          </div>
          <div className="flex-1 max-w-md mx-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Поиск курсов, учеников..." 
                className="pl-10 rounded-xl"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={handleSignOut}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </header>

        {/* Content */}
        <div className="p-6">
          {/* Stats */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="feature-card">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-sigma-blue/10 flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-sigma-blue" />
                </div>
                <span className="text-xs text-sigma-green font-medium">+{publishedCourses} опубл.</span>
              </div>
              <div className="text-3xl font-bold font-display mb-1">{totalCourses}</div>
              <div className="text-muted-foreground text-sm">Всего курсов</div>
            </div>

            <div className="feature-card">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-sigma-green/10 flex items-center justify-center">
                  <Users className="w-6 h-6 text-sigma-green" />
                </div>
              </div>
              <div className="text-3xl font-bold font-display mb-1">{totalStudents}</div>
              <div className="text-muted-foreground text-sm">Учеников</div>
            </div>

            <div className="feature-card">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-sigma-purple/10 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-sigma-purple" />
                </div>
              </div>
              <div className="text-3xl font-bold font-display mb-1">{activeEnrollments}</div>
              <div className="text-muted-foreground text-sm">Активных записей</div>
            </div>

            <div className="feature-card">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-sigma-cyan/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-sigma-cyan" />
                </div>
              </div>
              <div className="text-3xl font-bold font-display mb-1">{avgProgress}%</div>
              <div className="text-muted-foreground text-sm">Средний прогресс</div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="courses" className="space-y-6">
            <div className="flex items-center justify-between">
              <TabsList className="bg-secondary">
                <TabsTrigger value="courses">Курсы</TabsTrigger>
                <TabsTrigger value="students">Ученики</TabsTrigger>
                <TabsTrigger value="links">Ссылки</TabsTrigger>
                <TabsTrigger value="analytics">Аналитика</TabsTrigger>
              </TabsList>

              <Dialog open={isCreateCourseOpen} onOpenChange={setIsCreateCourseOpen}>
                <DialogTrigger asChild>
                  <Button className="btn-gradient rounded-xl gap-2">
                    <Plus className="w-4 h-4" />
                    Создать курс
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-display">Новый курс</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Название курса *</Label>
                      <Input 
                        placeholder="Введите название"
                        value={newCourseTitle}
                        onChange={(e) => setNewCourseTitle(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Описание</Label>
                      <Textarea 
                        placeholder="Краткое описание курса"
                        value={newCourseDescription}
                        onChange={(e) => setNewCourseDescription(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Продолжительность</Label>
                      <Input 
                        placeholder="Например: 2 недели"
                        value={newCourseDuration}
                        onChange={(e) => setNewCourseDuration(e.target.value)}
                      />
                    </div>
                    <Button 
                      className="w-full btn-gradient"
                      onClick={handleCreateCourse}
                    >
                      Создать курс
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <TabsContent value="courses" className="space-y-4">
              {isLoading ? (
                <div className="glass-card rounded-2xl p-12 text-center">
                  <div className="animate-pulse">Загрузка...</div>
                </div>
              ) : filteredCourses.length === 0 ? (
                <div className="glass-card rounded-2xl p-12 text-center">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <BookOpen className="w-10 h-10 text-primary" />
                  </div>
                  <h3 className="font-display text-xl font-semibold mb-2">
                    Нет курсов
                  </h3>
                  <p className="text-muted-foreground max-w-md mx-auto mb-6">
                    Создайте первый курс для вашей организации
                  </p>
                  <Button 
                    className="btn-gradient rounded-xl gap-2"
                    onClick={() => setIsCreateCourseOpen(true)}
                  >
                    <Plus className="w-4 h-4" />
                    Создать курс
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredCourses.map((course) => (
                    <div key={course.id} className="feature-card flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          course.is_published ? 'bg-sigma-green/10' : 'bg-muted'
                        }`}>
                          <BookOpen className={`w-6 h-6 ${
                            course.is_published ? 'text-sigma-green' : 'text-muted-foreground'
                          }`} />
                        </div>
                        <div>
                          <h3 className="font-semibold">{course.title}</h3>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              course.is_published 
                                ? 'bg-sigma-green/10 text-sigma-green' 
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              {course.is_published ? 'Опубликован' : 'Черновик'}
                            </span>
                            {course.duration && <span>{course.duration}</span>}
                          </div>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/course/${course.id}/edit`)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Редактировать
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleTogglePublish(course)}>
                            <Eye className="w-4 h-4 mr-2" />
                            {course.is_published ? 'Снять с публикации' : 'Опубликовать'}
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="w-4 h-4 mr-2" />
                            Редактировать
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => handleDeleteCourse(course.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="students" className="space-y-4">
              {filteredStudents.length === 0 ? (
                <div className="glass-card rounded-2xl p-12 text-center">
                  <div className="w-20 h-20 rounded-full bg-sigma-green/10 flex items-center justify-center mx-auto mb-6">
                    <Users className="w-10 h-10 text-sigma-green" />
                  </div>
                  <h3 className="font-display text-xl font-semibold mb-2">
                    Нет учеников
                  </h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Ученики появятся здесь после регистрации по вашей ссылке
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredStudents.map((student) => (
                    <div key={student.id} className="feature-card flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-sigma-purple/10 flex items-center justify-center">
                          <Users className="w-6 h-6 text-sigma-purple" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{student.full_name || 'Без имени'}</h3>
                          <p className="text-sm text-muted-foreground">{student.email}</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        Подробнее
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="links" className="space-y-6">
              {organizationId ? (
                <div className="feature-card">
                  <RegistrationLinksManager organizationId={organizationId} />
                </div>
              ) : (
                <div className="glass-card rounded-2xl p-12 text-center">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <Link2 className="w-10 h-10 text-primary" />
                  </div>
                  <h3 className="font-display text-xl font-semibold mb-2">
                    Организация не найдена
                  </h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Для создания ссылок необходимо настроить организацию
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="analytics" className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="feature-card">
                  <h3 className="font-display font-semibold text-lg mb-4">Прогресс учеников</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Не начали</span>
                        <span className="text-muted-foreground">
                          {enrollments.filter(e => e.progress === 0).length}
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full">
                        <div 
                          className="h-full bg-muted-foreground rounded-full"
                          style={{ 
                            width: enrollments.length > 0 
                              ? `${(enrollments.filter(e => e.progress === 0).length / enrollments.length) * 100}%`
                              : '0%'
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>В процессе</span>
                        <span className="text-muted-foreground">
                          {enrollments.filter(e => e.progress > 0 && e.progress < 100).length}
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full">
                        <div 
                          className="h-full bg-sigma-blue rounded-full"
                          style={{ 
                            width: enrollments.length > 0 
                              ? `${(enrollments.filter(e => e.progress > 0 && e.progress < 100).length / enrollments.length) * 100}%`
                              : '0%'
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Завершили</span>
                        <span className="text-muted-foreground">
                          {enrollments.filter(e => e.progress === 100).length}
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full">
                        <div 
                          className="h-full bg-sigma-green rounded-full"
                          style={{ 
                            width: enrollments.length > 0 
                              ? `${(enrollments.filter(e => e.progress === 100).length / enrollments.length) * 100}%`
                              : '0%'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="feature-card">
                  <h3 className="font-display font-semibold text-lg mb-4">Популярные курсы</h3>
                  {courses.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      Создайте курсы, чтобы увидеть статистику
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {courses.slice(0, 5).map((course, index) => {
                        const courseEnrollments = enrollments.filter(e => e.course_id === course.id).length;
                        return (
                          <div key={course.id} className="flex items-center gap-3">
                            <span className="text-2xl font-bold text-muted-foreground w-8">
                              {index + 1}
                            </span>
                            <div className="flex-1">
                              <p className="font-medium truncate">{course.title}</p>
                              <p className="text-sm text-muted-foreground">
                                {courseEnrollments} записей
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default OrganizationDashboard;
