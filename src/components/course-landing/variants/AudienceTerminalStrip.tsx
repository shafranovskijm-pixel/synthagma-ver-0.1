import { Trash2 } from "lucide-react";
import { icons } from "lucide-react";
import React, { useState } from "react";
import { IconPickerDialog } from "../IconPickerDialog";
import { useLandingTheme, useTemplateStyle } from "../LandingThemeProvider";
import { sectionSpacingClass } from "@/lib/landing-templates/themeTokens";
import type { AudienceItem } from "../LandingAudienceSection";

function toIconComponentName(kebab: string): string {
  return kebab.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

interface Props {
  title: string;
  description: string;
  items: AudienceItem[];
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onDescriptionChange?: (v: string) => void;
  onItemChange?: (index: number, field: keyof AudienceItem, value: string) => void;
  onAddItem?: () => void;
  onRemoveItem?: (index: number) => void;
}

/**
 * Audience «Terminal Strip» — горизонтальная лента карточек как окна терминала.
 * Каждая карточка = `audience@target:~$` с моноширинным заголовком. Для Lab.
 */
export function AudienceTerminalStrip({
  title, description, items, isEditing,
  onTitleChange, onDescriptionChange, onItemChange, onAddItem, onRemoveItem,
}: Props) {
  const { theme, accent } = useLandingTheme();
  const skin = useTemplateStyle();
  const [iconPicker, setIconPicker] = useState<number | null>(null);
  const accentColor = accent || "#22d3ee";

  return (
    <section className={`${sectionSpacingClass[theme.section_spacing]} px-6`}>
      <div className="max-w-6xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className={`landing-heading text-2xl md:text-3xl font-bold mb-3 outline-none ${skin.sectionTitle}`}
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-2xl md:text-3xl font-bold mb-3 ${skin.sectionTitle}`}>{title}</h2>
        )}
        {isEditing ? (
          <p contentEditable suppressContentEditableWarning
            className="text-zinc-400 mb-10 max-w-2xl outline-none font-mono text-sm"
            onBlur={(e) => onDescriptionChange?.(e.currentTarget.textContent || "")}>{description}</p>
        ) : (
          description && <p className="text-zinc-400 mb-10 max-w-2xl font-mono text-sm">// {description}</p>
        )}

        <div className="grid md:grid-cols-3 gap-5">
          {items.map((item, i) => {
            const compName = toIconComponentName(item.icon || "user");
            const IconComp = (icons as any)[compName];
            return (
              <div
                key={i}
                className="relative bg-zinc-900/80 border border-cyan-500/30 group overflow-hidden"
                style={{ boxShadow: `0 0 0 1px ${accentColor}22, 0 20px 40px -20px ${accentColor}55` }}
              >
                {/* Terminal title bar */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-cyan-500/20 bg-black/40">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                  <span className="ml-2 font-mono text-xs text-cyan-300/70 truncate">~/audience/target_{String(i + 1).padStart(2, "0")}.sh</span>
                </div>
                <div className="p-5 font-mono">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 flex items-center justify-center border border-cyan-500/40 ${isEditing ? "cursor-pointer" : ""}`}
                      style={{ background: `${accentColor}15` }}
                      onClick={() => isEditing && setIconPicker(i)}>
                      {IconComp ? React.createElement(IconComp, { className: "w-5 h-5", style: { color: accentColor } }) : <span style={{ color: accentColor }}>•</span>}
                    </div>
                    <span className="text-xs text-cyan-400/70">$ whoami</span>
                  </div>
                  {isEditing ? (
                    <h3 contentEditable suppressContentEditableWarning className="landing-heading font-bold text-base mb-2 outline-none text-cyan-100"
                      onBlur={(e) => onItemChange?.(i, "title", e.currentTarget.textContent || "")}>{item.title}</h3>
                  ) : (
                    <h3 className="landing-heading font-bold text-base mb-2 text-cyan-100">
                      <span className="text-cyan-400">{">"} </span>{item.title}
                    </h3>
                  )}
                  {isEditing ? (
                    <p contentEditable suppressContentEditableWarning className="text-xs text-zinc-400 leading-relaxed outline-none"
                      onBlur={(e) => onItemChange?.(i, "description", e.currentTarget.textContent || "")}>{item.description}</p>
                  ) : (
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      <span className="text-zinc-600"># </span>{item.description}
                    </p>
                  )}
                </div>
                {isEditing && (
                  <button onClick={() => onRemoveItem?.(i)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-destructive transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && (
          <button onClick={onAddItem} className="mt-4 text-sm text-cyan-400 hover:underline font-mono">+ ./add_target.sh</button>
        )}

        {iconPicker !== null && (
          <IconPickerDialog open onClose={() => setIconPicker(null)}
            onSelect={(name) => { onItemChange?.(iconPicker, "icon", name); setIconPicker(null); }} />
        )}
      </div>
    </section>
  );
}
