import { Trash2, Check, Sparkles } from "lucide-react";
import { useLandingTheme } from "../LandingThemeProvider";
import auroraOrb from "@/assets/landing-templates/decor/aurora-pricing-orb.jpg";
import type { PricingTier } from "../LandingPricingSection";

interface Props {
  title: string;
  tiers: PricingTier[];
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onTierChange?: (index: number, field: keyof PricingTier, value: any) => void;
  onTierFeatureChange?: (tierIndex: number, featureIndex: number, value: string) => void;
  onAddTierFeature?: (tierIndex: number) => void;
  onRemoveTierFeature?: (tierIndex: number, featureIndex: number) => void;
  onAddTier?: () => void;
  onRemoveTier?: (index: number) => void;
}

/**
 * Pricing «Aurora Spotlight» — центральный premium-тариф с сияющим орбом
 * на фоне, боковые тарифы смещены ниже. Только для шаблона Aurora.
 */
export function PricingAuroraSpotlight(props: Props) {
  const { title, tiers, isEditing, onTitleChange, onTierChange, onTierFeatureChange, onAddTierFeature, onRemoveTierFeature, onAddTier, onRemoveTier } = props;
  const { accent } = useLandingTheme();
  const accentColor = accent || "#22b8a6";

  if (tiers.length === 0 && !isEditing) return null;

  // Центральный = популярный, иначе средний
  const popularIndex = tiers.findIndex((t) => t.is_popular);
  const centerIndex = popularIndex >= 0 ? popularIndex : Math.floor(tiers.length / 2);
  const leftTier = tiers[centerIndex - 1];
  const rightTier = tiers[centerIndex + 1];
  const centerTier = tiers[centerIndex];

  const renderSideTier = (tier: PricingTier | undefined, idx: number) => {
    if (!tier) return <div className="hidden md:block" />;
    return (
      <div
        className="relative group p-6 rounded-2xl mt-12 md:mt-16 transition-all hover:-translate-y-1"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))",
          border: `1px solid ${accentColor}22`,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        {isEditing ? (
          <input className="landing-heading text-lg font-bold mb-2 bg-transparent outline-none text-white w-full"
            value={tier.name} onChange={(e) => onTierChange?.(idx, "name", e.target.value)} />
        ) : (
          <h3 className="landing-heading text-lg font-bold mb-2 text-white">{tier.name}</h3>
        )}
        {isEditing ? (
          <input type="number" value={tier.price} onChange={(e) => onTierChange?.(idx, "price", Number(e.target.value))}
            className="text-2xl font-bold mb-4 bg-transparent outline-none border-b border-dashed border-white/30 w-full text-white" />
        ) : (
          <p className="text-2xl font-bold mb-4" style={{ color: accentColor }}>
            {tier.price > 0 ? `${tier.price.toLocaleString("ru-RU")} ₽` : "Бесплатно"}
          </p>
        )}
        <ul className="space-y-2">
          {tier.features.slice(0, 4).map((f, fi) => (
            <li key={fi} className="flex items-start gap-2 text-xs text-white/65">
              <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: accentColor }} />
              {isEditing ? (
                <span contentEditable suppressContentEditableWarning className="outline-none"
                  onBlur={(e) => onTierFeatureChange?.(idx, fi, e.currentTarget.textContent || "")}>{f}</span>
              ) : <span>{f}</span>}
            </li>
          ))}
          {tier.features.length > 4 && (
            <li className="text-xs italic" style={{ color: accentColor }}>+ ещё {tier.features.length - 4}</li>
          )}
        </ul>
        {isEditing && (
          <button onClick={() => onRemoveTier?.(idx)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-400">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  return (
    <section className="relative py-24 px-6 overflow-hidden bg-gradient-to-b from-[#0a1820] to-[#070f15] text-white">
      {/* Aurora orb behind center tier */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full opacity-50 aurora-float"
        style={{
          backgroundImage: `url(${auroraOrb})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          maskImage: "radial-gradient(circle, #000 35%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(circle, #000 35%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[400px] rounded-full blur-3xl opacity-40"
        style={{ background: `radial-gradient(ellipse, ${accentColor}, transparent 70%)` }}
      />

      <div className="max-w-6xl mx-auto relative">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className="landing-heading text-4xl md:text-5xl font-bold mb-14 text-center outline-none tpl-aurora-section-title"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className="landing-heading text-4xl md:text-5xl font-bold mb-14 text-center tpl-aurora-section-title">{title}</h2>
        )}

        <div className="grid md:grid-cols-3 gap-6 items-start">
          {renderSideTier(leftTier, centerIndex - 1)}

          {/* CENTER PREMIUM TIER */}
          <div
            className="relative group p-8 lg:p-10 rounded-3xl overflow-hidden aurora-pulse-soft"
            style={{
              background: `linear-gradient(135deg, ${accentColor}33, rgba(14,165,233,0.18))`,
              border: `1.5px solid ${accentColor}aa`,
              boxShadow: `0 30px 80px -20px ${accentColor}99, inset 0 1px 0 rgba(255,255,255,0.15)`,
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            {/* Shimmer overlay */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background: `linear-gradient(110deg, transparent 30%, ${accentColor}55 50%, transparent 70%)`,
                backgroundSize: "200% 100%",
                animation: "shimmer 4s linear infinite",
                opacity: 0.4,
              }}
            />

            <div className="relative">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] mb-5"
                style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}>
                <Sparkles className="w-3 h-3" /> Рекомендуем
              </div>

              {isEditing ? (
                <input className="landing-heading text-3xl font-bold mb-3 bg-transparent outline-none text-white w-full"
                  value={centerTier.name} onChange={(e) => onTierChange?.(centerIndex, "name", e.target.value)} />
              ) : (
                <h3 className="landing-heading text-3xl font-bold mb-3 text-white">{centerTier.name}</h3>
              )}

              {isEditing ? (
                <input type="number" value={centerTier.price} onChange={(e) => onTierChange?.(centerIndex, "price", Number(e.target.value))}
                  className="text-5xl font-extrabold mb-7 bg-transparent outline-none border-b border-white/40 w-full text-white" />
              ) : (
                <p className="text-5xl font-extrabold mb-7 text-white">
                  {centerTier.price > 0 ? `${centerTier.price.toLocaleString("ru-RU")} ₽` : "Бесплатно"}
                </p>
              )}

              <ul className="space-y-3 mb-8">
                {centerTier.features.map((f, fi) => (
                  <li key={fi} className="flex items-start gap-3 group/feat">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center mt-0.5 shrink-0"
                      style={{ background: `${accentColor}`, boxShadow: `0 0 12px ${accentColor}` }}>
                      <Check className="w-3 h-3 text-white" />
                    </div>
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-1">
                        <span contentEditable suppressContentEditableWarning className="flex-1 outline-none text-white"
                          onBlur={(e) => onTierFeatureChange?.(centerIndex, fi, e.currentTarget.textContent || "")}>{f}</span>
                        <button onClick={() => onRemoveTierFeature?.(centerIndex, fi)} className="opacity-0 group-hover/feat:opacity-100 text-white/70">✕</button>
                      </div>
                    ) : (
                      <span className="text-white/90">{f}</span>
                    )}
                  </li>
                ))}
              </ul>
              {isEditing && (
                <button onClick={() => onAddTierFeature?.(centerIndex)} className="text-xs underline text-white/80 mb-4">+ пункт</button>
              )}

              <button
                className="w-full py-3.5 rounded-xl font-bold text-white text-sm tpl-aurora-button"
                disabled={isEditing}
              >
                Записаться сейчас
              </button>
            </div>

            {isEditing && (
              <button onClick={() => onRemoveTier?.(centerIndex)} className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 text-white/80">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {renderSideTier(rightTier, centerIndex + 1)}
        </div>

        {isEditing && tiers.length < 4 && (
          <div className="text-center mt-6">
            <button onClick={onAddTier} className="text-sm" style={{ color: accentColor }}>+ Добавить тариф</button>
          </div>
        )}
      </div>
    </section>
  );
}
