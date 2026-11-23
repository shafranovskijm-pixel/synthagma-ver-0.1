import { captureAdmissionDocumentScope, readAutomaticAdmissionDraft } from '@/lib/admissionDocuments/client';
import { renderAdmissionDraft } from '@/lib/admissionDocuments/render';
import { captureDocumentRegistryScope, readDocumentRegistry } from '@/lib/documentRegistry/client';
import { loadRegistryFile } from '@/lib/documentRegistry/files';
import { captureIssuanceScope, readEducationIssuance, type EducationIssuanceScope } from '@/lib/educationIssuance/client';
import { downloadIssuedPdf } from '@/lib/educationIssuance/artifactDownload';
import { DocumentChainError, documentChainScopeCurrent, readDocumentChain, requireDocumentChainScope, type DocumentChainScope } from './client';
import type { ChainQuery } from './contract';

export type OpenedChainDocument =
  | { kind: 'draft'; title: string; html: string }
  | { kind: 'file'; title: string; blob: Blob; fileName: string; mime: string }
  | { kind: 'education'; title: string; number: string; recordId: string; revision: number; scope: EducationIssuanceScope };
export async function openDocumentChainSource(scope: DocumentChainScope, query: Extract<ChainQuery, { kind: 'source' | 'journal_source' }>): Promise<OpenedChainDocument> {
  const value = await readDocumentChain(scope, query); requireDocumentChainScope(scope);
  if (value.kind !== 'source' && value.kind !== 'journal_source') throw new DocumentChainError();
  if (value.availability !== 'available' || !value.target || !value.source) throw new DocumentChainError('NOT_FOUND', value.why || undefined);
  if (value.viewer === 'self') throw new DocumentChainError('ACCESS_DENIED');
  const { target, context, source } = value, current = () => documentChainScopeCurrent(scope);
  if (!context.enrollment_id || !context.student_user_id || !context.course_id) throw new DocumentChainError('SOURCE_CHANGED');
  if (target.kind === 'admission_draft') {
    if (value.viewer !== 'staff') throw new DocumentChainError('ACCESS_DENIED');
    const captured = captureAdmissionDocumentScope(scope.organizationId, { kind: 'enrollment', enrollmentId: context.enrollment_id, groupId: context.group_id }, current);
    const draft = await readAutomaticAdmissionDraft(captured, target.draft); requireDocumentChainScope(scope);
    return { kind: 'draft', title: 'Проект приказа о зачислении', html: renderAdmissionDraft(draft) };
  }
  const registryScope = context.group_id ? { kind: 'group' as const, group_id: context.group_id } : { kind: 'organization' as const };
  if (target.kind === 'registry_record' && source.kind === 'registry_record') {
    if (value.viewer !== 'staff') throw new DocumentChainError('ACCESS_DENIED');
    const captured = captureDocumentRegistryScope(scope.organizationId, registryScope, current);
    const detail = await readDocumentRegistry(captured, { kind: 'detail', record_id: target.record_id }); requireDocumentChainScope(scope);
    if (detail.kind !== 'detail') throw new DocumentChainError('SOURCE_CHANGED');
    const record = detail.record, binding = record.context_binding, recordedSource = record.data.source;
    if (record.id !== source.id || record.revision !== source.revision || !record.can_open_file || recordedSource.kind !== 'org_document_version'
      || recordedSource.document_id !== source.document_id || recordedSource.version_id !== source.version_id
      || record.data.subject.kind !== 'student' || record.data.subject.user_id !== context.student_user_id
      || binding.kind === 'frdo_packet' || binding.user_id !== context.student_user_id || binding.enrollment_id !== context.enrollment_id || binding.course_id !== context.course_id)
      throw new DocumentChainError('SOURCE_CHANGED');
    const file = await readDocumentRegistry(captured, { kind: 'file', record_id: record.id, record_revision: record.revision }); requireDocumentChainScope(scope);
    if (file.kind !== 'file') throw new DocumentChainError('SOURCE_CHANGED');
    const blob = await loadRegistryFile(captured, file.file, recordedSource); requireDocumentChainScope(scope);
    return { kind: 'file', title: record.data.title, blob, fileName: file.file.file_name, mime: file.file.mime };
  }
  if (target.kind === 'education_record') {
    const captured = captureIssuanceScope(scope.organizationId, registryScope, current);
    const detail = await readEducationIssuance(captured, { kind: 'record', record_id: target.record_id }); requireDocumentChainScope(scope);
    if (detail.kind !== 'record' || detail.record.revision !== target.revision || detail.record.official.enrollment_id !== context.enrollment_id
      || detail.record.official.user_id !== context.student_user_id || detail.record.official.course_id !== context.course_id
      || detail.record.artifact.availability !== 'available') throw new DocumentChainError('SOURCE_CHANGED');
    return { kind: 'education', title: 'Выданный документ об обучении', number: detail.record.official.document_number,
      recordId: target.record_id, revision: target.revision, scope: captured };
  }
  // No generic storage/URL fallback for a source without an individual registered binding.
  throw new DocumentChainError('NOT_FOUND');
}
export async function downloadChainEducationDocument(value: Extract<OpenedChainDocument, { kind: 'education' }>) {
  return downloadIssuedPdf(value.scope, value.recordId, value.revision);
}
