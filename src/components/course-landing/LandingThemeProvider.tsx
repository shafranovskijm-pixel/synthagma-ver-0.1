import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode, type CSSProperties } from "react";
import { defaultLandingTheme, type LandingTheme } from "@/lib/landing-templates/types";
import {
  fontBodyClass,
  fontHeadingClass,
  getAuroraGradient,
  getDecorBackground,
  getSectionBackgroundImage,
  radiusValue,
} from "@/lib/landing-templates/themeTokens";
import { getTemplateStyle } from "@/lib/landing-templates/templateStyles";
import { useRevealOnScroll } from "@/hooks/useRevealOnScroll";
import { cn } from "@/lib/utils";

interface LandingThemeContextValue {
  theme: LandingTheme;
  accent: string | null;
}

const LandingThemeContext = createContext<LandingThemeContextValue>({
  theme: defaultLandingTheme,
  accent: null,
});

export function useLandingTheme() {
  return useContext(LandingThemeContext);
}

/**
 * Возвращает per-template скин (CSS-классы карточек/кнопок/заголовков) для
 * текущего шаблона. Если `template_id` не задан — вернёт нейтральные пустые
 * классы и компонент использует базовые токены темы.
 */
export function useTemplateStyle() {
  const { theme } = useContext(LandingThemeContext);
  return getTemplateStyle(theme.template_id);
}

interface Props {
  theme?: Partial<LandingTheme> | null;
  accent?: string | null;
  /** Если true — провайдер не рендерит свою декор-подложку (для мини-превью внутри карточки) */
  bare?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Оборачивает поддерево лендинга в тему оформления:
 *  - применяет шрифты темы (через классы);
 *  - выставляет CSS-переменные `--landing-radius`, `--primary` (акцент) и т.д.;
 *  - рендерит декоративный фон-паттерн поверх страницы.
 *
 * Если `theme` отсутствует — используется `defaultLandingTheme`, поведение
 * полностью совпадает с прежним визуалом (обратная совместимость).
 */
export function LandingThemeProvider({ theme, accent, bare, className, style, children }: Props) {
  const merged: LandingTheme = useMemo(
    () => ({ ...defaultLandingTheme, ...(theme ?? {}) }),
    [theme],
  );

  const accentColor = accent ?? null;

  const cssVars: CSSProperties = useMemo(() => {
    const vars: Record<string, string> = {
      "--landing-radius": radiusValue[merged.radius],
    };
    if (accentColor) {
      vars["--landing-accent"] = accentColor;
    }
    // Фоновые картинки секций — пробрасываем как готовые background-image-строки
    // (linear-gradient overlay + url). Используются CSS-классами .landing-bg-*.
    const overlayHex = merged.scheme === "dark" ? "#0a0a0a" : "#ffffff";
    const overlay = merged.section_bg_overlay ?? 0.85;
    if (merged.section_bg_url) {
      vars["--landing-section-bg"] = getSectionBackgroundImage(merged.section_bg_url, overlayHex, overlay);
    }
    if (merged.pricing_bg_url) {
      vars["--landing-pricing-bg"] = getSectionBackgroundImage(merged.pricing_bg_url, overlayHex, Math.max(0, overlay - 0.05));
    }
    if (merged.cta_bg_url) {
      // CTA — более выразительный, overlay чуть прозрачнее
      vars["--landing-cta-bg"] = getSectionBackgroundImage(merged.cta_bg_url, overlayHex, Math.max(0, overlay - 0.15));
    }
    return vars as CSSProperties;
  }, [merged, accentColor]);

  const isDark = merged.scheme === "dark";

  const decorPattern = useMemo(
    () => getDecorBackground(merged.decor, accentColor ?? "#000000"),
    [merged.decor, accentColor],
  );
  const auroraGradient = useMemo(
    () => (merged.decor === "aurora" ? getAuroraGradient(accentColor ?? "#22b8a6") : null),
    [merged.decor, accentColor],
  );

  const skin = getTemplateStyle(merged.template_id);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Авто-разметка секций атрибутом data-reveal: вешаем на все <section>
  // и заголовки секций внутри лендинга. Используется CSS-анимациями
  // [data-template-skin="..."] [data-reveal] (см. index.css).
  useEffect(() => {
    if (bare) return;
    const root = rootRef.current;
    if (!root) return;
    const sections = root.querySelectorAll("section");
    sections.forEach((s) => s.setAttribute("data-reveal", ""));
    const titles = root.querySelectorAll(
      ".tpl-aurora-section-title, .tpl-beauty-section-title, .tpl-safety-section-title, .tpl-lab-section-title, .tpl-language-section-title",
    );
    titles.forEach((t) => t.setAttribute("data-reveal", ""));
  }, [bare, merged.template_id, children]);

  useRevealOnScroll(rootRef);

  return (
    <LandingThemeContext.Provider value={{ theme: merged, accent: accentColor }}>
      <div
        ref={rootRef}
        data-template-skin={skin.dataSkin || undefined}
        className={cn(
          "relative",
          fontBodyClass[merged.font_body],
          isDark ? "bg-zinc-950 text-zinc-100" : "",
          className,
        )}
        style={{ ...cssVars, ...style }}
      >
        {/* Декоративный фоновый слой — рендерится всегда (включая bare-режим в галерее).
            Только тяжёлые фоновые картинки секций мы при необходимости отключаем отдельно. */}
        {(decorPattern !== "none" || auroraGradient) && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              backgroundImage: [decorPattern !== "none" ? decorPattern : null, auroraGradient]
                .filter(Boolean)
                .join(", "),
              backgroundSize:
                merged.decor === "noise" ? "200px 200px" : merged.decor === "grid" ? "40px 40px" : "auto",
            }}
          />
        )}
        {/* Глобальные шрифты для заголовков внутри лендинга */}
        <style>{`
          .landing-heading { font-family: ${fontFamilyCss(merged.font_heading)}; }
          .landing-body { font-family: ${fontFamilyCss(merged.font_body)}; }
        `}</style>
        <div className={cn("relative z-10", fontHeadingClass[merged.font_heading])}>
          <div className={fontBodyClass[merged.font_body]}>{children}</div>
        </div>
      </div>
    </LandingThemeContext.Provider>
  );
}

function fontFamilyCss(key: LandingTheme["font_heading"] | LandingTheme["font_body"]): string {
  switch (key) {
    case "inter":
      return "'Inter', system-ui, sans-serif";
    case "manrope":
      return "'Manrope', system-ui, sans-serif";
    case "playfair":
      return "'Playfair Display', Georgia, serif";
    case "unbounded":
      return "'Unbounded', 'Inter', sans-serif";
    case "jetbrains":
      return "'JetBrains Mono', ui-monospace, monospace";
    case "pt-serif":
      return "'PT Serif', Georgia, serif";
    default:
      return "'Inter', system-ui, sans-serif";
  }
}
