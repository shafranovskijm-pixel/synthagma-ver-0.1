import { Trash2, Star } from "lucide-react";
import { useLandingTheme, useTemplateStyle } from "../LandingThemeProvider";
import { sectionSpacingClass } from "@/lib/landing-templates/themeTokens";
import type { ReviewItem } from "../LandingReviewsSection";

interface Props {
  title: string;
  reviews: ReviewItem[];
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onReviewChange?: (index: number, field: keyof ReviewItem, value: string | number) => void;
  onAddReview?: () => void;
  onRemoveReview?: (index: number) => void;
}

/**
 * Reviews «Postcards» — карточки-открытки с фоторамкой, штампом, наклоном.
 * Тёплая бьюти-эстетика. Для Beauty.
 */
export function ReviewsPostcards({
  title, reviews, isEditing, onTitleChange, onReviewChange, onAddReview, onRemoveReview,
}: Props) {
  const { theme, accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const accentColor = accent || "#e879a6";
  if (reviews.length === 0 && !isEditing) return null;
  const tilts = [-2.5, 1.5, -1, 2, -2, 1];

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} px-6`}>
      <div className="max-w-6xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className={`landing-heading text-3xl md:text-4xl font-bold mb-12 text-center outline-none ${skin.sectionTitle}`}
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-3xl md:text-4xl font-bold mb-12 text-center ${skin.sectionTitle}`}>{title}</h2>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {reviews.map((r, i) => {
            const tilt = tilts[i % tilts.length];
            const initial = (r.name || "?").trim().charAt(0).toUpperCase();
            return (
              <div
                key={i}
                className="relative group bg-white p-5 pb-7 shadow-[0_15px_40px_-15px_rgba(232,121,166,.4)] transition-transform duration-300 hover:scale-[1.02]"
                style={{
                  transform: `rotate(${tilt}deg)`,
                  border: "8px solid white",
                  outline: `1px solid ${accentColor}33`,
                }}
              >
                {/* Штамп */}
                <div className="absolute -top-3 -right-3 w-14 h-14 rounded-full border-2 border-dashed flex items-center justify-center text-[10px] font-bold uppercase tracking-wider rotate-12 bg-white"
                  style={{ borderColor: accentColor, color: accentColor }}>
                  отзыв
                </div>

                {/* Фоторамка с инициалом */}
                <div className="aspect-[4/3] mb-4 flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${accentColor}30, ${accentColor}10)` }}>
                  <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg"
                    style={{ background: accentColor }}>
                    {initial}
                  </div>
                </div>

                <div className="flex gap-0.5 mb-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s}
                      className={`w-3.5 h-3.5 ${s <= r.rating ? "fill-current" : "text-muted-foreground/30"} ${isEditing ? "cursor-pointer" : ""}`}
                      style={s <= r.rating ? { color: accentColor } : undefined}
                      onClick={() => isEditing && onReviewChange?.(i, "rating", s)} />
                  ))}
                </div>
                {isEditing ? (
                  <p contentEditable suppressContentEditableWarning
                    className="text-sm text-foreground/80 mb-3 outline-none italic min-h-[60px]"
                    onBlur={(e) => onReviewChange?.(i, "text", e.currentTarget.textContent || "")}>"{r.text}"</p>
                ) : (
                  <p className="text-sm text-foreground/80 mb-3 italic">"{r.text}"</p>
                )}
                {isEditing ? (
                  <p contentEditable suppressContentEditableWarning
                    className="font-bold text-sm outline-none"
                    style={{ color: accentColor }}
                    onBlur={(e) => onReviewChange?.(i, "name", e.currentTarget.textContent || "")}>— {r.name}</p>
                ) : (
                  <p className="font-bold text-sm" style={{ color: accentColor }}>— {r.name}</p>
                )}
                {isEditing && (
                  <button onClick={() => onRemoveReview?.(i)} className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 text-destructive transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && (
          <div className="text-center">
            <button onClick={onAddReview} className="mt-6 text-sm text-primary hover:underline">+ Добавить открытку</button>
          </div>
        )}
      </div>
    </section>
  );
}
