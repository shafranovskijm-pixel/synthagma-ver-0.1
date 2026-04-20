import { Trash2 } from "lucide-react";
import { icons } from "lucide-react";
import React, { useState } from "react";
import { IconPickerDialog } from "../IconPickerDialog";
import { useLandingTheme } from "../LandingThemeProvider";
import auroraOrb from "@/assets/landing-templates/decor/aurora-inline-v2.jpg";
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
 * Benefits «Aurora Showcase» — премиальный 2x2 grid с большими номерами 01–04,
 * стеклянными панелями, светящимся orb-объектом по центру и aurora-glow.
 * Только для шаблона Aurora.
 */
export function BenefitsAuroraShowcase({
  benefits, isEditing, onBenefitChange, onAddBenefit, onRemoveBenefit,
}: Props) {
  const { accent } = useLandingTheme();
  const [iconPicker, setIconPicker] = useState<number | null>(null);
  const accentColor = accent || "#22b8a6";

  if (benefits.length === 0 && !isEditing) return null;

  // Берём первые 4, чтобы держать строгую 2x2 композицию
  const visible = benefits.slice(0, 4);

  return (
    <section className="relative py-24 px-6 overflow-hidden bg-gradient-to-b from-[#0a1820] via-[#0d1f29] to-[#0a1820] text-white">
      {/* Aurora glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/4 w-[600px] h-[600px] rounded-full blur-3xl opacity-40 aurora-float"
        style={{ background: `radial-gradient(circle, ${accentColor}66, transparent 70%)` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full blur-3xl opacity-30 aurora-float-delay"
        style={{ background: `radial-gradient(circle, #0ea5e988, transparent 70%)` }}
      />

      <div className="max-w-6xl mx-auto relative">
        {/* Eyebrow + title */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.2em] mb-4"
            style={{ background: `${accentColor}22`, color: accentColor, border: `1px solid ${accentColor}55` }}>
            ◆ Преимущества программы
          </div>
          <h2 className="landing-heading text-4xl md:text-5xl font-bold tpl-aurora-section-title">
            Почему выбирают нас
          </h2>
        </div>

        {/* Showcase grid 2x2 with central orb */}
        <div className="relative">
          {/* Central decorative orb */}
          <div
            aria-hidden
            className="hidden md:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 rounded-full pointer-events-none aurora-pulse"
            style={{
              backgroundImage: `url(${auroraOrb})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(2px)",
              opacity: 0.55,
              maskImage: "radial-gradient(circle, #000 40%, transparent 70%)",
              WebkitMaskImage: "radial-gradient(circle, #000 40%, transparent 70%)",
            }}
          />

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8 relative">
            {visible.map((b, i) => {
              const compName = toIconComponentName(b.icon);
              const IconComp = (icons as any)[compName];
              const num = String(i + 1).padStart(2, "0");
              return (
                <div
                  key={i}
                  className="relative group p-8 lg:p-10 rounded-3xl overflow-hidden aurora-card-showcase"
                  style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
                    border: `1px solid ${accentColor}33`,
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                  }}
                >
                  {/* shimmer sweep */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                    style={{
                      background: `linear-gradient(110deg, transparent 35%, ${accentColor}33 50%, transparent 65%)`,
                      backgroundSize: "200% 100%",
                      animation: "shimmer 2.5s linear infinite",
                    }}
                  />

                  {isEditing && (
                    <button
                      onClick={() => onRemoveBenefit?.(i)}
                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-red-400 transition z-10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  <div className="relative flex items-start gap-5">
                    {/* Big number */}
                    <div
                      className="text-5xl lg:text-6xl font-black leading-none shrink-0 select-none"
                      style={{
                        background: `linear-gradient(180deg, ${accentColor}, ${accentColor}33)`,
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      {num}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Icon chip */}
                      <div
                        className={`inline-flex w-11 h-11 items-center justify-center rounded-xl mb-4 ${isEditing ? "cursor-pointer hover:opacity-80" : ""}`}
                        style={{
                          background: `${accentColor}22`,
                          border: `1px solid ${accentColor}55`,
                          boxShadow: `0 0 24px ${accentColor}55`,
                        }}
                        onClick={() => isEditing && setIconPicker(i)}
                      >
                        {IconComp ? React.createElement(IconComp, { className: "w-5 h-5", style: { color: accentColor } }) : <span style={{ color: accentColor }}>•</span>}
                      </div>

                      {isEditing ? (
                        <h3
                          contentEditable suppressContentEditableWarning
                          className="landing-heading text-xl font-bold mb-2 outline-none text-white"
                          onBlur={(e) => onBenefitChange?.(i, "title", e.currentTarget.textContent || "")}
                        >{b.title}</h3>
                      ) : (
                        <h3 className="landing-heading text-xl font-bold mb-2 text-white">{b.title}</h3>
                      )}

                      {isEditing ? (
                        <p
                          contentEditable suppressContentEditableWarning
                          className="text-sm leading-relaxed text-white/65 outline-none"
                          onBlur={(e) => onBenefitChange?.(i, "description", e.currentTarget.textContent || "")}
                        >{b.description}</p>
                      ) : (
                        <p className="text-sm leading-relaxed text-white/65">{b.description}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {isEditing && benefits.length < 4 && (
          <div className="text-center mt-6">
            <button onClick={onAddBenefit} className="text-sm" style={{ color: accentColor }}>
              + Добавить преимущество
            </button>
          </div>
        )}

        {iconPicker !== null && (
          <IconPickerDialog
            open
            onClose={() => setIconPicker(null)}
            onSelect={(name) => { onBenefitChange?.(iconPicker, "icon", name); setIconPicker(null); }}
          />
        )}
      </div>
    </section>
  );
}
