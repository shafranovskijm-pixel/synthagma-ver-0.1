import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLayoutEffect } from 'react';
const mock = vi.hoisted(() => ({ actor: 'actor-a', revision: 1, getSession: vi.fn(), getUser: vi.fn(), from: vi.fn(), invoke: vi.fn(), toast: vi.fn(), requests: [] as any[], insert: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mock.actor }, userRole: 'organization' }) }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineContext: () => ({ actorId: mock.actor, revision: mock.revision }), captureOfflineAuthRevision: () => mock.revision,
  isOfflineActorCurrent: (id: string, revision: number) => id === mock.actor && revision === mock.revision }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mock.getSession, getUser: mock.getUser }, from: mock.from, functions: { invoke: mock.invoke } } }));
vi.mock('@/utils/documentHash', () => ({ sha256Hex: vi.fn(async () => 'a'.repeat(64)) }));
vi.mock('sonner', () => ({ toast: { success: mock.toast, error: mock.toast } }));
vi.mock('@/components/ui/dialog', () => ({ Dialog: ({ open, children }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>, DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>, DialogDescription: ({ children }: any) => <div>{children}</div>, DialogFooter: ({ children }: any) => <div>{children}</div> }));
import { SendForSigningDialog } from './SendForSigningDialog';
const payload = { organizationId: 'org-a', documentId: 'doc-a', documentType: 'contract' as const, documentTitle: 'Synthetic contract', documentHtml: '<p>Synthetic only</p>' };
const props = { open: true, onOpenChange: vi.fn(), payload };
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
function fill() { fireEvent.change(screen.getByPlaceholderText('Иванов Иван Иванович'), { target: { value: 'Synthetic Recipient' } }); fireEvent.change(screen.getByPlaceholderText('ivanov@example.com'), { target: { value: 'synthetic@example.invalid' } }); }
beforeEach(() => {
  vi.clearAllMocks(); mock.actor = 'actor-a'; mock.revision = 1; mock.requests = [];
  mock.getSession.mockResolvedValue({ data: { session: { user: { id: 'actor-a' }, access_token: 'original-jwt' } }, error: null });
  mock.getUser.mockResolvedValue({ data: { user: { id: 'actor-a' } }, error: null }); mock.invoke.mockResolvedValue({ data: {}, error: null });
  mock.insert.mockImplementation(async (values: any) => ({ data: { id: 'row-a', signature_token: values.signature_token }, error: null }));
  mock.from.mockImplementation((table: string) => {
    let values: any, action = 'read', bearer: string;
    const q: any = { select: () => q, eq: () => q, maybeSingle: () => q, single: () => q,
      insert: (v: any) => { values = v; action = 'insert'; return q; }, update: (v: any) => { values = v; action = 'update'; return q; },
      setHeader: (_: string, v: string) => { bearer = v; return q; },
      then: (resolve: any, reject: any) => { mock.requests.push({ table, values, action, bearer }); return (table === 'document_signatures' && action === 'insert' ? mock.insert(values)
        : Promise.resolve({ data: table === 'profiles' ? { full_name: 'Synthetic Sender' } : { id: 'revision-a' }, error: null })).then(resolve, reject); } };
    return q;
  });
});
afterEach(cleanup);
it('pins original verified JWT on writes and email while preserving the explicit invitation link', async () => {
  render(<SendForSigningDialog {...props} />); fill(); fireEvent.click(screen.getByRole('button', { name: 'Отправить на подпись' }));
  await waitFor(() => expect(screen.getByDisplayValue(/\/sign\//)).toBeTruthy());
  expect(mock.getUser).toHaveBeenCalledWith('original-jwt'); expect(mock.requests.every(r => r.bearer === 'Bearer original-jwt')).toBe(true);
  expect(mock.insert.mock.calls[0][0]).toMatchObject({ organization_id: 'org-a', sender_user_id: 'actor-a', document_id: 'doc-a' });
  expect(mock.invoke).toHaveBeenCalledWith('send-signing-email', expect.objectContaining({ headers: { Authorization: 'Bearer original-jwt' } }));
});
it('does not dispatch the insertion after an actor swap before React renders', async () => {
  const session = deferred<any>(); mock.getSession.mockReturnValue(session.promise);
  render(<SendForSigningDialog {...props} />); fill(); fireEvent.click(screen.getByRole('button', { name: 'Отправить на подпись' }));
  mock.actor = 'actor-b'; mock.revision++;
  await act(async () => { session.resolve({ data: { session: { user: { id: 'actor-a' }, access_token: 'original-jwt' } }, error: null }); });
  expect(mock.from).not.toHaveBeenCalled(); expect(mock.invoke).not.toHaveBeenCalled(); expect(mock.toast).not.toHaveBeenCalled();
});
it('does not expose a completed old insertion or send mail after org/document A→B→A', async () => {
  const saved = deferred<any>(); mock.insert.mockReturnValue(saved.promise);
  const layoutValues: string[] = [];
  function Observe({ value }: { value: typeof props }) {
    useLayoutEffect(() => { layoutValues.push((document.querySelector('input[placeholder="ivanov@example.com"]') as HTMLInputElement | null)?.value ?? 'no field'); }, [value.payload]);
    return <SendForSigningDialog {...value} />;
  }
  const view = render(<Observe value={props} />); fill(); fireEvent.click(screen.getByRole('button', { name: 'Отправить на подпись' }));
  await waitFor(() => expect(mock.insert).toHaveBeenCalled()); const submitted = mock.insert.mock.calls[0][0];
  view.rerender(<Observe value={{ ...props, payload: { ...payload, organizationId: 'org-b', documentId: 'doc-b' } }} />);
  view.rerender(<Observe value={props} />);
  expect(layoutValues.slice(-2)).toEqual(['', '']);
  expect(screen.getByPlaceholderText('ivanov@example.com')).toHaveValue('');
  await act(async () => { saved.resolve({ data: { id: 'row-a', signature_token: submitted.signature_token }, error: null }); });
  expect(screen.queryByDisplayValue(/\/sign\//)).toBeNull(); expect(mock.invoke).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Отправить на подпись' })).not.toBeDisabled();
});
it('resets the draft on close/reopen without reviving an older link', async () => {
  const saved = deferred<any>(); mock.insert.mockReturnValue(saved.promise);
  const view = render(<SendForSigningDialog {...props} />); fill(); fireEvent.click(screen.getByRole('button', { name: 'Отправить на подпись' }));
  await waitFor(() => expect(mock.insert).toHaveBeenCalled()); const submitted = mock.insert.mock.calls[0][0];
  view.rerender(<SendForSigningDialog {...props} open={false} />); view.rerender(<SendForSigningDialog {...props} />);
  await act(async () => { saved.resolve({ data: { id: 'row-a', signature_token: submitted.signature_token }, error: null }); });
  expect(screen.queryByDisplayValue(/\/sign\//)).toBeNull(); expect(screen.getByPlaceholderText('ivanov@example.com')).toHaveValue(''); expect(mock.invoke).not.toHaveBeenCalled();
});
it('prevents browser navigation through an old result link when auth changed before React can rerender', async () => {
  render(<SendForSigningDialog {...props} />); fill(); fireEvent.click(screen.getByRole('button', { name: 'Отправить на подпись' }));
  await waitFor(() => expect(screen.getByDisplayValue(/\/sign\//)).toBeTruthy());
  const link = document.querySelector('a[href*="/sign/"]') as HTMLAnchorElement;
  expect(link.href).toContain('/sign/');
  mock.actor = 'actor-b'; mock.revision++;
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
});
