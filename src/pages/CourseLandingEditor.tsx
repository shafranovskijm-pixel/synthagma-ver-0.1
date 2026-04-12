import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { LandingHeroSection } from "@/components/course-landing/LandingHeroSection";
import { LandingAudienceSection, AudienceItem } from "@/components/course-landing/LandingAudienceSection";
import { LandingProgramSection } from "@/components/course-landing/LandingProgramSection";
import { LandingBenefitsSection, BenefitItem } from "@/components/course-landing/LandingBenefitsSection";
import { LandingCtaSection } from "@/components/course-landing/LandingCtaSection";
import { LandingLearnSection, LearnItem } from "@/components/course-landing/LandingLearnSection";
import { LandingProcessSection } from "@/components/course-landing/LandingProcessSection";
import { LandingTeachersSection, TeacherItem } from "@/components/course-landing/LandingTeachersSection";
import { LandingReviewsSection, ReviewItem } from "@/components/course-landing/LandingReviewsSection";
import { LandingPricingSection, PricingTier } from "@/components/course-landing/LandingPricingSection";
import { LandingFaqSection, FaqItem } from "@/components/course-landing/LandingFaqSection";
import { SectionToolbar } from "@/components/course-landing/SectionToolbar";

const ALL_SECTIONS = ["hero", "audience", "learn", "program", "process", "benefits", "teachers", "reviews", "pricing", "faq", "cta"];

const SECTION_LABELS: Record<string, string> = {
  hero: "Шапка",
  audience: "Кому подойдёт",
  learn: "Что вы узнаете",
  program: "Программа",
  process: "Как проходит",
  benefits: "Преимущества",
  teachers: "Преподаватели",
  reviews: "Отзывы",
  pricing: "Тарифы",
  faq: "Вопросы и ответы",
  cta: "Призыв к действию",
};

interface LandingData {
  hero: { background_url: string | null; subtitle: string; show_price: boolean };
  audience: { title: string; description: string; items: AudienceItem[] };
  learn: { title: string; description: string; items: LearnItem[] };
  process: { title: string; content: string };
  benefits: BenefitItem[];
  teachers: { title: string; description: string; items: TeacherItem[] };
  reviews: { title: string; items: ReviewItem[] };
  pricing: { title: string; tiers: PricingTier[] };
  faq: { title: string; items: FaqItem[] };
  cta: { title: string; subtitle: string };
  sections_order: string[];
  sections_hidden: string[];
}

const defaultLanding: LandingData = {
  hero: { background_url: null, subtitle: "Получите новые знания и навыки с нашим курсом", show_price: true },
  audience: {
    title: "Кому подойдёт этот курс?",
    description: "Курс создан для широкого круга специалистов",
    items: [
      { icon: "users", title: "Руководителям и менеджерам", description: "Освоите современные подходы к управлению" },
      { icon: "graduation-cap", title: "Специалистам", description: "Повысите квалификацию и расширите компетенции" },
      { icon: "lightbulb", title: "Начинающим", description: "Получите фундаментальные знания в области" },
    ],
  },
  learn: {
    title: "Что вы узнаете на курсе",
    description: "Программа курса охватывает ключевые темы",
    items: [
      { icon: "book-open", title: "Теоретическая база", description: "Изучите основные концепции и модели" },
      { icon: "target", title: "Практические навыки", description: "Научитесь применять знания на практике" },
    ],
  },
  process: {
    title: "Как проходит обучение?",
    content: "Онлайн формат — учитесь в удобное время\nВидеоуроки и текстовые материалы\nПрактические задания после каждого блока\nОбратная связь от преподавателей",
  },
  benefits: [
    { icon: "shield", title: "Сертификат", description: "Документ о прохождении обучения" },
    { icon: "clock", title: "Гибкий график", description: "Учитесь в удобное время" },
    { icon: "award", title: "Практика", description: "Реальные задания и кейсы" },
    { icon: "users", title: "Поддержка", description: "Обратная связь от экспертов" },
  ],
  teachers: { title: "Преподаватели курса", description: "", items: [] },
  reviews: { title: "Отзывы о курсе", items: [] },
  pricing: { title: "Выберите подходящий тариф", tiers: [] },
  faq: { title: "Часто задаваемые вопросы", items: [] },
  cta: { title: "Начните обучение сегодня", subtitle: "Заполните форму и мы свяжемся с вами" },
  sections_order: ALL_SECTIONS,
  sections_hidden: [],
};

// Migrate old string[] audience items to AudienceItem[]
function migrateAudienceItems(items: any[]): AudienceItem[] {
  if (!items || items.length === 0) return defaultLanding.audience.items;
  if (typeof items[0] === "string") {
    return items.map((s: string) => ({ icon: "check-circle", title: s, description: "" }));
  }
  return items as AudienceItem[];
}

