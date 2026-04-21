import { Trash2 } from "lucide-react";
import { icons } from "lucide-react";
import React, { useState } from "react";
import { IconPickerDialog } from "../IconPickerDialog";
import { useLandingTheme, useTemplateStyle } from "../LandingThemeProvider";
import { sectionSpacingClass } from "@/lib/landing-templates/themeTokens";
import type { AudienceItem } from "../LandingAudienceSection";
import languageInline from "@/assets/landing-templates/decor/language-inline.webp";

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
 * Audience «Passport Cards» — карточки в виде страниц паспорта/блокнота с штампом.
 * Бумажная фактура, угол загнут, серифный шрифт. Для Language.
 */
export function AudiencePassportCards({
  title, description, items, isEditing,
  onTitleChange, onDescriptionChange, onItemChange, onAddItem, onRemoveItem,
}: Props) {
  const { theme, accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const [iconPicker, setIconPicker] = useState<number | null>(null);
  const accentColor = accent || "#b45309";

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} px-6 relative overflow-hidden`}>
      {/* Декоративная бумажная иллюстрация в углу */}
      <img
        src={languageInline}
        alt=""
        aria-hidden
        loading="lazy"
        width={768}
        height={512}
        className="absolute -bottom-12 -right-16 w-[420px] opacity-15 pointer-events-none select-none rotate-6"
      />
      <div className="max-w-5xl mx-auto relative">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className={`landing-heading text-2xl md:text-4xl font-bold mb-3 outline-none ${skin.sectionTitle}`}
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-2xl md:text-4xl font-bold mb-3 ${skin.sectionTitle}`}>{title}</h2>
        )}
        {isEditing ? (
          <p contentEditable suppressContentEditableWarning
            className="text-muted-foreground text-lg mb-10 max-w-2xl outline-none italic"
            onBlur={(e) => onDescriptionChange?.(e.currentTarget.textContent || "")}>{description}</p>
        ) : (
          description && <p className="text-muted-foreground text-lg mb-10 max-w-2xl italic">{description}</p>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-7">
          {items.map((item, i) => {
            const compName = toIconComponentName(item.icon || "user");
            const IconComp = (icons as any)[compName];
            const stamps = ["A1", "B1", "C1", "A2", "B2", "C2"];
            return (
              <div
                key={i}
                className="relative p-6 group bg-[#fffdf7] border border-[#d4a57455] shadow-[0_8px_20px_-8px_rgba(120,80,40,.25)]"
                style={{
                  backgroundImage: "repeating-linear-gradient(0deg, transparent 0 31px, rgba(180,120,80,.08) 31px 32px)",
                }}
              >
                {/* Уголок страницы */}
                <div className="absolute top-0 right-0 w-8 h-8" style={{ background: "linear-gradient(225deg, #d4a574 0 50%, transparent 50%)" }} />
                {/* Штамп уровня */}
                <div className="absolute top-3 right-12 text-[10px] font-bold border-2 border-dashed px-2 py-0.5 rotate-[-8deg] opacity-70"
                  style={{ borderColor: accentColor, color: accentColor }}>
                  {stamps[i % stamps.length]}
                </div>
                <div className={`w-12 h-12 mb-4 flex items-center justify-center border-2 border-dashed ${isEditing ? "cursor-pointer" : ""}`}
                  style={{ borderColor: `${accentColor}66`, color: accentColor }}
                  onClick={() => isEditing && setIconPicker(i)}>
                  {IconComp ? React.createElement(IconComp, { className: "w-6 h-6" }) : <span>•</span>}
                </div>
                {isEditing ? (
                  <h3 contentEditable suppressContentEditableWarning className="landing-heading font-bold text-lg mb-2 outline-none"
                    style={{ color: "#3a2614" }}
                    onBlur={(e) => onItemChange?.(i, "title", e.currentTarget.textContent || "")}>{item.title}</h3>
                ) : (
                  <h3 className="landing-heading font-bold text-lg mb-2" style={{ color: "#3a2614" }}>{item.title}</h3>
                )}
                {isEditing ? (
                  <p contentEditable suppressContentEditableWarning className="text-sm leading-relaxed outline-none italic"
                    style={{ color: "#5a3a20cc" }}
                    onBlur={(e) => onItemChange?.(i, "description", e.currentTarget.textContent || "")}>{item.description}</p>
                ) : (
                  <p className="text-sm leading-relaxed italic" style={{ color: "#5a3a20cc" }}>{item.description}</p>
                )}
                {isEditing && (
                  <button onClick={() => onRemoveItem?.(i)} className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 text-destructive transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && (
          <button onClick={onAddItem} className="mt-4 text-sm text-primary hover:underline">+ Добавить страницу</button>
        )}

        {iconPicker !== null && (
          <IconPickerDialog open onClose={() => setIconPicker(null)}
            onSelect={(name) => { onItemChange?.(iconPicker, "icon", name); setIconPicker(null); }} />
        )}
      </div>
    </section>
  );
}
