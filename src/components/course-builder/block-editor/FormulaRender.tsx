import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";

// Pure render-only component. Lives outside `blocks/` to avoid circular imports
// between BlockRenderer and blocks/FormulaBlock.
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
