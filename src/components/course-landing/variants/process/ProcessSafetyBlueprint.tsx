import { Textarea } from "@/components/ui/textarea";
import { parseProcessLines, type ProcessVariantProps } from "./types";

/**
 * SAFETY — нумерованные блоки в стиле инженерного чертежа: сетка-фон,
 * прямоугольные плашки с артикулом «01.», синий контур, подпись.
 */
export function ProcessSafetyBlueprint({ title, content, isEditing, onTitleChange, onContentChange }: ProcessVariantProps) {
  if (!content && !isEditing) return null;
  const lines = parseProcessLines(content);

  return (
    <section
      className="py-16 px-6"
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,.92), rgba(255,255,255,.92)), linear-gradient(0deg, rgba(30,58,138,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(30,58,138,.12) 1px, transparent 1px)",
        backgroundSize: "auto, 32px 32px, 32px 32px",
      }}
    >
      <div className="max-w-5xl mx-auto">
        <div className="border-l-4 border-[#1e3a8a] pl-6 mb-10">
          {isEditing ? (
            <h2 contentEditable suppressContentEditableWarning
              className="text-2xl md:text-3xl font-bold uppercase tracking-wide outline-none"
              onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
          ) : (
            <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-wide">{title}</h2>
          )}
          <p className="text-xs font-mono text-[#1e3a8a]/70 mt-2">DOC-{new Date().getFullYear()} · ТЕХНОЛОГИЧЕСКАЯ СХЕМА</p>
        </div>

        {isEditing ? (
          <Textarea value={content} onChange={(e) => onContentChange?.(e.target.value)} className="min-h-[180px]" />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {lines.map((line, i) => (
              <div key={i} className="bg-white border-2 border-[#1e3a8a] p-5 relative">
                <div className="absolute -top-3 left-4 bg-white px-2 text-xs font-mono font-bold text-[#1e3a8a] tracking-widest">
                  ЭТАП {String(i + 1).padStart(2, "0")}
                </div>
                <p className="text-foreground leading-relaxed pt-1">{line}</p>
                <div className="mt-3 pt-3 border-t border-dashed border-[#1e3a8a]/30 flex justify-between items-center text-[10px] font-mono text-[#1e3a8a]/60 uppercase">
                  <span>Утв. {String(i + 1).padStart(2, "0")}/{String(lines.length).padStart(2, "0")}</span>
                  <span>✓ согл.</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
