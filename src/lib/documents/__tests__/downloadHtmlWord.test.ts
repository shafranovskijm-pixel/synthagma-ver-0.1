import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadHtmlWord } from '../downloadHtmlWord.ts';
const m = vi.hoisted(() => ({ convert: vi.fn(), download: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/docx/htmlToDocx', async (original) => ({ ...await original<typeof import('@/lib/docx/htmlToDocx')>(), htmlToDocxBlob: m.convert, downloadBlob: m.download }));
vi.mock('sonner', () => ({ toast: { error: m.error } }));
beforeEach(() => { vi.clearAllMocks(); m.convert.mockResolvedValue(new Blob(['PK'])); m.download.mockReset(); });
describe('legacy Word route adapter', () => {
    it('converts the full source with styles intact, replacing .doc with actual .docx', async () => {
        const html = '<style>body{font-size:14pt}</style><p>Акт № 1</p>';
        expect(await downloadHtmlWord(html, 'Акт 1.doc')).toBe(true);
        expect(m.convert).toHaveBeenCalledWith(html);
        expect(m.download).toHaveBeenCalledWith(expect.any(Blob), 'Акт 1.docx');
    });
    it('does not download incomplete content or report success on conversion failure', async () => {
        m.convert.mockRejectedValue(new Error('Signature unavailable'));
        expect(await downloadHtmlWord('<img/>', 'Акт.doc')).toBe(false);
        expect(m.download).not.toHaveBeenCalled();
        expect(m.error).toHaveBeenCalledOnce();
    });
    it('reports a failed browser handoff and permits retry without any persistence call', async () => {
        m.download.mockImplementationOnce(() => { throw new Error('blocked'); });
        expect(await downloadHtmlWord('<p>Акт</p>', 'Акт.doc')).toBe(false);
        expect(await downloadHtmlWord('<p>Акт</p>', 'Акт.doc')).toBe(true);
        expect(m.convert).toHaveBeenCalledTimes(2);
    });
});
