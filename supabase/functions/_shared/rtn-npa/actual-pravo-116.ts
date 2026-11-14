import type { BasisObservation, FutureEdition, Json, NpaCheckClaim, NpaIdentity } from './contracts.ts';
import { ACTUAL_BASE, OfficialClient, ProofError, canonicalJson, sha256 } from './official-client.ts';

type Dict = Record<string, unknown>;
type Basis = NpaCheckClaim['basis'][number];
export const LAW_116 = { country: 'RU', kind: 'FederalLaw', date: '1997-07-21', number: '116-ФЗ', docid: 38355, title: 'О промышленной безопасности опасных производственных объектов' } as const;
export function record(value: unknown, code = 'INVALID_OFFICIAL_SHAPE'): Dict {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProofError(code);
  return value as Dict;
}
export function assertSuccess(value: unknown): Dict {
  const obj = record(value);
  if (!('error' in obj) || (obj.error !== '' && obj.error !== null) || ('status' in obj && obj.status !== 0)) throw new ProofError('OFFICIAL_API_ERROR');
  return obj;
}
export function calendarDate(value: unknown): string {
  if (typeof value !== 'string') throw new ProofError('INVALID_OFFICIAL_DATE');
  const raw = /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
  const instant = Date.parse(`${raw}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== raw) throw new ProofError('INVALID_OFFICIAL_DATE');
  return raw;
}
function serverDate(obj: Dict): string {
  if (typeof obj.serverdate !== 'string' || !/^\d{4}-\d{2}-\d{2}T00:00:00$/.test(obj.serverdate)) throw new ProofError('INVALID_SOURCE_SERVER_DATE');
  return calendarDate(obj.serverdate.slice(0, 10));
}
function positiveInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0; }
function hash(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
export function actualUrl(endpoint: 'attrsearch/' | 'redactions/' | 'redtext' | 'cardfull/', params: Record<string, string>): string {
  const url = new URL(endpoint, ACTUAL_BASE);
  url.searchParams.set('bpa', 'ebpi');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}
export function identityUrl(basis: Pick<Basis, 'date' | 'number'>): string {
  const date = calendarDate(basis.date).replaceAll('-', '');
  return actualUrl('attrsearch/', { q: JSON.stringify([
    { AttrId: 5, AttrMode: 0, DateFrom: date, DateTo: date },
    { AttrId: 6, AttrMode: 0, Words: [basis.number] },
    { AttrId: 999, AttrMode: 1, Words: [20, '-date', '20220701', 0, 1] },
  ]) });
}
export function parseIdentity(raw: unknown, basis: Basis): NpaIdentity {
  const obj = assertSuccess(raw);
  if (obj.docscount !== 1 || !Array.isArray(obj.docs) || obj.docs.length !== 1) throw new ProofError('AMBIGUOUS_NPA_IDENTITY');
  const doc = record(obj.docs[0]);
  if (doc.docid !== basis.docid || doc.docpass0date !== basis.date.replaceAll('-', '') || doc.docpass0number !== basis.number ||
      typeof doc.docpassing !== 'string' || !doc.docpassing.startsWith('Федеральный закон от') ||
      doc.docnames !== LAW_116.title || !hash(doc.dochash) || (basis.dochash !== null && basis.dochash !== doc.dochash)) {
    throw new ProofError('NPA_IDENTITY_MISMATCH');
  }
  return { country: 'RU', kind: 'FederalLaw', issuer: 'Российская Федерация', date: basis.date, number: basis.number, title: doc.docnames, docid: basis.docid, dochash: doc.dochash };
}
function editions(raw: unknown, identity: NpaIdentity, requireFull: boolean): { rows: Dict[]; current: Dict; future: Dict[]; date: string } {
  const obj = assertSuccess(raw);
  if (obj.docid !== identity.docid || obj.dochash !== identity.dochash || !Array.isArray(obj.redactions) || !obj.redactions.length) throw new ProofError('NPA_EDITION_IDENTITY_MISMATCH');
  const date = serverDate(obj);
  const rows = obj.redactions.map(row => record(row));
  if (rows.length > 500 || new Set(rows.map(row => row.redid)).size !== rows.length) throw new ProofError('INVALID_EDITION_SET');
  for (const row of rows) {
    if (!positiveInteger(row.redid) || !Number.isSafeInteger(row.reddocrefid) || typeof row.redcaption !== 'string') throw new ProofError('INVALID_EDITION_SET');
    calendarDate(row.reddate);
    for (const name of ['actual', 'redofficial', 'redchecked', 'redcompleted', 'hascontent', 'contentcomplete', 'redinitial']) {
      if (typeof row[name] !== 'boolean') throw new ProofError('INVALID_EDITION_FLAGS');
    }
  }
  // The observed public "all" view numbers all editions, including the initial
  // one. Do not infer completeness from a finite latest-ten response.
  if (requireFull) {
    if (rows.filter(row => row.redinitial === true).length !== 1 || rows.at(-1)?.redinitial !== true ||
        !rows.every((row, index) => Number((row.redcaption as string).match(/^(\d+)\./)?.[1]) === rows.length - index)) {
      throw new ProofError('ALL_EDITIONS_COMPLETENESS_UNPROVEN');
    }
  }
  const current = rows.filter(row => row.actual === true);
  if (current.length !== 1 || calendarDate(current[0].reddate) > date) throw new ProofError('AMBIGUOUS_CURRENT_EDITION');
  const future = rows.filter(row => calendarDate(row.reddate) > date);
  if (future.some(row => row.actual === true)) throw new ProofError('INVALID_FUTURE_EDITION');
  return { rows, current: current[0], future, date };
}
function ready(row: Dict): boolean { return ['redofficial', 'redchecked', 'redcompleted', 'hascontent', 'contentcomplete'].every(key => row[key] === true); }
export function parseLegalCard(raw: unknown): Dict {
  const obj = assertSuccess(raw);
  // Explicit envelope fields only. Unknown legal fields stay in the stable
  // graph. In particular no regex deletes arbitrary '*date*' fields.
  const { error: _error, status: _status, ...legal } = obj;
  for (const key of ['directrefs', 'directrefs0', 'reverserefs', 'reverserefs0']) {
    if (!Array.isArray(legal[key])) throw new ProofError('INCOMPLETE_REFERENCE_GRAPH');
    const refs = (legal[key] as unknown[]).map(item => record(item));
    if (refs.some(item => !positiveInteger(item.docid) || !hash(item.hash) || typeof item.name !== 'string' || !Array.isArray(item.publications) || !Array.isArray(item.redactions))) throw new ProofError('INVALID_REFERENCE_GRAPH');
    if (new Set(refs.map(item => item.docid)).size !== refs.length) throw new ProofError('DUPLICATE_REFERENCE_GRAPH_ID');
    // These four arrays are identity sets; preserve EVERY field and nested
    // publication/annotation sequence. Only their outer order is immaterial.
    legal[key] = refs.sort((a, b) => (a.docid as number) - (b.docid as number));
  }
  if ('serverdate' in legal || 'request_timestamp' in legal) throw new ProofError('UNKNOWN_GRAPH_TRANSPORT_ENVELOPE');
  return legal;
}
function assertSameProjection(recent: ReturnType<typeof editions>, all: ReturnType<typeof editions>): void {
  const projection = (row: Dict) => ({ redid: row.redid, reddate: row.reddate, reddocrefid: row.reddocrefid, actual: row.actual, redofficial: row.redofficial, redchecked: row.redchecked, redcompleted: row.redcompleted, hascontent: row.hascontent, contentcomplete: row.contentcomplete });
  if (recent.date !== all.date || canonicalJson(projection(recent.current)) !== canonicalJson(projection(all.current)) ||
      canonicalJson(recent.future.map(projection)) !== canonicalJson(all.future.map(projection))) throw new ProofError('EDITION_VIEWS_DISAGREE');
}
async function captureAnchors(client: OfficialClient, basis: Basis) {
  const identity = await client.capture(identityUrl(basis));
  const parsed = parseIdentity(identity.value, basis);
  const recent = await client.capture(actualUrl('redactions/', { t: JSON.stringify({ hash: parsed.dochash, ttl: 4 }) }));
  const all = await client.capture(actualUrl('redactions/', { t: JSON.stringify({ hash: parsed.dochash, ttl: 3 }) }));
  const recentData = editions(recent.value, parsed, false), allData = editions(all.value, parsed, true);
  assertSameProjection(recentData, allData);
  const card = await client.capture(actualUrl('cardfull/', { t: parsed.dochash, hash: parsed.dochash }));
  return { identity, parsed, recent, all, allData, card, legalCard: parseLegalCard(card.value) };
}
function anchorProjection(anchor: Awaited<ReturnType<typeof captureAnchors>>) {
  return { identity: anchor.parsed, date: anchor.allData.date, editions: anchor.allData.rows, card: anchor.legalCard };
}
export async function observe116(client: OfficialClient, basis: Basis): Promise<BasisObservation> {
  if (basis.country !== LAW_116.country || basis.kind !== LAW_116.kind || basis.date !== LAW_116.date || basis.number !== LAW_116.number || basis.docid !== LAW_116.docid) throw new ProofError('UNSUPPORTED_BASIS_ADAPTER');
  const first = await captureAnchors(client, basis);
  const current = first.allData.current;
  if (!ready(current)) throw new ProofError('CURRENT_NPA_TEXT_NOT_READY');
  const body = await client.capture(actualUrl('redtext', { t: String(current.redid), ttl: '0' }));
  const bodyObj = assertSuccess(body.value);
  if (typeof bodyObj.redtext !== 'string' || bodyObj.redtext.trim().length < 1000) throw new ProofError('INCOMPLETE_CURRENT_TEXT');
  const textSha = await sha256(bodyObj.redtext);
  const futures: FutureEdition[] = [];
  for (const future of first.allData.future) {
    let text: string | null = null;
    if (ready(future)) {
      const response = await client.capture(actualUrl('redtext', { t: String(future.redid), ttl: '0' }));
      const value = assertSuccess(response.value);
      if (typeof value.redtext !== 'string' || value.redtext.trim().length < 1000) throw new ProofError('INCOMPLETE_FUTURE_TEXT');
      text = await sha256(value.redtext);
    }
    futures.push({ redid: future.redid as number, effective_from: calendarDate(future.reddate), official: future.redofficial as boolean, checked: future.redchecked as boolean, completed: future.redcompleted as boolean, hascontent: future.hascontent as boolean, contentcomplete: future.contentcomplete as boolean, text_sha256: text });
  }
  // Re-read all four independent anchors AFTER current/future bodies. A law
  // changing between metadata and body reads must never renew its old keys.
  const final = await captureAnchors(client, basis);
  let stable = canonicalJson(anchorProjection(first)) === canonicalJson(anchorProjection(final));
  let finalCurrentArtifact = body.artifact;
  // The public site may correct HTML without changing an edition identifier.
  // Re-read every body too: stable metadata alone is insufficient for a
  // coherent whole read set.
  for (const edition of [...futures.filter(row => row.text_sha256 !== null).map(row => ({ id: row.redid, sha: row.text_sha256! })), { id: current.redid as number, sha: textSha }]) {
    const response = await client.capture(actualUrl('redtext', { t: String(edition.id), ttl: '0' }));
    const value = assertSuccess(response.value);
    if (typeof value.redtext !== 'string' || await sha256(value.redtext) !== edition.sha) stable = false;
    if (edition.id === current.redid) finalCurrentArtifact = response.artifact;
  }
  return {
    adapter_version: 'actual-pravo-federal-law-v1',
    stable: {
      identity: final.parsed,
      current: { redid: current.redid as number, effective_from: calendarDate(current.reddate), actual: true, official: true, checked: true, redcompleted: true, hascontent: true, contentcomplete: true, text_sha256: textSha },
      graph: { canonical: { card: first.legalCard, editions: first.allData.rows } as Json, future_editions: futures.sort((a, b) => a.redid - b.redid) },
    },
    server_date: first.allData.date, fetched_at: client.instant(),
    artifacts: { identity: final.identity.artifact, redactions: final.all.artifact, redtext: finalCurrentArtifact, card: final.card.artifact },
    stable_read_set: stable, identity_count: 1, current_count: 1,
    // Incomplete future metadata is a real observed fact, carried explicitly
    // in future flags/null SHA. Top-level proof stays incomplete, but SQL can
    // still record a newly discovered future edition as a review finding.
    error_code: !stable ? 'SOURCE_CHANGED_DURING_READ' : null,
  };
}
