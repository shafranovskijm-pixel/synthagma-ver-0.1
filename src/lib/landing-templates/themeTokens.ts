import type { LandingTheme } from "./types";

/**
 * Карты соответствия токенов темы → конкретные CSS-классы Tailwind / inline-стили.
 * Меняя только эти карты, можно переопределить визуальную семантику всех шаблонов.
 */

export const fontHeadingClass: Record<LandingTheme["font_heading"], string> = {
  inter: "font-[Inter]",
  manrope: "font-[Manrope]",
  playfair: "font-[Playfair_Display]",
  unbounded: "font-[Unbounded]",
  jetbrains: "font-[JetBrains_Mono]",
};

export const fontBodyClass: Record<LandingTheme["font_body"], string> = {
  inter: "font-[Inter]",
  manrope: "font-[Manrope]",
  "pt-serif": "font-[PT_Serif]",
};

export const radiusValue: Record<LandingTheme["radius"], string> = {
  sharp: "0px",
  soft: "16px",
  pill: "9999px",
};

export const radiusCardClass: Record<LandingTheme["radius"], string> = {
  sharp: "rounded-none",
  soft: "rounded-2xl",
  pill: "rounded-3xl",
};

export const radiusButtonClass: Record<LandingTheme["radius"], string> = {
  sharp: "rounded-none",
  soft: "rounded-xl",
  pill: "rounded-full",
};

export const sectionSpacingClass: Record<LandingTheme["section_spacing"], string> = {
  compact: "py-10 md:py-14",
  normal: "py-16 md:py-20",
  roomy: "py-20 md:py-28",
};

export const cardStyleClass: Record<LandingTheme["card_style"], string> = {
  flat: "bg-card border border-border",
  shadow: "bg-card border border-border/40 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.12)]",
  glass: "bg-white/[0.06] backdrop-blur-xl border border-white/15 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.4)]",
  bordered: "bg-card border-2 border-border",
};

/**
 * Возвращает SVG data-URL декоративного паттерна для фона страницы.
 * Все паттерны легковесные (≤2 КБ inline) и не требуют сетевых запросов.
 */
export function getDecorBackground(decor: LandingTheme["decor"], accent: string): string {
  switch (decor) {
    case "dots": {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><circle cx='2' cy='2' r='1.2' fill='${encodeURIComponent(accent)}' opacity='0.18'/></svg>`;
      return `url("data:image/svg+xml;utf8,${svg}")`;
    }
    case "grid": {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><path d='M 40 0 L 0 0 0 40' fill='none' stroke='${encodeURIComponent(accent)}' stroke-width='0.6' opacity='0.18'/></svg>`;
      return `url("data:image/svg+xml;utf8,${svg}")`;
    }
    case "noise": {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.55  0 0 0 0 0.45  0 0 0 0 0.30  0 0 0 0.08 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
      return `url("data:image/svg+xml;utf8,${svg}")`;
    }
    case "sparkles": {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><g fill='${encodeURIComponent(accent)}' opacity='0.22'><circle cx='10' cy='12' r='1'/><circle cx='55' cy='30' r='0.8'/><circle cx='30' cy='60' r='1.2'/><circle cx='70' cy='68' r='0.6'/></g></svg>`;
      return `url("data:image/svg+xml;utf8,${svg}")`;
    }
    case "aurora": {
      // gradient — обрабатывается через linear-gradient в провайдере
      return "none";
    }
    case "none":
    default:
      return "none";
  }
}

export function getAuroraGradient(accent: string): string {
  return `radial-gradient(circle at 20% 10%, ${accent}22 0%, transparent 50%), radial-gradient(circle at 80% 70%, ${accent}1a 0%, transparent 55%)`;
}
