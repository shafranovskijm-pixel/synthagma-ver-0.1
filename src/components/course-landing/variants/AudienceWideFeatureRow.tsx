import { Trash2 } from "lucide-react";
import { icons } from "lucide-react";
import React, { useState } from "react";
import { IconPickerDialog } from "../IconPickerDialog";
import { useLandingTheme, useTemplateStyle } from "../LandingThemeProvider";
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

/**
 * Audience «Wide Feature Row» — каждая аудитория = широкая горизонтальная плашка
 * с большой иконкой слева в круге сияния и текстом справа. Асимметричный сдвиг.
 * Используется в Aurora.
 */
export function AudienceWideFeatureRow({
  title, description, items, isEditing,
  onTitleChange, onDescriptionChange, onItemChange, onAddItem, onRemoveItem,
}: Props) {
  const { theme, accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const [iconPicker, setIconPicker] = useState<number | null>(null);
  const accentColor = accent || "hsl(var(--primary))";
  const cardClasses = skin.card || cardStyleClass[theme.card_style];

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} px-6`}>
      <div className="max-w-5xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className={`landing-heading text-2xl md:text-4xl font-bold mb-3 outline-none ${skin.sectionTitle}`}
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-2xl md:text-4xl font-bold mb-3 ${skin.sectionTitle}`}>{title}</h2>
        )}
        {isEditing ? (
          <p contentEditable suppressContentEditableWarning
            className="text-muted-foreground text-lg mb-10 max-w-2xl outline-none"
            onBlur={(e) => onDescriptionChange?.(e.currentTarget.textContent || "")}>{description}</p>
        ) : (
          description && <p className="text-muted-foreground text-lg mb-10 max-w-2xl">{description}</p>
        )}

        <div className="space-y-5">
          {items.map((item, i) => {
            const compName = toIconComponentName(item.icon || "user");
            const IconComp = (icons as any)[compName];
            const offset = i % 2 === 0 ? "md:ml-0 md:mr-12" : "md:ml-12 md:mr-0";
            return (
              <div
                key={i}
                className={`relative p-6 md:p-7 group flex items-center gap-6 ${radiusCardClass[theme.radius]} ${cardClasses} ${offset}`}
              >
                <div
                  className={`shrink-0 w-20 h-20 flex items-center justify-center ${radiusCardClass[theme.radius]} ${isEditing ? "cursor-pointer" : ""}`}
                  style={{
                    background: `linear-gradient(135deg, ${accentColor}25, ${accentColor}08)`,
                    boxShadow: `0 12px 30px -10px ${accentColor}55`,
                  }}
                  onClick={() => isEditing && setIconPicker(i)}
                >
                  {IconComp ? React.createElement(IconComp, { className: "w-9 h-9", style: { color: accentColor } }) : <span style={{ color: accentColor }}>•</span>}
                </div>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <h3 contentEditable suppressContentEditableWarning className="landing-heading text-lg md:text-xl font-bold mb-1 outline-none"
                      onBlur={(e) => onItemChange?.(i, "title", e.currentTarget.textContent || "")}>{item.title}</h3>
                  ) : (
                    <h3 className="landing-heading text-lg md:text-xl font-bold mb-1">{skin.cardTitlePrefix}{item.title}</h3>
                  )}
                  {isEditing ? (
                    <p contentEditable suppressContentEditableWarning className="text-sm md:text-base text-muted-foreground outline-none"
                      onBlur={(e) => onItemChange?.(i, "description", e.currentTarget.textContent || "")}>{item.description}</p>
                  ) : (
                    <p className="text-sm md:text-base text-muted-foreground">{item.description}</p>
                  )}
                </div>
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
