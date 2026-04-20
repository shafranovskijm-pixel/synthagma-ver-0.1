import { Trash2, Star } from "lucide-react";
import { useLandingTheme, useTemplateStyle } from "../LandingThemeProvider";
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
 * Reviews «Carousel Mini» — горизонтальная полоса. Этап 6: skin.card.
 */
export function ReviewsCarouselMini({
  title, reviews, isEditing, onTitleChange, onReviewChange, onAddReview, onRemoveReview,
}: Props) {
  const { theme, accent } = useLandingTheme();
  const skin = useTemplateStyle();
  if (reviews.length === 0 && !isEditing) return null;
  const accentColor = accent || "hsl(var(--primary))";
  const cardClasses = skin.card || cardStyleClass[theme.card_style];

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} ${skin.accentBg}`}>
      <div className="max-w-6xl mx-auto px-6 mb-8">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className={`landing-heading text-2xl md:text-3xl font-bold outline-none ${skin.sectionTitle}`}
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-2xl md:text-3xl font-bold ${skin.sectionTitle}`}>{title}</h2>
        )}
      </div>

      <div className="overflow-x-auto pb-4 px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-5 max-w-6xl mx-auto" style={{ minWidth: "fit-content" }}>
          {reviews.map((r, i) => (
            <div
              key={i}
              className={`relative shrink-0 w-[320px] md:w-[380px] p-6 group ${radiusCardClass[theme.radius]} ${cardClasses}`}
              style={skin.card ? undefined : { borderTop: `3px solid ${accentColor}` }}
            >
              {isEditing && (
                <button onClick={() => onRemoveReview?.(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-destructive transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <div className="flex gap-0.5 mb-3">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s}
                    className={`w-4 h-4 ${s <= r.rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"} ${isEditing ? "cursor-pointer" : ""}`}
                    onClick={() => isEditing && onReviewChange?.(i, "rating", s)} />
                ))}
              </div>
              {isEditing ? (
                <p contentEditable suppressContentEditableWarning
                  className="text-sm text-muted-foreground mb-4 outline-none min-h-[80px]"
                  onBlur={(e) => onReviewChange?.(i, "text", e.currentTarget.textContent || "")}>{r.text}</p>
              ) : (
                <p className="text-sm text-muted-foreground mb-4 line-clamp-5">{r.text}</p>
              )}
              {isEditing ? (
                <p contentEditable suppressContentEditableWarning
                  className="font-semibold text-sm outline-none"
                  onBlur={(e) => onReviewChange?.(i, "name", e.currentTarget.textContent || "")}>{r.name}</p>
              ) : (
                <p className="font-semibold text-sm">{r.name}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {isEditing && (
        <div className="max-w-6xl mx-auto px-6 mt-2">
          <button onClick={onAddReview} className="text-sm text-primary hover:underline">+ Добавить отзыв</button>
        </div>
      )}
    </section>
  );
}
