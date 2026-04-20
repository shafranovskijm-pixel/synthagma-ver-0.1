import { Trash2, Check } from "lucide-react";
import { useLandingTheme, useTemplateStyle } from "../LandingThemeProvider";
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
 * Pricing «Language Levels» — тарифы как уровни CEFR (A1/B1/C1) с прогресс-баром.
 * Бумажная стилистика, серифный шрифт. Для Language.
 */
export function PricingLanguageLevels(props: Props) {
  const { title, tiers, isEditing, onTitleChange, onTierChange, onTierFeatureChange, onAddTierFeature, onRemoveTierFeature, onAddTier, onRemoveTier } = props;
  const { accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const accentColor = accent || "#b45309";
  if (tiers.length === 0 && !isEditing) return null;

  const levels = ["A1 · Начальный", "B1 · Уверенный", "C1 · Продвинутый", "C2 · Носитель"];
  const fills = [40, 70, 92, 100];

  return (
    <section className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className="landing-heading text-3xl md:text-4xl font-bold mb-3 text-center outline-none"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-3xl md:text-4xl font-bold mb-3 text-center ${skin.sectionTitle}`}>{title}</h2>
        )}
        <p className="text-center text-muted-foreground italic mb-12">— выберите уровень, к которому хотите дойти —</p>

        <div className="grid md:grid-cols-3 gap-7">
          {tiers.map((tier, i) => {
            const level = levels[i] || `C${i + 1}`;
            const fill = fills[i] || 100;
            return (
              <div key={i}
                className="relative group bg-[#fffdf7] border-2 p-6 transition-transform duration-300 hover:-translate-y-2"
                style={{
                  borderColor: tier.is_popular ? accentColor : `${accentColor}33`,
                  backgroundImage: "repeating-linear-gradient(0deg, transparent 0 28px, rgba(180,120,80,.08) 28px 29px)",
                  boxShadow: tier.is_popular
                    ? `0 20px 40px -20px ${accentColor}77`
                    : `0 8px 20px -10px rgba(120,80,40,.25)`,
                }}
              >
                {/* Уголок */}
                <div className="absolute top-0 right-0 w-10 h-10" style={{ background: `linear-gradient(225deg, ${accentColor} 0 50%, transparent 50%)` }} />

                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: accentColor }}>уровень CEFR</div>
                <div className="text-xs italic mb-4" style={{ color: "#5a3a20" }}>{level}</div>

                {isEditing ? (
                  <h3 contentEditable suppressContentEditableWarning className="landing-heading text-2xl font-bold mb-2 outline-none"
                    style={{ color: "#3a2614" }}
                    onBlur={(e) => onTierChange?.(i, "name", e.currentTarget.textContent || "")}>{tier.name}</h3>
                ) : (
                  <h3 className="landing-heading text-2xl font-bold mb-2" style={{ color: "#3a2614" }}>{tier.name}</h3>
                )}

                {isEditing ? (
                  <div className="mb-4">
                    <input type="number" value={tier.price} onChange={(e) => onTierChange?.(i, "price", Number(e.target.value))}
                      className="text-3xl font-extrabold w-full bg-transparent outline-none border-b border-dashed" />
                  </div>
                ) : (
                  <p className="text-3xl font-extrabold mb-4" style={{ color: accentColor }}>
                    {tier.price > 0 ? `${tier.price.toLocaleString("ru-RU")} ₽` : "Бесплатно"}
                  </p>
                )}

                {/* Прогресс-бар уровня */}
                <div className="mb-5">
                  <div className="h-2 rounded-full bg-[#d4a57433] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${fill}%`, background: `linear-gradient(90deg, ${accentColor}aa, ${accentColor})` }} />
                  </div>
                  <div className="flex justify-between text-[10px] mt-1 font-mono" style={{ color: `${accentColor}cc` }}>
                    <span>0%</span><span>{fill}%</span>
                  </div>
                </div>

                {isEditing && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground mb-3 cursor-pointer">
                    <input type="checkbox" checked={tier.is_popular} onChange={(e) => onTierChange?.(i, "is_popular", e.target.checked)} />
                    Популярный
                  </label>
                )}

                <ul className="space-y-2">
                  {tier.features.map((f, fi) => (
                    <li key={fi} className="flex items-start gap-2 text-sm group/feat italic" style={{ color: "#3a2614cc" }}>
                      <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: accentColor }} />
                      {isEditing ? (
                        <div className="flex-1 flex items-center gap-1">
                          <span contentEditable suppressContentEditableWarning className="flex-1 outline-none"
                            onBlur={(e) => onTierFeatureChange?.(i, fi, e.currentTarget.textContent || "")}>{f}</span>
                          <button onClick={() => onRemoveTierFeature?.(i, fi)} className="opacity-0 group-hover/feat:opacity-100 text-destructive">✕</button>
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

                {isEditing && (
                  <button onClick={() => onRemoveTier?.(i)} className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && tiers.length < 4 && (
          <div className="text-center mt-6">
            <button onClick={onAddTier} className="text-sm text-primary hover:underline">+ Добавить уровень</button>
          </div>
        )}
      </div>
    </section>
  );
}
