import { Trash2, Check, Minus } from "lucide-react";
import { useLandingTheme } from "../LandingThemeProvider";
import { radiusCardClass, radiusButtonClass } from "@/lib/landing-templates/themeTokens";
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
 * Pricing «Comparison» — таблица сравнения. Каждая строка — фича,
 * галочки в столбцах тарифов. Подходит для корпоративных/safety шаблонов.
 *
 * Логика заполнения: показываем максимальный набор features из всех тарифов,
 * галочка ставится, если строка содержится в features конкретного тарифа.
 */
export function PricingComparison(props: Props) {
  const { title, tiers, isEditing, onTitleChange, onTierChange, onTierFeatureChange, onAddTierFeature, onRemoveTierFeature, onAddTier, onRemoveTier } = props;
  const { theme, accent } = useLandingTheme();
  if (tiers.length === 0 && !isEditing) return null;
  const accentColor = accent || "hsl(var(--primary))";

  // Все фичи из всех тарифов (без дубликатов, в порядке появления)
  const allFeatures: string[] = [];
  tiers.forEach((t) => t.features.forEach((f) => { if (!allFeatures.includes(f)) allFeatures.push(f); }));

  return (
    <section className="py-16 px-6">
      <div className="max-w-6xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className="landing-heading text-2xl md:text-3xl font-bold mb-10 text-center outline-none"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}
          >{title}</h2>
        ) : (
          <h2 className="landing-heading text-2xl md:text-3xl font-bold mb-10 text-center">{title}</h2>
        )}

        {/* Desktop: таблица. Mobile: карточки (резерв). */}
        <div className={`hidden md:block overflow-hidden border border-border ${radiusCardClass[theme.radius]}`}>
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left p-5 font-semibold text-sm text-muted-foreground">Что входит</th>
                {tiers.map((tier, i) => (
                  <th key={i} className="p-5 text-center align-bottom relative" style={tier.is_popular ? { background: `${accentColor}10` } : undefined}>
                    {tier.is_popular && (
                      <span className={`absolute -top-0 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 ${radiusButtonClass[theme.radius]}`}
                        style={{ background: accentColor, color: "white" }}>★</span>
                    )}
                    <div className="landing-heading text-lg font-bold mb-1">
                      {isEditing ? (
                        <span contentEditable suppressContentEditableWarning className="outline-none"
                          onBlur={(e) => onTierChange?.(i, "name", e.currentTarget.textContent || "")}>{tier.name}</span>
                      ) : tier.name}
                    </div>
                    <div className="text-2xl font-extrabold" style={{ color: accentColor }}>
                      {isEditing ? (
                        <input type="number" value={tier.price} onChange={(e) => onTierChange?.(i, "price", Number(e.target.value))}
                          className="text-2xl font-extrabold w-24 bg-transparent outline-none border-b border-dashed text-center" />
                      ) : (
                        tier.price > 0 ? `${tier.price.toLocaleString("ru-RU")} ₽` : "0 ₽"
                      )}
                    </div>
                    {isEditing && (
                      <div className="mt-2 flex flex-col items-center gap-1">
                        <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <input type="checkbox" checked={tier.is_popular} onChange={(e) => onTierChange?.(i, "is_popular", e.target.checked)} />
                          ★
                        </label>
                        <button onClick={() => onRemoveTier?.(i)} className="text-destructive text-xs"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allFeatures.map((feature, fi) => (
                <tr key={fi} className="border-t border-border group/row">
                  <td className="p-4 text-sm">
                    {isEditing ? (
                      <span contentEditable suppressContentEditableWarning className="outline-none"
                        onBlur={(e) => {
                          // Обновим везде, где встречается эта фича
                          tiers.forEach((t, ti) => {
                            const idx = t.features.indexOf(feature);
                            if (idx >= 0) onTierFeatureChange?.(ti, idx, e.currentTarget.textContent || "");
                          });
                        }}>{feature}</span>
                    ) : feature}
                  </td>
                  {tiers.map((tier, ti) => {
                    const has = tier.features.includes(feature);
                    return (
                      <td key={ti} className="p-4 text-center" style={tier.is_popular ? { background: `${accentColor}06` } : undefined}>
                        {has ? (
                          <Check className="w-5 h-5 mx-auto" style={{ color: accentColor }} />
                        ) : (
                          <Minus className="w-5 h-5 mx-auto text-muted-foreground/30" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {isEditing && (
                <tr className="border-t border-border">
                  <td colSpan={tiers.length + 1} className="p-3 text-center">
                    <button onClick={() => onAddTierFeature?.(0)} className="text-xs text-primary hover:underline">+ Добавить пункт сравнения (в первый тариф)</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile fallback: cards */}
        <div className="md:hidden grid gap-5">
          {tiers.map((tier, i) => (
            <div key={i} className={`p-5 ${radiusCardClass[theme.radius]} border border-border bg-card`}
              style={tier.is_popular ? { borderColor: accentColor } : undefined}>
              <h3 className="landing-heading text-lg font-bold mb-1">{tier.name}</h3>
              <p className="text-2xl font-extrabold mb-4" style={{ color: accentColor }}>{tier.price > 0 ? `${tier.price.toLocaleString("ru-RU")} ₽` : "Бесплатно"}</p>
              <ul className="space-y-1.5">
                {tier.features.map((f, fi) => (
                  <li key={fi} className="flex gap-2 text-sm"><Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: accentColor }} /><span>{f}</span></li>
                ))}
              </ul>
            </div>
          ))}
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
