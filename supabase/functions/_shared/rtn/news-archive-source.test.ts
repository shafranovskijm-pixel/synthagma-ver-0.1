// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRtnArchiveFetcher, parseRtnNewsArchivePage, RTN_ARCHIVE_BYTE_LIMIT,
  RTN_ARCHIVE_ROOT_URL as ROOT, RTN_ARCHIVE_TIMEOUT_MS,
} from './news-archive-source';

const encode = (s: string) => new TextEncoder().encode(s);
const item = (id = 123, date = '20.11.2026', title = 'Новая публикация', href = `/news/67/${id}/`) =>
  `<p class="news-item" id="bx_${id}"><span class="news-date-time">${date}</span><a href="${href}"><b>${title}</b></a><br />Ignored full article/description<img src="https://outside.test/photo.jpg"><a class="read-more" href="${href}">Читать&nbsp;далее&nbsp;&rarr;</a></p>`;
const pager = (page = 1, next: number | null = page + 1) => `<font class="text">Начало | Пред. | <b>${page}</b>${next === null ? 'След. | Конец' : `<a href="/news/?PAGEN_1=${next}">${next}</a><a href="/news/?PAGEN_1=949">Конец</a><a href="/news/?PAGEN_1=${next}">След.</a>`}</font>`;
const html = (rows = item(), controls = pager()) => `<!DOCTYPE html><html><head><meta charset="utf-8"><script>const ignored = '<div class="news-list">';</script></head><body><div class="news-list">${rows}<br><font class="text">Новости1 -20 из18968<br></font>${controls}<p class="all-news"><a href="/news/0/">Все новости</a></p></div></body></html>`;
const parse = (s: string, page = ROOT) => parseRtnNewsArchivePage(encode(s), page);
const response = (value = html(), headers: Record<string, string> = {}) => new Response(encode(value), { headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
const fake = (implementation: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>) => vi.fn(implementation) as unknown as typeof fetch;

afterEach(() => vi.useRealTimers());

describe('bounded inert archive discovery, separate from RSS admission', () => {
  it('selects the actual listing and second font pager, retains date precision and only its adjacent next link', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => item(300 - i)).join('');
    const result = await parse(html(rows));
    expect(result.items).toHaveLength(20);
    expect(result.items[0]).toEqual({ canonical_url: 'https://www.gosnadzor.ru/news/67/300/', title: 'Новая публикация', source_date: '2026-11-20', source_date_literal: '20.11.2026', date_precision: 'day', ordinal: 1 });
    expect(result.items[19].ordinal).toBe(20);
    expect(result).toMatchObject({ page_number: 1, next_page_url: `${ROOT}?PAGEN_1=2`, pagination_state: 'adjacent', newest_source_date: '2026-11-20', oldest_source_date: '2026-11-20', complete_archive: false, exact_publication_times_known: false });
    expect(result.response_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result)).not.toMatch(/published_at|content_sha256|effective_from|photo.jpg|Ignored full/);
  });
  it('keeps equal-day DOM order and equal titles at different URLs, never fabricating an exact time or sorting article IDs', async () => {
    const result = await parse(html(item(1) + item(500)));
    expect(result.items.map(x => x.canonical_url)).toEqual(['https://www.gosnadzor.ru/news/67/1/','https://www.gosnadzor.ru/news/67/500/']);
    expect(result.items.every(x => x.source_date === '2026-11-20' && x.date_precision === 'day')).toBe(true);
  });
  it('accepts strictly older dates in listing order and valid leap day without execution-timezone conversion', async () => {
    const result = await parse(html(item(3, '01.03.2024') + item(2, '29.02.2024')));
    expect(result.oldest_source_date).toBe('2024-02-29');
    expect(result.newest_source_date).toBe('2024-03-01');
  });
  it('strips inline markup/entities from titles and ignores photos/full descriptions', async () => {
    const result = await parse(html(item(1, '20.11.2026', 'Вопросы &amp; &laquo;обучение&raquo; &lt;i&gt;пример&lt;/i&gt;')));
    expect(result.items[0].title).toBe('Вопросы & «обучение» пример');
    expect(JSON.stringify(result)).not.toMatch(/<|photo.jpg|Ignored/);
  });
  it('canonicalizes observed relative and exact HTTPS main-site article identities', async () => {
    const result = await parse(html(item(1, '20.11.2026', 'A', 'https://gosnadzor.ru/news/67/1/')));
    expect(result.items[0].canonical_url).toBe('https://www.gosnadzor.ru/news/67/1/');
  });
  it.each([
    'https://www.gosnadzor.ru.evil.test/news/67/1/', 'https://127.0.0.1/news/67/1/',
    'http://www.gosnadzor.ru/news/67/1/', 'https://u:p@www.gosnadzor.ru/news/67/1/',
    'https://www.gosnadzor.ru:443/news/67/1/', '/news/67/1/?x=2', '/news/67/1/#a',
    '/admin/../news/67/1/', '/news/%36%37/1/', '/news/0/1/', '/news/67/1',
    '//www.gosnadzor.ru/news/67/1/', '/news\\67\\1/',
  ])('rejects an untrusted article identity %s', async href => {
    await expect(parse(html(item(1, '20.11.2026', 'A', href)))).rejects.toThrow('ARTICLE_URL_INVALID');
  });
  it('fails closed on duplicate canonical rows instead of silently losing listing positions', async () => {
    await expect(parse(html(item(1) + item(1)))).rejects.toThrow('DUPLICATE_OR_CONFLICTING_ITEM');
  });
  it('fails on read-more destination disagreement, extra title anchors and missing/duplicate dates', async () => {
    await expect(parse(html(item().replace('class="read-more" href="/news/67/123/"', 'class="read-more" href="/news/67/124/"')))).rejects.toThrow('DUPLICATE_OR_CONFLICTING_ITEM');
    await expect(parse(html(item().replace('</b></a>', '</b></a><a href="/news/67/2/"><b>Other</b></a>')))).rejects.toThrow('ITEM_SCHEMA_INVALID');
    await expect(parse(html(item().replace('<span class="news-date-time">20.11.2026</span>', '')))).rejects.toThrow('ITEM_SCHEMA_INVALID');
    await expect(parse(html(item().replace('</span>', '</span><span class="news-date-time">20.11.2026</span>')))).rejects.toThrow('ITEM_SCHEMA_INVALID');
  });
  it('rejects impossible/partial/timestamp dates and ascending day order', async () => {
    for (const date of ['29.02.2026','31.11.2026','20.13.2026','1.11.2026','2026-11-20','20.11.2026 11:00','20.11.1800']) await expect(parse(html(item(1, date)))).rejects.toThrow('DATE_INVALID');
    await expect(parse(html(item(1, '19.11.2026') + item(2, '20.11.2026')))).rejects.toThrow('DATE_ORDER_AMBIGUOUS');
  });
  it('rejects absent/oversized list schemas, nested items, multiple lists and mismatched closing structure', async () => {
    await expect(parse(html(''))).rejects.toThrow('ITEM_SCHEMA_INVALID');
    await expect(parse(html(Array.from({ length: 21 }, (_, i) => item(i + 1)).join('')))).rejects.toThrow('ITEM_SCHEMA_INVALID');
    await expect(parse(html(`<div>${item()}</div>`))).rejects.toThrow('ITEM_SCHEMA_INVALID');
    await expect(parse(html() + '<div class="news-list"></div>')).rejects.toThrow('MULTIPLE_LISTS');
    await expect(parse(html().replace('</b></a>', '</i></a>'))).rejects.toThrow('HTML_STRUCTURE_INVALID');
  });
  it('does not evaluate scripts or accept active content in the listing/title, event handlers or duplicate attrs', async () => {
    await expect(parse(html(item().replace('Ignored full', '<script>fetch("https://outside.test")</script>Ignored full')))).rejects.toThrow('HTML_ACTIVE_CONTENT');
    await expect(parse(html(item().replace('<b>', '<b onclick="secret()">')))).rejects.toThrow('HTML_ACTIVE_CONTENT');
    await expect(parse(html(item().replace('class="news-item"', 'class="news-item" CLASS="news-item"')))).rejects.toThrow('HTML_ATTRIBUTE_INVALID');
    await expect(parse(html(item(1, '20.11.2026', '&unknown;')))).rejects.toThrow('ENTITY_INVALID');
  });
  it('bounds field sizes, tree depth/node count and source byte size', async () => {
    await expect(parse(html(item(1, '20.11.2026', 'x'.repeat(501))))).rejects.toThrow('TITLE_INVALID');
    await expect(parse(html(item().replace('Ignored full', `${'<span>'.repeat(30)}x${'</span>'.repeat(30)}`)))).rejects.toThrow('HTML_NODE_LIMIT');
    await expect(parse(html(item().replace('Ignored full', '<img>'.repeat(4100))))).rejects.toThrow('HTML_NODE_LIMIT');
    await expect(parseRtnNewsArchivePage(new Uint8Array(RTN_ARCHIVE_BYTE_LIMIT + 1))).rejects.toThrow('BODY_SIZE_INVALID');
  });
});

