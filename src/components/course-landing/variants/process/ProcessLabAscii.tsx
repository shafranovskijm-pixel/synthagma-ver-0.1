import { Textarea } from "@/components/ui/textarea";
import { parseProcessLines, type ProcessVariantProps } from "./types";

/**
 * LAB — последовательность шагов как ASCII-pipeline: тёмный терминальный
 * фон, моноширинные блоки с символами `→` и `╰─►`. Подходит к IT-теме.
 */
export function ProcessLabAscii({ title, content, isEditing, onTitleChange, onContentChange }: ProcessVariantProps) {
  if (!content && !isEditing) return null;
  const lines = parseProcessLines(content);

  return (
    <section className="py-20 px-6">
      <div className="max-w-5xl mx-auto">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className="text-2xl md:text-3xl font-bold mb-8 outline-none"
            style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: "#d4e4ff" }}
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className="text-2xl md:text-3xl font-bold mb-8 tpl-lab-section-title">{title}</h2>
        )}

        {isEditing ? (
          <Textarea value={content} onChange={(e) => onContentChange?.(e.target.value)} className="min-h-[180px]" />
        ) : (
          <div
            className="bg-[#0d1117] border border-cyan-500/25 rounded-md p-6 font-mono text-sm leading-relaxed shadow-[0_0_40px_-10px_rgba(34,211,238,.3)]"
            style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
          >
            <div className="text-zinc-500 mb-4">$ ./run_pipeline.sh --steps {lines.length}</div>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr] gap-3 py-1">
                <span className="text-cyan-400 select-none whitespace-pre">
                  {i === lines.length - 1 ? "  ╰─►" : "  ├─►"}
                </span>
                <div>
                  <span className="text-emerald-400">step_{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-zinc-500"> :: </span>
                  <span className="text-zinc-300">{line}</span>
                </div>
              </div>
            ))}
            <div className="text-emerald-400 mt-4">
              ✓ pipeline complete <span className="text-zinc-500">// exit 0</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
