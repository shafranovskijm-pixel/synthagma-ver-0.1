import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Plus, Trash2, Loader2, ExternalLink, Sparkles, Tag, ArrowUp, Globe, FileEdit, BarChart3 } from "lucide-react";

interface Props {
  courseId: string;
  courseTitle: string;
  courseDescription?: string;
}

interface PromoCode {
  id: string;
  code: string;
  discount_value: number;
  discount_type: string;
  is_active: boolean;
  max_uses: number | null;
  used_count: number;
  valid_until: string | null;
}

interface LandingContent {
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
  blocks?: any[];
  external_url?: string;
}

function transliterate(str: string): string {
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

export function CoursePageSettingsContent({ courseId, courseTitle, courseDescription }: Props) {
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
    } catch (e: any) {
      console.error(e);
      toast.error("Ошибка ИИ-генерации", { description: e.message });
    } finally {
      setAiLoading(null);
    }
  };

  const publicUrl = `${window.location.origin}/c/${slug}`;

  const copyUrl = () => {
    navigator.clipboard.writeText(publicUrl);
    toast.success("Ссылка скопирована");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const descCharCount = (landingContent.seo?.meta_description || "").length;

  return (
    <Tabs defaultValue="page" className="mt-2">
      <TabsList className="w-full grid grid-cols-5">
        <TabsTrigger value="page">Страница</TabsTrigger>
        <TabsTrigger value="seo">SEO</TabsTrigger>
        <TabsTrigger value="form">Форма записи</TabsTrigger>
        <TabsTrigger value="promo">Промокоды</TabsTrigger>
        <TabsTrigger value="analytics">Аналитика</TabsTrigger>
      </TabsList>

      <TabsContent value="page" className="space-y-5 mt-4">
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 border border-border/50 p-3 mb-1">
          <Globe className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">Настройте URL, цвет и цену вашего курса. Эти параметры отображаются на публичной странице.</p>
        </div>
        <div className="space-y-2">
          <Label>URL страницы курса</Label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-0 rounded-md border border-input bg-muted/50 px-3 text-sm">
              <span className="text-muted-foreground shrink-0">/c/</span>
              <input
                className="flex-1 bg-transparent border-0 outline-none py-2 text-foreground"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="my-course"
              />
            </div>
            <Button variant="outline" size="icon" onClick={copyUrl} title="Копировать ссылку">
              <Copy className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => window.open(publicUrl, "_blank")} title="Открыть страницу">
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{publicUrl}</p>
        </div>

        <div className="space-y-2">
          <Label>Акцентный цвет</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="w-10 h-10 rounded-md border border-input cursor-pointer"
            />
            <Input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-32" />
            <div className="w-24 h-10 rounded-md" style={{ backgroundColor: accentColor }} />
        </div>

        <div className="space-y-2">
          <Label>Цена курса (₽)</Label>
          <Input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value) || 0)}
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground">0 = бесплатный курс</p>
        </div>
        </div>

        <div className="space-y-2">
          <Label>Внешний редирект (необязательно)</Label>
          <Input
            value={landingContent.external_url || ""}
            onChange={(e) => setLandingContent((prev) => ({ ...prev, external_url: e.target.value || undefined }))}
            placeholder="https://example.com/course-page"
          />
          <p className="text-xs text-muted-foreground">Если указано, посетители будут перенаправлены на эту ссылку</p>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Сохранить настройки
        </Button>
      </TabsContent>

      <TabsContent value="seo" className="space-y-5 mt-4">
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 border border-border/50 p-3 mb-1">
          <Globe className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">Оптимизируйте курс для поисковых систем — заполните метатеги вручную или с помощью ИИ.</p>
        </div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">SEO-настройки</h3>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => handleAiGenerate("seo")}
            disabled={aiLoading === "seo"}
          >
            {aiLoading === "seo" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Заполнить с ИИ
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Meta Title <span className="text-muted-foreground text-xs">(до 60 символов)</span></Label>
          <Input
            value={landingContent.seo?.meta_title || ""}
            onChange={(e) => updateSeo("meta_title", e.target.value)}
            placeholder={courseTitle}
            maxLength={60}
          />
          <p className="text-xs text-muted-foreground">{(landingContent.seo?.meta_title || "").length}/60</p>
        </div>

        <div className="space-y-2">
          <Label>Meta Description <span className="text-muted-foreground text-xs">(до 160 символов)</span></Label>
          <Textarea
            value={landingContent.seo?.meta_description || ""}
            onChange={(e) => updateSeo("meta_description", e.target.value)}
            placeholder="Краткое описание курса для поисковых систем"
            maxLength={160}
            rows={3}
          />
          <p className={`text-xs ${descCharCount > 160 ? "text-destructive" : "text-muted-foreground"}`}>
            {descCharCount}/160
          </p>
        </div>

        <div className="space-y-2">
          <Label>Ключевые слова</Label>
          <Input
            value={landingContent.seo?.keywords || ""}
            onChange={(e) => updateSeo("keywords", e.target.value)}
            placeholder="обучение, курс, онлайн, повышение квалификации"
          />
          <p className="text-xs text-muted-foreground">Через запятую, 5-8 ключевых слов</p>
        </div>

        <div className="space-y-2">
          <Label>OG Image URL <span className="text-muted-foreground text-xs">(для соцсетей)</span></Label>
          <Input
            value={landingContent.seo?.og_image_url || ""}
            onChange={(e) => updateSeo("og_image_url", e.target.value)}
            placeholder="По умолчанию используется обложка курса"
          />
        </div>

        <div className="space-y-2">
          <Label>Canonical URL <span className="text-muted-foreground text-xs">(необязательно)</span></Label>
          <Input
            value={landingContent.seo?.canonical_url || ""}
            onChange={(e) => updateSeo("canonical_url", e.target.value)}
            placeholder="Автоматически генерируется из slug"
          />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Сохранить настройки
        </Button>
      </TabsContent>

      <TabsContent value="form" className="space-y-5 mt-4">
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 border border-border/50 p-3 mb-1">
          <FileEdit className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">Настройте внешний вид формы записи на курс — текст кнопки, подзаголовок и дополнительные поля.</p>
        </div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Форма записи</h3>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => handleAiGenerate("form")}
            disabled={aiLoading === "form"}
          >
            {aiLoading === "form" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Заполнить с ИИ
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Подзаголовок формы</Label>
          <Input
            value={landingContent.enrollment_form?.subtitle || ""}
            onChange={(e) => updateEnrollmentForm("subtitle", e.target.value)}
            placeholder="Запишитесь на курс и начните обучение"
          />
        </div>

        <div className="space-y-2">
          <Label>Текст кнопки</Label>
          <Input
            value={landingContent.enrollment_form?.button_text || ""}
            onChange={(e) => updateEnrollmentForm("button_text", e.target.value)}
            placeholder="Записаться"
          />
        </div>

        <div className="space-y-3">
          <Label>Дополнительные поля</Label>
          <div className="flex items-center justify-between">
            <span className="text-sm">Телефон</span>
            <Switch
              checked={landingContent.enrollment_form?.show_phone || false}
              onCheckedChange={(v) => updateEnrollmentForm("show_phone", v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Компания</span>
            <Switch
              checked={landingContent.enrollment_form?.show_company || false}
              onCheckedChange={(v) => updateEnrollmentForm("show_company", v)}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Сохранить настройки
        </Button>
      </TabsContent>

      <TabsContent value="promo" className="space-y-4 mt-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Код</Label>
            <Input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="SALE20" />
          </div>
          <div className="w-20 space-y-1">
            <Label className="text-xs">Скидка</Label>
            <Input type="number" value={newDiscount} onChange={(e) => setNewDiscount(+e.target.value)} />
          </div>
          <div className="w-20 space-y-1">
            <Label className="text-xs">Тип</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              value={newType}
              onChange={(e) => setNewType(e.target.value as any)}
            >
              <option value="percent">%</option>
              <option value="fixed">₽</option>
            </select>
          </div>
          <Button onClick={addPromoCode} size="icon" className="shrink-0">
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {promoCodes.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Код</TableHead>
                <TableHead>Скидка</TableHead>
                <TableHead>Исп.</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {promoCodes.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono font-semibold">{p.code}</TableCell>
                  <TableCell>{p.discount_value}{p.discount_type === "percent" ? "%" : "₽"}</TableCell>
                  <TableCell>{p.used_count}{p.max_uses ? `/${p.max_uses}` : ""}</TableCell>
                  <TableCell>
                    <Switch checked={p.is_active} onCheckedChange={(v) => togglePromoCode(p.id, v)} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => deletePromoCode(p.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center text-center py-8 px-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-3">
              <Tag className="w-6 h-6 text-primary" />
            </div>
            <h4 className="text-sm font-semibold mb-1.5">Промокоды для курса</h4>
            <p className="text-xs text-muted-foreground max-w-sm mb-3">
              Создавайте промокоды со скидками в процентах или фиксированной сумме. Делитесь кодами с партнёрами, в рассылках или соцсетях — отслеживайте количество использований каждого кода.
            </p>
            <div className="flex items-center gap-1 text-xs text-primary">
              <ArrowUp className="w-3.5 h-3.5" />
              <span>Добавьте первый промокод выше</span>
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="analytics" className="space-y-5 mt-4">
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 border border-border/50 p-3 mb-1">
          <BarChart3 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">Подключите счётчики Яндекс.Метрики, Google Analytics и Meta Pixel для отслеживания конверсий на странице курса.</p>
        </div>
        <div className="space-y-2">
          <Label>Яндекс.Метрика — ID счётчика</Label>
          <Input
            value={landingContent.analytics?.yandex_metrika_id || ""}
            onChange={(e) => updateAnalytics("yandex_metrika_id", e.target.value)}
            placeholder="12345678"
          />
        </div>
        <div className="space-y-2">
          <Label>Яндекс.Метрика — ID цели</Label>
          <Input
            value={landingContent.analytics?.yandex_goal_id || ""}
            onChange={(e) => updateAnalytics("yandex_goal_id", e.target.value)}
            placeholder="goal_id"
          />
        </div>
        <div className="space-y-2">
          <Label>Google Analytics — Tracking ID</Label>
          <Input
            value={landingContent.analytics?.ga_tracking_id || ""}
            onChange={(e) => updateAnalytics("ga_tracking_id", e.target.value)}
            placeholder="G-XXXXXXXXXX"
          />
        </div>
        <div className="space-y-2">
          <Label>Google Analytics — Событие</Label>
          <Input
            value={landingContent.analytics?.ga_event_name || ""}
            onChange={(e) => updateAnalytics("ga_event_name", e.target.value)}
            placeholder="course_enrollment"
          />
        </div>
        <div className="space-y-2">
          <Label>Meta Pixel ID</Label>
          <Input
            value={landingContent.analytics?.meta_pixel_id || ""}
            onChange={(e) => updateAnalytics("meta_pixel_id", e.target.value)}
            placeholder="123456789"
          />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Сохранить настройки
        </Button>
      </TabsContent>
    </Tabs>
  );
}
