import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { enrollment, group, org, pupil } from '@/lib/documentChain/__tests__/fixtures';
const m = vi.hoisted(() => ({ actorId: '', workspace: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: m.actorId }, loading: false }) }));
vi.mock('@/components/organization/journals/EducationJournalWorkspace', () => ({ EducationJournalWorkspace: (props: any) => { m.workspace(props); return <div data-testid="own-scope">{JSON.stringify(props.scope)}</div>; } }));
import { StudentEducationJournals } from '../StudentEducationJournals';
function Location() { return <output data-testid="own-location">{useLocation().search}</output>; }
function open(search = '') { return render(<MemoryRouter initialEntries={['/student?tab=profile&section=documents' + search]}><StudentEducationJournals organizationId={org} userId={pupil} /><Location /></MemoryRouter>); }
beforeEach(() => { vi.clearAllMocks(); m.actorId = pupil; });
describe('own journal exact context', () => {
  it('passes the selected enrollment and group to the own-only reader', () => {
    open(`&ownJournalEnrollmentId=${enrollment}&ownJournalGroupId=${group}`);
    expect(JSON.parse(screen.getByTestId('own-scope').textContent || '')).toEqual({ kind: 'student', student_user_id: pupil, enrollment_id: enrollment, group_id: group });
  });
  it.each(['&ownJournalEnrollmentId=wrong', `&ownJournalGroupId=${group}`, `&ownJournalEnrollmentId=${enrollment}&ownJournalGroupId=wrong`])('rejects an invalid own filter rather than widening to all courses: %s', filter => {
    open(filter); expect(screen.getByRole('alert')).toHaveTextContent('Не удалось определить обучение'); expect(m.workspace).not.toHaveBeenCalled();
  });
  it('clears the selected scope only after an explicit all-trainings action', () => {
    open(`&ownJournalEnrollmentId=${enrollment}&ownJournalGroupId=${group}&ownJournal=activity`);
    fireEvent.click(screen.getByRole('button', { name: 'Все мои обучения' }));
    const params = new URLSearchParams(screen.getByTestId('own-location').textContent || ''); expect(params.get('ownJournalEnrollmentId')).toBeNull(); expect(params.get('ownJournalGroupId')).toBeNull(); expect(params.get('ownJournal')).toBeNull();
  });
  it('does not read another user through an own-only component', () => {
    m.actorId = org; open(`&ownJournalEnrollmentId=${enrollment}`); expect(m.workspace).not.toHaveBeenCalled(); expect(screen.queryByTestId('own-scope')).toBeNull();
  });
});
