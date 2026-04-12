import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Plus, Trash2, Loader2, ExternalLink } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
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

export function CoursePageSettingsDialog({ open, onOpenChange, courseId, courseTitle }: Props) {
  const [slug, setSlug] = useState("");
  const [accentColor, setAccentColor] = useState("#6366f1");
  const [landingContent, setLandingContent] = useState<LandingContent>({});
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // New promo code form
  const [newCode, setNewCode] = useState("");
  const [newDiscount, setNewDiscount] = useState(10);
  const [newType, setNewType] = useState<"percent" | "fixed">("percent");

  useEffect(() => {
    if (open && courseId) loadData();
  }, [open, courseId]);

  const loadData = async () => {
    setLoading(true);
    const [courseRes, promoRes] = await Promise.all([
      supabase.from("courses").select("slug, accent_color, landing_content").eq("id", courseId).single(),
      supabase.from("course_promo_codes").select("*").eq("course_id", courseId).order("created_at", { ascending: false }),
    ]);

    if (courseRes.data) {
      setSlug(courseRes.data.slug || transliterate(courseTitle));
      setAccentColor(courseRes.data.accent_color || "#6366f1");
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

  const publicUrl = `${window.location.origin}/c/${slug}`;

  const copyUrl = () => {
    navigator.clipboard.writeText(publicUrl);
    toast.success("Ссылка скопирована");
  };

  if (loading && open) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Настройки страницы курса</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="page" className="mt-2">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="page">Страница</TabsTrigger>
            <TabsTrigger value="form">Форма записи</TabsTrigger>
            <TabsTrigger value="promo">Промокоды</TabsTrigger>
            <TabsTrigger value="analytics">Аналитика</TabsTrigger>
          </TabsList>

          {/* Tab: Page Settings */}
          <TabsContent value="page" className="space-y-5 mt-4">
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

          {/* Tab: Enrollment Form */}
          <TabsContent value="form" className="space-y-5 mt-4">
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

          {/* Tab: Promo Codes */}
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
              <p className="text-sm text-muted-foreground text-center py-6">Промокоды не добавлены</p>
            )}
          </TabsContent>

          {/* Tab: Analytics */}
          <TabsContent value="analytics" className="space-y-5 mt-4">
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
      </DialogContent>
    </Dialog>
  );
}
