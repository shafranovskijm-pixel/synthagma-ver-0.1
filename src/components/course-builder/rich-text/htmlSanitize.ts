import DOMPurify from "dompurify";

const ALLOWED_TAGS = ['strong', 'b', 'em', 'i', 'u', 's', 'br', 'p', 'span', 'div', 'a', 'code'];
const ALLOWED_ATTR = ['style', 'href', 'target', 'rel'];

export function sanitizeRichHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false });
}

/**
 * Wrap bare URLs (http(s)://… or www.…) in <a> tags. Existing anchors are left untouched.
 */
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

/**
 * Collapse contenteditable's div/p containers into <br> so we keep a flat inline structure.
 * Also collapses runs of 3+ consecutive <br> down to 2.
 */
export function normalizeRichLineBreaks(html: string): string {
  if (!html) return html;
  let out = html;
  out = out.replace(/<\/(?:div|p)>\s*<(?:div|p)(?:\s[^>]*)?>/gi, '<br>');
  out = out.replace(/<(?:div|p)(?:\s[^>]*)?>/gi, '');
  out = out.replace(/<\/(?:div|p)>/gi, '');
  out = out.replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br><br>');
  return out;
}

/**
 * After-blur normalization: linkify + sanitize + ensure all anchors get target/rel + strip block tags.
 */
export function finalizeRichHtml(html: string): string {
  const linked = linkifyHtml(html);
  const cleaned = sanitizeRichHtml(linked);
  const withTargets = cleaned.replace(
    /<a\s+([^>]*?)>/gi,
    (match, attrs: string) => {
      const hrefMatch = attrs.match(/href="([^"]*)"/);
      const href = hrefMatch ? hrefMatch[1] : '';
      if (!href) return match;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">`;
    }
  );
  return normalizeRichLineBreaks(withTargets);
}
