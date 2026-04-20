import type { ContentBlock } from "@/components/course-builder/BlockEditor";

const READING_WPM = 200;

function stripHtml(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, " ");
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function countBlocksWords(blocks: ContentBlock[]): number {
  if (!Array.isArray(blocks)) return 0;
  let total = 0;
  for (const b of blocks) {
    if (b.content) total += countWords(stripHtml(b.content));
    if (b.accordionTitle) total += countWords(b.accordionTitle);
    if (b.calloutTitle) total += countWords(b.calloutTitle);
    if (b.quizQuestion) total += countWords(b.quizQuestion);
    if (b.imageAlt) total += countWords(b.imageAlt);
    if (b.tableRows) for (const row of b.tableRows) for (const cell of row) total += countWords(cell || "");
    if (b.sliderSlides) for (const s of b.sliderSlides) {
      total += countWords(s.title || "");
      total += countWords(s.content || "");
    }
  }
  return total;
}

export function estimateReadingMinutes(words: number): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.round(words / READING_WPM));
}

export function formatReadingTime(words: number): string {
  const min = estimateReadingMinutes(words);
  if (min === 0) return "—";
  if (min === 1) return "≈1 мин";
  if (min < 5) return `≈${min} мин`;
  return `≈${min} мин`;
}