interface CourseLandingEditorContentProps {
  courseId: string;
  embedded?: boolean;
}

export function CourseLandingEditorContent({ courseId, embedded = false }: CourseLandingEditorContentProps) {
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
          audience: {
            ...defaultLanding.audience,
            ...existing.audience,
            items: migrateAudienceItems(existing.audience?.items),
          },
          learn: { ...defaultLanding.learn, ...existing.learn },
          process: { ...defaultLanding.process, ...existing.process },
          benefits: existing.benefits || defaultLanding.benefits,
          teachers: { ...defaultLanding.teachers, ...existing.teachers },
          reviews: { ...defaultLanding.reviews, ...existing.reviews },
          pricing: { ...defaultLanding.pricing, ...existing.pricing },
          faq: { ...defaultLanding.faq, ...existing.faq },
          cta: { ...defaultLanding.cta, ...existing.cta },
          sections_order: existing.sections_order || ALL_SECTIONS,
          sections_hidden: existing.sections_hidden || [],
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
    const existing = (course?.landing_content as any) || {};
    const merged = { ...existing, ...landing };
    const { error } = await supabase.from("courses").update({ landing_content: merged as any }).eq("id", courseId);
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
    if (error) { toast.error("Ошибка загрузки"); return; }
    const { data: urlData } = supabase.storage.from("course-files").getPublicUrl(path);
    setLanding((l) => ({ ...l, hero: { ...l.hero, background_url: urlData.publicUrl } }));
    toast.success("Фон загружен");
  };

  // Section management
  const moveSection = (sectionId: string, dir: -1 | 1) => {
    setLanding((l) => {
      const order = [...l.sections_order];
      const idx = order.indexOf(sectionId);
      if (idx < 0) return l;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= order.length) return l;
      [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
      return { ...l, sections_order: order };
    });
  };

  const toggleSection = (sectionId: string) => {
    setLanding((l) => {
      const hidden = l.sections_hidden.includes(sectionId)
        ? l.sections_hidden.filter((s) => s !== sectionId)
        : [...l.sections_hidden, sectionId];
      return { ...l, sections_hidden: hidden };
    });
  };

  // Audience handlers
  const updateAudienceItem = (index: number, field: keyof AudienceItem, value: string) => {
    setLanding((l) => {
      const items = [...l.audience.items];
      items[index] = { ...items[index], [field]: value };
      return { ...l, audience: { ...l.audience, items } };
    });
  };
  const addAudienceItem = () => {
    setLanding((l) => ({
      ...l,
      audience: { ...l.audience, items: [...l.audience.items, { icon: "user", title: "Новый пункт", description: "Описание" }] },
    }));
  };
  const removeAudienceItem = (index: number) => {
    setLanding((l) => ({
      ...l,
      audience: { ...l.audience, items: l.audience.items.filter((_, i) => i !== index) },
    }));
  };

  // Learn handlers
  const updateLearnItem = (index: number, field: keyof LearnItem, value: string) => {
    setLanding((l) => {
      const items = [...l.learn.items];
      items[index] = { ...items[index], [field]: value };
      return { ...l, learn: { ...l.learn, items } };
    });
  };
  const addLearnItem = () => {
    setLanding((l) => ({
      ...l,
      learn: { ...l.learn, items: [...l.learn.items, { icon: "star", title: "Новый пункт", description: "Описание" }] },
    }));
  };
  const removeLearnItem = (index: number) => {
    setLanding((l) => ({
      ...l,
      learn: { ...l.learn, items: l.learn.items.filter((_, i) => i !== index) },
    }));
  };

  // Benefits handlers
  const updateBenefit = (index: number, field: "title" | "description" | "icon", value: string) => {
    setLanding((l) => {
      const benefits = [...l.benefits];
      benefits[index] = { ...benefits[index], [field]: value };
      return { ...l, benefits };
    });
  };
  const addBenefit = () => {
    setLanding((l) => ({ ...l, benefits: [...l.benefits, { icon: "shield", title: "Заголовок", description: "Описание" }] }));
  };
  const removeBenefit = (index: number) => {
    setLanding((l) => ({ ...l, benefits: l.benefits.filter((_, i) => i !== index) }));
  };

  // Teachers handlers
  const updateTeacher = (index: number, field: keyof TeacherItem, value: string) => {
    setLanding((l) => {
      const items = [...l.teachers.items];
      items[index] = { ...items[index], [field]: value };
      return { ...l, teachers: { ...l.teachers, items } };
    });
  };
  const addTeacher = () => {
    setLanding((l) => ({
      ...l,
      teachers: { ...l.teachers, items: [...l.teachers.items, { name: "Имя преподавателя", role: "Должность", description: "Описание", photo_url: null }] },
    }));
  };
  const removeTeacher = (index: number) => {
    setLanding((l) => ({ ...l, teachers: { ...l.teachers, items: l.teachers.items.filter((_, i) => i !== index) } }));
  };

  // Reviews handlers
  const updateReview = (index: number, field: keyof ReviewItem, value: string | number) => {
    setLanding((l) => {
      const items = [...l.reviews.items];
      items[index] = { ...items[index], [field]: value };
      return { ...l, reviews: { ...l.reviews, items } };
    });
  };
  const addReview = () => {
    setLanding((l) => ({
      ...l,
      reviews: { ...l.reviews, items: [...l.reviews.items, { name: "Имя", text: "Текст отзыва", rating: 5 }] },
    }));
  };
  const removeReview = (index: number) => {
    setLanding((l) => ({ ...l, reviews: { ...l.reviews, items: l.reviews.items.filter((_, i) => i !== index) } }));
  };

  // Pricing handlers
  const updateTier = (index: number, field: keyof PricingTier, value: any) => {
    setLanding((l) => {
      const tiers = [...l.pricing.tiers];
      tiers[index] = { ...tiers[index], [field]: value };
      return { ...l, pricing: { ...l.pricing, tiers } };
    });
  };
  const updateTierFeature = (tierIndex: number, featureIndex: number, value: string) => {
    setLanding((l) => {
      const tiers = [...l.pricing.tiers];
      const features = [...tiers[tierIndex].features];
      features[featureIndex] = value;
      tiers[tierIndex] = { ...tiers[tierIndex], features };
      return { ...l, pricing: { ...l.pricing, tiers } };
    });
  };
  const addTierFeature = (tierIndex: number) => {
    setLanding((l) => {
      const tiers = [...l.pricing.tiers];
      tiers[tierIndex] = { ...tiers[tierIndex], features: [...tiers[tierIndex].features, "Новый пункт"] };
      return { ...l, pricing: { ...l.pricing, tiers } };
    });
  };
  const removeTierFeature = (tierIndex: number, featureIndex: number) => {
    setLanding((l) => {
      const tiers = [...l.pricing.tiers];
      tiers[tierIndex] = { ...tiers[tierIndex], features: tiers[tierIndex].features.filter((_, i) => i !== featureIndex) };
      return { ...l, pricing: { ...l.pricing, tiers } };
    });
  };
  const addTier = () => {
    setLanding((l) => ({
      ...l,
      pricing: { ...l.pricing, tiers: [...l.pricing.tiers, { name: "Тариф", price: 0, features: ["Доступ к курсу"], is_popular: false }] },
    }));
  };
  const removeTier = (index: number) => {
    setLanding((l) => ({ ...l, pricing: { ...l.pricing, tiers: l.pricing.tiers.filter((_, i) => i !== index) } }));
  };

  // FAQ handlers
  const updateFaqItem = (index: number, field: keyof FaqItem, value: string) => {
    setLanding((l) => {
      const items = [...l.faq.items];
      items[index] = { ...items[index], [field]: value };
      return { ...l, faq: { ...l.faq, items } };
    });
  };
  const addFaqItem = () => {
    setLanding((l) => ({
      ...l,
      faq: { ...l.faq, items: [...l.faq.items, { question: "Вопрос?", answer: "Ответ" }] },
    }));
  };
  const removeFaqItem = (index: number) => {
    setLanding((l) => ({ ...l, faq: { ...l.faq, items: l.faq.items.filter((_, i) => i !== index) } }));
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

  const renderSection = (sectionId: string, index: number) => {
    const isHidden = landing.sections_hidden.includes(sectionId);
    const order = landing.sections_order;

    const toolbar = (
      <SectionToolbar
        sectionId={sectionId}
        isHidden={isHidden}
        canMoveUp={index > 0}
        canMoveDown={index < order.length - 1}
        onMoveUp={() => moveSection(sectionId, -1)}
        onMoveDown={() => moveSection(sectionId, 1)}
        onToggleVisibility={() => toggleSection(sectionId)}
        label={SECTION_LABELS[sectionId] || sectionId}
      />
    );

    // When section is hidden, show collapsed placeholder instead of full content
    if (isHidden) {
      return (
        <div key={sectionId} className="relative group/section opacity-50">
          {toolbar}
          <div className="py-6 px-6 bg-muted/20 border border-dashed border-border rounded-lg mx-4">
            <p className="text-center text-sm text-muted-foreground">
              Секция «{SECTION_LABELS[sectionId] || sectionId}» скрыта на странице курса
            </p>
          </div>
        </div>
      );
    }

    const wrapperClass = "relative group/section";

    switch (sectionId) {
      case "hero":
        return (
          <div key={sectionId} className={wrapperClass}>
            {toolbar}
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
              onShowPriceChange={(v) => setLanding((l) => ({ ...l, hero: { ...l.hero, show_price: v } }))}
            />
          </div>
        );
      case "audience":
        return (
          <div key={sectionId} className={wrapperClass}>
            {toolbar}
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
          </div>
        );
      case "learn":
        return (
          <div key={sectionId} className={wrapperClass}>
            {toolbar}
            <LandingLearnSection
              title={landing.learn.title}
              description={landing.learn.description}
              items={landing.learn.items}
              isEditing
              onTitleChange={(v) => setLanding((l) => ({ ...l, learn: { ...l.learn, title: v } }))}
              onDescriptionChange={(v) => setLanding((l) => ({ ...l, learn: { ...l.learn, description: v } }))}
              onItemChange={updateLearnItem}
              onAddItem={addLearnItem}
              onRemoveItem={removeLearnItem}
            />
          </div>
        );
      case "program":
        return (
          <div key={sectionId} className={wrapperClass}>
            {toolbar}
            <LandingProgramSection lessons={lessons} accentColor={course.accent_color} />
          </div>
        );
      case "process":
        return (
          <div key={sectionId} className={wrapperClass}>
            {toolbar}
            <LandingProcessSection
              title={landing.process.title}
              content={landing.process.content}
              isEditing
              onTitleChange={(v) => setLanding((l) => ({ ...l, process: { ...l.process, title: v } }))}
              onContentChange={(v) => setLanding((l) => ({ ...l, process: { ...l.process, content: v } }))}
            />
          </div>
        );
      case "benefits":
        return (
          <div key={sectionId} className={wrapperClass}>
            {toolbar}
            <LandingBenefitsSection
              benefits={landing.benefits}
              isEditing
              onBenefitChange={updateBenefit}
              onAddBenefit={addBenefit}
              onRemoveBenefit={removeBenefit}
            />
          </div>
        );
      case "teachers":
        return (
          <div key={sectionId} className={wrapperClass}>
            {toolbar}
            <LandingTeachersSection
              title={landing.teachers.title}
              description={landing.teachers.description}
              teachers={landing.teachers.items}
              courseId={courseId}
              isEditing
              onTitleChange={(v) => setLanding((l) => ({ ...l, teachers: { ...l.teachers, title: v } }))}
              onDescriptionChange={(v) => setLanding((l) => ({ ...l, teachers: { ...l.teachers, description: v } }))}
              onTeacherChange={updateTeacher}
              onAddTeacher={addTeacher}
              onRemoveTeacher={removeTeacher}
            />
          </div>
        );
      case "reviews":
        return (
          <div key={sectionId} className={wrapperClass}>
            {toolbar}
            <LandingReviewsSection
              title={landing.reviews.title}
              reviews={landing.reviews.items}
              isEditing
              onTitleChange={(v) => setLanding((l) => ({ ...l, reviews: { ...l.reviews, title: v } }))}
              onReviewChange={updateReview}
              onAddReview={addReview}
              onRemoveReview={removeReview}
            />
          </div>
        );
      case "pricing":
        return (
          <div key={sectionId} className={wrapperClass}>
            {toolbar}
            <LandingPricingSection
              title={landing.pricing.title}
              tiers={landing.pricing.tiers}
              isEditing
              onTitleChange={(v) => setLanding((l) => ({ ...l, pricing: { ...l.pricing, title: v } }))}
              onTierChange={updateTier}
              onTierFeatureChange={updateTierFeature}
              onAddTierFeature={addTierFeature}
              onRemoveTierFeature={removeTierFeature}
              onAddTier={addTier}
              onRemoveTier={removeTier}
            />
          </div>
        );
      case "faq":
        return (
          <div key={sectionId} className={wrapperClass}>
            {toolbar}
            <LandingFaqSection
              title={landing.faq.title}
              items={landing.faq.items}
              isEditing
              onTitleChange={(v) => setLanding((l) => ({ ...l, faq: { ...l.faq, title: v } }))}
              onItemChange={updateFaqItem}
              onAddItem={addFaqItem}
              onRemoveItem={removeFaqItem}
            />
          </div>
        );
      case "cta":
        return (
          <div key={sectionId} className={wrapperClass}>
            {toolbar}
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
      default:
        return null;
    }
  };

  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Редактор страницы курса</h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open(publicUrl, "_blank")} className="gap-1.5">
              <ExternalLink className="w-4 h-4" />
              Просмотр
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Сохранить
            </Button>
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleBackgroundUpload} />

        {landing.sections_order.map((sectionId, index) => renderSection(sectionId, index))}
      </div>
    );
  }

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

      {/* Sections in order */}
      {landing.sections_order.map((sectionId, index) => renderSection(sectionId, index))}
    </div>
  );
}

export default function CourseLandingEditor() {
  const { courseId } = useParams<{ courseId: string }>();
  if (!courseId) return null;
  return <CourseLandingEditorContent courseId={courseId} />;
}