describe('observed adjacent pagination only, not a last-page crawler', () => {
  it('accepts current-page2 witness, ignores last949, and explicitly records a page10 cap without pretending it is terminal', async () => {
    const second = await parse(html(item(), pager(2)), `${ROOT}?PAGEN_1=2`);
    expect(second.next_page_url).toBe(`${ROOT}?PAGEN_1=3`);
    const capped = await parse(html(item(), pager(10)), `${ROOT}?PAGEN_1=10`);
    expect(capped).toMatchObject({ next_page_url: null, pagination_state: 'page_cap', complete_archive: false });
  });
  it('only reports terminal when current-page and disabled След. text are present without forward links', async () => {
    expect((await parse(html(item(), pager(1, null)))).pagination_state).toBe('terminal');
    await expect(parse(html(item(), '<font class="text"><b>1</b></font>'))).rejects.toThrow('PAGINATION_AMBIGUOUS');
    await expect(parse(html(item(), ''))).rejects.toThrow('PAGINATION_AMBIGUOUS');
  });
  it('does not infer terminal from a clickable next-like label or an unknown forward control', async () => {
    for (const controls of [
      '<font class="text"><b>1</b><a href="/news/">След. (начало)</a></font>',
      '<font class="text"><b>1</b><a href="/news/">Следующая</a> След. | Конец</font>',
      '<font class="text"><b>1</b><a href="/news/?PAGEN_1=2">Продолжить</a> След. | Конец</font>',
      '<font class="text"><b>1</b><span>След.</span> | Конец</font>',
      '<font class="text"><b>1</b>Неизвестный След. элемент | Конец</font>',
    ]) await expect(parse(html(item(), controls))).rejects.toThrow('PAGINATION_AMBIGUOUS');
  });
  it('rejects contradictory duplicate disabled-next markers or simultaneous enabled and disabled next controls', async () => {
    await expect(parse(html(item(), pager(1, null).replace('След. | Конец', 'След. | След. | Конец')))).rejects.toThrow('PAGINATION_AMBIGUOUS');
    await expect(parse(html(item(), pager().replace('</font>', ' След. | </font>')))).rejects.toThrow('PAGINATION_AMBIGUOUS');
    await expect(parse(html(item(), '<font class="text"><b>1</b>След. | <a href="/news/?PAGEN_1=2">2</a></font>'))).rejects.toThrow('PAGINATION_AMBIGUOUS');
  });
  it('rejects jump/backward/duplicate next links and inconsistent current-page or numeric link labels', async () => {
    for (const p of [pager(1, 3), pager(2, 1), pager() + pager(), pager().replace('>След.</a>', '>След.</a><a href="/news/?PAGEN_1=2">След.</a>'), pager().replace('>2</a>', '>3</a>')]) await expect(parse(html(item(), p))).rejects.toThrow('PAGINATION_AMBIGUOUS');
    await expect(parse(html(item(), pager(2)))).rejects.toThrow('PAGINATION_AMBIGUOUS');
    await expect(parse(html(item(), pager().replace('>След.</a>', '>Missing</a>')))).rejects.toThrow('PAGINATION_AMBIGUOUS');
  });
  it('refuses arbitrary network targets, page aliases, paths/queries and cap escapes before interpreting source', async () => {
    for (const url of [ROOT + '?PAGEN_1=1', ROOT + '?PAGEN_1=11', ROOT + '?PAGEN_1=02', ROOT + '?PAGEN_1=2&x=3', ROOT + '#part', ROOT.replace('https:', 'http:'), ROOT.replace('/news/', '/admin/../news/'), ROOT.replace('.ru/', '.ru:443/'), 'https://127.0.0.1/news/']) await expect(parse(html(), url)).rejects.toThrow('PAGE_URL_INVALID');
    await expect(parse(html(item(), pager().replace('/news/?PAGEN_1=2', 'https://outside.test/news/?PAGEN_1=2')))).rejects.toThrow('PAGE_URL_INVALID');
  });
});

