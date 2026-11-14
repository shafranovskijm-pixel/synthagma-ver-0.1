import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RtnNormativeEditorialPanel } from './RtnNormativeEditorialPanel';
import { RtnEditorialPanel } from './RtnEditorialPanel';
import { completeBasis50 } from './__fixtures__/rtn-complete-basis50';
import { approvalBlock, parseDeclaredBasis, validateWorkspace, type NormativeEditorialWorkspace } from '@/api/rtn-npa';

const mocks = vi.hoisted(() => ({ auth: null as any, getSession: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), editorialRead: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.getSession }, rpc: mocks.rpc, functions: { invoke: mocks.invoke } } }));
vi.mock('@/api/rtn-editorial', () => ({ getRtnEditorial: mocks.editorialRead, openRtnPaidRollout: vi.fn(), publishRtnModule: vi.fn(), reviewRtnModule: vi.fn(), rtnEditorialWorker: vi.fn() }));
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherActor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const org = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const bankId = '33333333-3333-4333-8333-333333333333';
const configId = '44444444-4444-4444-8444-444444444444';
const releaseId = '55555555-5555-4555-8555-555555555555';
const manifestId = '66666666-6666-4666-8666-666666666666';
const h = 'a'.repeat(64);
function auth(role = 'admin', id = actor) { return { user: { id }, session: { user: { id }, access_token: 'test-fixture-session-only' }, userRole: role, loading: false, authError: null }; }
function artifact(question = false) { return { path: `npa250/${runId}/${h}.json`, sha256: h, bytes: 100, http_status: 200, transport: question ? 'https' : 'http',
  request_url: question ? 'https://www.gosnadzor.ru/source.pdf' : 'http://actual.pravo.gov.ru:8000/api/ebpi/redactions/', received_at: '2026-11-14T15:59:00Z' }; }
function workspace(): NormativeEditorialWorkspace {
  const identity = { country: 'RU' as const, kind: 'FederalLaw', date: '1997-07-21', number: '116-ФЗ', title: 'О промышленной безопасности', docid: 38355, dochash: h };
  return { server_time: '2026-11-14T16:00:00Z', banks: [{ bank_id: bankId, code: 'A.1', title: 'Набор А.1', release_id: releaseId,
    configuration: { id: configId, version: 1, release_id: releaseId, context_sha256: h, basis: [identity], discovery_from: '2026-09-01', created_at: '2026-11-14T15:00:00Z' },
    manifest: { id: manifestId, version: 1, stable_sha256: h, approved_at: '2026-11-14T15:00:00Z', hard_stop_at: null, acknowledged_epoch: 0, run_id: runId },
    admission: { allowed: true, normative_status: 'current', admission_basis: 'manual_review', normative_cutoff_at: '2026-11-21T00:00:00+03:00', reasons: [], finding_epoch: 2, latest_check_status: 'completed', latest_check_at: '2026-11-14T15:59:00Z' },
    latest_check: { id: runId, status: 'completed', configuration_id: configId, release_id: releaseId, key_set_id: 'key', manifest_id: manifestId, manifest_version: 1,
      context_sha256: h, finding_epoch: 2, queued_at: '2026-11-14T15:58:00Z', completed_at: '2026-11-14T15:59:00Z', outcome: 'unchanged', error_code: null,
      proof_full: true, reason_codes: [], can_approve: true,
      discovery_evidence: { source: 'publication-pravo-federal-laws', from: '2026-09-01', to_exclusive: '2026-11-15', complete: true, relevance_complete: true,
        reported_total: 0, pages: [{ index: 1, reported_total: 0, publication_ids: [], artifact: { ...artifact(), request_url: 'http://publication.pravo.gov.ru/search' } }],
        unresolved_candidates: [], resolved_publications: [], error_code: null }, observations: [
        { identity_key: 'RU:116', identity, projection_sha256: h, fetched_at: '2026-11-14T15:59:00Z', stable: { identity,
          current: { redid: 477797, effective_from: '2026-09-01', actual: true, official: true, checked: true, redcompleted: true, hascontent: true, contentcomplete: true, text_sha256: h },
          graph: { canonical: {}, future_editions: [] } }, artifacts: { identity: artifact(), redactions: artifact(), redtext: artifact(), card: artifact() } },
        { identity_key: 'question-source', stable: { sha256: h }, artifacts: artifact(true), exact_context: true } ] }, check_runs: [], pending_findings: [] }] };
}
let current: NormativeEditorialWorkspace;
const clients: QueryClient[] = [];
function mount(organizationId = org) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  return render(<RtnNormativeEditorialPanel organizationId={organizationId} />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
function mountIntegrated() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  return render(<RtnEditorialPanel organizationId={org} />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
async function selectBank() {
  fireEvent.click(screen.getByRole('button', { name: 'Нормативные основания · администратор' }));
  await screen.findByLabelText('Учебный нормативный набор');
  fireEvent.change(screen.getByLabelText('Учебный нормативный набор'), { target: { value: bankId } });
  await screen.findByLabelText('Проверенный полный перечень нормативных оснований этого набора');
}
function calls(name: string) { return mocks.rpc.mock.calls.filter(c => c[0] === name); }
beforeEach(() => {
  current = workspace(); mocks.auth = auth(); mocks.getSession.mockReset(); mocks.rpc.mockReset(); mocks.invoke.mockReset();
  mocks.editorialRead.mockReset(); mocks.editorialRead.mockResolvedValue({ sources: [], banks: [], source_revisions: [], bank_revisions: [], key_sets: [], releases: [] });
  mocks.invoke.mockResolvedValue({ data: { run_id: runId, status: 'queued', queued_at: '2026-11-14T16:00:00Z' }, error: null });
  mocks.getSession.mockImplementation(async () => ({ data: { session: mocks.auth.session }, error: null }));
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'get_rtn_npa_editorial_workspace') return { data: structuredClone(current), error: null };
    if (name === 'configure_rtn_npa_basis') return { data: { configuration_id: configId, version: 2, basis: current.banks[0].configuration!.basis, supported_count: 1, unsupported_count: 0, replayed: false }, error: null };
    if (name === 'approve_rtn_npa_manifest') return { data: { manifest_id: manifestId, version: 2, stable_sha256: h, hard_stop_at: null, admission: current.banks[0].admission, replayed: false }, error: null };
    if (name === 'acknowledge_rtn_npa_manual_review') return { data: { review_id: 'review', acknowledged_epoch: 2, admission: current.banks[0].admission, replayed: false }, error: null };
    throw new Error('Unexpected RPC ' + name);
  });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); vi.restoreAllMocks(); });

