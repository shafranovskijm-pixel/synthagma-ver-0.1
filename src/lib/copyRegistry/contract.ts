import { z } from 'zod';
import { journalHash, journalUuid } from '@/lib/customJournals/contract';

/** Values reach callers only after strict runtime validation; compensate for this project's strictNullChecks:false inference. */
type Validated<T> = T extends (infer Item)[] ? Validated<Item>[] : T extends object ? { [Key in keyof T]-?: Validated<T[Key]> } : T;

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const instant = z.string().max(64).datetime({ offset: true });
const reason = z.string().trim().min(1).max(2000);
const label = z.string().max(1000);
export const copyDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
export const copyScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('organization') }).strict(),
  z.object({ kind: z.literal('group'), group_id: journalUuid }).strict(),
]);
export type CopyScope = Validated<z.infer<typeof copyScopeSchema>>;
export const sameCopyScope = (a: CopyScope, b: CopyScope) => a.kind === b.kind && (a.kind === 'organization' || b.kind === 'group' && a.group_id === b.group_id);
export const copyVerifiedOriginalSchema = z.object({ kind: z.literal('org_document_version'), document_id: journalUuid, version_id: journalUuid, content_hash: journalHash }).strict();
export type CopyVerifiedOriginal = Validated<z.infer<typeof copyVerifiedOriginalSchema>>;
export const copyOriginalSchema = z.discriminatedUnion('kind', [
  copyVerifiedOriginalSchema,
  z.object({ kind: z.literal('unresolved'), document_type: z.string().max(100), document_number: z.string().max(120), issue_date: z.string().max(80), explanation: reason }).strict(),
]);
export const copySubjectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('person'), user_id: journalUuid }).strict(),
]);
export const copyRecipientSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('person'), user_id: journalUuid }).strict(),
  z.object({ kind: z.literal('external'), name: z.string().trim().min(1).max(300), capacity: z.enum(['self', 'representative', 'organization', 'other']) }).strict(),
]);
export const copyDataSchema = z.object({
  copy_type: z.enum(['copy', 'duplicate']), declared_number: z.string().max(120).nullable(), document_date: copyDateSchema,
  original: copyOriginalSchema, subject: copySubjectSchema, recipient: copyRecipientSchema,
  basis: z.object({ reason: z.enum(['lost', 'damaged', 'name_change', 'employer_request', 'archive', 'other']), note: reason, evidence: copyVerifiedOriginalSchema.nullable() }).strict(),
  notes: z.string().max(4000),
}).strict();
export type CopyData = Validated<z.infer<typeof copyDataSchema>>;
export const copyTransferSchema = z.object({ method: z.enum(['in_person', 'mail', 'electronic', 'other']), reported_date: copyDateSchema, note: reason, evidence: copyVerifiedOriginalSchema.nullable() }).strict();
export type CopyTransfer = Validated<z.infer<typeof copyTransferSchema>>;
export const copyAttributedTransferSchema = copyTransferSchema.extend({ recorded_at: instant, recorded_by: journalUuid.nullable() }).strict();
export const copyRecordSchema = z.object({
  id: journalUuid, group_id: journalUuid.nullable(), registration_id: z.string().min(1).max(120), sequence_year: z.number().int().min(1).max(9999), sequence_number: revision,
  revision, archived: z.boolean(), redacted: z.literal(false), data: copyDataSchema, registered_at: instant, recorded_by: journalUuid.nullable(), updated_at: instant,
  subject_label: label.nullable(), recipient_label: label, original_label: label.nullable(), original_available: z.boolean(), recorded_by_label: label.nullable(), can_edit: z.boolean(), can_archive: z.boolean(), can_transfer: z.boolean(),
  latest_transfer: copyAttributedTransferSchema.nullable(),
}).strict();
export type CopyRecord = Validated<z.infer<typeof copyRecordSchema>>;
export const copyHistorySchema = z.object({
  id: journalUuid, record_id: journalUuid, revision, action: z.enum(['create', 'update', 'archive', 'transfer', 'import']), reason: z.string().max(2000),
  snapshot: z.object({ data: copyDataSchema, archived: z.boolean(), latest_transfer: copyAttributedTransferSchema.nullable() }).strict(),
  recorded_at: instant, recorded_by: journalUuid.nullable(), recorded_by_label: label.nullable(),
}).strict();
export type CopyHistory = Validated<z.infer<typeof copyHistorySchema>>;
export const copyCapabilitiesSchema = z.object({ can_read: z.literal(true), can_write: z.boolean(), can_create: z.boolean(), can_import: z.boolean(), can_inventory_local: z.boolean(), can_export: z.boolean() }).strict();
export type CopyCapabilities = Validated<z.infer<typeof copyCapabilitiesSchema>>;
const base = { schema_version: z.literal(1), organization_id: journalUuid, scope: copyScopeSchema, registry_revision: count, capabilities: copyCapabilitiesSchema };
const nextId = journalUuid.nullable();
export const copyExportSummarySchema = z.object({ id: journalUuid, registry_revision: count, created_at: instant, created_by: journalUuid.nullable(), record_count: count, history_count: count, manifest_bytes: count, manifest_sha256: journalHash, html_bytes: count, html_sha256: journalHash }).strict();
export type CopyExportSummary = Validated<z.infer<typeof copyExportSummarySchema>>;
export const copyExportSchema = copyExportSummarySchema.extend({ manifest_json: z.string().max(8 * 1024 * 1024), html: z.string().max(8 * 1024 * 1024) }).strict();
export type CopyExport = Validated<z.infer<typeof copyExportSchema>>;
export const copyExportManifestSchema = z.object({ schema_version: z.literal(1), organization_id: journalUuid, scope: copyScopeSchema, registry_revision: count, captured_at: instant, captured_by: journalUuid,
  records: z.array(copyRecordSchema).max(1000), history: z.array(copyHistorySchema).max(10000), counts: z.object({ records: count, history: count }).strict(),
}).strict();
export type CopyExportManifest = Validated<z.infer<typeof copyExportManifestSchema>>;
export const copyImportDecisionSchema = z.object({ index: count, choice: z.enum(['import', 'skip', 'reuse']), reason, existing_id: journalUuid.nullable() }).strict().refine(value => value.choice === 'reuse' ? value.existing_id !== null : value.existing_id === null);
export type CopyImportDecision = Validated<z.infer<typeof copyImportDecisionSchema>>;
const reportCounts = z.object({ imported: count, reused: count, skipped: count }).strict();
export const copyImportSummarySchema = z.object({ id: journalUuid, source_sha256: journalHash, preview_hash: journalHash, registry_revision: count, status: z.enum(['preview', 'applied']), created_at: instant, row_count: count, report_counts: reportCounts.nullable() }).strict();
export type CopyImportSummary = Validated<z.infer<typeof copyImportSummarySchema>>;
export const copyImportRowSchema = z.object({ index: count, source_digest: journalHash, legacy_id: z.string().max(1000).nullable(), conflicts: z.array(z.string().max(100)).max(20), valid: z.boolean(), existing_id: journalUuid.nullable(), candidate: copyDataSchema.nullable(), unknown_fields: z.array(z.string().max(1000)).max(1000) }).strict();
export const copyImportSchema = z.object({ id: journalUuid, source_raw: z.string().max(2 * 1024 * 1024), source_sha256: journalHash, preview_hash: journalHash, registry_revision: count,
  status: z.enum(['preview', 'applied']), created_at: instant, row_count: count, rows: z.array(copyImportRowSchema).max(1000),
  report: z.object({ decisions: z.array(copyImportDecisionSchema).max(1000), imported: count, reused: count, skipped: count }).strict().nullable(),
}).strict();
export type CopyImport = Validated<z.infer<typeof copyImportSchema>>;
const page = { after_id: nextId, limit: z.number().int().min(1).max(100) };
export const copyQuerySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('list'), ...page, archived: z.boolean() }).strict(),
  z.object({ kind: z.literal('detail'), record_id: journalUuid }).strict(),
  z.object({ kind: z.literal('history'), record_id: journalUuid, after_revision: count.nullable(), limit: z.number().int().min(1).max(100) }).strict(),
  z.object({ kind: z.literal('originals'), ...page }).strict(), z.object({ kind: z.literal('people'), ...page }).strict(),
  z.object({ kind: z.literal('imports'), ...page }).strict(), z.object({ kind: z.literal('import'), import_id: journalUuid }).strict(),
  z.object({ kind: z.literal('exports'), ...page }).strict(), z.object({ kind: z.literal('export'), export_id: journalUuid }).strict(),
]);
export type CopyQuery = Validated<z.infer<typeof copyQuerySchema>>;
export const copyReadSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('list'), records: z.array(copyRecordSchema).max(100), next_after_id: nextId }).strict(),
  z.object({ ...base, kind: z.literal('detail'), record: copyRecordSchema }).strict(),
  z.object({ ...base, kind: z.literal('history'), history: z.array(copyHistorySchema).max(100), next_after_revision: revision.nullable() }).strict(),
  z.object({ ...base, kind: z.literal('originals'), originals: z.array(z.object({ label, original: copyVerifiedOriginalSchema }).strict()).max(100), next_after_id: nextId }).strict(),
  z.object({ ...base, kind: z.literal('people'), people: z.array(z.object({ user_id: journalUuid, label }).strict()).max(100), next_after_id: nextId }).strict(),
  z.object({ ...base, kind: z.literal('imports'), imports: z.array(copyImportSummarySchema).max(100), next_after_id: nextId }).strict(),
  z.object({ ...base, kind: z.literal('import'), import: copyImportSchema }).strict(),
  z.object({ ...base, kind: z.literal('exports'), exports: z.array(copyExportSummarySchema).max(100), next_after_id: nextId }).strict(),
  z.object({ ...base, kind: z.literal('export'), export: copyExportSchema }).strict(),
]);
export type CopyRead = Validated<z.infer<typeof copyReadSchema>>;
const operationalData = copyDataSchema.refine(value => value.original.kind === 'org_document_version');
export const copyActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), data: operationalData }).strict(),
  z.object({ action: z.literal('update'), record_id: journalUuid, data: copyDataSchema, reason }).strict(),
  z.object({ action: z.literal('archive'), record_id: journalUuid, reason }).strict(),
  z.object({ action: z.literal('transfer'), record_id: journalUuid, transfer: copyTransferSchema, reason }).strict(),
  z.object({ action: z.literal('preview_import'), source_raw: z.string().max(2 * 1024 * 1024), source_sha256: journalHash }).strict(),
  z.object({ action: z.literal('apply_import'), import_id: journalUuid, source_sha256: journalHash, preview_hash: journalHash, decisions: z.array(copyImportDecisionSchema).max(1000) }).strict(),
  z.object({ action: z.literal('capture_export') }).strict(),
]);
export type CopyAction = Validated<z.infer<typeof copyActionSchema>>;
const mutationBase = { ...base, request_id: journalUuid, replayed: z.boolean() };
export const copyMutationSchema = z.discriminatedUnion('kind', [
  z.object({ ...mutationBase, kind: z.literal('create'), record: copyRecordSchema }).strict(),
  z.object({ ...mutationBase, kind: z.literal('update'), record: copyRecordSchema }).strict(),
  z.object({ ...mutationBase, kind: z.literal('archive'), record: copyRecordSchema }).strict(),
  z.object({ ...mutationBase, kind: z.literal('transfer'), record: copyRecordSchema }).strict(),
  z.object({ ...mutationBase, kind: z.literal('preview_import'), import: copyImportSchema }).strict(),
  z.object({ ...mutationBase, kind: z.literal('apply_import'), import: copyImportSchema }).strict(),
  z.object({ ...mutationBase, kind: z.literal('capture_export'), export: copyExportSummarySchema }).strict(),
]);
export type CopyMutation = Validated<z.infer<typeof copyMutationSchema>>;
export const copyErrorCodeSchema = z.enum(['INVALID_INPUT', 'ACCESS_DENIED', 'NOT_FOUND', 'SOURCE_UNAVAILABLE', 'REVISION_CONFLICT', 'REQUEST_MISMATCH', 'LIMIT_EXCEEDED', 'IMPORT_CONFLICT', 'DEPENDENCY_UNAVAILABLE']);
export type CopyErrorCode = Validated<z.infer<typeof copyErrorCodeSchema>>;
export const copyErrorSchema = z.object({ code: copyErrorCodeSchema }).strict();
