import { isOwnStorageProxyImageUrl, STORAGE_PROXY_BASE_URL } from '@/utils/storageProxyUrl';
import { setOfflineAuthActor } from '@/utils/courseCache';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import invoiceTemplateSource from '@/constants/invoiceTemplate.ts?raw';
import { htmlToDocxBlob, htmlToWordXml, htmlDocsToZipBlob, downloadBlob } from '../htmlToDocx.ts';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const bytes = (blob: Blob) => new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob); });
const zip = async (blob: Blob) => JSZip.loadAsync(await bytes(blob));
afterEach(() => { setOfflineAuthActor(null); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
describe('universal DOCX content integrity', () => {
    it('keeps root text and mixed blocks in their original order', () => {
        const xml = htmlToWordXml('До <b>договора</b><p>Основной текст</p>После <i>подписи</i>');
        expect(xml.indexOf('До ')).toBeLessThan(xml.indexOf('Основной текст'));
        expect(xml.indexOf('Основной текст')).toBeLessThan(xml.indexOf('После '));
        expect(xml).toContain('подписи');
    });
    it('renders direct rows only, preserves nested tables and two-dimensional merges', () => {
        const xml = htmlToWordXml('<table><tr><th rowspan="2">ФИО</th><th colspan="2">Результат</th></tr><tr><td>Теория</td><td>Практика</td></tr><tr><td>Иванов</td><td colspan="2"><table><tr><td>Вложенный</td></tr></table></td></tr></table>');
        expect((xml.match(/<w:tbl>/g) || [])).toHaveLength(2);
        expect((xml.match(/<w:tr>/g) || [])).toHaveLength(4);
        expect((xml.match(/Вложенный/g) || [])).toHaveLength(1);
        expect(xml).toContain('<w:vMerge w:val="restart"/>');
        expect(xml).toContain('<w:vMerge/>');
        expect(xml).toContain('<w:gridSpan w:val="2"/>');
        expect(new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror')).toBeNull();
    });
    it('embeds signature bytes and actual image relationships rather than dropping the image', async () => {
        const file = await zip(await htmlToDocxBlob('<p>Подпись: <img width="100" alt="Тестовая подпись" src="data:image/png;base64,' + PNG + '"/></p>'));
        expect(await file.file('word/media/image2.png')!.async('base64')).toBe(PNG);
        const xml = await file.file('word/document.xml')!.async('string');
        expect(xml).toContain('<a:blip r:embed="rId2"/>');
        expect(xml).toContain('Тестовая подпись');
        expect(await file.file('word/_rels/document.xml.rels')!.async('string')).toContain('Target="media/image2.png"');
        expect(await file.file('[Content_Types].xml')!.async('string')).toContain('image/png');
    });
    it('refuses missing or unsupported images and complex content rather than issuing an incomplete Word', async () => {
        await expect(htmlToDocxBlob('<p>Подпись<img src="https://example.invalid/sign.png"/></p>')).rejects.toThrow('Внешнее изображение');
        await expect(htmlToDocxBlob('<p><img src="data:image/png;base64,AAA="/></p>')).rejects.toThrow('корректным PNG');
        expect(() => htmlToWordXml('<svg><text>Подпись</text></svg>')).toThrow('нельзя достоверно');
    });
    it('refuses unavailable same-origin signatures and leaves no partially returned DOCX', async () => {
        vi.stubEnv('VITE_SUPABASE_URL', 'https://qa.sintagma.invalid');
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })));
        await expect(htmlToDocxBlob('<img src="https://qa.sintagma.invalid/signature.png"/>')).rejects.toThrow();
    });
    it('preserves supported CSS font, emphasis, page margins and column widths', () => {
        const xml = htmlToWordXml('<style>@page {size:A4; margin:20mm 25mm;} body{font-family:Arial;font-size:14pt} .right{text-align:right;color:#123456}</style><p class="right">Подпись</p><table><tr><th style="width:20%">№</th><th style="width:80%">Описание</th></tr></table>');
        expect(xml).toContain('w:ascii="Arial"');
        expect(xml).toContain('w:sz w:val="28"');
        expect(xml).toContain('w:jc w:val="right"');
        expect(xml).toContain('w:color w:val="123456"');
        expect(xml).toContain('w:left="1417"');
        const widths = [...xml.matchAll(/<w:gridCol w:w="(\d+)"/g)].map(x => Number(x[1]));
        expect(widths[1] / widths[0]).toBeCloseTo(4, 1);
    });
    it('keeps the actual invoice bank/items borders while buyer and signature layout tables stay borderless', () => {
        const actualInvoiceCss = /<style>([\s\S]*?)<\/style>/.exec(invoiceTemplateSource)![1];
        const xml = htmlToWordXml('<style>' + actualInvoiceCss + '</style>'
            + '<table class="bank-table"><tr><td>Банк QA</td><td>Счёт QA</td></tr></table>'
            + '<table style="margin-bottom:18px"><tr><td>Покупатель:</td><td>Учебная организация QA</td></tr></table>'
            + '<table class="items-table"><tr><th>Услуга</th><th>Сумма</th></tr><tr><td>Платформа QA</td><td>4490</td></tr></table>'
            + '<table style="border:0"><tr><td style="border:none">Подпись QA</td></tr></table>');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        expect(doc.querySelector('parsererror')).toBeNull();
        const tables = Array.from(doc.getElementsByTagName('w:tbl'));
        expect(tables).toHaveLength(4);
        for (const index of [0, 2]) {
            const cells = Array.from(tables[index].getElementsByTagName('w:tcBorders'));
            expect(cells.length).toBeGreaterThan(0);
            for (const cell of cells)
                for (const edge of Array.from(cell.children)) {
                    expect(edge.getAttribute('w:val')).toBe('single');
                    expect(edge.getAttribute('w:sz')).toBe('6');
                }
        }
        for (const index of [1, 3])
            for (const borders of Array.from(tables[index].getElementsByTagName('w:tcBorders')))
                expect(Array.from(borders.children).every(edge => edge.getAttribute('w:val') === 'nil')).toBe(true);
        expect(tables[1].textContent).toContain('Учебная организация QA');
    });
    it('honours explicit zero/none and later border declarations on individual cell sides', () => {
        const xml = htmlToWordXml('<style>.grid td{border:1px solid #000}</style><table class="grid" style="border:none"><tr>'
            + '<td style="border:0">Нет рамки</td>'
            + '<td style="border:none;border-left:2pt dashed #123456">Только слева</td>'
            + '<td style="border-left:2pt solid #000;border:0">Поздний сброс</td>'
            + '</tr></table>');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        const cells = Array.from(doc.getElementsByTagName('w:tcBorders'));
        for (const index of [0, 2])
            expect(Array.from(cells[index].children).every(edge => edge.getAttribute('w:val') === 'nil')).toBe(true);
        expect(cells[1].getElementsByTagName('w:left')[0].getAttribute('w:val')).toBe('dashed');
        expect(cells[1].getElementsByTagName('w:left')[0].getAttribute('w:color')).toBe('123456');
        expect(cells[1].getElementsByTagName('w:top')[0].getAttribute('w:val')).toBe('nil');
    });
    it('keeps an ordinary learner row together across pages and repeats its table header', () => {
        const xml = htmlToWordXml('<table><thead><tr><th>Слушатель</th><th>Результат</th></tr></thead><tbody>'
            + Array.from({ length: 36 }, (_, index) => '<tr><td>Слушатель QA' + index + '</td><td>Результат не указан</td></tr>').join('')
            + '</tbody></table>');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        const rows = Array.from(doc.getElementsByTagName('w:tr'));
        expect(rows).toHaveLength(37);
        expect(rows.every(row => row.getElementsByTagName('w:cantSplit').length === 1)).toBe(true);
        expect(rows[0].getElementsByTagName('w:tblHeader')).toHaveLength(1);
        expect(rows[36].textContent).toContain('Слушатель QA35');
    });
    it.each(['\u0000', '\u0001', '\ud800', '\ufffe'])('refuses invalid XML characters without rewriting legal text %j', char => {
        expect(() => htmlToWordXml('<p>Иван' + char + 'ов</p>')).toThrow('недопустимый');
    });
    it('rejects invalid table spans rather than writing malformed table XML', () => {
        expect(() => htmlToWordXml('<table><tr><td rowspan="3">А</td></tr></table>')).toThrow('последнюю строку');
        expect(() => htmlToWordXml('<table><tr><td colspan="Infinity">А</td></tr></table>')).toThrow('объединение');
    });
    it('deduplicates long and case-equivalent names without an infinite suffix loop', async () => {
        const name = 'Д'.repeat(100);
        const result = await zip(await htmlDocsToZipBlob([{ name, html: 'Первый' }, { name, html: 'Второй' }, { name: name.toLowerCase(), html: 'Третий' }]));
        const names = Object.keys(result.files);
        expect(names).toHaveLength(3);
        expect(new Set(names.map(n => n.toLowerCase())).size).toBe(3);
        expect(names.some(n => n.endsWith('(2).docx'))).toBe(true);
        for (const file of Object.values(result.files))
            expect((await JSZip.loadAsync(await file.async('uint8array'))).file('word/document.xml')).not.toBeNull();
    });
    it('cleans an attached download anchor immediately on failure and revokes successful URLs after handoff', () => {
        vi.useFakeTimers();
        const revoke = vi.fn();
        const NativeURL = URL;
        vi.stubGlobal('URL', class extends NativeURL {
            static createObjectURL = vi.fn(() => 'blob:qa');
            static revokeObjectURL = revoke;
        });
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { expect(this.isConnected).toBe(true); throw new Error('blocked'); });
        expect(() => downloadBlob(new Blob(['x']), 'qa.docx')).toThrow('blocked');
        expect(document.querySelector('a[download="qa.docx"]')).toBeNull();
        expect(revoke).toHaveBeenCalledOnce();
        click.mockImplementation(() => { });
        revoke.mockClear();
        downloadBlob(new Blob(['x']), 'qa.docx');
        expect(revoke).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);
        expect(revoke).toHaveBeenCalledOnce();
    });
    it('keeps nested bullet and explicit numbered list markers in order', () => {
        const xml = htmlToWordXml('<ul><li>Первый<ul><li>Второй</li></ul></li></ul><ol start="3"><li>Третий</li><li value="8">Восьмой</li></ol>');
        expect((xml.match(/— /g) || [])).toHaveLength(2);
        expect(xml.indexOf('Первый')).toBeLessThan(xml.indexOf('Второй'));
        expect(xml).toContain('3. ');
        expect(xml).toContain('8. ');
    });
    it('rejects a false PNG prefix rather than packaging damaged signature bytes', async () => {
        const falsePng = Uint8Array.from({ length: 50 }, (_, i) => [137, 80, 78, 71][i] || 0);
        await expect(htmlToDocxBlob('<img src="data:image/png;base64,' + btoa(String.fromCharCode(...falsePng)) + '"/>')).rejects.toThrow('корректным PNG');
    });
    it('does not hand a completed document to another actor after an account switch', async () => {
        setOfflineAuthActor('QA-A');
        const blob = await htmlToDocxBlob('<p>Документ QA-A</p>');
        setOfflineAuthActor('QA-B');
        expect(() => downloadBlob(blob, 'qa.docx')).toThrow('Доступ изменился');
    });
    it('honours signature max-width/max-height and height-only aspect ratios', async () => {
        const limited = await zip(await htmlToDocxBlob('<img style="width:400px;max-width:80px;max-height:90px" src="data:image/png;base64,' + PNG + '"/>'));
        expect(await limited.file('word/document.xml')!.async('string')).toContain('<wp:extent cx="762000" cy="762000"/>');
        const height = await zip(await htmlToDocxBlob('<img height="40" src="data:image/png;base64,' + PNG + '"/>'));
        expect(await height.file('word/document.xml')!.async('string')).toContain('<wp:extent cx="381000" cy="381000"/>');
    });
    it('keeps a canonical proxied signed storage signature and never broadens access to another origin or path', async () => {
        const signed = STORAGE_PROXY_BASE_URL + '/sb-storage/object/sign/org-signatures/QA/signature.png?token=synthetic-QA';
        const raster = Uint8Array.from(atob(PNG), c => c.charCodeAt(0));
        const fetchImage = vi.fn(async () => ({ ok: true, headers: new Headers({ 'content-length': String(raster.length) }), arrayBuffer: async () => raster.buffer }));
        vi.stubGlobal('fetch', fetchImage);
        expect(isOwnStorageProxyImageUrl(signed)).toBe(true);
        expect(fetchImage).not.toHaveBeenCalled();
        const result = await zip(await htmlToDocxBlob('<p>Подпись<img src="' + signed + '"></p>'));
        expect(await result.file('word/media/image2.png')!.async('base64')).toBe(PNG);
        expect(fetchImage).toHaveBeenCalledWith(signed, expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }));
        fetchImage.mockClear();
        for (const invalid of [signed.replace('api.xn--80aaiswd0ak.xn--p1ai', 'other.example.invalid'), STORAGE_PROXY_BASE_URL + '/sb-api/rpc/secret', STORAGE_PROXY_BASE_URL.replace('https://', 'https://user:pass@') + '/sb-storage/object/sign/QA/img.png']) {
            expect(isOwnStorageProxyImageUrl(invalid)).toBe(false);
            await expect(htmlToDocxBlob('<img src="' + invalid + '">')).rejects.toThrow('Внешнее изображение');
        }
        expect(fetchImage).not.toHaveBeenCalled();
    });
});
