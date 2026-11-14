import type { Artifact, BasisObservation, DiscoveryProof, NpaCheckClaim } from './contracts.ts';
import { OfficialClient, PUBLICATION_BASE, FEDERAL_LAW_TYPE, ProofError, canonicalJson } from './official-client.ts';
import { actualUrl, assertSuccess, calendarDate, record } from './actual-pravo-116.ts';

type Publication = { id: string; title: string; date: string };
type SearchPage = { index: number; from: number; to: number; total: number; items: Publication[]; next: string | null };
const PAGE_SIZE = 200;
function fail(code: string): never { throw new ProofError(code); }
export function htmlText(input: string): string {
  // Narrow text extraction only; remote scripts/markup are NEVER executed.
  return input.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp|ndash|mdash);/gi, (_all, entity: string) => {
      if (entity.startsWith('#')) {
        const n = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
        return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : fail('INVALID_HTML_ENTITY');
      }
      return ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—' } as Record<string, string>)[entity.toLowerCase()];
    }).replace(/\s+/g, ' ').trim();
}
function attrs(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of input.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gs)) {
    if (match[1].toLowerCase() in out) fail('DUPLICATE_HTML_ATTRIBUTE');
    out[match[1].toLowerCase()] = htmlText(match[3]);
  }
  return out;
}
function links(html: string): Array<Record<string, string>> {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)].map(match => ({ ...attrs(match[1]), text: htmlText(match[2]) }));
}
function displayDate(iso: string): string { return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`; }
function isoFromDisplay(value: string): string {
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(value)) fail('INVALID_PUBLICATION_DATE');
  return calendarDate(`${value.slice(6, 10)}-${value.slice(3, 5)}-${value.slice(0, 2)}`);
}
export function searchUrl(window: NpaCheckClaim['discovery_window']): string {
  const start = calendarDate(window.from), end = calendarDate(window.to_exclusive);
  if (end <= start) fail('INVALID_DISCOVERY_WINDOW');
  const inclusiveEnd = new Date(new Date(`${end}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  const url = new URL('/search', PUBLICATION_BASE);
  for (const [key, value] of Object.entries({ DocumentTypes: FEDERAL_LAW_TYPE, pageSize: '200', SortedBy: '0', SortDestination: '1', PublishDateSearchType: '0', PublishDateFrom: displayDate(start), PublishDateTo: displayDate(inclusiveEnd), index: '1' })) url.searchParams.set(key, value);
  return url.href;
}
function validatePageLink(raw: string, expected: string, index: number): string {
  const link = new URL(raw, expected), original = new URL(expected);
  if (link.origin !== original.origin || link.pathname !== original.pathname || link.hash || link.searchParams.get('index') !== String(index)) fail('UNSAFE_PAGINATION_LINK');
  const left = [...link.searchParams].filter(([key]) => key !== 'index').sort(), right = [...original.searchParams].filter(([key]) => key !== 'index').sort();
  if (canonicalJson(left) !== canonicalJson(right)) fail('DISCOVERY_FILTER_DRIFT');
  return link.href;
}
export function parseSearchPage(html: string, requestUrl: string, index: number, window: NpaCheckClaim['discovery_window']): SearchPage {
  if (!html.includes('id="documentListDiv"') || !/<form\b[^>]*\bid="consultant-search"[^>]*>/i.test(html)) fail('UNKNOWN_PUBLICATION_SEARCH_LAYOUT');
  const counts = [...html.matchAll(/<div\b[^>]*class=["'][^"']*\bpage-navigation-count\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)].map(match => htmlText(match[1]).match(/^Показаны на странице: с (\d+) по (\d+) из (\d+)$/));
  const anchorItems = links(html).filter(link => link.class?.split(/\s+/).includes('documents-item-name'));
  if (counts.length === 0) {
    if (anchorItems.length === 0 && (html.match(/<h5>\s*Документы не найдены\s*<\/h5>/g) || []).length === 1 && index === 1) return { index, from: 0, to: 0, total: 0, items: [], next: null };
    fail('MISSING_DISCOVERY_TOTAL');
  }
  if (counts.length !== 2 || counts.some(value => !value) || canonicalJson(counts[0]?.slice(1)) !== canonicalJson(counts[1]?.slice(1))) fail('INCONSISTENT_DISCOVERY_TOTAL');
  const [from, to, total] = counts[0]!.slice(1).map(Number);
  if (![from, to, total].every(Number.isSafeInteger) || total <= 0 || from !== (index - 1) * PAGE_SIZE + 1 || to !== Math.min(index * PAGE_SIZE, total) || to < from || anchorItems.length !== to - from + 1) fail('DISCOVERY_PAGE_COVERAGE');
  const rowStarts = [...html.matchAll(/<div\b[^>]*class=["']documents-table-row["'][^>]*>/g)].map(match => match.index!);
  if (rowStarts.length !== anchorItems.length) fail('DISCOVERY_ROW_COUNT');
  const items: Publication[] = rowStarts.map((start, i) => {
    const row = html.slice(start, rowStarts[i + 1] ?? html.indexOf('page-navigation-count', start + 1));
    const relevant = links(row).filter(link => link.class?.split(/\s+/).includes('documents-item-name'));
    if (relevant.length !== 1 || !/^\/document\/\d{16}$/.test(relevant[0].href || '') || !/^Федеральный закон от \d{2}\.\d{2}\.\d{4} № \d+-ФЗ(?:\s|$)/.test(relevant[0].text)) fail('INVALID_PUBLICATION_ITEM');
    const id = relevant[0].href.slice('/document/'.length);
    const published = htmlText(row).match(/Дата опубликования:\s*(\d{2}\.\d{2}\.\d{4})/);
    if (!published) fail('MISSING_PUBLICATION_DATE');
    const date = isoFromDisplay(published[1]);
    if (date < window.from || date >= window.to_exclusive || id.slice(4, 12) !== date.replaceAll('-', '')) fail('PUBLICATION_OUTSIDE_WINDOW');
    return { id, title: relevant[0].text, date };
  });
  if (new Set(items.map(item => item.id)).size !== items.length) fail('DUPLICATE_PUBLICATION_ID');
  const lastPage = Math.ceil(total / PAGE_SIZE);
  let next: string | null = null;
  if (index < lastPage) {
    const observed = links(html).filter(link => link.href?.startsWith('/search?') && new URL(link.href, requestUrl).searchParams.get('index') === String(index + 1));
    if (!observed.length) fail('MISSING_OBSERVED_NEXT_PAGE');
    const candidates = observed.map(link => validatePageLink(link.href, requestUrl, index + 1));
    if (new Set(candidates).size !== 1) fail('AMBIGUOUS_NEXT_PAGE');
    next = candidates[0];
  }
  return { index, from, to, total, items, next };
}
function graphRefs(basis: BasisObservation) {
  const root = record(basis.stable.graph.canonical), card = record(root.card);
  if (!Array.isArray(card.reverserefs)) fail('INCOMPLETE_REFERENCE_GRAPH');
  return card.reverserefs.map(value => record(value));
}
function normalizeNumber(value: string): string { return value.toLowerCase().replace(/[\s\u00ad]/g, '').replace(/[‐‑‒–—−]/g, '-').replace(/ё/g, 'е'); }
export async function resolvePublication(client: OfficialClient, item: Publication, basis: BasisObservation[]): Promise<DiscoveryProof['resolved_publications'][number] | null> {
  const card = await client.capture<string>(`${PUBLICATION_BASE}/document/${item.id}`, 'html');
  const cardTitle = card.value.match(/<div\b[^>]*class=["'][^"']*\bdocument-name\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!cardTitle || htmlText(cardTitle[1]) !== item.title || !htmlText(card.value).includes(item.id) || !links(card.value).some(link => link.id === 'doc_text' && link.href === `http://actual.pravo.gov.ru/content/content.html#pnum=${item.id}`)) fail('PUBLICATION_CARD_IDENTITY_MISMATCH');
  const reds = await client.capture(actualUrl('redactions/', { t: JSON.stringify({ pnum: item.id, ttl: 2 }) }));
  const obj = assertSuccess(reds.value);
  if (!Number.isSafeInteger(obj.docid) || !Array.isArray(obj.redactions)) fail('INVALID_PUBLICATION_ORIGINAL');
  const initial = obj.redactions.map(value => record(value)).filter(row => row.redinitial === true);
  if (initial.length !== 1 || !['redofficial', 'redcompleted', 'hascontent', 'contentcomplete'].every(key => initial[0][key] === true) || !Number.isSafeInteger(initial[0].redid)) fail('PUBLICATION_ORIGINAL_NOT_COMPLETE');
  const text = await client.capture(actualUrl('redtext', { t: String(initial[0].redid), ttl: '2' }));
  const body = assertSuccess(text.value);
  if (typeof body.redtext !== 'string') fail('PUBLICATION_ORIGINAL_NOT_COMPLETE');
  const plain = htmlText(body.redtext);
  if (plain.length < 250 || /&[a-z][a-z\d]+;/i.test(plain) || !/ФЕДЕРАЛЬНЫЙ ЗАКОН/i.test(plain) || !/Президент Российской Федерации/i.test(plain)) fail('PUBLICATION_ORIGINAL_NOT_COMPLETE');
  const known = basis.flatMap(bank => graphRefs(bank).filter(ref => (ref.publications as unknown[]).some(publication => typeof publication === 'string' && publication.includes(item.id))).map(ref => ({ basis: bank.stable.identity.docid, ref })));
  if (known.length) {
    if (known.some(row => row.ref.docid !== obj.docid)) fail('PUBLICATION_GRAPH_IDENTITY_MISMATCH');
    return { publication_id: item.id, relation: 'known_changing_act', basis_docids: [...new Set(known.map(row => row.basis))].sort((a, b) => a - b), artifact: text.artifact, graph_reference_ids: [...new Set(known.map(row => String(row.ref.docid)))].sort() };
  }
  // Conservative FULL-TEXT closure: direct references to the base act or any
  // known changing act are unresolved unless reconciled by the changing graph.
  // A title/RSS absence can never establish that a publication is unrelated.
  const normalized = normalizeNumber(plain);
  const needles = basis.flatMap(bank => [bank.stable.identity.number, ...graphRefs(bank).map(ref => ref.onumber).filter((value): value is string => typeof value === 'string')]);
  if (needles.some(number => normalized.includes(normalizeNumber(number)))) return null;
  if (basis.some(bank => normalized.includes(normalizeNumber(bank.stable.identity.title)))) return null;
  return { publication_id: item.id, relation: 'not_related', basis_docids: [], artifact: text.artifact, graph_reference_ids: [] };
}
export async function discoverPublications(client: OfficialClient, window: NpaCheckClaim['discovery_window'], basis: BasisObservation[]): Promise<DiscoveryProof> {
  const proof: DiscoveryProof = { source: 'publication-pravo-federal-laws', ...window, complete: false, reported_total: 0, pages: [], relevance_complete: false, unresolved_candidates: [], resolved_publications: [], error_code: null };
  const seen = new Set<string>();
  const originals: Array<{ url: string; parsed: SearchPage; artifact: Artifact }> = [];
  let url: string | null = searchUrl(window);
  try {
    for (let index = 1; url; index++) {
      if (index > client.limits.maxPages) fail('DISCOVERY_PAGE_BUDGET');
      const page = await client.capture<string>(url, 'html');
      const parsed = parseSearchPage(page.value, url, index, window);
      if (index > 1 && parsed.total !== proof.reported_total) fail('DISCOVERY_TOTAL_CHANGED');
      proof.reported_total = parsed.total;
      proof.pages.push({ index, reported_total: parsed.total, publication_ids: parsed.items.map(item => item.id), artifact: page.artifact });
      originals.push({ url, parsed, artifact: page.artifact });
      for (const item of parsed.items) { if (seen.has(item.id)) fail('DUPLICATE_PUBLICATION_ACROSS_PAGES'); seen.add(item.id); }
      if (parsed.total > client.limits.maxPublications) fail('DISCOVERY_PUBLICATION_BUDGET');
      url = parsed.next;
    }
    if (seen.size !== proof.reported_total) fail('DISCOVERY_TOTAL_COVERAGE');
    for (const page of originals) {
      for (const item of page.parsed.items) {
        try {
          const resolved = await resolvePublication(client, item, basis);
          if (resolved) proof.resolved_publications.push(resolved); else proof.unresolved_candidates.push(item.id);
        } catch (error) {
          proof.unresolved_candidates.push(item.id);
          proof.error_code ??= error instanceof ProofError ? error.code : 'PUBLICATION_RESOLUTION_ERROR';
        }
      }
    }
    // Repeat EVERY page's actual ID/date/title projection after resolving
    // candidates; mutations in a middle page cannot hide behind stable ends.
    for (const original of originals) {
      const again = await client.capture<string>(original.url, 'html');
      const parsed = parseSearchPage(again.value, original.url, original.parsed.index, window);
      if (canonicalJson(parsed) !== canonicalJson(original.parsed)) fail('DISCOVERY_CHANGED_DURING_READ');
    }
    proof.complete = true;
    proof.relevance_complete = proof.unresolved_candidates.length === 0 && proof.resolved_publications.length === proof.reported_total;
    if (!proof.relevance_complete) proof.error_code ??= 'UNRESOLVED_PUBLICATION_CANDIDATES';
  } catch (error) {
    proof.error_code = error instanceof ProofError ? error.code : 'DISCOVERY_ERROR';
    proof.unresolved_candidates = [...new Set([...proof.unresolved_candidates, ...seen].filter(id => !proof.resolved_publications.some(row => row.publication_id === id)))];
  }
  return proof;
}
