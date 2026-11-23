import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EducationJournalWorkspace } from '../EducationJournalWorkspace';
import { StudentJournalLinks } from '../../student-detail/StudentJournalLinks';
import { StudentEducationJournals } from '@/components/student/StudentEducationJournals';
import { ids, page, scope, summary } from '@/lib/educationJournalWorkspace/__tests__/fixtures';
import { journalLabels, journalTypes } from '@/lib/educationJournalWorkspace/contract';
const mock = vi.hoisted(() => ({ actor: '', can: vi.fn(), read: vi.fn(), model: {} as any }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mock.actor }, loading: false }) }));
vi.mock('@/hooks/useStaffPermissions', () => ({ useStaffPermissions: () => ({ loading: false, error: null, organizationId: 'org', orgRole: 'teacher', adminRole: null, isOrgOwner: false, can: mock.can }) }));
vi.mock('@/hooks/useEducationJournalWorkspace', () => ({ useEducationJournalWorkspace: (...args: unknown[]) => { mock.read(...args); return mock.model; } }));
vi.mock('@/components/organization/documents/AdmissionDocumentSettingsPanel', () => ({ AdmissionDocumentSettingsPanel: (props: any) => <div data-testid="admission-settings">{props.scope.kind}</div>, StudentAdmissionAutomationCard: () => <div data-testid="admission-settings">enrollment</div> }));
function Location() { const route = useLocation(); return <output data-testid="location">{route.pathname}{route.search}</output>; }
const mount = (child: React.ReactNode, url = '/organization') => render(<MemoryRouter initialEntries={[url]}>{child}<Location /></MemoryRouter>);
const allJournals = () => journalTypes.map((journal_type, index) => ({ ...summary().journals[0], journal_type, title: journalLabels[journal_type], record_count: index + 1, source_label: `Источник ${journal_type}` }));
beforeEach(() => {
  mock.actor = ids.actor; mock.can.mockReset().mockReturnValue(true); mock.read.mockReset();
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
    expect(screen.queryByRole('button', { name: 'Открыть записи' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Скачать выписку HTML' })).toBeDisabled();
    expect(screen.getByRole('option')).toHaveTextContent('недоступно'); expect(screen.getByText('Критерии не подтверждены')).toBeInTheDocument();
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
  it.each(['Договор об обучении', 'Акт', 'Приказ о зачислении — название без подтверждённого типа'])('keeps the registry record %s and its extract without an unsupported source button', title => {
    mock.model.summary.journals = [{ ...summary().journals[0], journal_type: 'document_registration', title: journalLabels.document_registration }];
    mock.model.page = page();
    Object.assign(mock.model.page, { journal_type: 'document_registration' });
    Object.assign(mock.model.page.rows[0], { journal_type: 'document_registration', id: 'registry:' + ids.course, source_id: ids.course, source_revision: 2, title, source_label: 'Точная запись реестра' });
    mount(<EducationJournalWorkspace organizationId={ids.org} scope={scope} journalType="document_registration" origin={{ kind: 'student', studentId: ids.student }} />);
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Открыть документ' })).not.toBeInTheDocument();
    expect(screen.getByText('Файл по этой записи здесь пока не открывается. Запись сохранена в выписке.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Скачать выписку HTML' }));
    expect(mock.model.exportExtract).toHaveBeenCalledOnce();
    expect(screen.getByTestId('location').textContent).not.toContain('documentChain');
  });
  it('opens the exact learner documents and enrollment from a group journal row', () => {
    mock.model.page = page();
    mount(<EducationJournalWorkspace organizationId={ids.org} scope={{ kind: 'group', group_id: ids.group }} journalType="activity" origin={{ kind: 'group', groupId: ids.group, participantSearch: 'Иванов', department: 'Цех' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Иванов Иван' }));
    const route = new URLSearchParams(screen.getByTestId('location').textContent!.split('?')[1]);
    expect(route.get('studentId')).toBe(ids.student); expect(route.get('studentJournalEnrollmentId')).toBe(ids.enrollment);
    expect(route.get('returnToGroupId')).toBe(ids.group); expect(route.get('studentJournalGroupId')).toBe(ids.group); expect(route.get('returnDepartment')).toBe('Цех'); expect(route.get('returnParticipantSearch')).toBe('Иванов');
  });
  it('loads organization order settings only after explicit opening', () => {
    mount(<EducationJournalWorkspace organizationId={ids.org} scope={{ kind: 'organization' }} journalType={null} origin={{ kind: 'organization' }} />);
    expect(screen.queryByTestId('admission-settings')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Настройки приказов' }));
    expect(screen.getByTestId('admission-settings')).toHaveTextContent('organization');
    fireEvent.click(screen.getByRole('button', { name: 'Настройки приказов' }));
    expect(screen.queryByTestId('admission-settings')).not.toBeInTheDocument();
  });
  it('treats a group return path as navigation and activates date settings only for a confirmed enrollment', () => {
    mount(<StudentJournalLinks organizationId={ids.org} studentUserId={ids.student} enrollments={[{ id: ids.enrollment, course_id: ids.course, course_title: 'Программа' }]} />, `/organization?tab=student-details&studentId=${ids.student}&returnToGroupId=${ids.group}`);
    expect(mock.read.mock.calls.at(-1)?.[1]).toMatchObject({ student_user_id: ids.student, group_id: null, enrollment_id: null });
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
  it('opens a newly assigned unrelated course despite the previous group return path', () => {
    const newer = '10000000-0000-4000-8000-000000000008';
    mock.model.summary.context.enrollment = { id: newer, course_id: ids.peer, course_label: 'Новый QA-курс' }; mock.model.summary.context.group = null;
    mock.read.mockImplementation((_org: string, target: any) => { mock.model.error = target.group_id ? 'Ученик, обучение или журнал не найдены' : null; });
    mount(<StudentJournalLinks organizationId={ids.org} studentUserId={ids.student} enrollments={[{ id: ids.enrollment, course_id: ids.course, course_title: 'Программа группы' }, { id: newer, course_id: ids.peer, course_title: 'Новый QA-курс' }]} />, `/organization?tab=student-details&studentId=${ids.student}&returnToGroupId=${ids.group}&studentJournalEnrollmentId=${newer}`);
    expect(mock.read.mock.calls.at(-1)?.[1]).toEqual({ kind: 'student', student_user_id: ids.student, enrollment_id: newer, group_id: null });
    expect(screen.queryByText('Ученик, обучение или журнал не найдены')).not.toBeInTheDocument(); expect(screen.getByTestId('admission-settings')).toBeInTheDocument();
    expect(screen.getByText('Все группы выбранного обучения')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть журналы ученика' }));
    const route = new URLSearchParams(screen.getByTestId('location').textContent!.split('?')[1]);
    expect(route.get('groupId')).toBeNull(); expect(route.get('journalReturnGroupId')).toBe(ids.group);
    mock.read.mockReset();
  });
  it('preserves an explicit source group until the operator chooses another enrollment', () => {
    const newer = '10000000-0000-4000-8000-000000000008';
    mount(<StudentJournalLinks organizationId={ids.org} studentUserId={ids.student} enrollments={[{ id: ids.enrollment, course_id: ids.course, course_title: 'Программа группы' }, { id: newer, course_id: ids.peer, course_title: 'Другой курс' }]} />, `/organization?tab=student-details&studentId=${ids.student}&returnToGroupId=${ids.group}&studentJournalGroupId=${ids.group}&studentJournalEnrollmentId=${ids.enrollment}`);
    expect(mock.read.mock.calls.at(-1)?.[1]).toMatchObject({ group_id: ids.group, enrollment_id: ids.enrollment });
    expect(screen.getByRole('button', { name: 'Все группы обучения' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Обучение'), { target: { value: newer } });
    expect(mock.read.mock.calls.at(-1)?.[1]).toMatchObject({ group_id: null, enrollment_id: newer });
    const route = new URLSearchParams(screen.getByTestId('location').textContent!.split('?')[1]);
    expect(route.has('studentJournalGroupId')).toBe(false); expect(route.get('returnToGroupId')).toBe(ids.group);
  });
  it('does not silently broaden an invalid explicit source group and allows an explicit all-groups choice', () => {
    mount(<StudentJournalLinks organizationId={ids.org} studentUserId={ids.student} />, `/organization?tab=student-details&studentId=${ids.student}&studentJournalGroupId=wrong&returnToGroupId=${ids.group}`);
    expect(mock.read.mock.calls.at(-1)?.[3]).toBe(false); expect(screen.getByRole('alert')).toHaveTextContent('группу источника');
    fireEvent.click(screen.getByRole('button', { name: 'Все группы обучения' }));
    expect(mock.read.mock.calls.at(-1)?.[3]).toBe(true); expect(mock.read.mock.calls.at(-1)?.[1]).toMatchObject({ group_id: null });
    expect(screen.getByTestId('location')).toHaveTextContent(`returnToGroupId=${ids.group}`);
  });
  it('places selected records after one compact selector while retaining nine cards in the overview', () => {
    mock.model.summary.journals = allJournals(); mock.model.page = page();
    const view = mount(<EducationJournalWorkspace organizationId={ids.org} scope={scope} journalType="activity" origin={{ kind: 'student', studentId: ids.student }} />);
    expect(screen.queryByTestId('journal-overview')).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(9); expect(screen.getByLabelText('Журнал')).toHaveValue('activity');
    expect(screen.queryByRole('button', { name: 'Открыть записи' })).not.toBeInTheDocument();
    expect(screen.getByTestId('journal-selector').compareDocumentPosition(screen.getByRole('table')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('journal-scope-banner')).toHaveTextContent('Новые завершения уроков сохраняются в хронологии; прежние отметки показывают текущее состояние');
    view.unmount(); mock.model.page = null;
    mount(<EducationJournalWorkspace organizationId={ids.org} scope={scope} journalType={null} origin={{ kind: 'student', studentId: ids.student }} />);
    expect(screen.getByTestId('journal-overview')).toBeInTheDocument(); expect(screen.getAllByRole('button', { name: 'Открыть записи' })).toHaveLength(9);
    expect(screen.queryByLabelText('Журнал')).not.toBeInTheDocument();
  });
  it('switches the compact staff journal without losing the subject, enrollment, group or return filters', () => {
    mock.model.summary.journals = allJournals();
    mount(<EducationJournalWorkspace organizationId={ids.org} scope={scope} journalType="activity" origin={{ kind: 'student', studentId: ids.student, enrollmentId: ids.enrollment, groupId: ids.group, department: 'Цех', participantSearch: 'Иванов' }} />);
    fireEvent.change(screen.getByLabelText('Журнал'), { target: { value: 'conducted_sessions' } });
    const route = new URLSearchParams(screen.getByTestId('location').textContent!.split('?')[1]);
    expect(route.get('journalType')).toBe('conducted_sessions'); expect(route.get('journalStudentId')).toBe(ids.student); expect(route.get('journalEnrollmentId')).toBe(ids.enrollment); expect(route.get('groupId')).toBe(ids.group);
    expect(route.get('journalReturnStudentId')).toBe(ids.student); expect(route.get('journalReturnDepartment')).toBe('Цех'); expect(route.get('journalReturnSearch')).toBe('Иванов');
  });
  it('keeps an unavailable selected source and its explanation visible without inventing an empty table', () => {
    mock.model.summary.journals = allJournals();
    mock.model.summary.journals[2] = { ...mock.model.summary.journals[2], state: 'unavailable', record_count: null, exportable: false, reason: 'Критерии итогового контроля не подтверждены. Попытки доступны в текущем контроле.' };
    mount(<EducationJournalWorkspace organizationId={ids.org} scope={scope} journalType="final_tests" origin={{ kind: 'student', studentId: ids.student }} />);
    expect(screen.getByText('Источник final_tests')).toBeInTheDocument(); expect(screen.getByText('Критерии итогового контроля не подтверждены. Попытки доступны в текущем контроле.')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('table')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Скачать выписку HTML' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Итоговые тесты · недоступно' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Журнал'), { target: { value: 'current_control' } });
    expect(screen.getByTestId('location')).toHaveTextContent('journalType=current_control'); expect(screen.getByTestId('location')).toHaveTextContent(`journalStudentId=${ids.student}`);
  });
  it('switches a selected own journal within the learner cabinet and returns to its overview', () => {
    mock.actor = ids.student; mock.can.mockReturnValue(false); mock.model.summary.journals = allJournals();
    mount(<StudentEducationJournals organizationId={ids.org} userId={ids.student} />, '/student?tab=profile&section=documents&ownJournal=activity');
    expect(screen.queryByTestId('journal-overview')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Журнал'), { target: { value: 'current_control' } });
    expect(screen.getByTestId('location').textContent).toBe('/student?tab=profile&section=documents&ownJournal=current_control');
    expect(mock.read.mock.calls.at(-1)?.[1]).toEqual({ kind: 'student', student_user_id: ids.student, enrollment_id: null, group_id: null });
    expect(mock.read.mock.calls.at(-1)?.[2]).toBe('current_control'); expect(screen.queryByTestId('admission-settings')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'К моим журналам' }));
    expect(screen.getByTestId('location').textContent).toBe('/student?tab=profile&section=documents'); expect(screen.getByTestId('journal-overview')).toBeInTheDocument();
  });
});
