import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: { id: 'student-a', email: 'self@example.test' } as any, role: 'student', authRevision: 0,
  reads: [] as any[], inserts: [] as any[], respond: null as any,
  getUser: vi.fn(), invoke: vi.fn(), inserted: vi.fn(), success: vi.fn(), error: vi.fn(),
  generated: vi.fn(), pdf: vi.fn(), print: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.actor, userRole: mocks.role }) }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineAuthRevision: () => mocks.authRevision }));
vi.mock('@/lib/documents/outputFence', () => ({ captureDocumentOutputFence: () => {
  const revision = mocks.authRevision;
  return () => { if (revision !== mocks.authRevision) throw new Error('Actor changed'); };
} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: mocks.getUser }, functions: { invoke: mocks.invoke },
  from: (table: string) => {
    const filters: Record<string, unknown> = {};
    let columns = ''; let insertion: unknown; let started: Promise<any> | null = null;
    const run = () => {
      if (!started) {
        if (insertion !== undefined) {
          mocks.inserts.push({ table, value: insertion });
          started = Promise.resolve(mocks.inserted(table, insertion));
        } else {
          const read = { table, filters: { ...filters }, columns };
          mocks.reads.push(read); started = Promise.resolve(mocks.respond(read));
        }
      }
      return started;
    };
    const query: any = {
      select: (value = '*') => { columns = value; return query; },
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      order: () => query, limit: () => query,
      single: run, maybeSingle: run,
      insert: (value: unknown) => { insertion = value; return query; },
      then: (yes: any, no: any) => run().then(yes, no),
    };
    return query;
  },
} }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/constants/pepAgreementTemplate', () => ({
  PEP_AGREEMENT_VERSION: 'v1.0',
  getPepAgreementText: (value: any) => { mocks.generated(value); return 'NEW DRAFT ' + value.org_name; },
}));
vi.mock('@/lib/consentPdf', () => ({ buildConsentPdfHtml: mocks.pdf }));
vi.mock('@/utils/printHtmlToPdf', () => ({ printHtmlContent: mocks.print }));
vi.mock('@/components/ui/scroll-area', () => ({ ScrollArea: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/components/ui/checkbox', () => ({ Checkbox: ({ checked, onCheckedChange, ...props }: any) =>
  <input {...props} type="checkbox" checked={!!checked} onChange={event => onCheckedChange(event.target.checked)} /> }));
vi.mock('@/components/ui/SigmaSpinner', () => ({ SigmaSpinner: () => <span data-testid="spinner" /> }));
import { StudentConsentForm } from './StudentConsentForm';

function deferred() {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>(yes => { resolve = yes; });
  return { promise, resolve };
}
const ok = (data: any) => ({ data, error: null });
const agreement = (org = 'org-a') => ({ id: 'pep-' + org, agreement_version: 'v1.0', accepted_at: '2026-10-01T12:00:00Z', agreement_text: 'IMMUTABLE ACCEPTED ' + org });
const signed = (id = 'consent-a') => ({ id, status: 'signed', consent_type: 'individual', full_name: 'Stored Learner', signed_at: '2026-10-01T12:00:00Z', created_at: '2026-10-01T12:00:00Z', expires_at: null, policy_version: 'OLD VERSION' });
const props = { userId: 'student-a', userName: 'Test Learner', organizationId: 'org-a', enrollmentId: 'enrollment-a', embedded: true };
const defaults = (read: any) => {
  if (read.table === 'enrollments') return ok({ course: { organization_id: read.filters.id === 'enrollment-b' ? 'org-b' : 'org-a' } });
  if (read.table === 'organizations') return ok({ name: 'Organization ' + read.filters.id, inn: null, ogrn: null, legal_address: null });
  if (read.table === 'student_consents') return ok([]);
  if (read.table === 'pep_agreements') return ok(null);
  throw new Error('Unexpected unscoped read: ' + read.table);
};
beforeEach(() => {
  vi.clearAllMocks(); mocks.actor = { id: 'student-a', email: 'self@example.test' }; mocks.role = 'student'; mocks.authRevision = 0;
  mocks.reads = []; mocks.inserts = []; mocks.respond = defaults;
  mocks.getUser.mockImplementation(async () => ok({ user: mocks.actor }));
  mocks.invoke.mockResolvedValue(ok({ ip: '192.0.2.20' }));
  mocks.inserted.mockImplementation(async (table, value) => ok(table === 'pep_agreements' ? { id: 'new-pep', ...value } : { id: 'new-consent', created_at: value.signed_at, ...value }));
});
afterEach(cleanup);

