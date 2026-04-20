import { Trash2, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useLandingTheme, useTemplateStyle } from "./LandingThemeProvider";
import { FaqConsole } from "./variants/FaqConsole";
import { FaqPaperCards } from "./variants/FaqPaperCards";
import { FaqRegulation } from "./variants/FaqRegulation";
import { FaqAuroraGlass } from "./variants/FaqAuroraGlass";

export interface FaqItem {
  question: string;
  answer: string;
}

interface Props {
  title: string;
  items: FaqItem[];
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onItemChange?: (index: number, field: keyof FaqItem, value: string) => void;
  onAddItem?: () => void;
  onRemoveItem?: (index: number) => void;
}

/** Диспетчер FAQ — выбирает variant по `theme.faq_layout`. */
export function LandingFaqSection(props: Props) {
  const { theme } = useLandingTheme();
  switch (theme.faq_layout) {
    case "aurora-glass": return <FaqAuroraGlass {...props} />;
    case "console": return <FaqConsole {...props} />;
    case "paper-cards": return <FaqPaperCards {...props} />;
    case "regulation": return <FaqRegulation {...props} />;
    default: return <FaqDefault {...props} />;
  }
}

/** Default аккордеон (исходная реализация). */
function FaqDefault({
  title, items, isEditing, onTitleChange, onItemChange, onAddItem, onRemoveItem,
}: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const skin = useTemplateStyle();

  if (items.length === 0 && !isEditing) return null;
  const itemClass = skin.card || "rounded-xl border border-border bg-card";

  return (
    <section className={`py-16 px-6 ${skin.accentBg}`}>
      <div className="max-w-3xl mx-auto">
        {isEditing ? (
          <h2
            contentEditable suppressContentEditableWarning
            className={`text-2xl md:text-3xl font-bold mb-8 text-center outline-none border-b-2 border-dashed border-muted-foreground/20 focus:border-primary/40 ${skin.sectionTitle}`}
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}
          >{title}</h2>
        ) : (
          <h2 className={`text-2xl md:text-3xl font-bold mb-8 text-center ${skin.sectionTitle}`}>{title}</h2>
        )}

        <div className="space-y-3">
          {items.map((item, i) => {
            const isOpen = openIndex === i || isEditing;
            return (
              <div key={i} className={`relative overflow-hidden group ${itemClass}`}>
                {isEditing && (
                  <button onClick={() => onRemoveItem?.(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-destructive transition z-10">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  className="w-full flex items-center justify-between p-4 text-left font-medium"
                  onClick={() => !isEditing && setOpenIndex(isOpen ? null : i)}
                >
                  {isEditing ? (
                    <span
                      contentEditable suppressContentEditableWarning
                      className="flex-1 outline-none border-b border-dashed border-transparent focus:border-primary/40"
                      onBlur={(e) => { e.stopPropagation(); onItemChange?.(i, "question", e.currentTarget.textContent || ""); }}
                      onClick={(e) => e.stopPropagation()}
                    >{item.question}</span>
                  ) : (
                    <span>
                      {skin.cardTitlePrefix && (<span className="opacity-60 mr-1">{skin.cardTitlePrefix}</span>)}
                      {item.question}
                    </span>
                  )}
                  {!isEditing && (
                    <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  )}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4">
                    {isEditing ? (
                      <p
                        contentEditable suppressContentEditableWarning
                        className="text-sm text-muted-foreground outline-none border-b border-dashed border-transparent focus:border-primary/40 min-h-[40px]"
                        onBlur={(e) => onItemChange?.(i, "answer", e.currentTarget.textContent || "")}
                      >{item.answer}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">{item.answer}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && (
          <button onClick={onAddItem} className="mt-4 text-sm text-primary hover:underline">
            + Добавить вопрос
          </button>
        )}
      </div>
    </section>
  );
}
