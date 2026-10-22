import { setOfflineAuthActor, observeOfflineAccess } from '@/utils/courseCache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ frame: vi.fn(), dispose: vi.fn(), canvas: vi.fn(), save: vi.fn(), pdf: vi.fn(), output: vi.fn() }));
vi.mock('../printHtmlToPdf', () => ({ createSafePrintFrame: mock.frame }));
vi.mock('html2canvas', () => ({ default: mock.canvas }));
vi.mock('jspdf', () => ({ default: mock.pdf }));
import { renderHtmlToPdf } from '../adminDocPdf';
import { preparePrintHtml } from '../printHtmlSafety';
beforeEach(() => { setOfflineAuthActor('QA-admin-A'); vi.clearAllMocks(); mock.output.mockImplementation(() => new Blob(['synthetic PDF'], { type: 'application/pdf' })); mock.frame.mockImplementation(async (html: string, title: string, options: any) => ({ document: new DOMParser().parseFromString(preparePrintHtml(html, title, 'marker', options?.rasterImages), 'text/html'), dispose: mock.dispose })); mock.canvas.mockResolvedValue({ width: 100, height: 100, toDataURL: () => 'data:image/jpeg;base64,aGVsbG8=' }); mock.pdf.mockImplementation(function () { return { internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } }, addImage: vi.fn(), addPage: vi.fn(), output: mock.output, save: mock.save }; }); });
afterEach(() => { setOfflineAuthActor(null); vi.restoreAllMocks(); vi.useRealTimers(); });
describe('admin raster PDF shares inert print preparation', () => {
  it('refuses late raster output after an actor round trip and disposes without creating or saving PDF', async () => {
    let complete!: (canvas: unknown) => void; mock.canvas.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const result = renderHtmlToPdf('<p>Персональный договор</p>', 'doc.pdf'); const outcome = expect(result).rejects.toThrow('Доступ изменился');
    for (let index = 0; index < 5; index++) await Promise.resolve(); setOfflineAuthActor('QA-admin-B'); setOfflineAuthActor('QA-admin-A');
    complete({ width: 100, height: 100, toDataURL: () => 'image' }); await outcome; expect(mock.pdf).not.toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled(); expect(mock.dispose).toHaveBeenCalledOnce();
  });
  it('rechecks observed access between PDF construction and the actual file save', async () => {
    mock.output.mockImplementation(() => { observeOfflineAccess('QA-admin-A', 'documents-revoked'); return new Blob(['synthetic PDF'], { type: 'application/pdf' }); });
    await expect(renderHtmlToPdf('<p>Договор</p>', 'doc.pdf')).rejects.toThrow('Доступ изменился'); expect(mock.output).toHaveBeenCalledOnce(); expect(mock.save).not.toHaveBeenCalled(); expect(mock.dispose).toHaveBeenCalledOnce();
  });
  it('never renders injected scripts/handlers and cleans up the sandboxed preparation when raster rendering fails', async () => {
    mock.canvas.mockImplementation(async (node: HTMLElement) => { expect(node.ownerDocument.querySelector('script,[onclick]')).toBeNull(); throw new Error('renderer failed'); });
    await expect(renderHtmlToPdf('<p onclick="steal()">Договор</p><script>steal()</script>', 'doc.pdf')).rejects.toThrow('renderer failed'); expect(mock.frame).toHaveBeenCalledWith(expect.stringContaining('<script>'), 'doc.pdf', { rasterImages: true }); expect(mock.dispose).toHaveBeenCalledOnce(); expect(mock.save).not.toHaveBeenCalled();
  });
  it('returns/saves a PDF only after the raster canvas is confirmed and then cleans up', async () => { const blob = await renderHtmlToPdf('<p>Договор</p>', 'doc.pdf'); expect(blob.type).toBe('application/pdf'); expect(mock.save).toHaveBeenCalledWith('doc.pdf'); expect(mock.dispose).toHaveBeenCalledOnce(); });
  it('refuses a signature that cannot be embedded rather than dropping it from the saved file', async () => {
    mock.frame.mockImplementation(async () => { const doc = new DOMParser().parseFromString('<p>Подпись</p><img src="https://files.example.org/signature.png">', 'text/html'); Object.defineProperty(doc.images[0], 'naturalWidth', { value: 10 }); Object.defineProperty(doc.images[0], 'naturalHeight', { value: 10 }); return { document: doc, dispose: mock.dispose }; });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => { throw new Error('tainted'); } } as any);
    await expect(renderHtmlToPdf('<p>Подпись</p>', 'doc.pdf')).rejects.toMatchObject({ code: 'RESOURCE_FAILED' }); expect(mock.canvas).not.toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled(); expect(mock.dispose).toHaveBeenCalledOnce();
  });
  it('times out a stuck renderer and prevents a late completion from saving a file after failure', async () => {
    vi.useFakeTimers(); let resolve!: (value: any) => void; mock.canvas.mockReturnValue(new Promise(yes => { resolve = yes; }));
    const result = renderHtmlToPdf('<p>Договор</p>', 'doc.pdf'); const outcome = expect(result).rejects.toMatchObject({ code: 'TIMED_OUT' }); await vi.advanceTimersByTimeAsync(45001); await outcome; expect(mock.dispose).toHaveBeenCalledOnce(); expect(mock.save).not.toHaveBeenCalled();
    resolve({ width: 100, height: 100, toDataURL: () => 'image' }); for (let index = 0; index < 5; index++) await Promise.resolve(); expect(mock.pdf).not.toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled();
  });
});
