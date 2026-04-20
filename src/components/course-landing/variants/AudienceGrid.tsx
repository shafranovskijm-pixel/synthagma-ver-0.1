import { Trash2 } from "lucide-react";
import { icons } from "lucide-react";
import React, { useState } from "react";
import { IconPickerDialog } from "../IconPickerDialog";
import { useLandingTheme } from "../LandingThemeProvider";
import { cardStyleClass, radiusCardClass, sectionSpacingClass } from "@/lib/landing-templates/themeTokens";
import type { AudienceItem } from "../LandingAudienceSection";

function toIconComponentName(kebab: string): string {
  return kebab.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

interface Props {
  title: string;
  description: string;
  items: AudienceItem[];
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onDescriptionChange?: (v: string) => void;
  onItemChange?: (index: number, field: keyof AudienceItem, value: string) => void;
  onAddItem?: () => void;
  onRemoveItem?: (index: number) => void;
}

/** Audience «Grid» — сетка 2/3 колонок с большими карточками. Базовый вариант. */
export function AudienceGrid({
  title, description, items, isEditing,
  onTitleChange, onDescriptionChange, onItemChange, onAddItem, onRemoveItem,
}: Props) {
  const { theme, accent } = useLandingTheme();
  const [iconPicker, setIconPicker] = useState<number | null>(null);
  const accentColor = accent || "hsl(var(--primary))";

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} px-6`}>
      <div className="max-w-5xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className="landing-heading text-2xl md:text-3xl font-bold mb-4 outline-none"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className="landing-heading text-2xl md:text-3xl font-bold mb-4">{title}</h2>
        )}
        {isEditing ? (
          <p contentEditable suppressContentEditableWarning
            className="text-muted-foreground text-lg mb-8 max-w-2xl outline-none"
            onBlur={(e) => onDescriptionChange?.(e.currentTarget.textContent || "")}>{description}</p>
        ) : (
          description && <p className="text-muted-foreground text-lg mb-8 max-w-2xl">{description}</p>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item, i) => {
            const compName = toIconComponentName(item.icon || "user");
            const IconComp = (icons as any)[compName];
            return (
              <div key={i} className={`relative p-5 group ${radiusCardClass[theme.radius]} ${cardStyleClass[theme.card_style]}`}>
                <div
                  className={`w-12 h-12 flex items-center justify-center mb-4 ${isEditing ? "cursor-pointer hover:opacity-80 transition" : ""} ${radiusCardClass[theme.radius]}`}
                  style={{ background: `${accentColor}15` }}
                  onClick={() => isEditing && setIconPicker(i)}
                >
                  {IconComp ? React.createElement(IconComp, { className: "w-6 h-6", style: { color: accentColor } }) : <span style={{ color: accentColor }}>•</span>}
                </div>
                {isEditing ? (
                  <h3 contentEditable suppressContentEditableWarning className="landing-heading font-semibold mb-2 outline-none"
                    onBlur={(e) => onItemChange?.(i, "title", e.currentTarget.textContent || "")}>{item.title}</h3>
                ) : (
                  <h3 className="landing-heading font-semibold mb-2">{item.title}</h3>
                )}
                {isEditing ? (
                  <p contentEditable suppressContentEditableWarning className="text-sm text-muted-foreground outline-none"
                    onBlur={(e) => onItemChange?.(i, "description", e.currentTarget.textContent || "")}>{item.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                )}
                {isEditing && (
                  <button onClick={() => onRemoveItem?.(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-destructive transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && (
          <button onClick={onAddItem} className="mt-4 text-sm text-primary hover:underline">+ Добавить пункт</button>
        )}

        {iconPicker !== null && (
          <IconPickerDialog open onClose={() => setIconPicker(null)}
            onSelect={(name) => { onItemChange?.(iconPicker, "icon", name); setIconPicker(null); }} />
        )}
      </div>
    </section>
  );
}
