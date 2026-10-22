import DOMPurify from 'dompurify';

export type PrintFailureCode = 'EMPTY_DOCUMENT' | 'UNSUPPORTED_RESOURCE' | 'LOAD_FAILED' | 'RESOURCE_FAILED' | 'TIMED_OUT' | 'PRINT_FAILED' | 'ACCESS_CHANGED';
export class HtmlPrintError extends Error {
  constructor(readonly code: PrintFailureCode, message?: string) {
    super(message ?? ({ EMPTY_DOCUMENT: 'Документ для печати пуст.', UNSUPPORTED_RESOURCE: 'Не удалось подготовить оформление: документ содержит неподдерживаемый внешний ресурс. Исходный документ сохранён.', LOAD_FAILED: 'Не удалось открыть документ для печати.', RESOURCE_FAILED: 'Не удалось загрузить изображение или подпись. Печать остановлена, чтобы не получить неполный документ.', TIMED_OUT: 'Документ или его изображения не успели загрузиться. Повторите печать.', PRINT_FAILED: 'Браузер не смог открыть печать. Повторите действие.', ACCESS_CHANGED: 'Доступ изменился. Повторно откройте документ перед печатью.' } as const)[code]);
    this.name = 'HtmlPrintError';
  }
}
export function escapeDocumentHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/** Images stay visible or fail explicitly; no javascript, active SVG or remote QR generator. */
export function printableImageSource(value: string, base = window.location.href): string {
  const raw = value.trim();
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) throw new HtmlPrintError('UNSUPPORTED_RESOURCE');
  if (/^data:/i.test(raw)) {
    if (raw.length > 14 * 1024 * 1024 || !/^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i.test(raw)) throw new HtmlPrintError('UNSUPPORTED_RESOURCE');
    return raw;
  }
  let parsed: URL; try { parsed = new URL(raw, base); } catch { throw new HtmlPrintError('UNSUPPORTED_RESOURCE'); }
  if (parsed.username || parsed.password || !['https:', 'blob:'].includes(parsed.protocol)) throw new HtmlPrintError('UNSUPPORTED_RESOURCE');
  if (parsed.protocol === 'blob:' && parsed.origin !== new URL(base).origin) throw new HtmlPrintError('UNSUPPORTED_RESOURCE');
  return parsed.href;
}
function checkCss(css: string) {
  // Decode CSS escapes before checking functions/at-rules; style text itself is preserved.
  const normalized = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\\([0-9a-f]{1,6})\s?/gi, (_match, hex) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff))).replace(/\\([^\r\n0-9a-f])/gi, '$1').replace(/\\[\r\n]+/g, '').toLowerCase();
  if (/@import\b|url\s*\(|expression\s*\(|(?:^|[;{])\s*(?:behavior|-moz-binding)\s*:/.test(normalized)) throw new HtmlPrintError('UNSUPPORTED_RESOURCE', 'В документе есть внешний стиль, шрифт или фоновое изображение, которое нельзя проверить перед печатью. Подготовьте самодостаточную версию; исходник не изменён.');
}
function bodyAppearance(html: string): string {
  const match = /<body\b/i.exec(html); if (!match) return '';
  let quote = '', end = -1;
  for (let index = match.index + match[0].length; index < html.length; index++) {
    const character = html[index];
    if (quote) { if (character === quote) quote = ''; }
    else if (character === '"' || character === "'") quote = character;
    else if (character === '>') { end = index; break; }
  }
  if (end < 0) return '';
  const probe = document.createElement('template'); probe.innerHTML = html.slice(match.index, end + 1).replace(/^<body/i, '<div') + '</div>';
  const body = probe.content.firstElementChild; if (!body) return '';
  if (body.hasAttribute('background')) throw new HtmlPrintError('UNSUPPORTED_RESOURCE');
  const attributes = ['style', 'class', 'id', 'lang', 'dir'];
  return attributes.flatMap(name => { const value = body.getAttribute(name); if (value === null) return []; if (name === 'style') checkCss(value); return [' ' + name + '="' + escapeDocumentHtml(value) + '"']; }).join('');
}
/** Produce an inert, self-contained print document. This is derived output, never an edit to a signed source. */
export function preparePrintHtml(html: string, title: string | undefined, marker: string, crossOriginImages = false): string {
  if (typeof html !== 'string' || !html.trim()) throw new HtmlPrintError('EMPTY_DOCUMENT');
  const bodyAttributes = bodyAppearance(html);
  const template = document.createElement('template'); template.innerHTML = html;
  if (template.content.querySelector('link[rel~="stylesheet"], source[srcset], picture, video, audio')) throw new HtmlPrintError('UNSUPPORTED_RESOURCE');
  for (const node of template.content.querySelectorAll('style')) checkCss(node.textContent ?? '');
  for (const node of template.content.querySelectorAll('[style]')) checkCss(node.getAttribute('style') ?? '');
  for (const image of template.content.querySelectorAll('img')) {
    if (image.hasAttribute('srcset')) throw new HtmlPrintError('UNSUPPORTED_RESOURCE');
    image.setAttribute('src', printableImageSource(image.getAttribute('src') ?? ''));
    if (crossOriginImages) image.setAttribute('crossorigin', 'anonymous');
    image.setAttribute('referrerpolicy', 'no-referrer'); image.setAttribute('loading', 'eager');
  }
  const originalTitle = template.content.querySelector('title')?.textContent ?? '';
  const clean = DOMPurify.sanitize(template.innerHTML, {
    RETURN_DOM_FRAGMENT: true, FORCE_BODY: true, ALLOW_DATA_ATTR: false,
    ALLOWED_TAGS: ['div', 'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'blockquote', 'sup', 'sub', 'hr', 'img', 'style', 'title', 'section', 'header', 'footer', 'main', 'article', 'small', 'figure', 'figcaption', 'pre', 'code'],
    ALLOWED_ATTR: ['class', 'id', 'style', 'colspan', 'rowspan', 'scope', 'lang', 'dir', 'width', 'height', 'align', 'valign', 'border', 'cellpadding', 'cellspacing', 'alt', 'src', 'referrerpolicy', 'loading', 'crossorigin'],
    ALLOWED_URI_REGEXP: /^(?:https:|blob:|data:image\/(?:png|jpe?g|gif|webp|bmp);base64,)/i,
  });
  if (clean.querySelectorAll('img').length !== template.content.querySelectorAll('img').length || Array.from(clean.querySelectorAll('img')).some(image => !image.getAttribute('src'))) throw new HtmlPrintError('UNSUPPORTED_RESOURCE');
  // DOMPurify may deliberately remove these image attributes; derive the safe
  // values again on inert sanitized nodes before any iframe loads the images.
  for (const image of clean.querySelectorAll('img')) {
    image.setAttribute('referrerpolicy', 'no-referrer'); image.setAttribute('loading', 'eager');
    if (crossOriginImages) image.setAttribute('crossorigin', 'anonymous'); else image.removeAttribute('crossorigin');
  }
  clean.querySelectorAll('title').forEach(node => node.remove());
  const container = document.createElement('div'); container.appendChild(clean);
  const visible = container.cloneNode(true) as HTMLElement; visible.querySelectorAll('style').forEach(node => node.remove());
  if (!visible.textContent?.trim() && !visible.querySelector('img')) throw new HtmlPrintError('EMPTY_DOCUMENT');
  const csp = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src https: data: blob:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";
  return '<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="' + escapeDocumentHtml(csp) + '"><meta name="sintagma-print-document" content="' + escapeDocumentHtml(marker) + '"><meta name="referrer" content="no-referrer"><title>' + escapeDocumentHtml(title || originalTitle || 'Документ') + '</title><style>@page{size:A4;margin:15mm 20mm}@media print{body{padding:0!important;margin:0!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body' + bodyAttributes + '>' + container.innerHTML + '</body></html>';
}
