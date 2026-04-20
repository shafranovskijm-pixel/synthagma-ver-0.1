import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, Plus, Trash2, ExternalLink, Sparkles, Tag, ArrowUp, Globe, FileEdit, BarChart3, Search, Ticket, LayoutTemplate } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useCoursePageSettings } from "@/hooks/useCoursePageSettings";
import { CoursePricingTiersTab } from "./CoursePricingTiersTab";
import { LandingTemplatesGallery } from "./LandingTemplatesGallery";
import { cn } from "@/lib/utils";

interface Props {
  courseId: string;
  courseTitle: string;
  courseDescription?: string;
}

type TabKey = "templates" | "page" | "seo" | "form" | "pricing" | "promo" | "analytics";

const TAB_META: Record<TabKey, { label: string; icon: any; description: string }> = {
  templates: { label: "Шаблоны", icon: LayoutTemplate, description: "Готовые продающие структуры страницы" },
  page: { label: "Страница", icon: Globe, description: "URL, акцентный цвет и цена курса" },
  seo: { label: "SEO", icon: Search, description: "Метатеги для поисковиков, ИИ-генерация" },
  form: { label: "Форма записи", icon: FileEdit, description: "Подзаголовок, кнопка и доп. поля заявки" },
  pricing: { label: "Тарифы", icon: Tag, description: "Несколько ценовых пакетов для лендинга" },
  promo: { label: "Промокоды", icon: Ticket, description: "Скидочные коды для покупателей" },
  analytics: { label: "Аналитика", icon: BarChart3, description: "Яндекс.Метрика, Google Analytics, Meta Pixel" },
};

const TAB_ORDER: TabKey[] = ["templates", "page", "seo", "form", "pricing", "promo", "analytics"];

