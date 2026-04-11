import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, Clock, ArrowLeft, CheckCircle2, Play, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

interface CourseData {
  id: string;
  title: string;
  description: string | null;
  duration: string | null;
  price: number;
  cover_image_url: string | null;
  landing_content: any;
  organization_id: string;
  category_id: string | null;
}

interface LessonInfo {
  id: string;
  title: string;
  type: string;
  order_index: number;
}

export default function CourseLanding() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState<CourseData | null>(null);
  const [lessons, setLessons] = useState<LessonInfo[]>([]);
  const [orgName, setOrgName] = useState("");
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    if (courseId) loadCourse();
  }, [courseId]);

  const loadCourse = async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      const { data: courseData } = await supabase
        .from("courses")
        .select("id, title, description, duration, price, cover_image_url, landing_content, organization_id, category_id")
        .eq("id", courseId)
        .eq("is_published", true)
        .maybeSingle();

      if (!courseData) {
        toast.error("Курс не найден");
        navigate(-1);
        return;
      }
      setCourse(courseData as any);

      const [lessonsRes, orgRes] = await Promise.all([
        supabase.from("lessons").select("id, title, type, order_index").eq("course_id", courseId).order("order_index"),
        supabase.from("organizations").select("name").eq("id", courseData.organization_id).maybeSingle(),
      ]);
      setLessons(lessonsRes.data || []);
      setOrgName(orgRes.data?.name || "");

      if (user) {
        const { data: enrollment } = await supabase
          .from("enrollments")
          .select("id")
          .eq("user_id", user.id)
          .eq("course_id", courseId)
          .maybeSingle();
        setIsEnrolled(!!enrollment);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleEnroll = async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    if (!course) return;

    if (course.price > 0) {
      toast.info("Платная запись", { description: "Свяжитесь с организацией для записи на курс" });
      return;
    }

    setEnrolling(true);
    try {
      const { error } = await supabase.from("enrollments").insert({
        user_id: user.id,
        course_id: course.id,
      });
      if (error) throw error;
      toast.success("Вы записаны на курс!");
      navigate(`/course/${course.id}/learn`);
    } catch (e: any) {
      toast.error("Ошибка записи", { description: e.message });
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!course) return null;

  const landingContent = course.landing_content as Record<string, any> | null;
  const externalUrl = landingContent?.external_url;
  if (externalUrl) {
    window.location.href = externalUrl;
    return null;
  }

  const lessonTypeIcon = (type: string) => {
    switch (type) {
      case "video": return "🎬";
      case "test": return "📝";
      case "practice": return "💻";
      default: return "📖";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative">
        <div
          className="h-64 md:h-80 bg-gradient-to-br from-primary/20 to-accent/20"
          style={course.cover_image_url ? { backgroundImage: `url(${course.cover_image_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>

        <div className="absolute top-4 left-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="bg-background/80 backdrop-blur-sm gap-1">
            <ArrowLeft className="w-4 h-4" />Назад
          </Button>
        </div>

        <div className="relative max-w-4xl mx-auto px-6 -mt-20">
          <div className="bg-card rounded-2xl border border-border p-8 shadow-lg">
            <div className="flex flex-col md:flex-row gap-6 justify-between">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-2">{orgName}</p>
                <h1 className="text-2xl md:text-3xl font-bold mb-3">{course.title}</h1>
                {course.description && <p className="text-muted-foreground mb-4">{course.description}</p>}
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {course.duration && <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{course.duration}</span>}
                  <span className="flex items-center gap-1.5"><BookOpen className="w-4 h-4" />{lessons.length} уроков</span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-3 shrink-0">
                {course.price > 0 ? (
                  <div className="text-3xl font-bold text-primary">{course.price.toLocaleString("ru-RU")} ₽</div>
                ) : (
                  <Badge className="text-base px-4 py-1" variant="secondary">Бесплатно</Badge>
                )}
                {isEnrolled ? (
                  <Button size="lg" className="gap-2" onClick={() => navigate(`/course/${course.id}/learn`)}>
                    <Play className="w-5 h-5" />Продолжить обучение
                  </Button>
                ) : (
                  <Button size="lg" className="gap-2" onClick={handleEnroll} disabled={enrolling}>
                    {enrolling ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingCart className="w-5 h-5" />}
                    {course.price > 0 ? "Купить курс" : "Записаться бесплатно"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Program */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h2 className="text-xl font-bold mb-6">Программа курса</h2>
        {lessons.length === 0 ? (
          <p className="text-muted-foreground">Программа будет доступна после записи</p>
        ) : (
          <div className="space-y-2">
            {lessons.map((lesson, i) => (
              <div key={lesson.id} className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-sm font-medium shrink-0">
                  {i + 1}
                </div>
                <span className="text-lg">{lessonTypeIcon(lesson.type)}</span>
                <span className="font-medium text-sm">{lesson.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* Custom landing blocks */}
        {landingContent?.blocks && Array.isArray(landingContent.blocks) && (
          <div className="mt-12 space-y-8">
            {landingContent.blocks.map((block: any, i: number) => (
              <div key={i} className="prose prose-sm max-w-none">
                {block.title && <h3>{block.title}</h3>}
                {block.text && <p>{block.text}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
