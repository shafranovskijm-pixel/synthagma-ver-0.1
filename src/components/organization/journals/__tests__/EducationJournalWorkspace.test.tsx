import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EducationJournalWorkspace } from '../EducationJournalWorkspace';
import { StudentJournalLinks } from '../../student-detail/StudentJournalLinks';
import { StudentEducationJournals } from '@/components/student/StudentEducationJournals';
import { ids, page, scope, summary } from '@/lib/educationJournalWorkspace/__tests__/fixtures';
const mock = vi.hoisted(() => ({ actor: '', can: vi.fn(), read: vi.fn(), model: {} as any }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mock.actor }, loading: false }) }));
vi.mock('@/hooks/useStaffPermissions', () => ({ useStaffPermissions: () => ({ loading: false, error: null, organizationId: 'org', orgRole: 'teacher', adminRole: null, isOrgOwner: false, can: mock.can }) }));
vi.mock('@/hooks/useEducationJournalWorkspace', () => ({ useEducationJournalWorkspace: (...args: unknown[]) => { mock.read(...args); return mock.model; } }));
vi.mock('@/components/organization/documents/AdmissionDocumentSettingsPanel', () => ({ AdmissionDocumentSettingsPanel: (props: any) => <div data-testid="admission-settings">{props.scope.kind}</div>, StudentAdmissionAutomationCard: () => <div data-testid="admission-settings">enrollment</div> }));
function Location() { const route = useLocation(); return <output data-testid="location">{route.pathname}{route.search}</output>; }
const mount = (child: React.ReactNode, url = '/organization') => render(<MemoryRouter initialEntries={[url]}>{child}<Location /></MemoryRouter>);
beforeEach(() => {
  mock.actor = ids.actor; mock.can.mockReset().mockReturnValue(true); mock.read.mockClear();
  mock.model = { summary: summary(), page: null, loading: false, error: null, exportBusy: false, exportError: null, exportExtract: vi.fn(), refresh: vi.fn(), loadMore: vi.fn() };
});
afterEach(cleanup);

