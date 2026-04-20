import { MapPin, Plane, Hotel, Coffee, Map, Palmtree } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { parseProcessLines, type ProcessVariantProps } from "./types";

const ICONS = [MapPin, Plane, Hotel, Coffee, Map, Palmtree];

/**
 * LANGUAGE — этапы обучения как «маршрут поездки»: пунктирная линия с
 * остановками-метками. Подходит к языковой/путешественной эстетике.
 */
export function ProcessLanguageRoute({ title, content, isEditing, onTitleChange, onContentChange }: ProcessVariantProps) {
  if (!content && !isEditing) return null;
  const lines = parseProcessLines(content);

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
          <p className="text-sm text-muted-foreground italic" style={{ fontFamily: "'PT Serif', Georgia, serif" }}>
            Ваш маршрут к свободному владению языком
          </p>
        </div>

        {isEditing ? (
          <Textarea value={content} onChange={(e) => onContentChange?.(e.target.value)} className="min-h-[180px]" />
        ) : (
          <div className="relative">
            {/* Пунктирная линия маршрута */}
            <div
              className="absolute left-8 top-8 bottom-8 w-[2px]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(180deg, #d4a574 0 6px, transparent 6px 12px)",
              }}
            />
            <ul className="space-y-6">
              {lines.map((line, i) => {
                const Icon = ICONS[i % ICONS.length];
                return (
                  <li key={i} className="relative pl-20">
                    <div
                      className="absolute left-2 top-1 w-12 h-12 rounded-full flex items-center justify-center bg-[#fffdf7] border-2 border-[#78502c] shadow-md"
                    >
                      <Icon className="w-5 h-5" style={{ color: "#78502c" }} />
                    </div>
                    <div className="bg-[#fffdf7] border border-[#d4a574]/40 p-4 rounded-md shadow-sm" style={{ fontFamily: "'PT Serif', Georgia, serif" }}>
                      <div className="text-xs uppercase tracking-widest text-[#d4a574] mb-1">
                        Остановка {i + 1}
                      </div>
                      <p className="text-foreground italic">{line}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
