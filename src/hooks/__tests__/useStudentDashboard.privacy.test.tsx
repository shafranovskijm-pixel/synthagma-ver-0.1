import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudentDashboard } from '../useStudentDashboard';
import { setOfflineAuthActor, getOfflineScope } from '@/utils/courseCache';
import { offlineMemoryStorage } from '@/test/offlineMemoryStorage';
const mocks = vi.hoisted(() => ({ user: { id: 'a' } as {id: string} | null, from: vi.fn(), rpc: vi.fn(), invoke: vi.fn(),
  profiles: [] as Promise<any>[], achievements: [] as any[], identityDocs: [] as any[], liveSnapshot: false, refresh: null as null | (() => Promise<void>),
  snapshotResponse: null as any, toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/useAuth', () => ({useAuth: () => ({user: mocks.user, loading: false, signOut: vi.fn()})}));
vi.mock('@/hooks/use-mobile', () => ({useIsMobile: () => false}));
vi.mock('next-themes', () => ({useTheme: () => ({theme: 'light', setTheme: vi.fn()})}));
vi.mock('@/hooks/usePullToRefresh', () => ({usePullToRefresh: ({onRefresh}: any) => {mocks.refresh = onRefresh; return {ref: {current: null}, pullDistance: 0, isRefreshing: false, canRefresh: false};}}));
vi.mock('@/hooks/useStudentDashboardSnapshot', async original => {
  const actual = await original<typeof import('../useStudentDashboardSnapshot')>();
  return {useStudentDashboardSnapshot: (...args: Parameters<typeof actual.useStudentDashboardSnapshot>) => mocks.liveSnapshot ? actual.useStudentDashboardSnapshot(...args) : {data: undefined}};
});
vi.mock('@/utils/safeInvoke', () => ({safeInvoke: mocks.invoke}));
vi.mock('@/integrations/supabase/client', () => ({supabase: {from: mocks.from, rpc: mocks.rpc}}));
vi.mock('sonner', () => ({toast: mocks.toast}));
const profile = (name: string) => ({data: {full_name: name, organization_id: 'org', organizations: {name: 'Organization', branding: {logoUrl: name}}}, error: null});
const pending = () => {let resolve!: (value: any) => void; const promise = new Promise<any>(done => {resolve = done;}); return {promise, resolve};};
class Query {
  private mutation = false;
  constructor(private table: string) {}
  select() {return this;} eq() {return this;} order() {return this;} limit() {return this;} in() {return this;}
  update() {this.mutation = true; return this;}
  response(): Promise<any> {
    if (this.mutation) return Promise.resolve({data: null, error: null});
    if (this.table === 'profiles') return mocks.profiles.shift() || Promise.resolve(profile(mocks.user?.id || 'none'));
    return Promise.resolve({data: this.table === 'labor_safety_profiles' || this.table === 'video_identifications' ? null : this.table === 'user_achievements' ? mocks.achievements : this.table === 'student_identity_documents' ? mocks.identityDocs : [], error: null});
  }
  maybeSingle() {return this.response();} single() {return this.response();} then(resolve: any, reject: any) {return this.response().then(resolve, reject);}
}
let client: QueryClient;
const wrapper = ({children}: {children: ReactNode}) => createElement(QueryClientProvider, {client}, createElement(MemoryRouter, {initialEntries: ['/student']}, children));
beforeEach(() => {vi.clearAllMocks(); localStorage.clear(); setOfflineAuthActor(null); setOfflineAuthActor('a'); mocks.user = {id: 'a'}; mocks.profiles = []; mocks.achievements = [];
  mocks.liveSnapshot = false; mocks.refresh = null; mocks.snapshotResponse = {data: {profile: {user_id: 'a', full_name: 'a', organization_id: 'org'}, enrollments: []}, error: null};
  client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}});
  mocks.identityDocs = []; mocks.from.mockImplementation(table => new Query(table));
  mocks.rpc.mockImplementation(async (name: string) => name === 'get_student_dashboard_snapshot' ? mocks.snapshotResponse : {data: null, error: null});
  vi.stubGlobal('indexedDB', offlineMemoryStorage().factory);});
