import { createElement, type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudentDashboardSnapshot } from '../useStudentDashboardSnapshot';
import { setOfflineAuthActor, observeOfflineAccess } from '@/utils/courseCache';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
const snapshot = (name: string) => ({ data: { profile: { user_id: 'target', full_name: name, organization_id: 'org' }, enrollments: [] }, error: null });
const pending = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; };
let client: QueryClient;
beforeEach(() => { vi.clearAllMocks(); setOfflineAuthActor(null); setOfflineAuthActor('a'); client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } }); });
afterEach(() => { cleanup(); client.clear(); setOfflineAuthActor(null); });
const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);

describe('dashboard snapshot actor/access query identity', () => {
  it('same target never reuses a prior actor snapshot, including A→B→A pending responses', async () => {
    mocks.rpc.mockResolvedValueOnce(snapshot('first A'));
    const hook = renderHook(({ actor }) => useStudentDashboardSnapshot('target', actor), { initialProps: { actor: 'a' }, wrapper });
    await waitFor(() => expect(hook.result.current.data?.profile.full_name).toBe('first A'));
    const b = pending(); const secondA = pending(); mocks.rpc.mockReturnValueOnce(b.promise).mockReturnValueOnce(secondA.promise);
    act(() => { setOfflineAuthActor('b'); hook.rerender({ actor: 'b' }); });
    expect(hook.result.current.data).toBeUndefined(); await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    act(() => { setOfflineAuthActor('a'); hook.rerender({ actor: 'a' }); });
    expect(hook.result.current.data).toBeUndefined(); await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(3));
    await act(async () => { b.resolve(snapshot('stale B')); });
    expect(hook.result.current.data).toBeUndefined();
    await act(async () => { secondA.resolve(snapshot('current A')); });
    await waitFor(() => expect(hook.result.current.data?.profile.full_name).toBe('current A'));
  });
  it('observed same-actor role downgrade creates a fresh boundary instead of stale30second data', async () => {
    mocks.rpc.mockResolvedValueOnce(snapshot('old authorized preview'));
    const hook = renderHook(() => {
      const query = useStudentDashboardSnapshot('target', 'a');
      return { data: query.data, isError: query.isError };
    }, { wrapper });
    await waitFor(() => expect(hook.result.current.data?.profile.full_name).toBe('old authorized preview'));
    const fresh = pending(); mocks.rpc.mockReturnValueOnce(fresh.promise);
    act(() => { observeOfflineAccess('a', 'server-role:student'); hook.rerender(); });
    expect(hook.result.current.data).toBeUndefined();
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    await act(async () => { fresh.resolve({ data: null, error: { status: 403, message: 'denied' } }); });
    await waitFor(() => expect(hook.result.current.isError).toBe(true)); expect(hook.result.current.data).toBeUndefined();
  });
  it.each([{status: 403, message: 'forbidden'}, {code: 'P0001', message: 'Access denied'}])('same-key observed denial masks retained query history: %j', async error => {
    mocks.rpc.mockResolvedValueOnce(snapshot('private old success'));
    const hook = renderHook(() => useStudentDashboardSnapshot('target', 'a'), {wrapper});
    await waitFor(() => expect(hook.result.current.data?.profile.full_name).toBe('private old success'));
    mocks.rpc.mockResolvedValueOnce({data: null, error}); await act(async () => {await hook.result.current.refetch();});
    await waitFor(() => expect(hook.result.current.accessDenied).toBe(true)); expect(hook.result.current.data).toBeUndefined();
    expect(client.getQueriesData({queryKey: ['student-dashboard-snapshot']})[0][1]).toMatchObject({profile: {full_name: 'private old success'}});
  });
  it('same-owner network grace remains separate from a successful unconfirmed target response', async () => {
    mocks.rpc.mockResolvedValueOnce(snapshot('same owner'));
    const hook = renderHook(() => useStudentDashboardSnapshot('target', 'a'), {wrapper}); await waitFor(() => expect(hook.result.current.data?.profile.full_name).toBe('same owner'));
    mocks.rpc.mockResolvedValue({data: null, error: new TypeError('Failed to fetch')}); await act(async () => {await hook.result.current.refetch();});
    expect(hook.result.current.accessDenied).toBe(false); expect(hook.result.current.data?.profile.full_name).toBe('same owner');
    mocks.rpc.mockResolvedValueOnce({data: {profile: {user_id: 'different-target'}}, error: null}); await act(async () => {await hook.result.current.refetch();});
    await waitFor(() => expect(hook.result.current.unconfirmed).toBe(true)); expect(hook.result.current.data).toBeUndefined();
  });
});
