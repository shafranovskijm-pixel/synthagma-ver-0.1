import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, ArrowLeft } from "lucide-react";
import { getBaseUrl } from "@/utils/getBaseUrl";
import { toast } from "sonner";
import { LandingHeroSection } from "@/components/course-landing/LandingHeroSection";
import { LandingAudienceSection } from "@/components/course-landing/LandingAudienceSection";
import { LandingProgramSection } from "@/components/course-landing/LandingProgramSection";
import { LandingBenefitsSection } from "@/components/course-landing/LandingBenefitsSection";
import { LandingCtaSection } from "@/components/course-landing/LandingCtaSection";
import { LandingLearnSection } from "@/components/course-landing/LandingLearnSection";
import { LandingProcessSection } from "@/components/course-landing/LandingProcessSection";
import { LandingTeachersSection } from "@/components/course-landing/LandingTeachersSection";
import { LandingReviewsSection } from "@/components/course-landing/LandingReviewsSection";
import { LandingPricingSection } from "@/components/course-landing/LandingPricingSection";
import { LandingFaqSection } from "@/components/course-landing/LandingFaqSection";
import { LandingThemeProvider } from "@/components/course-landing/LandingThemeProvider";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { getEnrollmentConfig } from "@/lib/landing-enrollment";

interface CourseData {
  id: string;
  title: string;
  description: string | null;
  duration: string | null;
  price: number;
  cover_image_url: string | null;
  landing_content: any;
  organization_id: string;
  accent_color: string | null;
  slug: string | null;
  require_enrollment_approval: boolean;
}

// Analytics injection
function useAnalytics(analytics: any) {
  useEffect(() => {
    if (!analytics) return;
    const scripts: HTMLScriptElement[] = [];
    if (analytics.yandex_metrika_id) {
      const s = document.createElement("script");
      s.innerHTML = `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r)return}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${analytics.yandex_metrika_id},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});`;
      document.head.appendChild(s);
      scripts.push(s);
    }
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
    if (analytics.meta_pixel_id) {
      const s = document.createElement("script");
      s.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${analytics.meta_pixel_id}');fbq('track','PageView');`;
      document.head.appendChild(s);
      scripts.push(s);
    }
    return () => { scripts.forEach((s) => s.remove()); };
  }, [analytics]);
}

