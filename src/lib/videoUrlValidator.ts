// Validation helper for video URLs / embed code in LessonEditor.
// Mirrors the patterns supported by VideoBlock.getEmbedFromContent.

const PATTERNS: RegExp[] = [
  /\.(mp4|webm|ogg|mov|mkv|m4v|m3u8)(\?.*)?$/i,
  /selcdn\.ru/i,
  /selstorage/i,
  /^kinescope:/i,
  /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)[a-zA-Z0-9_-]+/i,
  /vimeo\.com\/\d+/i,
  /rutube\.ru\/video\/[a-zA-Z0-9]+/i,
  /(?:vk\.com|vkvideo\.ru)\/video-?\d+_\d+/i,
  /[a-zA-Z0-9]+\.ktalk\.ru\/recordings\/[a-zA-Z0-9_-]+/i,
  /dzen\.ru\/(?:video\/watch|embed)\/[a-zA-Z0-9_-]+/i,
  /ok\.ru\/video\/\d+/i,
  /my\.mail\.ru\/(?:mail|bk|inbox|list)\/[^/]+\/video\/[^/]+\/\d+/i,
  /yandex\.ru\/video\/preview\/\d+/i,
  /supabase/i,
];

export type VideoUrlStatus = "empty" | "iframe" | "valid" | "unknown";

export function checkVideoUrl(content: string): VideoUrlStatus {
  const trimmed = (content || "").trim();
  if (!trimmed) return "empty";
  if (trimmed.startsWith("<iframe") && trimmed.includes("</iframe>")) return "iframe";
  for (const re of PATTERNS) {
    if (re.test(trimmed)) return "valid";
  }
  return "unknown";
}
