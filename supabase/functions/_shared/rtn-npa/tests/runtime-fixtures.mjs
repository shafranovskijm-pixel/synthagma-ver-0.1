export const NOW = '2026-11-14T16:00:00.000Z';
export const RUN = '91000000-0000-4000-8000-000000000003';
export const BANK = '91000000-0000-4000-8000-000000000001';
export const ORG = '91000000-0000-4000-8000-000000000002';
export const H = '1'.repeat(64);
export const ROOT = 'https://www.gosnadzor.ru/service/list/Safety%20certification/';
export const CATALOG = ROOT + 'catalog-2026/';
export const SECTION = CATALOG + 'a1/';
export const PDF = SECTION + 'latest-a1.pdf';
export const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\nSYNTHETIC_OFFICIAL_A1\n%%EOF');
export function claim() {
  return { protocol: 'rtn-npa-v1', worker_version: 'rtn-npa-official-v1', run_id: RUN, lease_token: '91000000-0000-4000-8000-000000000004', lease_expires_at: '2026-11-14T16:10:00Z', bank_id: BANK, release_id: '91000000-0000-4000-8000-000000000005', key_set_id: '91000000-0000-4000-8000-000000000006', manifest_id: null, manifest_version: 0, context_sha256: H, finding_epoch: 0,
    question_source: { source_code: 'rtn-industrial-a1-public', trusted_anchor_rule: 'a1', parser: 'industrial-pdf', source_id: '91000000-0000-4000-8000-000000000007', page_url: 'http://127.0.0.1/untrusted-old-page', document_url: 'https://not-an-official-host.invalid/old.pdf', sha256: H, source_generation: 3, parent_normalization_sha256: H, child_normalization_sha256: '2'.repeat(64) },
    basis: [{ country: 'RU', kind: 'FederalLaw', date: '1997-07-21', number: '116-ФЗ', docid: 38355, dochash: null }], unsupported_basis: [], all_declared_basis_count: 1, discovery_window: { from: '2026-11-14', to_exclusive: '2026-11-15' },
  };
}
export function sourceFixture(overrides = {}) {
  const calls = [], writes = [], sourceSignals = [];
  const fetcher = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    calls.push({ url, init });
    if (overrides.respond) { const special = await overrides.respond(url, init); if (special) return special; }
    if (url === ROOT) return new Response(`<a href="catalog-2024/">Вопросы тестирования с 1 сентября 2024 г.</a><a href="catalog-2026/">Вопросы тестирования с 1 сентября 2026 г.</a>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    if (url === CATALOG) return new Response('<a href="a1/">Общие требования промышленной безопасности</a>', { headers: { 'Content-Type': 'text/html' } });
    if (url === SECTION) return new Response('<a href="latest-a1.pdf">А.1. Основы промышленной безопасности</a><a href="npa.pdf">Перечень нормативных правовых актов</a>', { headers: { 'Content-Type': 'text/html' } });
    if (url === PDF) return new Response(PDF_BYTES, { headers: { 'Content-Type': 'application/pdf' } });
    throw new Error('UNEXPECTED_SYNTHETIC_URL');
  };
  const storeForSignal = signal => { sourceSignals.push(signal); return { async put(input) { if (overrides.put) return overrides.put(input, signal); writes.push(input); } }; };
  return { calls, writes, sourceSignals, fetcher, storeForSignal };
}
export const unknownResult = () => ({ protocol: 'rtn-npa-v1', worker_version: 'rtn-npa-official-v1', status: 'unknown', basis: [], question_source: null, discovery: null, additional_artifacts: [], runtime_egress_verified: false, error_code: 'SYNTHETIC_UNPROVEN' });
export const completion = () => ({ run_id: RUN, receipt_id: '91000000-0000-4000-8000-000000000008', outcome: 'unknown', confirmed_findings: 0, finding_epoch: 0, valid_until_exclusive: null, stale_manifest: false });
