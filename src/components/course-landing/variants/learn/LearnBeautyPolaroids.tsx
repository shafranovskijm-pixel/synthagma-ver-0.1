import { Trash2 } from "lucide-react";
import type { LearnVariantProps } from "./types";

/**
 * BEAUTY — горизонтальная лента «фотокарточек-полароидов» с лёгким наклоном
 * ±2° и пастельным фоном. Подчёркивает тёплую/бьюти-эстетику.
 */
export function LearnBeautyPolaroids({
  title, description, items, isEditing,
  onTitleChange, onDescriptionChange, onItemChange, onAddItem, onRemoveItem,
}: LearnVariantProps) {
  if (items.length === 0 && !isEditing) return null;

  return (
    <section className="py-16 px-6">
      <div className="max-w-6xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className="landing-heading text-3xl md:text-4xl font-bold mb-3 outline-none"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className="landing-heading text-3xl md:text-4xl font-bold mb-3 tpl-beauty-section-title">{title}</h2>
        )}
        {(description || isEditing) && (
          isEditing ? (
            <p contentEditable suppressContentEditableWarning className="text-muted-foreground text-lg mb-10 max-w-2xl outline-none"
              onBlur={(e) => onDescriptionChange?.(e.currentTarget.textContent || "")}>{description}</p>
          ) : (
            <p className="text-muted-foreground text-lg mb-10 max-w-2xl">{description}</p>
          )
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 pt-4">
          {items.map((item, i) => {
            const tilt = i % 2 === 0 ? -1.6 : 1.8;
            return (
              <div
                key={i}
                className="group relative bg-white p-4 pb-10 shadow-[0_18px_40px_-18px_rgba(232,158,178,.5)] transition-transform hover:rotate-0 hover:-translate-y-1"
                style={{ transform: `rotate(${tilt}deg)` }}
              >
                <div
                  className="aspect-[4/3] w-full mb-4"
                  style={{
                    background: `linear-gradient(135deg, #fce7f3 0%, #fbcfe8 50%, #f9a8d4 100%)`,
                    backgroundImage:
                      "radial-gradient(circle at 30% 30%, rgba(255,255,255,.7) 0, transparent 40%), linear-gradient(135deg, #fce7f3, #f9a8d4)",
                  }}
                  aria-hidden
                />
                {isEditing ? (
                  <h3 contentEditable suppressContentEditableWarning className="landing-heading text-lg font-bold mb-2 outline-none"
                    onBlur={(e) => onItemChange?.(i, "title", e.currentTarget.textContent || "")}>{item.title}</h3>
                ) : (
                  <h3 className="landing-heading text-lg font-bold mb-2" style={{ fontFamily: "'PT Serif', Georgia, serif" }}>{item.title}</h3>
                )}
                {isEditing ? (
                  <p contentEditable suppressContentEditableWarning className="text-sm text-muted-foreground outline-none"
                    onBlur={(e) => onItemChange?.(i, "description", e.currentTarget.textContent || "")}>{item.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">{item.description}</p>
                )}
                {isEditing && (
                  <button onClick={() => onRemoveItem?.(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && <button onClick={onAddItem} className="mt-6 text-sm text-primary hover:underline">+ Добавить карточку</button>}
      </div>
    </section>
  );
}
