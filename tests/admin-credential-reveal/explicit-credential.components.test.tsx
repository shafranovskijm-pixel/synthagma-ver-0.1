import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersManager } from '@/components/admin/UsersManager';
import { UserTableRow } from '@/components/admin/users/UserTableRow';

const port = vi.hoisted(() => ({
  auth: null as any, profiles: [] as any[], roles: [] as any[],
  rpc: vi.fn(), from: vi.fn(), reads: [] as any[], selected: [] as string[],
  success: vi.fn(), error: vi.fn(), clipboard: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => port.auth }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: any[]) => port.rpc(...args), from: (...args: any[]) => port.from(...args) },
}));
vi.mock('sonner', () => ({ toast: { success: port.success, error: port.error } }));
vi.mock('@/components/ui/SigmaSpinner', () => ({ SigmaSpinner: () => <span>Loading</span> }));
vi.mock('@/components/shared/TableSkeleton', () => ({ TableSkeleton: () => <div role="progressbar">Loading users</div> }));

const ORG = '33333333-3333-4333-8333-333333333333';
const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const uid = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const profile = (n: number) => ({
  id: '10000000-0000-4000-8000-' + String(n).padStart(12, '0'), user_id: uid(n),
  full_name: 'QA User' + String(n).padStart(2, '0'), email: 'qa' + n + '@example.invalid',
  avatar_url: null, organization_id: ORG, login: 'qa_' + n, company_id: null,
  created_at: '2026-10-28T00:00:00Z',
});
const session = () => ({
  user: { id: ADMIN }, session: { user: { id: ADMIN }, expires_at: Math.floor(Date.now() / 1000) + 3600 },
  userRole: 'admin', loading: false, authError: null,
});
const App = () => <MemoryRouter initialEntries={['/admin?tab=users']}><UsersManager /></MemoryRouter>;
const row = (n: number) => screen.getByText('QA User' + String(n).padStart(2, '0')).closest('tr')!;
const reveal = (n: number) => within(row(n)).getByRole('button', { name: 'Показать пароль qa_' + n, exact: true });
const copy = (n: number) => within(row(n)).getByRole('button', { name: 'Скопировать показанные учётные данные qa_' + n, exact: true }) as HTMLButtonElement;
const settle = async (index: number, data: unknown, error: unknown = null) => {
  await act(async () => { port.reads[index].resolve({ data, error }); await Promise.resolve(); });
};
beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  port.auth = session();
  port.profiles = [profile(1), profile(2)];
  port.roles = port.profiles.map(p => ({ user_id: p.user_id, role: 'student' }));
  port.reads = []; port.selected = [];
  port.success.mockReset(); port.error.mockReset();
  port.clipboard.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: port.clipboard } });
  port.rpc.mockReset().mockImplementation((name, args) => {
    if (name === 'get_decrypted_student_password') {
      return { abortSignal: (signal: AbortSignal) => new Promise(resolve => port.reads.push({ args, signal, resolve })) };
    }
    if (name === 'admin_update_user_role') return Promise.resolve({ data: null, error: null });
    throw Error('Unexpected RPC in credential UI test: ' + name);
  });
  port.from.mockReset().mockImplementation((table: string) => {
    const data = () => table === 'profiles' ? port.profiles
      : table === 'user_roles' ? port.roles : table === 'organizations' ? [{ id: ORG, name: 'Synthetic QA organization' }] : [];
    const query: any = {
      select: (columns: string) => { port.selected.push(table + ':' + columns); return query; },
      order: () => query,
      update: () => query,
      delete: () => query,
      eq: () => query,
      then: (resolve: any, reject: any) => Promise.resolve({ data: data(), error: null }).then(resolve, reject),
    };
    return query;
  });
});

