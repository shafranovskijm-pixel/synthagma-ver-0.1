import { Input } from "@/components/ui/input";
import { Globe } from "lucide-react";
import type { ContentBlock } from "../types";

const ALLOWED_HOSTS = [
  "youtube.com", "www.youtube.com", "youtu.be",
  "vimeo.com", "player.vimeo.com",
  "codepen.io",
  "figma.com", "www.figma.com",
  "miro.com",
  "kinescope.io",
  "docs.google.com", "drive.google.com",
  "loom.com", "www.loom.com",
  "rutube.ru",
  "vk.com", "vkvideo.ru",
];

function toEmbedUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.some((h) => host === h || host.endsWith("." + h))) return null;

    // YouTube → embed
    if (host.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (u.pathname.startsWith("/embed/")) return u.toString();
    }
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    // Vimeo
    if (host === "vimeo.com") {
      const id = u.pathname.replace(/^\//, "");
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    // Figma → /embed
    if (host.includes("figma.com") && !u.pathname.startsWith("/embed")) {
      return `https://www.figma.com/embed?embed_host=lovable&url=${encodeURIComponent(raw)}`;
    }
    return raw;
  } catch {
    return null;
  }
}

export function EmbedBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const url = block.embedUrl || "";
  const height = block.embedHeight || 480;
  const embedSrc = toEmbedUrl(url);
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
            Этот источник не поддерживается. Разрешены: YouTube, Vimeo, Figma, Miro, CodePen, Kinescope, Google Docs, Loom, Rutube, VK.
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

export function isAllowedEmbed(url: string): boolean {
  return toEmbedUrl(url) !== null;
}

export function getEmbedSrc(url: string): string | null {
  return toEmbedUrl(url);
}
