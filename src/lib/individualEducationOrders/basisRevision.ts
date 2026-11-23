import { z } from 'zod';
import { sameCopyValue } from '@/lib/copyRegistry/value';
import { createDocumentUploadOperation } from '@/lib/orgDocumentLifecycle';
import { validateProgramPdf, type ScopedOrgDocumentTransport } from '@/lib/programFiles';
import { individualOrderScopeCurrent, IndividualOrderError, type IndividualOrderScope } from './client';
import { OrderBasisInputError, type SavedOrderBasis } from './basisUpload';

const uuid = z.string().uuid();
const metadataSchema = z.object({ name: z.string().min(1).max(200), type: z.literal('other'), issue_date: z.string().nullable(),
  expires_at: z.string().nullable(), responsible_person: z.string().nullable() }).strict();
const headSchema = z.object({ id: uuid, organization_id: uuid, name: z.string().min(1).max(200), type: z.literal('other'),
  document_revision: z.number().int().positive(), current_version_id: uuid, status: z.literal('active'), deleted_at: z.null(),
  issue_date: z.string().nullable(), expires_at: z.string().nullable(), responsible_person: z.string().nullable() });
const versionSchema = z.object({ id: uuid, organization_id: uuid, document_id: uuid, version_number: z.number().int().positive(),
  request_id: uuid.nullable(), result_revision: z.number().int().positive().nullable(), file_path: z.string().nullable(),
  file_name: z.string().nullable(), file_size: z.number().int().nonnegative().nullable(), document_metadata: metadataSchema });
