import { describe, expect, it } from 'vitest';
import { clearDocumentChainSourceParams, documentChainActionPath, documentChainJournalSourcePath, documentChainSourcePath, readDocumentChainSourceRoute } from '../navigation';
import { enrollment, group, id, pupil, row, source } from './fixtures';
describe('document chain exact source navigation', () => {
  it('round-trips a registered immutable source and preserves the caller context', () => {
    const current = new URLSearchParams({ tab: 'student-details', studentId: pupil, studentSection: 'documents', returnToGroupId: group, studentJournalEnrollmentId: enrollment });
    const ref = source().source, path = documentChainSourcePath(current, row(), ref), params = new URLSearchParams(path.split('?')[1]);
    expect(readDocumentChainSourceRoute(params)).toEqual({ state: 'ready', query: { kind: 'source', enrollment_id: enrollment, group_id: group, source: ref } });
    expect(params.get('returnToGroupId')).toBe(group); expect(clearDocumentChainSourceParams(params)).toEqual(current);
  });
  it('retains exact journal row identity rather than replacing it with a latest file', () => {
    const q = { kind: 'journal_source' as const, journal_type: 'admission_orders' as const, row_id: 'registered-admission:' + id(8), source_id: id(8), source_revision: 2, enrollment_id: enrollment, group_id: group };
    const path = documentChainJournalSourcePath(new URLSearchParams({ tab: 'journals', journalView: 'workspace' }), q);
    expect(readDocumentChainSourceRoute(new URLSearchParams(path.split('?')[1]))).toEqual({ state: 'ready', query: q });
  });
  it.each(['1oops', '-1', 'Infinity', '1.5'])('rejects malformed source revision %s', revision => {
    const params = new URLSearchParams(documentChainSourcePath(new URLSearchParams(), row(), source().source).split('?')[1]); params.set('documentChainRevision', revision);
    expect(readDocumentChainSourceRoute(params)).toEqual({ state: 'invalid' });
  });
  it('rejects partial, mixed, or arbitrary source parameters', () => {
    expect(readDocumentChainSourceRoute(new URLSearchParams({ documentChainKind: 'url', documentChainId: 'https://foreign.invalid' })).state).toBe('invalid');
    const params = new URLSearchParams(documentChainSourcePath(new URLSearchParams(), row(), source().source).split('?')[1]); params.set('documentChainJournalType', 'activity');
    expect(readDocumentChainSourceRoute(params).state).toBe('invalid');
  });
  it('opens existing issuance and admission routes without creating an order', () => {
    const current = new URLSearchParams({ returnToGroupId: id(90), returnDepartment: 'Отдел', returnParticipantSearch: 'Иванов' });
    const admission = documentChainActionPath(current, row(), { kind: 'choose_group', enrollment_id: enrollment });
    expect(admission).toContain('studentSection=documents'); expect(admission).toContain('documentChainFocus=admission_settings');
    expect(new URLSearchParams(admission.split('?')[1]).get('returnToGroupId')).toBe(id(90));
    const issued = documentChainActionPath(current, row(), { kind: 'review_issuance', enrollment_id: enrollment, course_id: id(5), group_id: group });
    expect(issued).toContain('journal=education_documents'); expect(issued).toContain('educationEnrollmentId=' + enrollment);
  });
});
