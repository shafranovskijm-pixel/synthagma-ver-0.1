import { createContext, useContext, useMemo, type ReactNode, type CSSProperties } from "react";
import { defaultLandingTheme, type LandingTheme } from "@/lib/landing-templates/types";
import {
  fontBodyClass,
  fontHeadingClass,
  getAuroraGradient,
  getDecorBackground,
  radiusValue,
} from "@/lib/landing-templates/themeTokens";
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
      // accentColor — это hex; для совместимости с Tailwind hsl(var(--primary)) подменять не будем
      // вместо этого пробрасываем как самостоятельную переменную.
      vars["--landing-accent"] = accentColor;
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

  return (
    <LandingThemeContext.Provider value={{ theme: merged, accent: accentColor }}>
      <div
        className={cn(
          "relative",
          fontBodyClass[merged.font_body],
          isDark ? "bg-zinc-950 text-zinc-100" : "",
          className,
        )}
        style={{ ...cssVars, ...style }}
      >
        {/* Декоративный фоновый слой */}
        {!bare && (decorPattern !== "none" || auroraGradient) && (
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
