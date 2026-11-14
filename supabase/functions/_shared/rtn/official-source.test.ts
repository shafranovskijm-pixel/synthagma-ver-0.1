// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { assertBoundedXlsx, assertDocumentMagic, decodeOfficialPage, discoverA1Section, discoverDocument, discoverIndustryCatalog, fetchOfficial, officialUrl, validateInflatedXlsx } from './official-source';

const page = 'https://www.gosnadzor.ru/service/list/Safety%20certification/a1/index.php';
const doc = `${page.slice(0, -9)}a1.pdf`;
const energyPage = 'https://www.gosnadzor.ru/energy/energy/questions/';

describe('official RTN trust and discovery', () => {
  it('rejects non-HTTPS, lookalike hosts, credentials, other paths and queries', () => {
    for (const url of ['http://www.gosnadzor.ru/energy/energy/a', 'https://www.gosnadzor.ru.evil.test/energy/energy/a', 'https://u:p@www.gosnadzor.ru/energy/energy/a', 'https://www.gosnadzor.ru/admin/a', `${page}?redirect=bad`]) expect(() => officialUrl(url)).toThrow();
    expect(officialUrl(page).hostname).toBe('www.gosnadzor.ru');
  });
  it('selects A.1 questions, excluding the separate NPA list', () => {
    expect(discoverDocument('<a href="npa.PDF">Перечень НПА</a><a href="a1.pdf"><b>А.1.</b> Основы промышленной безопасности</a>', page, 'a1')).toBe(doc);
  });
  it('rejects missing or ambiguous official attachments', () => {
    expect(() => discoverDocument('<a href="npa.pdf">НПА</a>', page, 'a1')).toThrow('LINK_MISSING');
    expect(() => discoverDocument('<a href="one.pdf">А.1. Промышленная безопасность</a><a href="two.pdf">А.1. Промышленная безопасность</a>', page, 'a1')).toThrow('AMBIGUOUS');
  });
  it('discovers a new XLSX link without relying on the previous file URL', () => {
    expect(discoverDocument('<a href="new.xlsx">Перечень вопросов (тестов) в формате excel</a>', energyPage, 'energy-xlsx')).toBe(`${energyPage}new.xlsx`);
  });
  it('weekly discovery follows the newest explicitly dated official catalog and exact A1 section', () => {
    const html = '<a href="old/">Вопросы тестирования с 1 сентября 2024 г.</a><a href="new/">Вопросы тестирования с 1 января 2027 г.</a>';
    const catalog = discoverIndustryCatalog(html, page);
    expect(catalog).toContain('/new/');
    expect(discoverA1Section('<a href="a1/">Общие требования промышленной безопасности</a>', catalog)).toBe(`${catalog}a1/`);
  });
  it('does not guess a catalog on invalid or conflicting official dates', () => {
    expect(() => discoverIndustryCatalog('<a href="x/">Вопросы тестирования с 32 января 2027 г.</a>', page)).toThrow('DATE_INVALID');
    expect(() => discoverIndustryCatalog('<a href="x/">Вопросы тестирования с 1 января 2027 г.</a><a href="y/">Вопросы тестирования с 1 января 2027 г.</a>', page)).toThrow('AMBIGUOUS');
  });
  it('refuses a redirect to an untrusted endpoint before fetching it', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }));
    await expect(fetchOfficial(page, 'page', fetcher)).rejects.toThrow('UNTRUSTED');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('limits streamed bytes even without Content-Length', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array(2 * 1024 * 1024 + 1)));
    await expect(fetchOfficial(page, 'page', fetcher)).rejects.toThrow('TOO_LARGE');
  });
  it('rejects an HTML error page returned with PDF/ZIP-like media headers', () => {
    expect(() => assertDocumentMagic(new TextEncoder().encode('<html>error</html>'), 'industrial-pdf')).toThrow('NOT_PDF');
    expect(() => assertDocumentMagic(new TextEncoder().encode('<html>error</html>'), 'energy-xlsx')).toThrow('NOT_XLSX');
  });
  it('reads a declared Windows-1251 official page without mojibake', () => {
    expect(decodeOfficialPage(Uint8Array.from([0xc0, 0x2e, 0x31]), 'text/html; charset=windows-1251')).toBe('А.1');
  });
});

describe('bounded OOXML preflight', () => {
  async function zip(extra: Record<string, string> = {}) {
    const value = new JSZip();
    value.file('[Content_Types].xml', '<Types/>'); value.file('xl/workbook.xml', '<workbook/>');
    for (const [name, text] of Object.entries(extra)) value.file(name, text);
    return value.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }
  it('rejects encrypted legacy or arbitrary inputs instead of handing them to a parser', () => {
    expect(() => assertBoundedXlsx(new Uint8Array(200))).toThrow('INVALID_ZIP');
  });
  it('validates a real small ZIP and rejects truncation', async () => {
    const bytes = await zip();
    expect(() => assertBoundedXlsx(bytes)).not.toThrow();
    expect(() => assertBoundedXlsx(bytes.subarray(0, bytes.length - 1))).toThrow();
    await expect(validateInflatedXlsx(bytes)).resolves.toBeUndefined();
  });
  it('rejects embedded external links and extreme inflation before XML parsing', async () => {
    const linked = await zip({ 'xl/externalLinks/externalLink1.xml': '<x/>' });
    expect(() => assertBoundedXlsx(linked)).toThrow('UNSAFE_ENTRY');
    const inflated = await zip({ 'xl/sharedStrings.xml': 'A'.repeat(2_000_000) });
    expect(() => assertBoundedXlsx(inflated)).toThrow('INFLATION_LIMIT');
  });
  it('rejects local header inflation sizes that disagree with the central directory', async () => {
    const bytes = await zip(), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint32(22, 0x7fffffff, true);
    expect(() => assertBoundedXlsx(bytes)).toThrow('HEADER_MISMATCH');
  });
  it('rejects actual deflate output when both headers understate the same size', async () => {
    const bytes = await zip(), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint32(22, 0, true);
    const central = bytes.findIndex((_, i) => i + 4 <= bytes.length && view.getUint32(i, true) === 0x02014b50);
    view.setUint32(central + 24, 0, true);
    expect(() => assertBoundedXlsx(bytes)).not.toThrow();
    await expect(validateInflatedXlsx(bytes)).rejects.toThrow('ACTUAL_INFLATION_LIMIT');
  });
});
