import { z } from 'zod';
import { createDocumentUploadOperation } from '@/lib/orgDocumentLifecycle';
import { createScopedOrgDocumentTransport, validateProgramPdf, type ScopedOrgDocumentTransport } from '@/lib/programFiles';
import { captureDocumentRegistryScope, readDocumentRegistry } from '@/lib/documentRegistry/client';
import { individualOrderScopeCurrent, IndividualOrderError, type IndividualOrderScope } from './client';

const id = z.string().uuid();
const savedSchema = z.object({ id, organization_id: id, name: z.string().min(1).max(200), type: z.literal('other'),
  document_revision: z.number().int().positive(), current_version_id: id, status: z.literal('active'), deleted_at: z.null() });
export type SavedOrderBasis = z.infer<typeof savedSchema>;
export interface BasisUploadInput { name: string; file: File; issueDate: string; expiresAt: string; responsible: string }
export class OrderBasisInputError extends Error { constructor(message: string) { super(message); this.name = 'OrderBasisInputError'; } }
export class OrderBasisCatalogueDocument extends IndividualOrderError { constructor() { super('SOURCE_CHANGED'); this.name = 'OrderBasisCatalogueDocument'; } }
const current = (scope: IndividualOrderScope) => { if (!individualOrderScopeCurrent(scope)) throw new IndividualOrderError('ACCESS_DENIED'); };
const day = (value: string) => { const date = new Date(value + 'T00:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; };

/** Existing generic document transport: real current session, private versions, ordinary write rights. */
export function orderBasisTransport(scope: IndividualOrderScope, isCurrent: () => boolean): ScopedOrgDocumentTransport {
  return createScopedOrgDocumentTransport({ actorId: scope.actorId, organizationId: scope.organizationId,
    accessRevision: scope.accessRevision, key: ['order-basis', scope.organizationId, scope.enrollmentId, scope.actorId, scope.accessRevision].join(':'),
    current: () => isCurrent() && individualOrderScopeCurrent(scope) }, true);
}
export async function readSavedOrderBasis(scope: IndividualOrderScope, transport: ScopedOrgDocumentTransport, documentId: string): Promise<SavedOrderBasis> {
  current(scope); transport.assertCurrent();
  const result = await transport.readDocument(documentId); current(scope); transport.assertCurrent();
  if (result.error) throw result.error;
  const raw = result.data as { id?: unknown; organization_id?: unknown; type?: unknown } | null;
  if (raw?.id === documentId && raw.organization_id === scope.organizationId && typeof raw.type === 'string' && raw.type !== 'other') throw new OrderBasisCatalogueDocument();
  const value = savedSchema.safeParse(result.data);
  if (!value.success || value.data.id !== documentId || value.data.organization_id !== scope.organizationId) throw new IndividualOrderError('SOURCE_CHANGED');
  return Object.freeze(value.data as SavedOrderBasis);
}

/** A separate `other` document, never a fixed catalogue slot or a programme file. Keep this operation on an unknown response. */
export async function prepareOrderBasisUpload(scope: IndividualOrderScope, transport: ScopedOrgDocumentTransport, input: BasisUploadInput) {
  current(scope); transport.assertCurrent();
  const name = input.name.trim(), responsible = input.responsible.trim();
  if (!name || name.length > 200 || responsible.length > 200 || /[\x00-\x1f\x7f]/.test(name + responsible)) throw new OrderBasisInputError('Укажите понятное название документа и ответственного.');
  if (input.issueDate && !day(input.issueDate) || input.expiresAt && !day(input.expiresAt) || input.issueDate && input.expiresAt && input.expiresAt < input.issueDate) throw new OrderBasisInputError('Проверьте даты документа.');
  if (!input.file) throw new OrderBasisInputError('Выберите исходный PDF до 20 МБ.');
  let file: File;
  try { file = await validateProgramPdf(input.file); } catch { throw new OrderBasisInputError('Выберите непустой исходный PDF до 20 МБ.'); }
  current(scope); transport.assertCurrent();
  const operation = createDocumentUploadOperation({ organizationId: scope.organizationId, expectedRevision: 0, file,
    document: { name, type: 'other', status: 'active', issue_date: input.issueDate || null, expires_at: input.expiresAt || null, responsible_person: responsible || null },
    changeSummary: 'Отдельный исходный документ для основания приказа. Внутреннее рассмотрение и решение оформляются отдельно.' });
  let flight: Promise<SavedOrderBasis> | null = null;
  return Object.freeze({ documentId: operation.documentId, requestId: operation.requestId,
    run() {
      current(scope); transport.assertCurrent();
      if (!flight) flight = (async () => {
        const committed = await transport.saveUpload(operation); current(scope); transport.assertCurrent();
        if (committed.document_id !== operation.documentId || !id.safeParse(committed.version_id).success || !Number.isSafeInteger(committed.revision) || committed.revision < 1) throw new IndividualOrderError('SOURCE_CHANGED');
        const saved = await readSavedOrderBasis(scope, transport, operation.documentId);
        if (saved.current_version_id !== committed.version_id || saved.document_revision !== committed.revision) throw new IndividualOrderError('SOURCE_CHANGED');
        return saved;
      })().finally(() => { flight = null; });
      return flight;
    },
  });
}

/** Resolve only server-issued upload IDs through the normal protected source reader; never construct a content hash. */
export async function readSavedOrderBasisChoice(scope: IndividualOrderScope, saved: SavedOrderBasis) {
  current(scope);
  const registry = captureDocumentRegistryScope(scope.organizationId, { kind: 'organization' }, () => individualOrderScopeCurrent(scope));
  if (registry.actorId !== scope.actorId || registry.accessRevision !== scope.accessRevision || saved.organization_id !== scope.organizationId) throw new IndividualOrderError('ACCESS_DENIED');
  const value = await readDocumentRegistry(registry, { kind: 'source', document_id: saved.id, version_id: saved.current_version_id }); current(scope);
  if (value.kind !== 'source' || value.source.source.document_id !== saved.id || value.source.source.version_id !== saved.current_version_id) throw new IndividualOrderError('SOURCE_CHANGED');
  return value.source;
}