export function CoursePageSettingsContent({ courseId, courseTitle, courseDescription }: Props) {
  const s = useCoursePageSettings(courseId, courseTitle, courseDescription);
  const [activeTab, setActiveTab] = useState<TabKey>("templates");

  if (s.loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner />
      </div>
    );
  }

  const descCharCount = (s.landingContent.seo?.meta_description || "").length;

  return (
    <div className="grid gap-5 mt-2 md:grid-cols-[240px_1fr]">
      {/* Vertical menu */}
      <nav className="flex flex-col gap-1">
        {TAB_ORDER.map((key) => {
          const meta = TAB_META[key];
          const Icon = meta.icon;
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors border",
                isActive
                  ? "bg-primary/10 border-primary/30 text-foreground"
                  : "border-transparent hover:bg-muted/60 text-foreground/80"
              )}
            >
              <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
              <div className="min-w-0">
                <div className={cn("text-sm font-medium leading-tight", isActive && "text-primary")}>
                  {meta.label}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  {meta.description}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Content */}
      <div className="min-w-0">
        {activeTab === "templates" && (
          <LandingTemplatesGallery courseId={courseId} accentColor={s.accentColor} />
        )}

        {activeTab === "page" && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>URL страницы курса</Label>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-0 rounded-md border border-input bg-muted/50 px-3 text-sm">
                  <span className="text-muted-foreground shrink-0">/c/</span>
                  <input
                    className="flex-1 bg-transparent border-0 outline-none py-2 text-foreground"
                    value={s.slug}
                    onChange={(e) => s.setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="my-course"
                  />
                </div>
                <Button variant="outline" size="icon" onClick={s.copyUrl} title="Копировать ссылку">
                  <Copy className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => window.open(s.publicUrl, "_blank")} title="Открыть страницу">
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{s.publicUrl}</p>
            </div>

            <div className="space-y-2">
              <Label>Акцентный цвет</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={s.accentColor}
                  onChange={(e) => s.setAccentColor(e.target.value)}
                  className="w-10 h-10 rounded-md border border-input cursor-pointer"
                />
                <Input value={s.accentColor} onChange={(e) => s.setAccentColor(e.target.value)} className="w-32" />
                <div className="w-24 h-10 rounded-md" style={{ backgroundColor: s.accentColor }} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Цена курса (₽)</Label>
              <Input
                type="number"
                min={0}
                value={s.price}
                onChange={(e) => s.setPrice(Number(e.target.value) || 0)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">0 = бесплатный курс</p>
            </div>

            <div className="space-y-2">
              <Label>Внешний редирект (необязательно)</Label>
              <Input
                value={s.landingContent.external_url || ""}
                onChange={(e) => s.setLandingContent((prev) => ({ ...prev, external_url: e.target.value || undefined }))}
                placeholder="https://example.com/course-page"
              />
              <p className="text-xs text-muted-foreground">Если указано, посетители будут перенаправлены на эту ссылку</p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="space-y-0.5">
                <Label>Разрешить скачивание материалов</Label>
                <p className="text-xs text-muted-foreground">Ученики смогут скачивать файлы из раздела «Материалы курса»</p>
              </div>
              <Switch checked={s.allowMaterialsDownload} onCheckedChange={s.setAllowMaterialsDownload} />
            </div>

            <Button onClick={s.handleSave} disabled={s.saving} className="w-full gap-2">
              {s.saving && <SigmaSpinner size="sm" />}
              Сохранить настройки
            </Button>
          </div>
        )}

        {activeTab === "seo" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">SEO-настройки</h3>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => s.handleAiGenerate("seo")} disabled={s.aiLoading === "seo"}>
                {s.aiLoading === "seo" ? <SigmaSpinner size="sm" /> : <Sparkles className="w-4 h-4" />}
                Заполнить с ИИ
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Meta Title <span className="text-muted-foreground text-xs">(до 60 символов)</span></Label>
              <Input value={s.landingContent.seo?.meta_title || ""} onChange={(e) => s.updateSeo("meta_title", e.target.value)} placeholder={courseTitle} maxLength={60} />
              <p className="text-xs text-muted-foreground">{(s.landingContent.seo?.meta_title || "").length}/60</p>
            </div>

            <div className="space-y-2">
              <Label>Meta Description <span className="text-muted-foreground text-xs">(до 160 символов)</span></Label>
              <Textarea value={s.landingContent.seo?.meta_description || ""} onChange={(e) => s.updateSeo("meta_description", e.target.value)} placeholder="Краткое описание курса для поисковых систем" maxLength={160} rows={3} />
              <p className={`text-xs ${descCharCount > 160 ? "text-destructive" : "text-muted-foreground"}`}>{descCharCount}/160</p>
            </div>

            <div className="space-y-2">
              <Label>Ключевые слова</Label>
              <Input value={s.landingContent.seo?.keywords || ""} onChange={(e) => s.updateSeo("keywords", e.target.value)} placeholder="обучение, курс, онлайн, повышение квалификации" />
              <p className="text-xs text-muted-foreground">Через запятую, 5-8 ключевых слов</p>
            </div>

            <div className="space-y-2">
              <Label>OG Image URL <span className="text-muted-foreground text-xs">(для соцсетей)</span></Label>
              <Input value={s.landingContent.seo?.og_image_url || ""} onChange={(e) => s.updateSeo("og_image_url", e.target.value)} placeholder="По умолчанию используется обложка курса" />
            </div>

            <div className="space-y-2">
              <Label>Canonical URL <span className="text-muted-foreground text-xs">(необязательно)</span></Label>
              <Input value={s.landingContent.seo?.canonical_url || ""} onChange={(e) => s.updateSeo("canonical_url", e.target.value)} placeholder="Автоматически генерируется из slug" />
            </div>

            <Button onClick={s.handleSave} disabled={s.saving} className="w-full gap-2">
              {s.saving && <SigmaSpinner size="sm" />}
              Сохранить настройки
            </Button>
          </div>
        )}

        {activeTab === "form" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Форма записи</h3>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => s.handleAiGenerate("form")} disabled={s.aiLoading === "form"}>
                {s.aiLoading === "form" ? <SigmaSpinner size="sm" /> : <Sparkles className="w-4 h-4" />}
                Заполнить с ИИ
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Подзаголовок формы</Label>
              <Input value={s.landingContent.enrollment_form?.subtitle || ""} onChange={(e) => s.updateEnrollmentForm("subtitle", e.target.value)} placeholder="Запишитесь на курс и начните обучение" />
            </div>

            <div className="space-y-2">
              <Label>Текст кнопки</Label>
              <Input value={s.landingContent.enrollment_form?.button_text || ""} onChange={(e) => s.updateEnrollmentForm("button_text", e.target.value)} placeholder="Записаться" />
            </div>

            <div className="space-y-3">
              <Label>Дополнительные поля</Label>
              <div className="flex items-center justify-between">
                <span className="text-sm">Телефон</span>
                <Switch checked={s.landingContent.enrollment_form?.show_phone || false} onCheckedChange={(v) => s.updateEnrollmentForm("show_phone", v)} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Компания</span>
                <Switch checked={s.landingContent.enrollment_form?.show_company || false} onCheckedChange={(v) => s.updateEnrollmentForm("show_company", v)} />
              </div>
            </div>

            <Button onClick={s.handleSave} disabled={s.saving} className="w-full gap-2">
              {s.saving && <SigmaSpinner size="sm" />}
              Сохранить настройки
            </Button>
          </div>
        )}

        {activeTab === "pricing" && <CoursePricingTiersTab s={s} />}

        {activeTab === "promo" && (
          <div className="space-y-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Код</Label>
                <Input value={s.newCode} onChange={(e) => s.setNewCode(e.target.value.toUpperCase())} placeholder="SALE20" />
              </div>
              <div className="w-20 space-y-1">
                <Label className="text-xs">Скидка</Label>
                <Input type="number" value={s.newDiscount} onChange={(e) => s.setNewDiscount(+e.target.value)} />
              </div>
              <div className="w-20 space-y-1">
                <Label className="text-xs">Тип</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                  value={s.newType}
                  onChange={(e) => s.setNewType(e.target.value as any)}
                >
                  <option value="percent">%</option>
                  <option value="fixed">₽</option>
                </select>
              </div>
              <Button onClick={s.addPromoCode} size="icon" className="shrink-0">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {s.promoCodes.length > 0 ? (
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
                  {s.promoCodes.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono font-semibold">{p.code}</TableCell>
                      <TableCell>{p.discount_value}{p.discount_type === "percent" ? "%" : "₽"}</TableCell>
                      <TableCell>{p.used_count}{p.max_uses ? `/${p.max_uses}` : ""}</TableCell>
                      <TableCell>
                        <Switch checked={p.is_active} onCheckedChange={(v) => s.togglePromoCode(p.id, v)} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => s.deletePromoCode(p.id)}>
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
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Яндекс.Метрика — ID счётчика</Label>
              <Input value={s.landingContent.analytics?.yandex_metrika_id || ""} onChange={(e) => s.updateAnalytics("yandex_metrika_id", e.target.value)} placeholder="12345678" />
            </div>
            <div className="space-y-2">
              <Label>Яндекс.Метрика — ID цели</Label>
              <Input value={s.landingContent.analytics?.yandex_goal_id || ""} onChange={(e) => s.updateAnalytics("yandex_goal_id", e.target.value)} placeholder="goal_id" />
            </div>
            <div className="space-y-2">
              <Label>Google Analytics — Tracking ID</Label>
              <Input value={s.landingContent.analytics?.ga_tracking_id || ""} onChange={(e) => s.updateAnalytics("ga_tracking_id", e.target.value)} placeholder="G-XXXXXXXXXX" />
            </div>
            <div className="space-y-2">
              <Label>Google Analytics — Событие</Label>
              <Input value={s.landingContent.analytics?.ga_event_name || ""} onChange={(e) => s.updateAnalytics("ga_event_name", e.target.value)} placeholder="course_enrollment" />
            </div>
            <div className="space-y-2">
              <Label>Meta Pixel ID</Label>
              <Input value={s.landingContent.analytics?.meta_pixel_id || ""} onChange={(e) => s.updateAnalytics("meta_pixel_id", e.target.value)} placeholder="123456789" />
            </div>

            <Button onClick={s.handleSave} disabled={s.saving} className="w-full gap-2">
              {s.saving && <SigmaSpinner size="sm" />}
              Сохранить настройки
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