describe('actual UsersManager and UserTableRow explicit credential wiring', () => {
  it('ACRC01 normal list mounting and remounting hydrate profiles roles organizations with zero decrypt requests', async () => {
    const first = render(<App />);
    await screen.findByText('QA User01');
    expect(screen.getByText('QA User02')).toBeDefined();
    expect(port.rpc).not.toHaveBeenCalled();
    expect(port.selected.some(value => value.startsWith('profiles:') && value.includes('generated_password'))).toBe(false);
    expect(copy(1).disabled).toBe(true);
    first.unmount();
    port.auth = session();
    const second = render(<App />);
    await screen.findByText('QA User01');
    expect(port.rpc).not.toHaveBeenCalled();
    expect(copy(1).disabled).toBe(true);
    second.unmount();
  });

  it('ACRC02 one explicit eye read enables only that row copy and hiding removes plaintext and disables copy', async () => {
    const h = render(<App />); await screen.findByText('QA User01');
    fireEvent.click(copy(1));
    expect(port.clipboard).not.toHaveBeenCalled();
    fireEvent.click(reveal(1));
    expect(port.rpc).toHaveBeenCalledTimes(1);
    expect(port.rpc).toHaveBeenCalledWith('get_decrypted_student_password', { p_user_id: uid(1) });
    expect(within(row(1)).getByText('Загрузка…')).toBeDefined();
    expect(copy(1).disabled).toBe(true);
    expect(copy(2).disabled).toBe(true);
    await settle(0, 'SYNTHETIC_REVEALED_ONE');
    expect(within(row(1)).getByText('SYNTHETIC_REVEALED_ONE')).toBeDefined();
    expect(copy(1).disabled).toBe(false);
    expect(copy(2).disabled).toBe(true);
    fireEvent.click(copy(1)); await act(async () => { await Promise.resolve(); });
    expect(port.clipboard).toHaveBeenCalledTimes(1);
    expect(port.clipboard).toHaveBeenCalledWith('Логин: qa_1\nПароль: SYNTHETIC_REVEALED_ONE');
    fireEvent.click(within(row(1)).getByRole('button', { name: 'Скрыть пароль qa_1', exact: true }));
    expect(screen.queryByText('SYNTHETIC_REVEALED_ONE')).toBeNull();
    expect(copy(1).disabled).toBe(true);
    fireEvent.click(copy(1));
    expect(port.clipboard).toHaveBeenCalledTimes(1);
    fireEvent.click(reveal(1));
    expect(port.rpc).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('SYNTHETIC_REVEALED_ONE')).toBeNull();
    h.unmount();
  });

  it('ACRC03 RPC denial unknown payload ciphertext pending and Auth changes never write a placeholder or stale password to clipboard', async () => {
    const h = render(<App />); await screen.findByText('QA User01');
    for (const [data, error] of [
      [null, null], [{ password: 'WRONG_SHAPE' }, null], ['ENC:NOT_PLAINTEXT', null],
      ['APPARENT_VALUE', { message: 'Unauthorized' }],
    ] as [unknown, unknown][]) {
      const index = port.reads.length;
      fireEvent.click(reveal(1));
      fireEvent.click(copy(1));
      expect(port.clipboard).not.toHaveBeenCalled();
      await settle(index, data, error);
      expect(copy(1).disabled).toBe(true);
      fireEvent.click(copy(1));
      expect(port.clipboard).not.toHaveBeenCalled();
      expect(screen.queryByText('APPARENT_VALUE')).toBeNull();
      expect(screen.queryByText('ENC:NOT_PLAINTEXT')).toBeNull();
    }
    fireEvent.click(reveal(1)); await settle(4, 'CURRENT_BEFORE_LOGOUT');
    expect(copy(1).disabled).toBe(false);
    port.auth = { ...session(), user: null, session: null };
    h.rerender(<App />);
    expect(screen.queryByText('CURRENT_BEFORE_LOGOUT')).toBeNull();
    expect(copy(1).disabled).toBe(true);
    fireEvent.click(copy(1));
    expect(port.clipboard).not.toHaveBeenCalled();
    h.unmount();
  });

  it('ACRC04 the existing role selector still sends the exact role update and clears a revealed credential before changing the row', async () => {
    const h = render(<App />); await screen.findByText('QA User01');
    fireEvent.click(reveal(1)); await settle(0, 'BEFORE_ROLE_CHANGE');
    const roleSelect = within(row(1)).getAllByRole('combobox')[0];
    fireEvent.keyDown(roleSelect, { key: 'ArrowDown' });
    const option = await screen.findByRole('option', { name: 'Организация', exact: true });
    fireEvent.keyDown(option, { key: 'Enter' });
    await act(async () => { await Promise.resolve(); });
    expect(port.rpc).toHaveBeenCalledWith('admin_update_user_role', { p_user_id: uid(1), p_new_role: 'organization' });
    expect(port.rpc.mock.calls.filter(([name]) => name === 'admin_update_user_role')).toHaveLength(1);
    expect(screen.queryByText('BEFORE_ROLE_CHANGE')).toBeNull();
    expect(within(row(1)).queryByRole('button', { name: 'Показать пароль qa_1', exact: true })).toBeNull();
    expect(screen.getByText('QA User02')).toBeDefined();
    expect(port.clipboard).not.toHaveBeenCalled();
    h.unmount();
  });

  it('ACRC05 choosing a second real row closes the first and its late result cannot be displayed or copied under another login', async () => {
    const h = render(<App />); await screen.findByText('QA User01');
    fireEvent.click(reveal(1));
    fireEvent.click(reveal(2));
    expect(port.reads[0].signal.aborted).toBe(true);
    expect(port.reads[1].args).toEqual({ p_user_id: uid(2) });
    await settle(0, 'STALE_FIRST_ROW_VALUE');
    expect(screen.queryByText('STALE_FIRST_ROW_VALUE')).toBeNull();
    expect(copy(1).disabled).toBe(true);
    fireEvent.click(copy(1));
    expect(port.clipboard).not.toHaveBeenCalled();
    await settle(1, 'CURRENT_SECOND_ROW_VALUE');
    expect(within(row(2)).getByText('CURRENT_SECOND_ROW_VALUE')).toBeDefined();
    expect(copy(2).disabled).toBe(false);
    fireEvent.click(copy(2)); await act(async () => { await Promise.resolve(); });
    expect(port.clipboard).toHaveBeenCalledTimes(1);
    expect(port.clipboard).toHaveBeenCalledWith('Логин: qa_2\nПароль: CURRENT_SECOND_ROW_VALUE');
    expect(port.rpc.mock.calls.every(([name]) => name !== 'get_all_decrypted_passwords')).toBe(true);
    h.unmount();
  });

  it('ACRC06 existing pagination and name email filtering remain usable while hidden rows lose the revealed value and require a fresh read', async () => {
    port.profiles = Array.from({ length: 12 }, (_, i) => profile(i + 1));
    port.roles = port.profiles.map(p => ({ user_id: p.user_id, role: 'student' }));
    const h = render(<App />); await screen.findByText('QA User01');
    expect(screen.queryByText('QA User11')).toBeNull();
    expect(port.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '+10', exact: true }));
    expect(screen.getByText('QA User11')).toBeDefined();
    fireEvent.click(reveal(11)); await settle(0, 'QA_PAGE_TWO_VALUE');
    expect(within(row(11)).getByText('QA_PAGE_TWO_VALUE')).toBeDefined();
    const search = screen.getByPlaceholderText('Поиск по имени или email...');
    fireEvent.change(search, { target: { value: 'QA User02' } });
    expect(screen.queryByText('QA_PAGE_TWO_VALUE')).toBeNull();
    expect(screen.queryByText('QA User11')).toBeNull();
    expect(screen.getByText('QA User02')).toBeDefined();
    expect(port.rpc).toHaveBeenCalledTimes(1);
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.queryByText('QA User11')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '+10', exact: true }));
    expect(copy(11).disabled).toBe(true);
    fireEvent.click(reveal(11));
    expect(port.rpc).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('QA_PAGE_TWO_VALUE')).toBeNull();
    expect(port.clipboard).not.toHaveBeenCalled();
    h.unmount();
  });
  it('ACRC07 a revealed real UserTableRow forwards only password-free metadata to delete and view actions and UUID to copy', () => {
    const metadata = { ...profile(1), role: 'student', generated_password: null, organization_name: 'Synthetic QA organization' };
    const deleteAction = vi.fn(), viewAction = vi.fn(), copyAction = vi.fn(), navigate = vi.fn();
    const h = render(<MemoryRouter><table><tbody>
      <UserTableRow user={metadata} organizations={[{ id: ORG, name: 'Synthetic QA organization' }]}
        revealedPassword="SYNTHETIC_DISPLAY_ONLY_NEVER_ACTION_METADATA" isPasswordVisible={true}
        onTogglePassword={vi.fn()} onCopyCredentials={copyAction} onRoleChange={vi.fn()} onOrgChange={vi.fn()}
        onViewAsStudent={viewAction} onDelete={deleteAction} onNavigate={navigate} />
    </tbody></table></MemoryRouter>);
    expect(within(row(1)).getByText('SYNTHETIC_DISPLAY_ONLY_NEVER_ACTION_METADATA')).toBeDefined();
    expect(copy(1).disabled).toBe(false);
    fireEvent.click(copy(1));
    expect(copyAction).toHaveBeenCalledWith(uid(1));
    expect(copyAction.mock.calls[0]).toHaveLength(1);
    fireEvent.click(within(row(1)).getByRole('button', { name: 'Войти как ученик', exact: true }));
    fireEvent.click(within(row(1)).getByRole('button', { name: 'Удалить профиль QA User01', exact: true }));
    expect(viewAction.mock.calls[0][0]).toBe(metadata);
    expect(deleteAction.mock.calls[0][0]).toBe(metadata);
    expect(viewAction.mock.calls[0][0].generated_password).toBeNull();
    expect(deleteAction.mock.calls[0][0].generated_password).toBeNull();
    expect(JSON.stringify([deleteAction.mock.calls, viewAction.mock.calls, copyAction.mock.calls]))
      .not.toContain('SYNTHETIC_DISPLAY_ONLY_NEVER_ACTION_METADATA');
    expect(navigate).not.toHaveBeenCalled();
    h.unmount();
  });

  it('ACRC08 actual UsersManager opens delete dialog with credential already masked and keeps it closed after blur and cancel', async () => {
    const h = render(<App />); await screen.findByText('QA User01');
    fireEvent.click(reveal(1)); await settle(0, 'BEFORE_DELETE_DIALOG_DISPLAY_ONLY');
    expect(copy(1).disabled).toBe(false);
    fireEvent.click(within(row(1)).getByRole('button', { name: 'Удалить профиль QA User01', exact: true }));
    expect(screen.queryByText('BEFORE_DELETE_DIALOG_DISPLAY_ONLY')).toBeNull();
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Удалить пользователя?')).toBeDefined();
    act(() => window.dispatchEvent(new Event('blur')));
    expect(screen.queryByText('BEFORE_DELETE_DIALOG_DISPLAY_ONLY')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена', exact: true }));
    expect(copy(1).disabled).toBe(true);
    expect(screen.getByText('QA User01')).toBeDefined();
    expect(screen.queryByText('BEFORE_DELETE_DIALOG_DISPLAY_ONLY')).toBeNull();
    expect(port.rpc).toHaveBeenCalledTimes(1);
    expect(port.clipboard).not.toHaveBeenCalled();
    h.unmount();
  });

});
