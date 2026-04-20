import { Trash2 } from "lucide-react";
import { icons } from "lucide-react";
import React, { useState } from "react";
import { IconPickerDialog } from "../IconPickerDialog";
import { useLandingTheme, useTemplateStyle } from "../LandingThemeProvider";
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
 * Audience «Safety Table» — таблица в духе регламента: пункт.X.X | иконка | заголовок | описание.
 * Жёсткие линии, моноширинный код пункта слева, синий акцент.
 */
export function AudienceSafetyTable({
  title, description, items, isEditing,
  onTitleChange, onDescriptionChange, onItemChange, onAddItem, onRemoveItem,
}: Props) {
  const { theme, accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const [iconPicker, setIconPicker] = useState<number | null>(null);
  const accentColor = accent || "#1e3a8a";

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} px-6`}>
      <div className="max-w-5xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className={`landing-heading text-2xl md:text-3xl font-bold mb-3 outline-none ${skin.sectionTitle}`}
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-2xl md:text-3xl font-bold mb-3 ${skin.sectionTitle}`}>{title}</h2>
        )}
        {isEditing ? (
          <p contentEditable suppressContentEditableWarning
            className="text-muted-foreground text-base mb-8 max-w-3xl outline-none"
            onBlur={(e) => onDescriptionChange?.(e.currentTarget.textContent || "")}>{description}</p>
        ) : (
          description && <p className="text-muted-foreground text-base mb-8 max-w-3xl">{description}</p>
        )}

        <div className="border-2" style={{ borderColor: accentColor }}>
          <div className="grid grid-cols-[88px_1fr] md:grid-cols-[100px_72px_1fr] divide-y-2" style={{ borderColor: accentColor }}>
            <div className="hidden md:flex items-center justify-center font-bold text-xs uppercase tracking-wider py-3 border-b-2" style={{ background: accentColor, color: "white", borderColor: accentColor }}>п.</div>
            <div className="hidden md:flex items-center justify-center font-bold text-xs uppercase tracking-wider py-3 border-b-2 border-l-2" style={{ background: accentColor, color: "white", borderColor: accentColor }}>знак</div>
            <div className="hidden md:flex items-center px-5 font-bold text-xs uppercase tracking-wider py-3 border-b-2 border-l-2" style={{ background: accentColor, color: "white", borderColor: accentColor }}>категория слушателей</div>
            <div className="md:hidden flex items-center justify-center font-bold text-xs uppercase tracking-wider py-3 border-b-2" style={{ background: accentColor, color: "white" }}>п.</div>
            <div className="md:hidden flex items-center px-5 font-bold text-xs uppercase tracking-wider py-3 border-b-2 border-l-2" style={{ background: accentColor, color: "white", borderColor: accentColor }}>категория</div>
            {items.map((item, i) => {
              const compName = toIconComponentName(item.icon || "user");
              const IconComp = (icons as any)[compName];
              return (
                <React.Fragment key={i}>
                  <div className="flex items-center justify-center font-mono text-sm font-bold border-t-2 py-5" style={{ borderColor: accentColor, color: accentColor, background: i % 2 === 0 ? "rgba(30,58,138,.04)" : "transparent" }}>
                    п.{i + 1}.{i + 1}
                  </div>
                  <div className="hidden md:flex items-center justify-center border-t-2 border-l-2 py-5" style={{ borderColor: accentColor, background: i % 2 === 0 ? "rgba(30,58,138,.04)" : "transparent" }}>
                    <div onClick={() => isEditing && setIconPicker(i)} className={isEditing ? "cursor-pointer" : ""}>
                      {IconComp ? React.createElement(IconComp, { className: "w-7 h-7", style: { color: accentColor } }) : <span style={{ color: accentColor }}>•</span>}
                    </div>
                  </div>
                  <div className="relative px-5 py-5 border-t-2 border-l-2 group" style={{ borderColor: accentColor, background: i % 2 === 0 ? "rgba(30,58,138,.04)" : "transparent" }}>
                    {isEditing ? (
                      <h3 contentEditable suppressContentEditableWarning className="landing-heading font-bold text-base mb-1 outline-none"
                        onBlur={(e) => onItemChange?.(i, "title", e.currentTarget.textContent || "")}>{item.title}</h3>
                    ) : (
                      <h3 className="landing-heading font-bold text-base mb-1">{item.title}</h3>
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
                </React.Fragment>
              );
            })}
          </div>
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
