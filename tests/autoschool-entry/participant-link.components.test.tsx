import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { deferred } from './fixtures';

const ports = vi.hoisted(() => ({
  auth: { user: { id: 'qa-user-A' } as { id: string } | null, loading: false, authError: null as string | null, userRole: 'student' },
  rpc: vi.fn(), theme: vi.fn(), model: null as any, mobile: false,
  from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(), authWrite: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ports.auth }));
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'dark', setTheme: ports.theme }) }));
vi.mock('@/hooks/useStudentDashboard', () => ({ useStudentDashboard: () => ports.model }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => ports.mobile }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@/components/course-reviewer/CourseReviewDashboardGate', () => ({
  CourseReviewDashboardGate: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/student/StudentNotifications', () => ({ StudentNotifications: () => null }));
vi.mock('@/components/shared/AnnouncementsBell', () => ({ AnnouncementsBell: () => null }));
vi.mock('@/components/radio/RadioPlayerButton', () => ({ RadioPlayerButton: () => null }));
vi.mock('@/components/account/AccountSettingsLink', () => ({ AccountSettingsMenuItem: () => null }));
vi.mock('@/components/student/RetainedResultsButton', () => ({ RetainedResultsButton: () => null }));
vi.mock('@/components/student/OrgBanner', () => ({ OrgBanner: () => null }));
vi.mock('@/components/student/CourseCatalog', () => ({ CourseCatalog: () => null }));
vi.mock('@/components/student/StudentChatsTab', () => ({ StudentChatsTab: () => null }));
vi.mock('@/components/student/StudentProfileContent', () => ({ StudentProfileContent: () => null }));
vi.mock('@/components/student/VideoIdentification', () => ({ VideoIdentification: () => null }));
vi.mock('@/components/student/StudentConsentForm', () => ({ StudentConsentForm: () => null }));
vi.mock('@/components/student/StudentDocumentsUpload', () => ({ StudentDocumentsUpload: () => null }));
vi.mock('@/components/student/AchievementsPanel', () => ({ AchievementsPanel: () => null }));
vi.mock('@/components/onboarding/OnboardingDialog', () => ({ OnboardingDialog: () => null }));
vi.mock('@/api/courseLibrary', () => ({ fetchCourseLibraryShell: () => { throw new Error('Unexpected course request'); } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: ports.from, channel: ports.channel, removeChannel: ports.removeChannel,
  rpc: (...args: unknown[]) => ({ abortSignal: (_signal: AbortSignal) =>
    Promise.resolve(ports.rpc(...args)).then(data => ({ data, error: null })) }),
  auth: { signOut: ports.authWrite, setSession: ports.authWrite },
} }));
import { StudentHeader } from '@/components/student/StudentHeader';
import StudentDashboard from '@/pages/StudentDashboard';

