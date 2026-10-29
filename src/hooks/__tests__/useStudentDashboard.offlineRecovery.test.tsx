import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentDashboard from '@/pages/StudentDashboard';
import { setOfflineAuthActor, getOfflineScope, forgetOfflineScope, observeOfflineAccess } from '@/utils/courseCache';
import { offlineMemoryStorage } from '@/test/offlineMemoryStorage';
const mocks = vi.hoisted(() => ({ user: { id: 'a' } as {id: string} | null, from: vi.fn(), rpc: vi.fn(), invoke: vi.fn(),
  profiles: [] as Promise<any>[], enrollments: [] as any[], catalog: [] as any[], enrollmentFilter: vi.fn(), libraryShell: vi.fn(), achievements: [] as any[], identityDocs: [] as any[], liveSnapshot: false, refresh: null as null | (() => Promise<void>),
  snapshotResponse: null as any, catalogError:null as any, profileError:null as any, snapshotDenied:false, latest:null as any, signals:[] as AbortSignal[], toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/useStudentDashboard', async original => {
  const actual = await original<typeof import('../useStudentDashboard')>();
  return {useStudentDashboard: () => {const result = actual.useStudentDashboard(); mocks.latest = result; return result;}};
});
vi.mock('@/hooks/useAuth', () => ({useAuth: () => ({user: mocks.user, loading: false, userRole:'student', signOut: vi.fn()})}));
vi.mock('@/hooks/use-mobile', () => ({useIsMobile: () => false}));
vi.mock('next-themes', () => ({useTheme: () => ({theme: 'light', setTheme: vi.fn()})}));
vi.mock('@/hooks/usePullToRefresh', () => ({usePullToRefresh: ({onRefresh}: any) => {mocks.refresh = onRefresh; return {ref: {current: null}, pullDistance: 0, isRefreshing: false, canRefresh: false};}}));
vi.mock('@/hooks/useStudentDashboardSnapshot', async original => {
  const actual = await original<typeof import('../useStudentDashboardSnapshot')>();
  return {useStudentDashboardSnapshot: (...args: Parameters<typeof actual.useStudentDashboardSnapshot>) => mocks.liveSnapshot ? actual.useStudentDashboardSnapshot(...args) : {data: undefined,accessDenied:mocks.snapshotDenied}};
});
vi.mock('@/api/courseLibrary', () => ({fetchCourseLibraryShell: mocks.libraryShell}));
vi.mock('@/utils/safeInvoke', () => ({safeInvoke: mocks.invoke}));
vi.mock('@/integrations/supabase/client', () => ({supabase: {from: mocks.from, rpc: mocks.rpc, channel:() => ({on(){return this;},subscribe(){return this;}}),removeChannel:vi.fn()}}));
vi.mock('sonner', () => ({toast: mocks.toast}));
const profile = (name: string) => ({data: {full_name: name, organization_id: 'org', organizations: {name: 'Organization', branding: {logoUrl: name}}}, error: null});
const pending = () => {let resolve!: (value: any) => void; const promise = new Promise<any>(done => {resolve = done;}); return {promise, resolve};};
class Query {
  private mutation = false;
  private columns = '';
  is(){return this;}
  constructor(private table: string) {}
  abortSignal(signal:AbortSignal){mocks.signals.push(signal);return this;}
  select(columns:string) {this.columns=columns;return this;} or(filter: string) {if (this.table === 'enrollments') mocks.enrollmentFilter(filter); return this;} eq() {return this;} order() {return this;} limit() {return this;} in() {return this;}
  update() {this.mutation = true; return this;}
  response(): Promise<any> {
    if (this.mutation) return Promise.resolve({data: null, error: null});
    if (this.table === 'profiles') return this.columns === 'organization_id' ? Promise.resolve({data:{organization_id:'org'},error:null}) : mocks.profiles.shift() || Promise.resolve(mocks.profileError ? {data:null,error:mocks.profileError} : profile(mocks.user?.id || 'none'));
    if (this.table === 'enrollments') return Promise.resolve({data: mocks.enrollments, error: null});
    if (this.table === 'courses') return Promise.resolve({data: mocks.catalogError?null:mocks.catalog, error: mocks.catalogError});
    return Promise.resolve({data: this.table === 'labor_safety_profiles' || this.table === 'video_identifications' ? null : this.table === 'user_achievements' ? mocks.achievements : this.table === 'student_identity_documents' ? mocks.identityDocs : [], error: null});
  }
  maybeSingle() {return this.response();} single() {return this.response();} then(resolve: any, reject: any) {return this.response().then(resolve, reject);}
}
let client: QueryClient;
let storage: ReturnType<typeof offlineMemoryStorage>;
const wrapper = ({children}: {children: ReactNode}) => createElement(QueryClientProvider, {client}, createElement(MemoryRouter, {initialEntries: ['/student']}, children));
beforeEach(() => {vi.clearAllMocks(); localStorage.clear(); setOfflineAuthActor(null); setOfflineAuthActor('a'); mocks.user = {id: 'a'}; mocks.profiles = []; mocks.achievements = [];
  mocks.liveSnapshot = false; mocks.refresh = null; mocks.catalogError=null; mocks.profileError=null; mocks.snapshotDenied=false; mocks.latest=null; mocks.signals=[]; mocks.enrollments = []; mocks.catalog = []; mocks.libraryShell.mockResolvedValue(null); mocks.snapshotResponse = {data: {profile: {user_id: 'a', full_name: 'a', organization_id: 'org'}, enrollments: []}, error: null};
  client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}});
  mocks.identityDocs = []; mocks.from.mockImplementation(table => new Query(table));
  mocks.rpc.mockImplementation(async (name: string) => name === 'get_student_dashboard_snapshot' ? mocks.snapshotResponse : {data: null, error: null});
  storage=offlineMemoryStorage(); vi.stubGlobal('indexedDB', storage.factory);});
