import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueTestSubmission, flushPendingSubmissions, listPendingSubmissions, type PendingTestSubmission } from '../testAnswerQueue';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.getSession }, rpc: mocks.rpc } }));

// A deterministic storage boundary fake: these tests exercise queue identity,
// authenticated dispatch and retry semantics, not the IndexedDB engine.
function memoryIndexedDB() {
  const items = new Map<string, PendingTestSubmission>();
  const db = {
    objectStoreNames: { contains: () => true },
    close: vi.fn(),
    transaction: () => {
      const tx = { oncomplete: null, onerror: null, onabort: null } as unknown as IDBTransaction;
      const store = {
        put: (item: PendingTestSubmission) => queueMicrotask(() => {
          items.set(item.id, structuredClone(item));
          tx.oncomplete?.(new Event('complete'));
        }),
        delete: (id: string) => queueMicrotask(() => {
          items.delete(id); tx.oncomplete?.(new Event('complete'));
        }),
        getAll: () => {
          const req = { onsuccess: null, onerror: null, result: undefined } as unknown as IDBRequest;
          queueMicrotask(() => {
            Object.defineProperty(req, 'result', { value: [...items.values()].map(item => structuredClone(item)) });
            req.onsuccess?.(new Event('success'));
          });
          return req;
        },
      };
      Object.assign(tx, { objectStore: () => store });
      return tx;
    },
  };
  return {
    items,
    factory: { open: () => {
      const req = { onsuccess: null, onerror: null, result: db } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => req.onsuccess?.(new Event('success')));
      return req;
    } },
  };
}
const payload = (overrides = {}) => ({
  userId: 'user-a', attemptId: 'attempt-a', lessonId: 'lesson-a',
  answers: { q1: 0 }, shownQuestionIds: ['q1'], ...overrides,
});
let storage: ReturnType<typeof memoryIndexedDB>;
beforeEach(() => {
  vi.clearAllMocks();
  storage = memoryIndexedDB();
  vi.stubGlobal('indexedDB', storage.factory);
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-a' } } } });
  mocks.rpc.mockResolvedValue({ data: { score: 1, maxScore: 1 }, error: null });
});
afterEach(() => vi.unstubAllGlobals());

describe('test answer queue authenticated delivery', () => {
  it('deduplicates repeated saves of one server attempt and preserves the latest answers', async () => {
    const id1 = await enqueueTestSubmission(payload());
    const id2 = await enqueueTestSubmission(payload({ answers: { q1: 1 } }));
    expect(id1).toBe('user-a:attempt-a');
    expect(id2).toBe(id1);
    const queued = await listPendingSubmissions();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ userId: 'user-a', attemptId: 'attempt-a', answers: { q1: 1 } });
  });

  it('never sends one account answers under another account session', async () => {
    await enqueueTestSubmission(payload());
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-b' } } } });
    expect(await flushPendingSubmissions()).toEqual({ sent: 0, failed: 1 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(await listPendingSubmissions()).toHaveLength(1);
  });

  it('does not send anonymous or legacy items without trusted attempt ownership', async () => {
    storage.items.set('legacy', { id: 'legacy', lessonId: 'lesson-a', answers: { q1: 1 }, shownQuestionIds: ['q1'], createdAt: 1, attempts: 0 });
    expect(await flushPendingSubmissions()).toEqual({ sent: 0, failed: 1 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    await enqueueTestSubmission(payload());
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    expect(await flushPendingSubmissions()).toEqual({ sent: 0, failed: 2 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('retries with the original attempt ID and removes only the acknowledged submission', async () => {
    const sync = vi.fn();
    window.addEventListener('test-submission-synced', sync);
    try {
      await enqueueTestSubmission(payload());
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '08006' } });
      expect(await flushPendingSubmissions()).toEqual({ sent: 0, failed: 1 });
      expect((await listPendingSubmissions())[0]).toMatchObject({ attemptId: 'attempt-a', attempts: 1 });
      expect(sync).not.toHaveBeenCalled();
      expect(await flushPendingSubmissions()).toEqual({ sent: 1, failed: 0 });
      expect(mocks.rpc.mock.calls).toEqual([
        ['submit_test_attempt', { p_attempt_id: 'attempt-a', p_answers: { q1: 0 } }],
        ['submit_test_attempt', { p_attempt_id: 'attempt-a', p_answers: { q1: 0 } }],
      ]);
      expect(await listPendingSubmissions()).toEqual([]);
      expect(sync).toHaveBeenCalledTimes(1);
    } finally { window.removeEventListener('test-submission-synced', sync); }
  });

  it('shares an in-flight flush so simultaneous online events cannot duplicate dispatch', async () => {
    await enqueueTestSubmission(payload());
    let resolve!: (value: unknown) => void;
    mocks.rpc.mockReturnValue(new Promise(done => { resolve = done; }));
    const first = flushPendingSubmissions();
    const second = flushPendingSubmissions();
    expect(second).toBe(first);
    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    resolve({ data: { score: 1 }, error: null });
    expect(await first).toEqual({ sent: 1, failed: 0 });
    expect(await second).toEqual({ sent: 1, failed: 0 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
