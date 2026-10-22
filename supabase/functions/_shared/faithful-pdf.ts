/** Genuine Browserless rendering only. No raster/plain-text/placeholder fallback. */
export class FaithfulPdfError extends Error {
  constructor() { super('ARTIFACT_RENDER_FAILED'); }
}
export const EDUCATION_PDF_MAX_BYTES = 20 * 1024 * 1024;
export const EDUCATION_RENDER_HTML_MAX_BYTES = 3 * 1024 * 1024;
export const EDUCATION_RENDERER_REVISION = 'uc019-v1' as const;
const encoder = new TextEncoder();

export function validateFaithfulPdf(bytes: Uint8Array): void {
  if (bytes.length < 32 || bytes.length > EDUCATION_PDF_MAX_BYTES
    || !/^%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n|\s)/.test(new TextDecoder().decode(bytes.subarray(0, 16)))
    || !/%%EOF[\t\r\n ]*$/.test(new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 1024))))) {
    throw new FaithfulPdfError();
  }
}

// Worker-owned code only, never template/caller JavaScript. Broken embedded assets
// must fail instead of producing a PDF that silently omits a signature or font.
// A promise-returning IIFE, not a truthy function object. Both a direct
// Puppeteer string predicate and the current Browserless wrapper execute it.
export const EDUCATION_PDF_READINESS = `(() => document.fonts.ready
  .then(() => Promise.all([document.fonts.load('16px "UC019 PTSans"'), document.fonts.load('bold 16px "UC019 PTSans"')]))
  .then(() => {
    if (!document.fonts.check('16px "UC019 PTSans"') || !document.fonts.check('bold 16px "UC019 PTSans"')) throw new Error('font_unavailable');
    return Promise.all(Array.from(document.images, image => image.decode().then(() => {
      if (!image.complete || image.naturalWidth < 1 || image.naturalHeight < 1) throw new Error('image_unavailable');
    })));
  }).then(() => true))()`;
// Browserless applies String.match(pattern), not RegExp-literal parsing.
export const EDUCATION_PDF_REJECT_PATTERN = '^(?:[hH][tT][tT][pP][sS]?|[fF][iI][lL][eE]|[fF][tT][pP]):';

export async function renderFaithfulEducationPdf(html: string, token: string, signal: AbortSignal,
  network: typeof fetch = fetch): Promise<Uint8Array> {
  if (signal.aborted || !token || encoder.encode(html).byteLength > EDUCATION_RENDER_HTML_MAX_BYTES) throw new FaithfulPdfError();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const abort = () => {if (reader) void reader.cancel().catch(() => {});};
  signal.addEventListener('abort', abort, {once: true});
  try {
    // Same configured renderer as the existing faithful HTML-to-PDF operation.
    // The endpoint cannot be selected by a template or caller.
    const response = await network(`https://chrome.browserless.io/pdf?token=${encodeURIComponent(token)}`, {
      method: 'POST', redirect: 'error', signal,
      headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
      body: JSON.stringify({html, bestAttempt: false,
        gotoOptions: {waitUntil: 'load', timeout: 15_000},
        waitForFunction: {fn: EDUCATION_PDF_READINESS, timeout: 15_000},
        rejectRequestPattern: [EDUCATION_PDF_REJECT_PATTERN],
        options: {format: 'A4', printBackground: true, preferCSSPageSize: true,
          margin: {top: '20mm', bottom: '20mm', left: '18mm', right: '18mm'}}}),
    });
    if (signal.aborted || !response.ok || response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/pdf') throw new FaithfulPdfError();
    const length = response.headers.get('Content-Length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > EDUCATION_PDF_MAX_BYTES)) throw new FaithfulPdfError();
    reader = response.body?.getReader();
    if (!reader) throw new FaithfulPdfError();
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      if (signal.aborted) throw new FaithfulPdfError();
      const chunk = await reader.read();
      if (signal.aborted) throw new FaithfulPdfError();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > EDUCATION_PDF_MAX_BYTES) throw new FaithfulPdfError();
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
    validateFaithfulPdf(bytes);
    return bytes;
  } catch { throw new FaithfulPdfError(); }
  finally {signal.removeEventListener('abort', abort); if (reader) {void reader.cancel().catch(() => {}); try {reader.releaseLock();} catch { /* Pending native cancellation releases its read. */ }}}
}
