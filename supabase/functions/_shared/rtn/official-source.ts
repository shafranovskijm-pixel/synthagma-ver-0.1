/** Public official documents only. No caller-controlled host, redirect, or storage path. */
export type SourceRule = 'a1' | 'energy-xlsx';
export type SourceDescriptor = {
  id: string;
  page_url: string;
  document_url: string;
  trusted_anchor_rule: SourceRule;
  parser: 'industrial-pdf' | 'energy-xlsx';
  last_sha256: string | null;
};

const HOSTS = new Set(['www.gosnadzor.ru', 'gosnadzor.ru']);
const PAGE_BYTES = 2 * 1024 * 1024;
export const DOCUMENT_BYTES = 16 * 1024 * 1024;

export function officialUrl(input: string, base?: string): URL {
  const url = new URL(input, base);
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || url.port || url.hash) {
    throw new Error('UNTRUSTED_OFFICIAL_URL');
  }
  const path = decodeURIComponent(url.pathname);
  if (!path.startsWith('/energy/energy/') && !path.startsWith('/service/list/Safety certification/')) {
    throw new Error('UNTRUSTED_OFFICIAL_PATH');
  }
  if (url.search) throw new Error('UNTRUSTED_OFFICIAL_QUERY');
  return url;
}

export async function fetchOfficial(input: string, kind: 'page' | 'document', fetcher: typeof fetch = fetch) {
  let url = officialUrl(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const limit = kind === 'page' ? PAGE_BYTES : DOCUMENT_BYTES;
  try {
    for (let redirects = 0; redirects <= 4; redirects++) {
      const response = await fetcher(url.href, {
        redirect: 'manual', signal: controller.signal,
        headers: { Accept: kind === 'page' ? 'text/html' : 'application/pdf, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location || redirects === 4) throw new Error('OFFICIAL_REDIRECT_LIMIT');
        url = officialUrl(location, url.href);
        continue;
      }
      if (response.status !== 200 || !response.body) {
        await response.body?.cancel();
        throw new Error(`OFFICIAL_HTTP_${response.status}`);
      }
      const length = Number(response.headers.get('content-length') || 0);
      if (length > limit) { await response.body.cancel(); throw new Error('OFFICIAL_FILE_TOO_LARGE'); }
      const reader = response.body.getReader();
      const parts: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > limit) { await reader.cancel(); throw new Error('OFFICIAL_FILE_TOO_LARGE'); }
          parts.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      if (!bytes) throw new Error('OFFICIAL_EMPTY_DOCUMENT');
      const result = new Uint8Array(bytes);
      let offset = 0;
      for (const part of parts) { result.set(part, offset); offset += part.length; }
      return { bytes: result, url: url.href, contentType: response.headers.get('content-type') || '', status: 200 };
    }
    throw new Error('OFFICIAL_REDIRECT_LIMIT');
  } finally { clearTimeout(timeout); }
}

function entities(value: string): string {
  return value.replace(/&#(x[0-9a-f]+|\d+);|&(amp|quot|apos|lt|gt|nbsp);/gi, (_, numeric: string, named: string) => {
    if (numeric) {
      const cp = numeric[0].toLowerCase() === 'x' ? parseInt(numeric.slice(1), 16) : parseInt(numeric, 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    }
    return ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' } as Record<string, string>)[named.toLowerCase()];
  });
}

export function decodeOfficialPage(bytes: Uint8Array, contentType: string): string {
  const prefix = new TextDecoder('utf-8').decode(bytes.subarray(0, 2048));
  const charset = `${contentType} ${prefix}`.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || 'utf-8';
  if (!['utf-8', 'utf8', 'windows-1251', 'cp1251'].includes(charset.toLowerCase())) throw new Error('OFFICIAL_UNKNOWN_ENCODING');
  return new TextDecoder(charset.toLowerCase() === 'cp1251' ? 'windows-1251' : charset, { fatal: true }).decode(bytes);
}

/** Ambiguous/changed markup fails closed: never select a random attachment or an NPA list. */
export function officialLinks(html: string, pageUrl: string): { url: string; label: string }[] {
  const links: { url: string; label: string }[] = [];
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi)) {
    const href = entities(match[1] ?? match[2]);
    const label = entities(match[3].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    let url: URL;
    try { url = officialUrl(href, pageUrl); } catch { continue; }
    links.push({ url: url.href, label });
  }
  return links;
}

export function discoverDocument(html: string, pageUrl: string, rule: SourceRule): string {
  const matches = new Set<string>();
  for (const { url, label } of officialLinks(html, pageUrl)) {
    const path = decodeURIComponent(new URL(url).pathname);
    if (rule === 'a1' && /\.[pP][dD][fF]$/.test(path) && /^[АA]\s*\.\s*1(?:\D|$)/u.test(label) && /промышленн.*безопасност/iu.test(label)) matches.add(url);
    if (rule === 'energy-xlsx' && /\.xlsx$/i.test(path) && /(?:перечень|вопрос|тест)/iu.test(label) && /(?:excel|xlsx)/iu.test(label)) matches.add(url);
  }
  if (matches.size !== 1) throw new Error(matches.size ? 'OFFICIAL_AMBIGUOUS_DOCUMENT' : 'OFFICIAL_DOCUMENT_LINK_MISSING');
  return [...matches][0];
}

const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
/** Weekly reconciliation starts at the live service page, not a permanently pinned 2024 directory. */
export function discoverIndustryCatalog(html: string, parentUrl: string): string {
  const candidates = officialLinks(html, parentUrl).flatMap(link => {
    const m = link.label.match(/^Вопросы\s+тестирования\s+с\s+(\d{1,2})\s+(\S+)\s+(20\d{2})\b/iu);
    if (!m) return [];
    const month = MONTHS.indexOf(m[2].toLowerCase());
    const day = Number(m[1]), year = Number(m[3]);
    const time = Date.UTC(year, month, day), date = new Date(time);
    if (month < 0 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) throw new Error('OFFICIAL_CATALOG_DATE_INVALID');
    return [{ ...link, time }];
  }).sort((a, b) => b.time - a.time);
  if (!candidates.length) throw new Error('OFFICIAL_CATALOG_MISSING');
  const newest = [...new Set(candidates.filter(x => x.time === candidates[0].time).map(x => x.url))];
  if (newest.length !== 1) throw new Error('OFFICIAL_CATALOG_AMBIGUOUS');
  return newest[0];
}

export function discoverA1Section(html: string, catalogUrl: string): string {
  const links = [...new Set(officialLinks(html, catalogUrl).filter(x => /^Общие\s+требования\s+промышленной\s+безопасности$/iu.test(x.label)).map(x => x.url))];
  if (links.length !== 1) throw new Error('OFFICIAL_A1_SECTION_AMBIGUOUS');
  return links[0];
}

export function discoverEnergyTitle(html: string, pageUrl: string): string {
  const links = [...new Set(officialLinks(html, pageUrl).filter(x => /^Титульный\s+лист$/iu.test(x.label) && /\.pdf$/i.test(x.url)).map(x => x.url))];
  if (links.length !== 1) throw new Error('OFFICIAL_ENERGY_TITLE_AMBIGUOUS');
  return links[0];
}

export function assertDocumentMagic(bytes: Uint8Array, parser: SourceDescriptor['parser']): void {
  if (parser === 'industrial-pdf') {
    if (new TextDecoder('ascii').decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('OFFICIAL_NOT_PDF');
  } else if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) throw new Error('OFFICIAL_NOT_XLSX');
}

/** Inspect central-directory bounds before any library inflates XML or shared strings. */
type ZipEntry = { method: number; start: number; compressed: number; uncompressed: number; crc32: number };
export function assertBoundedXlsx(bytes: Uint8Array): ZipEntry[] {
  if (bytes.length < 22) throw new Error('XLSX_INVALID_ZIP');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
    if (view.getUint32(p, true) === 0x06054b50 && p + 22 + view.getUint16(p + 20, true) === bytes.length) { end = p; break; }
  }
  if (end < 0 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) throw new Error('XLSX_INVALID_ZIP');
  const count = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  const start = view.getUint32(end + 16, true);
  if (!count || count > 256 || start + size !== end || view.getUint16(end + 8, true) !== count) throw new Error('XLSX_ZIP_LIMIT');
  let cursor = start, total = 0;
  const names = new Set<string>();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw new Error('XLSX_INVALID_ZIP');
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true), uncompressed = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true), extra = view.getUint16(cursor + 30, true), comment = view.getUint16(cursor + 32, true);
    const next = cursor + 46 + nameLength + extra + comment;
    // SheetJS reads local headers. Data-descriptor / encrypted variants require
    // another reviewed parser path, rather than trusting different local sizes.
    if (next > end || flags & 9 || ![0, 8].includes(method)) throw new Error('XLSX_INVALID_ZIP');
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (names.has(name) || name.startsWith('/') || /(^|[\\/])\.\.([\\/]|$)/.test(name) || name.includes('\\') || /vbaProject|externalLinks/i.test(name)) throw new Error('XLSX_UNSAFE_ENTRY');
    names.add(name);
    total += uncompressed;
    if (uncompressed > 12 * 1024 * 1024 || total > 40 * 1024 * 1024 || uncompressed > Math.max(4096, compressed * 250)) throw new Error('XLSX_INFLATION_LIMIT');
    const local = view.getUint32(cursor + 42, true);
    if (local + 30 > start || view.getUint32(local, true) !== 0x04034b50) throw new Error('XLSX_INVALID_ZIP');
    const localNameLength = view.getUint16(local + 26, true);
    if (localNameLength !== nameLength || view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method
      || view.getUint32(local + 14, true) !== view.getUint32(cursor + 16, true)
      || view.getUint32(local + 18, true) !== compressed || view.getUint32(local + 22, true) !== uncompressed) throw new Error('XLSX_HEADER_MISMATCH');
    const dataStart = local + 30 + localNameLength + view.getUint16(local + 28, true);
    if (dataStart + compressed > start) throw new Error('XLSX_INVALID_ZIP');
    for (let j = 0; j < nameLength; j++) if (bytes[local + 30 + j] !== bytes[cursor + 46 + j]) throw new Error('XLSX_HEADER_MISMATCH');
    entries.push({ method, start: dataStart, compressed, uncompressed, crc32: view.getUint32(cursor + 16, true) });
    cursor = next;
  }
  if (cursor !== end || !names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) throw new Error('XLSX_INVALID_WORKBOOK');
  return entries;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1;
  return c >>> 0;
});
/** Both ZIP headers can lie. Verify actual native streamed output before SheetJS
 * gets the file, with bounded chunks and no accumulation of inflated XML. */
export async function validateInflatedXlsx(bytes: Uint8Array): Promise<void> {
  const entries = assertBoundedXlsx(bytes);
  let total = 0;
  for (const entry of entries) {
    const input = bytes.slice(entry.start, entry.start + entry.compressed);
    const stream = new Blob([input]).stream();
    const reader = (entry.method === 8 ? stream.pipeThrough(new DecompressionStream('deflate-raw')) : stream).getReader();
    let length = 0, crc = 0xffffffff;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.length; total += chunk.value.length;
        if (length > entry.uncompressed || length > 12 * 1024 * 1024 || total > 40 * 1024 * 1024) {
          await reader.cancel(); throw new Error('XLSX_ACTUAL_INFLATION_LIMIT');
        }
        for (const byte of chunk.value) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ crc >>> 8;
      }
    } finally { reader.releaseLock(); }
    if (length !== entry.uncompressed || ((crc ^ 0xffffffff) >>> 0) !== entry.crc32) throw new Error('XLSX_ACTUAL_DATA_MISMATCH');
  }
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
