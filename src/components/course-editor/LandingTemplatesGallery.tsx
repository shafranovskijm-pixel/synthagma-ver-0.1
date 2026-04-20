import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, Crown, Lock } from "lucide-react";
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

export function LandingTemplatesGallery({ courseId }: Props) {
  const [pending, setPending] = useState<LandingTemplate | null>(null);
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    if (!pending) return;
    setApplying(true);
    try {
      // Берём существующее содержимое и мерджим поверх него данные шаблона —
      // accent_color и slug курса не трогаем.
      const { data: courseData, error: fetchErr } = await supabase
        .from("courses")
        .select("landing_content")
        .eq("id", courseId)
        .single();
      if (fetchErr) throw fetchErr;

      const existing = (courseData?.landing_content as any) || {};
      const merged = { ...existing, ...pending.data };

      const { error: updateErr } = await supabase
        .from("courses")
        .update({ landing_content: merged as any })
        .eq("id", courseId);
      if (updateErr) throw updateErr;

      toast.success(`Шаблон «${pending.name}» применён`, {
        description: "Откройте вкладку «Конструктор страницы», чтобы доработать содержимое.",
      });
      setPending(null);
    } catch (e: any) {
      console.error(e);
      toast.error("Не удалось применить шаблон", { description: e?.message });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Готовые шаблоны страниц
        </h3>
        <p className="text-xs text-muted-foreground">
          Один клик — и страница курса наполняется продающей структурой: заголовки, блоки, тарифы и FAQ. Все тексты можно изменить позже в «Конструкторе страницы».
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {LANDING_TEMPLATES.map((tpl) => {
          const tierMeta = TIER_META[tpl.tier];
          const TierIcon = tierMeta.icon;
          return (
            <article
              key={tpl.id}
              className="group flex flex-col rounded-2xl border border-border bg-card overflow-hidden transition-all hover:border-primary/40 hover:shadow-lg"
            >
              <div
                className="relative aspect-[16/10] overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${tpl.accent_color}33, ${tpl.accent_color}0d)`,
                }}
              >
                <img
                  src={tpl.preview_image}
                  alt={`Превью шаблона ${tpl.name}`}
                  loading="lazy"
                  width={1280}
                  height={800}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute top-3 left-3">
                  <Badge variant="outline" className={cn("backdrop-blur-sm font-medium gap-1", tierMeta.className)}>
                    <TierIcon className="w-3 h-3" />
                    {tierMeta.label}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-col flex-1 p-4 gap-3">
                <div className="space-y-1">
                  <h4 className="font-display text-base font-semibold leading-tight">{tpl.name}</h4>
                  <p className="text-xs text-muted-foreground leading-snug">{tpl.tagline}</p>
                </div>

                <div className="mt-auto pt-2">
                  <Button
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => setPending(tpl)}
                    disabled={applying}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Применить шаблон
                  </Button>
                </div>
              </div>
            </article>
          );
        })}

        {/* Slot-плашка для будущих шаблонов */}
        <article className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center min-h-[280px]">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <h4 className="font-medium text-sm mb-1">Скоро здесь будет больше шаблонов</h4>
          <p className="text-xs text-muted-foreground max-w-[220px]">
            Мы готовим премиальные шаблоны для разных ниш — следите за обновлениями.
          </p>
        </article>
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Применить шаблон «{pending?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Текущее содержимое страницы курса будет заменено структурой выбранного шаблона. Акцентный цвет, URL и настройки SEO сохранятся. Это действие нельзя отменить автоматически — лучше сохранить текущую версию заранее, если вам нужны её отдельные блоки.
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
