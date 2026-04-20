import { useEffect, useRef, useState } from "react";
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

/**
 * Мини-рендер реального лендинга в карточке шаблона.
 * При hover на родительский `.group` контейнер плавно прокручивается сверху вниз,
 * показывая весь контент за ~7 секунд. Респектит prefers-reduced-motion.
 *
 * Внутренний рендер делается на ширине 1280px и масштабируется через CSS scale,
 * так что выглядит как точный «плакат» лендинга.
 */
interface Props {
  template: LandingTemplate;
  courseTitle: string;
  orgName: string;
  coverImageUrl: string | null;
  price: number;
  lessonsCount: number;
  duration: string | null;
  /** Цвет курса; перебивается accent_color шаблона, если задан */
  courseAccentColor?: string | null;
}

const RENDER_WIDTH = 1280;
// Карточка имеет соотношение 16:10 → видимая высота при scale = (cardWidth * 10/16) / scale.

export function LandingTemplateMiniPreview({
  template,
  courseTitle,
  orgName,
  coverImageUrl,
  price,
  lessonsCount,
  duration,
  courseAccentColor,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.18);
  const [maxTranslate, setMaxTranslate] = useState(0);

  const data = template.data as Partial<LandingData>;
  const accentColor = template.accent_color || courseAccentColor || null;
  const order = data.sections_order ?? ALL_SECTIONS;
  const hidden = new Set(data.sections_hidden ?? []);

  // Считаем скейл и максимальный сдвиг, чтобы анимация показала ровно весь контент.
  useEffect(() => {
    const recalc = () => {
      if (!wrapperRef.current || !innerRef.current) return;
      const w = wrapperRef.current.clientWidth;
      const h = wrapperRef.current.clientHeight;
      const s = w / RENDER_WIDTH;
      setScale(s);
      // Полная высота отрисованного контента в пикселях родителя
      const innerHeight = innerRef.current.scrollHeight * s;
      const m = Math.max(0, innerHeight - h);
      setMaxTranslate(m);
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    // Пересчёт после загрузки картинки обложки
    const t = window.setTimeout(recalc, 400);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, [template.id]);

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
            coverImageUrl={coverImageUrl}
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
        return <LandingProcessSection key={id} title={data.process.title} content={data.process.content} />;
      case "benefits":
        if (!data.benefits) return null;
        return <LandingBenefitsSection key={id} benefits={data.benefits} />;
      case "reviews":
        if (!data.reviews) return null;
        return <LandingReviewsSection key={id} title={data.reviews.title} reviews={data.reviews.items} />;
      case "pricing":
        if (!data.pricing) return null;
        return <LandingPricingSection key={id} title={data.pricing.title} tiers={data.pricing.tiers} />;
      case "faq":
        if (!data.faq) return null;
        return <LandingFaqSection key={id} title={data.faq.title} items={data.faq.items} />;
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
      default:
        return null;
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 overflow-hidden bg-background"
      style={accentColor ? ({ ["--primary" as any]: accentColor } as React.CSSProperties) : undefined}
      aria-hidden="true"
    >
      {/* Слой со скроллом — управляется CSS-переменной --mini-translate */}
      <div
        className="mini-preview-scroll will-change-transform"
        style={{
          transform: `translateY(0px)`,
          transition: "transform 0.6s ease-out",
          // CSS-переменные для hover-анимации (см. styles ниже)
          ["--mini-max" as any]: `-${maxTranslate}px`,
        }}
      >
        <div
          ref={innerRef}
          style={{
            width: `${RENDER_WIDTH}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
        >
          {order.map(renderSection)}
        </div>
      </div>

      {/* Hover-анимация и accessibility */}
      <style>{`
        .group:hover .mini-preview-scroll {
          animation: miniPreviewScroll 7s ease-in-out forwards;
        }
        @keyframes miniPreviewScroll {
          0% { transform: translateY(0); }
          15% { transform: translateY(0); }
          85% { transform: translateY(var(--mini-max)); }
          100% { transform: translateY(var(--mini-max)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .group:hover .mini-preview-scroll { animation: none; }
        }
      `}</style>
    </div>
  );
}
