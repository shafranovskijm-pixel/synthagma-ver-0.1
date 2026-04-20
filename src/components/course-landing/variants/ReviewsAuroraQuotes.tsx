import { Trash2, Star, Quote } from "lucide-react";
import { useLandingTheme } from "../LandingThemeProvider";
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
 * Reviews «Aurora Quotes» — один акцентный hero-отзыв с крупной типографикой
 * и glow-подложкой, остальные — компактные glass-карточки в строку.
 * Только для шаблона Aurora.
 */
export function ReviewsAuroraQuotes({
  title, reviews, isEditing, onTitleChange, onReviewChange, onAddReview, onRemoveReview,
}: Props) {
  const { accent } = useLandingTheme();
  const accentColor = accent || "#22b8a6";

  if (reviews.length === 0 && !isEditing) return null;

  const heroReview = reviews[0];
  const restReviews = reviews.slice(1);

  return (
    <section className="relative py-24 px-6 overflow-hidden bg-gradient-to-b from-[#0a1820] via-[#0d2030] to-[#0a1820] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] rounded-full blur-3xl opacity-25"
        style={{ background: `radial-gradient(ellipse, ${accentColor}, transparent 70%)` }}
      />

      <div className="max-w-6xl mx-auto relative">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.2em] mb-4"
            style={{ background: `${accentColor}22`, color: accentColor, border: `1px solid ${accentColor}55` }}>
            ★ Отзывы выпускников
          </div>
          {isEditing ? (
            <h2 contentEditable suppressContentEditableWarning
              className="landing-heading text-4xl md:text-5xl font-bold outline-none tpl-aurora-section-title"
              onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
          ) : (
            <h2 className="landing-heading text-4xl md:text-5xl font-bold tpl-aurora-section-title">{title}</h2>
          )}
        </div>

        {/* HERO REVIEW */}
        <div
          className="relative group p-10 lg:p-14 rounded-3xl overflow-hidden mb-6 aurora-pulse-soft"
          style={{
            background: `linear-gradient(135deg, ${accentColor}1a, rgba(14,165,233,0.08))`,
            border: `1px solid ${accentColor}66`,
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            boxShadow: `0 30px 80px -20px ${accentColor}77, inset 0 1px 0 rgba(255,255,255,0.1)`,
          }}
        >
          <Quote
            aria-hidden
            className="absolute top-6 left-6 w-20 h-20 opacity-15"
            style={{ color: accentColor }}
          />

          {isEditing && (
            <button onClick={() => onRemoveReview?.(0)} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-red-400 z-10">
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <div className="relative">
            <div className="flex gap-1 mb-6 justify-center">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s}
                  className={`w-5 h-5 ${s <= heroReview.rating ? "fill-yellow-400 text-yellow-400" : "text-white/20"} ${isEditing ? "cursor-pointer" : ""}`}
                  onClick={() => isEditing && onReviewChange?.(0, "rating", s)}
                />
              ))}
            </div>

            {isEditing ? (
              <p
                contentEditable suppressContentEditableWarning
                className="text-2xl md:text-3xl leading-snug font-light text-white text-center outline-none mb-8 landing-heading"
                onBlur={(e) => onReviewChange?.(0, "text", e.currentTarget.textContent || "")}
              >«{heroReview.text}»</p>
            ) : (
              <p className="text-2xl md:text-3xl leading-snug font-light text-white text-center mb-8 landing-heading">
                «{heroReview.text}»
              </p>
            )}

            <div className="flex items-center justify-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${accentColor}, #0ea5e9)`,
                  boxShadow: `0 8px 24px ${accentColor}aa`,
                }}
              >
                {heroReview.name.split(" ").slice(0, 2).map((s) => s[0]).join("").toUpperCase() || "?"}
              </div>
              {isEditing ? (
                <p contentEditable suppressContentEditableWarning
                  className="font-semibold text-white outline-none"
                  onBlur={(e) => onReviewChange?.(0, "name", e.currentTarget.textContent || "")}>{heroReview.name}</p>
              ) : (
                <p className="font-semibold text-white">{heroReview.name}</p>
              )}
            </div>
          </div>
        </div>

        {/* COMPACT REST */}
        {restReviews.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {restReviews.map((r, idx) => {
              const i = idx + 1;
              return (
                <div
                  key={i}
                  className="relative group p-6 rounded-2xl transition-all hover:-translate-y-1"
                  style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))",
                    border: `1px solid ${accentColor}22`,
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                  }}
                >
                  {isEditing && (
                    <button onClick={() => onRemoveReview?.(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <div className="flex gap-0.5 mb-3">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s}
                        className={`w-3.5 h-3.5 ${s <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-white/20"} ${isEditing ? "cursor-pointer" : ""}`}
                        onClick={() => isEditing && onReviewChange?.(i, "rating", s)}
                      />
                    ))}
                  </div>
                  {isEditing ? (
                    <p contentEditable suppressContentEditableWarning
                      className="text-sm text-white/70 mb-4 outline-none min-h-[60px]"
                      onBlur={(e) => onReviewChange?.(i, "text", e.currentTarget.textContent || "")}>{r.text}</p>
                  ) : (
                    <p className="text-sm text-white/70 mb-4 leading-relaxed">{r.text}</p>
                  )}
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}99)` }}
                    >
                      {r.name.split(" ").slice(0, 2).map((s) => s[0]).join("").toUpperCase() || "?"}
                    </div>
                    {isEditing ? (
                      <p contentEditable suppressContentEditableWarning
                        className="font-semibold text-sm text-white outline-none"
                        onBlur={(e) => onReviewChange?.(i, "name", e.currentTarget.textContent || "")}>{r.name}</p>
                    ) : (
                      <p className="font-semibold text-sm text-white">{r.name}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isEditing && (
          <button onClick={onAddReview} className="mt-6 text-sm" style={{ color: accentColor }}>
            + Добавить отзыв
          </button>
        )}
      </div>
    </section>
  );
}
