import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { useExplicitUserCredential, type CredentialTarget } from '@/hooks/useExplicitUserCredential';

const port = vi.hoisted(() => ({ auth: null as any, rpc: vi.fn(), requests: [] as any[] }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => port.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: any[]) => port.rpc(...args) } }));
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ADMIN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORG_A = '33333333-3333-4333-8333-333333333333';
const ORG_B = '44444444-4444-4444-8444-444444444444';
const target = (id: string, organization = ORG_A): CredentialTarget => ({
  id, user_id: id, organization_id: organization, login: id === A ? 'qa_a' : 'qa_b',
  role: 'student', full_name: 'Synthetic credential QA', created_at: '2026-10-28T00:00:00Z',
});
const auth = (id = ADMIN_A, expires = Math.floor(Date.now() / 1000) + 3600) => ({
  user: { id }, session: { user: { id }, expires_at: expires, access_token: 'SYNTHETIC_NOT_A_TOKEN' },
  userRole: 'admin', loading: false, authError: null,
});
const ticks = async () => { await act(async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); }); };
const begin = (result: any, id = A) => act(() => { void result.current.toggle(id); });
const settle = async (index: number, data: unknown, error: unknown = null) => {
  await act(async () => { port.requests[index].resolve({ data, error }); await Promise.resolve(); });
};
const visible = () => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
beforeEach(() => {
  visible();
  port.auth = auth();
  port.requests = [];
  port.rpc.mockReset().mockImplementation((_name, _args) => ({
    abortSignal: (signal: AbortSignal) => new Promise(resolve => port.requests.push({ signal, resolve })),
  }));
});
afterEach(() => { vi.useRealTimers(); visible(); });

