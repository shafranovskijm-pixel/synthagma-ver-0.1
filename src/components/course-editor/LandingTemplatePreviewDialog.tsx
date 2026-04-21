import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Sparkles, X } from "lucide-react";
import type { LandingTemplate } from "@/lib/landing-templates";
import { ALL_SECTIONS, type LandingData } from "@/hooks/useLandingEditor";
import { LandingHeroSection } from "@/components/course-landing/LandingHeroSection";
import { LandingAudienceSection } from "@/components/course-landing/LandingAudienceSection";
import { LandingLearnSection } from "@/components/course-landing/LandingLearnSection";
import { LandingProcessSection } from "@/components/course-landing/LandingProcessSection";
import { LandingBenefitsSection } from "@/components/course-landing/LandingBenefitsSection";
import { LandingReviewsSection } from "@/components/course-landing/LandingReviewsSection";
import { LandingPricingSection } from "@/components/course-landing/LandingPricingSection";
import { LandingFaqSection } from "@/components/course-landing/LandingFaqSection";
import { LandingCtaSection } from "@/components/course-landing/LandingCtaSection";
import { LandingThemeProvider } from "@/components/course-landing/LandingThemeProvider";
import { APP_VERSION } from "@/lib/appVersion";
import { forceClientRefresh } from "@/utils/forceClientRefresh";
import { RefreshCw } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: LandingTemplate | null;
  courseTitle: string;
  orgName: string;
  coverImageUrl: string | null;
  price: number;
  lessonsCount: number;
  duration: string | null;
  /** Цвет курса; если в шаблоне свой — он перебивает */
  courseAccentColor?: string | null;
  onApply: () => void;
}

/**
 * Полноэкранный предпросмотр шаблона лендинга.
 * Рендерит секции по `sections_order` шаблона, скрывая `sections_hidden`.
 */
