import { Trash2 } from "lucide-react";
import { useLandingTheme } from "../../LandingThemeProvider";
import type { LearnVariantProps } from "./types";

/**
 * AURORA — нумерованная сетка 2×3 с гигантскими градиентными номерами
 * `01–06`. Подходит к премиальной типографике Unbounded.
 */
export function LearnAuroraNumbers({
  title, description, items, isEditing,
  onTitleChange, onDescriptionChange, onItemChange, onAddItem, onRemoveItem,
}: LearnVariantProps) {
  const { accent } = useLandingTheme();
  const accentColor = accent || "hsl(var(--primary))";
  if (items.length === 0 && !isEditing) return null;

  return (
    <section className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14 max-w-2xl mx-auto">
          {isEditing ? (
            <h2 contentEditable suppressContentEditableWarning
              className="landing-heading text-3xl md:text-5xl font-extrabold mb-4 outline-none"
              onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
          ) : (
            <h2 className="landing-heading text-3xl md:text-5xl font-extrabold mb-4 tpl-aurora-section-title">{title}</h2>
          )}
          {(description || isEditing) && (
            isEditing ? (
              <p contentEditable suppressContentEditableWarning className="text-muted-foreground text-lg outline-none"
                onBlur={(e) => onDescriptionChange?.(e.currentTarget.textContent || "")}>{description}</p>
            ) : (
              <p className="text-muted-foreground text-lg">{description}</p>
            )
          )}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-14">
          {items.map((item, i) => (
            <div key={i} className="relative group">
              <div
                className="text-7xl md:text-8xl font-extrabold leading-none mb-4 select-none"
                style={{
                  background: `linear-gradient(135deg, ${accentColor}, ${accentColor}33)`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
                aria-hidden
              >
                {String(i + 1).padStart(2, "0")}
              </div>
              {isEditing ? (
                <h3 contentEditable suppressContentEditableWarning className="landing-heading text-xl font-bold mb-2 outline-none"
                  onBlur={(e) => onItemChange?.(i, "title", e.currentTarget.textContent || "")}>{item.title}</h3>
              ) : (
                <h3 className="landing-heading text-xl font-bold mb-2">{item.title}</h3>
              )}
              {isEditing ? (
                <p contentEditable suppressContentEditableWarning className="text-muted-foreground outline-none"
                  onBlur={(e) => onItemChange?.(i, "description", e.currentTarget.textContent || "")}>{item.description}</p>
              ) : (
                <p className="text-muted-foreground">{item.description}</p>
              )}
              {isEditing && (
                <button onClick={() => onRemoveItem?.(i)} className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {isEditing && <button onClick={onAddItem} className="mt-8 text-sm text-primary hover:underline">+ Добавить пункт</button>}
      </div>
    </section>
  );
}
