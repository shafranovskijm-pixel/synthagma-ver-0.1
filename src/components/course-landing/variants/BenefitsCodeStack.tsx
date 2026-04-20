import { Trash2 } from "lucide-react";
import { icons } from "lucide-react";
import React, { useState } from "react";
import { IconPickerDialog } from "../IconPickerDialog";
import { useLandingTheme, useTemplateStyle } from "../LandingThemeProvider";
import { sectionSpacingClass } from "@/lib/landing-templates/themeTokens";
import type { BenefitItem } from "../LandingBenefitsSection";
import labInline from "@/assets/landing-templates/decor/lab-inline.webp";

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
 * Benefits «Code Stack» — каждое преимущество как блок кода с комментарием.
 * Темный фон, моноширинный шрифт, неоновые акценты, в фоне — снимок IDE. Для Lab.
 */
export function BenefitsCodeStack({ benefits, isEditing, onBenefitChange, onAddBenefit, onRemoveBenefit }: Props) {
  const { theme, accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const [iconPicker, setIconPicker] = useState<number | null>(null);
  const accentColor = accent || "#22d3ee";
  if (benefits.length === 0 && !isEditing) return null;

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} px-6 relative overflow-hidden`}>
      {/* Полупрозрачный backdrop с кодом */}
      <img
        src={labInline}
        alt=""
        aria-hidden
        loading="lazy"
        width={768}
        height={512}
        className="absolute top-0 right-0 w-[640px] opacity-15 pointer-events-none select-none mix-blend-screen"
      />
      <div className="max-w-5xl mx-auto relative">
        <h2 className={`landing-heading text-3xl font-bold mb-3 ${skin.sectionTitle}`}>
          <span className="text-cyan-400 font-mono">{"// "}</span>
          benefits.stack
        </h2>
        <p className="font-mono text-sm text-zinc-400 mb-10">{"/* "}what.you.get();{" */"}</p>

        <div className="space-y-4">
          {benefits.map((b, i) => {
            const compName = toIconComponentName(b.icon);
            const IconComp = (icons as any)[compName];
            return (
              <div key={i} className="relative group bg-zinc-900/80 border-l-2 border-cyan-500 p-5 font-mono"
                style={{ boxShadow: `inset 0 0 60px -20px ${accentColor}22` }}>
                <div className="flex items-start gap-4">
                  <div className="shrink-0 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-zinc-500">{String(i + 1).padStart(2, "0")}</span>
                    <div className={`w-10 h-10 flex items-center justify-center border border-cyan-500/40 ${isEditing ? "cursor-pointer" : ""}`}
                      style={{ background: `${accentColor}15` }}
                      onClick={() => isEditing && setIconPicker(i)}>
                      {IconComp ? React.createElement(IconComp, { className: "w-5 h-5", style: { color: accentColor } }) : <span style={{ color: accentColor }}>•</span>}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-500 mb-1">{"// "}feature_{String(i + 1).padStart(2, "0")}</div>
                    {isEditing ? (
                      <h3 contentEditable suppressContentEditableWarning className="landing-heading font-bold text-base mb-1.5 outline-none text-cyan-100"
                        onBlur={(e) => onBenefitChange?.(i, "title", e.currentTarget.textContent || "")}>{b.title}</h3>
                    ) : (
                      <h3 className="landing-heading font-bold text-base mb-1.5 text-cyan-100">
                        <span className="text-purple-400">const</span>{" "}
                        <span className="text-cyan-300">{b.title.split(" ").slice(0, 2).join("_").toLowerCase()}</span>
                        <span className="text-zinc-500"> = </span>
                        <span>{b.title}</span>
                      </h3>
                    )}
                    {isEditing ? (
                      <p contentEditable suppressContentEditableWarning className="text-sm text-zinc-400 leading-relaxed outline-none"
                        onBlur={(e) => onBenefitChange?.(i, "description", e.currentTarget.textContent || "")}>{b.description}</p>
                    ) : (
                      <p className="text-sm text-zinc-400 leading-relaxed">
                        <span className="text-zinc-600">/* </span>{b.description}<span className="text-zinc-600"> */</span>
                      </p>
                    )}
                  </div>
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
          <button onClick={onAddBenefit} className="mt-6 text-sm text-cyan-400 hover:underline font-mono">+ ./push --feature</button>
        )}

        {iconPicker !== null && (
          <IconPickerDialog open onClose={() => setIconPicker(null)}
            onSelect={(name) => { onBenefitChange?.(iconPicker, "icon", name); setIconPicker(null); }} />
        )}
      </div>
    </section>
  );
}
