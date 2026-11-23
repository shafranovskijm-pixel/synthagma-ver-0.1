import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ reads: [] as any[], readQueue: [] as any[], insert: vi.fn(), invoke: vi.fn(), success: vi.fn(), error: vi.fn(), pdf: vi.fn(), print: vi.fn(), dialog: null as any, insertResult: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  functions: { invoke: mocks.invoke },
  from: (table: string) => ({
    select: () => { const filters: Record<string, string> = {}; const query = { eq: (key: string, value: string) => { filters[key] = value; return query; }, order: () => query, limit: () => query, maybeSingle: () => { mocks.reads.push({ table, filters }); const result = mocks.readQueue.shift(); if (!result) throw new Error('Unexpected read'); return result; } }; return query; },
    insert: (value: unknown) => { mocks.insert(value); return { select: () => ({ single: () => mocks.insertResult() }) }; },
  }),
} }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/constants/pepAgreementTemplate', () => ({ PEP_AGREEMENT_VERSION: 'v1.0', getPepAgreementText: (v: any) => 'NEW DRAFT ' + v.org_name + ' ' + v.current_date }));
vi.mock('@/lib/consentPdf', () => ({ buildPepAgreementPdfHtml: (value: unknown) => { mocks.pdf(value); return 'pdf-html'; } }));
vi.mock('@/utils/printHtmlToPdf', () => ({ printHtmlContent: mocks.print }));
vi.mock('@/components/signing/PepAgreementDialog', () => ({ PepAgreementDialog: (props: any) => { mocks.dialog = props; return props.open ? <div role="dialog"><pre>{props.agreementText}</pre>{props.onAccept && <button onClick={props.onAccept}>Confirm agreement</button>}</div> : null; } }));
import { StudentPepAgreementCard } from './StudentPepAgreementCard';

function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>(yes => { resolve = yes; }); return { promise, resolve }; }
const empty = () => Promise.resolve({ data: null, error: null });
const record = (id: string, text = 'STORED ACCEPTED ' + id) => ({ id, organization_id: id, user_id: 'student-a', agreement_text: text, agreement_version: 'v1.0', accepted_at: '2026-10-01T12:00:00Z', ip_address: null, user_agent: null });
const props = { userId: 'student-a', userName: 'Test Learner', userEmail: 'qa@example.test', organizationId: 'org-a', organizationName: 'Organization A' };

