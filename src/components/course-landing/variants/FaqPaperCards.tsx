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
 * FAQ «Paper Cards» — карточки в виде сложенных бумажных листков с уголком,
 * серифным шрифтом и тёплой бежевой палитрой. Для Language.
 */
export function FaqPaperCards({ title, items, isEditing, onTitleChange, onItemChange, onAddItem, onRemoveItem }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const { accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const accentColor = accent || "#b45309";
  if (items.length === 0 && !isEditing) return null;

  return (
    <section className="py-16 px-6">
      <div className="max-w-3xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className={`landing-heading text-2xl md:text-3xl font-bold mb-3 text-center outline-none ${skin.sectionTitle}`}
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-2xl md:text-3xl font-bold mb-3 text-center ${skin.sectionTitle}`}>{title}</h2>
        )}
        <p className="text-center italic text-muted-foreground mb-10">— часто задаваемые вопросы —</p>

        <div className="space-y-4">
          {items.map((item, i) => {
            const isOpen = openIndex === i || isEditing;
            const tilt = i % 2 === 0 ? -0.4 : 0.4;
            return (
              <div key={i}
                className="relative group bg-[#fffdf7] border border-[#d4a57455] p-5 shadow-[0_8px_18px_-10px_rgba(120,80,40,.3)] transition-transform"
                style={{
                  transform: `rotate(${tilt}deg)`,
                  backgroundImage: "repeating-linear-gradient(0deg, transparent 0 30px, rgba(180,120,80,.07) 30px 31px)",
                }}>
                {/* Уголок */}
                <div className="absolute top-0 right-0 w-7 h-7" style={{ background: `linear-gradient(225deg, ${accentColor}55 0 50%, transparent 50%)` }} />
                {isEditing && (
                  <button onClick={() => onRemoveItem?.(i)} className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 text-destructive transition z-10">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button className="w-full flex items-center gap-3 text-left" onClick={() => !isEditing && setOpenIndex(isOpen ? null : i)}>
                  <span className="w-8 h-8 rounded-full border-2 border-dashed flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ borderColor: accentColor, color: accentColor }}>{i + 1}</span>
                  {isEditing ? (
                    <span contentEditable suppressContentEditableWarning
                      className="flex-1 outline-none font-semibold"
                      style={{ color: "#3a2614" }}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => { e.stopPropagation(); onItemChange?.(i, "question", e.currentTarget.textContent || ""); }}>{item.question}</span>
                  ) : (
                    <span className="flex-1 font-semibold" style={{ color: "#3a2614" }}>{item.question}</span>
                  )}
                  {!isEditing && (
                    <ChevronDown className={`w-5 h-5 transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: accentColor }} />
                  )}
                </button>

                {isOpen && (
                  <div className="mt-3 pl-11 pr-2">
                    {isEditing ? (
                      <p contentEditable suppressContentEditableWarning className="text-sm italic outline-none leading-relaxed"
                        style={{ color: "#5a3a20" }}
                        onBlur={(e) => onItemChange?.(i, "answer", e.currentTarget.textContent || "")}>{item.answer}</p>
                    ) : (
                      <p className="text-sm italic leading-relaxed" style={{ color: "#5a3a20" }}>{item.answer}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && (
          <div className="text-center">
            <button onClick={onAddItem} className="mt-4 text-sm text-primary hover:underline">+ Добавить вопрос</button>
          </div>
        )}
      </div>
    </section>
  );
}