describe('explicit one-target administrator credential hook', () => {
  it('ACRH01 initial ready list and invalid Auth or malformed target never call either decrypt RPC', () => {
    const h = renderHook(() => useExplicitUserCredential([target(A)], 'list'));
    expect(port.rpc).not.toHaveBeenCalled();
    for (const invalid of [
      { ...auth(), user: null }, { ...auth(), session: null }, { ...auth(), loading: true },
      { ...auth(), authError: 'SESSION_UNAVAILABLE' }, { ...auth(), userRole: 'student' },
      { ...auth(), session: { user: { id: ADMIN_B }, expires_at: Math.floor(Date.now() / 1000) + 3600 } },
      { ...auth(), session: { user: { id: ADMIN_A } } },
    ]) {
      port.auth = invalid; h.rerender(); begin(h.result);
      expect(h.result.current.passwordFor(A)).toBeNull();
    }
    port.auth = auth(); h.rerender();
    begin(h.result, ''); begin(h.result, 'not-a-uuid'); begin(h.result, B);
    expect(port.rpc).not.toHaveBeenCalled();
    h.unmount();
  });

  it('ACRH02 only explicit reveal reads the exact UUID once and exposes only that current target', async () => {
    const h = renderHook(() => useExplicitUserCredential([target(A), target(B)], 'list'));
    begin(h.result);
    expect(port.rpc).toHaveBeenCalledTimes(1);
    expect(port.rpc).toHaveBeenCalledWith('get_decrypted_student_password', { p_user_id: A });
    expect(h.result.current.pendingUserId).toBe(A);
    expect(h.result.current.passwordFor(A)).toBeNull();
    await settle(0, 'QA_ONLY_SECRET_A');
    expect(h.result.current.passwordFor(A)).toBe('QA_ONLY_SECRET_A');
    expect(h.result.current.passwordFor(B)).toBeNull();
    expect(h.result.current.pendingUserId).toBeNull();
    h.unmount();
  });

  it('ACRH03 hide clears the value and reopening performs a new authorized read without cached plaintext', async () => {
    const h = renderHook(() => useExplicitUserCredential([target(A)], 'list'));
    begin(h.result); await settle(0, 'QA_OLD_VALUE');
    begin(h.result);
    expect(h.result.current.passwordFor(A)).toBeNull();
    begin(h.result);
    expect(port.rpc).toHaveBeenCalledTimes(2);
    expect(h.result.current.passwordFor(A)).toBeNull();
    await settle(1, 'QA_FRESH_VALUE');
    expect(h.result.current.passwordFor(A)).toBe('QA_FRESH_VALUE');
    act(() => h.result.current.clear(A));
    expect(h.result.current.passwordFor(A)).toBeNull();
    h.unmount();
  });

  it('ACRH04 A to B to A aborts predecessors and old success or failure cannot restore an earlier target', async () => {
    const h = renderHook(() => useExplicitUserCredential([target(A), target(B)], 'list'));
    begin(h.result, A); begin(h.result, B); begin(h.result, A);
    expect(port.requests[0].signal.aborted).toBe(true);
    expect(port.requests[1].signal.aborted).toBe(true);
    expect(port.requests[2].signal.aborted).toBe(false);
    await settle(0, 'STALE_A');
    await settle(1, null, { message: 'STALE_B_FAILURE' });
    expect(h.result.current.passwordFor(A)).toBeNull();
    expect(h.result.current.passwordFor(B)).toBeNull();
    expect(h.result.current.failedVersion).toBeNull();
    await settle(2, 'CURRENT_A');
    expect(h.result.current.passwordFor(A)).toBe('CURRENT_A');
    h.unmount();
  });

  it('ACRH05 logout loading Auth error role loss and renewed session dispose pending reads and close revealed values', async () => {
    for (const change of [
      () => ({ ...auth(), user: null, session: null }),
      () => ({ ...auth(), loading: true }),
      () => ({ ...auth(), authError: 'ROLE_UNAVAILABLE' }),
      () => ({ ...auth(), userRole: 'student' }),
      () => auth(),
    ]) {
      port.auth = auth();
      const h = renderHook(() => useExplicitUserCredential([target(A)], 'list'));
      const requestIndex = port.requests.length;
      begin(h.result); port.auth = change(); h.rerender();
      expect(port.requests[requestIndex].signal.aborted).toBe(true);
      await settle(requestIndex, 'LATE_AFTER_AUTH_CHANGE');
      expect(h.result.current.passwordFor(A)).toBeNull();
      expect(h.result.current.pendingUserId).toBeNull();
      h.unmount();
    }
  });

  it('ACRH06 filtering paging row removal and organization login or role replacement close the exact old scope', async () => {
    for (const replacement of [
      { rows: [] as CredentialTarget[], view: 'list' },
      { rows: [target(A)], view: 'filter-changed' },
      { rows: [target(A)], view: 'page-changed' },
      { rows: [target(A, ORG_B)], view: 'list' },
      { rows: [{ ...target(A), login: 'qa_new_login' }], view: 'list' },
      { rows: [{ ...target(A), role: 'organization' }], view: 'list' },
    ]) {
      const h = renderHook(({ rows, view }) => useExplicitUserCredential(rows, view), {
        initialProps: { rows: [target(A)], view: 'list' },
      });
      const requestIndex = port.requests.length;
      begin(h.result); await settle(requestIndex, 'QA_VISIBLE_BEFORE_CHANGE');
      expect(h.result.current.passwordFor(A)).toBe('QA_VISIBLE_BEFORE_CHANGE');
      h.rerender(replacement);
      expect(h.result.current.passwordFor(A)).toBeNull();
      expect(h.result.current.pendingUserId).toBeNull();
      h.unmount();
    }
    const pending = renderHook(({ rows }) => useExplicitUserCredential(rows, 'list'), { initialProps: { rows: [target(A)] } });
    const requestIndex = port.requests.length; begin(pending.result);
    pending.rerender({ rows: [] });
    expect(port.requests[requestIndex].signal.aborted).toBe(true);
    await settle(requestIndex, 'LATE_AFTER_ROW_REMOVAL');
    expect(pending.result.current.passwordFor(A)).toBeNull();
    pending.unmount();
  });

  it('ACRH07 denied network null empty malformed ciphertext and mask results remain unknown and expose nothing to copy', async () => {
    const h = renderHook(() => useExplicitUserCredential([target(A)], 'list'));
    for (const [data, error] of [
      [null, null], ['', null], ['   ', null], [{ password: 'NOT_A_TEXT_RESULT' }, null],
      ['ENC:NOT_PLAINTEXT', null], ['••••••••', null], ['********', null],
      ['APPARENT_SUCCESS_WITH_ERROR', { message: 'Unauthorized' }],
    ] as [unknown, unknown][]) {
      const index = port.requests.length; begin(h.result); await settle(index, data, error);
      expect(h.result.current.passwordFor(A)).toBeNull();
      expect(h.result.current.failedVersion).not.toBeNull();
      expect(h.result.current.pendingUserId).toBeNull();
    }
    port.rpc.mockImplementationOnce(() => ({ abortSignal: () => Promise.reject(Error('offline')) }));
    begin(h.result); await ticks();
    expect(h.result.current.passwordFor(A)).toBeNull();
    expect(h.result.current.failedVersion).not.toBeNull();
    h.unmount();
  });

  it('ACRH08 pending re-click cancels and bounded timeout aborts the physical signal before a new explicit read', async () => {
    vi.useFakeTimers();
    const h = renderHook(() => useExplicitUserCredential([target(A)], 'list'));
    begin(h.result); begin(h.result);
    expect(port.rpc).toHaveBeenCalledTimes(1);
    expect(port.requests[0].signal.aborted).toBe(true);
    expect(h.result.current.pendingUserId).toBeNull();
    begin(h.result);
    expect(port.rpc).toHaveBeenCalledTimes(2);
    await act(async () => { vi.advanceTimersByTime(12000); await Promise.resolve(); });
    expect(port.requests[1].signal.aborted).toBe(true);
    expect(h.result.current.pendingUserId).toBeNull();
    expect(h.result.current.failedVersion).not.toBeNull();
    await settle(1, 'LATE_AFTER_PHYSICAL_ABORT');
    expect(h.result.current.passwordFor(A)).toBeNull();
    begin(h.result); await settle(2, 'AFTER_NEW_EXPLICIT_ACTION');
    expect(h.result.current.passwordFor(A)).toBe('AFTER_NEW_EXPLICIT_ACTION');
    begin(h.result); begin(h.result);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => { vi.advanceTimersByTime(12000); await Promise.resolve(); });
    expect(port.requests[3].signal.aborted).toBe(true);
    expect(h.result.current.passwordFor(A)).toBeNull();
    visible(); h.unmount();
  });

  it('ACRH09 hiding blur and unmount dispose values requests listeners and timers and focus never decrypts automatically', async () => {
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const removeDocument = vi.spyOn(document, 'removeEventListener');
    const h = renderHook(() => useExplicitUserCredential([target(A)], 'list'));
    begin(h.result); await settle(0, 'BEFORE_HIDDEN');
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(h.result.current.passwordFor(A)).toBeNull();
    begin(h.result);
    expect(port.rpc).toHaveBeenCalledTimes(1);
    act(() => { visible(); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
    expect(port.rpc).toHaveBeenCalledTimes(1);
    begin(h.result); await settle(1, 'BEFORE_BLUR');
    act(() => window.dispatchEvent(new Event('blur')));
    expect(h.result.current.passwordFor(A)).toBeNull();
    begin(h.result);
    const last = port.requests[2];
    h.unmount();
    expect(last.signal.aborted).toBe(true);
    expect(removeWindow).toHaveBeenCalledWith('blur', expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('ACRH10 session expiry closes a revealed value and refuses any new read from the expired context', async () => {
    vi.useFakeTimers();
    port.auth = auth(ADMIN_A, Math.floor(Date.now() / 1000) + 2);
    const h = renderHook(() => useExplicitUserCredential([target(A)], 'list'));
    begin(h.result); await settle(0, 'SHORT_SESSION_VALUE');
    expect(h.result.current.passwordFor(A)).toBe('SHORT_SESSION_VALUE');
    await act(async () => { vi.advanceTimersByTime(2100); await Promise.resolve(); });
    expect(h.result.current.passwordFor(A)).toBeNull();
    begin(h.result);
    expect(port.rpc).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  it('ACRH11 actor A through B back to A never waits for a hung predecessor and rejects both old actor responses', async () => {
    const h = renderHook(() => useExplicitUserCredential([target(A)], 'list'));
    begin(h.result);
    port.auth = auth(ADMIN_B); h.rerender(); begin(h.result);
    port.auth = auth(ADMIN_A); h.rerender(); begin(h.result);
    expect(port.requests).toHaveLength(3);
    expect(port.requests[0].signal.aborted).toBe(true);
    expect(port.requests[1].signal.aborted).toBe(true);
    await settle(0, 'EARLIER_ACTOR_A');
    await settle(1, 'EARLIER_ACTOR_B');
    expect(h.result.current.passwordFor(A)).toBeNull();
    await settle(2, 'NEW_ACTOR_A_READ');
    expect(h.result.current.passwordFor(A)).toBe('NEW_ACTOR_A_READ');
    h.unmount();
  });

  it('ACRH12 actual installed Supabase builder forwards AbortSignal to offline fetch and target timeout and unmount keep at most one physical request', async () => {
    vi.useFakeTimers();
    const physical: { signal: AbortSignal; body: any; aborted: boolean }[] = [];
    let active = 0, maximum = 0;
    const sdk = createClient('https://credential-qa.invalid', 'SYNTHETIC_PUBLIC_TEST_KEY', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: ((_url: unknown, init: RequestInit) => {
        const signal = init.signal as AbortSignal;
        expect(signal).toBeDefined();
        const item = { signal, body: JSON.parse(String(init.body)), aborted: false };
        physical.push(item); active++; maximum = Math.max(maximum, active);
        return new Promise((_resolve, reject) => {
          const aborted = () => {
            if (item.aborted) return;
            item.aborted = true; active--;
            reject(new DOMException('Synthetic physical abort', 'AbortError'));
          };
          if (signal.aborted) aborted(); else signal.addEventListener('abort', aborted, { once: true });
        });
      }) as typeof fetch },
    });
    port.rpc.mockImplementation((name, args) => sdk.rpc(name, args));
    const h = renderHook(() => useExplicitUserCredential([target(A), target(B)], 'list'));
    begin(h.result, A); await ticks();
    expect(physical).toHaveLength(1);
    expect(physical[0].body).toEqual({ p_user_id: A });
    begin(h.result, B); await ticks();
    expect(physical).toHaveLength(2);
    expect(physical[0].aborted).toBe(true);
    expect(physical[1].body).toEqual({ p_user_id: B });
    await act(async () => { vi.advanceTimersByTime(12000); for (let i = 0; i < 80; i++) await Promise.resolve(); });
    expect(physical[1].aborted).toBe(true);
    expect(active).toBe(0);
    expect(h.result.current.passwordFor(B)).toBeNull();
    begin(h.result, A); await ticks();
    expect(physical).toHaveLength(3);
    h.unmount(); await ticks();
    expect(physical[2].aborted).toBe(true);
    expect(active).toBe(0);
    expect(maximum).toBe(1);
    expect(port.rpc.mock.calls.every(([name]) => name === 'get_decrypted_student_password')).toBe(true);
  });
});
