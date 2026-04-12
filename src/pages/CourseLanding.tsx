import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, BookOpen, Clock, ArrowLeft, Play, ShoppingCart } from "lucide-react";
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
  accent_color: string | null;
  slug: string | null;
}

interface LessonInfo {
  id: string;
  title: string;
  type: string;
  order_index: number;
}

// Analytics injection
function useAnalytics(analytics: any) {
  useEffect(() => {
    if (!analytics) return;
    const scripts: HTMLScriptElement[] = [];

    // Yandex Metrika
    if (analytics.yandex_metrika_id) {
      const s = document.createElement("script");
      s.innerHTML = `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r)return}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${analytics.yandex_metrika_id},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});`;
      document.head.appendChild(s);
      scripts.push(s);
    }

    // Google Analytics
    if (analytics.ga_tracking_id) {
      const s1 = document.createElement("script");
      s1.async = true;
      s1.src = `https://www.googletagmanager.com/gtag/js?id=${analytics.ga_tracking_id}`;
      document.head.appendChild(s1);
      scripts.push(s1);
      const s2 = document.createElement("script");
      s2.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${analytics.ga_tracking_id}');`;
      document.head.appendChild(s2);
      scripts.push(s2);
    }

    // Meta Pixel
    if (analytics.meta_pixel_id) {
      const s = document.createElement("script");
      s.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${analytics.meta_pixel_id}');fbq('track','PageView');`;
      document.head.appendChild(s);
      scripts.push(s);
    }

    return () => {
      scripts.forEach((s) => s.remove());
    };
  }, [analytics]);
}

