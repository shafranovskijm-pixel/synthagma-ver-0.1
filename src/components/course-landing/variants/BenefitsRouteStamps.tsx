import { Trash2 } from "lucide-react";
import { icons } from "lucide-react";
import React, { useState } from "react";
import { IconPickerDialog } from "../IconPickerDialog";
import { useLandingTheme, useTemplateStyle } from "../LandingThemeProvider";
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
 * Benefits «Route Stamps» — преимущества как пункты маршрута/штампы в паспорте.
 * Вертикальный таймлайн с пунктирной линией. Для Language.
 */
export function BenefitsRouteStamps({ benefits, isEditing, onBenefitChange, onAddBenefit, onRemoveBenefit }: Props) {
  const { theme, accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const [iconPicker, setIconPicker] = useState<number | null>(null);
  const accentColor = accent || "#b45309";
  if (benefits.length === 0 && !isEditing) return null;

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} px-6`}>
      <div className="max-w-3xl mx-auto">
        <h2 className={`landing-heading text-2xl md:text-3xl font-bold mb-12 text-center ${skin.sectionTitle}`}>
          Маршрут вашего обучения
        </h2>
        <div className="relative pl-12">
          {/* Пунктирная вертикальная линия */}
          <div className="absolute left-5 top-2 bottom-2 border-l-2 border-dashed" style={{ borderColor: `${accentColor}55` }} />
          {benefits.map((b, i) => {
            const compName = toIconComponentName(b.icon);
            const IconComp = (icons as any)[compName];
            return (
              <div key={i} className="relative group mb-7 last:mb-0">
                {/* Иконка-штамп */}
                <div
                  className={`absolute -left-12 top-0 w-11 h-11 rounded-full border-2 flex items-center justify-center bg-[#fffdf7] ${isEditing ? "cursor-pointer" : ""}`}
                  style={{ borderColor: accentColor, color: accentColor, boxShadow: "0 4px 12px -4px rgba(120,80,40,.3)" }}
                  onClick={() => isEditing && setIconPicker(i)}
                >
                  {IconComp ? React.createElement(IconComp, { className: "w-5 h-5" }) : <span>•</span>}
                </div>
                <div className="bg-[#fffdf7] border border-[#d4a57455] p-5 shadow-[0_6px_18px_-8px_rgba(120,80,40,.25)]"
                  style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0 26px, rgba(180,120,80,.06) 26px 27px)" }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: accentColor }}>остановка #{i + 1}</span>
                  </div>
                  {isEditing ? (
                    <h3 contentEditable suppressContentEditableWarning className="landing-heading font-bold text-base mb-1.5 outline-none"
                      style={{ color: "#3a2614" }}
                      onBlur={(e) => onBenefitChange?.(i, "title", e.currentTarget.textContent || "")}>{b.title}</h3>
                  ) : (
                    <h3 className="landing-heading font-bold text-base mb-1.5" style={{ color: "#3a2614" }}>{b.title}</h3>
                  )}
                  {isEditing ? (
                    <p contentEditable suppressContentEditableWarning className="text-sm leading-relaxed outline-none italic"
                      style={{ color: "#5a3a20cc" }}
                      onBlur={(e) => onBenefitChange?.(i, "description", e.currentTarget.textContent || "")}>{b.description}</p>
                  ) : (
                    <p className="text-sm leading-relaxed italic" style={{ color: "#5a3a20cc" }}>{b.description}</p>
                  )}
                </div>
                {isEditing && (
                  <button onClick={() => onRemoveBenefit?.(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-destructive transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && benefits.length < 8 && (
          <div className="text-center">
            <button onClick={onAddBenefit} className="mt-6 text-sm text-primary hover:underline">+ Добавить остановку</button>
          </div>
        )}

        {iconPicker !== null && (
          <IconPickerDialog open onClose={() => setIconPicker(null)}
            onSelect={(name) => { onBenefitChange?.(iconPicker, "icon", name); setIconPicker(null); }} />
        )}
      </div>
    </section>
  );
}
