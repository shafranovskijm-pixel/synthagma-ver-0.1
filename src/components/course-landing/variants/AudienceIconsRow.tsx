import { Trash2 } from "lucide-react";
import { icons } from "lucide-react";
import React, { useState } from "react";
import { IconPickerDialog } from "../IconPickerDialog";
import { useLandingTheme } from "../LandingThemeProvider";
import { sectionSpacingClass } from "@/lib/landing-templates/themeTokens";
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
 * Audience «Icons Row» — иконки в горизонтальной ленте без рамок,
 * минималистично, для языков и образовательных шаблонов.
 */
export function AudienceIconsRow({
  title, description, items, isEditing,
  onTitleChange, onDescriptionChange, onItemChange, onAddItem, onRemoveItem,
}: Props) {
  const { theme, accent } = useLandingTheme();
  const [iconPicker, setIconPicker] = useState<number | null>(null);
  const accentColor = accent || "hsl(var(--primary))";

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} px-6`}>
      <div className="max-w-6xl mx-auto text-center">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className="landing-heading text-2xl md:text-3xl font-bold mb-3 outline-none"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className="landing-heading text-2xl md:text-3xl font-bold mb-3">{title}</h2>
        )}
        {isEditing ? (
          <p contentEditable suppressContentEditableWarning
            className="text-muted-foreground text-lg mb-12 max-w-2xl mx-auto outline-none"
            onBlur={(e) => onDescriptionChange?.(e.currentTarget.textContent || "")}>{description}</p>
        ) : (
          description && <p className="text-muted-foreground text-lg mb-12 max-w-2xl mx-auto">{description}</p>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
          {items.map((item, i) => {
            const compName = toIconComponentName(item.icon || "user");
            const IconComp = (icons as any)[compName];
            return (
              <div key={i} className="relative group flex flex-col items-center px-4">
                <div
                  className={`w-16 h-16 flex items-center justify-center mb-5 rounded-full ${isEditing ? "cursor-pointer hover:scale-110 transition-transform" : ""}`}
                  style={{ background: `${accentColor}18`, boxShadow: `0 8px 24px -8px ${accentColor}55` }}
                  onClick={() => isEditing && setIconPicker(i)}
                >
                  {IconComp ? React.createElement(IconComp, { className: "w-8 h-8", style: { color: accentColor } }) : <span style={{ color: accentColor }} className="text-xl">•</span>}
                </div>
                {isEditing ? (
                  <h3 contentEditable suppressContentEditableWarning className="landing-heading font-semibold text-lg mb-2 outline-none"
                    onBlur={(e) => onItemChange?.(i, "title", e.currentTarget.textContent || "")}>{item.title}</h3>
                ) : (
                  <h3 className="landing-heading font-semibold text-lg mb-2">{item.title}</h3>
                )}
                {isEditing ? (
                  <p contentEditable suppressContentEditableWarning className="text-sm text-muted-foreground max-w-[260px] outline-none"
                    onBlur={(e) => onItemChange?.(i, "description", e.currentTarget.textContent || "")}>{item.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground max-w-[260px]">{item.description}</p>
                )}
                {isEditing && (
                  <button onClick={() => onRemoveItem?.(i)} className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 text-destructive transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && (
          <button onClick={onAddItem} className="mt-8 text-sm text-primary hover:underline">+ Добавить пункт</button>
        )}

        {iconPicker !== null && (
          <IconPickerDialog open onClose={() => setIconPicker(null)}
            onSelect={(name) => { onItemChange?.(iconPicker, "icon", name); setIconPicker(null); }} />
        )}
      </div>
    </section>
  );
}
