import { Input } from "@/components/ui/input";
import { Globe } from "lucide-react";
import type { ContentBlock } from "../types";
import { getEmbedSrc, ALLOWED_EMBED_HOSTS_LABELS } from "../embedSrc";

export function EmbedBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const url = block.embedUrl || "";
  const height = block.embedHeight || 480;
  const embedSrc = getEmbedSrc(url);
  const isInvalid = url && !embedSrc;

  return (
    <div className="py-2 space-y-2 not-prose">
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-purple-500 shrink-0" />
          <Input
            value={url}
            onChange={(e) => onUpdate({ embedUrl: e.target.value })}
            placeholder="Ссылка на YouTube, Vimeo, Figma, Miro, CodePen..."
            className="h-9 text-sm"
          />
        </div>
        {isInvalid && (
          <p className="text-xs text-destructive">
            Этот источник не поддерживается. Разрешены: {ALLOWED_EMBED_HOSTS_LABELS.join(", ")}.
          </p>
        )}
        {!url && (
          <p className="text-xs text-muted-foreground">
            Поддерживаются: {ALLOWED_EMBED_HOSTS_LABELS.join(", ")}.
          </p>
        )}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Высота, px:</label>
          <Input
            type="number"
            value={height}
            onChange={(e) => onUpdate({ embedHeight: Math.max(200, parseInt(e.target.value) || 480) })}
            className="h-8 w-24 text-sm"
            min={200}
            max={1200}
          />
        </div>
      </div>
      {embedSrc && (
        <div className="rounded-lg overflow-hidden border border-border bg-black" style={{ height }}>
          <iframe
            src={embedSrc}
            className="w-full h-full border-0"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      )}
    </div>
  );
}

// Re-export for backward compatibility
export { getEmbedSrc, isAllowedEmbed } from "../embedSrc";
