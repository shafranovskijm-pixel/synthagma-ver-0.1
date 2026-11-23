import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { actor, enrollment, group, id, list, org, pupil, row, source } from '@/lib/documentChain/__tests__/fixtures';
const m = vi.hoisted(() => ({ allowed: true, actorId: '', model: null as any, hook: vi.fn(), refresh: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: m.actorId }, loading: false }) }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineActor: () => 1 }));
vi.mock('@/hooks/useStaffPermissions', () => ({ useStaffPermissions: () => ({ loading: false, error: null, can: () => m.allowed, organizationId: '00000000-0000-4000-8000-000000000001', orgRole: 'staff' }) }));
vi.mock('@/hooks/useDocumentChain', () => ({ useDocumentChain: (...args: unknown[]) => { m.hook(...args); return m.model; } }));
vi.mock('@/components/organization/documents/DocumentChainSourceDialog', () => ({ DocumentChainSourceDialog: ({ query }: any) => query ? <div data-testid="source-dialog">Источник выбран</div> : null }));
vi.mock('@/components/organization/documents/AdmissionDocumentSettingsPanel', () => ({ AdmissionDocumentSettingsPanel: () => <div>Настройки точного приказа</div> }));
import { StudentDocumentChain } from '../StudentDocumentChain';
function Location() { const location = useLocation(); return <output data-testid="location">{location.search}</output>; }
function open(path = `/organization?tab=student-details&studentId=${pupil}&studentSection=documents`) {
  return render(<MemoryRouter initialEntries={[path]}><StudentDocumentChain organizationId={org} studentUserId={pupil} enrollments={[{ id: enrollment, course_id: id(5), course_title: 'Тестовая программа' }]} /><Location /></MemoryRouter>);
}
beforeEach(() => { vi.clearAllMocks(); m.allowed = true; m.actorId = actor; const data = list(); m.model = { key: 'test', loading: false, error: null, data, rows: data.rows, loadingMore: false, loadMore: vi.fn(), refresh: m.refresh }; });
describe('student document chain', () => {
  it('shows the three document states and one next action for missing group facts', () => {
    const admission = m.model.rows[0].admission_order;
    Object.assign(admission, { state: 'needs_information', why: 'Выберите группу для этого обучения.', why_code: 'ambiguous_group', next_action: { kind: 'choose_group', enrollment_id: enrollment }, capabilities: { can_open: false, can_continue: true } });
    open(); expect(screen.getByText('Приказ о зачислении')).toBeInTheDocument(); expect(screen.getByText('Приказ об отчислении')).toBeInTheDocument(); expect(screen.getByText('Документ об обучении')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Открыть приказ' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать группу' }));
    expect(screen.getByTestId('location').textContent).toContain('documentChainFocus=admission_settings'); expect(screen.getByText('Настройки точного приказа')).toBeInTheDocument();
  });
  it('opens the registered immutable order rather than a locked draft', () => {
    Object.assign(m.model.rows[0].admission_order, { state: 'registered', why: null, number: 'ПР-1', source: source().source, capabilities: { can_open: true, can_continue: false }, next_action: { kind: 'open_source', source: source().source } });
    open(); expect(screen.queryByRole('button', { name: 'Открыть проект' })).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Открыть приказ' }));
    const params = new URLSearchParams(screen.getByTestId('location').textContent || ''); expect(params.get('documentChainId')).toBe(id(8)); expect(params.get('documentChainVersionId')).toBe(id(10)); expect(screen.getByTestId('source-dialog')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Настройки зачисления' })).toBeNull();
  });
  it('keeps admission settings reachable when an incomplete draft also has a preview', () => {
    const draft = { kind: 'admission_draft' as const, id: id(7), revision: 1, enrollment_id: enrollment, group_id: group };
    Object.assign(m.model.rows[0].admission_order, { state: 'needs_information', why: 'Подтвердите программу обучения.', source: draft, next_action: { kind: 'open_source', source: draft }, capabilities: { can_open: true, can_continue: true } });
    open(`/organization?tab=student-details&studentId=${pupil}&studentSection=documents&returnToGroupId=${id(90)}`);
    expect(screen.getByRole('button', { name: 'Открыть проект' })).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Настройки зачисления' }));
    const params = new URLSearchParams(screen.getByTestId('location').textContent || ''); expect(params.get('studentJournalEnrollmentId')).toBe(enrollment); expect(params.get('studentJournalGroupId')).toBe(group); expect(params.get('returnToGroupId')).toBe(id(90)); expect(screen.getByText('Настройки точного приказа')).toBeInTheDocument();
  });
  it('keeps the settings of a legacy order locked', () => {
    m.model.rows[0].admission_order.state = 'legacy_unverified'; open();
    expect(screen.queryByRole('button', { name: 'Настройки зачисления' })).toBeNull();
  });
  it('does not show empty or zero documents while the request failed', () => {
    m.model = { ...m.model, error: 'Не удалось подтвердить документы.', data: null, rows: [] }; open();
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось подтвердить документы'); expect(screen.queryByText(/пока нет подтверждённых зачислений/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' })); expect(m.refresh).toHaveBeenCalledOnce();
  });
  it('shows a confirmed empty result only after a successful available read', () => {
    m.model.data = { ...list(), rows: [], total_count: 0 }; m.model.rows = []; open();
    expect(screen.getByText(/пока нет подтверждённых зачислений/)).toBeInTheDocument();
  });
  it('does not call an enabled read when the staff permissions are missing', () => {
    m.allowed = false; open(); expect(screen.queryByTestId('student-document-chain')).toBeNull(); expect(m.hook.mock.calls[0][2]).toBe(false);
  });
  it('changes training in one route update and clears old source and group filters', () => {
    open(`/organization?tab=student-details&studentId=${pupil}&studentSection=documents&studentJournalEnrollmentId=${enrollment}&studentJournalGroupId=${group}&returnToGroupId=${group}&documentChainKind=registry_record&documentChainId=${id(8)}&documentChainRevision=2&documentChainDocumentId=${id(9)}&documentChainVersionId=${id(10)}&documentChainEnrollmentId=${enrollment}&documentChainGroupId=${group}`);
    fireEvent.change(screen.getByRole('combobox', { name: 'Обучение для документов' }), { target: { value: 'all' } });
    const params = new URLSearchParams(screen.getByTestId('location').textContent || '');
    expect(params.get('studentJournalEnrollmentId')).toBeNull(); expect(params.get('studentJournalGroupId')).toBeNull(); expect(params.get('documentChainKind')).toBeNull(); expect(params.get('returnToGroupId')).toBe(group);
  });
  it('preserves the exact student, enrollment and return context in the journals link', () => {
    open(`/organization?tab=student-details&studentId=${pupil}&studentSection=documents&returnToGroupId=${id(90)}`);
    fireEvent.click(screen.getByRole('button', { name: 'Журналы ученика и выписка' }));
    const params = new URLSearchParams(screen.getByTestId('location').textContent || ''); expect(params.get('journalStudentId')).toBe(pupil); expect(params.get('journalEnrollmentId')).toBe(enrollment); expect(params.get('journalReturnGroupId')).toBe(id(90));
  });
  it('uses returned course choices in the own viewer and requests a strict self projection', () => {
    m.actorId = pupil; m.allowed = false;
    render(<MemoryRouter initialEntries={['/student?tab=profile&section=documents']}><StudentDocumentChain organizationId={org} studentUserId={pupil} ownViewer /><Location /></MemoryRouter>);
    expect(screen.getByText('Мои документы по обучению')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Тестовая программа' })).toHaveValue(enrollment);
    expect(m.hook.mock.calls[0][2]).toBe(true); expect(m.hook.mock.calls[0][4]).toBe(true);
    expect(screen.queryByRole('button', { name: 'Уточнить сведения' })).toBeNull();
  });
  it('sets an exact own journal enrollment and group before opening its section', () => {
    m.actorId = pupil; m.allowed = false;
    render(<MemoryRouter initialEntries={['/student?tab=profile&section=documents']}><StudentDocumentChain organizationId={org} studentUserId={pupil} ownViewer /><Location /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Мои журналы и выписка' }));
    const params = new URLSearchParams(screen.getByTestId('location').textContent || '');
    expect(params.get('ownJournalEnrollmentId')).toBe(enrollment); expect(params.get('ownJournalGroupId')).toBe(group); expect(params.get('tab')).toBe('profile');
  });
  it('does not turn an administrator preview of another student into a self viewer', () => {
    render(<MemoryRouter><StudentDocumentChain organizationId={org} studentUserId={pupil} ownViewer /></MemoryRouter>);
    expect(screen.queryByTestId('student-document-chain')).toBeNull(); expect(m.hook.mock.calls[0][2]).toBe(false);
  });
});
