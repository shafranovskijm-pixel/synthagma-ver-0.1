import { Trash2, Star, Stamp } from "lucide-react";
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
 * Reviews «Protocols» — отзывы как корпоративные протоколы / акты с реквизитами,
 * номером, печатью «ОДОБРЕНО». Строгая синяя стилистика. Для Safety.
 */
export function ReviewsProtocols({
  title, reviews, isEditing, onTitleChange, onReviewChange, onAddReview, onRemoveReview,
}: Props) {
  const { theme, accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const accentColor = accent || "#1e3a8a";
  if (reviews.length === 0 && !isEditing) return null;

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} px-6`}>
      <div className="max-w-5xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className={`landing-heading text-2xl md:text-3xl font-bold mb-8 outline-none ${skin.sectionTitle}`}
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-2xl md:text-3xl font-bold mb-8 ${skin.sectionTitle}`}>{title}</h2>
        )}

        <div className="space-y-5">
          {reviews.map((r, i) => (
            <div key={i} className="relative group bg-white border-2 p-6 grid md:grid-cols-[180px_1fr_120px] gap-6"
              style={{ borderColor: accentColor }}>
              {/* Левая колонка — реквизиты */}
              <div className="text-xs font-mono uppercase tracking-wider space-y-1.5 pr-4 border-r border-dashed" style={{ borderColor: `${accentColor}55`, color: accentColor }}>
                <div><span className="text-zinc-500">№</span> {String(i + 1).padStart(4, "0")}/2025</div>
                <div><span className="text-zinc-500">Дата:</span> 2025-{String(11 - i).padStart(2, "0")}-{String(10 + i).padStart(2, "0")}</div>
                <div><span className="text-zinc-500">Курс:</span> ОТ-А.Б.В</div>
                <div><span className="text-zinc-500">Оценка:</span> {r.rating}/5</div>
              </div>

              {/* Центр — содержание */}
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: accentColor }}>
                  ПРОТОКОЛ ОБРАТНОЙ СВЯЗИ
                </div>
                {isEditing ? (
                  <p contentEditable suppressContentEditableWarning
                    className="text-sm text-foreground/85 mb-3 outline-none leading-relaxed"
                    onBlur={(e) => onReviewChange?.(i, "text", e.currentTarget.textContent || "")}>{r.text}</p>
                ) : (
                  <p className="text-sm text-foreground/85 mb-3 leading-relaxed">{r.text}</p>
                )}
                <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: `${accentColor}33` }}>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={`w-3 h-3 ${s <= r.rating ? "fill-current" : "text-muted-foreground/30"} ${isEditing ? "cursor-pointer" : ""}`}
                        style={s <= r.rating ? { color: accentColor } : undefined}
                        onClick={() => isEditing && onReviewChange?.(i, "rating", s)} />
                    ))}
                  </div>
                  {isEditing ? (
                    <p contentEditable suppressContentEditableWarning className="font-semibold text-sm outline-none"
                      onBlur={(e) => onReviewChange?.(i, "name", e.currentTarget.textContent || "")}>{r.name}</p>
                  ) : (
                    <p className="font-semibold text-sm">{r.name}</p>
                  )}
                </div>
              </div>

              {/* Правая колонка — печать */}
              <div className="flex items-center justify-center">
                <div className="w-24 h-24 rounded-full border-[3px] border-dashed flex flex-col items-center justify-center text-center rotate-[-8deg] opacity-80"
                  style={{ borderColor: accentColor, color: accentColor }}>
                  <Stamp className="w-5 h-5 mb-0.5" />
                  <div className="text-[9px] font-bold leading-tight">ОДОБРЕНО<br/>{2025}</div>
                </div>
              </div>

              {isEditing && (
                <button onClick={() => onRemoveReview?.(i)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-destructive transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {isEditing && (
          <button onClick={onAddReview} className="mt-4 text-sm text-primary hover:underline">+ Добавить протокол</button>
        )}
      </div>
    </section>
  );
}
