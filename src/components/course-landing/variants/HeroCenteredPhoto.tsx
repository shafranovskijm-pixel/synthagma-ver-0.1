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
}

/**
 * Hero «Centered Photo» — крупный заголовок по центру сверху,
 * под ним фото-«полароид» с лёгким наклоном. Для бьюти/лайфстайла.
 */
export function HeroCenteredPhoto({
  title, subtitle, orgName, backgroundUrl, coverImageUrl, accentColor,
  price, showPrice, lessonsCount, duration, isEditing,
  onTitleChange, onSubtitleChange, onBackgroundChange, enrollButton, onShowPriceChange,
}: Props) {
  const { theme } = useLandingTheme();
  const bg = backgroundUrl || coverImageUrl;
  const accent = accentColor || "#e879a6";

  return (
    <section className="relative overflow-hidden" style={{ background: `linear-gradient(180deg, ${accent}10 0%, transparent 100%)` }}>
      {isEditing && onBackgroundChange && (
        <button onClick={onBackgroundChange} className="absolute top-4 right-4 z-20 bg-card border text-sm px-4 py-2 rounded-lg shadow-sm hover:bg-accent transition">
          Изменить фон
        </button>
      )}
      <div className="max-w-4xl mx-auto px-6 pt-20 pb-16 md:pt-28 text-center">
        <p className="text-sm uppercase tracking-[0.25em] mb-4" style={{ color: accent }}>{orgName}</p>
        {isEditing ? (
          <h1 contentEditable suppressContentEditableWarning
            className="landing-heading text-4xl md:text-6xl font-bold leading-[1.1] mb-6 outline-none"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}
          >{title}</h1>
        ) : (
          <h1 className="landing-heading text-4xl md:text-6xl font-bold leading-[1.1] mb-6">{title}</h1>
        )}
        {isEditing ? (
          <p contentEditable suppressContentEditableWarning
            className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8 outline-none"
            onBlur={(e) => onSubtitleChange?.(e.currentTarget.textContent || "")}
          >{subtitle}</p>
        ) : (
          subtitle && <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">{subtitle}</p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-4 mb-12">
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

        {/* Polaroid photo */}
        <div className="relative w-full max-w-lg mx-auto">
          <div
            className="bg-white p-3 pb-12 shadow-2xl rotate-[-2deg] hover:rotate-0 transition-transform duration-500"
            style={{ borderRadius: theme.radius === "sharp" ? "0" : "8px" }}
          >
            <div className="aspect-[4/3] overflow-hidden bg-muted" style={{ borderRadius: theme.radius === "sharp" ? "0" : "4px" }}>
              {bg ? (
                <img src={bg} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${accent}44, ${accent}88)` }} />
              )}
            </div>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-zinc-500 italic">
              {duration && `${duration} • `}{lessonsCount} уроков
            </div>
          </div>
          {/* Sparkle decoration */}
          <div className="absolute -top-4 -right-4 text-3xl rotate-12" style={{ color: accent }}>✦</div>
          <div className="absolute -bottom-2 -left-6 text-2xl -rotate-12" style={{ color: accent, opacity: 0.6 }}>✦</div>
        </div>
      </div>
    </section>
  );
}