afterEach(() => {cleanup(); client.clear(); setOfflineAuthActor(null); vi.useRealTimers(); vi.unstubAllGlobals();});
describe('actual dashboard private presentation transition', () => {
  it('loaded A profile/branding disappears while B is pending; stale A→B→A profile cannot overwrite fresh A', async () => {
    const hook = renderHook(() => useStudentDashboard(), {wrapper}); await waitFor(() => expect(hook.result.current.profile?.full_name).toBe('a'));
    const b = pending(); mocks.profiles = [b.promise];
    act(() => {setOfflineAuthActor('b'); mocks.user = {id: 'b'}; hook.rerender();}); expect(hook.result.current.profile).toBeNull(); expect(hook.result.current.branding).toBeNull();
    await waitFor(() => expect(mocks.profiles).toHaveLength(0)); const fresh = pending(); mocks.profiles = [fresh.promise];
    act(() => {setOfflineAuthActor('a'); mocks.user = {id: 'a'}; hook.rerender();});
    await waitFor(() => expect(mocks.profiles).toHaveLength(0)); await act(async () => {b.resolve(profile('stale B'));});
    expect(hook.result.current.profile).toBeNull(); await act(async () => {fresh.resolve(profile('fresh A'));});
    await waitFor(() => expect(hook.result.current.profile?.full_name).toBe('fresh A'));
  });
  it('ignores already dispatched old chat result and finally after A→B→A; new context stays usable', async () => {
    const hook = renderHook(() => useStudentDashboard(), {wrapper}); await waitFor(() => expect(hook.result.current.profile?.full_name).toBe('a'));
    act(() => hook.result.current.setInputValue('A private question')); const reply = pending(); mocks.invoke.mockReturnValueOnce(reply.promise); let sending!: Promise<void>;
    act(() => {sending = hook.result.current.handleSendMessage();}); expect(hook.result.current.isAiLoading).toBe(true);
    act(() => {setOfflineAuthActor('b'); mocks.user = {id: 'b'}; hook.rerender();}); expect(hook.result.current.messages).toHaveLength(1);
    act(() => {setOfflineAuthActor('a'); mocks.user = {id: 'a'}; hook.rerender();}); await waitFor(() => expect(hook.result.current.profile?.full_name).toBe('a'));
    expect(hook.result.current.isAiLoading).toBe(false); await act(async () => {reply.resolve({data: {content: 'A private late answer'}, error: null}); await sending;});
    expect(hook.result.current.messages).toHaveLength(1); expect(hook.result.current.inputValue).toBe('');
  });
  it('does not show delayed old achievement details after actor change', async () => {
    vi.useFakeTimers(); mocks.achievements = [0, 1].map(i => ({id: `achievement-${i}`, achievements: {name: `PRIVATE_A_${i}`, description: 'private', rarity: 'common'}}));
    const hook = renderHook(() => useStudentDashboard(), {wrapper});
    await act(async () => {await vi.advanceTimersByTimeAsync(50);}); expect(hook.result.current.profile?.full_name).toBe('a');
    mocks.achievements = []; act(() => {setOfflineAuthActor('b'); mocks.user = {id: 'b'}; hook.rerender();});
    await act(async () => {await vi.advanceTimersByTimeAsync(2000);});
    expect(mocks.toast.success.mock.calls.some(call => String(call[1]?.description).includes('PRIVATE_A_1'))).toBe(false);
  });
  it('caches fresh B document metrics rather than the prior A render closure', async () => {
    const storage = offlineMemoryStorage(); vi.stubGlobal('indexedDB', storage.factory);
    mocks.identityDocs = [{type: 'passport'}, {type: 'snils'}, {type: 'education_document'}];
    const hook = renderHook(() => useStudentDashboard(), {wrapper}); await waitFor(() => expect(hook.result.current.documentsProgress.completed).toBe(3));
    mocks.identityDocs = []; act(() => {setOfflineAuthActor('b'); mocks.user = {id: 'b'}; hook.rerender();});
    await waitFor(() => expect(hook.result.current.profile?.full_name).toBe('b'));
    await waitFor(() => {
      const b = [...storage.rows('sigma-course-cache', 'dashboard_scoped_v2').values()].find(row => row.owner.actorId === 'b');
      expect(b?.documentsProgress.completed).toBe(0);
    });
  });
  it.each([
    {data: null, error: {status: 403, message: 'forbidden'}},
    {data: null, error: {code: 'P0001', message: 'Access denied'}},
    {data: null, error: null},
    {data: {profile: {user_id: 'different-target'}}, error: null},
  ])('actual same-key snapshot refetch invalidates remembered scope and dashboard presentation: %j', async response => {
    mocks.liveSnapshot = true;
    const hook = renderHook(() => useStudentDashboard(), {wrapper});
    await waitFor(() => expect(hook.result.current.profile?.full_name).toBe('a'));
    await waitFor(() => expect(getOfflineScope('a', 'a', 'learner', 'dashboard')).not.toBeNull());
    const profileReads = mocks.from.mock.calls.filter(call => call[0] === 'profiles').length;
    mocks.snapshotResponse = response;
    await act(async () => {await client.refetchQueries({queryKey: ['student-dashboard-snapshot'], type: 'active'});});
    await waitFor(() => expect(hook.result.current.profile).toBeNull());
    expect(hook.result.current.branding).toBeNull(); expect(hook.result.current.courses).toEqual([]);
    expect(getOfflineScope('a', 'a', 'learner', 'dashboard')).toBeNull();
    expect(mocks.from.mock.calls.filter(call => call[0] === 'profiles')).toHaveLength(profileReads);
    expect(mocks.rpc.mock.calls.filter(call => call[0] === 'get_student_dashboard_snapshot')).toHaveLength(2);
  });
  it('actual same-key transient network error preserves explicit same-owner grace', async () => {
    mocks.liveSnapshot = true;
    const hook = renderHook(() => useStudentDashboard(), {wrapper});
    await waitFor(() => expect(hook.result.current.profile?.full_name).toBe('a'));
    await waitFor(() => expect(getOfflineScope('a', 'a', 'learner', 'dashboard')).not.toBeNull());
    const scope = getOfflineScope('a', 'a', 'learner', 'dashboard');
    mocks.snapshotResponse = {data: null, error: new TypeError('Failed to fetch')};
    await act(async () => {await client.refetchQueries({queryKey: ['student-dashboard-snapshot'], type: 'active'});});
    expect(hook.result.current.profile?.full_name).toBe('a');
    expect(getOfflineScope('a', 'a', 'learner', 'dashboard')).toBe(scope);
  });
  it('confirmed missing heavy-load target invalidates the prior scope, which later network failure cannot resurrect', async () => {
    const hook = renderHook(() => useStudentDashboard(), {wrapper});
    await waitFor(() => expect(hook.result.current.profile?.full_name).toBe('a'));
    await waitFor(() => expect(getOfflineScope('a', 'a', 'learner', 'dashboard')).not.toBeNull());
    mocks.profiles = [Promise.resolve({data: null, error: null})];
    await act(async () => {await mocks.refresh!();});
    expect(hook.result.current.profile).toBeNull(); expect(getOfflineScope('a', 'a', 'learner', 'dashboard')).toBeNull();
    mocks.profiles = [Promise.resolve({data: null, error: new TypeError('Failed to fetch')})];
    await act(async () => {await mocks.refresh!();});
    expect(hook.result.current.profile).toBeNull(); expect(getOfflineScope('a', 'a', 'learner', 'dashboard')).toBeNull();
  });
});
