import { Badge } from "@/components/ui/badge";
import { useLandingTheme } from "../LandingThemeProvider";
import { radiusButtonClass } from "@/lib/landing-templates/themeTokens";

interface Props {
  title: string;
  subtitle: string;
  orgName: string;
  backgroundUrl: string | null;
  coverImageUrl: string | null;
  accentColor: string | null;
  price: number;
  showPrice: boolean;
  lessonsCount: number;
  duration: string | null;
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onSubtitleChange?: (v: string) => void;
  onBackgroundChange?: () => void;
  enrollButton?: React.ReactNode;
  onShowPriceChange?: (v: boolean) => void;
  /** "left" — фото слева, "right" — фото справа */
  side?: "left" | "right";
}

/**
 * Hero split-layout: слева/справа крупный визуал, с другой стороны — текст и CTA.
 * Используется для бизнес/safety/language шаблонов.
 */
export function HeroSplit({
  title, subtitle, orgName, backgroundUrl, coverImageUrl, accentColor,
  price, showPrice, lessonsCount, duration, isEditing,
  onTitleChange, onSubtitleChange, onBackgroundChange, enrollButton, onShowPriceChange, side = "right",
}: Props) {
  const { theme } = useLandingTheme();
  const bg = backgroundUrl || coverImageUrl;
  const accent = accentColor || "#22b8a6";
  const initials = (title || "?").split(" ").slice(0, 2).map((s) => s[0]).join("").toUpperCase();

  return (
    <section className="relative overflow-hidden" style={{ background: `linear-gradient(${side === "right" ? "120deg" : "240deg"}, ${accent}10 0%, transparent 60%)` }}>
      {isEditing && onBackgroundChange && (
        <button onClick={onBackgroundChange} className="absolute top-4 right-4 z-20 bg-card border text-sm px-4 py-2 rounded-lg shadow-sm hover:bg-accent transition">
          Изменить фон
        </button>
      )}
      <div className={`max-w-6xl mx-auto px-6 py-20 md:py-28 grid lg:grid-cols-2 gap-10 items-center ${side === "left" ? "lg:[&>*:first-child]:order-2" : ""}`}>
        {/* Text */}
        <div>
          <p className="text-sm font-medium mb-3" style={{ color: accent }}>{orgName}</p>
          {isEditing ? (
            <h1 contentEditable suppressContentEditableWarning
              className="landing-heading text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.05] mb-5 outline-none border-b-2 border-dashed border-muted-foreground/20 focus:border-primary/40"
              onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}
            >{title}</h1>
          ) : (
            <h1 className="landing-heading text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.05] mb-5">{title}</h1>
          )}
          {isEditing ? (
            <p contentEditable suppressContentEditableWarning
              className="text-muted-foreground text-lg max-w-xl mb-7 outline-none border-b border-dashed border-muted-foreground/10 focus:border-primary/30"
              onBlur={(e) => onSubtitleChange?.(e.currentTarget.textContent || "")}
            >{subtitle}</p>
          ) : (
            subtitle && <p className="text-muted-foreground text-lg max-w-xl mb-7">{subtitle}</p>
          )}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            {showPrice && (price > 0 ? (
              <span className="text-3xl font-bold">{price.toLocaleString("ru-RU")} ₽</span>
            ) : (
              <Badge className={`text-base px-4 py-1 ${radiusButtonClass[theme.radius]}`} style={{ background: accent, color: "white" }}>Бесплатно</Badge>
            ))}
            {enrollButton}
            {isEditing && onShowPriceChange && (
              <label className="flex items-center gap-2 text-muted-foreground text-sm cursor-pointer">
                <input type="checkbox" checked={showPrice} onChange={(e) => onShowPriceChange(e.target.checked)} className="rounded" />
                Показывать цену
              </label>
            )}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {duration && <span className="flex items-center gap-1.5">⏱ {duration}</span>}
            <span className="flex items-center gap-1.5">📚 {lessonsCount} уроков</span>
          </div>
        </div>

        {/* Visual */}
        <div className="relative">
          <div
            className="aspect-[4/5] w-full max-w-md mx-auto overflow-hidden shadow-2xl relative"
            style={{
              borderRadius: theme.radius === "sharp" ? "0" : theme.radius === "pill" ? "32px" : "24px",
              background: bg ? undefined : `linear-gradient(135deg, ${accent}33, ${accent}66)`,
            }}
          >
            {bg ? (
              <img src={bg} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-7xl font-bold opacity-60">
                {initials}
              </div>
            )}
          </div>
          {/* Decorative blob */}
          <div
            className="absolute -z-0 -top-6 -right-6 w-32 h-32 rounded-full blur-3xl opacity-50"
            style={{ background: accent }}
          />
        </div>
      </div>
    </section>
  );
}
