import type { ContentBlock } from '@/components/course-builder/block-editor/types';

const SKIP_ELEMENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'CODE', 'PRE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'AUDIO', 'VIDEO', 'SOURCE', 'IMG']);
const TEXT_BREAKS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'TR', 'TD', 'TH']);

function joinSpeechSegments(parts: string[]): string {
  return parts.filter(Boolean).reduce((text, part) => text
    ? `${text}${/[.!?;:,…]$/.test(text) ? ' ' : '. '}${part}`
    : part, '');
}

/** Extract readable text in an inert template, decoding entities without loading media. */
export function speechTextFromHtml(value: string | null | undefined): string {
  if (!value) return '';
  const template = document.createElement('template');
  template.innerHTML = value;
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return '';
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      if (SKIP_ELEMENTS.has(element.tagName) || element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return '';
      if (element.tagName === 'BR') return '\n';
      const text = Array.from(node.childNodes).map(read).join('');
      return TEXT_BREAKS.has(element.tagName) ? `\n${text}\n` : text;
    }
    return Array.from(node.childNodes).map(read).join('');
  };
  return joinSpeechSegments(read(template.content).split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean));
}

/** Only learner-facing text fields: never serialize blocks, media URLs or quiz answer keys. */
export function lessonBlocksToSpeechText(blocks: ContentBlock[]): string {
  return joinSpeechSegments(blocks.map(block => {
    switch (block.type) {
      case 'paragraph': case 'heading1': case 'heading2': case 'heading3': case 'heading4':
      case 'quote': case 'bulletList': case 'numberedList':
        return speechTextFromHtml(block.content);
      case 'callout-info': case 'callout-warning': case 'callout-tip':
      case 'callout-success': case 'callout-danger': case 'highlight':
        return joinSpeechSegments([speechTextFromHtml(block.calloutTitle), speechTextFromHtml(block.content)]);
      case 'accordion':
        return joinSpeechSegments([speechTextFromHtml(block.accordionTitle), speechTextFromHtml(block.content)]);
      case 'table':
        return joinSpeechSegments((block.tableRows || []).map(row =>
          row.map(cell => speechTextFromHtml(cell)).filter(Boolean).join('; ')));
      case 'quiz': {
        const question = speechTextFromHtml(block.quizQuestion);
        return question ? `Вопрос: ${question}` : '';
      }
      default:
        return '';
    }
  }));
}
