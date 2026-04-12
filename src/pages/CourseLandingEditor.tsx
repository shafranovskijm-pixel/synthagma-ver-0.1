import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { LandingHeroSection } from "@/components/course-landing/LandingHeroSection";
import { LandingAudienceSection } from "@/components/course-landing/LandingAudienceSection";
import { LandingProgramSection } from "@/components/course-landing/LandingProgramSection";
import { LandingBenefitsSection, BenefitItem } from "@/components/course-landing/LandingBenefitsSection";
import { LandingCtaSection } from "@/components/course-landing/LandingCtaSection";

interface LandingData {
  hero: { background_url: string | null; subtitle: string; show_price: boolean };
  audience: { title: string; description: string; items: string[] };
  benefits: BenefitItem[];
  cta: { title: string; subtitle: string };
}

const defaultLanding: LandingData = {
  hero: { background_url: null, subtitle: "Получите новые знания и навыки с нашим курсом", show_price: true },
  audience: {
    title: "Кому подойдёт этот курс?",
    description: "Курс создан для широкого круга специалистов",
    items: [
      "Руководителям и менеджерам",
      "Специалистам, желающим повысить квалификацию",
      "Начинающим в данной области",
      "Всем, кто хочет систематизировать знания",
    ],
  },
  benefits: [
    { icon: "shield", title: "Сертификат", description: "Документ о прохождении обучения" },
    { icon: "clock", title: "Гибкий график", description: "Учитесь в удобное время" },
    { icon: "award", title: "Практика", description: "Реальные задания и кейсы" },
    { icon: "users", title: "Поддержка", description: "Обратная связь от экспертов" },
  ],
  cta: { title: "Начните обучение сегодня", subtitle: "Заполните форму и мы свяжемся с вами" },
};

export default function CourseLandingEditor() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [course, setCourse] = useState<any>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [orgName, setOrgName] = useState("");
  const [landing, setLanding] = useState<LandingData>(defaultLanding);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (courseId) loadData();
  }, [courseId]);

  const loadData = async () => {
    setLoading(true);
    const [courseRes, lessonsRes] = await Promise.all([
      supabase.from("courses").select("id, title, description, duration, price, cover_image_url, landing_content, organization_id, accent_color, slug").eq("id", courseId!).single(),
      supabase.from("lessons").select("id, title, type, order_index").eq("course_id", courseId!).order("order_index"),
    ]);

    if (courseRes.data) {
      setCourse(courseRes.data);
      const existing = courseRes.data.landing_content as any;
      if (existing?.hero) {
        setLanding({
          hero: { ...defaultLanding.hero, ...existing.hero },
          audience: { ...defaultLanding.audience, ...existing.audience },
          benefits: existing.benefits || defaultLanding.benefits,
          cta: { ...defaultLanding.cta, ...existing.cta },
        });
      }

      const orgRes = await supabase.from("organizations").select("name").eq("id", courseRes.data.organization_id).single();
      setOrgName(orgRes.data?.name || "");
    }
    setLessons(lessonsRes.data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!courseId) return;
    setSaving(true);

    // Merge with existing landing_content to preserve analytics, enrollment_form, external_url, etc.
    const existing = (course?.landing_content as any) || {};
    const merged = { ...existing, ...landing };

    const { error } = await supabase
      .from("courses")
      .update({ landing_content: merged as any })
      .eq("id", courseId);

    if (error) {
      toast.error("Ошибка сохранения");
    } else {
      toast.success("Изменения сохранены");
      setCourse((c: any) => c ? { ...c, landing_content: merged } : c);
    }
    setSaving(false);
  };

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !courseId) return;

    const ext = file.name.split(".").pop();
    const path = `${courseId}/landing-hero.${ext}`;

    const { error } = await supabase.storage.from("course-files").upload(path, file, { upsert: true });
    if (error) {
      toast.error("Ошибка загрузки");
      return;
    }

    const { data: urlData } = supabase.storage.from("course-files").getPublicUrl(path);
    setLanding((l) => ({ ...l, hero: { ...l.hero, background_url: urlData.publicUrl } }));
    toast.success("Фон загружен");
  };

  const updateAudienceItem = (index: number, value: string) => {
    setLanding((l) => {
      const items = [...l.audience.items];
      items[index] = value;
      return { ...l, audience: { ...l.audience, items } };
    });
  };

  const addAudienceItem = () => {
    setLanding((l) => ({
      ...l,
      audience: { ...l.audience, items: [...l.audience.items, "Новый пункт"] },
    }));
  };

  const removeAudienceItem = (index: number) => {
    setLanding((l) => ({
      ...l,
      audience: { ...l.audience, items: l.audience.items.filter((_, i) => i !== index) },
    }));
  };

  const updateBenefit = (index: number, field: "title" | "description" | "icon", value: string) => {
    setLanding((l) => {
      const benefits = [...l.benefits];
      benefits[index] = { ...benefits[index], [field]: value };
      return { ...l, benefits };
    });
  };

  const addBenefit = () => {
    setLanding((l) => ({
      ...l,
      benefits: [...l.benefits, { icon: "shield", title: "Заголовок", description: "Описание" }],
    }));
  };

  const removeBenefit = (index: number) => {
    setLanding((l) => ({
      ...l,
      benefits: l.benefits.filter((_, i) => i !== index),
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!course) return null;

  const publicUrl = course.slug ? `/c/${course.slug}` : `/course/${courseId}/landing`;

  return (
    <div className="min-h-screen bg-background">
      {/* Toolbar */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/course/${courseId}/edit`)} className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              Редактор курса
            </Button>
            <span className="text-sm font-medium text-muted-foreground hidden sm:block">{course.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open(publicUrl, "_blank")} className="gap-1.5">
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Просмотр</span>
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Сохранить
            </Button>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleBackgroundUpload} />

      {/* Preview with inline editing */}
      <LandingHeroSection
        title={course.title}
        subtitle={landing.hero.subtitle}
        orgName={orgName}
        backgroundUrl={landing.hero.background_url}
        coverImageUrl={course.cover_image_url}
        accentColor={course.accent_color}
        price={course.price || 0}
        showPrice={landing.hero.show_price}
        lessonsCount={lessons.length}
        duration={course.duration}
        isEditing
        onSubtitleChange={(v) => setLanding((l) => ({ ...l, hero: { ...l.hero, subtitle: v } }))}
        onBackgroundChange={() => fileInputRef.current?.click()}
      />

      <LandingAudienceSection
        title={landing.audience.title}
        description={landing.audience.description}
        items={landing.audience.items}
        isEditing
        onTitleChange={(v) => setLanding((l) => ({ ...l, audience: { ...l.audience, title: v } }))}
        onDescriptionChange={(v) => setLanding((l) => ({ ...l, audience: { ...l.audience, description: v } }))}
        onItemChange={updateAudienceItem}
        onAddItem={addAudienceItem}
        onRemoveItem={removeAudienceItem}
      />

      <LandingProgramSection lessons={lessons} accentColor={course.accent_color} />

      <LandingBenefitsSection
        benefits={landing.benefits}
        isEditing
        onBenefitChange={updateBenefit}
        onAddBenefit={addBenefit}
        onRemoveBenefit={removeBenefit}
      />

      <LandingCtaSection
        title={landing.cta.title}
        subtitle={landing.cta.subtitle}
        accentColor={course.accent_color}
        isEditing
        onTitleChange={(v) => setLanding((l) => ({ ...l, cta: { ...l.cta, title: v } }))}
        onSubtitleChange={(v) => setLanding((l) => ({ ...l, cta: { ...l.cta, subtitle: v } }))}
      />
    </div>
  );
}