describe('active legacy consent scope and historical evidence', () => {
  it('binds the selected enrollment to the exact learner and both histories to its organization', async () => {
    render(<StudentConsentForm {...props} />);
    await screen.findByText('Принять соглашение ПЭП');
    expect(mocks.reads.find(read => read.table === 'enrollments').filters).toEqual({ id: 'enrollment-a', user_id: 'student-a' });
    expect(mocks.reads.find(read => read.table === 'student_consents').filters).toEqual({ user_id: 'student-a', organization_id: 'org-a' });
    expect(mocks.reads.find(read => read.table === 'pep_agreements').filters).toEqual({ user_id: 'student-a', organization_id: 'org-a', agreement_version: 'v1.0' });
    expect(mocks.inserts).toEqual([]);
  });

  it('rejects a conflicting enrollment organization before reading any consent or agreement', async () => {
    render(<StudentConsentForm {...props} enrollmentId="enrollment-b" />);
    await screen.findByRole('alert');
    expect(mocks.reads.map(read => read.table)).toEqual(['enrollments']);
    expect(screen.getByText('Принять соглашение ПЭП').closest('button')).toBeDisabled();
    expect(mocks.inserts).toEqual([]);
  });

  it('does not guess from a latest unrelated enrollment or profile when no organization is selected', async () => {
    render(<StudentConsentForm {...props} organizationId="" enrollmentId={undefined} />);
    await screen.findByRole('alert'); expect(mocks.reads).toEqual([]);
    expect(screen.getByText('Подписать ПЭП').closest('button')).toBeDisabled();
  });

  it('resolves a missing organization only from the exact selected enrollment', async () => {
    render(<StudentConsentForm {...props} organizationId="" />);
    await screen.findByText('Принять соглашение ПЭП');
    expect(mocks.reads.filter(read => read.table === 'enrollments')).toHaveLength(1);
    expect(mocks.reads.find(read => read.table === 'pep_agreements').filters.organization_id).toBe('org-a');
  });

  it('clears an old accepted state immediately on organization change and ignores its late read', async () => {
    const old = deferred();
    mocks.respond = (read: any) => read.table === 'student_consents' && read.filters.organization_id === 'org-a' ? old.promise : defaults(read);
    const view = render(<StudentConsentForm {...props} />);
    await waitFor(() => expect(mocks.reads.some(read => read.table === 'student_consents')).toBe(true));
    view.rerender(<StudentConsentForm {...props} organizationId="org-b" enrollmentId="enrollment-b" />);
    await screen.findByText('Organization org-b');
    await act(async () => old.resolve(ok([signed('old-a')])));
    expect(screen.queryByText('Сохранена запись о согласии')).toBeNull();
    expect(screen.queryByText('Organization org-a')).toBeNull();
  });

  it('clears a prior acceptance on a failed next read and requires an explicit successful retry', async () => {
    mocks.respond = (read: any) => read.table === 'student_consents' ? ok([signed()]) : defaults(read);
    const view = render(<StudentConsentForm {...props} />); await screen.findByText('Сохранена запись о согласии');
    mocks.respond = (read: any) => read.table === 'pep_agreements' ? { data: null, error: { message: 'offline' } } : defaults(read);
    view.rerender(<StudentConsentForm {...props} organizationId="org-b" enrollmentId="enrollment-b" />);
    await screen.findByRole('alert'); expect(screen.queryByText('Сохранена запись о согласии')).toBeNull();
    expect(screen.getByText('Принять соглашение ПЭП').closest('button')).toBeDisabled();
    mocks.respond = defaults; fireEvent.click(screen.getByText('Повторить проверку'));
    await screen.findByText('Organization org-b');
    expect(screen.queryByRole('alert')).toBeNull(); expect(mocks.inserts).toEqual([]);
  });

  it('does not revive an obsolete result after an organization A to B to A transition', async () => {
    const old = deferred(); let first = true;
    mocks.respond = (read: any) => {
      if (read.table === 'student_consents' && read.filters.organization_id === 'org-a' && first) {
        first = false; return old.promise;
      }
      return defaults(read);
    };
    const view = render(<StudentConsentForm {...props} />);
    await waitFor(() => expect(mocks.reads.some(read => read.table === 'student_consents')).toBe(true));
    view.rerender(<StudentConsentForm {...props} organizationId="org-b" enrollmentId="enrollment-b" />);
    await screen.findByText('Organization org-b');
    view.rerender(<StudentConsentForm {...props} />); await screen.findByText('Organization org-a');
    await act(async () => old.resolve(ok([signed('obsolete-a')])));
    expect(screen.queryByText('Сохранена запись о согласии')).toBeNull(); expect(mocks.inserts).toEqual([]);
  });

  it('does not borrow a late self-auth email after switching into a staff preview', async () => {
    const old = deferred(); mocks.getUser.mockReturnValueOnce(old.promise);
    const view = render(<StudentConsentForm {...props} />);
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalledTimes(1));
    mocks.actor = { id: 'admin-a', email: 'ADMIN-PRIVATE@example.test' }; mocks.role = 'admin'; mocks.authRevision += 1;
    view.rerender(<StudentConsentForm {...props} />); await screen.findByText('Принять соглашение ПЭП');
    await act(async () => old.resolve(ok({ user: { id: 'student-a', email: 'OLD-SELF@example.test' } })));
    expect(screen.getByText('Принять соглашение ПЭП').closest('button')).toBeDisabled();
    expect(mocks.getUser).toHaveBeenCalledTimes(1); expect(mocks.inserts).toEqual([]);
  });

  it('keeps a staff preview read-only and never borrows the actor email for the learner', async () => {
    mocks.actor = { id: 'admin-a', email: 'ADMIN-PRIVATE@example.test' }; mocks.role = 'admin';
    render(<StudentConsentForm {...props} />); await screen.findByText('Принять соглашение ПЭП');
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(screen.getByText('Принять соглашение ПЭП').closest('button')).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.queryByText(/ADMIN-PRIVATE/)).toBeNull(); expect(mocks.inserts).toEqual([]);
  });

  it('shows the exact stored accepted agreement without generating a current substitute', async () => {
    mocks.respond = (read: any) => read.table === 'pep_agreements' ? ok(agreement()) : defaults(read);
    render(<StudentConsentForm {...props} />); await screen.findByText('IMMUTABLE ACCEPTED org-a');
    expect(mocks.generated).not.toHaveBeenCalled(); expect(mocks.inserts).toEqual([]);
  });

  it('preserves a historical consent record but cannot manufacture a signed PDF from the current template', async () => {
    mocks.respond = (read: any) => read.table === 'student_consents' ? ok([signed()]) : defaults(read);
    render(<StudentConsentForm {...props} />); await screen.findByText('Сохранена запись о согласии');
    expect(screen.getByText('Скачать согласие (PDF)').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByText('Скачать согласие (PDF)'));
    expect(mocks.pdf).not.toHaveBeenCalled(); expect(mocks.print).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('История согласий (1)'));
    expect(await screen.findByText('Stored Learner')).toBeTruthy(); expect(screen.getByText('OLD VERSION')).toBeTruthy();
  });

  it('does not insert after the organization changes while client IP is pending', async () => {
    const ip = deferred(); mocks.invoke.mockReturnValue(ip.promise);
    const view = render(<StudentConsentForm {...props} />); await screen.findByText('Принять соглашение ПЭП');
    fireEvent.click(screen.getByText('Принять соглашение ПЭП'));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    view.rerender(<StudentConsentForm {...props} organizationId="org-b" enrollmentId="enrollment-b" />);
    await screen.findByText('Organization org-b');
    await act(async () => ip.resolve(ok({ ip: '192.0.2.20' })));
    expect(mocks.inserts).toEqual([]); expect(mocks.success).not.toHaveBeenCalled();
  });

  it('cancels a pending consent when auth changes before a React rerender', async () => {
    const ip = deferred(); mocks.invoke.mockReturnValue(ip.promise);
    mocks.respond = (read: any) => read.table === 'pep_agreements' ? ok(agreement()) : defaults(read);
    render(<StudentConsentForm {...props} />); await screen.findByText('IMMUTABLE ACCEPTED org-a');
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Подписать ПЭП'));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    mocks.actor = { id: 'student-b', email: 'other@example.test' }; mocks.authRevision += 1;
    await act(async () => ip.resolve(ok({ ip: '192.0.2.20' })));
    expect(mocks.inserts).toEqual([]); expect(mocks.success).not.toHaveBeenCalled();
  });

  it('does not insert after unmount while the IP request is pending', async () => {
    const ip = deferred(); mocks.invoke.mockReturnValue(ip.promise);
    const view = render(<StudentConsentForm {...props} />); await screen.findByText('Принять соглашение ПЭП');
    fireEvent.click(screen.getByText('Принять соглашение ПЭП')); await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    view.unmount(); await act(async () => ip.resolve(ok({ ip: '192.0.2.20' })));
    expect(mocks.inserts).toEqual([]); expect(mocks.success).not.toHaveBeenCalled();
  });

  it('saves a new manual self acceptance only to the selected user, organization and enrollment', async () => {
    mocks.respond = (read: any) => read.table === 'pep_agreements' ? ok(agreement()) : defaults(read);
    const accepted = vi.fn(); render(<StudentConsentForm {...props} onConsent={accepted} />);
    await screen.findByText('IMMUTABLE ACCEPTED org-a');
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Подписать ПЭП'));
    await waitFor(() => expect(mocks.inserts).toHaveLength(1));
    expect(mocks.inserts[0]).toEqual({ table: 'student_consents', value: expect.objectContaining({ user_id: 'student-a', organization_id: 'org-a', enrollment_id: 'enrollment-a', email: 'self@example.test' }) });
    await waitFor(() => expect(accepted).toHaveBeenCalledTimes(1));
  });

  it('ignores completion of an old committed request after switching organization', async () => {
    const saved = deferred(); mocks.inserted.mockReturnValue(saved.promise);
    const accepted = vi.fn(); const view = render(<StudentConsentForm {...props} onConsent={accepted} />);
    await screen.findByText('Принять соглашение ПЭП'); fireEvent.click(screen.getByText('Принять соглашение ПЭП'));
    await waitFor(() => expect(mocks.inserts).toHaveLength(1));
    view.rerender(<StudentConsentForm {...props} organizationId="org-b" enrollmentId="enrollment-b" onConsent={accepted} />);
    await screen.findByText('Organization org-b');
    await act(async () => saved.resolve(ok(agreement('org-a'))));
    expect(screen.queryByText('IMMUTABLE ACCEPTED org-a')).toBeNull(); expect(mocks.success).not.toHaveBeenCalled(); expect(accepted).not.toHaveBeenCalled();
  });
});
