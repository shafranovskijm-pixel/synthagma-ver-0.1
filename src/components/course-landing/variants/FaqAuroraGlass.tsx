import { Trash2, Plus, Minus } from "lucide-react";
import { useState } from "react";
import { useLandingTheme } from "../LandingThemeProvider";

interface FaqItem { question: string; answer: string; }
interface Props {
  title: string;
  items: FaqItem[];
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onItemChange?: (index: number, field: keyof FaqItem, value: string) => void;
  onAddItem?: () => void;
  onRemoveItem?: (index: number) => void;
}

/**
 * FAQ «Aurora Glass» — стеклянные строки на тёмном фоне со светящейся
 * активной линией, мягкое раскрытие, premium-эстетика. Только для Aurora.
 */
export function FaqAuroraGlass({ title, items, isEditing, onTitleChange, onItemChange, onAddItem, onRemoveItem }: Props) {
  const { accent } = useLandingTheme();
  const accentColor = accent || "#22b8a6";
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  if (items.length === 0 && !isEditing) return null;

  return (
    <section className="relative py-24 px-6 overflow-hidden bg-gradient-to-b from-[#070f15] via-[#0a1820] to-[#070f15] text-white">
      {/* Glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full blur-3xl opacity-25"
        style={{ background: `radial-gradient(ellipse, ${accentColor}, transparent 70%)` }}
      />

      <div className="max-w-3xl mx-auto relative">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.2em] mb-4"
            style={{ background: `${accentColor}22`, color: accentColor, border: `1px solid ${accentColor}55` }}>
            ◆ Частые вопросы
          </div>
          {isEditing ? (
            <h2 contentEditable suppressContentEditableWarning
              className="landing-heading text-4xl md:text-5xl font-bold outline-none tpl-aurora-section-title"
              onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
          ) : (
            <h2 className="landing-heading text-4xl md:text-5xl font-bold tpl-aurora-section-title">{title}</h2>
          )}
        </div>

        <div className="space-y-3">
          {items.map((item, i) => {
            const isOpen = openIndex === i || isEditing;
            return (
              <div
                key={i}
                className="relative group rounded-2xl overflow-hidden transition-all"
                style={{
                  background: isOpen
                    ? `linear-gradient(135deg, ${accentColor}1a, rgba(255,255,255,0.04))`
                    : "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
                  border: `1px solid ${isOpen ? `${accentColor}66` : "rgba(255,255,255,0.08)"}`,
                  backdropFilter: "blur(14px)",
                  WebkitBackdropFilter: "blur(14px)",
                  boxShadow: isOpen ? `0 0 30px ${accentColor}33, inset 0 1px 0 rgba(255,255,255,0.08)` : "none",
                }}
              >
                {/* Top glowing line when active */}
                {isOpen && (
                  <div
                    aria-hidden
                    className="absolute top-0 left-0 right-0 h-px"
                    style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
                  />
                )}

                {isEditing && (
                  <button onClick={() => onRemoveItem?.(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-red-400 z-10">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                <button
                  className="w-full flex items-center gap-4 p-5 lg:p-6 text-left"
                  onClick={() => !isEditing && setOpenIndex(isOpen ? null : i)}
                >
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all"
                    style={{
                      background: isOpen ? accentColor : `${accentColor}22`,
                      border: `1px solid ${accentColor}55`,
                      boxShadow: isOpen ? `0 0 16px ${accentColor}88` : "none",
                    }}
                  >
                    {isOpen ? <Minus className="w-4 h-4 text-white" /> : <Plus className="w-4 h-4" style={{ color: accentColor }} />}
                  </span>

                  {isEditing ? (
                    <span
                      contentEditable suppressContentEditableWarning
                      className="flex-1 outline-none font-semibold text-white text-base"
                      onBlur={(e) => { e.stopPropagation(); onItemChange?.(i, "question", e.currentTarget.textContent || ""); }}
                      onClick={(e) => e.stopPropagation()}
                    >{item.question}</span>
                  ) : (
                    <span className="flex-1 font-semibold text-white text-base">{item.question}</span>
                  )}
                </button>

                {isOpen && (
                  <div
                    className="px-5 pb-5 lg:px-6 lg:pb-6 pl-[4.5rem] lg:pl-[4.75rem] -mt-1 animate-fade-in"
                  >
                    {isEditing ? (
                      <p
                        contentEditable suppressContentEditableWarning
                        className="text-sm text-white/70 outline-none min-h-[40px] leading-relaxed"
                        onBlur={(e) => onItemChange?.(i, "answer", e.currentTarget.textContent || "")}
                      >{item.answer}</p>
                    ) : (
                      <p className="text-sm text-white/70 leading-relaxed">{item.answer}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && (
          <button onClick={onAddItem} className="mt-5 text-sm" style={{ color: accentColor }}>
            + Добавить вопрос
          </button>
        )}
      </div>
    </section>
  );
}
