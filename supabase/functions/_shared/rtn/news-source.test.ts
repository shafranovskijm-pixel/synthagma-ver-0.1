// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalRtnNewsArticleUrl, fetchRtnNewsRss, parseRtnNewsDate, parseRtnNewsRss,
  RTN_NEWS_BYTE_LIMIT, RTN_NEWS_RSS_URL, RTN_NEWS_TIMEOUT_MS,
} from './news-source';

const encode = (value: string) => new TextEncoder().encode(value);
const article = 'http://www.gosnadzor.ru/news/67/19539/';
const date = 'Fri, 20 Nov 2026 11:32:55 +0300';
const item = (title = 'Новая публикация', description = '<p>Краткое описание.</p>', url = article, published = date) =>
  `<item><title>${title}</title><link>${url}</link><description><![CDATA[${description}]]></description><pubDate>${published}</pubDate></item>`;
const feed = (items = item()) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Ростехнадзор</title><link>https://www.gosnadzor.ru/news/</link><description>Новости</description>${items}</channel></rss>`;
const response = (body = feed(), headers: Record<string, string> = {}) => new Response(encode(body), { headers: { 'content-type': 'text/xml; charset=UTF-8', ...headers } });

afterEach(() => vi.useRealTimers());

describe('official news identities and explicit dates', () => {
  it('canonicalizes only exact main-site news article identities, including legacy HTTP links as data', () => {
    expect(canonicalRtnNewsArticleUrl(article)).toBe('https://www.gosnadzor.ru/news/67/19539/');
    expect(canonicalRtnNewsArticleUrl('https://gosnadzor.ru/news/64/123/')).toBe('https://www.gosnadzor.ru/news/64/123/');
  });
  it('rejects lookalikes, private URLs, credentials, explicit ports, queries and normalized path tricks', () => {
    for (const input of [
      'https://www.gosnadzor.ru.evil.test/news/67/19539/', 'https://127.0.0.1/news/67/19539/',
      'http://169.254.169.254/news/67/19539/', 'https://u:p@www.gosnadzor.ru/news/67/19539/',
      'https://www.gosnadzor.ru:443/news/67/19539/', `${article}?next=https://evil.test`, `${article}#part`,
      'https://www.gosnadzor.ru/admin/../news/67/19539/', 'https://www.gosnadzor.ru/news/%36%37/19539/',
      'https://www.gosnadzor.ru/news/67/19539', 'https://www.gosnadzor.ru\\news\\67\\19539\\',
      ` ${article}`, `https://www.gosnadzor.ru/news/67/19539/\n`, 'https://srpov.gosnadzor.ru/news/67/19539/',
    ]) expect(() => canonicalRtnNewsArticleUrl(input), input).toThrow('RTN_NEWS_UNTRUSTED');
  });
  it('normalizes explicit offsets without depending on the execution timezone', () => {
    expect(parseRtnNewsDate(date)).toBe('2026-11-20T08:32:55.000Z');
    expect(parseRtnNewsDate('Thu, 19 Nov 2026 23:30:00 -0500')).toBe('2026-11-20T04:30:00.000Z');
    expect(parseRtnNewsDate('20 Nov 2026 08:32 GMT')).toBe('2026-11-20T08:32:00.000Z');
  });
  it('rejects missing zones, impossible dates, wrong weekdays and impossible offsets', () => {
    for (const value of ['20 Nov 2026 08:30:00', '31 Feb 2026 08:30:00 +0300', 'Mon, 20 Nov 2026 08:30:00 +0300', '20 Nov 2026 25:30:00 +0300', '20 Nov 2026 08:30:00 +1460', '20 Nov 2026 08:30:00 +1401', '2026-11-20']) expect(() => parseRtnNewsDate(value)).toThrow('DATE_INVALID');
  });
});