const member = (role = 'student') => ({ organization_id: 'qa-org-A', name: 'QA School', role });
function model() {
  return {
    user: { id: 'qa-user-A' }, navigate: vi.fn(), theme: 'dark', setTheme: vi.fn(),
    activeTab: 'chat', setActiveTab: vi.fn(), messages: [], inputValue: '', setInputValue: vi.fn(),
    isAiLoading: false, handleSendMessage: vi.fn(), courses: [], catalogCourses: [], categories: [],
    profile: { full_name: 'QA Participant', organization_name: 'QA School', organization_id: 'qa-org-A', org_description: null },
    branding: null,
    dashboardSettings: { showLibrary: true, showAchievements: false, showAiChat: false, showRadio: false, showAnnouncements: false, catalogMode: 'assigned', studentTheme: null },
    loading: false, loadError: null, offlineCopy: false, totalTimeSpent: 0, totalCompletedLessons: 0,
    totalProgress: 0, firstName: 'QA', formatTime: () => '0ч 0м', isPreviewMode: false,
    showVideoIdentification: false, setShowVideoIdentification: vi.fn(), showConsentForm: false, setShowConsentForm: vi.fn(),
    showDocumentsUpload: false, setShowDocumentsUpload: vi.fn(), showAchievements: false, setShowAchievements: vi.fn(),
    mobileMenuOpen: false, setMobileMenuOpen: vi.fn(), documentsProgress: { total: 0, completed: 0, requiredTypes: [] },
    isVideoIdentified: false, showOnboarding: false, handleOnboardingClose: vi.fn(), handleLogout: vi.fn(),
    handleRefresh: vi.fn(), pullToRefreshRef: { current: null }, pullDistance: 0, isRefreshing: false, canRefresh: false,
    orgPlan: 'free', isAdminView: false, adminViewStudentName: '',
  };
}
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}
const headerProps = () => ({
  fullName: 'QA Participant', orgName: 'QA School', onLogout: vi.fn(), setTheme: vi.fn(), pendingCount: 0,
  isVideoIdentified: false, showAchievements: false, onShowVideoId: vi.fn(), onShowConsent: vi.fn(),
  onShowDocs: vi.fn(), onShowAchievements: vi.fn(),
});
function renderHeader(showDrivingSchool?: boolean) {
  return render(<MemoryRouter initialEntries={['/student']}><TooltipProvider>
    <StudentHeader {...headerProps()} showDrivingSchool={showDrivingSchool} /><LocationProbe />
  </TooltipProvider></MemoryRouter>);
}
function renderDashboard() {
  return render(<MemoryRouter initialEntries={['/student']}><TooltipProvider>
    <Routes>
      <Route path="/student" element={<StudentDashboard />} />
      <Route path="/driving-school" element={<p>Existing school chooser</p>} />
    </Routes><LocationProbe />
  </TooltipProvider></MemoryRouter>);
}
async function openProfile() {
  fireEvent.keyDown(screen.getByRole('button', { name: /QA Participant/ }), { key: 'Enter', code: 'Enter' });
  return screen.findByRole('menu');
}
beforeEach(() => {
  localStorage.clear();
  ports.auth = { user: { id: 'qa-user-A' }, loading: false, authError: null, userRole: 'student' };
  ports.model = model(); ports.mobile = false;
  ports.rpc.mockReset().mockImplementation(() => { throw new Error('Unexpected participant lookup'); });
  ports.theme.mockReset();
  ports.authWrite.mockReset().mockImplementation(() => { throw new Error('Unexpected auth write'); });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const query: any = {};
  for (const method of ['select', 'eq', 'in', 'is']) query[method] = vi.fn(() => query);
  query.then = (ok: any, fail: any) => Promise.resolve({ data: null, count: 0, error: null }).then(ok, fail);
  for (const method of ['insert', 'update', 'delete']) query[method] = () => { throw new Error('Unexpected database write'); };
  ports.from.mockReset().mockReturnValue(query);
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
  ports.channel.mockReset().mockReturnValue(channel);
  ports.removeChannel.mockReset().mockResolvedValue(undefined);
});

