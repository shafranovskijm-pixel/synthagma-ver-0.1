import { createClient } from 'npm:@supabase/supabase-js@2.90.1';
import { createNpaRuntime, type NpaCreateClient, SUPABASE_JS_PIN } from '../runtime.ts';
import { createNpaUserHandler } from '../http-handler.ts';
import type { NpaCheckClaim } from '../contracts.ts';

// Real pinned SDK/import graph, but explicit synthetic HTTP and credentials.
// This test is run with no env/net permission. It reads no actual secret and
// never imports entry modules, which would initialize a real Deno server.
Deno.test('pinned Deno SDK uses synthetic original-user auth/RPC transport only', async () => {
  const seen: { url: string; authorization: string | null; apiKey: string | null }[] = [];
  const token = 'Bearer SYNTHETIC_DENO_CALLER';
  const project = 'https://project.synthetic.invalid';
  const sdkFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers((init as { headers?: HeadersInit } | undefined)?.headers);
    seen.push({ url, authorization: headers.get('Authorization'), apiKey: headers.get('apikey') });
    if (url === project + '/auth/v1/user') return Response.json({ id: '91000000-0000-4000-8000-000000000009', aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-11-14T16:00:00Z' });
    if (url === project + '/rest/v1/rpc/request_rtn_npa_check') return Response.json({ run_id: '91000000-0000-4000-8000-000000000003', status: 'queued', queued_at: '2026-11-14T16:00:00Z' });
    if (url === project + '/rest/v1/rpc/claim_rtn_npa_check') return Response.json(null);
    throw new Error('UNEXPECTED_SYNTHETIC_SDK_URL');
  };
  const runtime = createNpaRuntime({ url: project, anonKey: 'SYNTHETIC_ANON', serviceRoleKey: 'SYNTHETIC_SERVICE' }, { createClient: createClient as unknown as NpaCreateClient, projectFetch: sdkFetch });
  const response = await createNpaUserHandler(runtime)(new Request('https://edge.synthetic.invalid/rtn-npa-check', { method: 'POST', headers: { Authorization: token }, body: JSON.stringify({ organizationId: '91000000-0000-4000-8000-000000000002', bankId: '91000000-0000-4000-8000-000000000001' }) }));
  if (response.status !== 202 || SUPABASE_JS_PIN !== 'npm:@supabase/supabase-js@2.90.1') throw new Error('DENO_SDK_IMPORT_OR_HANDLER_MISMATCH');
  if (seen.length !== 3 || seen[0].authorization !== token || seen[1].authorization !== token || seen[0].apiKey !== 'SYNTHETIC_ANON' || seen[1].apiKey !== 'SYNTHETIC_ANON' || seen[2].apiKey !== 'SYNTHETIC_SERVICE') throw new Error('DENO_SDK_USER_SERVICE_ISOLATION_MISMATCH');
  if (seen.some(row => !row.url.startsWith(project + '/'))) throw new Error('DENO_SDK_CROSS_ORIGIN_REQUEST');
});

Deno.test('real pinned storage SDK preserves exact synthetic PDF and single completion', async () => {
  const run = '91000000-0000-4000-8000-000000000003';
  const clock = '2026-11-14T16:00:00Z';
  const root = 'https://www.gosnadzor.ru/service/list/Safety%20certification/';
  const project = 'https://project.synthetic.invalid';
  const hash = '1'.repeat(64);
  const pdf = new TextEncoder().encode('%PDF-1.7\nSYNTHETIC_DENO_STORAGE\n%%EOF');
  const claim: NpaCheckClaim = {
    protocol: 'rtn-npa-v1', worker_version: 'rtn-npa-official-v1', run_id: run, lease_token: '91000000-0000-4000-8000-000000000004', lease_expires_at: '2026-11-14T16:10:00Z',
    bank_id: '91000000-0000-4000-8000-000000000001', release_id: '91000000-0000-4000-8000-000000000005', key_set_id: '91000000-0000-4000-8000-000000000006', manifest_id: null, manifest_version: 0, context_sha256: hash, finding_epoch: 0,
    question_source: { source_code: 'rtn-industrial-a1-public', trusted_anchor_rule: 'a1', parser: 'industrial-pdf', source_id: '91000000-0000-4000-8000-000000000007', page_url: 'https://not-a-fetch-target.invalid/', document_url: 'https://not-a-fetch-target.invalid/old.pdf', sha256: hash, source_generation: 3, parent_normalization_sha256: hash, child_normalization_sha256: hash },
    basis: [{ country: 'RU', kind: 'FederalLaw', date: '1997-07-21', number: '116-ФЗ', docid: 38355, dochash: null }], unsupported_basis: [], all_declared_basis_count: 1, discovery_window: { from: '2026-11-14', to_exclusive: '2026-11-15' },
  };
  let uploaded = 0, completed = 0, officialRequests = 0;
  const projectFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers((init as { headers?: HeadersInit } | undefined)?.headers);
    if (headers.get('apikey') !== 'SYNTHETIC_SERVICE') throw new Error('DENO_STORAGE_SERVICE_KEY_SCOPE');
    if (url.endsWith('/rpc/claim_rtn_npa_check')) return Response.json(claim);
    if (url.startsWith(project + '/storage/v1/object/rtn-sources/npa250/' + run + '/')) {
      const body = (init as { body?: BodyInit } | undefined)?.body;
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      if (bytes.length !== pdf.length || bytes.some((byte, i) => byte !== pdf[i]) || headers.get('x-upsert') !== 'false' || headers.get('Content-Type') !== 'application/pdf') throw new Error('DENO_STORAGE_EXACT_PDF_OR_IMMUTABILITY_MISMATCH');
      uploaded++;
      return Response.json({ Key: url.slice((project + '/storage/v1/object/').length) });
    }
    if (url.endsWith('/rpc/complete_rtn_npa_check')) {
      completed++;
      return Response.json({ run_id: run, receipt_id: '91000000-0000-4000-8000-000000000008', outcome: 'unknown', confirmed_findings: 0, finding_epoch: 0, valid_until_exclusive: null, stale_manifest: false });
    }
    throw new Error('DENO_STORAGE_UNEXPECTED_PROJECT_URL');
  };
  const officialFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers((init as { headers?: HeadersInit } | undefined)?.headers);
    if (headers.has('Authorization') || headers.has('apikey')) throw new Error('DENO_OFFICIAL_CREDENTIAL_LEAK');
    officialRequests++;
    if (url === root) return new Response('<a href="latest/">Вопросы тестирования с 1 сентября 2026 г.</a>');
    if (url === root + 'latest/') return new Response('<a href="a1/">Общие требования промышленной безопасности</a>');
    if (url === root + 'latest/a1/') return new Response('<a href="test.pdf">А.1. Основы промышленной безопасности</a>');
    if (url === root + 'latest/a1/test.pdf') return new Response(pdf);
    throw new Error('DENO_STORAGE_UNEXPECTED_OFFICIAL_URL');
  };
  const runtime = createNpaRuntime({ url: project, anonKey: 'SYNTHETIC_ANON', serviceRoleKey: 'SYNTHETIC_SERVICE' }, {
    createClient: createClient as unknown as NpaCreateClient, projectFetch, officialFetch, now: () => new Date(clock),
    observe: async (actual, deps) => {
      const source = await deps.verifyQuestionSource!(actual.question_source);
      return { protocol: 'rtn-npa-v1', worker_version: 'rtn-npa-official-v1', status: 'unknown', basis: [], question_source: source, discovery: null, additional_artifacts: [], runtime_egress_verified: false, error_code: 'SYNTHETIC_IMPORT_TEST' };
    },
  });
  const result = await runtime.execute(run);
  if (result?.outcome !== 'unknown' || uploaded !== 1 || completed !== 1 || officialRequests !== 4) throw new Error('DENO_STORAGE_EXECUTION_COUNT_MISMATCH');
});
