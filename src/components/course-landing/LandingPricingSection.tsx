import { Trash2, Check } from "lucide-react";

export interface PricingTier {
  name: string;
  price: number;
  features: string[];
  is_popular: boolean;
}

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

export function LandingPricingSection({
  title, tiers, isEditing, onTitleChange, onTierChange,
  onTierFeatureChange, onAddTierFeature, onRemoveTierFeature, onAddTier, onRemoveTier,
}: Props) {
  if (tiers.length === 0 && !isEditing) return null;

  return (
    <section className="py-16 px-6">
      <div className="max-w-5xl mx-auto">
        {isEditing ? (
          <h2
            contentEditable suppressContentEditableWarning
            className="text-2xl md:text-3xl font-bold mb-8 text-center outline-none border-b-2 border-dashed border-muted-foreground/20 focus:border-primary/40"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}
          >{title}</h2>
        ) : (
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center">{title}</h2>
        )}

        <div className={`grid gap-6 ${tiers.length === 1 ? "max-w-md mx-auto" : tiers.length === 2 ? "sm:grid-cols-2 max-w-2xl mx-auto" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
          {tiers.map((tier, i) => (
            <div
              key={i}
              className={`relative p-6 rounded-2xl border-2 group ${tier.is_popular ? "border-primary bg-primary/5" : "border-border bg-card"}`}
            >
              {isEditing && (
                <button onClick={() => onRemoveTier?.(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-destructive transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              {tier.is_popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">
                  Популярный
                </span>
              )}

              {/* Name */}
              {isEditing ? (
                <h3
                  contentEditable suppressContentEditableWarning
                  className="text-lg font-bold mb-2 outline-none border-b border-dashed border-transparent focus:border-primary/40"
                  onBlur={(e) => onTierChange?.(i, "name", e.currentTarget.textContent || "")}
                >{tier.name}</h3>
              ) : (
                <h3 className="text-lg font-bold mb-2">{tier.name}</h3>
              )}

              {/* Price */}
              {isEditing ? (
                <div className="mb-4">
                  <input
                    type="number"
                    value={tier.price}
                    onChange={(e) => onTierChange?.(i, "price", Number(e.target.value))}
                    className="text-3xl font-bold w-full bg-transparent outline-none border-b border-dashed border-muted-foreground/20 focus:border-primary/40"
                  />
                  <span className="text-muted-foreground text-sm"> ₽</span>
                </div>
              ) : (
                <p className="text-3xl font-bold mb-4">
                  {tier.price > 0 ? `${tier.price.toLocaleString("ru-RU")} ₽` : "Бесплатно"}
                </p>
              )}

              {isEditing && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tier.is_popular}
                    onChange={(e) => onTierChange?.(i, "is_popular", e.target.checked)}
                    className="rounded"
                  />
                  Популярный
                </label>
              )}

              {/* Features */}
              <ul className="space-y-2">
                {tier.features.map((f, fi) => (
                  <li key={fi} className="flex items-start gap-2 text-sm group/feat">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-1">
                        <span
                          contentEditable suppressContentEditableWarning
                          className="flex-1 outline-none border-b border-dashed border-transparent focus:border-primary/40"
                          onBlur={(e) => onTierFeatureChange?.(i, fi, e.currentTarget.textContent || "")}
                        >{f}</span>
                        <button
                          onClick={() => onRemoveTierFeature?.(i, fi)}
                          className="opacity-0 group-hover/feat:opacity-100 text-destructive text-xs"
                        >✕</button>
                      </div>
                    ) : (
                      <span>{f}</span>
                    )}
                  </li>
                ))}
              </ul>

              {isEditing && (
                <button onClick={() => onAddTierFeature?.(i)} className="mt-2 text-xs text-primary hover:underline">
                  + пункт
                </button>
              )}
            </div>
          ))}
        </div>

        {isEditing && tiers.length < 4 && (
          <div className="text-center mt-6">
            <button onClick={onAddTier} className="text-sm text-primary hover:underline">
              + Добавить тариф
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