describe('ordinary dashboard shared participant navigation', () => {
  it('ASPC01 the shared header default keeps all ordinary profile options without an unconfirmed driving entry', async () => {
    renderHeader();
    await openProfile();
    expect(screen.getByRole('menuitem', { name: 'Мой профиль' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Помощь' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Выйти' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Автошкола' })).toBeNull();
    expect(ports.rpc).not.toHaveBeenCalled();
  });

  it('ASPC02 the existing shared desktop profile menu navigates an eligible entry to the unchanged chooser route', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    renderHeader(true);
    await openProfile();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Автошкола' }));
    expect(screen.getByTestId('location').textContent).toBe('/driving-school');
    expect(ports.auth.userRole).toBe('student');
    expect(ports.authWrite).not.toHaveBeenCalled();
    expect(ports.rpc).not.toHaveBeenCalled();
  });

  it('ASPC03 the same shared mobile profile menu exposes the eligible chooser entry without replacing bottom navigation', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    renderHeader(true);
    await openProfile();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Автошкола' }));
    expect(screen.getByTestId('location').textContent).toBe('/driving-school');
    expect(ports.authWrite).not.toHaveBeenCalled();
  });

  it('ASPC04 the Sigma logo remains a theme toggle and never opens or navigates the driving entry', () => {
    const view = renderHeader(true);
    const logoButton = view.container.querySelector('header button');
    if (!logoButton) throw new Error('Existing theme button missing');
    fireEvent.click(logoButton);
    expect(ports.theme).toHaveBeenCalledExactlyOnceWith('light');
    expect(screen.getByTestId('location').textContent).toBe('/student');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(ports.rpc).not.toHaveBeenCalled();
  });

  it('ASPC05 the actual self dashboard wires a confirmed student lookup into the real shared header and chooser navigation', async () => {
    ports.rpc.mockResolvedValueOnce([member('student')]);
    renderDashboard();
    await waitFor(() => expect(ports.rpc).toHaveBeenCalledExactlyOnceWith('driving_my_schools'));
    await act(async () => { await Promise.resolve(); });
    await openProfile();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Автошкола' }));
    expect(await screen.findByText('Existing school chooser')).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/driving-school');
    expect(ports.authWrite).not.toHaveBeenCalled();
  });

  it('ASPC06 the actual mobile self dashboard accepts instructor membership while preserving its courses-chat-profile navigation', async () => {
    ports.mobile = true;
    ports.rpc.mockResolvedValueOnce([member('instructor')]);
    const view = renderDashboard();
    await waitFor(() => expect(ports.rpc).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    const mobileNav = view.container.querySelector('div.md\\:hidden.fixed.bottom-0 nav');
    if (!mobileNav) throw new Error('Existing mobile bottom navigation missing');
    expect(Array.from(mobileNav.querySelectorAll('button')).map(x => x.textContent)).toEqual(['Курсы', 'Чат', 'Профиль']);
    await openProfile();
    expect(screen.getByRole('menuitem', { name: 'Автошкола' })).toBeTruthy();
    expect(ports.auth.userRole).toBe('student');
    expect(ports.authWrite).not.toHaveBeenCalled();
  });

  it('ASPC07 the actual dashboard never queries membership for preview, admin observer, demo, offline, missing scope or mismatched Auth', async () => {
    const cases: Array<(value: any) => void> = [
      value => { value.isPreviewMode = true; },
      value => { value.isAdminView = true; localStorage.setItem('adminViewAsStudent', JSON.stringify({ userId: 'observed-learner' })); },
      () => { localStorage.setItem('adminViewAsStudent', JSON.stringify({ userId: 'observed-learner' })); },
      () => { localStorage.setItem('demoStudentReturn', JSON.stringify({ returnPath: '/organization' })); },
      value => { value.loadError = 'unavailable'; value.offlineCopy = true; },
      value => { value.profile.organization_id = null; },
      value => { value.user = { id: 'stale-other-user' }; },
      () => { ports.auth.user = null; },
      () => { ports.auth.loading = true; },
      () => { ports.auth.authError = 'SESSION_UNAVAILABLE'; },
    ];
    for (const change of cases) {
      localStorage.clear();
      ports.auth = { user: { id: 'qa-user-A' }, loading: false, authError: null, userRole: 'student' };
      ports.model = model(); change(ports.model);
      let view!: ReturnType<typeof renderDashboard>;
      await act(async () => { view = renderDashboard(); await Promise.resolve(); });
      await openProfile();
      expect(screen.queryByRole('menuitem', { name: 'Автошкола' })).toBeNull();
      expect(ports.rpc).not.toHaveBeenCalled();
      view.unmount();
    }
    expect(ports.authWrite).not.toHaveBeenCalled();
  });

  it('ASPC08 the real dashboard keeps the entry absent while pending and closes a formerly confirmed menu item after a fresh failed lookup', async () => {
    const initial = deferred<unknown>(), refreshed = deferred<unknown>();
    ports.rpc.mockReturnValueOnce(initial.promise).mockReturnValueOnce(refreshed.promise);
    renderDashboard();
    expect(screen.getAllByRole('button', { name: 'Курсы' }).length).toBeGreaterThan(0);
    expect(screen.getByTestId('location').textContent).toBe('/student');
    await openProfile();
    expect(screen.queryByRole('menuitem', { name: 'Автошкола' })).toBeNull();
    await act(async () => initial.resolve([member()]));
    expect(await screen.findByRole('menuitem', { name: 'Автошкола' })).toBeTruthy();
    act(() => window.dispatchEvent(new Event('focus')));
    expect(screen.queryByRole('menuitem', { name: 'Автошкола' })).toBeNull();
    await act(async () => refreshed.reject(new Error('Permission revoked')));
    expect(screen.queryByRole('menuitem', { name: 'Автошкола' })).toBeNull();
    expect(ports.authWrite).not.toHaveBeenCalled();
  });
});