export function LandingTemplatePreviewDialog({
  open,
  onOpenChange,
  template,
  courseTitle,
  orgName,
  coverImageUrl,
  price,
  lessonsCount,
  duration,
  courseAccentColor,
  onApply,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // При смене шаблона возвращаем скролл наверх, чтобы превью всегда начиналось с hero.
  useEffect(() => {
    if (!template || !scrollRef.current) return;
    const viewport = scrollRef.current.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (viewport) viewport.scrollTop = 0;
  }, [template?.id]);

  // Прелоад тяжёлых webp-фонов шаблона при открытии — устраняет «белый миг» 0.5–1с.
  useEffect(() => {
    if (!open || !template?.theme) return;
    const urls = [template.theme.section_bg_url, template.theme.pricing_bg_url, template.theme.cta_bg_url].filter(Boolean) as string[];
    const links: HTMLLinkElement[] = urls.map((href) => {
      const l = document.createElement("link");
      l.rel = "preload"; l.as = "image"; l.href = href;
      document.head.appendChild(l);
      return l;
    });
    return () => { links.forEach((l) => l.remove()); };
  }, [open, template?.id]);

  if (!template) return null;

  const data = template.data as Partial<LandingData>;
  const accentColor = template.accent_color || courseAccentColor || null;
  const effectiveCoverUrl = template.cover_image_url ?? coverImageUrl;
  const order = data.sections_order ?? ALL_SECTIONS;
  const hidden = new Set(data.sections_hidden ?? []);

  const renderSection = (id: string) => {
    if (hidden.has(id)) return null;

    switch (id) {
      case "hero":
        return (
          <LandingHeroSection
            key={id}
            title={courseTitle || "Название курса"}
            subtitle={data.hero?.subtitle ?? ""}
            orgName={orgName}
            backgroundUrl={data.hero?.background_url ?? null}
            coverImageUrl={effectiveCoverUrl}
            accentColor={accentColor}
            price={price}
            showPrice={data.hero?.show_price ?? true}
            lessonsCount={lessonsCount}
            duration={duration}
          />
        );
      case "audience":
        if (!data.audience) return null;
        return (
          <LandingAudienceSection
            key={id}
            title={data.audience.title}
            description={data.audience.description}
            items={data.audience.items}
          />
        );
      case "learn":
        if (!data.learn) return null;
        return (
          <LandingLearnSection
            key={id}
            title={data.learn.title}
            description={data.learn.description}
            items={data.learn.items}
          />
        );
      case "process":
        if (!data.process) return null;
        return (
          <LandingProcessSection
            key={id}
            title={data.process.title}
            content={data.process.content}
          />
        );
      case "benefits":
        if (!data.benefits) return null;
        return <LandingBenefitsSection key={id} benefits={data.benefits} />;
      case "reviews":
        if (!data.reviews) return null;
        return (
          <LandingReviewsSection
            key={id}
            title={data.reviews.title}
            reviews={data.reviews.items}
          />
        );
      case "pricing":
        if (!data.pricing) return null;
        return (
          <LandingPricingSection
            key={id}
            title={data.pricing.title}
            tiers={data.pricing.tiers}
          />
        );
      case "faq":
        if (!data.faq) return null;
        return (
          <LandingFaqSection
            key={id}
            title={data.faq.title}
            items={data.faq.items}
          />
        );
      case "cta":
        if (!data.cta) return null;
        return (
          <LandingCtaSection
            key={id}
            title={data.cta.title}
            subtitle={data.cta.subtitle}
            accentColor={accentColor}
            price={price}
          />
        );
      // teachers и program не показываем в preview шаблона — они зависят от данных курса
      default:
        return null;
    }
  };

  const isDark = template.theme?.scheme === "dark";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-6xl w-[96vw] h-[92vh] p-0 flex flex-col gap-0 overflow-hidden ${isDark ? "bg-zinc-950 text-zinc-100 border-zinc-800" : ""}`}>
        <DialogHeader className="px-5 py-3 border-b shrink-0 flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-lg shrink-0"
              style={{ background: `linear-gradient(135deg, ${template.accent_color}, ${template.accent_color}55)` }}
            />
            <div className="min-w-0">
              <DialogTitle className="text-base truncate flex items-center gap-2">
                Предпросмотр шаблона «{template.name}»
                {template.is_new && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] uppercase tracking-wide">
                    New
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs truncate">{template.tagline}</DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => forceClientRefresh()}
              className="gap-1 text-muted-foreground hover:text-foreground"
              title="Сбросить кэш и перезагрузить превью"
            >
              <RefreshCw className="w-4 h-4" />
              Сбросить кэш
            </Button>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="gap-1">
              <X className="w-4 h-4" />
              Закрыть
            </Button>
            <Button size="sm" onClick={onApply} className="gap-2">
              <Sparkles className="w-4 h-4" />
              Применить шаблон
            </Button>
          </div>
        </DialogHeader>

        {/* Диагностический бейдж — показывает реальные layout-ключи активного шаблона.
            Если здесь видно "wide-feature-row", а ниже отрисованы 3 одинаковые карточки —
            значит проблема не в шаблоне, а в кэше браузера: жми «Сбросить кэш». */}
        <div className="px-5 py-2 border-b bg-muted/30 shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-muted-foreground">
          <span className="font-semibold text-foreground">{template.id}</span>
          <span>· v{APP_VERSION}</span>
          <span>· audience: <b className="text-foreground">{template.theme?.audience_layout ?? "default"}</b></span>
          <span>· benefits: <b className="text-foreground">{template.theme?.benefits_layout ?? "default"}</b></span>
          <span>· pricing: <b className="text-foreground">{template.theme?.pricing_layout ?? "default"}</b></span>
          <span>· reviews: <b className="text-foreground">{template.theme?.reviews_layout ?? "default"}</b></span>
          <span>· faq: <b className="text-foreground">{template.theme?.faq_layout ?? "default"}</b></span>
          <span>· cta: <b className="text-foreground">{template.theme?.cta_layout ?? "default"}</b></span>
        </div>

        <ScrollArea ref={scrollRef} className="flex-1">
          <div key={`preview-tree-${template.id}-${APP_VERSION}`}>
            <LandingThemeProvider
              key={`${template.id}-${APP_VERSION}`}
              theme={template.theme}
              accent={accentColor}
              style={accentColor ? ({ ["--primary" as any]: accentColor } as React.CSSProperties) : undefined}
            >
              {order.map(renderSection)}
            </LandingThemeProvider>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