describe('Actual-auth normative editorial candidate', () => {
  it.each(['student', 'organization', 'company', 'sales_manager', null])('never reads or renders for role %s', async role => {
    mocks.auth = auth(role as string); const mounted = mount();
    expect(mounted.container).toBeEmptyDOMElement(); expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.getSession).not.toHaveBeenCalled();
  });
  it('fails closed for auth loading, error, missing session and a mismatched session actor', () => {
    const mounted = mount();
    for (const extra of [{ loading: true }, { authError: 'ROLE_UNAVAILABLE' }, { session: null }, { session: { user: { id: otherActor }, access_token: 'fixture' } }]) {
      mocks.auth = { ...auth(), ...extra }; mounted.rerender(<RtnNormativeEditorialPanel organizationId={org} />); expect(mounted.container).toBeEmptyDOMElement();
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('uses the genuine session RPC, without a browser actor claim or worker capability', async () => {
    mount(); await selectBank();
    expect(mocks.getSession).toHaveBeenCalled(); expect(calls('get_rtn_npa_editorial_workspace')[0][1]).toEqual({});
    expect(mocks.rpc.mock.calls.some(c => /claim|complete/.test(c[0]))).toBe(false);
    mocks.auth.session = { user: { id: otherActor }, access_token: 'other-fixture' };
    fireEvent.change(screen.getByLabelText('Основание изменения состава'), { target: { value: 'Состав нормативных оснований проверен' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить новый состав оснований' }));
    expect(await screen.findByText('Действия закрыты до повторной проверки прав и загрузки данных.')).toBeInTheDocument();
    expect(calls('configure_rtn_npa_basis')).toHaveLength(0);
  });
  it('does not show a late previous-actor response after actor and organisation switching', async () => {
    let finish!: (v: unknown) => void;
    mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const mounted = mount(); fireEvent.click(screen.getByRole('button', { name: 'Нормативные основания · администратор' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    mocks.auth = auth('admin', otherActor);
    current.banks[0].title = 'Новый контекст';
    mounted.rerender(<RtnNormativeEditorialPanel organizationId="new-org" />);
    expect(screen.queryByLabelText('Проверенный полный перечень нормативных оснований этого набора')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Нормативные основания · администратор' }));
    await screen.findByRole('option', { name: /Новый контекст/ });
    const old = workspace(); old.banks[0].title = 'Чужой старый контекст'; finish({ data: old, error: null });
    await waitFor(() => expect(screen.queryByRole('option', { name: /Чужой старый контекст/ })).not.toBeInTheDocument());
  });
  it('resets the form when only the organisation changes under the same genuine admin', async () => {
    const mounted = mount(); await selectBank();
    fireEvent.change(screen.getByLabelText('Основание изменения состава'), { target: { value: 'Черновик прежней организации' } });
    mounted.rerender(<RtnNormativeEditorialPanel organizationId="another-org" />);
    expect(screen.queryByLabelText('Проверенный полный перечень нормативных оснований этого набора')).not.toBeInTheDocument();
    await selectBank(); expect(screen.getByLabelText('Основание изменения состава')).toHaveValue('');
    expect(calls('configure_rtn_npa_basis')).toHaveLength(0);
  });
  it('works through React strict effect cleanup without leaving an aborted session controller', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
    render(<React.StrictMode><QueryClientProvider client={client}><RtnNormativeEditorialPanel organizationId={org} /></QueryClientProvider></React.StrictMode>);
    await selectBank(); fireEvent.change(screen.getByLabelText('Основание изменения состава'), { target: { value: 'Состав проверен в текущем контексте' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить новый состав оснований' }));
    await waitFor(() => expect(calls('configure_rtn_npa_basis')).toHaveLength(1));
  });
  it('removes all cached controls on a failed permission read and resets a removed bank', async () => {
    mount(); await selectBank();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    fireEvent.click(screen.getByRole('button', { name: 'Обновить данные и сбросить форму' }));
    await screen.findByRole('alert'); expect(screen.queryByLabelText('Проверенный полный перечень нормативных оснований этого набора')).not.toBeInTheDocument();
    current.banks = []; fireEvent.click(screen.getByRole('button', { name: 'Повторить чтение нормативных данных' }));
    await screen.findByText('Нормативные наборы пока не зарегистрированы.');
    expect(screen.getByLabelText('Учебный нормативный набор')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Сохранить новый состав оснований' })).not.toBeInTheDocument();
  });
  it('freezes UUID and every parameter across an uncertain configure result, preventing double submit', async () => {
    let reject!: (e: Error) => void; let attempts = 0;
    const fallback = mocks.rpc.getMockImplementation();
    mocks.rpc.mockImplementation((name: string, args: unknown) => {
      if (name === 'configure_rtn_npa_basis' && attempts++ === 0) return new Promise((_resolve, no) => { reject = no; });
      return fallback!(name, args);
    });
    mount(); await selectBank();
    fireEvent.change(screen.getByLabelText('Основание изменения состава'), { target: { value: 'Проверен полный состав нормативных оснований' } });
    const button = screen.getByRole('button', { name: 'Сохранить новый состав оснований' }); fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(calls('configure_rtn_npa_basis')).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Нормативные основания · администратор' })).toBeDisabled();
    expect(screen.getByLabelText('Учебный нормативный набор')).toBeDisabled();
    const frozen = calls('configure_rtn_npa_basis')[0][1];
    expect(frozen).toMatchObject({ p_expected_release_id: releaseId, p_expected_configuration_id: configId });
    reject(new Error('network lost after commit is possible'));
    await screen.findByRole('alert'); expect(screen.getByLabelText('Основание изменения состава')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Нормативные основания · администратор' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить тот же сохранённый запрос' }));
    await waitFor(() => expect(calls('configure_rtn_npa_basis')).toHaveLength(2));
    expect(calls('configure_rtn_npa_basis')[1][1]).toEqual(frozen);
    expect(Object.keys(frozen)).not.toContain('actor_id'); expect(Object.keys(frozen)).not.toContain('checked_at');
  });
  it('does not silently rebind a basis prepared for release A to a newly observed release B', async () => {
    mount(); await selectBank();
    fireEvent.change(screen.getByLabelText('Основание изменения состава'), { target: { value: 'Состав проверен для учебного выпуска A' } });
    const editedBasis = (screen.getByLabelText('Проверенный полный перечень нормативных оснований этого набора') as HTMLTextAreaElement).value;
    const next = structuredClone(current); next.banks[0].release_id = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
    clients[0].setQueryData(['rtn-npa-editorial', actor, org], next);
    await screen.findByText(/Контекст формы изменился/);
    expect(screen.getByRole('button', { name: 'Сохранить новый состав оснований' })).toBeDisabled();
    expect(screen.getByLabelText('Проверенный полный перечень нормативных оснований этого набора')).toHaveValue(editedBasis);
    expect(screen.getByLabelText('Основание изменения состава')).toHaveValue('Состав проверен для учебного выпуска A');
    expect(calls('configure_rtn_npa_basis')).toHaveLength(0);
    current = next; fireEvent.click(screen.getByRole('button', { name: 'Обновить данные и сбросить форму' }));
    await waitFor(() => expect(screen.getByLabelText('Основание изменения состава')).toHaveValue(''));
    fireEvent.change(screen.getByLabelText('Основание изменения состава'), { target: { value: 'Состав заново проверен для учебного выпуска B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить новый состав оснований' }));
    await waitFor(() => expect(calls('configure_rtn_npa_basis')).toHaveLength(1));
    expect(calls('configure_rtn_npa_basis')[0][1]).toMatchObject({ p_expected_release_id: next.banks[0].release_id });
  });
  it('requires explicit reload after CAS and starts a fresh form using the new configuration', async () => {
    const fallback = mocks.rpc.getMockImplementation();
    mocks.rpc.mockImplementation((name: string, args: unknown) => name === 'configure_rtn_npa_basis'
      ? Promise.resolve({ data: null, error: { code: '40001', message: 'configuration_changed' } }) : fallback!(name, args));
    mount(); await selectBank(); fireEvent.change(screen.getByLabelText('Основание изменения состава'), { target: { value: 'Первый проверенный состав документов' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить новый состав оснований' }));
    await screen.findByText(/Нормативный контекст изменился/);
    expect(screen.queryByRole('button', { name: 'Повторить тот же сохранённый запрос' })).not.toBeInTheDocument();
    current.banks[0].configuration!.id = '77777777-7777-4777-8777-777777777777';
    fireEvent.click(screen.getByRole('button', { name: 'Обновить данные и сбросить форму' }));
    await waitFor(() => expect(screen.getByLabelText('Основание изменения состава')).toHaveValue(''));
    expect(screen.getByRole('button', { name: 'Сохранить новый состав оснований' })).toBeDisabled();
  });
  it('does not trap a definitively rejected SQL transaction in the uncertain retry state', async () => {
    const fallback = mocks.rpc.getMockImplementation();
    mocks.rpc.mockImplementation((name: string, args: unknown) => name === 'configure_rtn_npa_basis'
      ? Promise.resolve({ data: null, error: { code: '22023', message: 'rtn_npa_duplicate_basis' } }) : fallback!(name, args));
    mount(); await selectBank(); fireEvent.change(screen.getByLabelText('Основание изменения состава'), { target: { value: 'Проверен полный состав документов' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить новый состав оснований' }));
    await screen.findByText(/Сервер отклонил действие/);
    expect(screen.queryByRole('button', { name: 'Повторить тот же сохранённый запрос' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Обновить данные и сбросить форму' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Обновить данные и сбросить форму' }));
    await waitFor(() => expect(screen.getByLabelText('Основание изменения состава')).toHaveValue(''));
  });
  it.each(['queued', 'running'])('reports %s as progress, never as completed success', async status => {
    current.banks[0].latest_check!.status = status as 'queued' | 'running';
    current.banks[0].latest_check!.completed_at = null; mount(); await selectBank();
    expect(screen.getByText(/Актуальность ещё не подтверждена/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Утвердить сверенный нормативный состав' })).toBeDisabled();
  });
  it('does not accept partial or missing artifact proof even when can_approve is erroneously true', async () => {
    const b = current.banks[0];
    expect(approvalBlock(b, b.latest_check, current.server_time)).toBeNull();
    (b.latest_check!.observations[0] as any).artifacts.redtext = null;
    expect(approvalBlock(b, b.latest_check, current.server_time)).toMatch(/первичных файлов/);
    mount(); await selectBank(); expect(screen.getByRole('button', { name: 'Утвердить сверенный нормативный состав' })).toBeDisabled();
    expect(calls('approve_rtn_npa_manifest')).toHaveLength(0);
  });
  it('shows unsupported dependencies explicitly and never treats one checked law as a complete mixed basis', async () => {
    current.banks[0].configuration!.basis.push({ country: 'RU', kind: 'GovernmentResolution', date: '2021-06-30', number: '1087', title: 'Положение о строительном надзоре' });
    current.banks[0].configuration!.basis.push({ country: 'RU', kind: 'FederalLaw', date: '2009-12-30', number: '384-ФЗ', title: 'Технический регламент о безопасности зданий и сооружений', docid: 401001 });
    mount(); await selectBank();
    expect(screen.getByText('Документы без автоматического продления:')).toBeInTheDocument();
    expect(screen.getByText(/Положение о строительном надзоре · 2021-06-30 № 1087/)).toBeInTheDocument();
    expect(screen.getByText(/384-ФЗ \(FederalLaw\)/)).toBeInTheDocument();
    expect(screen.getByText(/автоматический адаптер проверяет только 116-ФЗ от 21.07.1997/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Утвердить сверенный нормативный состав' })).toBeDisabled();
    expect(calls('approve_rtn_npa_manifest')).toHaveLength(0);
  });
  it('rejects stale configuration, manifest, epoch, latest run and expired completed evidence', () => {
    for (const mutate of [
      (b: any) => { b.latest_check.configuration_id = 'other'; },
      (b: any) => { b.configuration.release_id = 'previous-release'; },
      (b: any) => { b.configuration.context_sha256 = 'b'.repeat(64); },
      (b: any) => { b.latest_check.manifest_id = null; },
      (b: any) => { b.latest_check.finding_epoch = 1; },
      (b: any) => { b.latest_check.completed_at = '2026-11-14T15:40:00Z'; },
      (b: any) => { b.latest_check.proof_full = false; },
      (b: any) => { b.latest_check.outcome = 'partial_coverage'; },
      (b: any) => { b.latest_check.observations[1].exact_context = false; },
      (b: any) => { b.latest_check.discovery_evidence = null; },
      (b: any) => { b.latest_check.discovery_evidence.relevance_complete = false; },
      (b: any) => { b.latest_check.discovery_evidence.unresolved_candidates = ['0001202604090035']; },
      (b: any) => { b.latest_check.discovery_evidence.reported_total = 1; },
      (b: any) => { b.latest_check.observations[0].stable.current.effective_from = '2026-02-31'; },
    ]) { const w = workspace(); mutate(w.banks[0]); expect(approvalBlock(w.banks[0], w.banks[0].latest_check, w.server_time)).not.toBeNull(); }
    const w = workspace(); expect(approvalBlock(w.banks[0], { ...w.banks[0].latest_check!, id: 'old' }, w.server_time)).not.toBeNull();
  });
  it('requires the immutable binding and never invents an omitted official identity', () => {
    const w = workspace(); delete (w.banks[0].configuration as any).context_sha256;
    expect(() => validateWorkspace(w)).toThrow(/неполные данные/);
    const basis = workspace().banks[0].configuration!.basis; delete basis[0].docid;
    expect(parseDeclaredBasis(JSON.stringify(basis))[0]).not.toHaveProperty('docid');
    basis[0].docid = 38355; basis[0].date = '2026-02-31';
    expect(() => parseDeclaredBasis(JSON.stringify(basis))).toThrow();
  });
  it('shows exact116 with an omitted identifier as unverified and never enables automatic approval', async () => {
    delete current.banks[0].configuration!.basis[0].docid;
    // Even a contradictory old can_approve flag must not turn unknown identity
    // metadata into complete automatic proof in the browser.
    expect(current.banks[0].latest_check!.proof_full).toBe(true);
    expect(current.banks[0].latest_check!.can_approve).toBe(true);
    expect(approvalBlock(current.banks[0], current.banks[0].latest_check, current.server_time)).toMatch(/не установлен официальный идентификатор/);
    mount(); await selectBank();
    expect(screen.getByText(/Метаданные без идентификатора не проверены автоматически/)).toBeInTheDocument();
    expect(screen.getByText(/Сейчас автоматический адаптер проверяет только 116-ФЗ/)).toHaveTextContent('подтверждённым идентификатором 38355');
    expect(screen.getByText(/О промышленной безопасности.*идентификатор не установлен/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Утвердить сверенный нормативный состав' })).toBeDisabled();
    expect(screen.getByText('2026-11-21T00:00:00+03:00')).toBeInTheDocument();
    expect(calls('approve_rtn_npa_manifest')).toHaveLength(0);
  });
  it('sends the complete50 as a dependency draft with unknown IDs omitted and no optimistic approval or extension', async () => {
    const basis = parseDeclaredBasis(JSON.stringify(completeBasis50)); const fallback = mocks.rpc.getMockImplementation();
    mocks.rpc.mockImplementation(async (name: string, args: unknown) => {
      if (name === 'configure_rtn_npa_basis') {
        current.banks[0].configuration = { ...current.banks[0].configuration!, id: 'new-config50', version: 2, basis };
        const supportedSyntax = basis.filter(b => b.kind === 'FederalLaw' && b.docid !== undefined).length;
        return { data: { configuration_id: 'new-config50', version: 2, basis, supported_count: supportedSyntax, unsupported_count: 50 - supportedSyntax, replayed: false }, error: null };
      }
      return fallback!(name, args);
    });
    mount(); await selectBank();
    fireEvent.change(screen.getByLabelText('Проверенный полный перечень нормативных оснований этого набора'), { target: { value: JSON.stringify(completeBasis50) } });
    fireEvent.change(screen.getByLabelText('Основание изменения состава'), { target: { value: 'Полный список проверен; неизвестные идентификаторы не подставлялись' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить новый состав оснований' }));
    await screen.findByText(/Состав оснований сохранён. Это не утверждение и не продление срока/);
    const args = calls('configure_rtn_npa_basis')[0][1]; expect(args.p_basis).toEqual(basis);
    expect(args.p_basis.find((b: any) => b.number === '126-ФЗ' && b.date === '2026-05-02')).not.toHaveProperty('docid');
    await screen.findByText(/Метаданные без идентификатора не проверены автоматически/);
    expect(screen.getByRole('button', { name: 'Утвердить сверенный нормативный состав' })).toBeDisabled();
    expect(screen.getByText('2026-11-21T00:00:00+03:00')).toBeInTheDocument();
    expect(calls('approve_rtn_npa_manifest')).toHaveLength(0); expect(calls('acknowledge_rtn_npa_manual_review')).toHaveLength(0);
  });
  it('cannot reuse one confirmed law observation for a second configured identity', () => {
    const w = workspace(); const b = w.banks[0];
    b.configuration!.basis.push({ country: 'RU', kind: 'FederalLaw', date: '2011-05-04', number: '99-ФЗ', title: 'О лицензировании', docid: 146266 });
    const repeated = structuredClone(b.latest_check!.observations[0]) as any;
    repeated.identity_key = 'RU:99';
    b.latest_check!.observations.push(repeated);
    expect(approvalBlock(b, b.latest_check, w.server_time)).toMatch(/Не все текущие редакции/);
  });
  it('permits genuine first bootstrap unknown only with complete current proof and authoritative can_approve', async () => {
    const b = current.banks[0]; b.manifest = null;
    Object.assign(b.latest_check!, { manifest_id: null, manifest_version: 0, outcome: 'unknown' });
    expect(approvalBlock(b, b.latest_check, current.server_time)).toBeNull();
    b.latest_check!.proof_full = false; expect(approvalBlock(b, b.latest_check, current.server_time)).not.toBeNull();
    b.latest_check!.proof_full = true; b.latest_check!.can_approve = false; expect(approvalBlock(b, b.latest_check, current.server_time)).not.toBeNull();
    b.latest_check!.can_approve = true;
    mount(); await selectBank(); fireEvent.click(screen.getByText('Официальные подтверждения последней проверки'));
    fireEvent.click(screen.getByLabelText('Я прочитал подтверждения и проверил применимость к текущей учебной редакции'));
    fireEvent.change(screen.getByLabelText('Заключение сверки нормативного состава'), { target: { value: 'Первый полный состав и первичные подтверждения проверены' } });
    fireEvent.click(screen.getByRole('button', { name: 'Утвердить сверенный нормативный состав' }));
    await waitFor(() => expect(calls('approve_rtn_npa_manifest')).toHaveLength(1));
    expect(calls('approve_rtn_npa_manifest')[0][1]).toMatchObject({ p_expected_manifest_id: null, p_run_id: runId });
  });
  it('accepts a resolved primary redtext artifact while keeping discovery search pages on the publication endpoint', () => {
    const w = workspace(); const b = w.banks[0]; const d = b.latest_check!.discovery_evidence as any;
    d.reported_total = 1; d.pages[0].reported_total = 1; d.pages[0].publication_ids = ['0001202604090035'];
    d.resolved_publications = [{ publication_id: '0001202604090035', relation: 'known_changing_act', basis_docids: [38355], graph_reference_ids: ['ref94'],
      artifact: { ...artifact(), request_url: 'http://actual.pravo.gov.ru:8000/api/ebpi/redtext?docid=38355' } }];
    expect(approvalBlock(b, b.latest_check, w.server_time)).toBeNull();
    d.resolved_publications[0].artifact.request_url = 'https://example.org/document/0001202604090035';
    expect(approvalBlock(b, b.latest_check, w.server_time)).not.toBeNull();
    d.resolved_publications[0].artifact.request_url = 'http://publication.pravo.gov.ru/document/0001202604090035';
    expect(approvalBlock(b, b.latest_check, w.server_time)).toBeNull();
    d.pages[0].artifact.request_url = 'http://actual.pravo.gov.ru:8000/api/ebpi/redtext?docid=38355';
    expect(approvalBlock(b, b.latest_check, w.server_time)).not.toBeNull();
  });
  it('approves only read, fresh, complete evidence and sends the exact server context CAS', async () => {
    mount(); await selectBank();
    const approve = screen.getByRole('button', { name: 'Утвердить сверенный нормативный состав' }); expect(approve).toBeDisabled();
    fireEvent.click(screen.getByText('Официальные подтверждения последней проверки'));
    fireEvent.click(screen.getByLabelText('Я прочитал подтверждения и проверил применимость к текущей учебной редакции'));
    fireEvent.change(screen.getByLabelText('Заключение сверки нормативного состава'), { target: { value: 'Проверены все документы, применимость и учебная редакция' } });
    fireEvent.click(approve); fireEvent.click(approve);
    await waitFor(() => expect(calls('approve_rtn_npa_manifest')).toHaveLength(1));
    expect(calls('get_rtn_npa_editorial_workspace').length).toBeGreaterThanOrEqual(2);
    const args = calls('approve_rtn_npa_manifest')[0][1];
    expect(args).toMatchObject({ p_bank_id: bankId, p_run_id: runId, p_expected_configuration_id: configId, p_expected_manifest_id: manifestId, p_expected_finding_epoch: 2 });
    expect(args).not.toHaveProperty('valid_until'); expect(args).not.toHaveProperty('checked_at'); expect(args).not.toHaveProperty('outcome');
  });
  it('requires reading evidence again if the fresh approval read sees another configuration', async () => {
    mount(); await selectBank();
    fireEvent.click(screen.getByText('Официальные подтверждения последней проверки'));
    fireEvent.click(screen.getByLabelText('Я прочитал подтверждения и проверил применимость к текущей учебной редакции'));
    fireEvent.change(screen.getByLabelText('Заключение сверки нормативного состава'), { target: { value: 'Подтверждения прочитаны в исходном контексте' } });
    current.banks[0].configuration!.id = 'new-configuration';
    fireEvent.click(screen.getByRole('button', { name: 'Утвердить сверенный нормативный состав' }));
    await screen.findByText(/Последняя проверка или нормативный контекст изменились/);
    expect(calls('approve_rtn_npa_manifest')).toHaveLength(0);
  });
  it('manual acknowledgement needs a public source and cannot submit any renewal deadline', async () => {
    mount(); await selectBank();
    const button = screen.getByRole('button', { name: 'Сохранить ручную отметку без продления' }); expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Публичная ссылка на прочитанный первоисточник'), { target: { value: 'https://example.org/object/sign/student-documents/a?token=private' } });
    fireEvent.change(screen.getByLabelText('Документ и проверенный пункт'), { target: { value: '116-ФЗ, статья 9' } });
    fireEvent.change(screen.getByLabelText('Заключение ручной проверки'), { target: { value: 'Положения проверены по первоисточнику' } }); expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Публичная ссылка на прочитанный первоисточник'), { target: { value: 'http://publication.pravo.gov.ru/document/0001202604090035' } });
    expect(button).toBeDisabled();
    expect(screen.getByText(/может восстановить допуск в пределах оставшегося срока/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Я предметно проверил все показанные текущие изменения этого набора и подтверждаю их применимость'));
    fireEvent.click(button); await waitFor(() => expect(calls('acknowledge_rtn_npa_manual_review')).toHaveLength(1));
    expect(calls('acknowledge_rtn_npa_manual_review')[0][1]).toMatchObject({ p_release_id: releaseId, p_expected_finding_epoch: 2, p_evidence: [{ url: 'http://publication.pravo.gov.ru/document/0001202604090035', citation: '116-ФЗ, статья 9' }] });
    expect(Object.keys(calls('acknowledge_rtn_npa_manual_review')[0][1]).some(k => /deadline|expiry|cutoff|checked_at|until/.test(k))).toBe(false);
    expect(screen.getByText(/не добавляет семь дней/)).toBeInTheDocument();
    expect(screen.getByText('2026-11-21T00:00:00+03:00')).toBeInTheDocument();
  });
  it('queues through the genuine-user Edge editorial mode and does not declare a successful check', async () => {
    current.banks[0].latest_check = null;
    mount(); await selectBank(); fireEvent.click(screen.getByRole('button', { name: 'Проверить нормативные источники сейчас' }));
    await screen.findByText('Проверка поставлена в очередь. Это ещё не подтверждение актуальности.');
    expect(mocks.invoke).toHaveBeenCalledWith('rtn-npa-check', expect.objectContaining({ body: { operation: 'editorial', bankId } }));
    expect(calls('request_rtn_npa_editorial_check')).toHaveLength(0);
    expect(mocks.rpc.mock.calls.some(c => /claim|complete/.test(c[0]))).toBe(false);
  });
  it('reloads actual completed evidence when the Edge reuses a recent check without claiming an unchanged outcome', async () => {
    current.banks[0].latest_check = null;
    mocks.invoke.mockResolvedValue({ data: { run_id: runId, status: 'completed', queued_at: '2026-11-14T15:58:00Z' }, error: null });
    mount(); await selectBank(); const reads = calls('get_rtn_npa_editorial_workspace').length;
    fireEvent.click(screen.getByRole('button', { name: 'Проверить нормативные источники сейчас' }));
    await screen.findByText('Недавняя проверка уже выполнена. Обновляю фактический результат.');
    await waitFor(() => expect(calls('get_rtn_npa_editorial_workspace').length).toBeGreaterThan(reads));
    expect(screen.getByText('Проверок пока нет.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Утвердить сверенный нормативный состав' })).toBeDisabled();
    expect(calls('approve_rtn_npa_manifest')).toHaveLength(0);
  });
  it('preserves the frozen request across an enclosing editorial read error and prevents ancestor collapse', async () => {
    const fallback = mocks.rpc.getMockImplementation(); let reject!: (e: Error) => void; let attempts = 0;
    mocks.rpc.mockImplementation((name: string, args: unknown) => {
      if (name === 'configure_rtn_npa_basis' && attempts++ === 0) return new Promise((_resolve, no) => { reject = no; });
      return fallback!(name, args);
    });
    mountIntegrated(); const enclosing = screen.getByRole('button', { name: 'Редакции и предметная проверка · администратор' });
    fireEvent.click(enclosing); await screen.findByRole('textbox', { name: 'Проверенный пакет JSON' }); await selectBank();
    fireEvent.change(screen.getByLabelText('Основание изменения состава'), { target: { value: 'Проверен полный состав для выбранной редакции' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить новый состав оснований' }));
    await waitFor(() => expect(calls('configure_rtn_npa_basis')).toHaveLength(1)); const frozen = calls('configure_rtn_npa_basis')[0][1];
    expect(enclosing).toBeDisabled(); reject(new Error('Lost response after possible commit'));
    await screen.findByRole('button', { name: 'Повторить тот же сохранённый запрос' }); expect(enclosing).toBeDisabled();
    mocks.editorialRead.mockRejectedValueOnce(new Error('Общие редакции временно недоступны'));
    await clients[0].invalidateQueries({ queryKey: ['rtn-editorial', actor] });
    await screen.findByText('Общие редакции временно недоступны');
    expect(screen.getByLabelText('Основание изменения состава')).toBeDisabled(); expect(enclosing).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить тот же сохранённый запрос' }));
    await waitFor(() => expect(calls('configure_rtn_npa_basis')).toHaveLength(2));
    expect(calls('configure_rtn_npa_basis')[1][1]).toEqual(frozen);
  });
  it('resets the nested normative editor when the real enclosing organisation scope changes', async () => {
    const mounted = mountIntegrated(); fireEvent.click(screen.getByRole('button', { name: 'Редакции и предметная проверка · администратор' }));
    await screen.findByRole('textbox', { name: 'Проверенный пакет JSON' }); await selectBank();
    fireEvent.change(screen.getByLabelText('Основание изменения состава'), { target: { value: 'Только прежний организационный контекст' } });
    mounted.rerender(<RtnEditorialPanel organizationId="new-organization-context" />);
    expect(screen.queryByLabelText('Проверенный полный перечень нормативных оснований этого набора')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Редакции и предметная проверка · администратор' })).toHaveAttribute('aria-expanded', 'false');
    expect(calls('configure_rtn_npa_basis')).toHaveLength(0);
  });
});