describe('bounded RSS2 projection, not legal or archive admission', () => {
  it('reads Cyrillic XML/CDATA and returns a safe small plain-text projection without markup, photos or inferred effective date', async () => {
    const result = await parseRtnNewsRss(encode(feed(item('Вопросы &amp; обучение', '<script>alert(1)</script><p>Открыта &lt;b&gt;новая&lt;/b&gt; публикация&nbsp;— пример.</p><img src="https://evil.test/photo.jpg">'))));
    expect(result.items[0]).toEqual({ canonical_url: 'https://www.gosnadzor.ru/news/67/19539/', title: 'Вопросы & обучение', source_excerpt: 'Открыта новая публикация — пример.', published_at: '2026-11-20T08:32:55.000Z', content_sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(result.coverage).toMatchObject({ kind: 'finite_rss_window', complete_archive: false, older_items_unknown: true });
    expect(result.items[0]).not.toHaveProperty('effective_from');
    expect(JSON.stringify(result.items)).not.toMatch(/<|photo\.jpg|alert\(1\)/);
  });
  it('labels even a complete-looking20item feed as a finite window, not a complete archive', async () => {
    const xml = feed(Array.from({ length: 20 }, (_, i) => item(`Новость ${i}`, 'Описание', `https://www.gosnadzor.ru/news/67/${100 + i}/`)).join(''));
    const result = await parseRtnNewsRss(encode(xml));
    expect(result.raw_item_count).toBe(20);
    expect(result.items).toHaveLength(20);
    expect(result.coverage.complete_archive).toBe(false);
    expect(result.coverage.oldest_published_at).toBe('2026-11-20T08:32:55.000Z');
  });
  it('deduplicates identical canonical article versions, ignoring HTTP/www and formatting differences', async () => {
    const result = await parseRtnNewsRss(encode(feed(item() + item('Новая публикация', '<p>Краткое   описание.</p>', 'https://gosnadzor.ru/news/67/19539/'))));
    expect(result.raw_item_count).toBe(2);
    expect(result.items).toHaveLength(1);
  });
  it('changes the content hash for a corrected article on a later capture without changing its identity', async () => {
    const first = await parseRtnNewsRss(encode(feed(item())));
    const corrected = await parseRtnNewsRss(encode(feed(item('Исправленная публикация'))));
    expect(corrected.items[0].canonical_url).toBe(first.items[0].canonical_url);
    expect(corrected.items[0].content_sha256).not.toBe(first.items[0].content_sha256);
    expect(corrected.response_sha256).not.toBe(first.response_sha256);
  });
  it('refuses conflicting duplicates in one response rather than selecting an arbitrary version', async () => {
    await expect(parseRtnNewsRss(encode(feed(item() + item('Другая редакция'))))).rejects.toThrow('CONFLICTING_DUPLICATE');
  });
  it('caps the displayed excerpt but hashes all bounded source text, detecting corrections beyond the excerpt', async () => {
    const first = await parseRtnNewsRss(encode(feed(item('Заголовок', 'Я'.repeat(650) + ' первый'))));
    const second = await parseRtnNewsRss(encode(feed(item('Заголовок', 'Я'.repeat(650) + ' другой'))));
    expect(Array.from(first.items[0].source_excerpt)).toHaveLength(600);
    expect(second.items[0].source_excerpt).toBe(first.items[0].source_excerpt);
    expect(second.items[0].content_sha256).not.toBe(first.items[0].content_sha256);
  });
  it('rejects missing, duplicate or malformed essential fields and malformed root/channel shape', async () => {
    for (const xml of [
      feed(item().replace(/<pubDate>[^]*?<\/pubDate>/, '')), feed(item().replace('</title>', '</title><title>Повтор</title>')),
      feed(item().replace('</item>', '</wrong>')), '<html><body>Ошибка</body></html>',
      '<rss version="2.0"><channel/></rss>', '<rss version="2.0"><channel/><channel/></rss>',
      feed(item().replace('<title>Новая публикация</title>', '<title>&unknown;</title>')),
      feed(item().replace('</item>', '')), feed(item().replace('<item>', '<item data=x>')),
      feed(item().replace('<item>', '<item data="x" data="y">')),
      feed().replace('<rss version="2.0">', '<rss version="2.0" xmlns="https://evil.test/schema">'),
      feed(item().replace('<title>Новая публикация</title>', '<title><script>wrong shape</script></title>')),
    ]) await expect(parseRtnNewsRss(encode(xml))).rejects.toThrow('RTN_NEWS_');
  });
  it('rejects DTDs, external/entity declarations and non-XML processing instructions without any external read', async () => {
    for (const xml of [
      '<!DOCTYPE rss SYSTEM "https://evil.test/schema.dtd">' + feed(),
      '<!DOCTYPE rss [<!ENTITY file SYSTEM "file:///etc/passwd">]>' + feed(),
      feed().replace('<rss', '<?xml-stylesheet href="https://evil.test/x"?><rss'),
      feed().replace('Краткое описание.', '&#0;'),
    ]) await expect(parseRtnNewsRss(encode(xml))).rejects.toThrow('RTN_NEWS_');
  });
  it('rejects namespaced item shape changes instead of silently treating them as an empty current feed', async () => {
    await expect(parseRtnNewsRss(encode(feed(item().replaceAll('<item>', '<r:item>').replaceAll('</item>', '</r:item>'))))).rejects.toThrow('RSS_ITEM_SHAPE_INVALID');
  });
  it('bounds response bytes, node depth, item count and field lengths before returning data', async () => {
    await expect(parseRtnNewsRss(new Uint8Array(RTN_NEWS_BYTE_LIMIT + 1))).rejects.toThrow('BODY_SIZE_INVALID');
    await expect(parseRtnNewsRss(encode(feed('<x>'.repeat(30) + '</x>'.repeat(30))))).rejects.toThrow('XML_DEPTH_LIMIT');
    await expect(parseRtnNewsRss(encode(feed('<x/>'.repeat(4200))))).rejects.toThrow('XML_NODE_LIMIT');
    await expect(parseRtnNewsRss(encode(feed(item().repeat(201))))).rejects.toThrow('RSS_ITEM_LIMIT');
    await expect(parseRtnNewsRss(encode(feed(item('X'.repeat(501)))))).rejects.toThrow('RSS_TITLE_INVALID');
    await expect(parseRtnNewsRss(encode(feed(item('Title', 'X'.repeat(32769)))))).rejects.toThrow('RSS_FIELD_TOO_LARGE');
  });
  it('supports an explicitly declaredWindows1251 response and rejects conflicting or unsupported encodings', async () => {
    const xml = feed(item('А')).replace('encoding="UTF-8"', 'encoding="windows-1251"').replace('Ростехнадзор', 'RTN').replace('Новости', 'News').replace('Краткое описание.', 'Description');
    const bytes = Uint8Array.from([...xml].map(char => char === 'А' ? 0xc0 : char.charCodeAt(0)));
    expect((await parseRtnNewsRss(bytes, 'text/xml; charset=windows-1251')).items[0].title).toBe('А');
    await expect(parseRtnNewsRss(bytes, 'text/xml; charset=UTF-8')).rejects.toThrow('ENCODING_MISMATCH');
    await expect(parseRtnNewsRss(encode(feed().replace('UTF-8', 'UTF-16')), 'text/xml')).rejects.toThrow('ENCODING_UNSUPPORTED');
  });
  it('permits a valid empty RSS window without claiming absence of older publications or supplying a cursor', async () => {
    const result = await parseRtnNewsRss(encode(feed('')));
    expect(result.items).toEqual([]);
    expect(result.coverage).toEqual({ kind: 'finite_rss_window', complete_archive: false, older_items_unknown: true, oldest_published_at: null, newest_published_at: null });
    expect(result).not.toHaveProperty('complete_through');
  });
});

describe('fixed public transport', () => {
  it('fetches only the fixed HTTPS feed with explicitGET/manualredirect/omitcredentials and no auth headers', async () => {
    const fetcher = vi.fn().mockResolvedValue(response());
    const result = await fetchRtnNewsRss(fetcher);
    expect(result.items).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(RTN_NEWS_RSS_URL);
    expect(init).toMatchObject({ method: 'GET', redirect: 'manual', credentials: 'omit', signal: expect.any(AbortSignal) });
    expect(Object.keys(init.headers)).toEqual(['Accept']);
  });
  it('validates every redirect before a second request, allowing only exact HTTPS feed aliases', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'https://gosnadzor.ru/news/rss/' } })).mockResolvedValueOnce(response());
    expect((await fetchRtnNewsRss(fetcher)).resolved_feed_url).toBe('https://gosnadzor.ru/news/rss/');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('refuses off-host, downgraded, article, query, encoded and normalized redirect destinations without following them', async () => {
    for (const location of [
      'https://evil.test/news/rss/', 'http://www.gosnadzor.ru/news/rss/', 'https://169.254.169.254/news/rss/',
      '/news/67/19539/', '/news/rss/?token=x', '/news/%72ss/', '/admin/../news/rss/',
      'https://www.gosnadzor.ru/admin/../news/rss/', '//evil.test/news/rss/', '../rss/',
    ]) {
      const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
      await expect(fetchRtnNewsRss(fetcher)).rejects.toThrow('RTN_NEWS_UNTRUSTED');
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('bounds valid redirect loops and never automatically retries403 or304 as success', async () => {
    const loop = vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 302, headers: { location: '/news/rss/' } })));
    await expect(fetchRtnNewsRss(loop)).rejects.toThrow('REDIRECT_LIMIT');
    expect(loop).toHaveBeenCalledTimes(5);
    for (const status of [403,304]) {
      const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));
      await expect(fetchRtnNewsRss(fetcher)).rejects.toThrow(`HTTP_${status}`);
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('rejects HTML/error MIME even whenHTTP200 and does not leak raw transport exceptions', async () => {
    const html = vi.fn().mockResolvedValue(response('<html>challenge</html>', { 'content-type': 'text/html' }));
    const failure = vi.fn().mockRejectedValue(new Error('private token=secret'));
    await expect(fetchRtnNewsRss(html)).rejects.toThrow('CONTENT_TYPE_INVALID');
    await expect(fetchRtnNewsRss(failure)).rejects.toThrow(/^RTN_NEWS_FETCH_FAILED$/);
  });
  it('enforces both declared and streamed byte limits without trusting a missing Content-Length', async () => {
    const declaredLarge = vi.fn().mockResolvedValue(response(feed(), { 'content-length': String(RTN_NEWS_BYTE_LIMIT + 1) }));
    await expect(fetchRtnNewsRss(declaredLarge)).rejects.toThrow('BODY_SIZE_INVALID');
    const large = new Response(new Uint8Array(RTN_NEWS_BYTE_LIMIT + 1), { headers: { 'content-type': 'application/rss+xml' } });
    await expect(fetchRtnNewsRss(vi.fn().mockResolvedValue(large))).rejects.toThrow('BODY_SIZE_INVALID');
    const wrongLength = vi.fn().mockResolvedValue(response(feed(), { 'content-length': 'wrong' }));
    await expect(fetchRtnNewsRss(wrongLength)).rejects.toThrow('BODY_SIZE_INVALID');
  });
  it('aborts the bounded request timeout and sends no retry', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
    const pending = expect(fetchRtnNewsRss(fetcher)).rejects.toThrow('FETCH_TIMEOUT');
    await vi.advanceTimersByTimeAsync(RTN_NEWS_TIMEOUT_MS);
    await pending;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
