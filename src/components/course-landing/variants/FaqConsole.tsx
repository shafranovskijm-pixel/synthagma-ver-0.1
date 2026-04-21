import { Trash2, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useLandingTheme, useTemplateStyle } from "../LandingThemeProvider";
import labInline from "@/assets/landing-templates/decor/lab-inline.webp";
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
 * FAQ «Console» — вопросы как `?> man query_NN`, ответы — вывод man-страницы.
 * Тёмные карточки, моноширинный шрифт, неоновый акцент. Для Lab.
 */
export function FaqConsole({ title, items, isEditing, onTitleChange, onItemChange, onAddItem, onRemoveItem }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const { accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const accentColor = accent || "#22d3ee";
  if (items.length === 0 && !isEditing) return null;

  return (
    <section className="py-16 px-6 relative overflow-hidden" style={{ minHeight: "320px" }}>
      {/* Тонкий backdrop из lab-inline для единства серии */}
      <img
        src={labInline}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-[0.06]"
        style={{ mixBlendMode: "screen" }}
      />
      <div className="max-w-3xl mx-auto relative z-10">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className={`landing-heading text-2xl md:text-3xl font-bold mb-8 outline-none ${skin.sectionTitle}`}
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-2xl md:text-3xl font-bold mb-8 ${skin.sectionTitle}`}>
            <span className="text-cyan-400 font-mono">$ man</span> faq
          </h2>
        )}

        <div className="bg-zinc-900/80 border border-cyan-500/20 p-5 font-mono text-sm space-y-2">
          {items.map((item, i) => {
            const isOpen = openIndex === i || isEditing;
            const lineNo = String(i + 1).padStart(2, "0");
            return (
              <div
                key={i}
                className="relative group border-b border-cyan-500/10 last:border-0 pb-2 last:pb-0 transition-colors"
                style={isOpen && !isEditing ? { background: `${accentColor}0a` } : undefined}
              >
                {isEditing && (
                  <button onClick={() => onRemoveItem?.(i)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-destructive transition z-10">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  className="w-full flex items-start gap-2 text-left py-2"
                  onClick={() => !isEditing && setOpenIndex(isOpen ? null : i)}
                >
                  {/* Номер строки как в IDE */}
                  <span className="text-zinc-600 select-none w-6 shrink-0 text-right tabular-nums">{lineNo}</span>
                  <span style={{ color: accentColor }} className="font-bold shrink-0">?&gt;</span>
                  {isEditing ? (
                    <span contentEditable suppressContentEditableWarning
                      className="flex-1 outline-none text-cyan-100"
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => { e.stopPropagation(); onItemChange?.(i, "question", e.currentTarget.textContent || ""); }}>{item.question}</span>
                  ) : (
                    <span
                      className="flex-1 text-cyan-100"
                      style={isOpen ? { color: accentColor } : undefined}
                    >
                      {item.question}
                    </span>
                  )}
                  {!isEditing && (
                    <ChevronDown className={`w-4 h-4 text-cyan-400/70 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  )}
                </button>

                {isOpen && (
                  <div className="pl-12 pr-2 pb-2 text-zinc-400 text-xs leading-relaxed">
                    <span className="text-zinc-600"># </span>
                    {isEditing ? (
                      <span contentEditable suppressContentEditableWarning className="outline-none"
                        onBlur={(e) => onItemChange?.(i, "answer", e.currentTarget.textContent || "")}>{item.answer}</span>
                    ) : item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && (
          <button onClick={onAddItem} className="mt-4 text-sm text-cyan-400 hover:underline font-mono">+ man add_question</button>
        )}
      </div>
    </section>
  );
}
