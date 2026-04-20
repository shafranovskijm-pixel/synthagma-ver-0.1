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
 * Hero «Dark Promo» — тёмный фон, неоновый акцент, кодовая сетка.
 * Для IT/tech-шаблонов и спец-промо (Чёрная Пятница).
 */
export function HeroDarkPromo({
  title, subtitle, orgName, backgroundUrl, coverImageUrl, accentColor,
  price, showPrice, lessonsCount, duration, isEditing,
  onTitleChange, onSubtitleChange, onBackgroundChange, enrollButton, onShowPriceChange,
}: Props) {
  const { theme } = useLandingTheme();
  const bg = backgroundUrl || coverImageUrl;
  const accent = accentColor || "#6366f1";

  return (
    <section className="relative overflow-hidden bg-zinc-950 text-zinc-100 min-h-[560px] flex items-center">
      {/* Background image with heavy overlay */}
      <div className="absolute inset-0">
        {bg && <img src={bg} alt="" className="w-full h-full object-cover opacity-40" />}
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at top, ${accent}40 0%, transparent 60%), linear-gradient(180deg, transparent 0%, rgba(9,9,11,0.95) 100%)` }} />
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `radial-gradient(${accent}55 1px, transparent 1px)`,
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      {isEditing && onBackgroundChange && (
        <button onClick={onBackgroundChange} className="absolute top-4 right-4 z-20 bg-zinc-800/90 text-white text-sm px-4 py-2 rounded-lg shadow hover:bg-zinc-700 transition border border-zinc-700">
          Изменить фон
        </button>
      )}

      <div className="relative z-10 w-full max-w-5xl mx-auto px-6 py-20">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6 text-xs font-mono uppercase tracking-wider"
          style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}55` }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accent }} />
          {orgName}
        </div>
        {isEditing ? (
          <h1 contentEditable suppressContentEditableWarning
            className="landing-heading text-5xl md:text-7xl font-extrabold leading-[1.02] mb-6 outline-none"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}
          >{title}</h1>
        ) : (
          <h1 className="landing-heading text-5xl md:text-7xl font-extrabold leading-[1.02] mb-6">
            <span style={{ background: `linear-gradient(135deg, ${accent}, #ffffff)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {title}
            </span>
          </h1>
        )}
        {isEditing ? (
          <p contentEditable suppressContentEditableWarning
            className="text-zinc-400 text-lg max-w-2xl mb-8 outline-none"
            onBlur={(e) => onSubtitleChange?.(e.currentTarget.textContent || "")}
          >{subtitle}</p>
        ) : (
          subtitle && (
            <p className={`text-zinc-400 text-lg max-w-2xl mb-8 ${theme.template_id === "lab" ? "tpl-lab-card-cursor" : ""}`}>
              {subtitle}
            </p>
          )
        )}

        <div className="flex flex-wrap items-center gap-4 mb-8">
          {showPrice && (price > 0 ? (
            <span className="text-3xl font-bold text-white font-mono">{price.toLocaleString("ru-RU")} ₽</span>
          ) : (
            <Badge className={`text-base px-4 py-1 bg-white/10 text-white border-white/20 ${radiusButtonClass[theme.radius]}`}>Бесплатно</Badge>
          ))}
          {enrollButton}
          {isEditing && onShowPriceChange && (
            <label className="flex items-center gap-2 text-zinc-400 text-sm cursor-pointer">
              <input type="checkbox" checked={showPrice} onChange={(e) => onShowPriceChange(e.target.checked)} className="rounded" />
              Показывать цену
            </label>
          )}
        </div>

        <div className="flex gap-6 text-zinc-500 text-sm font-mono">
          {duration && <span>⏱ {duration}</span>}
          <span>📚 {lessonsCount} модулей</span>
        </div>
      </div>
    </section>
  );
}
