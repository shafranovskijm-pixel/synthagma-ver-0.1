import { Trash2 } from "lucide-react";
import { icons } from "lucide-react";
import React, { useState } from "react";
import { IconPickerDialog } from "../IconPickerDialog";
import { useLandingTheme } from "../LandingThemeProvider";
import { sectionSpacingClass } from "@/lib/landing-templates/themeTokens";
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

/**
 * Benefits «Icon List» — двухколоночный список с иконками слева и текстом справа.
 * Лаконичный вариант для корпоративных и образовательных шаблонов.
 */
export function BenefitsIconList({ benefits, isEditing, onBenefitChange, onAddBenefit, onRemoveBenefit }: Props) {
  const { theme, accent } = useLandingTheme();
  const [iconPicker, setIconPicker] = useState<number | null>(null);
  const accentColor = accent || "hsl(var(--primary))";

  if (benefits.length === 0 && !isEditing) return null;

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} px-6`}>
      <div className="max-w-5xl mx-auto">
        <h2 className="landing-heading text-2xl md:text-3xl font-bold mb-10">Преимущества</h2>
        <div className="grid md:grid-cols-2 gap-x-12 gap-y-8">
          {benefits.map((b, i) => {
            const compName = toIconComponentName(b.icon);
            const IconComp = (icons as any)[compName];
            return (
              <div key={i} className="relative flex gap-4 group">
                <div
                  className={`shrink-0 w-12 h-12 flex items-center justify-center ${isEditing ? "cursor-pointer" : ""}`}
                  style={{ background: `${accentColor}15`, borderRadius: theme.radius === "sharp" ? "0" : "12px" }}
                  onClick={() => isEditing && setIconPicker(i)}
                >
                  {IconComp ? React.createElement(IconComp, { className: "w-6 h-6", style: { color: accentColor } }) : <span style={{ color: accentColor }}>•</span>}
                </div>
                <div className="flex-1">
                  {isEditing ? (
                    <h3 contentEditable suppressContentEditableWarning
                      className="landing-heading font-semibold mb-1.5 outline-none"
                      onBlur={(e) => onBenefitChange?.(i, "title", e.currentTarget.textContent || "")}>{b.title}</h3>
                  ) : (
                    <h3 className="landing-heading font-semibold mb-1.5">{b.title}</h3>
                  )}
                  {isEditing ? (
                    <p contentEditable suppressContentEditableWarning
                      className="text-sm text-muted-foreground leading-relaxed outline-none"
                      onBlur={(e) => onBenefitChange?.(i, "description", e.currentTarget.textContent || "")}>{b.description}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground leading-relaxed">{b.description}</p>
                  )}
                </div>
                {isEditing && (
                  <button onClick={() => onRemoveBenefit?.(i)} className="opacity-0 group-hover:opacity-100 text-destructive transition self-start">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && benefits.length < 8 && (
          <button onClick={onAddBenefit} className="mt-6 text-sm text-primary hover:underline">+ Добавить преимущество</button>
        )}

        {iconPicker !== null && (
          <IconPickerDialog open onClose={() => setIconPicker(null)}
            onSelect={(name) => { onBenefitChange?.(iconPicker, "icon", name); setIconPicker(null); }} />
        )}
      </div>
    </section>
  );
}
