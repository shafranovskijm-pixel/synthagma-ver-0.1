import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen,
  MessageCircle,
  Trophy,
  Settings,
  LogOut,
  Play,
  Clock,
  CheckCircle2,
  Lock,
  Send,
  Sparkles,
  Loader2,
  Library,
  Eye
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

interface Course {
  id: string;
  title: string;
  description: string | null;
  duration: string | null;
  progress: number;
  totalLessons: number;
  completedLessons: number;
  status: "in_progress" | "completed" | "locked";
}

interface Profile {
  full_name: string | null;
  organization_name: string | null;
  organization_id: string | null;
}

interface Branding {
  coverUrl: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  showOrgName: boolean;
}

interface DashboardSettings {
  showLibrary: boolean;
  showAchievements: boolean;
  showAiChat: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const initialMessages: ChatMessage[] = [
  { role: "assistant", content: "Привет! Я ИИ-помощник платформы СИНТАГМА. Чем могу помочь с обучением?" },
];

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<"courses" | "chat">("courses");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>({
    showLibrary: true,
    showAchievements: true,
    showAiChat: true
  });
  const [loading, setLoading] = useState(true);
  const [totalTimeSpent, setTotalTimeSpent] = useState(0);
  const [totalCompletedLessons, setTotalCompletedLessons] = useState(0);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  useEffect(() => {
    // Check for preview mode
    const preview = localStorage.getItem('previewStudentDashboard');
    if (preview === 'true') {
      setIsPreviewMode(true);
      localStorage.removeItem('previewStudentDashboard');
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Load profile with organization
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, organization_id, organizations(name, branding, student_dashboard_settings)")
        .eq("user_id", user.id)
        .single();

      if (profileData) {
        const org = profileData.organizations as any;
        setProfile({
          full_name: profileData.full_name,
          organization_name: org?.name || null,
          organization_id: profileData.organization_id
        });

        // Load branding from organization
        if (org?.branding && typeof org.branding === 'object') {
          const b = org.branding as Record<string, unknown>;
          setBranding({
            coverUrl: (b.coverUrl as string) || '',
            primaryColor: (b.primaryColor as string) || '#6366f1',
            secondaryColor: (b.secondaryColor as string) || '#8b5cf6',
            logoUrl: (b.logoUrl as string) || '',
            showOrgName: b.showOrgName !== false
          });
        }

        // Load dashboard settings from organization
        if (org?.student_dashboard_settings && typeof org.student_dashboard_settings === 'object') {
          const s = org.student_dashboard_settings as Record<string, unknown>;
          setDashboardSettings({
            showLibrary: s.showLibrary !== false,
            showAchievements: s.showAchievements !== false,
            showAiChat: s.showAiChat !== false
          });
        }
      }

      // Load enrollments with courses
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select(`
          id,
          progress,
          status,
          time_spent,
          course_id,
          courses(id, title, description, duration)
        `)
        .eq("user_id", user.id);

      if (enrollments) {
        const coursesData: Course[] = [];
        let totalTime = 0;
        let completedLessonsTotal = 0;

        for (const enrollment of enrollments) {
          const course = enrollment.courses as any;
          if (!course) continue;

          totalTime += enrollment.time_spent || 0;

          // Get lesson count
          const { count: totalLessons } = await supabase
            .from("lessons")
            .select("id", { count: "exact", head: true })
            .eq("course_id", course.id);

          // Get lesson ids for this course
          const { data: lessonIds } = await supabase
            .from("lessons")
            .select("id")
            .eq("course_id", course.id);

          // Get completed lessons count
          let completedLessons = 0;
          if (lessonIds && lessonIds.length > 0) {
            const { count } = await supabase
              .from("lesson_progress")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id)
              .in("lesson_id", lessonIds.map(l => l.id))
              .eq("completed", true);
            completedLessons = count || 0;
          }

          completedLessonsTotal += completedLessons;

          coursesData.push({
            id: course.id,
            title: course.title,
            description: course.description,
            duration: course.duration,
            progress: enrollment.progress || 0,
            totalLessons: totalLessons || 0,
            completedLessons: completedLessons,
            status: enrollment.status === "completed" ? "completed" :
                   enrollment.progress > 0 ? "in_progress" : "in_progress"
          });
        }

        setCourses(coursesData);
        setTotalTimeSpent(totalTime);
        setTotalCompletedLessons(completedLessonsTotal);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isAiLoading) return;

    const userMessage: ChatMessage = { role: "user", content: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsAiLoading(true);

    try {
      const response = await supabase.functions.invoke("student-chat", {
        body: {
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          })),
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Ошибка ИИ");
      }

      const data = response.data;

      if (data.error) {
        throw new Error(data.error);
      }

      setMessages(prev => [...prev, {
        role: "assistant" as const,
        content: data.content
      }]);
    } catch (error) {
      console.error("AI chat error:", error);
      setMessages(prev => [...prev, {
        role: "assistant" as const,
        content: "Извините, произошла ошибка. Попробуйте ещё раз позже."
      }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const totalProgress = courses.length > 0
    ? Math.round(courses.reduce((acc, c) => acc + c.progress, 0) / courses.length)
    : 0;

  const firstName = profile?.full_name?.split(" ")[0] || "Ученик";

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}ч ${mins}м`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Preview Mode Banner */}
      {isPreviewMode && (
        <div className="fixed top-0 left-0 right-0 bg-primary text-primary-foreground py-2 px-4 text-center text-sm z-50 flex items-center justify-center gap-2">
          <Eye className="w-4 h-4" />
          Режим предпросмотра личного кабинета ученика
          <Button
            size="sm"
            variant="secondary"
            className="ml-4 h-7 rounded-lg"
            onClick={() => window.close()}
          >
            Закрыть предпросмотр
          </Button>
        </div>
      )}

      {/* Sidebar */}
      <aside className={`w-64 bg-card border-r border-border flex flex-col ${isPreviewMode ? 'mt-10' : ''}`}>
        <div className="p-6 border-b border-border">
          {/* Custom branding logo or default */}
          {branding?.logoUrl ? (
            <div className="flex items-center gap-3">
              <img 
                src={branding.logoUrl} 
                alt="Логотип" 
                className="w-10 h-10 object-contain rounded-lg"
              />
              {branding.showOrgName && profile?.organization_name && (
                <span className="font-display font-bold text-lg truncate">
                  {profile.organization_name}
                </span>
              )}
            </div>
          ) : (
            <SigmaLogo size="md" />
          )}
          <div className="mt-4 p-3 bg-secondary rounded-xl">
            <div className="font-semibold text-sm">{profile?.full_name || "Ученик"}</div>
            <div className="text-xs text-muted-foreground">{profile?.organization_name || "Организация"}</div>
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
              Мои курсы
            </button>
            {dashboardSettings.showAiChat && (
              <button
                onClick={() => setActiveTab("chat")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                  activeTab === "chat"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                <MessageCircle className="w-5 h-5" />
                ИИ-помощник
                <span className="ml-auto w-2 h-2 rounded-full bg-sigma-green animate-pulse" />
              </button>
            )}
            {dashboardSettings.showLibrary && (
              <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-secondary transition-colors">
                <Library className="w-5 h-5" />
                Библиотека
              </button>
            )}
            {dashboardSettings.showAchievements && (
              <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-secondary transition-colors">
                <Trophy className="w-5 h-5" />
                Достижения
              </button>
            )}
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
      <main className={`flex-1 overflow-auto ${isPreviewMode ? 'mt-10' : ''}`}>
        {activeTab === "courses" && (
          <>
            {/* Cover Image / Header */}
            {branding?.coverUrl ? (
              <div 
                className="relative h-40 bg-cover bg-center"
                style={{ backgroundImage: `url(${branding.coverUrl})` }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80" />
                <div className="absolute bottom-0 left-0 right-0 px-8 py-4">
                  <h1 className="font-display text-2xl font-bold text-white drop-shadow-lg">
                    Добро пожаловать, {firstName}!
                  </h1>
                  <p className="text-white/80 drop-shadow">Продолжайте обучение</p>
                </div>
              </div>
            ) : (
              <header className="bg-card border-b border-border px-8 py-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="font-display text-2xl font-bold">Добро пожаловать, {firstName}!</h1>
                    <p className="text-muted-foreground">Продолжайте обучение</p>
                  </div>
                </div>
              </header>
            )}

            <div className="p-8">
              {/* Progress overview */}
              <div 
                className={`rounded-2xl p-6 mb-8 text-white ${!branding ? 'bg-gradient-to-r from-primary via-accent to-sigma-purple' : ''}`}
                style={branding ? {
                  background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})`
                } : undefined}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-xl font-semibold mb-2">Общий прогресс</h2>
                    <p className="text-white/80 mb-4">Вы прошли {totalProgress}% всех курсов</p>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5" />
                        <span>{formatTime(totalTimeSpent)} обучения</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5" />
                        <span>{totalCompletedLessons} уроков пройдено</span>
                      </div>
                    </div>
                  </div>
                  <div className="relative w-32 h-32">
                    <svg className="w-32 h-32 transform -rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        fill="none"
                        stroke="rgba(255,255,255,0.2)"
                        strokeWidth="12"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        fill="none"
                        stroke="white"
                        strokeWidth="12"
                        strokeDasharray={`${totalProgress * 3.52} 352`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl font-bold font-display">{totalProgress}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Courses */}
              <h2 className="font-display text-xl font-semibold mb-4">Мои курсы</h2>
              
              {courses.length === 0 ? (
                <div className="glass-card rounded-2xl p-12 text-center">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <BookOpen className="w-10 h-10 text-primary" />
                  </div>
                  <h3 className="font-display text-xl font-semibold mb-2">
                    Пока нет курсов
                  </h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Свяжитесь с вашей организацией для получения доступа к курсам.
                  </p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {courses.map((course) => (
                    <div
                      key={course.id}
                      className={`bg-card rounded-2xl border border-border overflow-hidden hover-lift group cursor-pointer ${
                        course.status === "locked" ? "opacity-60" : ""
                      }`}
                    >
                      <div className={`h-32 relative ${
                        course.status === "completed"
                          ? "bg-gradient-to-br from-sigma-green to-accent"
                          : course.status === "locked"
                          ? "bg-gradient-to-br from-muted to-secondary"
                          : "bg-gradient-to-br from-primary via-accent to-sigma-purple"
                      }`}>
                        {course.status === "locked" && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Lock className="w-10 h-10 text-white/50" />
                          </div>
                        )}
                        {course.status === "completed" && (
                          <div className="absolute top-4 right-4 bg-white/20 rounded-full p-2">
                            <CheckCircle2 className="w-6 h-6 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="p-6">
                        <h3 className="font-display font-semibold text-lg mb-2">{course.title}</h3>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
                          <div className="flex items-center gap-1">
                            <BookOpen className="w-4 h-4" />
                            {course.completedLessons}/{course.totalLessons}
                          </div>
                          {course.duration && (
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {course.duration}
                            </div>
                          )}
                        </div>
                        <div className="mb-4">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-muted-foreground">Прогресс</span>
                            <span className="font-medium">{course.progress}%</span>
                          </div>
                          <Progress value={course.progress} className="h-2" />
                        </div>
                        <Button
                          className={`w-full rounded-xl gap-2 ${
                            course.status === "locked"
                              ? ""
                              : course.status === "completed"
                              ? ""
                              : "btn-gradient"
                          }`}
                          variant={course.status === "locked" || course.status === "completed" ? "outline" : "default"}
                          disabled={course.status === "locked"}
                          onClick={() => {
                            if (course.status !== "locked") {
                              navigate(`/course/${course.id}/learn`);
                            }
                          }}
                        >
                          {course.status === "locked" && <Lock className="w-4 h-4" />}
                          {course.status === "completed" && <CheckCircle2 className="w-4 h-4" />}
                          {course.status === "in_progress" && <Play className="w-4 h-4" />}
                          {course.status === "locked"
                            ? "Недоступен"
                            : course.status === "completed"
                            ? "Повторить"
                            : "Продолжить"
                          }
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "chat" && (
          <div className="h-screen flex flex-col">
            {/* Chat header */}
            <header className="bg-card border-b border-border px-8 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="font-display font-bold">ИИ-помощник</h1>
                  <p className="text-sm text-sigma-green flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-sigma-green animate-pulse" />
                    Онлайн
                  </p>
                </div>
              </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-auto p-6 space-y-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] px-4 py-3 rounded-2xl ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-md"
                      : "bg-secondary rounded-tl-md"
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isAiLoading && (
                <div className="flex justify-start">
                  <div className="bg-secondary px-4 py-3 rounded-2xl rounded-tl-md flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-muted-foreground">Думаю...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-6 bg-card border-t border-border">
              <div className="flex gap-3 max-w-4xl mx-auto">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !isAiLoading && handleSendMessage()}
                  placeholder="Задайте вопрос по материалам курса..."
                  className="flex-1 h-12 rounded-xl"
                  disabled={isAiLoading}
                />
                <Button
                  onClick={handleSendMessage}
                  className="btn-gradient rounded-xl px-6 h-12"
                  disabled={isAiLoading}
                >
                  {isAiLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </Button>
              </div>
              <p className="text-center text-xs text-muted-foreground mt-3">
                ИИ-помощник поможет разобраться в материалах курса и ответит на ваши вопросы
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
