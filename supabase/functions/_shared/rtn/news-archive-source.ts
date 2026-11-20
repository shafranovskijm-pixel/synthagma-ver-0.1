import { sha256 } from './official-source.ts';

/** Discovery of the observed public listing only; not RSS/event admission. */
export const RTN_ARCHIVE_ROOT_URL = 'https://www.gosnadzor.ru/news/';
export const RTN_ARCHIVE_BYTE_LIMIT = 1024 * 1024;
export const RTN_ARCHIVE_TIMEOUT_MS = 20_000;
const PAGE_LIMIT = 10, ITEM_LIMIT = 20, INVOCATION_ATTEMPTS = 3;
const CONTENT_TYPE_LIMIT = 128;
const INVOCATION_BYTES = 3 * RTN_ARCHIVE_BYTE_LIMIT, INVOCATION_MS = 70_000;
class ArchiveError extends Error {
  constructor(code: string) { super(`RTN_ARCHIVE_${code}`); }
}
const fail = (code: string): never => { throw new ArchiveError(code); };

export type RtnArchiveCandidate = {
  canonical_url: string;
  title: string;
  source_date: string;
  source_date_literal: string;
  date_precision: 'day';
  ordinal: number;
};
export type RtnArchivePage = {
  adapter_version: 'rtn-news-archive-v1';
  page_url: string;
  page_number: number;
  response_sha256: string;
  response_bytes: number;
  items: RtnArchiveCandidate[];
  next_page_url: string | null;
  pagination_state: 'adjacent' | 'terminal' | 'page_cap';
  oldest_source_date: string;
  newest_source_date: string;
  date_precision: 'day';
  complete_archive: false;
  exact_publication_times_known: false;
};
export type RtnArchiveUsage = {
  get_attempts: number;
  reserved_bytes: number;
  response_bytes: number;
  elapsed_ms: number;
};
export type RtnArchiveObservation = {
  content_type: string;
  decoded_encoding: 'utf-8' | 'windows-1251';
  body_bytes_seen: number;
};
export type RtnArchiveFetchResult = {
  page: RtnArchivePage;
  original_bytes: Uint8Array;
  observation: RtnArchiveObservation;
};

function pageIdentity(raw: string, observed = false): { url: string; number: number } {
  if (typeof raw !== 'string' || raw.length > 256) return fail('PAGE_URL_INVALID');
  const absolute = observed && raw.startsWith('/news/') ? `https://www.gosnadzor.ru${raw}` : raw;
  // Original bytes are checked before WHATWG URL could normalize a path/port.
  const match = /^https:\/\/www\.gosnadzor\.ru\/news\/(?:\?PAGEN_1=([1-9]\d{0,5}))?$/.exec(absolute);
  if (!match) return fail('PAGE_URL_INVALID');
  const number = match[1] === undefined ? 1 : Number(match[1]);
  if (match[1] !== undefined && number === 1 || !observed && number > PAGE_LIMIT) return fail('PAGE_URL_INVALID');
  return { url: absolute, number };
}

function articleIdentity(raw: string): string {
  const match = /^(?:https:\/\/(?:www\.)?gosnadzor\.ru)?(\/news\/[1-9]\d{0,5}\/[1-9]\d{0,11}\/)$/u.exec(raw);
  if (!match) return fail('ARTICLE_URL_INVALID');
  return `https://www.gosnadzor.ru${match[1]}`;
}

function entities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…', rarr: '→',
  };
  return value.replace(/&([^;\s<&]+);/g, (_, name: string) => {
    if (Object.hasOwn(named, name)) return named[name];
    if (!/^#(?:x[0-9a-f]+|\d+)$/i.test(name)) return fail('ENTITY_INVALID');
    const cp = name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    if (!Number.isSafeInteger(cp) || cp < 32 || cp > 0x10ffff || cp >= 0xd800 && cp <= 0xdfff || cp === 0xfffd) return fail('ENTITY_INVALID');
    return String.fromCodePoint(cp);
  });
}

