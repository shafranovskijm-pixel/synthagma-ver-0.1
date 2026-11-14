import { assertDocumentMagic, decodeOfficialPage, discoverA1Section, discoverDocument, discoverEnergyTitle, discoverIndustryCatalog, fetchOfficial, sha256, type SourceDescriptor } from './official-source.ts';

export type CheckClaim = { run_id: string; lease_token: string; kind: 'manual' | 'daily' | 'weekly'; source: SourceDescriptor };
type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };
export type WorkerClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
  storage: { from(bucket: string): {
    upload(path: string, bytes: Uint8Array, options: { contentType: string; upsert: boolean }): PromiseLike<{ error: { message?: string; statusCode?: string | number } | null }>;
    download(path: string): PromiseLike<{ data: Blob | null; error: unknown }>;
  } };
};
export type Normalizer = (bytes: Uint8Array, sha: string, source: SourceDescriptor) => Promise<unknown[]>;

export async function rpcValue<T>(client: Pick<WorkerClient, 'rpc'>, name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}:${error.code || 'failed'}`);
  return data as T;
}

/** Storing a known SHA may replay, but never overwrite an original file. */
async function storeOriginal(client: WorkerClient, path: string, bytes: Uint8Array, mediaType: string, expectedSha: string) {
  const bucket = client.storage.from('rtn-sources');
  const result = await bucket.upload(path, bytes, { contentType: mediaType, upsert: false });
  if (!result.error) return;
  if (!['409', '400'].includes(String(result.error.statusCode)) || !/already exists|duplicate/i.test(result.error.message || '')) throw new Error('RTN_ORIGINAL_STORAGE_FAILED');
  const existing = await bucket.download(path);
  if (existing.error || !existing.data || existing.data.size !== bytes.byteLength || await sha256(new Uint8Array(await existing.data.arrayBuffer())) !== expectedSha) throw new Error('RTN_ORIGINAL_HASH_CONFLICT');
}

// These dates are pinned to visually checked originals, never carried forward to a new hash.
function verifiedMetadata(hash: string): Record<string, unknown> {
  if (hash === 'd7ff37b15a42d8d6a1b1a06542028871886d849c87d3be113871e247248a99db') return {
    approved_on: '2026-08-10', effective_from: '2026-09-01', dates_evidence: {
      title_page_url: 'https://www.gosnadzor.ru/energy/energy/The%20list%20of%20issues%20of%20energy%20supervision/2026/%D0%BF%D1%80%D0%B8%D0%BB%D0%BE%D0%B6%D0%B5%D0%BD%D0%B8%D0%B5%201_sent.pdf',
      title_page_sha256: '8f968fad1c9933b1a31e0571e53d209aeb870e8602c684522200dad0942afe45', verified_on: '2026-11-14',
    },
  };
  return { dates_require_review: true };
}

/** Network success and normalized/reviewed readiness are deliberately separate. */
export async function executeCheck(client: WorkerClient, claim: CheckClaim, normalize: Normalizer, fetcher: typeof fetch = fetch) {
  let completion: Record<string, unknown>;
  try {
    const source = claim.source;
    const observations: Record<string, unknown>[] = [];
    let pageUrl = source.page_url;
    if (claim.kind === 'weekly' && source.trusted_anchor_rule === 'a1') {
      const parent = await fetchOfficial('https://www.gosnadzor.ru/service/list/Safety%20certification/', 'page', fetcher);
      observations.push({ kind: 'service_catalog', url: parent.url, sha256: await sha256(parent.bytes) });
      const catalogUrl = discoverIndustryCatalog(decodeOfficialPage(parent.bytes, parent.contentType), parent.url);
      const catalog = await fetchOfficial(catalogUrl, 'page', fetcher);
      observations.push({ kind: 'question_catalog', url: catalog.url, sha256: await sha256(catalog.bytes) });
      pageUrl = discoverA1Section(decodeOfficialPage(catalog.bytes, catalog.contentType), catalog.url);
    }
    const page = await fetchOfficial(pageUrl, 'page', fetcher);
    const pageHtml = decodeOfficialPage(page.bytes, page.contentType);
    const pageSha = await sha256(page.bytes);
    observations.push({ kind: 'question_page', url: page.url, sha256: pageSha });
    const documentUrl = discoverDocument(pageHtml, page.url, source.trusted_anchor_rule);
    if (claim.kind === 'weekly' && source.trusted_anchor_rule === 'energy-xlsx') {
      const title = await fetchOfficial(discoverEnergyTitle(pageHtml, page.url), 'document', fetcher);
      assertDocumentMagic(title.bytes, 'industrial-pdf');
      const titleSha = await sha256(title.bytes), titlePath = `${source.id}/${titleSha}.pdf`;
      await storeOriginal(client, titlePath, title.bytes, 'application/pdf', titleSha);
      observations.push({ kind: 'approval_title', url: title.url, sha256: titleSha, original_path: titlePath });
    }
    const document = await fetchOfficial(documentUrl, 'document', fetcher);
    assertDocumentMagic(document.bytes, source.parser);
    const hash = await sha256(document.bytes);
    if (hash === source.last_sha256) {
      completion = { status: 'unchanged', sha256: hash, document_url: document.url, http_status: 200,
        metadata: { source_page_url: page.url, source_page_sha256: pageSha, observations } };
    } else {
      const extension = source.parser === 'industrial-pdf' ? 'pdf' : 'xlsx';
      const mediaType = extension === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const path = `${source.id}/${hash}.${extension}`;
      await storeOriginal(client, path, document.bytes, mediaType, hash);
      let banks: unknown[] = [], normalizationError: string | undefined;
      try { banks = await normalize(document.bytes, hash, source); }
      catch (error) { normalizationError = safeError(error); }
      completion = {
        status: 'changed', sha256: hash, original_path: path, media_type: mediaType,
        byte_size: document.bytes.byteLength, document_url: document.url, normalized_banks: banks,
        metadata: {
          ...verifiedMetadata(hash), source_page_url: page.url, source_page_sha256: pageSha, observations,
          source_rule: source.trusted_anchor_rule, parser_revision: 'rtn-official-v1',
          normalization_required: !banks.length, normalization_error: normalizationError,
          official_answer_keys_supplied: false,
          text_line_endings: 'XML-1.0-LF',
        }, http_status: 200,
      };
    }
  } catch (error) { completion = { status: 'error', error: safeError(error) }; }
  // A failed lease/DB commit must propagate. Calling complete(error) again would hide it.
  return await rpcValue<{ run_id: string; status: string; revision_id?: string }>(client, 'complete_rtn_check', {
    p_run_id: claim.run_id, p_lease_token: claim.lease_token, p_result: completion,
  });
}

export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'RTN_SOURCE_CHECK_FAILED';
  // Never return a fetched document, credentials, provider response, or raw exception stack.
  return /^[A-Z][A-Z0-9_:.-]{0,140}$/.test(message) ? message : 'RTN_SOURCE_CHECK_FAILED';
}
