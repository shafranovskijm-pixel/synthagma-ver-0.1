import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { enrollment, group, id, list, org, source } from '@/lib/documentChain/__tests__/fixtures';
const m = vi.hoisted(() => ({ model: null as any, read: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: '00000000-0000-4000-8000-000000000002' } }) }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineActor: () => 1 }));
vi.mock('@/hooks/useStaffPermissions', () => ({ useStaffPermissions: () => ({ loading: false, error: null, can: () => true }) }));
vi.mock('@/hooks/useDocumentChain', () => ({ useDocumentChain: (...args: unknown[]) => { m.read(...args); return m.model; } }));
vi.mock('./DocumentChainSourceDialog', () => ({ DocumentChainSourceDialog: () => null }));
import { DocumentChainPanel } from './DocumentChainPanel';
function Location() { return <output data-testid="panel-location">{useLocation().search}</output>; }
beforeEach(() => { vi.clearAllMocks(); const data = list(); m.model = { loading: false, error: null, data, rows: data.rows, refresh: vi.fn(), loadingMore: false, loadMore: vi.fn() }; });
describe('shared group and organization document chain', () => {
  it('requests the explicit group and keeps the same registered document identity', () => {
    Object.assign(m.model.rows[0].admission_order, { state: 'registered', why: null, source: source().source, next_action: { kind: 'open_source', source: source().source }, capabilities: { can_open: true, can_continue: false } });
    render(<MemoryRouter initialEntries={[`/organization?tab=group-folder&groupId=${group}&folder=docs`]}><DocumentChainPanel organizationId={org} scope={{ kind: 'group', group_id: group }} /><Location /></MemoryRouter>);
    expect(m.read.mock.calls[0][1]).toEqual({ kind: 'group', group_id: group }); fireEvent.click(screen.getByRole('button', { name: 'Открыть приказ' }));
    const params = new URLSearchParams(screen.getByTestId('panel-location').textContent || ''); expect(params.get('groupId')).toBe(group); expect(params.get('documentChainId')).toBe(id(8)); expect(params.get('documentChainVersionId')).toBe(id(10));
  });
  it('opens a student journal with the group as the exact return origin', () => {
    render(<MemoryRouter initialEntries={[`/organization?tab=group-folder&groupId=${group}&folder=docs`]}><DocumentChainPanel organizationId={org} scope={{ kind: 'group', group_id: group }} /><Location /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Журналы ученика и выписка' }));
    const params = new URLSearchParams(screen.getByTestId('panel-location').textContent || ''); expect(params.get('journalReturnGroupId')).toBe(group); expect(params.get('journalEnrollmentId')).toBe(enrollment);
  });
  it('uses the bounded organization projection and shows blocked projects without claiming issuance', () => {
    Object.assign(m.model.rows[0].admission_order, { state: 'needs_information', why: 'Подтвердите программу обучения.' });
    render(<MemoryRouter><DocumentChainPanel organizationId={org} scope={{ kind: 'organization' }} /></MemoryRouter>);
    expect(m.read.mock.calls[0][1]).toEqual({ kind: 'organization' }); expect(screen.getByText('Подтвердите программу обучения.')).toBeInTheDocument(); expect(screen.queryByText('Зарегистрирован')).toBeNull(); expect(screen.queryByText('Выдан')).toBeNull();
  });
});
