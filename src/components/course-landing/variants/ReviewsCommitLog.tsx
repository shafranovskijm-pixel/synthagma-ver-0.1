import { Trash2 } from "lucide-react";
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
 * Reviews «Commit Log» — отзывы как git commit история. Моноширинный шрифт,
 * sha-хеш, временные метки, `feat: ...`. Для Lab.
 */
export function ReviewsCommitLog({
  title, reviews, isEditing, onTitleChange, onReviewChange, onAddReview, onRemoveReview,
}: Props) {
  const { theme, accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const accentColor = accent || "#22d3ee";
  if (reviews.length === 0 && !isEditing) return null;

  // псевдо-sha от индекса
  const sha = (i: number) => Math.abs(((i + 7) * 9301 + 49297) % 233280).toString(16).padStart(7, "0");

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} px-6`}>
      <div className="max-w-4xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className={`landing-heading text-2xl md:text-3xl font-bold mb-3 outline-none ${skin.sectionTitle}`}
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-2xl md:text-3xl font-bold mb-3 ${skin.sectionTitle}`}>
            <span className="text-cyan-400 font-mono">$</span> git log --reviews
          </h2>
        )}
        <p className="font-mono text-xs text-zinc-500 mb-8">{reviews.length} commits · branch: <span style={{ color: accentColor }}>main</span></p>

        <div className="bg-zinc-900/80 border border-cyan-500/20 p-6 font-mono text-sm">
          {reviews.map((r, i) => (
            <div key={i} className="relative group pb-5 mb-5 last:mb-0 last:pb-0 border-b border-cyan-500/10 last:border-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                <span style={{ color: accentColor }} className="font-bold">commit</span>
                <span className="text-zinc-500">{sha(i)}</span>
                <span className="text-zinc-600 text-xs">({i === 0 ? "HEAD -> main" : `tag: v1.${reviews.length - i}.0`})</span>
              </div>
              <div className="text-xs text-zinc-500 mb-1">
                Author:{" "}
                {isEditing ? (
                  <span contentEditable suppressContentEditableWarning className="outline-none text-zinc-300"
                    onBlur={(e) => onReviewChange?.(i, "name", e.currentTarget.textContent || "")}>{r.name}</span>
                ) : (
                  <span className="text-zinc-300">{r.name}</span>
                )} <span className="text-zinc-600">&lt;student@lab.dev&gt;</span>
              </div>
              {(() => {
                // Циклически распределяем месяцы (1..12) и дни (1..28) — корректно при любом количестве отзывов.
                const month = ((i % 12) + 1).toString().padStart(2, "0");
                const day = ((i * 3) % 28 + 1).toString().padStart(2, "0");
                const initials = (r.name || "??")
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((s) => s[0]?.toUpperCase() ?? "")
                  .join("") || "??";
                return (
                  <>
                    <div className="text-xs text-zinc-500 mb-3 flex items-center gap-2">
                      <span
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-zinc-900"
                        style={{ background: accentColor }}
                        aria-hidden
                      >
                        {initials}
                      </span>
                      <span>Date: 2025-{month}-{day} · ⭐ {r.rating}/5</span>
                    </div>
                  </>
                );
              })()}
              <div className="pl-4 border-l-2" style={{ borderColor: `${accentColor}55` }}>
                <div className="text-zinc-300 leading-relaxed">
                  <span style={{ color: accentColor }}>feat:</span>{" "}
                  {isEditing ? (
                    <span contentEditable suppressContentEditableWarning className="outline-none"
                      onBlur={(e) => onReviewChange?.(i, "text", e.currentTarget.textContent || "")}>{r.text}</span>
                  ) : r.text}
                </div>
              </div>
              {isEditing && (
                <button onClick={() => onRemoveReview?.(i)} className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 text-destructive transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {isEditing && (
          <button onClick={onAddReview} className="mt-4 text-sm text-cyan-400 hover:underline font-mono">+ git commit -m "..."</button>
        )}
      </div>
    </section>
  );
}
