import { Trash2 } from "lucide-react";
import { icons } from "lucide-react";
import React, { useState } from "react";
import { IconPickerDialog } from "../IconPickerDialog";
import { useLandingTheme, useTemplateStyle } from "../LandingThemeProvider";
import { sectionSpacingClass } from "@/lib/landing-templates/themeTokens";
import type { BenefitItem } from "../LandingBenefitsSection";
import safetyInline from "@/assets/landing-templates/decor/safety-inline.png";

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
 * Benefits «Blueprint List» — нумерованный регламент с маркировкой пунктов
 * («П.1.2 / Положение») слева и схематичным blueprint-чертежом справа. Для Safety.
 */
export function BenefitsBlueprintList({ benefits, isEditing, onBenefitChange, onAddBenefit, onRemoveBenefit }: Props) {
  const { theme, accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const [iconPicker, setIconPicker] = useState<number | null>(null);
  const accentColor = accent || "#1e3a8a";
  if (benefits.length === 0 && !isEditing) return null;

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} px-6`}>
      <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.5fr_1fr] gap-10 items-start">
        <div>
          <h2 className={`landing-heading text-2xl md:text-3xl font-bold mb-8 ${skin.sectionTitle}`}>
            ПРЕИМУЩЕСТВА · ПОЛОЖЕНИЕ
          </h2>
          <ol className="space-y-5">
            {benefits.map((b, i) => {
              const compName = toIconComponentName(b.icon);
              const IconComp = (icons as any)[compName];
              return (
                <li key={i} className="relative group flex gap-5 p-4 border-l-4 bg-white" style={{ borderColor: accentColor }}>
                  <div className="shrink-0 flex flex-col items-center gap-2">
                    <span className="font-mono text-[11px] font-bold tracking-wider px-2 py-0.5 text-white" style={{ background: accentColor }}>
                      П.{i + 1}.{i + 1}
                    </span>
                    <div className={`w-11 h-11 flex items-center justify-center border-2 ${isEditing ? "cursor-pointer" : ""}`}
                      style={{ borderColor: accentColor, background: `${accentColor}10` }}
                      onClick={() => isEditing && setIconPicker(i)}>
                      {IconComp ? React.createElement(IconComp, { className: "w-5 h-5", style: { color: accentColor } }) : <span style={{ color: accentColor }}>•</span>}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <h3 contentEditable suppressContentEditableWarning className="landing-heading font-bold text-base mb-1 uppercase tracking-wide outline-none"
                        style={{ color: accentColor }}
                        onBlur={(e) => onBenefitChange?.(i, "title", e.currentTarget.textContent || "")}>{b.title}</h3>
                    ) : (
                      <h3 className="landing-heading font-bold text-base mb-1 uppercase tracking-wide" style={{ color: accentColor }}>
                        {b.title}
                      </h3>
                    )}
                    {isEditing ? (
                      <p contentEditable suppressContentEditableWarning className="text-sm text-foreground/75 leading-relaxed outline-none"
                        onBlur={(e) => onBenefitChange?.(i, "description", e.currentTarget.textContent || "")}>{b.description}</p>
                    ) : (
                      <p className="text-sm text-foreground/75 leading-relaxed">{b.description}</p>
                    )}
                  </div>
                  {isEditing && (
                    <button onClick={() => onRemoveBenefit?.(i)} className="opacity-0 group-hover:opacity-100 text-destructive transition self-start">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {isEditing && benefits.length < 8 && (
            <button onClick={onAddBenefit} className="mt-6 text-sm text-primary hover:underline">+ Добавить пункт</button>
          )}
        </div>

        {/* Blueprint иллюстрация */}
        <div className="hidden lg:block sticky top-20">
          <div className="border-2 p-4 bg-white" style={{ borderColor: accentColor }}>
            <div className="flex items-center justify-between mb-3 pb-2 border-b" style={{ borderColor: accentColor }}>
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: accentColor }}>blueprint · 001 · rev.A</span>
              <span className="font-mono text-[10px]" style={{ color: accentColor }}>1:50</span>
            </div>
            <img src={safetyInline} alt="" aria-hidden loading="lazy" width={768} height={512} className="w-full" />
            <div className="mt-2 flex items-center justify-between text-[10px] font-mono uppercase" style={{ color: accentColor }}>
              <span>STAMP · APPROVED</span>
              <span>{new Date().getFullYear()}</span>
            </div>
          </div>
        </div>

        {iconPicker !== null && (
          <IconPickerDialog open onClose={() => setIconPicker(null)}
            onSelect={(name) => { onBenefitChange?.(iconPicker, "icon", name); setIconPicker(null); }} />
        )}
      </div>
    </section>
  );
}