beforeEach(() => { vi.clearAllMocks(); mocks.reads = []; mocks.readQueue = []; mocks.dialog = null; (mocks as any).insertResult = vi.fn().mockResolvedValue({ data: record('org-a'), error: null }); mocks.invoke.mockResolvedValue({ data: { ip: '192.0.2.1' } }); mocks.print.mockResolvedValue(undefined); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('legacy student PEP organization and accepted-text boundary', () => {
  it('queries the exact organization and clears another organization acceptance before its read finishes', async () => {
    const pending = deferred(); const status = vi.fn(); mocks.readQueue.push(Promise.resolve({ data: record('org-a'), error: null }), pending.promise);
    const view = render(<StudentPepAgreementCard {...props} onStatusChange={status} />);
    await screen.findByText('Принято');
    expect(mocks.reads[0].filters).toEqual({ user_id: 'student-a', organization_id: 'org-a', agreement_version: 'v1.0' });
    fireEvent.click(screen.getByText('Просмотреть')); expect(screen.getByRole('dialog').textContent).toContain('STORED ACCEPTED org-a');
    view.rerender(<StudentPepAgreementCard {...props} organizationId="org-b" organizationName="Organization B" onStatusChange={status} />);
    expect(screen.queryByText('Принято')).toBeNull(); expect(screen.queryByRole('dialog')).toBeNull(); expect(status).toHaveBeenLastCalledWith(null);
    await act(async () => pending.resolve({ data: null, error: null }));
    expect(mocks.reads[1].filters.organization_id).toBe('org-b'); expect(screen.queryByText('Принято')).toBeNull(); expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('shows and prints the exact stored accepted text instead of regenerating todays text', async () => {
    mocks.readQueue.push(Promise.resolve({ data: record('org-a', 'Accepted in 2025: immutable exact terms'), error: null }));
    render(<StudentPepAgreementCard {...props} />); await screen.findByText('Принято');
    fireEvent.click(screen.getByText('Просмотреть')); expect(screen.getByRole('dialog').textContent).toBe('Accepted in 2025: immutable exact terms'); expect(mocks.dialog.onAccept).toBeUndefined();
    fireEvent.click(screen.getByText('Скачать (PDF)'));
    await waitFor(() => expect(mocks.pdf).toHaveBeenCalledWith(expect.objectContaining({ bodyText: 'Accepted in 2025: immutable exact terms' })));
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('clears prior user agreement on a failed next-user read, refuses acceptance, and can retry', async () => {
    const status = vi.fn(); mocks.readQueue.push(Promise.resolve({ data: record('org-a'), error: null }), Promise.resolve({ data: null, error: { message: 'offline' } }), empty());
    const view = render(<StudentPepAgreementCard {...props} onStatusChange={status} />); await screen.findByText('Принято');
    view.rerender(<StudentPepAgreementCard {...props} userId="student-b" onStatusChange={status} />);
    await screen.findByText('Не удалось проверить соглашение. Повторите проверку.');
    expect(screen.queryByText('Принято')).toBeNull(); expect(screen.getByText('Открыть и подписать').closest('button')?.disabled).toBe(true); expect(status).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByText('Повторить проверку'));
    await screen.findByText('Сохранённого соглашения для этой организации пока нет');
    expect(mocks.reads[2].filters.user_id).toBe('student-b'); expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('ignores a late old-organization read after the new organization was loaded', async () => {
    const old = deferred(); const status = vi.fn(); mocks.readQueue.push(old.promise, Promise.resolve({ data: record('org-b'), error: null }));
    const view = render(<StudentPepAgreementCard {...props} onStatusChange={status} />);
    view.rerender(<StudentPepAgreementCard {...props} organizationId="org-b" onStatusChange={status} />); await screen.findByText('Принято');
    await act(async () => old.resolve({ data: record('org-a'), error: null }));
    fireEvent.click(screen.getByText('Просмотреть')); expect(screen.getByRole('dialog').textContent).toBe('STORED ACCEPTED org-b'); expect(status).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'org-b' }));
  });

  it('does not revive an old A response after an A to B to A transition', async () => {
    const old = deferred(); const middle = deferred(); mocks.readQueue.push(old.promise, middle.promise, empty());
    const view = render(<StudentPepAgreementCard {...props} />);
    view.rerender(<StudentPepAgreementCard {...props} organizationId="org-b" />); view.rerender(<StudentPepAgreementCard {...props} />);
    await screen.findByText('Сохранённого соглашения для этой организации пока нет');
    await act(async () => { old.resolve({ data: record('org-a'), error: null }); middle.resolve({ data: record('org-b'), error: null }); });
    expect(screen.queryByText('Принято')).toBeNull(); expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('suppresses read completion and parent status changes after unmount', async () => {
    const old = deferred(); const status = vi.fn(); mocks.readQueue.push(old.promise);
    const view = render(<StudentPepAgreementCard {...props} onStatusChange={status} />); view.unmount(); status.mockClear();
    await act(async () => old.resolve({ data: record('org-a'), error: null })); expect(status).not.toHaveBeenCalled();
  });

  it('does not insert after organization changes while client IP is pending', async () => {
    const ip = deferred(); mocks.invoke.mockReturnValue(ip.promise); mocks.readQueue.push(empty(), empty());
    const view = render(<StudentPepAgreementCard {...props} />); await screen.findByText('Сохранённого соглашения для этой организации пока нет');
    fireEvent.click(screen.getByText('Открыть и подписать')); fireEvent.click(screen.getByText('Confirm agreement'));
    view.rerender(<StudentPepAgreementCard {...props} organizationId="org-b" />); await screen.findByText('Сохранённого соглашения для этой организации пока нет');
    await act(async () => ip.resolve({ data: { ip: '192.0.2.1' } })); expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
  });

  it('keeps a late committed acceptance in its original context and never announces it in another one', async () => {
    const saved = deferred(); (mocks as any).insertResult.mockReturnValue(saved.promise); const status = vi.fn(); mocks.readQueue.push(empty(), empty());
    const view = render(<StudentPepAgreementCard {...props} onStatusChange={status} />); await screen.findByText('Сохранённого соглашения для этой организации пока нет');
    fireEvent.click(screen.getByText('Открыть и подписать')); fireEvent.click(screen.getByText('Confirm agreement'));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledOnce()); expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ organization_id: 'org-a', user_id: 'student-a' }));
    view.rerender(<StudentPepAgreementCard {...props} organizationId="org-b" onStatusChange={status} />); await screen.findByText('Сохранённого соглашения для этой организации пока нет'); status.mockClear();
    await act(async () => saved.resolve({ data: record('org-a'), error: null }));
    expect(screen.queryByText('Принято')).toBeNull(); expect(status).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
  });

  it('does not read or accept without an organization', async () => {
    const status = vi.fn(); render(<StudentPepAgreementCard {...props} organizationId={null} onStatusChange={status} />);
    await screen.findByText('Не удалось определить образовательную организацию'); expect(mocks.reads).toHaveLength(0); expect(mocks.insert).not.toHaveBeenCalled(); expect(screen.getByText('Открыть и подписать').closest('button')?.disabled).toBe(true); expect(status).toHaveBeenLastCalledWith(null);
  });

  it('changing callback identity alone does not refetch or clear a loaded acceptance', async () => {
    mocks.readQueue.push(Promise.resolve({ data: record('org-a'), error: null }));
    const view = render(<StudentPepAgreementCard {...props} onStatusChange={() => {}} />); await screen.findByText('Принято');
    view.rerender(<StudentPepAgreementCard {...props} onStatusChange={() => {}} />); expect(screen.getByText('Принято')).toBeTruthy(); expect(mocks.reads).toHaveLength(1);
  });
});
