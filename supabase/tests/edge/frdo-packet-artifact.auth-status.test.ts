import { describe, expect, it, vi } from 'vitest';
import { createFrdoHandler } from '../../functions/frdo-packet-artifact/handler';
import { createRestFrdoPorts } from '../../functions/frdo-packet-artifact/restTransport';

const actor = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const org = '11111111-1111-1111-1111-111111111111';
const packet = '22222222-2222-2222-2222-222222222222';
const artifact = '33333333-3333-3333-3333-333333333333';
const body = { operation: 'read', request: { schema_version: 1, abi_revision: 'uc020-persisted-v5', organization_id: org, scope: { kind: 'organization' }, query: { kind: 'download', purpose: 'historical_copy', packet: { id: packet, revision: 1, state_hash: 'a'.repeat(64), snapshot_sha256: 'b'.repeat(64) }, artifact: { artifact_id: artifact, packet_id: packet, snapshot_sha256: 'b'.repeat(64), byte_sha256: 'c'.repeat(64), byte_size: 127, binding_sha256: 'd'.repeat(64) } } } };

describe('original HTTP authorization status dominates conflicting provider diagnostics', () => {
  it.each([
    { status: 401, at: 'auth', message: 'FRDO_PACKET_DEPENDENCY_UNAVAILABLE', length: null, code: 'AUTH_REQUIRED' },
    { status: 403, at: 'rpc', message: 'FRDO_PACKET_SOURCE_CHANGED', length: null, code: 'ACCESS_DENIED' },
    { status: 403, at: 'auth', message: 'FRDO_PACKET_DEPENDENCY_UNAVAILABLE', length: '9999999', code: 'ACCESS_DENIED' },
  ])('retains real HTTP$status from $at, even for a recognized or oversized body', async test => {
    let cancelled = false;
    const dependency = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe('Bearer ORIGINAL_SYNTHETIC');
      expect(headers.get('apikey')).toBe('PUBLIC_SYNTHETIC');
      if (test.at === 'rpc' && url.pathname === '/auth/v1/user') return new Response(JSON.stringify({ id: actor }));
      expect(url.pathname).toBe(test.at === 'rpc' ? '/rest/v1/rpc/read_frdo_packets' : '/auth/v1/user');
      const bytes = new TextEncoder().encode(JSON.stringify({ message: test.message, private_diagnostic: 'MUST_NOT_LEAK' }));
      const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); }, cancel() { cancelled = true; } });
      return new Response(stream, { status: test.status, headers: { 'content-type': 'application/json', ...(test.length ? { 'content-length': test.length } : {}) } });
    });
    const handler = createFrdoHandler((token, guard) => createRestFrdoPorts({ supabaseUrl: 'https://fixture.invalid', publishableKey: 'PUBLIC_SYNTHETIC', serviceKey: 'SERVICE_SYNTHETIC_NOT_REAL', originalBearer: token, fetch: dependency, guard, donor: async () => { throw Error('Writer must not run'); }, xml: {} as never }));
    const response = await handler(new Request('https://handler.invalid', { method: 'POST', headers: { authorization: 'Bearer ORIGINAL_SYNTHETIC', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    expect(response.status).toBe(test.status);
    const result = await response.json();
    expect(result).toMatchObject({ code: test.code, retryable: false });
    expect(JSON.stringify(result)).not.toContain('MUST_NOT_LEAK');
    expect(cancelled).toBe(true);
    expect(dependency).toHaveBeenCalledTimes(test.at === 'rpc' ? 2 : 1);
  });
});