describe('strict HTML decoding and evidence provenance', () => {
  it('preserves raw-byte evidence hash independently of same parsed fields/whitespace', async () => {
    const first = await parse(html()), second = await parse(`\n${html()}`);
    expect(first.items).toEqual(second.items);
    expect(first.response_sha256).not.toBe(second.response_sha256);
    expect(second.response_bytes).toBe(first.response_bytes + 1);
  });
  it('decodes explicitly agreed Windows1251, rejecting conflicting/unsupported/invalid encoding and non-HTML', async () => {
    const cpText = html(item(1, '20.11.2026', 'Тест')).replace('utf-8', 'windows-1251');
    const cp = Uint8Array.from(Array.from(cpText).map(c => c.charCodeAt(0) >= 0x410 && c.charCodeAt(0) <= 0x44f ? c.charCodeAt(0) - 0x410 + 0xc0 : c.charCodeAt(0)));
    expect((await parseRtnNewsArchivePage(cp, ROOT, 'text/html; charset=windows-1251')).items[0].title).toBe('Тест');
    await expect(parseRtnNewsArchivePage(encode(html()), ROOT, 'text/html; charset=windows-1251')).rejects.toThrow('ENCODING_MISMATCH');
    await expect(parseRtnNewsArchivePage(encode(html().replace('utf-8', 'utf-16')), ROOT, 'text/html; charset=utf-16')).rejects.toThrow('ENCODING_UNSUPPORTED');
    await expect(parseRtnNewsArchivePage(new Uint8Array([0xff]), ROOT)).rejects.toThrow('ENCODING_INVALID');
    await expect(parseRtnNewsArchivePage(encode(html()), ROOT, 'application/xml')).rejects.toThrow('MIME_INVALID');
  });
  it('rejects ambiguous combined MIME/charset headers rather than selecting an arbitrary decoding', async () => {
    await expect(parseRtnNewsArchivePage(encode(html()), ROOT, 'text/html; charset=utf-8; charset=windows-1251')).rejects.toThrow('ENCODING_MISMATCH');
    await expect(parseRtnNewsArchivePage(encode(html()), ROOT, 'text/html; charset=utf-8, text/plain')).rejects.toThrow('ENCODING_MISMATCH');
  });
});

