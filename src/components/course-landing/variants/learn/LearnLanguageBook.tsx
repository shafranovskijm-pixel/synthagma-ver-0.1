import { Trash2 } from "lucide-react";
import type { LearnVariantProps } from "./types";

/**
 * LANGUAGE — секция в виде раскрытой книги: 2 колонки = 2 страницы разворота,
 * каждая «страница» — список уроков с подчёркиванием курсивом, бумажный фон.
 */
export function LearnLanguageBook({
  title, description, items, isEditing,
  onTitleChange, onDescriptionChange, onItemChange, onAddItem, onRemoveItem,
}: LearnVariantProps) {
  if (items.length === 0 && !isEditing) return null;

  // Делим на две страницы
  const mid = Math.ceil(items.length / 2);
  const left = items.slice(0, mid);
  const right = items.slice(mid);

  return (
    <section className="py-16 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          {isEditing ? (
            <h2 contentEditable suppressContentEditableWarning
              className="text-3xl md:text-4xl font-bold outline-none mb-2"
              style={{ fontFamily: "'PT Serif', Georgia, serif", fontStyle: "italic" }}
              onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
          ) : (
            <h2 className="text-3xl md:text-4xl font-bold tpl-language-section-title mb-2">{title}</h2>
          )}
          {(description || isEditing) && (
            isEditing ? (
              <p contentEditable suppressContentEditableWarning className="text-muted-foreground outline-none max-w-2xl mx-auto"
                onBlur={(e) => onDescriptionChange?.(e.currentTarget.textContent || "")}>{description}</p>
            ) : (
              <p className="text-muted-foreground max-w-2xl mx-auto" style={{ fontFamily: "'PT Serif', Georgia, serif" }}>{description}</p>
            )
          )}
        </div>

        {/* Раскрытая книга */}
        <div
          className="grid md:grid-cols-2 gap-0 relative shadow-[0_25px_60px_-25px_rgba(120,80,40,.4)]"
          style={{
            background: "linear-gradient(90deg, #fffdf7 0%, #fef9ee 49%, #d4a574 50%, #fef9ee 51%, #fffdf7 100%)",
          }}
        >
          {[left, right].map((page, pageIdx) => (
            <div
              key={pageIdx}
              className="p-8 md:p-10 min-h-[400px]"
              style={{
                fontFamily: "'PT Serif', Georgia, serif",
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent 0 31px, rgba(120,80,40,.06) 31px 32px)",
              }}
            >
              <div className="flex items-baseline justify-between mb-6 pb-2 border-b border-[#78502c]/20">
                <span className="text-xs uppercase tracking-widest text-[#78502c]">Урок · Lesson</span>
                <span className="text-xs text-[#78502c]/60">— {pageIdx + 1} —</span>
              </div>

              <ul className="space-y-5">
                {page.map((item, i) => {
                  const globalIdx = pageIdx === 0 ? i : mid + i;
                  return (
                    <li key={globalIdx} className="group relative">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-2xl text-[#d4a574] font-bold leading-none">{globalIdx + 1}.</span>
                        {isEditing ? (
                          <h3 contentEditable suppressContentEditableWarning className="text-lg font-bold italic outline-none flex-1"
                            onBlur={(e) => onItemChange?.(globalIdx, "title", e.currentTarget.textContent || "")}>{item.title}</h3>
                        ) : (
                          <h3 className="text-lg font-bold italic flex-1 underline decoration-[#d4a574] decoration-2 underline-offset-4">{item.title}</h3>
                        )}
                      </div>
                      {isEditing ? (
                        <p contentEditable suppressContentEditableWarning className="text-sm text-muted-foreground pl-6 outline-none"
                          onBlur={(e) => onItemChange?.(globalIdx, "description", e.currentTarget.textContent || "")}>{item.description}</p>
                      ) : (
                        <p className="text-sm text-foreground/70 pl-6">{item.description}</p>
                      )}
                      {isEditing && (
                        <button onClick={() => onRemoveItem?.(globalIdx)} className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {isEditing && <button onClick={onAddItem} className="mt-6 text-sm text-primary hover:underline">+ Добавить урок</button>}
      </div>
    </section>
  );
}
