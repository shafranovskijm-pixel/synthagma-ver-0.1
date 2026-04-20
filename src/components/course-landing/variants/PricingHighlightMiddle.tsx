import { Trash2, Check, Sparkles } from "lucide-react";
import { useLandingTheme } from "../LandingThemeProvider";
import { cardStyleClass, radiusCardClass, radiusButtonClass } from "@/lib/landing-templates/themeTokens";
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
 * Pricing «Highlight Middle» — средний тариф крупнее, выше остальных,
 * с градиентной рамкой и приподнятым позиционированием.
 */
export function PricingHighlightMiddle(props: Props) {
  const { title, tiers, isEditing, onTitleChange, onTierChange, onTierFeatureChange, onAddTierFeature, onRemoveTierFeature, onAddTier, onRemoveTier } = props;
  const { theme, accent } = useLandingTheme();
  if (tiers.length === 0 && !isEditing) return null;
  const accentColor = accent || "hsl(var(--primary))";

  // Если "popular" не задан явно — по умолчанию выделяем средний.
  const popularIndex = tiers.findIndex((t) => t.is_popular);
  const highlightIndex = popularIndex >= 0 ? popularIndex : Math.floor(tiers.length / 2);

  return (
    <section className="py-20 px-6 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1/2" style={{ background: `linear-gradient(180deg, ${accentColor}08 0%, transparent 100%)` }} />
      <div className="max-w-6xl mx-auto relative">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className="landing-heading text-3xl md:text-4xl font-bold mb-12 text-center outline-none"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}
          >{title}</h2>
        ) : (
          <h2 className="landing-heading text-3xl md:text-4xl font-bold mb-12 text-center">{title}</h2>
        )}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 items-center">
          {tiers.map((tier, i) => {
            const isHighlight = i === highlightIndex;
            return (
              <div
                key={i}
                className={`relative p-7 group ${radiusCardClass[theme.radius]} ${cardStyleClass[theme.card_style]} transition-transform`}
                style={
                  isHighlight
                    ? {
                        transform: "scale(1.06)",
                        background: `linear-gradient(180deg, ${accentColor}10 0%, transparent 100%)`,
                        borderColor: accentColor,
                        borderWidth: "2px",
                        boxShadow: `0 25px 60px -20px ${accentColor}55`,
                        zIndex: 1,
                      }
                    : undefined
                }
              >
                {isEditing && (
                  <button onClick={() => onRemoveTier?.(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-destructive transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                {isHighlight && (
                  <span className={`absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 flex items-center gap-1 ${radiusButtonClass[theme.radius]}`}
                    style={{ background: accentColor, color: "white" }}>
                    <Sparkles className="w-3 h-3" /> Лучший выбор
                  </span>
                )}
                {isEditing ? (
                  <h3 contentEditable suppressContentEditableWarning className="landing-heading text-xl font-bold mb-3 outline-none"
                    onBlur={(e) => onTierChange?.(i, "name", e.currentTarget.textContent || "")}>{tier.name}</h3>
                ) : (
                  <h3 className="landing-heading text-xl font-bold mb-3">{tier.name}</h3>
                )}
                {isEditing ? (
                  <div className="mb-5">
                    <input type="number" value={tier.price} onChange={(e) => onTierChange?.(i, "price", Number(e.target.value))}
                      className={`${isHighlight ? "text-5xl" : "text-4xl"} font-extrabold w-full bg-transparent outline-none border-b border-dashed border-muted-foreground/20`} />
                    <span className="text-muted-foreground text-sm"> ₽</span>
                  </div>
                ) : (
                  <p className={`${isHighlight ? "text-5xl" : "text-4xl"} font-extrabold mb-5`} style={isHighlight ? { color: accentColor } : undefined}>
                    {tier.price > 0 ? `${tier.price.toLocaleString("ru-RU")} ₽` : "Бесплатно"}
                  </p>
                )}
                {isEditing && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground mb-3 cursor-pointer">
                    <input type="checkbox" checked={tier.is_popular} onChange={(e) => onTierChange?.(i, "is_popular", e.target.checked)} className="rounded" />
                    Популярный
                  </label>
                )}
                <ul className="space-y-2.5">
                  {tier.features.map((f, fi) => (
                    <li key={fi} className="flex items-start gap-2 text-sm group/feat">
                      <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: accentColor }} />
                      {isEditing ? (
                        <div className="flex-1 flex items-center gap-1">
                          <span contentEditable suppressContentEditableWarning className="flex-1 outline-none"
                            onBlur={(e) => onTierFeatureChange?.(i, fi, e.currentTarget.textContent || "")}>{f}</span>
                          <button onClick={() => onRemoveTierFeature?.(i, fi)} className="opacity-0 group-hover/feat:opacity-100 text-destructive text-xs">✕</button>
                        </div>
                      ) : (
                        <span>{f}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {isEditing && (
                  <button onClick={() => onAddTierFeature?.(i)} className="mt-3 text-xs text-primary hover:underline">+ пункт</button>
                )}
              </div>
            );
          })}
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
