import { Trash2 } from "lucide-react";
import type { LearnVariantProps } from "./types";

/**
 * LAB — терминальная панель: тёмный фон, моноширинный шрифт, каждая строка
 * как `[01] feature_name() // description`. Подходит к IT-эстетике курсов
 * программирования.
 */
export function LearnLabTerminal({
  title, description, items, isEditing,
  onTitleChange, onDescriptionChange, onItemChange, onAddItem, onRemoveItem,
}: LearnVariantProps) {
  if (items.length === 0 && !isEditing) return null;

  return (
    <section className="py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          {isEditing ? (
            <h2 contentEditable suppressContentEditableWarning
              className="text-2xl md:text-3xl font-bold outline-none mb-3"
              style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: "#d4e4ff" }}
              onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
          ) : (
            <h2 className="tpl-lab-section-title text-2xl md:text-3xl font-bold mb-3">{title}</h2>
          )}
          {(description || isEditing) && (
            isEditing ? (
              <p contentEditable suppressContentEditableWarning className="text-muted-foreground outline-none"
                style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                onBlur={(e) => onDescriptionChange?.(e.currentTarget.textContent || "")}>{description}</p>
            ) : (
              <p className="text-zinc-400" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                <span className="text-zinc-600">// </span>{description}
              </p>
            )
          )}
        </div>

        <div className="bg-[#0d1117] border border-cyan-500/25 rounded-md overflow-hidden shadow-[0_0_40px_-10px_rgba(34,211,238,.3)]">
          {/* Заголовок терминала */}
          <div className="flex items-center gap-2 px-4 py-3 bg-[#161b22] border-b border-cyan-500/15">
            <span className="w-3 h-3 rounded-full bg-red-500/70" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <span className="w-3 h-3 rounded-full bg-green-500/70" />
            <span className="ml-3 text-xs text-zinc-500 font-mono">~/course/skills.md</span>
          </div>

          <div className="p-6 font-mono text-sm space-y-4">
            {items.map((item, i) => (
              <div key={i} className="group relative grid grid-cols-[auto_1fr] gap-4">
                <span className="text-cyan-400 select-none">[{String(i + 1).padStart(2, "0")}]</span>
                <div>
                  {isEditing ? (
                    <h3 contentEditable suppressContentEditableWarning className="text-emerald-400 font-bold outline-none"
                      onBlur={(e) => onItemChange?.(i, "title", e.currentTarget.textContent || "")}>{item.title}</h3>
                  ) : (
                    <h3 className="text-emerald-400 font-bold">
                      {item.title.toLowerCase().replace(/\s+/g, "_")}
                      <span className="text-zinc-500">()</span>
                    </h3>
                  )}
                  {isEditing ? (
                    <p contentEditable suppressContentEditableWarning className="text-zinc-300 outline-none mt-1"
                      onBlur={(e) => onItemChange?.(i, "description", e.currentTarget.textContent || "")}>{item.description}</p>
                  ) : (
                    <p className="text-zinc-400 mt-1"><span className="text-zinc-600">// </span>{item.description}</p>
                  )}
                </div>
                {isEditing && (
                  <button onClick={() => onRemoveItem?.(i)} className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <div className="text-zinc-600">
              <span className="text-emerald-400">$</span> _<span className="animate-pulse">|</span>
            </div>
          </div>
        </div>

        {isEditing && <button onClick={onAddItem} className="mt-4 text-sm text-cyan-400 hover:underline font-mono">+ append_skill()</button>}
      </div>
    </section>
  );
}
