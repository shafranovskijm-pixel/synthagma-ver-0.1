import { Check, Trash2 } from "lucide-react";
import type { LearnVariantProps } from "./types";

/**
 * SAFETY — вертикальный «чек-лист с печатями». Каждый пункт — строка
 * официального бланка: галочка в круге слева, подпись справа, тонкая линия
 * снизу. Подходит к корпоративной/нормативной эстетике курсов охраны труда.
 */
export function LearnSafetyChecklist({
  title, description, items, isEditing,
  onTitleChange, onDescriptionChange, onItemChange, onAddItem, onRemoveItem,
}: LearnVariantProps) {
  if (items.length === 0 && !isEditing) return null;

  return (
    <section className="py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="border-l-4 border-[#1e3a8a] pl-6 mb-10">
          {isEditing ? (
            <h2 contentEditable suppressContentEditableWarning
              className="landing-heading text-2xl md:text-3xl font-bold uppercase tracking-wide mb-3 outline-none"
              onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
          ) : (
            <h2 className="landing-heading text-2xl md:text-3xl font-bold uppercase tracking-wide mb-3">{title}</h2>
          )}
          {(description || isEditing) && (
            isEditing ? (
              <p contentEditable suppressContentEditableWarning className="text-muted-foreground outline-none"
                onBlur={(e) => onDescriptionChange?.(e.currentTarget.textContent || "")}>{description}</p>
            ) : (
              <p className="text-muted-foreground">{description}</p>
            )
          )}
        </div>

        <div className="bg-white border-2 border-[#1e3a8a] divide-y divide-[#1e3a8a]/20">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-5 p-5 group relative">
              <div className="shrink-0 w-10 h-10 border-2 border-[#1e3a8a] flex items-center justify-center">
                <Check className="w-5 h-5 text-[#1e3a8a]" strokeWidth={3} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-3 mb-1">
                  <span className="text-xs font-mono font-bold text-[#1e3a8a] tracking-wider">
                    {String(i + 1).padStart(2, "0")}.
                  </span>
                  {isEditing ? (
                    <h3 contentEditable suppressContentEditableWarning className="font-bold uppercase outline-none flex-1"
                      onBlur={(e) => onItemChange?.(i, "title", e.currentTarget.textContent || "")}>{item.title}</h3>
                  ) : (
                    <h3 className="font-bold uppercase tracking-wide">{item.title}</h3>
                  )}
                </div>
                {isEditing ? (
                  <p contentEditable suppressContentEditableWarning className="text-sm text-muted-foreground pl-8 outline-none"
                    onBlur={(e) => onItemChange?.(i, "description", e.currentTarget.textContent || "")}>{item.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground pl-8">{item.description}</p>
                )}
              </div>
              {isEditing && (
                <button onClick={() => onRemoveItem?.(i)} className="opacity-0 group-hover:opacity-100 text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {isEditing && <button onClick={onAddItem} className="mt-6 text-sm text-primary hover:underline">+ Добавить пункт</button>}
      </div>
    </section>
  );
}
