import { describe, expect, it } from 'vitest';
import { ids, row, scope } from './fixtures';
import { journalStudentDocumentsPath, studentDocumentJournalReturnPath, STUDENT_JOURNAL_RETURN } from '../studentDocumentRoute';
import { readEducationJournalWorkspaceRoute } from '../navigation';
import { resolveTabParams } from '@/lib/groups/groupContext';

const registry = () => ({ ...row(), journal_type: 'document_registration' as const, id: 'registry:unrelated', source_id: 'not-a-file-id', title: 'Любое название документа' });
const params = (path: string | null) => { if (!path) throw Error('missing path'); return new URLSearchParams(path.split('?')[1]); };
const origin = { kind: 'student' as const, studentId: ids.student, enrollmentId: ids.enrollment, groupId: ids.peer, department: 'Цех', participantSearch: 'Иванов' };
const route = () => params(journalStudentDocumentsPath(ids.org, scope, 'document_registration', origin, registry()));

describe('registry → exact learner documents → same journal', () => {
  it('roundtrips after reload with exact source scope, enrollment and independent return group', () => {
    const target = route();
    expect(target.get('studentId')).toBe(ids.student);
    expect(target.get('studentJournalEnrollmentId')).toBe(ids.enrollment);
    expect(target.get('studentJournalGroupId')).toBe(ids.group);
    expect(target.get('returnToGroupId')).toBe(ids.peer);
    expect(target.get('studentSection')).toBe('documents');
    expect(target.has('documentChainId')).toBe(false);
    const back = readEducationJournalWorkspaceRoute(params(studentDocumentJournalReturnPath(new URLSearchParams(target.toString()), ids.org)));
    expect(back).toMatchObject({ state: 'ready', scope, journalType: 'document_registration', origin: { ...origin, studentGroupId: ids.group } });
  });
  it('returns organization and group rows to their original workspace without guessing a document type', () => {
    for (const target of [{ kind: 'organization' as const }, { kind: 'group' as const, group_id: ids.group }]) {
      const from = target.kind === 'group' ? { kind: 'group' as const, groupId: ids.group, participantSearch: 'Фильтр' } : { kind: 'organization' as const };
      const link = params(journalStudentDocumentsPath(ids.org, target, 'document_registration', from, registry()));
      expect(readEducationJournalWorkspaceRoute(params(studentDocumentJournalReturnPath(link, ids.org)))).toMatchObject({ state: 'ready', scope: target, journalType: 'document_registration', origin: from });
      expect(link.toString()).not.toContain('not-a-file-id');
    }
  });
  it('never broadens an unbound or mismatched row into all student documents', () => {
    for (const patch of [{ student_user_id: null }, { enrollment_id: null }, { course_id: null }, { student_user_id: ids.peer }, { enrollment_id: ids.peer }, { group_id: null }]) {
      expect(journalStudentDocumentsPath(ids.org, scope, 'document_registration', origin, { ...registry(), ...patch })).toBeNull();
    }
    expect(journalStudentDocumentsPath(ids.org, scope, 'activity', origin, registry())).toBeNull();
  });
  it('rejects a return carried into another organization, learner, enrollment or group', () => {
    expect(studentDocumentJournalReturnPath(route(), ids.peer)).toBeNull();
    for (const [key, value] of [['studentId', ids.peer], ['studentJournalEnrollmentId', ids.peer], ['studentJournalGroupId', ids.peer], ['tab', 'courses']]) {
      const target = route(); target.set(key, value);
      expect(studentDocumentJournalReturnPath(target, ids.org)).toBeNull();
    }
  });
  it('rejects external paths, malformed/oversized/extra-field and inconsistent structured returns', () => {
    const valid = route(); const data = JSON.parse(valid.get(STUDENT_JOURNAL_RETURN)!);
    const bad = ['https://example.test/private', '{', 'x'.repeat(8001), JSON.stringify({ ...data, url: 'https://example.test' }), JSON.stringify({ ...data, origin: { kind: 'student', studentId: ids.peer } })];
    for (const raw of bad) { const target = route(); target.set(STUDENT_JOURNAL_RETURN, raw); expect(studentDocumentJournalReturnPath(target, ids.org)).toBeNull(); }
  });
  it('clears the return intention on a top-level section switch', () => {
    const target = route();
    expect(resolveTabParams(target, 'student-details').has(STUDENT_JOURNAL_RETURN)).toBe(true);
    for (const tab of ['courses', 'documents', 'students', 'journals']) expect(resolveTabParams(target, tab).has(STUDENT_JOURNAL_RETURN)).toBe(false);
  });
});
