import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { deferred } from './fixtures';
const ports = vi.hoisted(() => ({
  auth: { user: { id: 'qa-user-A' } as { id: string } | null, loading: false, authError: null as string | null, userRole: 'student' },
  rpc: vi.fn(), signals: [] as AbortSignal[],
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ports.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: (...args: unknown[]) => {
    const request = ports.rpc(...args);
    if (request && typeof request.abortSignal === 'function') return request;
    return { abortSignal: (signal: AbortSignal) => {
      ports.signals.push(signal);
      return Promise.resolve(request).then(data => ({ data, error: null }));
    } };
  },
} }));
import { useDrivingSchoolParticipantEntry } from '@/hooks/useDrivingSchoolParticipantEntry';

type Scope = { org: string | null; subject: string | null; enabled: boolean };
const initial: Scope = { org: 'qa-org-A', subject: 'qa-user-A', enabled: true };
const student = (org = 'qa-org-A') => ({ organization_id: org, name: 'QA School', role: 'student' });
const instructor = (org = 'qa-org-A') => ({ organization_id: org, name: 'QA School', role: 'instructor' });
function useEntry(value: Scope) {
  return useDrivingSchoolParticipantEntry(value.org, value.subject, value.enabled);
}
beforeEach(() => {
  ports.auth = { user: { id: 'qa-user-A' }, loading: false, authError: null, userRole: 'student' };
  ports.signals = [];
  ports.rpc.mockReset().mockImplementation(() => { throw new Error('Unexpected participant lookup'); });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { vi.useRealTimers(); });

describe('ordinary account participant entry visibility', () => {
  it('ASPE01 absent Auth, pending Auth, Auth error, absent organization, absent subject, identity mismatch and disabled preview never call the RPC', () => {
    const cases: Array<{ auth: typeof ports.auth; scope: Scope }> = [
      { auth: { ...ports.auth, user: null }, scope: initial },
      { auth: { ...ports.auth, loading: true }, scope: initial },
      { auth: { ...ports.auth, authError: 'SESSION_UNAVAILABLE' }, scope: initial },
      { auth: ports.auth, scope: { ...initial, org: null } },
      { auth: ports.auth, scope: { ...initial, subject: null } },
      { auth: ports.auth, scope: { ...initial, subject: 'different-user' } },
      { auth: ports.auth, scope: { ...initial, enabled: false } },
    ];
    for (const value of cases) {
      ports.auth = value.auth;
      const view = renderHook(() => useEntry(value.scope));
      expect(view.result.current).toBe(false);
      view.unmount();
    }
    expect(ports.rpc).not.toHaveBeenCalled();
  });

  it('ASPE02 pending lookup is hidden and an exact server-confirmed student in the current organization opens the entry', async () => {
    const pending = deferred<unknown>();
    ports.rpc.mockReturnValueOnce(pending.promise);
    const view = renderHook(() => useEntry(initial));
    expect(view.result.current).toBe(false);
    expect(ports.rpc).toHaveBeenCalledExactlyOnceWith('driving_my_schools');
    await act(async () => pending.resolve([student()]));
    expect(view.result.current).toBe(true);
  });

  it('ASPE03 an ordinary account bound as instructor is eligible without any management capability or inferred account role', async () => {
    ports.rpc.mockResolvedValueOnce([instructor()]);
    const view = renderHook(() => useEntry(initial));
    await waitFor(() => expect(view.result.current).toBe(true));
    expect(ports.auth.userRole).toBe('student');
    expect(ports.rpc).toHaveBeenCalledExactlyOnceWith('driving_my_schools');
  });

  it('ASPE04 empty server selection for an unbound or disconnected account remains hidden without inventing a connected flag', async () => {
    ports.rpc.mockResolvedValueOnce([]);
    const view = renderHook(() => useEntry(initial));
    await waitFor(() => expect(ports.rpc).toHaveBeenCalledTimes(1));
    expect(view.result.current).toBe(false);
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current).toBe(false);
  });

  it('ASPE05 wrong organizations and malformed, missing or unsupported server rows never open the entry', async () => {
    const values: unknown[] = [
      [student('qa-other-org')], null, {}, 'qa-school',
      [null], [{ organization_id: 'qa-org-A', name: 'QA', role: 'owner' }],
      [{ organization_id: 'qa-org-A', role: 'student' }],
      [{ organization_id: '', name: 'QA', role: 'student' }],
      [student(), { organization_id: 'qa-other-org', name: 7, role: 'instructor' }],
    ];
    for (const value of values) {
      ports.rpc.mockResolvedValueOnce(value);
      const view = renderHook(() => useEntry(initial));
      await act(async () => { await Promise.resolve(); });
      expect(view.result.current).toBe(false);
      view.unmount();
    }
    expect(ports.rpc).toHaveBeenCalledTimes(values.length);
  });

  it('ASPE06 multiple valid school rows are checked for the actual organization and do not imply selecting a first school', async () => {
    ports.rpc.mockResolvedValueOnce([student('qa-other-org'), instructor('qa-org-A')]);
    const view = renderHook(() => useEntry(initial));
    await waitFor(() => expect(view.result.current).toBe(true));
    expect(ports.rpc).toHaveBeenCalledExactlyOnceWith('driving_my_schools');
  });

  it('ASPE07 a fresh focus check hides the previous success while pending and keeps it closed after a permission or network failure', async () => {
    const pending = deferred<unknown>();
    ports.rpc.mockResolvedValueOnce([student()]).mockReturnValueOnce(pending.promise);
    const view = renderHook(() => useEntry(initial));
    await waitFor(() => expect(view.result.current).toBe(true));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(view.result.current).toBe(false);
    await act(async () => pending.reject(new Error('DRIVING_FORBIDDEN')));
    expect(view.result.current).toBe(false);
  });

  it('ASPE08 repeated focus and visibility events do not accumulate overlapping RPCs while a lookup is pending', async () => {
    const pending = deferred<unknown>();
    ports.rpc.mockReturnValueOnce(pending.promise);
    const view = renderHook(() => useEntry(initial));
    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(ports.rpc).toHaveBeenCalledTimes(1);
    expect(view.result.current).toBe(false);
    await act(async () => pending.resolve([student()]));
    expect(view.result.current).toBe(true);
    ports.rpc.mockResolvedValueOnce([]);
    await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve(); });
    expect(view.result.current).toBe(false);
    expect(ports.rpc).toHaveBeenCalledTimes(2);
  });

  it('ASPE09 a new account checks independently while the predecessor read never completes and its physical signal is aborted', async () => {
    const oldPending = deferred<unknown>(), nextPending = deferred<unknown>();
    ports.rpc.mockResolvedValueOnce([student()]).mockReturnValueOnce(oldPending.promise).mockReturnValueOnce(nextPending.promise);
    const view = renderHook(useEntry, { initialProps: initial });
    await waitFor(() => expect(view.result.current).toBe(true));
    act(() => window.dispatchEvent(new Event('focus')));
    ports.auth = { ...ports.auth, user: { id: 'qa-user-B' } };
    view.rerender({ ...initial, subject: 'qa-user-B' });
    expect(view.result.current).toBe(false);
    expect(ports.signals[1].aborted).toBe(true);
    expect(ports.rpc).toHaveBeenCalledTimes(3);
    await act(async () => nextPending.resolve([instructor()]));
    expect(view.result.current).toBe(true);
    await act(async () => oldPending.resolve([]));
    expect(view.result.current).toBe(true);
  });

  it('ASPE10 returning from account A through B to A aborts both predecessors and never accepts an older A response', async () => {
    const firstA = deferred<unknown>(), pendingB = deferred<unknown>(), newA = deferred<unknown>();
    ports.rpc.mockReturnValueOnce(firstA.promise).mockReturnValueOnce(pendingB.promise).mockReturnValueOnce(newA.promise);
    const view = renderHook(useEntry, { initialProps: initial });
    ports.auth = { ...ports.auth, user: { id: 'qa-user-B' } };
    view.rerender({ ...initial, subject: 'qa-user-B' });
    ports.auth = { ...ports.auth, user: { id: 'qa-user-A' } };
    view.rerender(initial);
    expect(ports.rpc).toHaveBeenCalledTimes(3);
    expect(ports.signals[0].aborted).toBe(true);
    expect(ports.signals[1].aborted).toBe(true);
    await act(async () => firstA.resolve([student()]));
    expect(view.result.current).toBe(false);
    await act(async () => pendingB.resolve([student()]));
    expect(view.result.current).toBe(false);
    await act(async () => newA.resolve([student()]));
    expect(view.result.current).toBe(true);
  });

  it('ASPE11 a new organization checks without waiting for a hung old organization and cannot inherit its response', async () => {
    const older = deferred<unknown>(), newer = deferred<unknown>();
    ports.rpc.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const view = renderHook(useEntry, { initialProps: initial });
    view.rerender({ ...initial, org: 'qa-org-B' });
    expect(ports.signals[0].aborted).toBe(true);
    expect(ports.rpc).toHaveBeenCalledTimes(2);
    await act(async () => newer.resolve([student('qa-org-B')]));
    expect(view.result.current).toBe(true);
    await act(async () => older.resolve([]));
    expect(view.result.current).toBe(true);
  });

  it('ASPE12 disabling and unmounting dispose pending requests and remove focus and visibility listeners', async () => {
    const disabledPending = deferred<unknown>(), unmountedPending = deferred<unknown>();
    ports.rpc.mockReturnValueOnce(disabledPending.promise).mockReturnValueOnce(unmountedPending.promise);
    const view = renderHook(useEntry, { initialProps: initial });
    view.rerender({ ...initial, enabled: false });
    expect(ports.signals[0].aborted).toBe(true);
    await act(async () => disabledPending.resolve([student()]));
    expect(view.result.current).toBe(false);
    view.rerender(initial);
    expect(ports.rpc).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(ports.signals[1].aborted).toBe(true);
    await act(async () => unmountedPending.resolve([student()]));
    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(ports.rpc).toHaveBeenCalledTimes(2);
  });

  it('ASPE13 visibility and focus rechecks are event-driven, stay quiet while hidden and close a revoked server selection', async () => {
    ports.rpc.mockResolvedValueOnce([student()]);
    const view = renderHook(() => useEntry(initial));
    await waitFor(() => expect(view.result.current).toBe(true));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(ports.rpc).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue('visible');
    ports.rpc.mockResolvedValueOnce([]);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });
    expect(view.result.current).toBe(false);
    expect(ports.rpc).toHaveBeenCalledTimes(2);
    ports.rpc.mockResolvedValueOnce([instructor()]);
    await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve(); });
    expect(view.result.current).toBe(true);
    expect(ports.rpc).toHaveBeenCalledTimes(3);
  });

  it('ASPE14 a returned RPC error cannot open the entry even if the envelope also contains apparently valid data', async () => {
    ports.rpc.mockReturnValueOnce({ abortSignal: () => Promise.resolve({ data: [student()], error: { code: '42501' } }) });
    const view = renderHook(() => useEntry(initial));
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current).toBe(false);
    expect(ports.rpc).toHaveBeenCalledExactlyOnceWith('driving_my_schools');
  });

  it('ASPE15 the actual installed Supabase query builder forwards a physical abort signal and bounded timeout never accumulates live fetches', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const signals: AbortSignal[] = [];
    const paths: string[] = [];
    let active = 0, maximumActive = 0;
    const transport = vi.fn((input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) throw new Error('Actual SDK failed to forward the abort signal');
      expect(typeof input).toBe('string');
      paths.push(new URL(String(input)).pathname);
      signals.push(signal);
      if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
      active++; maximumActive = Math.max(maximumActive, active);
      signal.addEventListener('abort', () => {
        active--; reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    }));
    const client = createClient('https://qa.example.invalid', 'synthetic-publishable-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: transport as typeof fetch },
    });
    ports.rpc.mockImplementation((name: string) => client.rpc(name));
    let view!: ReturnType<typeof renderHook<boolean, Scope>>;
    await act(async () => {
      view = renderHook(useEntry, { initialProps: initial });
      for (let i = 0; i < 30; i++) await Promise.resolve();
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(paths).toEqual(['/rest/v1/rpc/driving_my_schools']);
    expect(view.result.current).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(12000);
      for (let i = 0; i < 30; i++) await Promise.resolve();
    });
    expect(signals[0].aborted).toBe(true);
    expect(active).toBe(0);
    expect(view.result.current).toBe(false);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      for (let i = 0; i < 30; i++) await Promise.resolve();
    });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(signals[1].aborted).toBe(false);
    expect(maximumActive).toBe(1);
    view.unmount();
    expect(signals[1].aborted).toBe(true);
    expect(active).toBe(0);
    await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); });
  });

});
