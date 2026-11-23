import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { enrollment, group, list, org, pupil } from '@/lib/documentChain/__tests__/fixtures';
const m = vi.hoisted(() => ({ write: false, model: null as any, dialog: vi.fn(), read: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: '00000000-0000-4000-8000-000000000002' }, loading: false }) }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineActor: () => 1 }));
vi.mock('@/hooks/useStaffPermissions', () => ({ useStaffPermissions: () => ({ loading: false, error: null, organizationId: org, orgRole: 'staff', adminRole: null, isOrgOwner: false, can: (right: string) => right === 'documents.read' || right === 'students.read' || right === 'documents.write' && m.write }) }));
vi.mock('@/hooks/useDocumentChain', () => ({ useDocumentChain: (...args: any[]) => { m.read(...args); return m.model; } }));
vi.mock('@/components/organization/documents/DocumentChainSourceDialog', () => ({ DocumentChainSourceDialog: () => null }));
vi.mock('@/components/organization/documents/AdmissionDocumentSettingsPanel', () => ({ AdmissionDocumentSettingsPanel: () => null }));
vi.mock('./IndividualEducationOrderDialog', () => ({ IndividualEducationOrderDialog: (props: any) => { m.dialog(props); return <div role="dialog">Проект выбранного обучения</div>; } }));
import { DocumentChainPanel } from '@/components/organization/documents/DocumentChainPanel';
import { StudentDocumentChain } from '@/components/organization/student-detail/StudentDocumentChain';
beforeEach(() => { vi.clearAllMocks(); m.write = false; const data = list(); m.model = { loading: false, error: null, data, rows: data.rows, refresh: vi.fn(), loadMore: vi.fn(), loadingMore: false }; });
const surfaces = [
 () => <DocumentChainPanel organizationId={org} scope={{ kind: 'organization' }} />,
 () => <DocumentChainPanel organizationId={org} scope={{ kind: 'group', group_id: group }} />,
 () => <StudentDocumentChain organizationId={org} studentUserId={pupil} />,
];
describe('preparation permission remains separate from legal issue permission', () => {
 it('allows an actual document writer without issue rights to enter preparation in organization group and student routes', () => { m.write = true; for (const surface of surfaces) { render(<MemoryRouter>{surface()}</MemoryRouter>); const entry = screen.getByRole('button', { name: 'Оформить приказы ученика' }); expect(entry).not.toBeDisabled(); fireEvent.click(entry); expect(m.dialog.mock.calls.at(-1)![0]).toMatchObject({ organizationId: org, row: { enrollment_id: enrollment, student_user_id: pupil }, enabled: true }); expect(screen.getByRole('button', { name: 'Журналы ученика и выписка' })).toBeInTheDocument(); cleanup(); } expect(m.read.mock.calls.map(([, scope]) => scope.kind)).toEqual(expect.arrayContaining(['organization', 'group', 'student'])); });
 it('keeps read-only staff outside the new mutation entry while preserving existing chain and journal views', () => { for (const surface of surfaces) { render(<MemoryRouter>{surface()}</MemoryRouter>); expect(screen.queryByRole('button', { name: 'Оформить приказы ученика' })).toBeNull(); expect(screen.getByRole('button', { name: 'Журналы ученика и выписка' })).toBeInTheDocument(); cleanup(); } expect(m.dialog).not.toHaveBeenCalled(); });
});
