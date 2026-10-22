import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ save: vi.fn(), text: vi.fn(), page: vi.fn(), font: vi.fn(), file: vi.fn(), convert: vi.fn(), download: vi.fn() }));
vi.mock('jspdf', () => ({ default: vi.fn(function () { return { internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } }, addFileToVFS: m.file, addFont: m.font, setFont: vi.fn(), setFontSize: vi.fn(), setTextColor: vi.fn(), setDrawColor: vi.fn(), setLineWidth: vi.fn(), line: vi.fn(), text: m.text, addPage: m.page, save: m.save, splitTextToSize: (text: string) => text === 'LONG' ? Array.from({ length: 130 }, (_, i) => 'Строка ' + i) : [text] }; }) }));
vi.mock('@/lib/docx/htmlToDocx', () => ({ htmlToDocxBlob: m.convert, downloadBlob: m.download }));
import { exportCatalogToPdf, exportCatalogToDocx } from '../exportRostechnadzorCatalog';
beforeEach(() => { vi.clearAllMocks(); m.convert.mockResolvedValue(new Blob(['PK'])); vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array(200).buffer }))); });
describe('catalog output integrity', () => {
    it('uses bundled local Cyrillic fonts and paginates every long line inside the printable area', async () => {
        await exportCatalogToPdf([{ title: 'Кириллица', count: 1, courses: [{ title: 'Безопасность', description: 'LONG' }] }]);
        expect(fetch).toHaveBeenNthCalledWith(1, '/fonts/PTSans-Regular.ttf', expect.anything());
        expect(fetch).toHaveBeenNthCalledWith(2, '/fonts/PTSans-Bold.ttf', expect.anything());
        expect(m.font).toHaveBeenNthCalledWith(2, 'PTSans-Bold.ttf', 'PTSans', 'bold');
        const longLines = m.text.mock.calls.filter(args => String(args[0]).startsWith('Строка '));
        expect(longLines).toHaveLength(130);
        for (const args of longLines)
            expect(args[2]).toBeLessThanOrEqual(279);
        expect(m.page).toHaveBeenCalled();
        expect(m.save).toHaveBeenCalledOnce();
    });
    it('refuses to save unreadable Cyrillic when fonts are unavailable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
        await expect(exportCatalogToPdf([{ title: 'QA', count: 1, courses: [] }])).rejects.toThrow('кириллицы');
        expect(m.text).not.toHaveBeenCalled();
        expect(m.save).not.toHaveBeenCalled();
    });
    it('exports real DOCX from full styles rather than an HTML .doc', async () => {
        await exportCatalogToDocx([{ title: 'Охрана <труда>', count: 1, courses: [{ title: 'Кириллица' }] }]);
        expect(m.convert).toHaveBeenCalledWith(expect.stringContaining('<style>'));
        expect(m.convert.mock.calls[0][0]).toContain('Охрана &lt;труда&gt;');
        expect(m.download).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/\.docx$/));
    });
});
