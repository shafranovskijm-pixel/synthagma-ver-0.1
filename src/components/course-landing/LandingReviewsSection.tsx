import { Trash2, Star } from "lucide-react";

export interface ReviewItem {
  name: string;
  text: string;
  rating: number;
}

interface Props {
  title: string;
  reviews: ReviewItem[];
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onReviewChange?: (index: number, field: keyof ReviewItem, value: string | number) => void;
  onAddReview?: () => void;
  onRemoveReview?: (index: number) => void;
}

export function LandingReviewsSection({
  title, reviews, isEditing, onTitleChange, onReviewChange, onAddReview, onRemoveReview,
}: Props) {
  if (reviews.length === 0 && !isEditing) return null;

  return (
    <section className="py-16 px-6 bg-muted/30">
      <div className="max-w-5xl mx-auto">
        {isEditing ? (
          <h2
            contentEditable suppressContentEditableWarning
            className="text-2xl md:text-3xl font-bold mb-8 outline-none border-b-2 border-dashed border-muted-foreground/20 focus:border-primary/40"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}
          >{title}</h2>
        ) : (
          <h2 className="text-2xl md:text-3xl font-bold mb-8">{title}</h2>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.map((r, i) => (
            <div key={i} className="relative p-6 rounded-2xl bg-card border border-border group">
              {isEditing && (
                <button onClick={() => onRemoveReview?.(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-destructive transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              {/* Stars */}
              <div className="flex gap-0.5 mb-3">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`w-4 h-4 ${s <= r.rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"} ${isEditing ? "cursor-pointer" : ""}`}
                    onClick={() => isEditing && onReviewChange?.(i, "rating", s)}
                  />
                ))}
              </div>

              {/* Text */}
              {isEditing ? (
                <p
                  contentEditable suppressContentEditableWarning
                  className="text-sm text-muted-foreground mb-4 outline-none border-b border-dashed border-transparent focus:border-primary/40 min-h-[60px]"
                  onBlur={(e) => onReviewChange?.(i, "text", e.currentTarget.textContent || "")}
                >{r.text}</p>
              ) : (
                <p className="text-sm text-muted-foreground mb-4">{r.text}</p>
              )}

              {/* Name */}
              {isEditing ? (
                <p
                  contentEditable suppressContentEditableWarning
                  className="font-semibold text-sm outline-none border-b border-dashed border-transparent focus:border-primary/40"
                  onBlur={(e) => onReviewChange?.(i, "name", e.currentTarget.textContent || "")}
                >{r.name}</p>
              ) : (
                <p className="font-semibold text-sm">{r.name}</p>
              )}
            </div>
          ))}
        </div>

        {isEditing && (
          <button onClick={onAddReview} className="mt-4 text-sm text-primary hover:underline">
            + Добавить отзыв
          </button>
        )}
      </div>
    </section>
  );
}
