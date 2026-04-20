import { Sparkles, Heart, Star, Flower2, Gem, Crown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { parseProcessLines, type ProcessVariantProps } from "./types";

const ICONS = [Sparkles, Heart, Star, Flower2, Gem, Crown];

/**
 * BEAUTY — шаги в виде ленты пастельных «капсул-следов» (zigzag по экрану).
 * Каждый шаг — мягкая карточка с иконкой и розовой подложкой.
 */
export function ProcessBeautySteps({ title, content, isEditing, onTitleChange, onContentChange }: ProcessVariantProps) {
  if (!content && !isEditing) return null;
  const lines = parseProcessLines(content);

  return (
    <section className="py-16 px-6">
      <div className="max-w-5xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className="landing-heading text-3xl md:text-4xl font-bold mb-10 text-center outline-none"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className="landing-heading text-3xl md:text-4xl font-bold mb-10 text-center tpl-beauty-section-title inline-block">
            {title}
          </h2>
        )}

        {isEditing ? (
          <Textarea value={content} onChange={(e) => onContentChange?.(e.target.value)} className="min-h-[180px]" />
        ) : (
          <div className="space-y-6">
            {lines.map((line, i) => {
              const Icon = ICONS[i % ICONS.length];
              const isEven = i % 2 === 0;
              return (
                <div key={i} className={`flex items-center gap-4 ${isEven ? "" : "flex-row-reverse text-right"}`}>
                  <div
                    className="shrink-0 w-16 h-16 rounded-full flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)",
                      boxShadow: "0 8px 24px -8px rgba(232,158,178,.5)",
                    }}
                  >
                    <Icon className="w-7 h-7" style={{ color: "#d97a98" }} />
                  </div>
                  <div
                    className={`flex-1 p-5 rounded-3xl bg-white border border-pink-100 shadow-[0_10px_30px_-12px_rgba(232,158,178,.4)] ${isEven ? "" : "text-right"}`}
                  >
                    <div className="flex items-baseline gap-2 mb-1" style={{ flexDirection: isEven ? "row" : "row-reverse" }}>
                      <span className="text-xs uppercase tracking-widest" style={{ color: "#d97a98", fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
                        Шаг {i + 1}
                      </span>
                    </div>
                    <p className="text-foreground" style={{ fontFamily: "'PT Serif', Georgia, serif" }}>{line}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
