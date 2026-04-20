import { Textarea } from "@/components/ui/textarea";
import { useLandingTheme } from "../../LandingThemeProvider";
import { parseProcessLines, type ProcessVariantProps } from "./types";

/**
 * AURORA — вертикальный timeline с большой акцент-вертикалью слева и
 * пульсирующими точками. Подходит к премиум-эстетике.
 */
export function ProcessAuroraTimeline({ title, content, isEditing, onTitleChange, onContentChange }: ProcessVariantProps) {
  const { accent } = useLandingTheme();
  const accentColor = accent || "hsl(var(--primary))";
  if (!content && !isEditing) return null;
  const lines = parseProcessLines(content);

  return (
    <section className="py-20 px-6">
      <div className="max-w-4xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className="landing-heading text-3xl md:text-4xl font-extrabold mb-12 outline-none"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className="landing-heading text-3xl md:text-4xl font-extrabold mb-12 tpl-aurora-section-title">{title}</h2>
        )}

        {isEditing ? (
          <Textarea value={content} onChange={(e) => onContentChange?.(e.target.value)}
            className="min-h-[180px]" placeholder="Каждая строка — отдельный шаг." />
        ) : (
          <div className="relative pl-12">
            <div
              className="absolute left-4 top-2 bottom-2 w-[2px] rounded-full"
              style={{ background: `linear-gradient(180deg, ${accentColor} 0%, ${accentColor}33 100%)` }}
            />
            <ul className="space-y-8">
              {lines.map((line, i) => (
                <li key={i} className="relative">
                  <div
                    className="absolute -left-12 top-1 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg"
                    style={{
                      background: `linear-gradient(135deg, ${accentColor}, ${accentColor}aa)`,
                      boxShadow: `0 0 0 4px hsl(var(--background)), 0 0 0 5px ${accentColor}55`,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <p className="text-lg text-foreground leading-relaxed">{line}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
