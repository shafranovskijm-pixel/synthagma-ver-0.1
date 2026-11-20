import { sha256 } from './official-source.ts';

/** Public RSS discovery only. This is not the question-bank fetch allowlist. */
export const RTN_NEWS_RSS_URL = 'https://www.gosnadzor.ru/news/rss/';
export const RTN_NEWS_BYTE_LIMIT = 1024 * 1024;
export const RTN_NEWS_TIMEOUT_MS = 20_000;
const ITEM_LIMIT = 200;
const NODE_LIMIT = 4096;
const DEPTH_LIMIT = 24;
const EXCERPT_LIMIT = 600;
const fail = (code: string): never => { throw new Error(`RTN_NEWS_${code}`); };

export type RtnNewsItem = {
  canonical_url: string;
  title: string;
  source_excerpt: string;
  published_at: string;
  content_sha256: string;
};
export type RtnNewsFeed = {
  source_url: typeof RTN_NEWS_RSS_URL;
  resolved_feed_url: string;
  response_sha256: string;
  raw_item_count: number;
  items: RtnNewsItem[];
  coverage: {
    kind: 'finite_rss_window';
    complete_archive: false;
    older_items_unknown: true;
    oldest_published_at: string | null;
    newest_published_at: string | null;
  };
};

function exactUrl(input: string, kind: 'feed' | 'article', allowLegacyHttp = false): URL {
  // Check the original string before WHATWG URL dot/backslash normalization.
  if (typeof input !== 'string' || input.length > 1024 || /[\\\s\u0000-\u001f\u007f]/u.test(input)) return fail('UNTRUSTED_URL');
  const match = /^(https?):\/\/(www\.)?gosnadzor\.ru(\/[^?#]*)$/.exec(input);
  if (!match || (match[1] !== 'https' && !allowLegacyHttp)) return fail('UNTRUSTED_URL');
  if (kind === 'feed' ? match[3] !== '/news/rss/' : !/^\/news\/[1-9]\d{0,5}\/[1-9]\d{0,11}\/$/.test(match[3])) return fail('UNTRUSTED_PATH');
  const url = new URL(input);
  if (url.username || url.password || url.port || url.search || url.hash) return fail('UNTRUSTED_URL');
  return url;
}

/** Legacy HTTP article links in the official RSS are data, never fetched here. */
export function canonicalRtnNewsArticleUrl(input: string): string {
  const url = exactUrl(input, 'article', true);
  return `https://www.gosnadzor.ru${url.pathname}`;
}

function xmlCharacter(cp: number): boolean {
  return cp === 9 || cp === 10 || cp === 13 || cp >= 0x20 && cp <= 0xd7ff
    || cp >= 0xe000 && cp <= 0xfffd || cp >= 0x10000 && cp <= 0x10ffff;
}

function entityValue(value: string): string | null {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  if (Object.hasOwn(named, value)) return named[value];
  if (!/^#(?:x[0-9a-f]+|\d+)$/i.test(value)) return null;
  const cp = value[1]?.toLowerCase() === 'x' ? parseInt(value.slice(2), 16) : Number(value.slice(1));
  return Number.isSafeInteger(cp) && xmlCharacter(cp) ? String.fromCodePoint(cp) : null;
}

function xmlEntities(text: string): string {
  return text.replace(/&([^;\s<&]*);|&/g, (match, value: string | undefined) => {
    const decoded = value === undefined ? null : entityValue(value);
    return decoded === null ? fail('XML_ENTITY_INVALID') : decoded;
  });
}

type XmlNode = { name: string; attributes: Record<string, string>; children: (XmlNode | string)[] };
const xmlName = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;

/** Small bounded RSS XML reader. No DTD, entity declarations, external I/O or recovery. */
function parseXml(text: string): XmlNode {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) return fail('XML_DECLARATION_FORBIDDEN');
  for (const character of text) if (!xmlCharacter(character.codePointAt(0)!)) return fail('XML_CHARACTER_INVALID');
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null, at = 0, count = 0, declaration = false;
  const appendText = (value: string, cdata = false) => {
    if (!stack.length) { if (value.trim()) fail('XML_OUTSIDE_ROOT'); return; }
    if (value.includes(']]>') && !cdata) fail('XML_TEXT_INVALID');
    stack[stack.length - 1].children.push(cdata ? value : xmlEntities(value));
  };
  while (at < text.length) {
    if (text[at] !== '<') {
      const end = text.indexOf('<', at);
      appendText(text.slice(at, end < 0 ? text.length : end)); at = end < 0 ? text.length : end; continue;
    }
    if (text.startsWith('<!--', at)) {
      const end = text.indexOf('-->', at + 4);
      if (end < 0 || text.slice(at + 4, end).includes('--')) return fail('XML_COMMENT_INVALID');
      at = end + 3; continue;
    }
    if (text.startsWith('<![CDATA[', at)) {
      const end = text.indexOf(']]>', at + 9);
      if (!stack.length || end < 0) return fail('XML_CDATA_INVALID');
      appendText(text.slice(at + 9, end), true); at = end + 3; continue;
    }
    if (text.startsWith('<?', at)) {
      const end = text.indexOf('?>', at + 2);
      const value = end < 0 ? '' : text.slice(at + 2, end);
      if (at !== 0 || declaration || !/^xml\s+version\s*=\s*(["'])1\.0\1(?:\s+encoding\s*=\s*(["'])(?:UTF-8|windows-1251|cp1251)\2)?(?:\s+standalone\s*=\s*(["'])(?:yes|no)\3)?\s*$/i.test(value)) return fail('XML_PROCESSING_INSTRUCTION_INVALID');
      declaration = true; at = end + 2; continue;
    }
    let end = at + 1, quote = '';
    for (; end < text.length; end++) {
      const char = text[end];
      if (end - at > 4096) return fail('XML_TAG_TOO_LARGE');
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end === text.length || quote) return fail('XML_TAG_INVALID');
    const tag = text.slice(at + 1, end);
    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim();
      if (!xmlName.test(name) || !stack.length || stack.pop()!.name !== name) return fail('XML_CLOSE_INVALID');
    } else {
      const selfClosing = tag.endsWith('/'), body = selfClosing ? tag.slice(0, -1) : tag;
      const match = /^([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*)$/.exec(body);
      if (!match || ++count > NODE_LIMIT) return fail('XML_NODE_LIMIT');
      const attributes: Record<string, string> = Object.create(null);
      let rest = match[2], attributeCount = 0;
      while (rest.trim()) {
        const attribute = /^\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(rest);
        if (!attribute || Object.hasOwn(attributes, attribute[1]) || ++attributeCount > 32) return fail('XML_ATTRIBUTE_INVALID');
        attributes[attribute[1]] = xmlEntities(attribute[2] ?? attribute[3]); rest = rest.slice(attribute[0].length);
      }
      const node: XmlNode = { name: match[1], attributes, children: [] };
      if (stack.length) stack[stack.length - 1].children.push(node);
      else { if (root) return fail('XML_MULTIPLE_ROOTS'); root = node; }
      if (!selfClosing) { if (stack.length >= DEPTH_LIMIT) return fail('XML_DEPTH_LIMIT'); stack.push(node); }
    }
    at = end + 1;
  }
  if (!root || stack.length) return fail('XML_INCOMPLETE');
  return root;
}

function children(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((child): child is XmlNode => typeof child !== 'string' && child.name === name);
}
function nodeText(node: XmlNode): string {
  return node.children.map(child => typeof child === 'string' ? child : nodeText(child)).join('');
}
function field(node: XmlNode, name: string, required = true): string {
  const nodes = children(node, name);
  if (nodes.length > 1 || required && nodes.length !== 1) return fail('RSS_FIELD_INVALID');
  // RSS scalar fields use text/CDATA, not a silently flattened foreign schema.
  if (nodes.some(value => value.attributes.xmlns || value.children.some(child => typeof child !== 'string'))) return fail('RSS_FIELD_INVALID');
  return nodes.length ? nodeText(nodes[0]).trim() : '';
}

function plainText(value: string): string {
  if (value.length > 32_768) return fail('RSS_FIELD_TOO_LARGE');
  let text = value;
  // HTML entities can occur inside CDATA; never return HTML or image markup.
  for (let pass = 0; pass < 2; pass++) text = text.replace(/&([^;\s<&]+);/g, (match, entity: string) => {
    if (entity === 'nbsp') return ' ';
    const decoded = entityValue(entity);
    if (decoded === null && entity.startsWith('#')) return fail('RSS_ENTITY_INVALID');
    return decoded ?? match;
  });
  return text.replace(/<!--[^]*?-->/g, ' ')
    .replace(/<(script|style|iframe|object|svg)\b[^>]*>[^]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/[<>]/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** Dates without an explicit zone are unknown, not machine-local dates. */
export function parseRtnNewsDate(value: string): string {
  const match = /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+)?(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+([+-]\d{4}|UT|UTC|GMT)$/.exec(value.trim());
  if (!match) return fail('DATE_INVALID');
  const [, weekday, day, month, year, hour, minute, second = '00', zone] = match;
  const y = Number(year), m = MONTHS.indexOf(month), d = Number(day), h = Number(hour), n = Number(minute), s = Number(second);
  const local = new Date(Date.UTC(y, m, d, h, n, s));
  if (y < 1900 || y > 2200 || h > 23 || n > 59 || s > 59 || d < 1 || local.getUTCFullYear() !== y || local.getUTCMonth() !== m || local.getUTCDate() !== d) return fail('DATE_INVALID');
  if (weekday && ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][local.getUTCDay()] !== weekday) return fail('DATE_INVALID');
  let offset = 0;
  if (/^[+-]/.test(zone)) {
    const zh = Number(zone.slice(1, 3)), zm = Number(zone.slice(3));
    if (zh > 14 || zm > 59 || zh === 14 && zm !== 0) return fail('DATE_INVALID');
    offset = (zh * 60 + zm) * (zone[0] === '+' ? 1 : -1);
  }
  return new Date(local.getTime() - offset * 60_000).toISOString();
}

function decodeXml(bytes: Uint8Array, contentType: string): string {
  if (!bytes.byteLength || bytes.byteLength > RTN_NEWS_BYTE_LIMIT) return fail('BODY_SIZE_INVALID');
  const prefix = new TextDecoder().decode(bytes.subarray(0, 512));
  const header = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1];
  const declared = /^\s*<\?xml\b[^?]*encoding\s*=\s*["']([\w-]+)/i.exec(prefix)?.[1];
  const normalized = (encoding: string) => encoding.toLowerCase() === 'cp1251' ? 'windows-1251' : encoding.toLowerCase() === 'utf8' ? 'utf-8' : encoding.toLowerCase();
  const charset = normalized(declared || header || 'utf-8');
  if (!['utf-8', 'windows-1251'].includes(charset)) return fail('ENCODING_UNSUPPORTED');
  if (header && declared && normalized(header) !== normalized(declared)) return fail('ENCODING_MISMATCH');
  try { return new TextDecoder(charset, { fatal: true }).decode(bytes); }
  catch { return fail('ENCODING_INVALID'); }
}

export async function parseRtnNewsRss(bytes: Uint8Array, contentType = 'application/rss+xml; charset=utf-8', resolvedUrl = RTN_NEWS_RSS_URL): Promise<RtnNewsFeed> {
  const feedUrl = exactUrl(resolvedUrl, 'feed').href;
  const root = parseXml(decodeXml(bytes, contentType));
  if (root.name !== 'rss' || root.attributes.version !== '2.0' || root.attributes.xmlns) return fail('RSS_ROOT_INVALID');
  const channels = children(root, 'channel');
  if (channels.length !== 1 || channels[0].attributes.xmlns) return fail('RSS_CHANNEL_INVALID');
  if (!field(channels[0], 'title') || !field(channels[0], 'link')) return fail('RSS_CHANNEL_INVALID');
  if (channels[0].children.some(child => typeof child !== 'string' && child.name.endsWith(':item'))) return fail('RSS_ITEM_SHAPE_INVALID');
  const nodes = children(channels[0], 'item');
  if (nodes.length > ITEM_LIMIT) return fail('RSS_ITEM_LIMIT');
  const byUrl = new Map<string, RtnNewsItem>();
  for (const node of nodes) {
    if (node.attributes.xmlns) return fail('RSS_ITEM_SHAPE_INVALID');
    const canonical_url = canonicalRtnNewsArticleUrl(field(node, 'link'));
    const title = plainText(field(node, 'title')), sourceText = plainText(field(node, 'description', false));
    if (!title || title.length > 500) return fail('RSS_TITLE_INVALID');
    const published_at = parseRtnNewsDate(field(node, 'pubDate'));
    const content_sha256 = await sha256(new TextEncoder().encode(JSON.stringify({ canonical_url, title, source_text: sourceText, published_at })));
    const item: RtnNewsItem = { canonical_url, title, source_excerpt: Array.from(sourceText).slice(0, EXCERPT_LIMIT).join(''), published_at, content_sha256 };
    const prior = byUrl.get(canonical_url);
    if (prior && prior.content_sha256 !== item.content_sha256) return fail('CONFLICTING_DUPLICATE');
    if (!prior) byUrl.set(canonical_url, item);
  }
  const items = [...byUrl.values()], dates = items.map(item => item.published_at).sort();
  return {
    source_url: RTN_NEWS_RSS_URL, resolved_feed_url: feedUrl, response_sha256: await sha256(bytes), raw_item_count: nodes.length, items,
    coverage: { kind: 'finite_rss_window', complete_archive: false, older_items_unknown: true, oldest_published_at: dates[0] ?? null, newest_published_at: dates.at(-1) ?? null },
  };
}

/** One fixed public endpoint; no credentials, caller URLs, cookies or automatic retry. */
export async function fetchRtnNewsRss(fetcher: typeof fetch = fetch): Promise<RtnNewsFeed> {
  let url = RTN_NEWS_RSS_URL;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), RTN_NEWS_TIMEOUT_MS);
  try {
    for (let redirects = 0; redirects <= 4; redirects++) {
      const response = await fetcher(url, { method: 'GET', redirect: 'manual', credentials: 'omit', signal: controller.signal, headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
      if ([301,302,303,307,308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location || redirects === 4) return fail('REDIRECT_LIMIT');
        // Exact matching rejects encoded paths, dot segments, queries and downgraded destinations.
        url = exactUrl(location.startsWith('/') ? `${new URL(url).origin}${location}` : location, 'feed').href;
        continue;
      }
      if (response.status !== 200 || !response.body) { await response.body?.cancel(); return fail(`HTTP_${response.status}`); }
      if (!/^(?:application\/(?:rss\+xml|xml)|text\/xml)(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) { await response.body.cancel(); return fail('CONTENT_TYPE_INVALID'); }
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > RTN_NEWS_BYTE_LIMIT)) { await response.body.cancel(); return fail('BODY_SIZE_INVALID'); }
      const reader = response.body.getReader(), parts: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          controller.signal.throwIfAborted();
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > RTN_NEWS_BYTE_LIMIT) { await reader.cancel(); return fail('BODY_SIZE_INVALID'); }
          parts.push(part.value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.length; }
      const result = await parseRtnNewsRss(bytes, response.headers.get('content-type')!, url);
      controller.signal.throwIfAborted();
      return result;
    }
    return fail('REDIRECT_LIMIT');
  } catch (error) {
    if (controller.signal.aborted) return fail('FETCH_TIMEOUT');
    if (error instanceof Error && /^RTN_NEWS_[A-Z0-9_]+$/.test(error.message)) throw error;
    return fail('FETCH_FAILED');
  } finally { clearTimeout(timeout); }
}
