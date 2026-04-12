import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface LandingHeroProps {
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
}

export function LandingHeroSection({
  title,
  subtitle,
  orgName,
  backgroundUrl,
  coverImageUrl,
  accentColor,
  price,
  showPrice,
  lessonsCount,
  duration,
  isEditing,
  onTitleChange,
  onSubtitleChange,
  onBackgroundChange,
  enrollButton,
}: LandingHeroProps) {
  const bg = backgroundUrl || coverImageUrl;
  const accent = accentColor || "hsl(var(--primary))";

  return (
    <section className="relative min-h-[480px] flex items-end overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        {bg ? (
          <img src={bg} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: `linear-gradient(135deg, ${accent}22 0%, ${accent}44 100%)`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
      </div>

      {/* Edit background button */}
      {isEditing && onBackgroundChange && (
        <button
          onClick={onBackgroundChange}
          className="absolute top-4 right-4 z-20 bg-white/90 backdrop-blur text-sm px-4 py-2 rounded-lg shadow hover:bg-white transition font-medium"
        >
          Изменить фон секции
        </button>
      )}

      {/* Content */}
      <div className="relative z-10 w-full max-w-5xl mx-auto px-6 pb-12 pt-32">
        <p className="text-white/70 text-sm mb-2">{orgName}</p>

        {isEditing ? (
          <h1
            contentEditable
            suppressContentEditableWarning
            className="text-3xl md:text-5xl font-bold text-white mb-4 outline-none border-b-2 border-dashed border-white/30 focus:border-white/60 transition"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}
          >
            {title}
          </h1>
        ) : (
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">{title}</h1>
        )}

        {isEditing ? (
          <p
            contentEditable
            suppressContentEditableWarning
            className="text-white/80 text-lg max-w-2xl mb-6 outline-none border-b border-dashed border-white/20 focus:border-white/50 transition"
            onBlur={(e) => onSubtitleChange?.(e.currentTarget.textContent || "")}
          >
            {subtitle}
          </p>
        ) : (
          subtitle && <p className="text-white/80 text-lg max-w-2xl mb-6">{subtitle}</p>
        )}

        <div className="flex flex-wrap items-center gap-4">
          {showPrice && (
            price > 0 ? (
              <span className="text-3xl font-bold text-white">{price.toLocaleString("ru-RU")} ₽</span>
            ) : (
              <Badge className="text-base px-4 py-1 bg-white/20 text-white border-white/30">Бесплатно</Badge>
            )
          )}
          {enrollButton}
        </div>

        <div className="flex gap-6 mt-6 text-white/60 text-sm">
          {duration && <span>⏱ {duration}</span>}
          <span>📚 {lessonsCount} уроков</span>
        </div>
      </div>
    </section>
  );
}
