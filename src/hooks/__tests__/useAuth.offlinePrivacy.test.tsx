import { createElement, type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../useAuth';
import { captureOfflineActor, rememberOfflineScope, getOfflineScope, setOfflineAuthActor } from '@/utils/courseCache';
const mocks = vi.hoisted(() => ({getSession: vi.fn(), rpc: vi.fn(), signOut: vi.fn(), callback: null as any}));
vi.mock('@/integrations/supabase/client', () => ({supabase: {auth: {getSession: mocks.getSession, signOut: mocks.signOut, startAutoRefresh: vi.fn(), stopAutoRefresh: vi.fn(), onAuthStateChange: (callback: any) => {mocks.callback = callback; return {data: {subscription: {unsubscribe: vi.fn()}}};}}, rpc: mocks.rpc}}));
vi.mock('@/utils/privateRuntimeCacheCleanup', () => ({clearPrivateRuntimeCaches: vi.fn().mockResolvedValue(true)}));
const wrapper = ({children}: {children: ReactNode}) => createElement(AuthProvider, null, children);
beforeEach(() => {vi.clearAllMocks(); localStorage.clear(); setOfflineAuthActor(null); mocks.getSession.mockResolvedValue({data: {session: {user: {id: 'a'}}}, error: null}); mocks.rpc.mockResolvedValue({data: 'admin', error: null}); mocks.signOut.mockResolvedValue({error: null});});
afterEach(() => {cleanup(); setOfflineAuthActor(null);});
describe('AuthProvider synchronous offline invalidation', () => {
  it('logout hides current actor and invalidates offline scope before awaited SDK/network cleanup', async () => {
    const hook = renderHook(useAuth, {wrapper}); await waitFor(() => expect(hook.result.current.userRole).toBe('admin'));
    const before = captureOfflineActor('a'); rememberOfflineScope({actorId: 'a', organizationId: 'org', effectiveUserId: 'a', mode: 'learner'}, 'course', before);
    let resolve!: (value: any) => void; mocks.signOut.mockReturnValueOnce(new Promise(done => {resolve = done;})); let pending!: Promise<void>;
    act(() => {pending = hook.result.current.signOut();});
    expect(hook.result.current.user).toBeNull(); expect(captureOfflineActor('a')).toBeNull(); expect(getOfflineScope('a', 'a', 'learner', 'course')).toBeNull();
    await act(async () => {resolve({error: null}); await pending;});
  });
  it('server-observed same-actor role downgrade invalidates scopes before role publication completes', async () => {
    const hook = renderHook(useAuth, {wrapper}); await waitFor(() => expect(hook.result.current.userRole).toBe('admin'));
    const before = captureOfflineActor('a'); rememberOfflineScope({actorId: 'a', organizationId: 'org', effectiveUserId: 'target', mode: 'preview'}, 'course', before);
    mocks.rpc.mockResolvedValueOnce({data: 'student', error: null}); await act(async () => {await hook.result.current.refreshUserRole();});
    expect(hook.result.current.userRole).toBe('student'); expect(captureOfflineActor('a')).not.toBe(before); expect(getOfflineScope('a', 'target', 'preview', 'course')).toBeNull();
  });
});
