import DOMPurify from "dompurify";
import type { ContentBlock, StylePreset } from "./types";

// Convert plain-text URLs into <a> tags, skipping URLs already inside <a>
export function linkifyHtml(html: string): string {
  const parts = html.split(/(<a\s[^>]*>.*?<\/a>)/gi);
  return parts.map((part) => {
    if (/^<a\s/i.test(part)) return part;
    return part.replace(
      /(?:https?:\/\/|www\.)[^\s<>"']+/gi,
      (url) => {
        const href = url.startsWith('www.') ? `https://${url}` : url;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      }
    );
  }).join('');
}

export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['strong', 'b', 'em', 'i', 'u', 'br', 'p', 'span', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'a', 'img'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'style', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
  });
};

// Linkify then sanitize — use this for all rendering
export const renderHtml = (html: string): string => sanitizeHtml(linkifyHtml(html));

export function summarizeExistingContent(blocks: ContentBlock[]): string {
  return blocks
    .filter(b => b.content || b.quizQuestion || b.accordionTitle)
    .map(b => {
      if (b.quizQuestion) return `[Квиз] ${b.quizQuestion}`;
      if (b.accordionTitle) return `[Секция] ${b.accordionTitle}: ${b.content || ''}`;
      return b.content;
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000);
}

const PRESETS_STORAGE_KEY = 'block-style-presets';

export function loadPresets(): { name: string; style: StylePreset }[] {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function savePresets(presets: { name: string; style: StylePreset }[]) {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

export function extractStyle(block: ContentBlock): StylePreset {
  return {
    textAlign: block.textAlign || undefined,
    bgColor: block.bgColor || undefined,
    textColor: block.textColor || undefined,
    textSize: block.textSize || 'base',
    bold: block.bold || false,
    italic: block.italic || false,
    strikethrough: block.strikethrough || false,
    underline: block.underline || false,
    uppercase: block.uppercase || false,
    lineHeight: block.lineHeight || 'normal',
    fontFamily: block.fontFamily || 'sans',
    borderStyle: block.borderStyle || 'none',
    borderRadius: block.borderRadius || 'none',
  };
}

export function describeStyle(style: StylePreset): string {
  const parts: string[] = [];
  if (style.bold) parts.push('Жирный');
  if (style.italic) parts.push('Курсив');
  if (style.underline) parts.push('Подчёрк.');
  if (style.strikethrough) parts.push('Зачёрк.');
  if (style.uppercase) parts.push('ВЕРХН.');
  if (style.textSize === 'sm') parts.push('Мелкий');
  if (style.textSize === 'lg') parts.push('Крупный');
  if (style.textAlign === 'center') parts.push('По центру');
  if (style.textAlign === 'right') parts.push('Справа');
  if (style.bgColor) parts.push(`Фон: ${style.bgColor}`);
  if (style.textColor) parts.push(`Цвет: ${style.textColor}`);
  if (style.lineHeight === 'tight') parts.push('Плотный');
  if (style.lineHeight === 'relaxed') parts.push('Свободн.');
  if (style.fontFamily === 'mono') parts.push('Моно');
  if (style.borderStyle && style.borderStyle !== 'none') parts.push(`Рамка: ${style.borderStyle}`);
  if (style.borderRadius && style.borderRadius !== 'none') parts.push(`Скругл: ${style.borderRadius}`);
  return parts.length ? parts.join(', ') : 'Стандарт';
}