const sourceChanged = (): never => { throw new IndividualOrderError('SOURCE_CHANGED'); };
/** This operation has never submitted a version write; a fresh human intent may safely replace it. */
export class OrderBasisRevisionNotApplied extends IndividualOrderError {
  constructor() { super('SOURCE_CHANGED'); this.name = 'OrderBasisRevisionNotApplied'; }
}
const day = (value: string) => { const date = new Date(value + 'T00:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; };
const metadata = (head: z.infer<typeof headSchema>) => ({ name: head.name, type: head.type, issue_date: head.issue_date,
  expires_at: head.expires_at, responsible_person: head.responsible_person });
const savedValue = (head: z.infer<typeof headSchema>): SavedOrderBasis => Object.freeze({ id: head.id, organization_id: head.organization_id,
  name: head.name, type: head.type, document_revision: head.document_revision, current_version_id: head.current_version_id, status: head.status, deleted_at: head.deleted_at });

/** Append an explicitly dated source version. Keep this operation after an uncertain response. */
export async function prepareOrderBasisRevision(scope: IndividualOrderScope, transport: ScopedOrgDocumentTransport, saved: SavedOrderBasis,
  input: { file: File; issueDate: string; reason: string }) {
  const bound = Object.freeze({ ...scope }), transportKey = transport.key;
  const current = () => {
    if (!individualOrderScopeCurrent(bound) || !sameCopyValue(scope, bound) || transport.key !== transportKey) throw new IndividualOrderError('ACCESS_DENIED');
    transport.assertCurrent();
  };
  current();
  const expected = Object.freeze({ ...saved }), issueDate = input.issueDate, reason = input.reason.trim();
  if (!day(issueDate)) throw new OrderBasisInputError('Укажите точную дату исходного документа.');
  if (!reason || reason.length > 2000 || /[\x00-\x1f\x7f]/.test(reason)) throw new OrderBasisInputError('Укажите причину новой версии документа.');
  if (!uuid.safeParse(expected.id).success || !uuid.safeParse(expected.current_version_id).success || expected.organization_id !== bound.organizationId
    || expected.type !== 'other' || expected.status !== 'active' || expected.deleted_at !== null || !Number.isSafeInteger(expected.document_revision)
    || expected.document_revision < 1 || expected.document_revision >= Number.MAX_SAFE_INTEGER) sourceChanged();
  if (!input.file) throw new OrderBasisInputError('Выберите исходный PDF до 20 МБ.');
  let file: File;
  try { file = await validateProgramPdf(input.file); } catch { throw new OrderBasisInputError('Выберите непустой исходный PDF до 20 МБ.'); }
  current();
  const readHead = async () => {
    current(); const response = await transport.readDocument(expected.id); current(); if (response.error) throw response.error;
    const parsed = headSchema.safeParse(response.data);
    if (!parsed.success || parsed.data.id !== expected.id || parsed.data.organization_id !== bound.organizationId || !Number.isSafeInteger(parsed.data.document_revision)) sourceChanged();
    return parsed.data;
  };
  const readVersions = async () => {
    current(); const response = await transport.readVersions(expected.id); current(); if (response.error) throw response.error;
    const parsed = z.array(versionSchema).max(1000).safeParse(response.data);
    if (!parsed.success || parsed.data.some(row => row.organization_id !== bound.organizationId || row.document_id !== expected.id)
      || new Set(parsed.data.map(row => row.id)).size !== parsed.data.length) sourceChanged();
    return parsed.data;
  };
  const originalHead = await readHead();
  if (!sameCopyValue(savedValue(originalHead), expected)) sourceChanged();
  const originalRows = await readVersions(), originalVersion = originalRows.find(row => row.id === expected.current_version_id);
  if (!originalVersion || originalVersion.result_revision !== null && originalVersion.result_revision !== expected.document_revision
    || !sameCopyValue(originalVersion.document_metadata, metadata(originalHead))) sourceChanged();
  const originalMetadata = Object.freeze({ ...originalVersion.document_metadata });
  const nextMetadata = Object.freeze({ ...originalMetadata, issue_date: issueDate });
  if (nextMetadata.expires_at !== null && (!day(nextMetadata.expires_at) || nextMetadata.expires_at < issueDate)) throw new OrderBasisInputError('Дата документа не должна быть позднее срока действия.');
  const operation = createDocumentUploadOperation({ organizationId: bound.organizationId, documentId: expected.id,
    expectedRevision: expected.document_revision, file, document: { issue_date: issueDate }, changeSummary: reason });
  const readCommitted = async (head: Awaited<ReturnType<typeof readHead>>, rows: Awaited<ReturnType<typeof readVersions>>) => {
    const version = rows.find(row => row.id === head.current_version_id);
    if (head.document_revision !== expected.document_revision + 1 || !version || version.id === originalVersion.id || version.version_number <= originalVersion.version_number
      || version.request_id !== operation.requestId || version.result_revision !== head.document_revision || version.file_path !== operation.path
      || version.file_name !== file.name || version.file_size !== file.size || !sameCopyValue(version.document_metadata, nextMetadata)
      || !sameCopyValue(metadata(head), nextMetadata)) sourceChanged();
    const previous = rows.find(row => row.id === originalVersion.id);
    if (!sameCopyValue(previous, originalVersion)) sourceChanged();
    // The immutable version is the date witness; the current row alone is insufficient.
    const finalHead = await readHead();
    if (!sameCopyValue(finalHead, head)) sourceChanged();
    return savedValue(finalHead);
  };
  let flight: Promise<SavedOrderBasis> | null = null, submitted = false;
  return Object.freeze({ documentId: operation.documentId, requestId: operation.requestId, expectedRevision: expected.document_revision,
    expectedVersionId: expected.current_version_id, issueDate,
    run() {
      current();
      if (!flight) flight = (async () => {
        try {
          const head = await readHead(), rows = await readVersions();
          if (head.document_revision === expected.document_revision + 1) return await readCommitted(head, rows);
          if (!sameCopyValue(head, originalHead) || !sameCopyValue(rows.find(row => row.id === originalVersion.id), originalVersion)) sourceChanged();
          // Remains true after an uncertain result. A later readback error cannot prove no write occurred.
          submitted = true;
          const result = await transport.saveUpload(operation); current();
          if (result.document_id !== expected.id || result.revision !== expected.document_revision + 1 || !uuid.safeParse(result.version_id).success) sourceChanged();
          const committedHead = await readHead();
          if (committedHead.current_version_id !== result.version_id || committedHead.document_revision !== result.revision) sourceChanged();
          return await readCommitted(committedHead, await readVersions());
        } catch (error) {
          if (!submitted && error instanceof IndividualOrderError && error.code === 'SOURCE_CHANGED') throw new OrderBasisRevisionNotApplied();
          throw error;
        }
      })().finally(() => { flight = null; });
      return flight;
    },
  });
}