afterEach(() => {cleanup(); client.clear(); setOfflineAuthActor(null); vi.useRealTimers(); vi.unstubAllGlobals();});

vi.mock('@/components/course-reviewer/CourseReviewDashboardGate',()=>({CourseReviewDashboardGate:({children}:{children:ReactNode})=>children}));
vi.mock('@/components/student/CourseCatalog',()=>({CourseCatalog:({enrolledCourses,courses}:{enrolledCourses:{id:string;title:string}[];courses:unknown[]})=><div data-testid="course-list">{enrolledCourses.map(c=><div key={c.id}>{c.title}</div>)}<span data-testid="catalog-count">{courses.length}</span></div>}));
vi.mock('@/components/student/RetainedResultsButton',()=>({RetainedResultsButton:()=>null}));
vi.mock('@/components/student/StudentSidebar',()=>({StudentSidebar:()=>null}));
vi.mock('@/components/student/StudentHeader',()=>({StudentHeader:()=>null}));
vi.mock('@/components/student/StudentFooter',()=>({StudentFooter:()=>null}));
vi.mock('@/components/student/OrgBanner',()=>({OrgBanner:()=>null}));
vi.mock('@/components/student/StudentChatsTab',()=>({StudentChatsTab:()=>null}));
vi.mock('@/components/student/StudentProfileContent',()=>({StudentProfileContent:()=>null}));
vi.mock('@/components/onboarding/OnboardingDialog',()=>({OnboardingDialog:()=>null}));
vi.mock('@/components/student/VideoIdentification',()=>({VideoIdentification:()=>null}));
vi.mock('@/components/student/StudentConsentForm',()=>({StudentConsentForm:()=>null}));
vi.mock('@/components/student/StudentDocumentsUpload',()=>({StudentDocumentsUpload:()=>null}));
vi.mock('@/components/student/AchievementsPanel',()=>({AchievementsPanel:()=>null}));
const cacheRows=()=>storage.rows('sigma-course-cache','dashboard_scoped_v2');
const onlinePage=async()=>{
  const course={id:'known-course',title:'ONLINE PRIVATE A',is_published:true};
  mocks.enrollments=[{id:'enrollment',course_id:course.id,status:'active',courses:course,time_spent:60,learning_progress_epoch:0,learning_progress_reset_at:null}];
  mocks.catalog=[course,{id:'public-catalog',title:'Public offer',is_published:true}];
  const view=render(<StudentDashboard/>,{wrapper});
  await waitFor(()=>expect(screen.getByText('ONLINE PRIVATE A')).toBeInTheDocument());
  await waitFor(()=>expect(cacheRows().size).toBe(1));
  const saved=[...cacheRows().values()][0]; saved.courses[0].title='SAVED PRIVATE A';
  return view;
};
const failNetwork=async()=>{
  mocks.profileError=new TypeError('Failed to fetch');
  await act(async()=>{await mocks.latest.handleRefresh();});
};
const expectClosed=()=>{
  expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить курсы');
  expect(screen.queryByTestId('course-list')).not.toBeInTheDocument();
  expect(screen.queryByText('SAVED PRIVATE A')).not.toBeInTheDocument();
  expect(mocks.latest.offlineCopy).toBe(false);
  expect(mocks.latest.courses).toEqual([]);
};
describe('validated offline dashboard presentation',()=>{
  it('renders the actual stored copy with warning while unavailable; retry shows fresh online data without claiming offline refresh success',async()=>{
    await onlinePage(); [...cacheRows().values()][0].dashboardSettings=undefined; await failNetwork();
    expect(screen.getByText('SAVED PRIVATE A')).toBeInTheDocument();
    expect(screen.queryByText('ONLINE PRIVATE A')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Данные могут быть устаревшими');
    expect(screen.getByTestId('catalog-count')).toHaveTextContent('0');
    expect(mocks.latest.offlineCopy).toBe(true); expect(mocks.latest.loadError).toBe('unavailable');
    expect(mocks.latest.dashboardSettings).toEqual({showLibrary:true,showAchievements:true,showAiChat:true,showRadio:false,showAnnouncements:false,catalogMode:'catalog',studentTheme:null});
    expect(mocks.toast.success).not.toHaveBeenCalledWith('Данные обновлены');
    mocks.profileError=null; mocks.enrollments[0].courses.title='FRESH ONLINE';
    fireEvent.click(screen.getByRole('button',{name:'Повторить загрузку'}));
    await waitFor(()=>expect(screen.getByText('FRESH ONLINE')).toBeInTheDocument());
    expect(screen.queryByText('Показана сохранённая копия кабинета')).not.toBeInTheDocument();
    expect(mocks.latest.offlineCopy).toBe(false); expect(mocks.latest.loadError).toBeNull();
    expect(mocks.toast.success).toHaveBeenCalledWith('Данные обновлены');
  });
  it('a403 invalidates even an eligible cache and keeps the full error without private courses',async()=>{
    await onlinePage(); mocks.profileError={status:403,message:'forbidden'};
    await act(async()=>{await mocks.latest.handleRefresh();}); expectClosed();
    expect(getOfflineScope('a','a','learner','dashboard')).toBeNull();
  });
  it.each(['expired','missing','unvalidated'] as const)('%s cache never replaces an unavailable result with private data',async kind=>{
    await onlinePage();
    if(kind==='expired') [...cacheRows().values()][0].cachedAt=Date.now()-7*24*60*60*1000-1;
    if(kind==='missing') cacheRows().clear();
    if(kind==='unvalidated') forgetOfflineScope('a','a','learner','dashboard');
    await failNetwork(); expectClosed();
  });
  it('starting another retry hides the old offline state and an older cache read cannot override a successful later request',async()=>{
    await onlinePage(); await failNetwork(); expect(mocks.latest.offlineCopy).toBe(true);
    const held=pending(); let reading=false; storage.holdReads(()=>{reading=true;return held.promise;});
    let old!:Promise<void>; act(()=>{old=mocks.latest.handleRefresh();});
    await waitFor(()=>expect(reading).toBe(true)); expect(mocks.latest.offlineCopy).toBe(false);
    expect(screen.queryByText('SAVED PRIVATE A')).not.toBeInTheDocument();
    mocks.profileError=null; mocks.enrollments=[]; storage.holdReads(null);
    await act(async()=>{await mocks.latest.handleRefresh();});
    expect(mocks.latest.loadError).toBeNull(); expect(mocks.latest.offlineCopy).toBe(false);
    await act(async()=>{held.resolve(undefined);await old;});
    expect(mocks.latest.courses).toEqual([]);expect(mocks.latest.offlineCopy).toBe(false);
    expect(screen.queryByText('SAVED PRIVATE A')).not.toBeInTheDocument();
  });
  it('actor change during an IndexedDB read cannot publish the previous actor copy',async()=>{
    const view=await onlinePage(); const held=pending(); let reading=false; storage.holdReads(()=>{reading=true;return held.promise;});
    mocks.profileError=new TypeError('Failed to fetch');let old!:Promise<void>;
    act(()=>{old=mocks.latest.handleRefresh();});
    await waitFor(()=>expect(reading).toBe(true)); expect(mocks.latest.loading).toBe(true);
    act(()=>{setOfflineAuthActor('b');mocks.user={id:'b'};view.rerender(<StudentDashboard/>);});
    await waitFor(()=>expect(screen.getByRole('alert')).toBeInTheDocument());
    await act(async()=>{held.resolve(undefined);await old;});expectClosed();
  });
  it('same actor access revision change invalidates the saved-copy flag and its remembered scope',async()=>{
    const view=await onlinePage();await failNetwork();expect(mocks.latest.offlineCopy).toBe(true);
    act(()=>{observeOfflineAccess('a','new-rights');view.rerender(<StudentDashboard/>);});
    await waitFor(()=>expect(screen.getByRole('alert')).toBeInTheDocument());expectClosed();
  });
  it('a confirmed snapshot denial closes an already displayed cache without restoring it from memory',async()=>{
    const view=await onlinePage();await failNetwork();expect(mocks.latest.offlineCopy).toBe(true);
    act(()=>{mocks.snapshotDenied=true;view.rerender(<StudentDashboard/>);});
    await waitFor(()=>expect(screen.getByRole('alert')).toBeInTheDocument());expectClosed();
    expect(getOfflineScope('a','a','learner','dashboard')).toBeNull();
  });
});
