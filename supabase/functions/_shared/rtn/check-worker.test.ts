// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { executeCheck, type CheckClaim, type WorkerClient } from './check-worker';
import { sha256 } from './official-source';

const bytes = new TextEncoder().encode('%PDF-1.7\noriginal official questions');
const claim: CheckClaim = {
  run_id: 'run', lease_token: 'lease', kind: 'manual',
  source: { id: 'source', page_url: 'https://www.gosnadzor.ru/service/list/Safety%20certification/a1/index.php', document_url: 'https://www.gosnadzor.ru/service/list/Safety%20certification/a1/old.pdf', trusted_anchor_rule: 'a1', parser: 'industrial-pdf', last_sha256: null },
};
function adapters() {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const download = vi.fn().mockResolvedValue({ data: new Blob([bytes]), error: null });
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({ data: { run_id: 'run', status: (args.p_result as { status: string }).status }, error: null }));
  const client = { rpc, storage: { from: vi.fn(() => ({ upload, download })) } } as unknown as WorkerClient;
  const fetcher = vi.fn(async (input: string | URL | Request) => String(input).endsWith('.pdf')
    ? new Response(bytes, { headers: { 'content-type': 'application/pdf' } })
    : new Response('<a href="new.pdf">А.1. Основы промышленной безопасности</a>', { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  return { upload, download, rpc, client, fetcher };
}

describe('RTN immutable update worker', () => {
  it('stores the exact new original without upsert and stages a scanned PDF without inventing options', async () => {
    const a = adapters();
    await executeCheck(a.client, claim, async () => [], a.fetcher);
    const hash = await sha256(bytes);
    expect(a.upload).toHaveBeenCalledWith(`source/${hash}.pdf`, bytes, { contentType: 'application/pdf', upsert: false });
    expect(a.rpc).toHaveBeenCalledTimes(1);
    expect(a.rpc.mock.calls[0][1].p_result).toMatchObject({ status: 'changed', sha256: hash, byte_size: bytes.length, normalized_banks: [], metadata: { normalization_required: true, official_answer_keys_supplied: false } });
  });
  it('verifies the page and document again but skips upload and normalization for an unchanged SHA', async () => {
    const a = adapters(), normalize = vi.fn();
    await executeCheck(a.client, { ...claim, source: { ...claim.source, last_sha256: await sha256(bytes) } }, normalize, a.fetcher);
    expect(a.fetcher).toHaveBeenCalledTimes(2); expect(a.upload).not.toHaveBeenCalled(); expect(normalize).not.toHaveBeenCalled();
    expect(a.rpc.mock.calls[0][1].p_result).toMatchObject({ status: 'unchanged' });
  });
  it('allows a storage replay only after comparing downloaded bytes to the requested hash', async () => {
    const a = adapters(); a.upload.mockResolvedValue({ error: { statusCode: '409', message: 'The resource already exists' } });
    await executeCheck(a.client, claim, async () => [], a.fetcher);
    expect(a.download).toHaveBeenCalledTimes(1);
    expect(a.rpc.mock.calls[0][1].p_result).toMatchObject({ status: 'changed' });
    a.download.mockResolvedValue({ data: new Blob(['different']), error: null });
    await executeCheck(a.client, claim, async () => [], a.fetcher);
    expect(a.rpc.mock.calls[1][1].p_result).toMatchObject({ status: 'error', error: 'RTN_ORIGINAL_HASH_CONFLICT' });
  });
  it('records a source outage as error without an invented revision/hash or provider detail', async () => {
    const a = adapters(); a.fetcher.mockRejectedValue(new Error('password=private provider exception'));
    await executeCheck(a.client, claim, async () => [], a.fetcher);
    expect(a.upload).not.toHaveBeenCalled();
    expect(a.rpc.mock.calls[0][1].p_result).toEqual({ status: 'error', error: 'RTN_SOURCE_CHECK_FAILED' });
  });
  it('preserves the downloaded original if layout drift requires further normalization review', async () => {
    const a = adapters();
    await executeCheck(a.client, claim, async () => { throw new Error('ENERGY_ORPHAN_OPTION'); }, a.fetcher);
    expect(a.rpc.mock.calls[0][1].p_result).toMatchObject({ status: 'changed', metadata: { normalization_required: true, normalization_error: 'ENERGY_ORPHAN_OPTION' } });
  });
  it('propagates a lost lease instead of hiding it with a second completion', async () => {
    const a = adapters(); a.rpc.mockResolvedValue({ data: null, error: { code: '40001' } } as never);
    await expect(executeCheck(a.client, claim, async () => [], a.fetcher)).rejects.toThrow('complete_rtn_check:40001');
    expect(a.rpc).toHaveBeenCalledTimes(1);
  });
});
