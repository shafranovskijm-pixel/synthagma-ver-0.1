// Pure utility for resolving embed URLs to their iframe src.
// Lives outside `blocks/` to avoid circular imports between BlockRenderer.tsx
// and blocks/EmbedBlock.tsx.

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

export const ALLOWED_EMBED_HOSTS_LABELS = [
  "YouTube", "Vimeo", "Figma", "Miro", "CodePen",
  "Kinescope", "Google Docs", "Loom", "Rutube", "VK Video",
];

export function getEmbedSrc(raw: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.some((h) => host === h || host.endsWith("." + h))) return null;

    if (host.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (u.pathname.startsWith("/embed/")) return u.toString();
    }
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.replace(/^\//, "");
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    if (host.includes("figma.com") && !u.pathname.startsWith("/embed")) {
      return `https://www.figma.com/embed?embed_host=lovable&url=${encodeURIComponent(raw)}`;
    }
    return raw;
  } catch {
    return null;
  }
}

export function isAllowedEmbed(url: string): boolean {
  return getEmbedSrc(url) !== null;
}
