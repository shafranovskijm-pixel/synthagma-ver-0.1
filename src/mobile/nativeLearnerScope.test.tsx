import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { nativeInlineVideoAllowed, nativeLearnerRoute, nativeWebDestination, SINTAGMA_WEB_ORIGIN } from './nativeLearnerScope';
import { NativeLearnerScope } from './NativeLearnerScopeGate';
import { BlockRenderer } from '@/components/course-builder/block-editor/BlockRenderer';
import { VideoPlayerInline } from '@/components/course-learning/VideoPlayerInline';
import { VideoPreviewInline } from '@/components/course-builder/VideoPreviewInline';

const mocks = vi.hoisted(() => ({ native: true, role: 'student' as string | null, loading: false, signedIn: true, signOut: vi.fn(), mounted: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => mocks.native } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.signedIn ? { id: 'learner-a' } : null, userRole: mocks.role, loading: mocks.loading, signOut: mocks.signOut }) }));
vi.mock('@/components/course-builder/block-editor/FormulaRender', () => ({ FormulaRender: () => null }));
vi.mock('@/components/course-builder/LazyMediaPreview', () => ({ LazyMediaPreview: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/video/CourseVideoPlayer', () => ({ CourseVideoPlayer: ({ src }: { src: string }) => <video data-testid="course-video" src={src} /> }));
vi.mock('@/components/video/HlsVideoPlayer', () => ({ HlsVideoPlayer: ({ src }: { src: string }) => <video data-testid="hls-video" src={src} /> }));
vi.mock('@/utils/proxyFetch', () => ({ proxiedAssetUrl: (url: string) => url }));

afterEach(cleanup);
beforeEach(() => { mocks.native = true; mocks.role = 'student'; mocks.loading = false; mocks.signedIn = true; mocks.signOut.mockReset().mockResolvedValue(undefined); mocks.mounted.mockReset(); });

const decision = (pathname: string, search = '', role: string | null = 'student') => nativeLearnerRoute({ pathname, search }, role);

describe('first native learner release route scope', () => {
  it.each(['/student', '/student/profile', '/course/course-a/learn', '/learning/course-a', '/account', '/account/deletion-status', '/account/deletion-complete', '/documents/personal-data-policy', '/privacy', '/terms', '/login/client-a', '/reset-password'])('preserves %s', path => {
    expect(decision(path)).toEqual({ allowed: true });
  });

  it.each(['/admin?tab=chats', '/organization?tab=chats', '/company', '/w/public-token', '/webinar/room-a/live', '/webinar/ai-tutor/live', '/review/course/a', '/course/a/edit'])('does not mount an excluded deep link %s', target => {
    const [pathname, search] = target.split('?');
    expect(decision(pathname, search ? `?${search}` : '')).toMatchObject({ allowed: false });
  });

  it('gives a safe explicit continuation for every repeated chat tab parameter', () => {
    for (const search of ['?tab=chat', '?tab=catalog&tab=chat', '?tab=chat&tab=profile', '?tab=%63hat&section=documents']) {
      const result = decision('/student', search);
      expect(result).toMatchObject({ allowed: false, destination: '/student' });
      if (result.allowed === false) expect(decision('/student', new URL(result.destination, 'https://app.invalid').search)).toEqual({ allowed: true });
    }
  });

  it('normalizes legacy profile links and rejects repeated excluded profile sections', () => {
    expect(decision('/student/profile', '?section=partner')).toMatchObject({ allowed: false, destination: '/student?tab=profile' });
    expect(decision('/student', '?tab=profile&section=documents&section=help')).toMatchObject({ allowed: false, destination: '/student?tab=profile' });
    expect(decision('/student', '?tab=profile&section=documents')).toEqual({ allowed: true });
  });

  it('does not turn a staff account into a learner; own account settings stay available', () => {
    expect(decision('/student', '', 'admin')).toMatchObject({ allowed: false, destination: '/account' });
    expect(decision('/course/a/learn', '', 'organization')).toMatchObject({ allowed: false, destination: '/account' });
    expect(decision('/account', '', 'admin')).toEqual({ allowed: true });
  });
});

function MountProbe() { useEffect(() => { mocks.mounted(); }, []); return <p>Mounted learning page</p>; }
const guarded = (entry: string) => render(<MemoryRouter initialEntries={[entry]}><NativeLearnerScope><Routes><Route path="*" element={<MountProbe />} /></Routes></NativeLearnerScope></MemoryRouter>);

describe('scope is enforced before page mounting', () => {
  it('does not mount the chat, and continues to normalized courses only after a click', () => {
    guarded('/student?tab=catalog&tab=chat');
    expect(mocks.mounted).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Чаты доступны в веб-версии');
    fireEvent.click(screen.getByRole('link', { name: 'Продолжить в приложении' }));
    expect(mocks.mounted).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Первый выпуск приложения')).toBeInTheDocument();
  });

  it('rejects a login next redirect to a staff route before its page can mount', () => {
    render(<MemoryRouter initialEntries={['/login?next=%2Fadmin']}><NativeLearnerScope><Routes><Route path="/login" element={<Navigate to="/admin?tab=chats" replace />} /><Route path="/admin" element={<MountProbe />} /></Routes></NativeLearnerScope></MemoryRouter>);
    expect(mocks.mounted).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Открыть веб-версию' })).toHaveAttribute('href', `${SINTAGMA_WEB_ORIGIN}/admin?tab=chats`);
  });

  it('waits for the real role and never mounts a learner page while it is unknown', () => {
    mocks.role = null;
    guarded('/course/a/learn');
    expect(mocks.mounted).not.toHaveBeenCalled();
    expect(screen.getByText('Загружаем кабинет ученика…')).toBeInTheDocument();
  });

  it('leaves web navigation and components untouched', () => {
    mocks.native = false;
    guarded('/admin?tab=chats');
    expect(mocks.mounted).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Первый выпуск приложения')).not.toBeInTheDocument();
  });
});

describe('native material fallback', () => {
  it('does not mount a universal embed, and opens the same public lesson without credentials', () => {
    const { container } = render(<MemoryRouter initialEntries={['/course/a/learn?access_token=secret&sessionId=private&view=library']}><BlockRenderer blocks={[{ id: 'embed-a', type: 'embed', content: '', embedUrl: 'https://codepen.io/author/pen/example' }]} /></MemoryRouter>);
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByText(/внешний браузер/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть курс на сайте' })).toHaveAttribute('href', `${SINTAGMA_WEB_ORIGIN}/course/a/learn?view=library`);
    expect(screen.getByRole('link', { name: 'Открыть курс на сайте' })).toHaveAttribute('target', '_self');
    expect(screen.getByText(/выберите нужный урок/)).toBeInTheDocument();
  });

  it.each([VideoPlayerInline, VideoPreviewInline])('does not treat arbitrary raw iframes or URLs as native video players', Component => {
    const { container, rerender } = render(<MemoryRouter initialEntries={['/course/a/learn']}><Component content={'<iframe src="https://xn--80aaiswd0ak.xn--p1ai/w/token"></iframe><iframe src="https://foreign.invalid/"></iframe>'} /></MemoryRouter>);
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('link', { name: 'Открыть курс на сайте' })).toBeInTheDocument();
    rerender(<MemoryRouter initialEntries={['/course/a/learn']}><Component content="https://xn--80aaiswd0ak.xn--p1ai/w/token" /></MemoryRouter>);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('preserves ordinary native video files and recognized video players', () => {
    const { container, rerender } = render(<MemoryRouter><VideoPlayerInline content="https://files.invalid/lesson.mp4" /></MemoryRouter>);
    expect(screen.getByTestId('course-video')).toHaveAttribute('src', 'https://files.invalid/lesson.mp4');
    rerender(<MemoryRouter><VideoPlayerInline content="https://youtu.be/abc123" /></MemoryRouter>);
    expect(container.querySelector('iframe')).toHaveAttribute('src', 'https://www.youtube.com/embed/abc123');
  });

  it('preserves the same embed in the web version', () => {
    mocks.native = false;
    const { container } = render(<MemoryRouter><BlockRenderer blocks={[{ id: 'embed-a', type: 'embed', content: '', embedUrl: 'https://codepen.io/author/pen/example' }]} /></MemoryRouter>);
    expect(container.querySelector('iframe')).toHaveAttribute('src', 'https://codepen.io/author/pen/example');
  });

  it('does not pass session parameters, hashes, origins or unsafe paths to the external website', () => {
    expect(nativeWebDestination({ pathname: '/student', search: '?tab=chat&access_token=private&next=%2Fadmin&sessionId=private' })).toBe(`${SINTAGMA_WEB_ORIGIN}/student?tab=chat`);
    expect(nativeWebDestination({ pathname: '//other.invalid/', search: '' })).toBe(`${SINTAGMA_WEB_ORIGIN}/student`);
    expect(nativeWebDestination({ pathname: '/%5c%5cother.invalid/', search: '' })).toBe(`${SINTAGMA_WEB_ORIGIN}/student`);
    expect(nativeInlineVideoAllowed('https://www.youtube.com.evil.invalid/embed/id')).toBe(false);
    expect(nativeInlineVideoAllowed('https://www.youtube.com/watch?v=id')).toBe(false);
    expect(nativeInlineVideoAllowed('https://xn--80aaiswd0ak.xn--p1ai/w/token')).toBe(false);
    expect(nativeInlineVideoAllowed('https://www.youtube.com/embed/id')).toBe(true);
  });
});
