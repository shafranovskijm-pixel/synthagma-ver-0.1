import { captureDocumentOutputFence } from '@/lib/documents/outputFence';
import { HtmlPrintError, preparePrintHtml } from './printHtmlSafety';

function capturePrintFence(): () => void {
  const current = captureDocumentOutputFence();
  return () => { try { current(); } catch { throw new HtmlPrintError('ACCESS_CHANGED'); } };
}

export interface SafePrintFrame { iframe: HTMLIFrameElement; document: Document; window: Window; dispose: () => void }
/** Inert derived HTML, ready images/fonts, one bounded load and explicit cleanup. */
export async function createSafePrintFrame(html: string, title?: string, options?: { rasterImages?: boolean }): Promise<SafePrintFrame> {
  const assertCurrent = capturePrintFence(); assertCurrent();
  const marker = crypto.randomUUID(), safeHtml = preparePrintHtml(html, title, marker, options?.rasterImages);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin allow-modals');
  iframe.setAttribute('aria-hidden', 'true'); iframe.setAttribute('title', 'Подготовка печати');
  iframe.style.position = 'fixed'; iframe.style.left = '-9999px'; iframe.style.top = '0'; iframe.style.width = options?.rasterImages ? '794px' : '210mm'; iframe.style.height = options?.rasterImages ? '1123px' : '297mm'; iframe.style.border = '0';
  return new Promise<SafePrintFrame>((resolve, reject) => {
    let finished = false, loaded = false;
    const dispose = () => { clearTimeout(timeout); iframe.onload = null; iframe.onerror = null; iframe.remove(); };
    const fail = (error: HtmlPrintError) => { if (finished) return; finished = true; dispose(); reject(error); };
    const timeout = setTimeout(() => fail(new HtmlPrintError('TIMED_OUT')), 15000);
    // The listener exists before srcdoc and append, including cache-fast loads.
    iframe.onload = async () => {
      if (finished || loaded) return;
      const doc = iframe.contentDocument;
      if (!doc || doc.querySelector('meta[name="sintagma-print-document"]')?.getAttribute('content') !== marker) return;
      loaded = true;
      try {
        assertCurrent();
        if (doc.fonts?.ready) { await doc.fonts.ready; assertCurrent(); }
        await Promise.all(Array.from(doc.images).map(async image => {
          assertCurrent();
          if (!image.complete) await new Promise<void>((yes, no) => { image.addEventListener('load', () => yes(), { once: true }); image.addEventListener('error', () => no(new HtmlPrintError('RESOURCE_FAILED')), { once: true }); });
          assertCurrent();
          if (!image.naturalWidth) throw new HtmlPrintError('RESOURCE_FAILED');
          if (typeof image.decode === 'function') await image.decode().catch(() => { throw new HtmlPrintError('RESOURCE_FAILED'); });
          assertCurrent();
        }));
        assertCurrent();
        await new Promise<void>(yes => { requestAnimationFrame(() => requestAnimationFrame(() => yes())); });
        if (finished) return;
        assertCurrent();
        const targetWindow = iframe.contentWindow;
        if (!targetWindow) throw new HtmlPrintError('LOAD_FAILED');
        finished = true; clearTimeout(timeout); iframe.onload = null; iframe.onerror = null;
        resolve({ iframe, document: doc, window: targetWindow, dispose });
      } catch (error) { fail(error instanceof HtmlPrintError ? error : new HtmlPrintError('RESOURCE_FAILED')); }
    };
    iframe.onerror = () => fail(new HtmlPrintError('LOAD_FAILED'));
    try { assertCurrent(); iframe.srcdoc = safeHtml; document.body.appendChild(iframe); }
    catch (error) { fail(error instanceof HtmlPrintError ? error : new HtmlPrintError('LOAD_FAILED')); }
  });
}
/** Resolve after invoking browser print; this never confirms a saved PDF. */
export async function printHtmlContent(html: string, title?: string): Promise<void> {
  const assertCurrent = capturePrintFence(); assertCurrent();
  const frame = await createSafePrintFrame(html, title);
  let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  const cleanup = () => { if (cleanupTimer) clearTimeout(cleanupTimer); frame.window.removeEventListener('afterprint', cleanup); frame.dispose(); };
  try {
    assertCurrent();
    if (typeof frame.window.print !== 'function') throw new HtmlPrintError('PRINT_FAILED');
    frame.window.addEventListener('afterprint', cleanup, { once: true });
    cleanupTimer = setTimeout(cleanup, 120000);
    frame.window.focus(); assertCurrent(); frame.window.print();
  } catch (error) { cleanup(); throw error instanceof HtmlPrintError ? error : new HtmlPrintError('PRINT_FAILED'); }
}
