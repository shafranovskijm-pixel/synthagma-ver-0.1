import React, { useState } from "react";
import { Trash2, icons } from "lucide-react";
import { IconPickerDialog } from "../../IconPickerDialog";
import { useTemplateStyle } from "../../LandingThemeProvider";
import type { LearnVariantProps } from "./types";

function toIconComponentName(kebab: string): string {
  return kebab.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

/** Базовый вариант — двухколоночная сетка карточек с иконками. Используется по умолчанию. */
export function LearnIconCards({
  title, description, items, isEditing,
  onTitleChange, onDescriptionChange, onItemChange, onAddItem, onRemoveItem,
}: LearnVariantProps) {
  const skin = useTemplateStyle();
  const [iconPicker, setIconPicker] = useState<number | null>(null);
  if (items.length === 0 && !isEditing) return null;

  return (
    <section className="py-16 px-6">
      <div className="max-w-5xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className="landing-heading text-2xl md:text-3xl font-bold mb-3 outline-none border-b-2 border-dashed border-muted-foreground/20 focus:border-primary/40"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-2xl md:text-3xl font-bold mb-3 ${skin.sectionTitle}`}>{title}</h2>
        )}
        {isEditing ? (
          <p contentEditable suppressContentEditableWarning className="text-muted-foreground text-lg mb-10 max-w-2xl outline-none"
            onBlur={(e) => onDescriptionChange?.(e.currentTarget.textContent || "")}>{description}</p>
        ) : description ? (
          <p className="text-muted-foreground text-lg mb-10 max-w-2xl">{description}</p>
        ) : null}

        <div className="grid md:grid-cols-2 gap-6">
          {items.map((item, i) => {
            const compName = toIconComponentName(item.icon);
            const IconComp = (icons as any)[compName];
            return (
              <div key={i} className={`flex gap-4 p-5 rounded-2xl group relative ${skin.card || "bg-card border border-border"}`}>
                <div className={`shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center ${isEditing ? "cursor-pointer hover:bg-primary/20 transition" : ""}`}
                  onClick={() => isEditing && setIconPicker(i)}>
                  {IconComp ? React.createElement(IconComp, { className: "w-6 h-6 text-primary" }) : <span className="text-primary text-lg">•</span>}
                </div>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <h3 contentEditable suppressContentEditableWarning className="font-semibold mb-1 outline-none"
                      onBlur={(e) => onItemChange?.(i, "title", e.currentTarget.textContent || "")}>{item.title}</h3>
                  ) : (
                    <h3 className="font-semibold mb-1">{skin.cardTitlePrefix && <span className="opacity-70">{skin.cardTitlePrefix}</span>}{item.title}</h3>
                  )}
                  {isEditing ? (
                    <p contentEditable suppressContentEditableWarning className="text-sm text-muted-foreground outline-none"
                      onBlur={(e) => onItemChange?.(i, "description", e.currentTarget.textContent || "")}>{item.description}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  )}
                </div>
                {isEditing && (
                  <button onClick={() => onRemoveItem?.(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && <button onClick={onAddItem} className="mt-4 text-sm text-primary hover:underline">+ Добавить пункт</button>}
        {iconPicker !== null && (
          <IconPickerDialog open onClose={() => setIconPicker(null)}
            onSelect={(name) => { onItemChange?.(iconPicker, "icon", name); setIconPicker(null); }} />
        )}
      </div>
    </section>
  );
}