describe('journal UI and cross-routes', () => {
  it('opens exact learner/enrollment/group and returns to their documents with filters', () => {
    const origin = { kind: 'student' as const, studentId: ids.student, enrollmentId: ids.enrollment, groupId: ids.group, participantSearch: 'Иванов', department: 'Цех' };
    mount(<EducationJournalWorkspace organizationId={ids.org} scope={scope} journalType={null} origin={origin} />);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть записи' }));
    expect(screen.getByTestId('location').textContent).toContain(`journalStudentId=${ids.student}`);
    expect(screen.getByTestId('location').textContent).toContain(`journalEnrollmentId=${ids.enrollment}`);
    expect(screen.getByTestId('location').textContent).toContain(`groupId=${ids.group}`);
    fireEvent.click(screen.getByRole('button', { name: 'К документам ученика' }));
    const back = new URLSearchParams(screen.getByTestId('location').textContent!.split('?')[1]);
    expect(back.get('studentId')).toBe(ids.student); expect(back.get('studentSection')).toBe('documents');
    expect(back.get('returnParticipantSearch')).toBe('Иванов'); expect(back.get('studentJournalEnrollmentId')).toBe(ids.enrollment);
  });
  it('keeps an unknown source distinct from zero and disables export/open', () => {
    mock.model.summary.journals[0] = { ...mock.model.summary.journals[0], state: 'unavailable', record_count: null, exportable: false, reason: 'Критерии не подтверждены' };
    mount(<EducationJournalWorkspace organizationId={ids.org} scope={scope} journalType="activity" origin={{ kind: 'student', studentId: ids.student }} />);
    expect(screen.getByRole('button', { name: 'Открыть записи' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Скачать выписку HTML' })).toBeDisabled();
    expect(screen.getByText('—')).toBeInTheDocument(); expect(screen.getAllByText('Критерии не подтверждены')).toHaveLength(2);
  });
  it('shows partial-source caveats even when known rows are available', () => {
    mock.model.summary.journals[0].reason = 'Для части обучений критерии не подтверждены';
    mount(<EducationJournalWorkspace organizationId={ids.org} scope={scope} journalType={null} origin={{ kind: 'student', studentId: ids.student }} />);
    expect(screen.getByText('Для части обучений критерии не подтверждены')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть записи' })).toBeEnabled();
    expect(screen.getByTestId('journal-scope-banner')).not.toHaveTextContent('за всё время');
    fireEvent.click(screen.getByRole('button', { name: 'Обновить записи' })); expect(mock.model.refresh).toHaveBeenCalledOnce();
  });
  it('removes stale facts on a read error and offers explicit retry', () => {
    mock.model.error = 'Не удалось подтвердить записи'; mock.model.page = page();
    mount(<EducationJournalWorkspace organizationId={ids.org} scope={scope} journalType="activity" origin={{ kind: 'student', studentId: ids.student }} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' })); expect(mock.model.refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Скачать выписку HTML' })).toBeDisabled();
  });
  it('requires documents and student read in addition to journals read for staff', () => {
    mock.can.mockImplementation((permission: string) => permission !== 'documents.read');
    mount(<EducationJournalWorkspace organizationId={ids.org} scope={scope} journalType={null} origin={{ kind: 'student', studentId: ids.student }} />);
    expect(mock.read.mock.calls.at(-1)?.[3]).toBe(false);
    expect(screen.getByRole('alert')).toHaveTextContent('Доступ к журналам не подтверждён');
  });
  it('renders only the selected learner rows without peer-navigation columns', () => {
    mock.model.page = page();
    mount(<EducationJournalWorkspace organizationId={ids.org} scope={scope} journalType="activity" origin={{ kind: 'student', studentId: ids.student }} />);
    expect(screen.queryByRole('columnheader', { name: 'Ученик' })).not.toBeInTheDocument();
    expect(screen.getByText('Урок1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Скачать выписку HTML' })); expect(mock.model.exportExtract).toHaveBeenCalledOnce();
  });
  it('opens the exact learner documents and enrollment from a group journal row', () => {
    mock.model.page = page();
    mount(<EducationJournalWorkspace organizationId={ids.org} scope={{ kind: 'group', group_id: ids.group }} journalType="activity" origin={{ kind: 'group', groupId: ids.group, participantSearch: 'Иванов', department: 'Цех' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Иванов Иван' }));
    const route = new URLSearchParams(screen.getByTestId('location').textContent!.split('?')[1]);
    expect(route.get('studentId')).toBe(ids.student); expect(route.get('studentJournalEnrollmentId')).toBe(ids.enrollment);
    expect(route.get('returnToGroupId')).toBe(ids.group); expect(route.get('returnDepartment')).toBe('Цех'); expect(route.get('returnParticipantSearch')).toBe('Иванов');
  });
  it('loads organization order settings only after explicit opening', () => {
    mount(<EducationJournalWorkspace organizationId={ids.org} scope={{ kind: 'organization' }} journalType={null} origin={{ kind: 'organization' }} />);
    expect(screen.queryByTestId('admission-settings')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Настройки приказов' }));
    expect(screen.getByTestId('admission-settings')).toHaveTextContent('organization');
    fireEvent.click(screen.getByRole('button', { name: 'Настройки приказов' }));
    expect(screen.queryByTestId('admission-settings')).not.toBeInTheDocument();
  });
  it('preserves the group scope in a student card and activates date settings only for a confirmed enrollment', () => {
    mount(<StudentJournalLinks organizationId={ids.org} studentUserId={ids.student} enrollments={[{ id: ids.enrollment, course_id: ids.course, course_title: 'Программа' }]} />, `/organization?tab=student-details&studentId=${ids.student}&returnToGroupId=${ids.group}`);
    expect(mock.read.mock.calls.at(-1)?.[1]).toMatchObject({ student_user_id: ids.student, group_id: ids.group, enrollment_id: null });
    expect(screen.queryByTestId('admission-settings')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Обучение'), { target: { value: ids.enrollment } });
    expect(mock.read.mock.calls.at(-1)?.[1]).toMatchObject({ enrollment_id: ids.enrollment });
    expect(screen.getByTestId('admission-settings')).toBeInTheDocument();
  });
  it('keeps own learner journals within their cabinet even without staff permissions', () => {
    mock.actor = ids.student; mock.can.mockReturnValue(false);
    mount(<StudentEducationJournals organizationId={ids.org} userId={ids.student} />, '/student?tab=profile&section=documents');
    expect(mock.read.mock.calls.at(-1)?.[3]).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть записи' }));
    expect(screen.getByTestId('location').textContent).toBe('/student?tab=profile&section=documents&ownJournal=activity');
    expect(mock.read.mock.calls.at(-1)?.[1]).toEqual({ kind: 'student', student_user_id: ids.student, enrollment_id: null, group_id: null });
    expect(screen.queryByTestId('admission-settings')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'К моим журналам' }));
    expect(screen.getByTestId('location').textContent).not.toContain('ownJournal');
  });
  it('does not mount another learner own-only projection or silently accept a bad journal link', () => {
    mock.actor = ids.peer;
    const view = mount(<StudentEducationJournals organizationId={ids.org} userId={ids.student} />, '/student?ownJournal=wrong');
    expect(mock.read).not.toHaveBeenCalled(); view.unmount(); mock.actor = ids.student;
    mount(<StudentEducationJournals organizationId={ids.org} userId={ids.student} />, '/student?ownJournal=wrong');
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось определить выбранный журнал'); expect(mock.read).not.toHaveBeenCalled();
  });
});
