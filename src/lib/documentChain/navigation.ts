import { groupFolderPath, studentDetailsPath } from '@/lib/groups/groupContext';
import { educationDocumentsJournalPath } from '@/lib/organization/documentWorkspaceNavigation';
import { chainQuerySchema, type ChainAction, type ChainQuery, type ChainRow, type ChainSourceRef } from './contract';

const fields = ['documentChainKind', 'documentChainId', 'documentChainRevision', 'documentChainDocumentId', 'documentChainVersionId', 'documentChainProofHash', 'documentChainEnrollmentId', 'documentChainGroupId', 'documentChainJournalType', 'documentChainRowId', 'documentChainSourceId', 'documentChainSourceRevision'] as const;
export function clearDocumentChainSourceParams(current: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(current); fields.forEach(field => next.delete(field)); return next;
}
export function documentChainSourcePath(current: URLSearchParams, row: Pick<ChainRow, 'enrollment_id' | 'group_id'>, source: ChainSourceRef, basePath: '/organization' | '/student' = '/organization'): string {
  const next = clearDocumentChainSourceParams(current);
  next.set('documentChainKind', source.kind); next.set('documentChainEnrollmentId', row.enrollment_id);
  if (row.group_id) next.set('documentChainGroupId', row.group_id);
  if (source.kind === 'org_document_version') {
    next.set('documentChainDocumentId', source.document_id); next.set('documentChainVersionId', source.version_id); next.set('documentChainProofHash', source.proof_hash);
  } else {
    next.set('documentChainId', source.id); next.set('documentChainRevision', String(source.revision));
    if (source.kind === 'registry_record') { next.set('documentChainDocumentId', source.document_id); next.set('documentChainVersionId', source.version_id); }
  }
  return basePath + '?' + next.toString();
}
export function documentChainJournalSourcePath(current: URLSearchParams, query: Extract<ChainQuery, { kind: 'journal_source' }>): string {
  const parsed = chainQuerySchema.parse(query); if (parsed.kind !== 'journal_source') throw new Error('Invalid journal source');
  const next = clearDocumentChainSourceParams(current);
  next.set('documentChainKind', 'journal_source'); next.set('documentChainJournalType', parsed.journal_type);
  next.set('documentChainRowId', parsed.row_id); next.set('documentChainSourceId', parsed.source_id);
  if (parsed.source_revision !== null) next.set('documentChainSourceRevision', String(parsed.source_revision));
  if (parsed.enrollment_id) next.set('documentChainEnrollmentId', parsed.enrollment_id);
  if (parsed.group_id) next.set('documentChainGroupId', parsed.group_id);
  return '/organization?' + next.toString();
}
type SourceRoute = { state: 'none' } | { state: 'invalid' } | { state: 'ready'; query: Extract<ChainQuery, { kind: 'source' | 'journal_source' }> };
export function readDocumentChainSourceRoute(params: URLSearchParams): SourceRoute {
  if (!fields.some(field => params.has(field))) return { state: 'none' };
  if (fields.some(field => params.getAll(field).length > 1)) return { state: 'invalid' };
  const kind = params.get('documentChainKind'), enrollment_id = params.get('documentChainEnrollmentId'), group_id = params.get('documentChainGroupId');
  let query: unknown;
  if (kind === 'journal_source') {
    if (['documentChainId', 'documentChainRevision', 'documentChainDocumentId', 'documentChainVersionId', 'documentChainProofHash'].some(key => params.has(key))) return { state: 'invalid' };
    const raw = params.get('documentChainSourceRevision');
    if (raw !== null && !/^\d+$/.test(raw)) return { state: 'invalid' };
    query = { kind, journal_type: params.get('documentChainJournalType'), row_id: params.get('documentChainRowId'), source_id: params.get('documentChainSourceId'), source_revision: raw === null ? null : Number(raw), enrollment_id, group_id };
  } else {
    if (['documentChainJournalType', 'documentChainRowId', 'documentChainSourceId', 'documentChainSourceRevision'].some(key => params.has(key))) return { state: 'invalid' };
    const id = params.get('documentChainId'), rawRevision = params.get('documentChainRevision');
    if (rawRevision !== null && !/^\d+$/.test(rawRevision)) return { state: 'invalid' };
    let source: unknown;
    if (kind === 'admission_draft' || kind === 'education_record') source = { kind, id, revision: Number(rawRevision), enrollment_id, ...(kind === 'admission_draft' ? { group_id } : {}) };
    else if (kind === 'registry_record') source = { kind, id, revision: Number(rawRevision), document_id: params.get('documentChainDocumentId'), version_id: params.get('documentChainVersionId') };
    else if (kind === 'org_document_version') source = { kind, document_id: params.get('documentChainDocumentId'), version_id: params.get('documentChainVersionId'), proof_hash: params.get('documentChainProofHash') };
    else return { state: 'invalid' };
    const permitted = kind === 'registry_record' ? ['documentChainDocumentId', 'documentChainVersionId'] : kind === 'org_document_version' ? ['documentChainDocumentId', 'documentChainVersionId', 'documentChainProofHash'] : [];
    if (['documentChainDocumentId', 'documentChainVersionId', 'documentChainProofHash'].some(field => params.has(field) && !permitted.includes(field)) || kind === 'org_document_version' && (id !== null || rawRevision !== null)) return { state: 'invalid' };
    query = { kind: 'source', enrollment_id, group_id, source };
  }
  const parsed = chainQuerySchema.safeParse(query);
  return parsed.success && (parsed.data.kind === 'source' || parsed.data.kind === 'journal_source') ? { state: 'ready', query: parsed.data as Extract<ChainQuery, { kind: 'source' | 'journal_source' }> } : { state: 'invalid' };
}
export function documentChainActionPath(current: URLSearchParams, row: ChainRow, action: ChainAction): string {
  if (action.kind === 'open_source') return documentChainSourcePath(current, row, action.source);
  if (action.kind === 'review_group_program') return groupFolderPath(action.group_id, 'docs');
  if (action.kind === 'review_issuance') return educationDocumentsJournalPath({ enrollmentId: action.enrollment_id });
  const fromGroup = current.get('tab') === 'group-folder';
  const params = new URLSearchParams(studentDetailsPath(row.student_user_id, { groupId: fromGroup ? current.get('groupId') : current.get('returnToGroupId'), department: fromGroup ? current.get('department') : current.get('returnDepartment'), participantSearch: fromGroup ? current.get('participantSearch') : current.get('returnParticipantSearch') }).split('?')[1]);
  params.set('studentSection', action.kind === 'review_completion' ? 'results' : 'documents');
  params.set('studentJournalEnrollmentId', row.enrollment_id);
  if (row.group_id) params.set('studentJournalGroupId', row.group_id);
  if (action.kind !== 'review_completion') params.set('documentChainFocus', 'admission_settings');
  return '/organization?' + params.toString();
}