describe('injected transport only, conservative shared invocation budget', () => {
  it('uses one exact GET/manual/omit with fixed Accept, no auth/options, returning the same original bytes', async () => {
    const fetcher = fake(async () => response());
    const scoped = createRtnArchiveFetcher({ fetcher });
    const result = await scoped.fetchPage(ROOT);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(ROOT, { method: 'GET', redirect: 'manual', credentials: 'omit', headers: { Accept: 'text/html' }, signal: expect.any(AbortSignal) });
    expect(result.original_bytes).toEqual(encode(html()));
    expect(scoped.usage()).toMatchObject({ get_attempts: 1, reserved_bytes: RTN_ARCHIVE_BYTE_LIMIT, response_bytes: encode(html()).length });
  });
  it('reserves full bytes for every failure before network, never refunds and stops before a fourth GET', async () => {
    const fetcher = fake(async () => new Response(null, { status: 403 }));
    const scoped = createRtnArchiveFetcher({ fetcher });
    for (let i = 0; i < 3; i++) await expect(scoped.fetchPage(ROOT)).rejects.toThrow('HTTP_403');
    expect(scoped.usage()).toMatchObject({ get_attempts: 3, reserved_bytes: 3 * RTN_ARCHIVE_BYTE_LIMIT, response_bytes: 0 });
    await expect(scoped.fetchPage(ROOT)).rejects.toThrow('INVOCATION_BUDGET_EXHAUSTED');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([202,206])('requires exact200 and cancels valid-looking HTML with status%s', async status => {
    const res = new Response(encode(html()), { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
    const cancel = vi.spyOn(res.body!, 'cancel');
    const fetcher = fake(async () => res), scoped = createRtnArchiveFetcher({ fetcher });
    await expect(scoped.fetchPage(ROOT)).rejects.toThrow(`HTTP_${status}`);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(scoped.usage()).toMatchObject({ get_attempts: 1, reserved_bytes: RTN_ARCHIVE_BYTE_LIMIT, response_bytes: 0 });
  });
  it('does not follow redirect or retry on bad MIME/content-length/parse failure, cancelling rejected bodies', async () => {
    for (const make of [() => new Response('redirect', { status: 302, headers: { location: ROOT + '?PAGEN_1=2' } }), () => response(html(), { 'content-type': 'application/json' }), () => response(html(), { 'content-length': '1048577' }), () => response('<html>not the listing</html>')]) {
      const res = make(), cancel = vi.spyOn(res.body!, 'cancel');
      const fetcher = fake(async () => res);
      const scoped = createRtnArchiveFetcher({ fetcher });
      await expect(scoped.fetchPage(ROOT)).rejects.toThrow('RTN_ARCHIVE_');
      expect(fetcher).toHaveBeenCalledTimes(1);
      if (!res.bodyUsed) expect(cancel).toHaveBeenCalled();
      expect(scoped.usage().reserved_bytes).toBe(RTN_ARCHIVE_BYTE_LIMIT);
    }
  });
  it('cancels actual stream overflow and charges delivered bytes while retaining the full reservation', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(RTN_ARCHIVE_BYTE_LIMIT)); c.enqueue(new Uint8Array([1])); }, cancel });
    const scoped = createRtnArchiveFetcher({ fetcher: fake(async () => new Response(body, { headers: { 'content-type': 'text/html' } })) });
    await expect(scoped.fetchPage(ROOT)).rejects.toThrow('BODY_SIZE_INVALID');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(scoped.usage()).toMatchObject({ get_attempts: 1, reserved_bytes: RTN_ARCHIVE_BYTE_LIMIT, response_bytes: RTN_ARCHIVE_BYTE_LIMIT + 1 });
  });
  it('enforces the total20s deadline while body stalls, even if cancel itself never settles', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const body = new ReadableStream<Uint8Array>({ pull: () => new Promise<void>(() => undefined), cancel });
    const scoped = createRtnArchiveFetcher({ fetcher: fake(async () => new Response(body, { headers: { 'content-type': 'text/html' } })) });
    const pending = expect(scoped.fetchPage(ROOT)).rejects.toThrow('TIMEOUT');
    await vi.advanceTimersByTimeAsync(RTN_ARCHIVE_TIMEOUT_MS + 1);
    await pending;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(scoped.usage().reserved_bytes).toBe(RTN_ARCHIVE_BYTE_LIMIT);
  });
  it('bounds a fetcher ignoring abort and cancels a late response without a second request', async () => {
    vi.useFakeTimers();
    let deliver!: (response: Response) => void;
    const fetcher = fake(() => new Promise<Response>(resolve => { deliver = resolve; }));
    const scoped = createRtnArchiveFetcher({ fetcher });
    const pending = expect(scoped.fetchPage(ROOT)).rejects.toThrow('TIMEOUT');
    await vi.advanceTimersByTimeAsync(RTN_ARCHIVE_TIMEOUT_MS + 1); await pending;
    const late = response(), cancel = vi.spyOn(late.body!, 'cancel'); deliver(late); await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('handles caller cancellation with sanitized error and retains charged reservations', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ pull: () => new Promise<void>(() => undefined), cancel });
    const scoped = createRtnArchiveFetcher({ fetcher: fake(async () => new Response(body, { headers: { 'content-type': 'text/html' } })), signal: controller.signal });
    const pending = expect(scoped.fetchPage(ROOT)).rejects.toThrow('RTN_ARCHIVE_ABORTED');
    await Promise.resolve(); await Promise.resolve(); controller.abort(new Error('secret caller reason')); await pending;
    expect(scoped.usage().reserved_bytes).toBe(RTN_ARCHIVE_BYTE_LIMIT);
  });
  it('rejects attempts after shared70s expiry or a backward clock, and checks post-body elapsed time', async () => {
    let clock = 0;
    const fetcher = fake(async () => response()); const scoped = createRtnArchiveFetcher({ fetcher, now: () => clock });
    clock = 70_000;
    await expect(scoped.fetchPage(ROOT)).rejects.toThrow('INVOCATION_BUDGET_EXHAUSTED'); expect(fetcher).not.toHaveBeenCalled();
    clock = -1; await expect(scoped.fetchPage(ROOT)).rejects.toThrow('CLOCK_INVALID');
    clock = 0;
    const slow = createRtnArchiveFetcher({ fetcher: fake(async () => { clock = 20_001; return response(); }), now: () => clock });
    await expect(slow.fetchPage(ROOT)).rejects.toThrow('TIMEOUT');
    expect(slow.usage().reserved_bytes).toBe(RTN_ARCHIVE_BYTE_LIMIT);
  });
  it('prevents concurrent page fetches and validates destinations before charging budget or making a request', async () => {
    let deliver!: (response: Response) => void;
    const fetcher = fake(() => new Promise<Response>(resolve => { deliver = resolve; }));
    const scoped = createRtnArchiveFetcher({ fetcher });
    await expect(scoped.fetchPage('https://outside.test/news/')).rejects.toThrow('PAGE_URL_INVALID'); expect(scoped.usage().get_attempts).toBe(0);
    const first = scoped.fetchPage(ROOT);
    await expect(scoped.fetchPage(ROOT + '?PAGEN_1=2')).rejects.toThrow('CONCURRENT_FETCH_FORBIDDEN');
    deliver(response()); await first; expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('sanitizes transport and stream exceptions instead of exposing underlying client/URL secrets', async () => {
    const scoped = createRtnArchiveFetcher({ fetcher: fake(async () => { throw new Error('RTN_ARCHIVE_SECRET_TOKEN'); }) });
    await expect(scoped.fetchPage(ROOT)).rejects.toThrow(/^RTN_ARCHIVE_TRANSPORT_ERROR$/);
    const stream = createRtnArchiveFetcher({ fetcher: fake(async () => new Response(new ReadableStream({ start(c) { c.error(new Error('private response')); } }), { headers: { 'content-type': 'text/html' } })) });
    await expect(stream.fetchPage(ROOT)).rejects.toThrow(/^RTN_ARCHIVE_TRANSPORT_ERROR$/);
  });
  it('copies producer-owned buffers before later pulls can mutate the captured original', async () => {
    const original = encode(html()), split = 100, first = original.slice(0, split);
    let part = 0;
    const body = new ReadableStream<Uint8Array>({ pull(c) {
      if (part++ === 0) c.enqueue(first);
      else if (part === 2) { first.fill(0); c.enqueue(original.slice(split)); }
      else c.close();
    } }, { highWaterMark: 0 });
    const scoped = createRtnArchiveFetcher({ fetcher: fake(async () => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } })) });
    const result = await scoped.fetchPage(ROOT);
    expect(result.original_bytes).toEqual(original);
    expect(result.page.items[0].source_date).toBe('2026-11-20');
  });
});

