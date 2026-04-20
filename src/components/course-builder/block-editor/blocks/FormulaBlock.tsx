import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Sigma } from "lucide-react";
import { cn } from "@/lib/utils";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { ContentBlock } from "../types";

export function FormulaBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const displayMode = block.formulaDisplayMode === "inline" ? false : true;

  useEffect(() => {
    if (!ref.current) return;
    const tex = block.content || "";
    if (!tex.trim()) {
      ref.current.innerHTML = '<span class="text-muted-foreground text-sm italic">Формула появится здесь</span>';
      setError(null);
      return;
    }
    try {
      katex.render(tex, ref.current, { displayMode, throwOnError: false, output: "html" });
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Ошибка формулы");
    }
  }, [block.content, displayMode]);

  return (
    <div className="py-2 space-y-2 not-prose">
      <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-center justify-center min-h-[64px]">
        <div ref={ref} className="overflow-x-auto max-w-full" />
      </div>
      <div className="flex items-center gap-2">
        <Sigma className="w-4 h-4 text-orange-500 shrink-0" />
        <Textarea
          value={block.content || ""}
          onChange={(e) => onUpdate({ content: e.target.value })}
          placeholder="Введите LaTeX, например: \\frac{a}{b} = c^2"
          spellCheck={false}
          className="font-mono text-sm min-h-[60px] resize-y"
        />
      </div>
      <div className="flex items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer">
          <input
            type="radio"
            name={`formula-mode-${block.id}`}
            checked={displayMode}
            onChange={() => onUpdate({ formulaDisplayMode: "block" })}
          />
          Блочная
        </label>
        <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer">
          <input
            type="radio"
            name={`formula-mode-${block.id}`}
            checked={!displayMode}
            onChange={() => onUpdate({ formulaDisplayMode: "inline" })}
          />
          Строчная
        </label>
        {error && <span className="text-destructive">⚠ {error}</span>}
      </div>
    </div>
  );
}

export function FormulaRender({ tex, displayMode }: { tex: string; displayMode: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(tex || "", ref.current, { displayMode, throwOnError: false, output: "html" });
    } catch {
      if (ref.current) ref.current.textContent = tex;
    }
  }, [tex, displayMode]);
  return <div ref={ref} className={cn("overflow-x-auto", displayMode ? "py-2" : "inline-block")} />;
}
