import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudentDashboard } from '../useStudentDashboard';
import { setOfflineAuthActor, getOfflineScope } from '@/utils/courseCache';
import { offlineMemoryStorage } from '@/test/offlineMemoryStorage';
const mocks = vi.hoisted(() => ({ user: { id: 'a' } as {id: string} | null, from: vi.fn(), rpc: vi.fn(), invoke: vi.fn(),
  profiles: [] as Promise<any>[], enrollments: [] as any[], catalog: [] as any[], enrollmentFilter: vi.fn(), libraryShell: vi.fn(), achievements: [] as any[], identityDocs: [] as any[], liveSnapshot: false, refresh: null as null | (() => Promise<void>),
  snapshotResponse: null as any, catalogError:null as any, signals:[] as AbortSignal[], toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/useAuth', () => ({useAuth: () => ({user: mocks.user, loading: false, signOut: vi.fn()})}));
vi.mock('@/hooks/use-mobile', () => ({useIsMobile: () => false}));
vi.mock('next-themes', () => ({useTheme: () => ({theme: 'light', setTheme: vi.fn()})}));
vi.mock('@/hooks/usePullToRefresh', () => ({usePullToRefresh: ({onRefresh}: any) => {mocks.refresh = onRefresh; return {ref: {current: null}, pullDistance: 0, isRefreshing: false, canRefresh: false};}}));
vi.mock('@/hooks/useStudentDashboardSnapshot', async original => {
  const actual = await original<typeof import('../useStudentDashboardSnapshot')>();
  return {useStudentDashboardSnapshot: (...args: Parameters<typeof actual.useStudentDashboardSnapshot>) => mocks.liveSnapshot ? actual.useStudentDashboardSnapshot(...args) : {data: undefined}};
});
vi.mock('@/api/courseLibrary', () => ({fetchCourseLibraryShell: mocks.libraryShell}));
vi.mock('@/utils/safeInvoke', () => ({safeInvoke: mocks.invoke}));
vi.mock('@/integrations/supabase/client', () => ({supabase: {from: mocks.from, rpc: mocks.rpc}}));
vi.mock('sonner', () => ({toast: mocks.toast}));
const profile = (name: string) => ({data: {full_name: name, organization_id: 'org', organizations: {name: 'Organization', branding: {logoUrl: name}}}, error: null});
const pending = () => {let resolve!: (value: any) => void; const promise = new Promise<any>(done => {resolve = done;}); return {promise, resolve};};
class Query {
  private mutation = false;
  constructor(private table: string) {}
  abortSignal(signal:AbortSignal){mocks.signals.push(signal);return this;}
  select() {return this;} or(filter: string) {if (this.table === 'enrollments') mocks.enrollmentFilter(filter); return this;} eq() {return this;} order() {return this;} limit() {return this;} in() {return this;}
  update() {this.mutation = true; return this;}
  response(): Promise<any> {
    if (this.mutation) return Promise.resolve({data: null, error: null});
    if (this.table === 'profiles') return mocks.profiles.shift() || Promise.resolve(profile(mocks.user?.id || 'none'));
    if (this.table === 'enrollments') return Promise.resolve({data: mocks.enrollments, error: null});
    if (this.table === 'courses') return Promise.resolve({data: mocks.catalogError?null:mocks.catalog, error: mocks.catalogError});
    return Promise.resolve({data: this.table === 'labor_safety_profiles' || this.table === 'video_identifications' ? null : this.table === 'user_achievements' ? mocks.achievements : this.table === 'student_identity_documents' ? mocks.identityDocs : [], error: null});
  }
  maybeSingle() {return this.response();} single() {return this.response();} then(resolve: any, reject: any) {return this.response().then(resolve, reject);}
}
let client: QueryClient;
const wrapper = ({children}: {children: ReactNode}) => createElement(QueryClientProvider, {client}, createElement(MemoryRouter, {initialEntries: ['/student']}, children));
beforeEach(() => {vi.clearAllMocks(); localStorage.clear(); setOfflineAuthActor(null); setOfflineAuthActor('a'); mocks.user = {id: 'a'}; mocks.profiles = []; mocks.achievements = [];
  mocks.liveSnapshot = false; mocks.refresh = null; mocks.catalogError=null; mocks.signals=[]; mocks.enrollments = []; mocks.catalog = []; mocks.libraryShell.mockResolvedValue(null); mocks.snapshotResponse = {data: {profile: {user_id: 'a', full_name: 'a', organization_id: 'org'}, enrollments: []}, error: null};
  client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}});
  mocks.identityDocs = []; mocks.from.mockImplementation(table => new Query(table));
  mocks.rpc.mockImplementation(async (name: string) => name === 'get_student_dashboard_snapshot' ? mocks.snapshotResponse : {data: null, error: null});
  vi.stubGlobal('indexedDB', offlineMemoryStorage().factory);});
