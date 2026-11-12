import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  session: null as any, role: null as any, rpc: vi.fn(), success: vi.fn(), error: vi.fn(), signIn: vi.fn(), signOut: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: m.success, error: m.error } }));
vi.mock('@/utils/courseCache', () => ({ setOfflineAuthActor: vi.fn(), observeOfflineAccess: vi.fn() }));
vi.mock('@/utils/privateRuntimeCacheCleanup', () => ({ clearPrivateRuntimeCaches: vi.fn().mockResolvedValue(true) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: m.rpc,
  auth: {
    getSession: async () => ({ data: { session: m.session }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    startAutoRefresh: vi.fn(), stopAutoRefresh: vi.fn(), signInWithPassword: m.signIn, signOut: m.signOut,
  },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
} }));
import { AuthProvider } from '@/hooks/useAuth';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Login from '../Login';
import BrandedLogin from '../BrandedLogin';

const qaSession = { user: { id: 'synthetic-login-owner', email: 'qa@example.invalid' }, access_token: 'synthetic-only' };
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); m.session = null;
  m.role = { data: null, error: { code: '42501', message: 'organization_access_suspended' } };
  m.rpc.mockImplementation(async (name: string) => name === 'get_user_role' ? m.role : name === 'is_user_blocked'
    ? { data: false, error: null } : { data: [{ id: 'qa-org', name: 'QA', website_url: null, login_branding: null }], error: null });
  m.signIn.mockImplementation(async () => { m.session = qaSession; return { data: { user: qaSession.user, session: qaSession }, error: null }; });
  m.signOut.mockImplementation(async () => { m.session = null; return { error: null }; });
});
afterEach(cleanup);
function page(branded: boolean) {
  return render(<MemoryRouter initialEntries={[branded ? '/branded/qa' : '/login']}><AuthProvider><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/branded/:slug" element={<BrandedLogin />} />
    <Route path="/organization" element={<ProtectedRoute requiredRole="organization"><p>Проверенный кабинет</p></ProtectedRoute>} />
    <Route path="/admin" element={<p>Недопустимый старый администратор</p>} />
  </Routes></AuthProvider></MemoryRouter>);
}
async function submit(branded: boolean) {
  await screen.findByRole('tab', { name: 'По email' });
  if (branded) fireEvent.mouseDown(screen.getByRole('tab', { name: 'По email' }), { button: 0, ctrlKey: false });
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'qa@example.invalid' } });
  fireEvent.change(screen.getByLabelText('Пароль', { exact: true }), { target: { value: 'synthetic-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Войти', exact: true }));
}
describe.each([false, true])('post-login access feedback (branded=%s)', branded => {
  it('shows the suspension after successful credentials instead of leaving a successful login form', async () => {
    page(branded); await submit(branded);
    expect(await screen.findByRole('alert')).toHaveTextContent('Доступ временно приостановлен');
    expect(screen.queryByRole('button', { name: 'Войти', exact: true })).toBeNull();
    expect(screen.queryByText('Проверенный кабинет')).toBeNull();
    expect(m.success).not.toHaveBeenCalled();
  });
  it('also explains suspension for a restored session and never follows a cached admin role', async () => {
    m.session = qaSession; localStorage.setItem('user_role', 'admin'); page(branded);
    expect(await screen.findByRole('alert')).toHaveTextContent('Доступ временно приостановлен');
    expect(screen.queryByText('Недопустимый старый администратор')).toBeNull();
    expect(localStorage.getItem('user_role')).toBeNull();
  });
  it('shows retry on role failure and opens the account only after a confirmed recovery', async () => {
    m.role = { data: null, error: { code: '503', message: 'unavailable' } }; page(branded); await submit(branded);
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить кабинет');
    expect(screen.queryByText('Проверенный кабинет')).toBeNull(); expect(m.success).not.toHaveBeenCalled();
    m.role = { data: 'organization', error: null };
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
    expect(await screen.findByText('Проверенный кабинет')).toBeVisible();
  });
  it('does not lift a hold when the user requests another access check', async () => {
    page(branded); await submit(branded); await screen.findByRole('alert');
    const before = m.rpc.mock.calls.filter(([name]) => name === 'get_user_role').length;
    fireEvent.click(screen.getByRole('button', { name: 'Проверить доступ' }));
    await waitFor(() => expect(m.rpc.mock.calls.filter(([name]) => name === 'get_user_role')).toHaveLength(before + 1));
    expect(screen.queryByText('Проверенный кабинет')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Доступ временно приостановлен');
  });
  it('keeps ordinary successful login routing', async () => {
    m.role = { data: 'organization', error: null }; page(branded); await submit(branded);
    expect(await screen.findByText('Проверенный кабинет')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('lets a suspended user sign out without removing the organization hold', async () => {
    page(branded); await submit(branded); await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Войти в другой аккаунт' }));
    expect(await screen.findByRole('heading', { name: 'Вход в систему' })).toBeVisible();
    expect(m.signOut).toHaveBeenCalledTimes(1);
    expect(m.role.error.message).toBe('organization_access_suspended');
  });
});