type Node = { tag: string; attrs: Record<string, string>; children: (Node | string)[] };
const classes = (node: Node, name: string) => (node.attrs.class || '').split(/\s+/).includes(name);
const elements = (node: Node): Node[] => node.children.filter((item): item is Node => typeof item !== 'string');
const text = (node: Node): string => node.children.map(item => typeof item === 'string' ? item : text(item)).join('');
const plain = (node: Node): string => entities(text(node)).replace(/<[^>]*>/g, ' ').replace(/[<>]/g, ' ')
  .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
function descendants(node: Node, predicate: (node: Node) => boolean): Node[] {
  const result: Node[] = [];
  for (const child of elements(node)) {
    if (predicate(child)) result.push(child);
    result.push(...descendants(child, predicate));
  }
  return result;
}

/** Inert bounded tokenizer. The old surrounding site is not treated as data.
 * Only the news-list subtree must be balanced; scripts/styles are never run. */
function listing(html: string): Node {
  let at = 0, tokens = 0, nodes = 0, root: Node | null = null;
  const stack: Node[] = [];
  const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  while (at < html.length) {
    if (html[at] !== '<') {
      const end = html.indexOf('<', at), value = html.slice(at, end < 0 ? html.length : end);
      if (stack.length) stack[stack.length - 1].children.push(value);
      at = end < 0 ? html.length : end; continue;
    }
    if (++tokens > 20_000) return fail('HTML_TOKEN_LIMIT');
    if (html.startsWith('<!--', at)) {
      const end = html.indexOf('-->', at + 4);
      if (end < 0) return fail('HTML_INCOMPLETE');
      at = end + 3; continue;
    }
    let end = at + 1, quote = '';
    for (; end < html.length; end++) {
      if (end - at > 8192) return fail('HTML_TAG_LIMIT');
      const c = html[end];
      if (quote) { if (c === quote) quote = ''; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    if (end === html.length || quote) return fail('HTML_INCOMPLETE');
    const tag = html.slice(at + 1, end); at = end + 1;
    if (/^!doctype\s/i.test(tag) && !stack.length) continue;
    const close = /^\/([a-z][\w:-]*)\s*$/i.exec(tag);
    if (close) {
      if (stack.length && stack.pop()!.tag !== close[1].toLowerCase()) return fail('HTML_STRUCTURE_INVALID');
      continue;
    }
    const match = /^([a-z][\w:-]*)([\s\S]*)$/i.exec(tag);
    if (!match) { if (stack.length) return fail('HTML_STRUCTURE_INVALID'); continue; }
    const name = match[1].toLowerCase(), attrs: Record<string, string> = Object.create(null);
    let rest = match[2].replace(/\/\s*$/, ''), attrCount = 0;
    while (rest.trim()) {
      const a = /^\s+([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"<]*)"|'([^'<]*)'|([^\s"'`=<>]+)))?/.exec(rest);
      if (!a || ++attrCount > 48 || Object.hasOwn(attrs, a[1].toLowerCase())) return fail('HTML_ATTRIBUTE_INVALID');
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? ''; rest = rest.slice(a[0].length);
    }
    const node: Node = { tag: name, attrs, children: [] };
    if (name === 'script' || name === 'style') {
      if (stack.length) return fail('HTML_ACTIVE_CONTENT');
      const expression = new RegExp(`</${name}\\s*>`, 'ig'); expression.lastIndex = at;
      const closing = expression.exec(html);
      if (!closing) return fail('HTML_INCOMPLETE');
      at = expression.lastIndex; continue;
    }
    if (name === 'div' && classes(node, 'news-list')) {
      if (root) return fail('MULTIPLE_LISTS');
      if (/\/\s*$/.test(match[2]) || Object.keys(attrs).some(key => /^on/i.test(key))) return fail('HTML_STRUCTURE_INVALID');
      root = node; stack.push(node); continue;
    }
    if (!stack.length) continue;
    if (++nodes > 4096 || stack.length > 24) return fail('HTML_NODE_LIMIT');
    if (['base','iframe','object','svg','form','embed'].includes(name) || Object.keys(attrs).some(key => /^on/i.test(key))) return fail('HTML_ACTIVE_CONTENT');
    stack[stack.length - 1].children.push(node);
    if (!voids.has(name)) {
      if (/\/\s*$/.test(match[2])) return fail('HTML_STRUCTURE_INVALID');
      stack.push(node);
    }
  }
  if (!root || stack.length) return fail('HTML_STRUCTURE_INVALID');
  return root;
}

function decode(bytes: Uint8Array, contentType: string): { html: string; encoding: RtnArchiveObservation['decoded_encoding'] } {
  if (!bytes.byteLength || bytes.byteLength > RTN_ARCHIVE_BYTE_LIMIT) return fail('BODY_SIZE_INVALID');
  if (contentType.length > CONTENT_TYPE_LIMIT || !/^text\/html(?:\s*;|\s*$)/i.test(contentType)) return fail('MIME_INVALID');
  const normalize = (input: string) => input.toLowerCase().replace(/^utf8$/, 'utf-8').replace(/^cp1251$/, 'windows-1251');
  const headerCharsets = [...contentType.matchAll(/charset\s*=\s*["']?([\w-]+)/gi)].map(match => normalize(match[1]));
  if (new Set(headerCharsets).size > 1 || contentType.includes(',')) return fail('ENCODING_MISMATCH');
  const header = headerCharsets[0];
  const prefix = new TextDecoder().decode(bytes.subarray(0, 8192));
  const metas = [...prefix.matchAll(/<meta\s+[^>]*>/gi)].flatMap(match => {
    const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(match[0])?.[1];
    return charset ? [normalize(charset)] : [];
  });
  const declared = [...new Set(metas)];
  if (declared.length > 1 || header && declared.length && normalize(header) !== declared[0]) return fail('ENCODING_MISMATCH');
  const encoding = declared[0] || normalize(header || 'utf-8');
  if (encoding !== 'utf-8' && encoding !== 'windows-1251') return fail('ENCODING_UNSUPPORTED');
  let html: string;
  try { html = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { return fail('ENCODING_INVALID'); }
  if (html.includes('\ufffd') || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(html)) return fail('ENCODING_INVALID');
  return { html, encoding };
}

function sourceDate(value: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return fail('DATE_INVALID');
  const [, d, m, y] = match, day = Number(d), month = Number(m), year = Number(y);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2200 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return fail('DATE_INVALID');
  return `${y}-${m}-${d}`;
}

async function parseArchiveDocument(bytes: Uint8Array, pageUrl: string, contentType: string): Promise<{ page: RtnArchivePage; decoded_encoding: RtnArchiveObservation['decoded_encoding'] }> {
  const identity = pageIdentity(pageUrl), decoded = decode(bytes, contentType), root = listing(decoded.html);
  const rows = descendants(root, node => classes(node, 'news-item'));
  if (!rows.length || rows.length > ITEM_LIMIT || rows.some(node => node.tag !== 'p' || !elements(root).includes(node))) return fail('ITEM_SCHEMA_INVALID');
  const seen = new Set<string>();
  const items = rows.map((node, index): RtnArchiveCandidate => {
    const dates = descendants(node, value => classes(value, 'news-date-time'));
    const anchors = descendants(node, value => value.tag === 'a');
    const titles = anchors.filter(value => !classes(value, 'read-more'));
    if (dates.length !== 1 || dates[0].tag !== 'span' || elements(dates[0]).length || titles.length !== 1
      || anchors.length > 2 || anchors.some(value => !Object.hasOwn(value.attrs, 'href'))
      || elements(titles[0]).length !== 1 || elements(titles[0])[0].tag !== 'b') return fail('ITEM_SCHEMA_INVALID');
    const canonical = articleIdentity(entities(titles[0].attrs.href));
    if (anchors.some(value => articleIdentity(entities(value.attrs.href)) !== canonical) || seen.has(canonical)) return fail('DUPLICATE_OR_CONFLICTING_ITEM');
    seen.add(canonical);
    const title = plain(titles[0]);
    if (!title || Array.from(title).length > 500) return fail('TITLE_INVALID');
    const literal = entities(text(dates[0])).trim();
    return { canonical_url: canonical, title, source_date: sourceDate(literal), source_date_literal: literal, date_precision: 'day', ordinal: index + 1 };
  });
  if (items.some((item, i) => i > 0 && item.source_date > items[i - 1].source_date)) return fail('DATE_ORDER_AMBIGUOUS');
  // The observed first font.text is a count label. Only the separate font with
  // an explicit current-page witness and След. controls is the pager.
  const pagers = elements(root).filter(node => node.tag === 'font' && classes(node, 'text')
    && (elements(node).some(child => child.tag === 'b') || plain(node).includes('След.')));
  if (pagers.length !== 1) return fail('PAGINATION_AMBIGUOUS');
  const pager = pagers[0], current = elements(pager).filter(node => node.tag === 'b');
  if (current.length !== 1 || plain(current[0]) !== String(identity.number)) return fail('PAGINATION_AMBIGUOUS');
  const links = descendants(pager, node => node.tag === 'a').map(node => ({ label: plain(node), ...pageIdentity(entities(node.attrs.href || ''), true) }));
  if (links.some(link => /^\d+$/.test(link.label) ? Number(link.label) !== link.number
    : !['Начало','Пред.','След.','Конец'].includes(link.label)
      || link.label === 'Начало' && link.number !== 1
      || link.label === 'Пред.' && link.number !== identity.number - 1
      || link.label === 'Конец' && link.number < identity.number)) return fail('PAGINATION_AMBIGUOUS');
  const next = links.filter(link => link.label === 'След.');
  // In the observed template disabled controls are standalone text separated
  // by pipes, not links. Never infer a disabled next control from link text or
  // a substring such as clickable "След. (начало)". A different template must
  // be reviewed instead of being silently interpreted as the archive's end.
  const disabledNext = pager.children.filter((child): child is string => typeof child === 'string')
    .flatMap(child => entities(child).split('|')).filter(value => value.trim() === 'След.').length;
  if (disabledNext > 1 || disabledNext && next.length) return fail('PAGINATION_AMBIGUOUS');
  let pagination: RtnArchivePage['pagination_state'], nextUrl: string | null = null;
  if (next.length === 1 && next[0].number === identity.number + 1) {
    pagination = next[0].number > PAGE_LIMIT ? 'page_cap' : 'adjacent';
    if (pagination === 'adjacent') nextUrl = next[0].url;
  } else if (next.length === 0 && disabledNext === 1 && !links.some(link => link.number > identity.number)) pagination = 'terminal';
  else return fail('PAGINATION_AMBIGUOUS');
  const page: RtnArchivePage = {
    adapter_version: 'rtn-news-archive-v1', page_url: identity.url, page_number: identity.number,
    response_sha256: await sha256(bytes), response_bytes: bytes.byteLength, items,
    next_page_url: nextUrl, pagination_state: pagination,
    oldest_source_date: items[items.length - 1].source_date, newest_source_date: items[0].source_date,
    date_precision: 'day', complete_archive: false, exact_publication_times_known: false,
  };
  return { page, decoded_encoding: decoded.encoding };
}

/** The public parser keeps its page-only semantic DTO. Transport observations
 * are returned only by the fetch path, outside the discovery page. */
export async function parseRtnNewsArchivePage(bytes: Uint8Array, pageUrl = RTN_ARCHIVE_ROOT_URL, contentType = 'text/html; charset=utf-8'): Promise<RtnArchivePage> {
  return (await parseArchiveDocument(bytes, pageUrl, contentType)).page;
}

function discard(response: Response): void {
  try { void response.body?.cancel().catch(() => undefined); } catch { /* Never retry cancellation. */ }
}
function abortable<T>(pending: Promise<T>, signal: AbortSignal, late?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const aborted = () => { if (!settled) { settled = true; signal.removeEventListener('abort', aborted); reject(signal.reason); } };
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    pending.then(value => {
      if (settled) { late?.(value); return; }
      settled = true; signal.removeEventListener('abort', aborted); resolve(value);
    }, error => {
      if (settled) return;
      settled = true; signal.removeEventListener('abort', aborted); reject(error);
    });
  });
}

/** No network client/default fetch is constructed here. A future qualified
 * worker must supply only its DB-proven observed target and scoped transport.
 * Full potential bytes are reserved before GET, never refunded on failure. */
export function createRtnArchiveFetcher(deps: { fetcher: typeof fetch; now?: () => number; signal?: AbortSignal }): {
  fetchPage(pageUrl: string): Promise<RtnArchiveFetchResult>;
  usage(): RtnArchiveUsage;
} {
  const now = deps.now || Date.now;
  const started = now();
  let last = started, attempts = 0, reserved = 0, bytes = 0, busy = false;
  const elapsed = () => {
    const current = now();
    if (!Number.isFinite(current) || !Number.isFinite(started) || current < last) return fail('CLOCK_INVALID');
    last = current; return current - started;
  };
  const usage = (): RtnArchiveUsage => ({ get_attempts: attempts, reserved_bytes: reserved, response_bytes: bytes, elapsed_ms: elapsed() });
  return {
    usage,
    async fetchPage(pageUrl) {
      pageIdentity(pageUrl);
      if (busy) return fail('CONCURRENT_FETCH_FORBIDDEN');
      const duration = elapsed();
      if (duration >= INVOCATION_MS || attempts >= INVOCATION_ATTEMPTS || reserved + RTN_ARCHIVE_BYTE_LIMIT > INVOCATION_BYTES || bytes >= INVOCATION_BYTES) return fail('INVOCATION_BUDGET_EXHAUSTED');
      if (deps.signal?.aborted) return fail('ABORTED');
      busy = true; attempts++; reserved += RTN_ARCHIVE_BYTE_LIMIT;
      const controller = new AbortController();
      const callerAborted = () => controller.abort(new ArchiveError('ABORTED'));
      deps.signal?.addEventListener('abort', callerAborted, { once: true });
      const pageDeadline = Math.min(RTN_ARCHIVE_TIMEOUT_MS, INVOCATION_MS - duration);
      const timer = setTimeout(() => controller.abort(new ArchiveError('TIMEOUT')), pageDeadline);
      let response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const cancel = () => {
        if (reader) { try { void reader.cancel().catch(() => undefined); } catch { /* Best effort. */ } }
        else if (response) discard(response);
      };
      try {
        response = await abortable(deps.fetcher(pageUrl, { method: 'GET', redirect: 'manual', credentials: 'omit', headers: { Accept: 'text/html' }, signal: controller.signal }), controller.signal, discard);
        controller.signal.throwIfAborted();
        if (response.redirected || response.url && response.url !== pageUrl || response.status >= 300 && response.status < 400) return fail('REDIRECT_FORBIDDEN');
        if (response.status !== 200) return fail(`HTTP_${response.status}`);
        const contentType = response.headers.get('content-type') || '';
        if (contentType.length > CONTENT_TYPE_LIMIT || !/^text\/html(?:\s*;|\s*$)/i.test(contentType)) return fail('MIME_INVALID');
        const length = response.headers.get('content-length');
        if (length !== null && (!/^\d+$/.test(length) || Number(length) > RTN_ARCHIVE_BYTE_LIMIT)) return fail('BODY_SIZE_INVALID');
        if (!response.body) return fail('BODY_SIZE_INVALID');
        reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const part = await abortable(reader.read(), controller.signal);
          if (part.done) break;
          if (!(part.value instanceof Uint8Array)) return fail('STREAM_INVALID');
          size += part.value.byteLength; bytes += part.value.byteLength;
          if (size > RTN_ARCHIVE_BYTE_LIMIT || bytes > INVOCATION_BYTES) return fail('BODY_SIZE_INVALID');
          // Do not retain producer-owned mutable/reused stream buffers as the
          // supposedly immutable original that will later be hash-verified.
          chunks.push(part.value.slice());
        }
        controller.signal.throwIfAborted();
        const original = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { original.set(chunk, offset); offset += chunk.byteLength; }
        const { page, decoded_encoding } = await abortable(parseArchiveDocument(original, pageUrl, contentType), controller.signal);
        const completed = elapsed();
        if (completed >= INVOCATION_MS) return fail('INVOCATION_BUDGET_EXHAUSTED');
        if (completed - duration >= pageDeadline) return fail('TIMEOUT');
        return { page, original_bytes: original, observation: { content_type: contentType, decoded_encoding, body_bytes_seen: size } };
      } catch (error) {
        cancel();
        if (error instanceof ArchiveError) throw error;
        return fail('TRANSPORT_ERROR');
      } finally {
        clearTimeout(timer); deps.signal?.removeEventListener('abort', callerAborted);
        try { reader?.releaseLock(); } catch { /* Pending failed reads may settle later. */ }
        busy = false;
      }
    },
  };
}