describe('archive fetch observation metadata delta', () => {
  it('retains the exact observed UTF8 header and byte count outside the semantic page DTO', async () => {
    const body = html(), header = 'Text/HTML; Charset=UTF-8';
    const scoped = createRtnArchiveFetcher({ fetcher: fake(async () => response(body, { 'content-type': header })) });
    const result = await scoped.fetchPage(ROOT);
    expect(result.observation).toEqual({ content_type: header, decoded_encoding: 'utf-8', body_bytes_seen: encode(body).byteLength });
    expect(result.observation.body_bytes_seen).toBe(result.page.response_bytes);
    expect(result.page.items[0]).toMatchObject({ source_date: '2026-11-20', source_date_literal: '20.11.2026', date_precision: 'day' });
    expect(result.page).not.toHaveProperty('observation');
    expect(result.page).not.toHaveProperty('content_type');
    expect(result.page).not.toHaveProperty('decoded_encoding');
    expect(result.observation).not.toHaveProperty('resolved_url');
    expect(result.page).not.toHaveProperty('published_at');
  });
  it('reports Windows1251 actually selected from HTML meta when the header has no charset', async () => {
    const body = html(item(1, '20.11.2026', 'Тест')).replace('utf-8', 'windows-1251');
    const bytes = Uint8Array.from(Array.from(body).map(c => c.charCodeAt(0) >= 0x410 && c.charCodeAt(0) <= 0x44f ? c.charCodeAt(0) - 0x410 + 0xc0 : c.charCodeAt(0)));
    const scoped = createRtnArchiveFetcher({ fetcher: fake(async () => new Response(bytes, { headers: { 'content-type': 'text/html' } })) });
    const result = await scoped.fetchPage(ROOT);
    expect(result.page.items[0].title).toBe('Тест');
    expect(result.observation).toEqual({ content_type: 'text/html', decoded_encoding: 'windows-1251', body_bytes_seen: bytes.byteLength });
    expect(result.original_bytes).toEqual(bytes);
  });
  it('rejects a conflicting header/meta instead of emitting guessed encoding metadata', async () => {
    const body = html(), fetcher = fake(async () => response(body, { 'content-type': 'text/html; charset=windows-1251' }));
    const scoped = createRtnArchiveFetcher({ fetcher });
    await expect(scoped.fetchPage(ROOT)).rejects.toThrow('ENCODING_MISMATCH');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(scoped.usage()).toMatchObject({ get_attempts: 1, reserved_bytes: RTN_ARCHIVE_BYTE_LIMIT, response_bytes: encode(body).byteLength });
  });
  it('preserves the entire128-character observed header without truncating it', async () => {
    const prefix = 'text/html; x=', header = prefix + 'x'.repeat(128 - prefix.length);
    const scoped = createRtnArchiveFetcher({ fetcher: fake(async () => response(html(), { 'content-type': header })) });
    const result = await scoped.fetchPage(ROOT);
    expect(result.observation.content_type).toBe(header);
    expect(result.observation.content_type).toHaveLength(128);
    expect(result.observation.decoded_encoding).toBe('utf-8');
  });
  it('rejects a129-character header before consuming its body or returning observation metadata', async () => {
    const prefix = 'text/html; x=', header = prefix + 'x'.repeat(129 - prefix.length);
    const res = response(html(), { 'content-type': header }), cancel = vi.spyOn(res.body!, 'cancel');
    const scoped = createRtnArchiveFetcher({ fetcher: fake(async () => res) });
    await expect(scoped.fetchPage(ROOT)).rejects.toThrow('MIME_INVALID');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(scoped.usage()).toMatchObject({ get_attempts: 1, reserved_bytes: RTN_ARCHIVE_BYTE_LIMIT, response_bytes: 0 });
  });
  it('returns bytes consumed by each page rather than cumulative invocation bytes', async () => {
    const firstBody = html(), secondBody = html(item(9, '19.11.2026', 'Вторая запись'), pager(2));
    const bodies = [firstBody, secondBody];
    const scoped = createRtnArchiveFetcher({ fetcher: fake(async () => response(bodies.shift()!)) });
    const first = await scoped.fetchPage(ROOT), second = await scoped.fetchPage(ROOT + '?PAGEN_1=2');
    expect(first.observation.body_bytes_seen).toBe(encode(firstBody).byteLength);
    expect(second.observation.body_bytes_seen).toBe(encode(secondBody).byteLength);
    expect(second.observation.body_bytes_seen).toBe(second.page.response_bytes);
    expect(scoped.usage()).toMatchObject({ get_attempts: 2, reserved_bytes: 2 * RTN_ARCHIVE_BYTE_LIMIT, response_bytes: first.observation.body_bytes_seen + second.observation.body_bytes_seen });
  });
});
