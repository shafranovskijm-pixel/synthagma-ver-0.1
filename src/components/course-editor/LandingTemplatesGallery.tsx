import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, Crown, Lock, Eye } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LANDING_TEMPLATES, type LandingTemplate, type TemplateTier } from "@/lib/landing-templates";
import { LandingTemplatePreviewDialog } from "./LandingTemplatePreviewDialog";
import { LandingTemplateMiniPreview } from "./LandingTemplateMiniPreview";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  courseId: string;
  accentColor?: string;
}

const TIER_META: Record<TemplateTier, { label: string; icon: typeof Sparkles; className: string }> = {
  free: { label: "Доступно всем", icon: Check, className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  pro: { label: "Pro", icon: Sparkles, className: "bg-primary/10 text-primary border-primary/20" },
  premium: { label: "Premium", icon: Crown, className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
};

/**
 * Локализованные подписи категорий шаблонов для бейджа на карточке.
 * Помогают пользователю с одного взгляда понять нишу шаблона.
 */
const CATEGORY_META: Record<string, string> = {
  business: "Бизнес",
  beauty: "Бьюти",
  edu: "Образование",
  lang: "Языки",
  it: "IT / Tech",
  safety: "Охрана труда",
};

interface CourseSnapshot {
  title: string;
  cover_image_url: string | null;
  price: number;
  duration: string | null;
  organization_id: string;
  landing_content: any;
}

export function LandingTemplatesGallery({ courseId, accentColor }: Props) {
  const [pending, setPending] = useState<LandingTemplate | null>(null);
  const [previewing, setPreviewing] = useState<LandingTemplate | null>(null);
  const [applying, setApplying] = useState(false);
  const [course, setCourse] = useState<CourseSnapshot | null>(null);
  const [orgName, setOrgName] = useState("");
  const [lessonsCount, setLessonsCount] = useState(0);
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null);

  // Грузим минимум данных курса для подстановки в превью.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: c } = await supabase
        .from("courses")
        .select("title, cover_image_url, price, duration, organization_id, landing_content")
        .eq("id", courseId)
        .maybeSingle();
      if (cancelled || !c) return;
      setCourse(c as any);
      setAppliedTemplateId((c.landing_content as any)?.applied_template_id ?? null);

      const [orgRes, lessonsRes] = await Promise.all([
        supabase.from("organizations").select("name").eq("id", c.organization_id).maybeSingle(),
        supabase.from("lessons").select("id", { count: "exact", head: true }).eq("course_id", courseId),
      ]);
      if (cancelled) return;
      setOrgName(orgRes.data?.name ?? "");
      setLessonsCount(lessonsRes.count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const handleApply = async () => {
    if (!pending) return;
    setApplying(true);
    try {
      const { data: courseData, error: fetchErr } = await supabase
        .from("courses")
        .select("landing_content")
        .eq("id", courseId)
        .single();
      if (fetchErr) throw fetchErr;

      const existing = (courseData?.landing_content as any) || {};
      // Мерджим шаблон поверх существующего, но критичные настройки сохраняем.
      const merged: Record<string, any> = {
        ...existing,
        ...pending.data,
        theme: pending.theme ?? null,
        applied_template_id: pending.id,
      };
      // Сохраняем SEO, аналитику, форму и редирект — их шаблон не должен трогать.
      if (existing.seo !== undefined) merged.seo = existing.seo;
      if (existing.analytics !== undefined) merged.analytics = existing.analytics;
      if (existing.enrollment_form !== undefined) merged.enrollment_form = existing.enrollment_form;
      if (existing.external_url !== undefined) merged.external_url = existing.external_url;

      const { error: updateErr } = await supabase
        .from("courses")
        .update({ landing_content: merged as any })
        .eq("id", courseId);
      if (updateErr) throw updateErr;

      setAppliedTemplateId(pending.id);
      setCourse((c) => (c ? { ...c, landing_content: merged } : c));
      toast.success(`Шаблон «${pending.name}» применён`, {
        description: "Откройте вкладку «Конструктор страницы», чтобы доработать содержимое.",
      });
      setPending(null);
      setPreviewing(null);
    } catch (e: any) {
      console.error(e);
      toast.error("Не удалось применить шаблон", { description: e?.message });
    } finally {
      setApplying(false);
    }
  };

  // Слот «Скоро» прячем, когда шаблонов уже достаточно.
  const showComingSoonSlot = LANDING_TEMPLATES.length < 3;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Готовые шаблоны страниц
        </h3>
        <p className="text-xs text-muted-foreground">
          Один клик — и страница курса наполняется продающей структурой: заголовки, блоки, тарифы и FAQ.
          Все тексты можно изменить позже в «Конструкторе страницы». SEO, аналитика и форма записи сохраняются.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {LANDING_TEMPLATES.map((tpl) => {
          const tierMeta = TIER_META[tpl.tier];
          const TierIcon = tierMeta.icon;
          const isActive = appliedTemplateId === tpl.id;

          return (
            <article
              key={tpl.id}
              className={cn(
                "group flex flex-col rounded-2xl border bg-card overflow-hidden transition-all hover:shadow-lg",
                isActive ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40",
              )}
            >
              <button
                type="button"
                onClick={() => setPreviewing(tpl)}
                className="relative aspect-[16/10] overflow-hidden text-left focus:outline-none focus:ring-2 focus:ring-primary/40"
                style={{
                  background: `linear-gradient(135deg, ${tpl.accent_color}33, ${tpl.accent_color}0d)`,
                }}
                aria-label={`Открыть превью шаблона ${tpl.name}`}
              >
                <LandingTemplateMiniPreview
                  template={tpl}
                  courseTitle={course?.title ?? "Название курса"}
                  orgName={orgName}
                  coverImageUrl={course?.cover_image_url ?? null}
                  price={course?.price ?? 0}
                  lessonsCount={lessonsCount}
                  duration={course?.duration ?? null}
                  courseAccentColor={accentColor ?? null}
                />
                <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10">
                  <Badge variant="outline" className={cn("backdrop-blur-sm font-medium gap-1", tierMeta.className)}>
                    <TierIcon className="w-3 h-3" />
                    {tierMeta.label}
                  </Badge>
                  {tpl.is_new && !isActive && (
                    <Badge variant="outline" className="backdrop-blur-sm font-medium gap-1 bg-amber-500/15 text-amber-700 border-amber-500/30">
                      Новинка
                    </Badge>
                  )}
                </div>
                {isActive && (
                  <div className="absolute top-3 right-3 z-10">
                    <Badge className="bg-primary text-primary-foreground gap-1 shadow">
                      <Check className="w-3 h-3" />
                      Активный
                    </Badge>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4 z-10">
                  <span className="inline-flex items-center gap-1.5 text-white text-xs font-medium bg-black/50 backdrop-blur px-3 py-1.5 rounded-full">
                    <Eye className="w-3.5 h-3.5" />
                    Нажмите, чтобы посмотреть
                  </span>
                </div>
              </button>

              <div className="flex flex-col flex-1 p-4 gap-3">
                <div className="space-y-1">
                  <h4 className="font-display text-base font-semibold leading-tight">{tpl.name}</h4>
                  <p className="text-xs text-muted-foreground leading-snug">{tpl.tagline}</p>
                </div>

                <div className="mt-auto pt-2 grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setPreviewing(tpl)}
                    disabled={applying}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Посмотреть
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setPending(tpl)}
                    disabled={applying}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {isActive ? "Применить снова" : "Применить"}
                  </Button>
                </div>
              </div>
            </article>
          );
        })}

        {showComingSoonSlot && (
          <article className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center min-h-[280px]">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <h4 className="font-medium text-sm mb-1">Скоро здесь будет больше шаблонов</h4>
            <p className="text-xs text-muted-foreground max-w-[220px]">
              Мы готовим премиальные шаблоны для разных ниш — следите за обновлениями.
            </p>
          </article>
        )}
      </div>

      <LandingTemplatePreviewDialog
        open={!!previewing}
        onOpenChange={(o) => !o && setPreviewing(null)}
        template={previewing}
        courseTitle={course?.title ?? "Название курса"}
        orgName={orgName}
        coverImageUrl={course?.cover_image_url ?? null}
        price={course?.price ?? 0}
        lessonsCount={lessonsCount}
        duration={course?.duration ?? null}
        courseAccentColor={accentColor ?? null}
        onApply={() => {
          if (previewing) setPending(previewing);
        }}
      />

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Применить шаблон «{pending?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Текстовое содержимое страницы курса будет заменено структурой выбранного шаблона.
              Акцентный цвет, URL-адрес, настройки SEO, аналитика и форма записи сохранятся.
              Это действие нельзя отменить автоматически — если вам нужны отдельные блоки текущей версии, скопируйте их заранее.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleApply} disabled={applying} className="gap-2">
              {applying && <SigmaSpinner size="sm" />}
              Применить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
