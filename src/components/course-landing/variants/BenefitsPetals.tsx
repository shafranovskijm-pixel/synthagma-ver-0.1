import { Trash2 } from "lucide-react";
import { icons } from "lucide-react";
import React, { useState } from "react";
import { IconPickerDialog } from "../IconPickerDialog";
import { useLandingTheme, useTemplateStyle } from "../LandingThemeProvider";
import { sectionSpacingClass } from "@/lib/landing-templates/themeTokens";
import type { BenefitItem } from "../LandingBenefitsSection";
import beautyInline from "@/assets/landing-templates/decor/beauty-inline.png";

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
 * Benefits «Petals» — лепестковая композиция: круглые мягкие карточки с большой
 * иконкой сверху, чуть наклонённые. Розовая дымка на фоне. Для Beauty.
 */
export function BenefitsPetals({ benefits, isEditing, onBenefitChange, onAddBenefit, onRemoveBenefit }: Props) {
  const { theme, accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const [iconPicker, setIconPicker] = useState<number | null>(null);
  const accentColor = accent || "#e879a6";

  if (benefits.length === 0 && !isEditing) return null;
  const tilts = [-3, 2, -1, 3, -2, 1];

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} px-6 relative overflow-hidden`}>
      {/* Боковая декоративная иллюстрация */}
      <img
        src={beautyInline}
        alt=""
        aria-hidden
        loading="lazy"
        width={768}
        height={512}
        className="absolute top-0 -left-20 w-[380px] opacity-30 pointer-events-none select-none -rotate-12"
      />
      <div className="max-w-5xl mx-auto relative">
        <h2 className={`landing-heading text-3xl md:text-4xl font-bold mb-12 text-center ${skin.sectionTitle}`}>
          Преимущества
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-12 gap-x-6">
          {benefits.map((b, i) => {
            const compName = toIconComponentName(b.icon);
            const IconComp = (icons as any)[compName];
            const tilt = tilts[i % tilts.length];
            return (
              <div
                key={i}
                className="relative group flex flex-col items-center text-center transition-transform duration-300 hover:scale-105"
                style={{ transform: `rotate(${tilt}deg)` }}
              >
                {/* Лепесток-облако позади */}
                <div
                  className="relative w-28 h-28 mb-4 flex items-center justify-center"
                  style={{
                    background: `radial-gradient(circle at 35% 30%, ${accentColor}45, ${accentColor}15 60%, transparent 80%)`,
                    borderRadius: "62% 38% 55% 45% / 50% 50% 50% 50%",
                  }}
                  onClick={() => isEditing && setIconPicker(i)}
                >
                  {/* Внутренний круг */}
                  <div className="w-20 h-20 rounded-full bg-white shadow-[0_8px_24px_-8px_rgba(232,121,166,.5)] flex items-center justify-center">
                    {IconComp ? React.createElement(IconComp, { className: "w-9 h-9", style: { color: accentColor } }) : <span style={{ color: accentColor }}>•</span>}
                  </div>
                </div>
                {isEditing ? (
                  <h3 contentEditable suppressContentEditableWarning
                    className="landing-heading font-semibold text-base mb-1.5 outline-none"
                    onBlur={(e) => onBenefitChange?.(i, "title", e.currentTarget.textContent || "")}>{b.title}</h3>
                ) : (
                  <h3 className="landing-heading font-semibold text-base mb-1.5">{b.title}</h3>
                )}
                {isEditing ? (
                  <p contentEditable suppressContentEditableWarning
                    className="text-xs text-muted-foreground outline-none px-2"
                    onBlur={(e) => onBenefitChange?.(i, "description", e.currentTarget.textContent || "")}>{b.description}</p>
                ) : (
                  <p className="text-xs text-muted-foreground px-2">{b.description}</p>
                )}
                {isEditing && (
                  <button onClick={() => onRemoveBenefit?.(i)} className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 text-destructive transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && benefits.length < 8 && (
          <div className="text-center">
            <button onClick={onAddBenefit} className="mt-8 text-sm text-primary hover:underline">+ Добавить лепесток</button>
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