export default function CourseLanding() {
  const { courseId, slug } = useParams<{ courseId?: string; slug?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState<CourseData | null>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [orgName, setOrgName] = useState("");
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState<{ value: number; type: string } | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const landingContent = course?.landing_content as Record<string, any> | null;
  const analytics = landingContent?.analytics;
  const enrollmentConfig = getEnrollmentConfig(landingContent);
  useAnalytics(analytics);

  useEffect(() => {
    if (courseId || slug) loadCourse();
  }, [courseId, slug]);

  const loadCourse = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("courses")
        .select("id, title, description, duration, price, cover_image_url, landing_content, organization_id, accent_color, slug, require_enrollment_approval")
        .eq("is_published", true);

      if (slug) query = query.eq("slug", slug);
      else if (courseId) query = query.eq("id", courseId);

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
        const [enrollmentRes, requestRes] = await Promise.all([
          supabase.from("enrollments").select("id").eq("user_id", user.id).eq("course_id", courseData.id).maybeSingle(),
          supabase.from("enrollment_requests").select("id").eq("user_id", user.id).eq("course_id", courseData.id).eq("status", "pending").maybeSingle(),
        ]);
        setIsEnrolled(!!enrollmentRes.data);
        setHasPendingRequest(!!requestRes.data);
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
    if (promoDiscount.type === "percent") return Math.max(0, Math.round(course.price * (1 - promoDiscount.value / 100)));
    return Math.max(0, course.price - promoDiscount.value);
  };

  const handleEnroll = async (formData?: { name: string; email: string; phone: string; extra?: Record<string, string> }) => {
    if (!course) return;

    // ── Режим INSTANT — самозачисление через edge-функцию (не требует логина) ──
    if (enrollmentConfig.mode === "instant" && formData?.email && formData?.name) {
      try {
        const { data, error } = await supabase.functions.invoke("landing-self-enroll", {
          body: {
            course_id: course.id,
            full_name: formData.name,
            email: formData.email,
            phone: formData.phone || undefined,
            extra: formData.extra,
            consent: true,
          },
        });
        if (error) throw error;
        if ((data as any)?.error) {
          toast.error((data as any).error);
          return;
        }
        // Редирект на success_url, если задан
        if (enrollmentConfig.success_url) {
          window.location.href = enrollmentConfig.success_url;
          return;
        }
        setJustSubmitted(true);
        toast.success((data as any)?.message || "Вы зачислены на курс");
      } catch (e: any) {
        console.error("self-enroll error:", e);
        toast.error("Не удалось завершить запись", { description: e.message });
      }
      return;
    }

    // ── Режим REQUEST / PAYMENT — старая логика заявки ─────────
    if (!user) {
      navigate("/login");
      return;
    }

    const finalPrice = promoDiscount ? getDiscountedPrice() : course.price;

    if (finalPrice > 0) {
      try {
        // Get student profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("user_id", user.id)
          .maybeSingle();

        const studentName = formData?.name || profile?.full_name || profile?.email || "Ученик";

        const { data: existingRequest } = await supabase
          .from("enrollment_requests")
          .select("id")
          .eq("user_id", user.id)
          .eq("course_id", course.id)
          .eq("status", "pending")
          .maybeSingle();

        if (existingRequest) {
          toast.info("Вы уже отправляли заявку на этот курс");
          setHasPendingRequest(true);
          return;
        }

        const { error: requestError } = await supabase.from("enrollment_requests").insert({
          user_id: user.id,
          course_id: course.id,
          status: "pending"
        } as any);
        if (requestError) throw requestError;

        const notifyResult = await supabase.functions.invoke("notify-enrollment-request", {
          body: { course_id: course.id, student_name: studentName },
        });
        if (notifyResult.error) {
          console.error("Purchase request notify error:", notifyResult.error);
        }

        setHasPendingRequest(true);
        toast.success("Заявка отправлена! Она появится в заявках, чате и уведомлениях организации");
      } catch (e: any) {
        console.error("Purchase request error:", e);
        toast.error("Ошибка отправки заявки", { description: e.message });
      }
      return;
    }

    // Free course — always create enrollment request
    try {
      const { error } = await supabase.from("enrollment_requests").insert({ 
        user_id: user.id, 
        course_id: course.id,
        status: "pending"
      } as any);
      if (error) {
        if (error.code === "23505") {
          toast.info("Вы уже отправляли заявку на этот курс");
        } else {
          throw error;
        }
        return;
      }

      const notifyResult = await supabase.functions.invoke("notify-enrollment-request", {
        body: { course_id: course.id },
      });
      if (notifyResult.error) {
        console.error("Free request notify error:", notifyResult.error);
      }

      setHasPendingRequest(true);
      toast.success("Заявка отправлена! Она появится в заявках, чате и уведомлениях организации");
    } catch (e: any) {
      toast.error("Ошибка отправки заявки", { description: e.message });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  if (!course) return null;

  const externalUrl = landingContent?.external_url;
  if (externalUrl) {
    window.location.href = externalUrl;
    return null;
  }

  const finalPrice = promoDiscount ? getDiscountedPrice() : course.price;

  // Landing content with defaults
  const hero = landingContent?.hero || {};
  const audience = landingContent?.audience || { title: "Кому подойдёт этот курс?", description: "", items: [] };
  const learn = landingContent?.learn || { title: "", description: "", items: [] };
  const process = landingContent?.process || { title: "", content: "" };
  const benefits = landingContent?.benefits || [];
  const teachers = landingContent?.teachers || { title: "Преподаватели курса", description: "", items: [] };
  const reviews = landingContent?.reviews || { title: "Отзывы о курсе", items: [] };
  const pricing = landingContent?.pricing || { title: "Выберите подходящий тариф", tiers: [] };
  const faq = landingContent?.faq || { title: "Часто задаваемые вопросы", items: [] };
  const cta = landingContent?.cta || { title: "Начните обучение сегодня", subtitle: "Заполните форму и мы свяжемся с вами" };
  const sectionsOrder: string[] = landingContent?.sections_order || ["hero", "audience", "learn", "program", "process", "benefits", "teachers", "reviews", "pricing", "faq", "cta"];
  const sectionsHidden: string[] = landingContent?.sections_hidden || [];

  // Migrate old string[] audience items
  const audienceItems = audience.items?.length > 0 && typeof audience.items[0] === "string"
    ? audience.items.map((s: string) => ({ icon: "check-circle", title: s, description: "" }))
    : audience.items || [];

  const enrollBtn = isEnrolled ? (
    <Button size="lg" className="gap-2" onClick={() => navigate(`/course/${course.id}/learn`)}>
      <Play className="w-5 h-5" />Продолжить обучение
    </Button>
  ) : hasPendingRequest ? (
    <Button size="lg" disabled className="gap-2 opacity-80">
      Заявка отправлена
    </Button>
  ) : (
    <div className="flex items-center gap-2">
      {course.price > 0 && (
        <>
          <Input value={promoCode} onChange={(e) => setPromoCode(e.target.value)} placeholder="Промокод" className="bg-white/10 border-white/20 text-white placeholder:text-white/50 w-32" />
          <Button variant="secondary" size="sm" onClick={checkPromoCode} disabled={promoChecking}>
            {promoChecking ? <SigmaSpinner size="sm" /> : "OK"}
          </Button>
        </>
      )}
      <Button size="lg" onClick={() => handleEnroll()} className="bg-white text-black hover:bg-white/90">
        {finalPrice > 0 ? "Купить курс" : "Оставить заявку"}
      </Button>
    </div>
  );

  const renderPublicSection = (sectionId: string) => {
    if (sectionsHidden.includes(sectionId)) return null;
    switch (sectionId) {
      case "hero":
        return (
          <LandingHeroSection
            key={sectionId}
            title={course.title}
            subtitle={hero.subtitle || course.description || ""}
            orgName={orgName}
            backgroundUrl={hero.background_url}
            coverImageUrl={course.cover_image_url}
            accentColor={course.accent_color}
            price={finalPrice}
            showPrice={hero.show_price !== false}
            lessonsCount={lessons.length}
            duration={course.duration}
            enrollButton={enrollBtn}
          />
        );
      case "audience":
        return audienceItems.length > 0 ? (
          <LandingAudienceSection key={sectionId} title={audience.title} description={audience.description} items={audienceItems} />
        ) : null;
      case "learn":
        return learn.items?.length > 0 ? (
          <LandingLearnSection key={sectionId} title={learn.title} description={learn.description} items={learn.items} />
        ) : null;
      case "program":
        return <LandingProgramSection key={sectionId} lessons={lessons} accentColor={course.accent_color} />;
      case "process":
        return process.content ? (
          <LandingProcessSection key={sectionId} title={process.title} content={process.content} />
        ) : null;
      case "benefits":
        return benefits.length > 0 ? <LandingBenefitsSection key={sectionId} benefits={benefits} /> : null;
      case "teachers":
        return teachers.items?.length > 0 ? (
          <LandingTeachersSection key={sectionId} title={teachers.title} description={teachers.description} teachers={teachers.items} />
        ) : null;
      case "reviews":
        return reviews.items?.length > 0 ? (
          <LandingReviewsSection key={sectionId} title={reviews.title} reviews={reviews.items} />
        ) : null;
      case "pricing":
        return pricing.tiers?.length > 0 ? (
          <LandingPricingSection key={sectionId} title={pricing.title} tiers={pricing.tiers} />
        ) : null;
      case "faq":
        return faq.items?.length > 0 ? (
          <LandingFaqSection key={sectionId} title={faq.title} items={faq.items} />
        ) : null;
      case "cta":
        return (
          <LandingCtaSection
            key={sectionId}
            title={cta.title}
            subtitle={cta.subtitle}
            accentColor={course.accent_color}
            onSubmit={handleEnroll}
            isEnrolled={isEnrolled}
            price={finalPrice}
            enrollmentConfig={enrollmentConfig}
            submitted={justSubmitted}
          />
        );
      default:
        return null;
    }
  };

  const seoData = landingContent?.seo || {};
  const metaTitle = seoData.meta_title || `${course.title} — ${orgName}`;
  const metaDescription = seoData.meta_description || (course.description ? course.description.substring(0, 160) : `Курс «${course.title}» от ${orgName}`);
  const metaKeywords = seoData.keywords || "";
  const ogImage = seoData.og_image_url || course.cover_image_url || "";
  const canonicalUrl = seoData.canonical_url || `${getBaseUrl()}/c/${course.slug || courseId}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.description || "",
    provider: { "@type": "Organization", name: orgName },
    ...(ogImage ? { image: ogImage } : {}),
    ...(course.price > 0
      ? { offers: { "@type": "Offer", price: finalPrice, priceCurrency: "RUB", availability: "https://schema.org/InStock" } }
      : { isAccessibleForFree: true }),
    ...(lessons.length > 0 ? { hasCourseInstance: { "@type": "CourseInstance", courseMode: "online" } } : {}) };

  return (
    <div className="min-h-screen bg-background relative">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="fixed top-4 left-4 z-50 flex items-center gap-2 bg-background/80 backdrop-blur-sm border border-border rounded-xl px-4 py-2 text-sm font-medium hover:bg-accent transition-colors shadow-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Назад
      </button>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        {metaKeywords && <meta name="keywords" content={metaKeywords} />}
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={canonicalUrl} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDescription} />
        {ogImage && <meta name="twitter:image" content={ogImage} />}
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>
      <LandingThemeProvider theme={landingContent?.theme} accent={course.accent_color}>
        {sectionsOrder.map((sectionId) => renderPublicSection(sectionId))}
      </LandingThemeProvider>
    </div>
  );
}
