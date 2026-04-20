import { Trash2 } from "lucide-react";
import { icons } from "lucide-react";
import React, { useState } from "react";
import { IconPickerDialog } from "../IconPickerDialog";
import { useLandingTheme, useTemplateStyle } from "../LandingThemeProvider";
import { cardStyleClass, radiusCardClass, sectionSpacingClass } from "@/lib/landing-templates/themeTokens";
import type { BenefitItem } from "../LandingBenefitsSection";

function toIconComponentName(kebab: string): string {
  return kebab.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

interface Props {
  benefits: BenefitItem[];
  isEditing?: boolean;
  onBenefitChange?: (index: number, field: "title" | "description" | "icon", value: string) => void;
  onAddBenefit?: () => void;
  onRemoveBenefit?: (index: number) => void;
}

/** Benefits «Grid» — равная сетка иконок по центру. Базовый вариант. */
export function BenefitsGrid({ benefits, isEditing, onBenefitChange, onAddBenefit, onRemoveBenefit }: Props) {
  const { theme, accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const [iconPicker, setIconPicker] = useState<number | null>(null);
  const accentColor = accent || "hsl(var(--primary))";

  if (benefits.length === 0 && !isEditing) return null;

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} px-6`}>
      <div className="max-w-5xl mx-auto">
        <h2 className={`landing-heading text-2xl md:text-3xl font-bold mb-8 ${skin.sectionTitle}`}>Преимущества</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((b, i) => {
            const compName = toIconComponentName(b.icon);
            const IconComp = (icons as any)[compName];
            return (
              <div key={i} data-clause={`п.${i + 1}.2`} className={`relative p-6 text-center group ${radiusCardClass[theme.radius]} ${skin.card || cardStyleClass[theme.card_style]}`}>
                {isEditing && (
                  <button onClick={() => onRemoveBenefit?.(i)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-destructive transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <div
                  className={`flex justify-center mb-4 ${isEditing ? "cursor-pointer" : ""}`}
                  onClick={() => isEditing && setIconPicker(i)}
                >
                  <div
                    className={`w-12 h-12 flex items-center justify-center ${radiusCardClass[theme.radius]} ${isEditing ? "hover:opacity-80 transition" : ""}`}
                    style={{ background: `${accentColor}18` }}
                  >
                    {IconComp ? React.createElement(IconComp, { className: "w-6 h-6", style: { color: accentColor } }) : <span style={{ color: accentColor }}>•</span>}
                  </div>
                </div>
                {isEditing ? (
                  <h3 contentEditable suppressContentEditableWarning
                    className="landing-heading font-semibold mb-2 outline-none"
                    onBlur={(e) => onBenefitChange?.(i, "title", e.currentTarget.textContent || "")}>{b.title}</h3>
                ) : (
                  <h3 className="landing-heading font-semibold mb-2">{b.title}</h3>
                )}
                {isEditing ? (
                  <p contentEditable suppressContentEditableWarning
                    className="text-sm text-muted-foreground outline-none"
                    onBlur={(e) => onBenefitChange?.(i, "description", e.currentTarget.textContent || "")}>{b.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{b.description}</p>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && benefits.length < 8 && (
          <button onClick={onAddBenefit} className="mt-4 text-sm text-primary hover:underline">+ Добавить преимущество</button>
        )}

        {iconPicker !== null && (
          <IconPickerDialog open onClose={() => setIconPicker(null)}
            onSelect={(name) => { onBenefitChange?.(iconPicker, "icon", name); setIconPicker(null); }} />
        )}
      </div>
    </section>
  );
}
