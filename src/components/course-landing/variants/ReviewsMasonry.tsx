import { Trash2, Star, Quote } from "lucide-react";
import { useLandingTheme } from "../LandingThemeProvider";
import { cardStyleClass, radiusCardClass, sectionSpacingClass } from "@/lib/landing-templates/themeTokens";
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
 * Reviews «Masonry» — кладка с разной высотой карточек,
 * крупная цитата у первой. Подходит для бьюти/языков/IT.
 */
export function ReviewsMasonry({
  title, reviews, isEditing, onTitleChange, onReviewChange, onAddReview, onRemoveReview,
}: Props) {
  const { theme, accent } = useLandingTheme();
  if (reviews.length === 0 && !isEditing) return null;
  const accentColor = accent || "hsl(var(--primary))";

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} px-6`}>
      <div className="max-w-6xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className="landing-heading text-3xl md:text-4xl font-bold mb-12 text-center outline-none"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className="landing-heading text-3xl md:text-4xl font-bold mb-12 text-center">{title}</h2>
        )}

        <div className="columns-1 md:columns-2 lg:columns-3 gap-6 [&>*]:mb-6 [&>*]:break-inside-avoid">
          {reviews.map((r, i) => {
            const isFeatured = i === 0;
            return (
              <div
                key={i}
                className={`relative p-6 group ${radiusCardClass[theme.radius]} ${cardStyleClass[theme.card_style]}`}
                style={isFeatured ? { borderLeft: `4px solid ${accentColor}`, paddingLeft: "1.75rem" } : undefined}
              >
                {isEditing && (
                  <button onClick={() => onRemoveReview?.(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-destructive transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                {isFeatured && <Quote className="w-8 h-8 mb-3 opacity-30" style={{ color: accentColor }} />}
                <div className="flex gap-0.5 mb-3">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s}
                      className={`w-4 h-4 ${s <= r.rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"} ${isEditing ? "cursor-pointer" : ""}`}
                      onClick={() => isEditing && onReviewChange?.(i, "rating", s)} />
                  ))}
                </div>
                {isEditing ? (
                  <p contentEditable suppressContentEditableWarning
                    className={`${isFeatured ? "text-base leading-relaxed" : "text-sm"} text-foreground/80 mb-4 outline-none min-h-[60px]`}
                    onBlur={(e) => onReviewChange?.(i, "text", e.currentTarget.textContent || "")}>{r.text}</p>
                ) : (
                  <p className={`${isFeatured ? "text-base leading-relaxed" : "text-sm"} text-foreground/80 mb-4`}>{r.text}</p>
                )}
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}aa)` }}
                  >
                    {r.name.split(" ").slice(0, 2).map((s) => s[0]).join("").toUpperCase() || "?"}
                  </div>
                  {isEditing ? (
                    <p contentEditable suppressContentEditableWarning
                      className="font-semibold text-sm outline-none"
                      onBlur={(e) => onReviewChange?.(i, "name", e.currentTarget.textContent || "")}>{r.name}</p>
                  ) : (
                    <p className="font-semibold text-sm">{r.name}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {isEditing && (
          <button onClick={onAddReview} className="mt-4 text-sm text-primary hover:underline">+ Добавить отзыв</button>
        )}
      </div>
    </section>
  );
}
