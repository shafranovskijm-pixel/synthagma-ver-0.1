import {describe, expect, it, vi} from 'vitest';
import {renderFaithfulEducationPdf, validateFaithfulPdf, FaithfulPdfError, EDUCATION_PDF_MAX_BYTES,
  EDUCATION_PDF_READINESS, EDUCATION_PDF_REJECT_PATTERN} from '../faithful-pdf';
import {pdf} from './education-issuance-artifact.fixture';

describe('genuine configured faithful PDF transport (synthetic responses only)', () => {
  it('uses one fixed renderer with bounded genuine readiness, no caller JS/URL and no fallback', async () => {
    const network = vi.fn(async () => new Response(pdf(), {headers: {'Content-Type': 'application/pdf'}}));
    const bytes = await renderFaithfulEducationPdf('<html>Синтетический документ</html>', 'SYNTHETIC_TOKEN', new AbortController().signal, network as typeof fetch);
    expect(bytes).toEqual(pdf()); expect(network).toHaveBeenCalledTimes(1);
    const [url, init] = network.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://chrome.browserless.io/pdf?token=SYNTHETIC_TOKEN'); expect(init.redirect).toBe('error');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({bestAttempt: false, waitForFunction: {fn: EDUCATION_PDF_READINESS, timeout: 15_000},
      options: {preferCSSPageSize: true, printBackground: true}});
    expect(body.url).toBeUndefined(); expect(body.addScriptTag).toBeUndefined();
  });

  it.each([
    () => new Response('renderer failure', {status: 503}),
    () => new Response('<html>fake PDF</html>', {headers: {'Content-Type': 'application/pdf'}}),
    () => new Response(pdf(), {headers: {'Content-Type': 'text/html'}}),
    () => new Response(pdf(), {headers: {'Content-Type': 'application/pdf', 'Content-Length': String(EDUCATION_PDF_MAX_BYTES + 1)}}),
    () => new Response(new TextEncoder().encode('%PDF-1.7\ntruncated no end marker'), {headers: {'Content-Type': 'application/pdf'}}),
  ])('refuses failure/HTML/truncation/oversize with no manufactured PDF', async response => {
    const network = vi.fn(async () => response());
    await expect(renderFaithfulEducationPdf('<html></html>', 'SYNTHETIC', new AbortController().signal, network as typeof fetch)).rejects.toThrow(FaithfulPdfError);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('counts streamed bytes instead of trusting an absent content length', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({start(controller) {
      controller.enqueue(new Uint8Array(EDUCATION_PDF_MAX_BYTES)); controller.enqueue(new Uint8Array(1));
    }, cancel});
    const network = vi.fn(async () => new Response(body, {headers: {'Content-Type': 'application/pdf'}}));
    await expect(renderFaithfulEducationPdf('<html></html>', 'SYNTHETIC', new AbortController().signal, network as typeof fetch)).rejects.toThrow(FaithfulPdfError);
    expect(cancel).toHaveBeenCalled();
  });

  it('an aborted caller cannot produce bytes or start a renderer', async () => {
    const controller = new AbortController(); controller.abort(); const network = vi.fn();
    await expect(renderFaithfulEducationPdf('<html></html>', 'SYNTHETIC', controller.signal, network)).rejects.toThrow(FaithfulPdfError);
    expect(network).not.toHaveBeenCalled(); expect(() => validateFaithfulPdf(pdf())).not.toThrow();
  });

  it('uses the actual String.match grammar for all external protocol cases without blocking owned data assets', () => {
    for (const url of ['https://external.invalid/image', 'HTTP://external.invalid', 'fIlE:///private', 'Ftp://external.invalid']) {
      expect(url.match(EDUCATION_PDF_REJECT_PATTERN)).not.toBeNull();
    }
    expect('data:image/png;base64,aA=='.match(EDUCATION_PDF_REJECT_PATTERN)).toBeNull();
  });

  it('readiness string executes as a promise expression and waits for images instead of returning a truthy function object', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>(done => {resolve = done;});
    const document = {fonts: {ready: Promise.resolve(), load: () => Promise.resolve([]), check: () => true},
      images: [{decode: () => pending, complete: true, naturalWidth: 1, naturalHeight: 1}]};
    const result = new Function('document', `return ${EDUCATION_PDF_READINESS}`)(document);
    expect(result).toBeInstanceOf(Promise);
    let finished = false; void result.then(() => {finished = true;});
    await Promise.resolve(); await Promise.resolve(); expect(finished).toBe(false);
    resolve(); await expect(result).resolves.toBe(true);
    expect(EDUCATION_PDF_READINESS.includes('async')).toBe(false); expect(EDUCATION_PDF_READINESS.includes('await')).toBe(false);
    expect(EDUCATION_PDF_READINESS.startsWith('()')).toBe(false);
  });

  it.each(['image', 'font'] as const)('readiness expression rejects a broken %s instead of returning a successful predicate', async kind => {
    const document = {fonts: {ready: Promise.resolve(), load: () => kind === 'font' ? Promise.reject(new Error('broken_font')) : Promise.resolve([]), check: () => true},
      images: [{decode: () => Promise.reject(new Error('broken_image')), complete: false, naturalWidth: 0, naturalHeight: 0}]};
    const result = new Function('document', `return ${EDUCATION_PDF_READINESS}`)(document);
    await expect(result).rejects.toThrow(kind === 'font' ? 'broken_font' : 'broken_image');
    // This is a real JS predicate test, not an actual browser font/image decode claim.
  });
});
