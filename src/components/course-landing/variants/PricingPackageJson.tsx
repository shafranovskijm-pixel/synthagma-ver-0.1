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
 * Pricing «package.json» — тарифы как блоки JSON в стиле dev dashboard.
 * Тёмные карточки, моноширинный шрифт, синтаксические подсветка ключей и значений. Для Lab.
 */
export function PricingPackageJson(props: Props) {
  const { title, tiers, isEditing, onTitleChange, onTierChange, onTierFeatureChange, onAddTierFeature, onRemoveTierFeature, onAddTier, onRemoveTier } = props;
  const { accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const accentColor = accent || "#22d3ee";
  if (tiers.length === 0 && !isEditing) return null;

  return (
    <section className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className="landing-heading text-2xl md:text-3xl font-bold mb-3 outline-none"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-2xl md:text-3xl font-bold mb-3 ${skin.sectionTitle}`}>
            <span className="text-cyan-400 font-mono">{"// "}</span>{title}
          </h2>
        )}
        <p className="font-mono text-xs text-zinc-500 mb-10">$ npm view pricing --json</p>

        <div className="grid md:grid-cols-3 gap-5">
          {tiers.map((tier, i) => {
            const slug = tier.name.toLowerCase().replace(/\s+/g, "-");
            return (
              <div key={i}
                className="relative group bg-zinc-950 border border-cyan-500/30 p-5 font-mono text-xs"
                style={tier.is_popular
                  ? { boxShadow: `0 0 0 1px ${accentColor}, 0 25px 50px -25px ${accentColor}99`, borderColor: accentColor }
                  : { boxShadow: `0 10px 30px -15px ${accentColor}33` }}
              >
                {/* Title bar */}
                <div className="flex items-center gap-2 -mx-5 -mt-5 mb-4 px-4 py-2 border-b border-cyan-500/20 bg-black/40">
                  <span className="w-2 h-2 rounded-full bg-red-500/70" />
                  <span className="w-2 h-2 rounded-full bg-yellow-500/70" />
                  <span className="w-2 h-2 rounded-full bg-green-500/70" />
                  <span className="ml-2 text-cyan-300/70 truncate">package.json · {slug}</span>
                  {tier.is_popular && <span className="ml-auto text-[9px] uppercase font-bold px-1.5 py-0.5" style={{ background: accentColor, color: "#0a0a0a" }}>recommended</span>}
                </div>

                <div className="text-zinc-400 leading-relaxed">
                  <div>{"{"}</div>
                  <div className="pl-3">
                    <span className="text-purple-400">"name"</span>
                    <span className="text-zinc-500">: </span>
                    {isEditing ? (
                      <span contentEditable suppressContentEditableWarning className="outline-none" style={{ color: accentColor }}
                        onBlur={(e) => onTierChange?.(i, "name", e.currentTarget.textContent || "")}>"{tier.name}"</span>
                    ) : (
                      <span style={{ color: accentColor }}>"{tier.name}"</span>
                    )},
                  </div>
                  <div className="pl-3">
                    <span className="text-purple-400">"price"</span>
                    <span className="text-zinc-500">: </span>
                    {isEditing ? (
                      <input type="number" value={tier.price} onChange={(e) => onTierChange?.(i, "price", Number(e.target.value))}
                        className="bg-transparent outline-none border-b border-dashed border-cyan-500/40 w-20 text-amber-300" />
                    ) : (
                      <span className="text-amber-300">{tier.price}</span>
                    )},
                  </div>
                  <div className="pl-3">
                    <span className="text-purple-400">"currency"</span>
                    <span className="text-zinc-500">: </span><span style={{ color: accentColor }}>"RUB"</span>,
                  </div>
                  <div className="pl-3 mt-1">
                    <span className="text-purple-400">"includes"</span>
                    <span className="text-zinc-500">: [</span>
                  </div>
                  <ul className="pl-6 space-y-0.5">
                    {tier.features.map((f, fi) => (
                      <li key={fi} className="flex items-start gap-2 group/feat">
                        <Check className="w-3 h-3 mt-0.5 shrink-0" style={{ color: accentColor }} />
                        {isEditing ? (
                          <span className="flex-1 flex items-center gap-1">
                            <span contentEditable suppressContentEditableWarning className="outline-none flex-1 text-emerald-300"
                              onBlur={(e) => onTierFeatureChange?.(i, fi, e.currentTarget.textContent || "")}>"{f}"</span>
                            <button onClick={() => onRemoveTierFeature?.(i, fi)} className="opacity-0 group-hover/feat:opacity-100 text-destructive">✕</button>
                          </span>
                        ) : (
                          <span className="text-emerald-300/90">"{f}"<span className="text-zinc-500">,</span></span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {isEditing && (
                    <button onClick={() => onAddTierFeature?.(i)} className="ml-6 text-cyan-400 hover:underline">+ feature</button>
                  )}
                  <div className="pl-3"><span className="text-zinc-500">]</span></div>
                  <div>{"}"}</div>
                </div>

                {/* install.sh — псевдо-кнопка применения тарифа в стиле bash */}
                {!isEditing && (
                  <div className="mt-4 pt-3 border-t border-cyan-500/15">
                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="text-zinc-500">$</span>
                      <span className="text-cyan-300/80">./install.sh</span>
                      <span style={{ color: accentColor }}>--{slug}</span>
                      <span className="ml-auto inline-flex items-center gap-1 text-emerald-400">
                        <Check className="w-3 h-3" /> ready
                      </span>
                    </div>
                  </div>
                )}

                {isEditing && (
                  <div className="mt-3 flex items-center justify-between">
                    <label className="text-[10px] text-zinc-500 flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={tier.is_popular} onChange={(e) => onTierChange?.(i, "is_popular", e.target.checked)} />
                      recommended
                    </label>
                    <button onClick={() => onRemoveTier?.(i)} className="text-destructive opacity-50 hover:opacity-100">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && tiers.length < 4 && (
          <div className="text-center mt-6">
            <button onClick={onAddTier} className="text-sm text-cyan-400 hover:underline font-mono">+ npm init</button>
          </div>
        )}
      </div>
    </section>
  );
}
