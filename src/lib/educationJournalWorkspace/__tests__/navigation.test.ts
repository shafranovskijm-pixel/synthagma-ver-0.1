import { describe, expect, it } from 'vitest';
import { ids, scope } from './fixtures';
import { educationJournalReturnPath, educationJournalWorkspacePath, readEducationJournalWorkspaceRoute } from '../navigation';
import { resolveTabParams } from '@/lib/groups/groupContext';
describe('journal cross-routes', () => {
  it('roundtrips exact student/enrollment/group and return filters', () => {
    const origin = { kind: 'student' as const, studentId: ids.student, enrollmentId: ids.enrollment, groupId: ids.group, department: 'department:Цех1', participantSearch: 'Иванов' };
    const route = readEducationJournalWorkspaceRoute(new URLSearchParams(educationJournalWorkspacePath(scope, 'activity', origin).split('?')[1]));
    expect(route).toMatchObject({ state: 'ready', scope, journalType: 'activity' });
    if (route.state !== 'ready') throw Error('route');
    const back = new URLSearchParams(educationJournalReturnPath(route.origin).split('?')[1]);
    expect(back.get('studentSection')).toBe('documents'); expect(back.get('studentJournalEnrollmentId')).toBe(ids.enrollment); expect(back.get('returnParticipantSearch')).toBe('Иванов');
  });
  it('returns group-origin journal back to the same group', () => {
    const route = readEducationJournalWorkspaceRoute(new URLSearchParams(educationJournalWorkspacePath({ kind: 'group', group_id: ids.group }, null, { kind: 'group', groupId: ids.group }).split('?')[1]));
    expect(route.state).toBe('ready'); if (route.state === 'ready') expect(educationJournalReturnPath(route.origin)).toContain(`groupId=${ids.group}`);
  });
  it.each(['?journalView=workspace&journalScope=student&journalStudentId=wrong', '?journalView=workspace&journalScope=unknown', `?journalView=workspace&journalScope=student&journalStudentId=${ids.student}&journalType=unknown`])('fails closed for invalid deep link %s', url => {
    expect(readEducationJournalWorkspaceRoute(new URLSearchParams(url))).toEqual({ state: 'invalid' });
  });
  it('clears subject state on a top-level section change', () => {
    const params = new URLSearchParams(educationJournalWorkspacePath(scope, 'activity', { kind: 'student', studentId: ids.student }).split('?')[1]);
    const next = resolveTabParams(params, 'courses');
    expect(next.has('journalStudentId')).toBe(false); expect(next.has('journalScope')).toBe(false); expect(next.has('journalView')).toBe(false);
  });
  it.each([scope, { kind: 'group' as const, group_id: ids.group }])('keeps the exact workspace during a journals tab reconciliation', target => {
    const params = new URLSearchParams(educationJournalWorkspacePath(target, 'activity').split('?')[1]);
    const route = readEducationJournalWorkspaceRoute(resolveTabParams(params, 'journals'));
    expect(route).toMatchObject({ state: 'ready', scope: target, journalType: 'activity' });
  });
  it.each([
    `journalScope=organization&journalStudentId=${ids.student}`,
    `journalScope=organization&groupId=${ids.group}`,
    `journalScope=group&groupId=${ids.group}&journalEnrollmentId=${ids.enrollment}`,
    `journalScope=student&journalStudentId=${ids.student}&journalOrigin=student&journalReturnStudentId=${ids.peer}`,
  ])('rejects ambiguous broadening or a different student return: %s', query => {
    expect(readEducationJournalWorkspaceRoute(new URLSearchParams('journalView=workspace&' + query))).toEqual({ state: 'invalid' });
  });
  it('keeps a group return department and participant filter', () => {
    const url = educationJournalReturnPath({ kind: 'group', groupId: ids.group, department: 'Цех', participantSearch: 'Иванов' });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('department')).toBe('Цех'); expect(params.get('participantSearch')).toBe('Иванов');
  });
  it('keeps an exact journal source group separate from the navigation return group', () => {
    const path = educationJournalWorkspacePath(scope, 'current_control', { kind: 'student', studentId: ids.student, enrollmentId: ids.enrollment, groupId: ids.peer });
    const route = readEducationJournalWorkspaceRoute(new URLSearchParams(path.split('?')[1]));
    expect(route.state).toBe('ready'); if (route.state !== 'ready') throw Error('route');
    const back = new URLSearchParams(educationJournalReturnPath(route.origin).split('?')[1]);
    expect(back.get('studentJournalGroupId')).toBe(ids.group); expect(back.get('returnToGroupId')).toBe(ids.peer);
  });
  it('does not turn a navigation return group into a filter for another enrollment', () => {
    const target = { ...scope, group_id: null };
    const route = readEducationJournalWorkspaceRoute(new URLSearchParams(educationJournalWorkspacePath(target, 'current_control', { kind: 'student', studentId: ids.student, enrollmentId: ids.enrollment, groupId: ids.group }).split('?')[1]));
    expect(route).toMatchObject({ state: 'ready', scope: target }); if (route.state !== 'ready') throw Error('route');
    const back = new URLSearchParams(educationJournalReturnPath(route.origin).split('?')[1]);
    expect(back.get('returnToGroupId')).toBe(ids.group); expect(back.has('studentJournalGroupId')).toBe(false);
    expect(resolveTabParams(back, 'courses').has('studentJournalGroupId')).toBe(false);
  });
});
