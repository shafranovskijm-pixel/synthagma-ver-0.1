import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { LogOut, BookOpen, Clock, Trophy, MessageCircle, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface CourseEnrollment {
  id: string;
  progress: number;
  status: string;
  course: {
    id: string;
    title: string;
    description: string | null;
    duration: string | null;
  };
}

const StudentDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      // Fetch enrollments
      const { data: enrollmentData } = await supabase
        .from('enrollments')
        .select(`
          id,
          progress,
          status,
          course:courses(id, title, description, duration)
        `)
        .eq('user_id', user!.id);

      const validEnrollments = (enrollmentData || []).filter(e => e.course) as CourseEnrollment[];
      setEnrollments(validEnrollments);

      // Fetch available published courses
      const { data: coursesData } = await supabase
        .from('courses')
        .select('*')
        .eq('is_published', true);

      // Filter out already enrolled courses
      const enrolledCourseIds = validEnrollments.map(e => e.course.id);
      const available = (coursesData || []).filter(c => !enrolledCourseIds.includes(c.id));
      setAvailableCourses(available);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const startCourse = (courseId: string) => {
    navigate(`/course/${courseId}/learn`);
  };

  const completedCount = enrollments.filter(e => e.progress === 100).length;
  const activeCount = enrollments.filter(e => e.progress < 100).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <SigmaLogo size="md" />
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Выйти
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-6 py-10">
        <div className="mb-10">
          <h1 className="font-display text-3xl font-bold mb-2">
            Добро пожаловать! 👋
          </h1>
          <p className="text-muted-foreground">
            Ваш личный кабинет ученика
          </p>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-6 mb-10">
          <div className="feature-card">
            <div className="w-12 h-12 rounded-xl bg-sigma-blue/10 flex items-center justify-center mb-4">
              <BookOpen className="w-6 h-6 text-sigma-blue" />
            </div>
            <div className="text-3xl font-bold font-display mb-1">{activeCount}</div>
            <div className="text-muted-foreground text-sm">Активных курсов</div>
          </div>

          <div className="feature-card">
            <div className="w-12 h-12 rounded-xl bg-sigma-green/10 flex items-center justify-center mb-4">
              <Trophy className="w-6 h-6 text-sigma-green" />
            </div>
            <div className="text-3xl font-bold font-display mb-1">{completedCount}</div>
            <div className="text-muted-foreground text-sm">Завершено курсов</div>
          </div>

          <div className="feature-card">
            <div className="w-12 h-12 rounded-xl bg-sigma-purple/10 flex items-center justify-center mb-4">
              <Clock className="w-6 h-6 text-sigma-purple" />
            </div>
            <div className="text-3xl font-bold font-display mb-1">{enrollments.length}</div>
            <div className="text-muted-foreground text-sm">Всего записей</div>
          </div>

          <div className="feature-card">
            <div className="w-12 h-12 rounded-xl bg-sigma-cyan/10 flex items-center justify-center mb-4">
              <MessageCircle className="w-6 h-6 text-sigma-cyan" />
            </div>
            <div className="text-3xl font-bold font-display mb-1">ИИ</div>
            <div className="text-muted-foreground text-sm">Помощник доступен</div>
          </div>
        </div>

        {/* My courses */}
        <div className="mb-10">
          <h2 className="font-display text-2xl font-bold mb-6">Мои курсы</h2>
          
          {loading ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : enrollments.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <BookOpen className="w-10 h-10 text-primary" />
              </div>
              <h3 className="font-display text-xl font-semibold mb-2">
                Пока нет курсов
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Выберите курс из доступных ниже или свяжитесь с вашей организацией для получения доступа.
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {enrollments.map((enrollment) => (
                <div key={enrollment.id} className="feature-card">
                  <h3 className="font-display font-semibold text-lg mb-2">
                    {enrollment.course.title}
                  </h3>
                  <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
                    {enrollment.course.description || 'Без описания'}
                  </p>
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span>Прогресс</span>
                      <span>{enrollment.progress}%</span>
                    </div>
                    <Progress value={enrollment.progress} className="h-2" />
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={() => startCourse(enrollment.course.id)}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {enrollment.progress > 0 ? 'Продолжить' : 'Начать'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available courses */}
        {availableCourses.length > 0 && (
          <div>
            <h2 className="font-display text-2xl font-bold mb-6">Доступные курсы</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {availableCourses.map((course) => (
                <div key={course.id} className="feature-card">
                  <h3 className="font-display font-semibold text-lg mb-2">
                    {course.title}
                  </h3>
                  <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
                    {course.description || 'Без описания'}
                  </p>
                  {course.duration && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                      <Clock className="w-4 h-4" />
                      {course.duration}
                    </div>
                  )}
                  <Button 
                    variant="outline"
                    className="w-full" 
                    onClick={() => startCourse(course.id)}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Записаться
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default StudentDashboard;
