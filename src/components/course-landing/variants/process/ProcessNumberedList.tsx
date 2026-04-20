import { Textarea } from "@/components/ui/textarea";
import { useTemplateStyle } from "../../LandingThemeProvider";
import { parseProcessLines, type ProcessVariantProps } from "./types";

/** Базовый вариант — нумерованный список 1–N. Используется по умолчанию. */
export function ProcessNumberedList({ title, content, isEditing, onTitleChange, onContentChange }: ProcessVariantProps) {
  const skin = useTemplateStyle();
  if (!content && !isEditing) return null;
  const lines = parseProcessLines(content);

  return (
    <section className="py-16 px-6 bg-muted/30">
      <div className="max-w-5xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className="text-2xl md:text-3xl font-bold mb-6 outline-none border-b-2 border-dashed border-muted-foreground/20 focus:border-primary/40"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`landing-heading text-2xl md:text-3xl font-bold mb-6 ${skin.sectionTitle}`}>{title}</h2>
        )}

        {isEditing ? (
          <Textarea
            value={content}
            onChange={(e) => onContentChange?.(e.target.value)}
            placeholder="Опишите как проходит обучение. Каждая строка — отдельный пункт."
            className="min-h-[160px]"
          />
        ) : (
          <ul className="space-y-3">
            {lines.map((line, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-primary font-bold mt-0.5">{i + 1}.</span>
                <span className="text-foreground">{line}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
