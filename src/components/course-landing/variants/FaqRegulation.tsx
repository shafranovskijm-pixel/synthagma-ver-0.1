import { Trash2, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useLandingTheme, useTemplateStyle } from "../LandingThemeProvider";
import type { FaqItem } from "../LandingFaqSection";

interface Props {
  title: string;
  items: FaqItem[];
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onItemChange?: (index: number, field: keyof FaqItem, value: string) => void;
  onAddItem?: () => void;
  onRemoveItem?: (index: number) => void;
}

/**
 * FAQ «Regulation» — пункты как нормативно-правовые статьи (Ст. X.Y).
 * Жёсткие границы, моноширинный код пункта, синяя стилистика. Для Safety.
 */
export function FaqRegulation({ title, items, isEditing, onTitleChange, onItemChange, onAddItem, onRemoveItem }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const { accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const accentColor = accent || "#1e3a8a";
  if (items.length === 0 && !isEditing) return null;

  return (
    <section className="py-16 px-6">
      <div className="max-w-3xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className={`landing-heading text-2xl md:text-3xl font-bold mb-2 outline-none uppercase tracking-wide ${skin.sectionTitle}`}
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-2xl md:text-3xl font-bold mb-2 uppercase tracking-wide ${skin.sectionTitle}`}>{title}</h2>
        )}
        <p className="text-xs font-mono uppercase tracking-widest mb-8" style={{ color: accentColor }}>Глава 4 · Ответы на типовые запросы</p>

        <div className="border-2" style={{ borderColor: accentColor }}>
          {items.map((item, i) => {
            const isOpen = openIndex === i || isEditing;
            return (
              <div key={i} className="relative group border-b-2 last:border-b-0" style={{ borderColor: accentColor }}>
                {isEditing && (
                  <button onClick={() => onRemoveItem?.(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-destructive transition z-10">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button className="w-full flex items-stretch text-left" onClick={() => !isEditing && setOpenIndex(isOpen ? null : i)}>
                  <div className="px-4 py-4 font-mono text-xs font-bold flex items-center justify-center min-w-[80px] border-r-2" style={{ background: accentColor, color: "white", borderColor: accentColor }}>
                    Ст.4.{i + 1}
                  </div>
                  <div className="flex-1 px-5 py-4 flex items-center justify-between gap-3 bg-white">
                    {isEditing ? (
                      <span contentEditable suppressContentEditableWarning
                        className="flex-1 outline-none font-semibold uppercase text-sm tracking-wide"
                        style={{ color: accentColor }}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => { e.stopPropagation(); onItemChange?.(i, "question", e.currentTarget.textContent || ""); }}>{item.question}</span>
                    ) : (
                      <span className="flex-1 font-semibold uppercase text-sm tracking-wide" style={{ color: accentColor }}>{item.question}</span>
                    )}
                    {!isEditing && (
                      <ChevronDown className={`w-5 h-5 transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: accentColor }} />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 py-4 text-sm bg-blue-50/30 border-t" style={{ borderColor: `${accentColor}33` }}>
                    <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: accentColor }}>Положение:</div>
                    {isEditing ? (
                      <p contentEditable suppressContentEditableWarning className="text-foreground/85 outline-none leading-relaxed"
                        onBlur={(e) => onItemChange?.(i, "answer", e.currentTarget.textContent || "")}>{item.answer}</p>
                    ) : (
                      <p className="text-foreground/85 leading-relaxed">{item.answer}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && (
          <button onClick={onAddItem} className="mt-4 text-sm text-primary hover:underline">+ Добавить статью</button>
        )}
      </div>
    </section>
  );
}
