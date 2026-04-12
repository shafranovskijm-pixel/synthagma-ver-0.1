import { Trash2, ChevronDown } from "lucide-react";
import { useState } from "react";

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

export function LandingFaqSection({
  title, items, isEditing, onTitleChange, onItemChange, onAddItem, onRemoveItem,
}: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (items.length === 0 && !isEditing) return null;

  return (
    <section className="py-16 px-6">
      <div className="max-w-3xl mx-auto">
        {isEditing ? (
          <h2
            contentEditable suppressContentEditableWarning
            className="text-2xl md:text-3xl font-bold mb-8 text-center outline-none border-b-2 border-dashed border-muted-foreground/20 focus:border-primary/40"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}
          >{title}</h2>
        ) : (
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center">{title}</h2>
        )}

        <div className="space-y-3">
          {items.map((item, i) => {
            const isOpen = openIndex === i || isEditing;
            return (
              <div key={i} className="relative rounded-xl border border-border bg-card overflow-hidden group">
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
                    <span>{item.question}</span>
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
