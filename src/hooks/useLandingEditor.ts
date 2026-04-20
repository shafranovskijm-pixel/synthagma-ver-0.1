import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AudienceItem } from "@/components/course-landing/LandingAudienceSection";
import { BenefitItem } from "@/components/course-landing/LandingBenefitsSection";
import { LearnItem } from "@/components/course-landing/LandingLearnSection";
import { TeacherItem } from "@/components/course-landing/LandingTeachersSection";
import { ReviewItem } from "@/components/course-landing/LandingReviewsSection";
import { PricingTier } from "@/components/course-landing/LandingPricingSection";
import { FaqItem } from "@/components/course-landing/LandingFaqSection";

export const ALL_SECTIONS = ["hero", "audience", "learn", "program", "process", "benefits", "teachers", "reviews", "pricing", "faq", "cta"];

export const SECTION_LABELS: Record<string, string> = {
  hero: "Шапка", audience: "Кому подойдёт", learn: "Что вы узнаете", program: "Программа",
  process: "Как проходит", benefits: "Преимущества", teachers: "Преподаватели",
  reviews: "Отзывы", pricing: "Тарифы", faq: "Вопросы и ответы", cta: "Призыв к действию",
};

export interface LandingData {
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
  audience: { title: "Кому подойдёт этот курс?", description: "Курс создан для широкого круга специалистов", items: [
    { icon: "users", title: "Руководителям и менеджерам", description: "Освоите современные подходы к управлению" },
    { icon: "graduation-cap", title: "Специалистам", description: "Повысите квалификацию и расширите компетенции" },
    { icon: "lightbulb", title: "Начинающим", description: "Получите фундаментальные знания в области" },
  ] },
  learn: { title: "Что вы узнаете на курсе", description: "Программа курса охватывает ключевые темы", items: [
    { icon: "book-open", title: "Теоретическая база", description: "Изучите основные концепции и модели" },
    { icon: "target", title: "Практические навыки", description: "Научитесь применять знания на практике" },
  ] },
  process: { title: "Как проходит обучение?", content: "Онлайн формат — учитесь в удобное время\nВидеоуроки и текстовые материалы\nПрактические задания после каждого блока\nОбратная связь от преподавателей" },
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

function migrateAudienceItems(items: any[]): AudienceItem[] {
  if (!items || items.length === 0) return defaultLanding.audience.items;
  if (typeof items[0] === "string") return items.map((s: string) => ({ icon: "check-circle", title: s, description: "" }));
  return items as AudienceItem[];
}

export function useLandingEditor(courseId: string) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [course, setCourse] = useState<any>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [orgName, setOrgName] = useState("");
  const [landing, setLanding] = useState<LandingData>(defaultLanding);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiDialogSection, setAiDialogSection] = useState<string | null>(null);

  useEffect(() => { if (courseId) loadData(); }, [courseId]);

  const loadData = async () => {
    setLoading(true);
    const [courseRes, lessonsRes] = await Promise.all([
      supabase.from("courses").select("id, title, description, duration, price, cover_image_url, landing_content, organization_id, accent_color, slug").eq("id", courseId).single(),
      supabase.from("lessons").select("id, title, type, order_index").eq("course_id", courseId).order("order_index"),
    ]);
    if (courseRes.data) {
      setCourse(courseRes.data);
      const existing = courseRes.data.landing_content as any;
      if (existing?.hero) {
        setLanding({
          hero: { ...defaultLanding.hero, ...existing.hero },
          audience: { ...defaultLanding.audience, ...existing.audience, items: migrateAudienceItems(existing.audience?.items) },
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
    setLessons(lessonsRes.data || []); setLoading(false);
  };

  const handleSave = async () => {
    if (!courseId) return;
    setSaving(true);
    const existing = (course?.landing_content as any) || {};
    const merged = { ...existing, ...landing };
    const { error } = await supabase.from("courses").update({ landing_content: merged as any }).eq("id", courseId);
    if (error) toast.error("Ошибка сохранения");
    else { toast.success("Изменения сохранены"); setCourse((c: any) => c ? { ...c, landing_content: merged } : c); }
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

  const moveSection = (sectionId: string, dir: -1 | 1) => {
    setLanding((l) => { const order = [...l.sections_order]; const idx = order.indexOf(sectionId); if (idx < 0) return l; const newIdx = idx + dir; if (newIdx < 0 || newIdx >= order.length) return l; [order[idx], order[newIdx]] = [order[newIdx], order[idx]]; return { ...l, sections_order: order }; });
  };
  const toggleSection = (sectionId: string) => {
    setLanding((l) => { const hidden = l.sections_hidden.includes(sectionId) ? l.sections_hidden.filter((s) => s !== sectionId) : [...l.sections_hidden, sectionId]; return { ...l, sections_hidden: hidden }; });
  };

  // Generic array item handlers
  const updateArrayItem = <T extends Record<string, any>>(key: "audience" | "learn", index: number, field: keyof T, value: string) => {
    setLanding((l) => { const items = [...(l[key] as any).items]; items[index] = { ...items[index], [field]: value }; return { ...l, [key]: { ...l[key], items } }; });
  };
  const addArrayItem = (key: "audience" | "learn", item: any) => {
    setLanding((l) => ({ ...l, [key]: { ...(l[key] as any), items: [...(l[key] as any).items, item] } }));
  };
  const removeArrayItem = (key: "audience" | "learn", index: number) => {
    setLanding((l) => ({ ...l, [key]: { ...(l[key] as any), items: (l[key] as any).items.filter((_: any, i: number) => i !== index) } }));
  };

  const updateBenefit = (index: number, field: "title" | "description" | "icon", value: string) => {
    setLanding((l) => { const benefits = [...l.benefits]; benefits[index] = { ...benefits[index], [field]: value }; return { ...l, benefits }; });
  };
  const addBenefit = () => setLanding((l) => ({ ...l, benefits: [...l.benefits, { icon: "shield", title: "Заголовок", description: "Описание" }] }));
  const removeBenefit = (index: number) => setLanding((l) => ({ ...l, benefits: l.benefits.filter((_, i) => i !== index) }));

  const updateTeacher = (index: number, field: keyof TeacherItem, value: string) => {
    setLanding((l) => { const items = [...l.teachers.items]; items[index] = { ...items[index], [field]: value }; return { ...l, teachers: { ...l.teachers, items } }; });
  };
  const addTeacher = () => setLanding((l) => ({ ...l, teachers: { ...l.teachers, items: [...l.teachers.items, { name: "Имя преподавателя", role: "Должность", description: "Описание", photo_url: null }] } }));
  const removeTeacher = (index: number) => setLanding((l) => ({ ...l, teachers: { ...l.teachers, items: l.teachers.items.filter((_, i) => i !== index) } }));

  const updateReview = (index: number, field: keyof ReviewItem, value: string | number) => {
    setLanding((l) => { const items = [...l.reviews.items]; items[index] = { ...items[index], [field]: value }; return { ...l, reviews: { ...l.reviews, items } }; });
  };
  const addReview = () => setLanding((l) => ({ ...l, reviews: { ...l.reviews, items: [...l.reviews.items, { name: "Имя", text: "Текст отзыва", rating: 5 }] } }));
  const removeReview = (index: number) => setLanding((l) => ({ ...l, reviews: { ...l.reviews, items: l.reviews.items.filter((_, i) => i !== index) } }));

  const updateTier = (index: number, field: keyof PricingTier, value: any) => {
    setLanding((l) => { const tiers = [...l.pricing.tiers]; tiers[index] = { ...tiers[index], [field]: value }; return { ...l, pricing: { ...l.pricing, tiers } }; });
  };
  const updateTierFeature = (tierIndex: number, featureIndex: number, value: string) => {
    setLanding((l) => { const tiers = [...l.pricing.tiers]; const features = [...tiers[tierIndex].features]; features[featureIndex] = value; tiers[tierIndex] = { ...tiers[tierIndex], features }; return { ...l, pricing: { ...l.pricing, tiers } }; });
  };
  const addTierFeature = (tierIndex: number) => {
    setLanding((l) => { const tiers = [...l.pricing.tiers]; tiers[tierIndex] = { ...tiers[tierIndex], features: [...tiers[tierIndex].features, "Новый пункт"] }; return { ...l, pricing: { ...l.pricing, tiers } }; });
  };
  const removeTierFeature = (tierIndex: number, featureIndex: number) => {
    setLanding((l) => { const tiers = [...l.pricing.tiers]; tiers[tierIndex] = { ...tiers[tierIndex], features: tiers[tierIndex].features.filter((_, i) => i !== featureIndex) }; return { ...l, pricing: { ...l.pricing, tiers } }; });
  };
  const addTier = () => setLanding((l) => ({ ...l, pricing: { ...l.pricing, tiers: [...l.pricing.tiers, { name: "Тариф", price: 0, features: ["Доступ к курсу"], is_popular: false }] } }));
  const removeTier = (index: number) => setLanding((l) => ({ ...l, pricing: { ...l.pricing, tiers: l.pricing.tiers.filter((_, i) => i !== index) } }));

  const updateFaqItem = (index: number, field: keyof FaqItem, value: string) => {
    setLanding((l) => { const items = [...l.faq.items]; items[index] = { ...items[index], [field]: value }; return { ...l, faq: { ...l.faq, items } }; });
  };
  const addFaqItem = () => setLanding((l) => ({ ...l, faq: { ...l.faq, items: [...l.faq.items, { question: "Вопрос?", answer: "Ответ" }] } }));
  const removeFaqItem = (index: number) => setLanding((l) => ({ ...l, faq: { ...l.faq, items: l.faq.items.filter((_, i) => i !== index) } }));

  const openAIDialog = (sectionId: string | null) => { setAiDialogSection(sectionId); setAiDialogOpen(true); };

  const handleAITextGenerated = (sectionId: string, data: any) => {
    setLanding((l) => {
      switch (sectionId) {
        case "hero": return { ...l, hero: { ...l.hero, subtitle: typeof data === "string" ? data : l.hero.subtitle } };
        case "audience": return Array.isArray(data) ? { ...l, audience: { ...l.audience, items: data } } : l;
        case "learn": return Array.isArray(data) ? { ...l, learn: { ...l.learn, items: data } } : l;
        case "benefits": return Array.isArray(data) ? { ...l, benefits: data } : l;
        case "faq": return Array.isArray(data) ? { ...l, faq: { ...l.faq, items: data } } : l;
        case "cta": return typeof data === "object" && data.title ? { ...l, cta: { title: data.title, subtitle: data.subtitle || l.cta.subtitle } } : l;
        case "process": return typeof data === "string" ? { ...l, process: { ...l.process, content: data } } : l;
        default: return l;
      }
    });
  };

  const handleAIImageGenerated = (url: string) => { setLanding((l) => ({ ...l, hero: { ...l.hero, background_url: url } })); };

  const publicUrl = course?.slug ? `/c/${course.slug}` : `/course/${courseId}/landing`;

  return {
    loading, saving, course, setCourse, lessons, orgName, landing, setLanding, fileInputRef,
    aiDialogOpen, setAiDialogOpen, aiDialogSection, navigate,
    handleSave, handleBackgroundUpload, moveSection, toggleSection,
    updateArrayItem, addArrayItem, removeArrayItem,
    updateBenefit, addBenefit, removeBenefit,
    updateTeacher, addTeacher, removeTeacher,
    updateReview, addReview, removeReview,
    updateTier, updateTierFeature, addTierFeature, removeTierFeature, addTier, removeTier,
    updateFaqItem, addFaqItem, removeFaqItem,
    openAIDialog, handleAITextGenerated, handleAIImageGenerated, publicUrl,
  };
}
