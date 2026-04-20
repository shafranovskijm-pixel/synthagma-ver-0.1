import { Trash2, Check, Crown } from "lucide-react";
import { useLandingTheme, useTemplateStyle } from "../LandingThemeProvider";
import { radiusCardClass } from "@/lib/landing-templates/themeTokens";
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
 * Pricing «Hero Focus» — одна крупная VIP-карточка слева + 2 компактные справа.
 * Идеально для бьюти-салонов и premium-курсов. Для Beauty.
 */
export function PricingHeroFocus(props: Props) {
  const { title, tiers, isEditing, onTitleChange, onTierChange, onTierFeatureChange, onAddTierFeature, onRemoveTierFeature, onAddTier, onRemoveTier } = props;
  const { theme, accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const accentColor = accent || "#e879a6";
  if (tiers.length === 0 && !isEditing) return null;

  // VIP — это либо явно популярный, либо первый
  const popularIndex = tiers.findIndex((t) => t.is_popular);
  const heroIndex = popularIndex >= 0 ? popularIndex : 0;
  const sideTiers = tiers.map((t, i) => ({ tier: t, originalIndex: i })).filter(({ originalIndex }) => originalIndex !== heroIndex);
  const heroTier = tiers[heroIndex];

  return (
    <section className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className="landing-heading text-3xl md:text-4xl font-bold mb-12 text-center outline-none"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-3xl md:text-4xl font-bold mb-12 text-center ${skin.sectionTitle}`}>{title}</h2>
        )}

        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
          {/* HERO TIER */}
          <div className={`relative group p-8 ${radiusCardClass[theme.radius]} text-white overflow-hidden`}
            style={{
              background: `linear-gradient(135deg, ${accentColor} 0%, #be185d 100%)`,
              boxShadow: `0 30px 60px -20px ${accentColor}77`,
            }}>
            <div className="absolute top-4 right-4 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 bg-white/20 backdrop-blur rounded-full">
              <Crown className="w-3 h-3" /> VIP
            </div>
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-white/10 blur-3xl" />

            <div className="relative">
              {isEditing ? (
                <h3 contentEditable suppressContentEditableWarning className="landing-heading text-3xl font-bold mb-3 outline-none"
                  onBlur={(e) => onTierChange?.(heroIndex, "name", e.currentTarget.textContent || "")}>{heroTier.name}</h3>
              ) : (
                <h3 className="landing-heading text-3xl font-bold mb-3">{heroTier.name}</h3>
              )}
              {isEditing ? (
                <input type="number" value={heroTier.price} onChange={(e) => onTierChange?.(heroIndex, "price", Number(e.target.value))}
                  className="text-5xl font-extrabold mb-6 bg-transparent outline-none border-b border-white/40 w-full" />
              ) : (
                <p className="text-5xl font-extrabold mb-6">
                  {heroTier.price > 0 ? `${heroTier.price.toLocaleString("ru-RU")} ₽` : "Бесплатно"}
                </p>
              )}

              <ul className="space-y-3">
                {heroTier.features.map((f, fi) => (
                  <li key={fi} className="flex items-start gap-3 group/feat">
                    <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center mt-0.5 shrink-0">
                      <Check className="w-3 h-3" />
                    </div>
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-1">
                        <span contentEditable suppressContentEditableWarning className="flex-1 outline-none"
                          onBlur={(e) => onTierFeatureChange?.(heroIndex, fi, e.currentTarget.textContent || "")}>{f}</span>
                        <button onClick={() => onRemoveTierFeature?.(heroIndex, fi)} className="opacity-0 group-hover/feat:opacity-100 text-white/70">✕</button>
                      </div>
                    ) : (
                      <span>{f}</span>
                    )}
                  </li>
                ))}
              </ul>
              {isEditing && (
                <button onClick={() => onAddTierFeature?.(heroIndex)} className="mt-3 text-xs underline opacity-80">+ пункт</button>
              )}
            </div>
            {isEditing && (
              <button onClick={() => onRemoveTier?.(heroIndex)} className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 text-white/80">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* SIDE TIERS */}
          <div className="grid gap-5">
            {sideTiers.map(({ tier, originalIndex }) => (
              <div key={originalIndex}
                className={`relative group p-6 bg-white border ${radiusCardClass[theme.radius]} shadow-lg`}
                style={{ borderColor: `${accentColor}33` }}>
                {isEditing ? (
                  <h3 contentEditable suppressContentEditableWarning className="landing-heading text-lg font-bold mb-2 outline-none"
                    onBlur={(e) => onTierChange?.(originalIndex, "name", e.currentTarget.textContent || "")}>{tier.name}</h3>
                ) : (
                  <h3 className="landing-heading text-lg font-bold mb-2">{tier.name}</h3>
                )}
                {isEditing ? (
                  <input type="number" value={tier.price} onChange={(e) => onTierChange?.(originalIndex, "price", Number(e.target.value))}
                    className="text-2xl font-bold mb-3 bg-transparent outline-none border-b border-dashed w-full" />
                ) : (
                  <p className="text-2xl font-bold mb-3" style={{ color: accentColor }}>
                    {tier.price > 0 ? `${tier.price.toLocaleString("ru-RU")} ₽` : "Бесплатно"}
                  </p>
                )}
                <ul className="space-y-1.5">
                  {tier.features.slice(0, 4).map((f, fi) => (
                    <li key={fi} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: accentColor }} />
                      {isEditing ? (
                        <span contentEditable suppressContentEditableWarning className="outline-none"
                          onBlur={(e) => onTierFeatureChange?.(originalIndex, fi, e.currentTarget.textContent || "")}>{f}</span>
                      ) : <span>{f}</span>}
                    </li>
                  ))}
                  {tier.features.length > 4 && <li className="text-xs italic" style={{ color: accentColor }}>+ ещё {tier.features.length - 4}</li>}
                </ul>
                {isEditing && (
                  <button onClick={() => onRemoveTier?.(originalIndex)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {isEditing && tiers.length < 4 && (
          <div className="text-center mt-6">
            <button onClick={onAddTier} className="text-sm text-primary hover:underline">+ Добавить тариф</button>
          </div>
        )}
      </div>
    </section>
  );
}
