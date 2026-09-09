import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { FunctionInvokeOptions } from '@supabase/supabase-js';
import { safeInvoke } from '../safeInvoke';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('../networkErrorDetector', () => ({
  isBlockedBySecuritySoftware: () => ({ blocked: false }), markBlockDetected: vi.fn(), wasBlockAlreadyShown: () => false,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

beforeEach(() => { mocks.invoke.mockReset(); mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null }); });

describe('safeInvoke uses the installed SDK request body contract', () => {
  it('exposes exactly the SDK body and headers options without casts', () => {
    expectTypeOf<Parameters<typeof safeInvoke>[1]>().toEqualTypeOf<Pick<FunctionInvokeOptions, 'body' | 'headers'> | undefined>();
  });
  const record: Record<string, unknown> = { title: 'QA', nested: { content: 'не отправляется' } };
  const bodies: FunctionInvokeOptions['body'][] = [
    record, new FormData(), new File(['QA'], 'qa.txt'), new Blob(['QA']), new ArrayBuffer(2),
    new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } }), 'raw QA body', undefined,
  ];
  it.each(bodies)('passes an SDK-supported body through without serializing or copying it (%#)', async body => {
    const headers = { 'x-qa': 'local-only' };
    const result = await safeInvoke<{ ok: boolean }>('qa-function', { body, headers });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke.mock.calls[0][0]).toBe('qa-function');
    expect(mocks.invoke.mock.calls[0][1].body).toBe(body);
    expect(mocks.invoke.mock.calls[0][1].headers).toBe(headers);
    expect(result).toEqual({ data: { ok: true }, error: null });
  });
  it('keeps calls without options valid', async () => {
    await safeInvoke('qa-function');
    expect(mocks.invoke).toHaveBeenCalledWith('qa-function', { body: undefined, headers: undefined });
  });
});
