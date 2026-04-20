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
 * Audience «Stacked Cards» — наклонённые карточки-фотокарточки.
 * Этап 6: skin.card заменяет общий cardStyleClass — Beauty получает свой
 * волнистый низ + розовую тень, Lab — тёмные карточки с неоном и т.д.
 */
export function AudienceStackedCards({
  title, description, items, isEditing,
  onTitleChange, onDescriptionChange, onItemChange, onAddItem, onRemoveItem,
}: Props) {
  const { theme, accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const [iconPicker, setIconPicker] = useState<number | null>(null);
  const accentColor = accent || "#e879a6";
  const cardClasses = skin.card || cardStyleClass[theme.card_style];
  const iconUsesSkinColor = !!skin.iconWrap;

  // Чередующиеся углы поворота
  const rotations = [-2, 1, -1, 2, -1.5, 1.5];

  return (
    <section
      className={`${sectionSpacingClass[theme.section_spacing]} px-6 ${skin.accentBg}`}
      style={skin.accentBg ? undefined : { background: `linear-gradient(180deg, ${accentColor}06 0%, transparent 100%)` }}
    >
      <div className="max-w-5xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className={`landing-heading text-2xl md:text-4xl font-bold mb-4 text-center outline-none ${skin.sectionTitle}`}
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-2xl md:text-4xl font-bold mb-4 text-center ${skin.sectionTitle}`}>{title}</h2>
        )}
        {isEditing ? (
          <p contentEditable suppressContentEditableWarning
            className="text-muted-foreground text-lg mb-12 max-w-2xl mx-auto text-center outline-none"
            onBlur={(e) => onDescriptionChange?.(e.currentTarget.textContent || "")}>{description}</p>
        ) : (
          description && <p className="text-muted-foreground text-lg mb-12 max-w-2xl mx-auto text-center">{description}</p>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {items.map((item, i) => {
            const compName = toIconComponentName(item.icon || "user");
            const IconComp = (icons as any)[compName];
            const rot = rotations[i % rotations.length];
            return (
              <div
                key={i}
                className={`relative p-6 group ${radiusCardClass[theme.radius]} ${cardClasses} transition-transform duration-300 hover:rotate-0 hover:scale-105`}
                style={{ transform: `rotate(${rot}deg)` }}
              >
                <div
                  className={`w-14 h-14 flex items-center justify-center mb-4 mx-auto ${skin.iconWrap || "rounded-full"} ${isEditing ? "cursor-pointer" : ""}`}
                  style={skin.iconWrap ? undefined : { background: `${accentColor}22` }}
                  onClick={() => isEditing && setIconPicker(i)}
                >
                  {IconComp ? React.createElement(IconComp, {
                    className: "w-7 h-7",
                    style: iconUsesSkinColor ? undefined : { color: accentColor },
                  }) : <span style={iconUsesSkinColor ? undefined : { color: accentColor }}>•</span>}
                </div>
                {isEditing ? (
                  <h3 contentEditable suppressContentEditableWarning className="landing-heading font-semibold mb-2 text-center outline-none"
                    onBlur={(e) => onItemChange?.(i, "title", e.currentTarget.textContent || "")}>{item.title}</h3>
                ) : (
                  <h3 className="landing-heading font-semibold mb-2 text-center">{skin.cardTitlePrefix}{item.title}</h3>
                )}
                {isEditing ? (
                  <p contentEditable suppressContentEditableWarning className="text-sm text-muted-foreground text-center outline-none"
                    onBlur={(e) => onItemChange?.(i, "description", e.currentTarget.textContent || "")}>{item.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground text-center">{item.description}</p>
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
          <div className="text-center mt-6">
            <button onClick={onAddItem} className="text-sm text-primary hover:underline">+ Добавить пункт</button>
          </div>
        )}

        {iconPicker !== null && (
          <IconPickerDialog open onClose={() => setIconPicker(null)}
            onSelect={(name) => { onItemChange?.(iconPicker, "icon", name); setIconPicker(null); }} />
        )}
      </div>
    </section>
  );
}
