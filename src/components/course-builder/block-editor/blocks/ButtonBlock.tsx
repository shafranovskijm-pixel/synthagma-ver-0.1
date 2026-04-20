import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlignLeft, AlignCenter, AlignRight, MousePointerClick } from "lucide-react";
import type { ContentBlock } from "../types";

const variants = [
  { value: "primary", label: "Основная" },
  { value: "outline", label: "Контурная" },
  { value: "ghost", label: "Прозрачная" },
] as const;

const aligns = [
  { value: "left", icon: AlignLeft },
  { value: "center", icon: AlignCenter },
  { value: "right", icon: AlignRight },
] as const;

export function ButtonBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const variant = block.buttonVariant || "primary";
  const align = block.buttonAlign || "left";
  const label = block.buttonLabel || "Нажмите";
  const url = block.buttonUrl || "";

  const previewClass = cn(
    "inline-flex items-center justify-center gap-2 px-5 h-10 rounded-md text-sm font-medium transition-colors",
    variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
    variant === "outline" && "border border-input bg-background hover:bg-accent",
    variant === "ghost" && "hover:bg-accent text-foreground"
  );

  const containerAlign = cn(
    "flex",
    align === "left" && "justify-start",
    align === "center" && "justify-center",
    align === "right" && "justify-end"
  );

  return (
    <div className="py-2 space-y-2 not-prose">
      <div className={containerAlign}>
        <span className={previewClass}>
          <MousePointerClick className="w-4 h-4" />
          {label}
        </span>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input
            value={label}
            onChange={(e) => onUpdate({ buttonLabel: e.target.value })}
            placeholder="Текст кнопки"
            className="h-9 text-sm"
          />
          <Input
            value={url}
            onChange={(e) => onUpdate({ buttonUrl: e.target.value })}
            placeholder="https://example.com"
            className="h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            {variants.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => onUpdate({ buttonVariant: v.value })}
                className={cn(
                  "px-2 h-7 text-xs rounded transition-colors",
                  variant === v.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            {aligns.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => onUpdate({ buttonAlign: a.value })}
                className={cn(
                  "w-7 h-7 rounded flex items-center justify-center transition-colors",
                  align === a.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                )}
                title={a.value}
              >
                <a.icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