afterEach(() => {cleanup(); client.clear(); setOfflineAuthActor(null); vi.useRealTimers(); vi.unstubAllGlobals();});
describe('dashboard unavailable is distinct from empty',()=>{
 it('failed course read is explicit and an ordinary retry can return a genuinely empty catalog',async()=>{mocks.catalogError={status:503,message:'unavailable'};const h=renderHook(useStudentDashboard,{wrapper});await waitFor(()=>expect(h.result.current.loading).toBe(false));expect(h.result.current.loadError).toBe('unavailable');expect(h.result.current.catalogCourses).toEqual([]);expect(mocks.toast.success).not.toHaveBeenCalledWith('Данные обновлены');mocks.catalogError=null;await act(async()=>{await h.result.current.handleRefresh();});expect(h.result.current.loadError).toBeNull();expect(h.result.current.catalogCourses).toEqual([]);expect(mocks.toast.success).toHaveBeenCalledWith('Данные обновлены');});
 it('retrying another failed request never claims a successful refresh',async()=>{mocks.profiles=[Promise.resolve({data:null,error:{status:403}})];const h=renderHook(useStudentDashboard,{wrapper});await waitFor(()=>expect(h.result.current.loading).toBe(false));expect(h.result.current.loadError).toBe('unavailable');mocks.profiles=[Promise.resolve({data:null,error:{status:403}})];await act(async()=>{await h.result.current.handleRefresh();});expect(h.result.current.loadError).toBe('unavailable');expect(mocks.toast.success).not.toHaveBeenCalledWith('Данные обновлены');});
 it('a hung profile becomes a retryable error after15s, aborts requests and cannot later replace fresh data',async()=>{vi.useFakeTimers();const old=pending();mocks.profiles=[old.promise];const h=renderHook(useStudentDashboard,{wrapper});await act(async()=>{await vi.advanceTimersByTimeAsync(15001);});expect(h.result.current.loading).toBe(false);expect(h.result.current.loadError).toBe('unavailable');expect(mocks.signals.length).toBeGreaterThanOrEqual(3);expect(mocks.signals.every(s=>s.aborted)).toBe(true);await act(async()=>{await h.result.current.handleRefresh();});expect(h.result.current.profile?.full_name).toBe('a');expect(h.result.current.loadError).toBeNull();await act(async()=>{old.resolve(profile('stale profile'));});expect(h.result.current.profile?.full_name).toBe('a');});
 it('the old actor deadline cannot clear the new actor data or publish its error',async()=>{vi.useFakeTimers();const old=pending();mocks.profiles=[old.promise];const h=renderHook(useStudentDashboard,{wrapper});await act(async()=>{await vi.advanceTimersByTimeAsync(1);});const oldSignals=[...mocks.signals];act(()=>{setOfflineAuthActor('b');mocks.user={id:'b'};h.rerender();});await act(async()=>{await vi.advanceTimersByTimeAsync(16000);});expect(h.result.current.profile?.full_name).toBe('b');expect(h.result.current.loadError).toBeNull();expect(oldSignals.every(s=>s.aborted)).toBe(true);await act(async()=>{old.resolve(profile('PRIVATE A'));});expect(h.result.current.profile?.full_name).toBe('b');});
 it('a confirmed snapshot denial stays explicit and retry rechecks that original public snapshot',async()=>{mocks.liveSnapshot=true;const h=renderHook(useStudentDashboard,{wrapper});await waitFor(()=>expect(h.result.current.profile?.full_name).toBe('a'));mocks.snapshotResponse={data:null,error:{status:403}};await act(async()=>{await client.refetchQueries({queryKey:['student-dashboard-snapshot'],type:'active'});});await waitFor(()=>expect(h.result.current.loadError).toBe('unavailable'));mocks.snapshotResponse={data:{profile:{user_id:'a',full_name:'a',organization_id:'org'},enrollments:[]},error:null};await act(async()=>{await h.result.current.handleRefresh();});await waitFor(()=>expect(h.result.current.loadError).toBeNull());expect(h.result.current.profile?.full_name).toBe('a');expect(mocks.rpc.mock.calls.filter(c=>c[0]==='get_student_dashboard_snapshot')).toHaveLength(3);});
});
