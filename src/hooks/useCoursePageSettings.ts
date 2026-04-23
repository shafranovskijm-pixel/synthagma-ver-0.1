import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";

export interface PromoCode {
  id: string;
  code: string;
  discount_value: number;
  discount_type: string;
  is_active: boolean;
  max_uses: number | null;
  used_count: number;
  valid_until: string | null;
}

export interface PricingTier {
  name: string;
  price: number;
  features: string[];
  is_popular: boolean;
}

export interface LandingContent {
  enrollment_form?: {
    subtitle?: string;
    show_phone?: boolean;
    show_company?: boolean;
    button_text?: string;
  };
  analytics?: {
    yandex_metrika_id?: string;
    yandex_goal_id?: string;
    ga_tracking_id?: string;
    ga_event_name?: string;
    meta_pixel_id?: string;
  };
  seo?: {
    meta_title?: string;
    meta_description?: string;
    keywords?: string;
    og_image_url?: string;
    canonical_url?: string;
  };
  pricing?: {
    title?: string;
    tiers?: PricingTier[];
  };
  blocks?: any[];
  external_url?: string;
}

export function transliterate(str: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
    ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return str
    .toLowerCase()
    .split("")
    .map((c) => map[c] || c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 60);
}

export function useCoursePageSettings(courseId: string, courseTitle: string, courseDescription?: string) {
  const [slug, setSlug] = useState("");
  const [accentColor, setAccentColor] = useState("#6366f1");
  const [price, setPrice] = useState(0);
  const [allowMaterialsDownload, setAllowMaterialsDownload] = useState(true);
  const [landingContent, setLandingContent] = useState<LandingContent>({});
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newDiscount, setNewDiscount] = useState(10);
  const [newType, setNewType] = useState<"percent" | "fixed">("percent");

  useEffect(() => {
    if (courseId) loadData();
  }, [courseId]);

  const loadData = async () => {
    setLoading(true);
    const [courseRes, promoRes] = await Promise.all([
      supabase.from("courses").select("slug, accent_color, landing_content, price, allow_materials_download").eq("id", courseId).single(),
      supabase.from("course_promo_codes").select("*").eq("course_id", courseId).order("created_at", { ascending: false }),
    ]);

    if (courseRes.data) {
      setSlug(courseRes.data.slug || transliterate(courseTitle));
      setAccentColor(courseRes.data.accent_color || "#6366f1");
      setPrice(courseRes.data.price || 0);
      setAllowMaterialsDownload(courseRes.data.allow_materials_download !== false);
      setLandingContent((courseRes.data.landing_content as LandingContent) || {});
    }
    setPromoCodes((promoRes.data as PromoCode[]) || []);
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("courses")
      .update({
        slug: slug || null,
        accent_color: accentColor,
        price: price,
        allow_materials_download: allowMaterialsDownload,
        landing_content: landingContent as any,
      })
      .eq("id", courseId);

    if (error) {
      if (error.message.includes("duplicate") || error.message.includes("unique")) {
        toast.error("Этот URL уже занят, выберите другой");
      } else {
        toast.error("Ошибка сохранения");
      }
    } else {
      toast.success("Настройки страницы сохранены");
    }
    setSaving(false);
  };

  const addPromoCode = async () => {
    if (!newCode.trim()) return;
    const { data, error } = await supabase
      .from("course_promo_codes")
      .insert({ course_id: courseId, code: newCode.toUpperCase(), discount_value: newDiscount, discount_type: newType })
      .select()
      .single();
    if (!error && data) {
      setPromoCodes([data as PromoCode, ...promoCodes]);
      setNewCode("");
      toast.success("Промокод добавлен");
    }
  };

  const deletePromoCode = async (id: string) => {
    await supabase.from("course_promo_codes").delete().eq("id", id);
    setPromoCodes(promoCodes.filter((p) => p.id !== id));
  };

  const togglePromoCode = async (id: string, active: boolean) => {
    await supabase.from("course_promo_codes").update({ is_active: active }).eq("id", id);
    setPromoCodes(promoCodes.map((p) => (p.id === id ? { ...p, is_active: active } : p)));
  };

  const updateEnrollmentForm = (key: string, value: any) => {
    setLandingContent((prev) => ({
      ...prev,
      enrollment_form: { ...prev.enrollment_form, [key]: value },
    }));
  };

  const updateAnalytics = (key: string, value: string) => {
    setLandingContent((prev) => ({
      ...prev,
      analytics: { ...prev.analytics, [key]: value },
    }));
  };

  const updateSeo = (key: string, value: string) => {
    setLandingContent((prev) => ({
      ...prev,
      seo: { ...prev.seo, [key]: value },
    }));
  };

  // Pricing tiers
  const ensurePricing = (lc: LandingContent): LandingContent => ({
    ...lc,
    pricing: {
      title: lc.pricing?.title || "Выберите подходящий тариф",
      tiers: lc.pricing?.tiers || [],
    },
  });

  const updatePricingTitle = (value: string) => {
    setLandingContent((prev) => {
      const lc = ensurePricing(prev);
      return { ...lc, pricing: { ...lc.pricing, title: value } };
    });
  };

  const addTier = () => {
    setLandingContent((prev) => {
      const lc = ensurePricing(prev);
      const tiers = lc.pricing!.tiers || [];
      if (tiers.length >= 4) return prev;
      return {
        ...lc,
        pricing: {
          ...lc.pricing,
          tiers: [...tiers, { name: "Новый тариф", price: 0, features: ["Доступ к курсу"], is_popular: false }],
        },
      };
    });
  };

  const removeTier = (index: number) => {
    setLandingContent((prev) => {
      const lc = ensurePricing(prev);
      return {
        ...lc,
        pricing: { ...lc.pricing, tiers: (lc.pricing!.tiers || []).filter((_, i) => i !== index) },
      };
    });
  };

  const updateTier = (index: number, field: keyof PricingTier, value: any) => {
    setLandingContent((prev) => {
      const lc = ensurePricing(prev);
      const tiers = [...(lc.pricing!.tiers || [])];
      tiers[index] = { ...tiers[index], [field]: value };
      return { ...lc, pricing: { ...lc.pricing, tiers } };
    });
  };

  const addTierFeature = (tierIndex: number) => {
    setLandingContent((prev) => {
      const lc = ensurePricing(prev);
      const tiers = [...(lc.pricing!.tiers || [])];
      tiers[tierIndex] = { ...tiers[tierIndex], features: [...tiers[tierIndex].features, "Новый пункт"] };
      return { ...lc, pricing: { ...lc.pricing, tiers } };
    });
  };

  const removeTierFeature = (tierIndex: number, featureIndex: number) => {
    setLandingContent((prev) => {
      const lc = ensurePricing(prev);
      const tiers = [...(lc.pricing!.tiers || [])];
      tiers[tierIndex] = {
        ...tiers[tierIndex],
        features: tiers[tierIndex].features.filter((_, i) => i !== featureIndex),
      };
      return { ...lc, pricing: { ...lc.pricing, tiers } };
    });
  };

  const updateTierFeature = (tierIndex: number, featureIndex: number, value: string) => {
    setLandingContent((prev) => {
      const lc = ensurePricing(prev);
      const tiers = [...(lc.pricing!.tiers || [])];
      const features = [...tiers[tierIndex].features];
      features[featureIndex] = value;
      tiers[tierIndex] = { ...tiers[tierIndex], features };
      return { ...lc, pricing: { ...lc.pricing, tiers } };
    });
  };

  const handleAiGenerate = async (type: "seo" | "form") => {
    setAiLoading(type);
    try {
      const { data, error } = await supabase.functions.invoke("generate-seo", {
        body: { courseTitle, courseDescription: courseDescription || "", type },
      });
      if (error) throw error;
      if (!data) throw new Error("Нет данных");

      if (type === "seo") {
        setLandingContent((prev) => ({
          ...prev,
          seo: {
            ...prev.seo,
            meta_title: data.meta_title || prev.seo?.meta_title,
            meta_description: data.meta_description || prev.seo?.meta_description,
            keywords: data.keywords || prev.seo?.keywords,
          },
        }));
        toast.success("SEO-теги сгенерированы");
      } else if (type === "form") {
        setLandingContent((prev) => ({
          ...prev,
          enrollment_form: {
            ...prev.enrollment_form,
            subtitle: data.subtitle || prev.enrollment_form?.subtitle,
            button_text: data.button_text || prev.enrollment_form?.button_text,
          },
        }));
        toast.success("Тексты формы сгенерированы");
      }
    } catch (e) {
      console.error(e);
      toast.error("Ошибка ИИ-генерации", { description: getErrorMessage(e) });
    } finally {
      setAiLoading(null);
    }
  };

  const publicUrl = `${window.location.origin}/c/${slug}`;

  const copyUrl = () => {
    navigator.clipboard.writeText(publicUrl);
    toast.success("Ссылка скопирована");
  };

  return {
    slug, setSlug, accentColor, setAccentColor, price, setPrice,
    allowMaterialsDownload, setAllowMaterialsDownload,
    landingContent, setLandingContent, promoCodes,
    saving, loading, aiLoading, publicUrl,
    newCode, setNewCode, newDiscount, setNewDiscount, newType, setNewType,
    handleSave, addPromoCode, deletePromoCode, togglePromoCode,
    updateEnrollmentForm, updateAnalytics, updateSeo,
    handleAiGenerate, copyUrl,
    updatePricingTitle, addTier, removeTier, updateTier,
    addTierFeature, removeTierFeature, updateTierFeature,
  };
}