export default function CourseLanding() {
  const { courseId, slug } = useParams<{ courseId?: string; slug?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState<CourseData | null>(null);
  const [lessons, setLessons] = useState<LessonInfo[]>([]);
  const [orgName, setOrgName] = useState("");
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState<{ value: number; type: string } | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);

  const landingContent = course?.landing_content as Record<string, any> | null;
  const analytics = landingContent?.analytics;
  useAnalytics(analytics);

  useEffect(() => {
    if (courseId || slug) loadCourse();
  }, [courseId, slug]);

  const loadCourse = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("courses")
        .select("id, title, description, duration, price, cover_image_url, landing_content, organization_id, category_id, accent_color, slug")
        .eq("is_published", true);

      if (slug) {
        query = query.eq("slug", slug);
      } else if (courseId) {
        query = query.eq("id", courseId);
      }

      const { data: courseData } = await query.maybeSingle();

      if (!courseData) {
        toast.error("Курс не найден");
        navigate(-1);
        return;
      }
      setCourse(courseData as any);

      const [lessonsRes, orgRes] = await Promise.all([
        supabase.from("lessons").select("id, title, type, order_index").eq("course_id", courseData.id).order("order_index"),
        supabase.from("organizations").select("name").eq("id", courseData.organization_id).maybeSingle(),
      ]);
      setLessons(lessonsRes.data || []);
      setOrgName(orgRes.data?.name || "");

      if (user) {
        const { data: enrollment } = await supabase
          .from("enrollments")
          .select("id")
          .eq("user_id", user.id)
          .eq("course_id", courseData.id)
          .maybeSingle();
        setIsEnrolled(!!enrollment);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const checkPromoCode = async () => {
    if (!promoCode.trim() || !course) return;
    setPromoChecking(true);
    const { data } = await supabase
      .from("course_promo_codes")
      .select("discount_value, discount_type, is_active, max_uses, used_count, valid_until")
      .eq("course_id", course.id)
      .eq("code", promoCode.toUpperCase())
      .eq("is_active", true)
      .maybeSingle();

    if (data && (!data.max_uses || data.used_count < data.max_uses) && (!data.valid_until || new Date(data.valid_until) > new Date())) {
      setPromoDiscount({ value: data.discount_value, type: data.discount_type });
      toast.success(`Промокод применён: -${data.discount_value}${data.discount_type === "percent" ? "%" : "₽"}`);
    } else {
      setPromoDiscount(null);
      toast.error("Промокод недействителен");
    }
    setPromoChecking(false);
  };

  const getDiscountedPrice = () => {
    if (!course || !promoDiscount) return course?.price || 0;
    if (promoDiscount.type === "percent") {
      return Math.max(0, Math.round(course.price * (1 - promoDiscount.value / 100)));
    }
    return Math.max(0, course.price - promoDiscount.value);
  };

  const handleEnroll = async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    if (!course) return;

    const finalPrice = promoDiscount ? getDiscountedPrice() : course.price;
    if (finalPrice > 0) {
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

      // Increment promo usage
      if (promoDiscount && promoCode) {
        await supabase
          .from("course_promo_codes")
          .update({ used_count: (await supabase.from("course_promo_codes").select("used_count").eq("course_id", course.id).eq("code", promoCode.toUpperCase()).single()).data?.used_count + 1 || 1 })
          .eq("course_id", course.id)
          .eq("code", promoCode.toUpperCase());
      }

      // Fire analytics events
      if (analytics?.yandex_goal_id && (window as any).ym) {
        (window as any).ym(analytics.yandex_metrika_id, "reachGoal", analytics.yandex_goal_id);
      }
      if (analytics?.ga_event_name && (window as any).gtag) {
        (window as any).gtag("event", analytics.ga_event_name);
      }
      if (analytics?.meta_pixel_id && (window as any).fbq) {
        (window as any).fbq("track", "Lead");
      }

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

  const externalUrl = landingContent?.external_url;
  if (externalUrl) {
    window.location.href = externalUrl;
    return null;
  }

  const accent = course.accent_color || undefined;
  const enrollmentForm = landingContent?.enrollment_form;
  const finalPrice = promoDiscount ? getDiscountedPrice() : course.price;

  const lessonTypeIcon = (type: string) => {
    switch (type) {
      case "video": return "🎬";
      case "test": return "📝";
      case "practice": return "💻";
      default: return "📖";
    }
  };

  return (
    <div className="min-h-screen bg-background" style={accent ? { "--landing-accent": accent } as any : undefined}>
      {/* Hero */}
      <div className="relative">
        <div
          className="h-64 md:h-80"
          style={{
            background: course.cover_image_url
              ? `url(${course.cover_image_url}) center/cover`
              : accent
                ? `linear-gradient(135deg, ${accent}33, ${accent}11)`
                : undefined,
          }}
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
                  <div className="text-right">
                    {promoDiscount && (
                      <div className="text-lg text-muted-foreground line-through">{course.price.toLocaleString("ru-RU")} ₽</div>
                    )}
                    <div className="text-3xl font-bold" style={accent ? { color: accent } : undefined}>
                      {finalPrice.toLocaleString("ru-RU")} ₽
                    </div>
                  </div>
                ) : (
                  <Badge className="text-base px-4 py-1" variant="secondary">Бесплатно</Badge>
                )}
                {isEnrolled ? (
                  <Button size="lg" className="gap-2" onClick={() => navigate(`/course/${course.id}/learn`)} style={accent ? { backgroundColor: accent } : undefined}>
                    <Play className="w-5 h-5" />Продолжить обучение
                  </Button>
                ) : (
                  <>
                    {course.price > 0 && (
                      <div className="flex gap-2 w-full">
                        <Input
                          value={promoCode}
                          onChange={(e) => setPromoCode(e.target.value)}
                          placeholder="Промокод"
                          className="text-sm"
                        />
                        <Button variant="outline" size="sm" onClick={checkPromoCode} disabled={promoChecking}>
                          {promoChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : "OK"}
                        </Button>
                      </div>
                    )}
                    <Button
                      size="lg"
                      className="gap-2 w-full"
                      onClick={handleEnroll}
                      disabled={enrolling}
                      style={accent ? { backgroundColor: accent } : undefined}
                    >
                      {enrolling ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingCart className="w-5 h-5" />}
                      {enrollmentForm?.button_text || (finalPrice > 0 ? "Купить курс" : "Записаться бесплатно")}
                    </Button>
                  </>
                )}
              </div>
            </div>
            {enrollmentForm?.subtitle && (
              <p className="text-sm text-muted-foreground mt-4 text-center">{enrollmentForm.subtitle}</p>
            )}
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
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0"
                  style={accent ? { backgroundColor: `${accent}22`, color: accent } : { backgroundColor: "hsl(var(--secondary))" }}
                >
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
