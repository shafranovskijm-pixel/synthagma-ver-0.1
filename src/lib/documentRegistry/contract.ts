import { z } from 'zod';
import { journalHash, journalUuid } from '@/lib/customJournals/contract';

/** Every wire value is strictly parsed before it reaches these required-field types. */
type Validated<T> = T extends (infer Item)[] ? Validated<Item>[] : T extends object ? { [Key in keyof T]-?: Validated<T[Key]> } : T;
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), revision = count.refine(value => value > 0);
const instant = z.string().max(64).datetime({ offset: true }), label = z.string().max(1000);
const reason = z.string().trim().min(1).max(2000), page = { after_id: journalUuid.nullable(), limit: z.number().int().min(1).max(100) };
export const registryDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(value + 'T00:00:00.000Z'); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; });
export const registryScopeSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('organization') }).strict(), z.object({ kind: z.literal('group'), group_id: journalUuid }).strict()]);
export type RegistryScope = Validated<z.infer<typeof registryScopeSchema>>;
export const sameRegistryScope = (a: RegistryScope, b: RegistryScope) => a.kind === b.kind && (a.kind === 'organization' || b.kind === 'group' && a.group_id === b.group_id);
export const registrySourceSchema = z.object({ kind: z.literal('org_document_version'), document_id: journalUuid, version_id: journalUuid, content_hash: journalHash }).strict();
export type RegistrySource = Validated<z.infer<typeof registrySourceSchema>>;
const studentParty = z.object({ kind: z.literal('student'), user_id: journalUuid }).strict();
const companyParty = z.object({ kind: z.literal('company'), company_id: journalUuid }).strict();
export const registryPartySchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('organization'), organization_id: journalUuid }).strict(), studentParty, companyParty, z.object({ kind: z.literal('external'), entity_type: z.enum(['person', 'organization']), name: z.string().trim().min(1).max(300), inn: z.string().max(12).nullable() }).strict()]);
export type RegistryParty = Validated<z.infer<typeof registryPartySchema>>;
export const registrySubjectSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('none') }).strict(), studentParty]);
export type RegistrySubject = Validated<z.infer<typeof registrySubjectSchema>>;
const enrollmentContext = z.object({ kind: z.literal('enrollment'), enrollment_id: journalUuid, binding_hash: journalHash }).strict();
const contractContext = z.object({ kind: z.literal('contract'), contract_id: journalUuid, binding_hash: journalHash }).strict();
const combinedContext = z.object({ kind: z.literal('enrollment_contract'), enrollment_id: journalUuid, contract_id: journalUuid, binding_hash: journalHash }).strict();
export const registryContextSchema = z.discriminatedUnion('kind', [enrollmentContext, contractContext, combinedContext, z.object({ kind: z.literal('organization'), not_applicable_reason: reason }).strict()]);
export type RegistryContext = Validated<z.infer<typeof registryContextSchema>>;
export const registryOriginSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('org_document') }).strict(), z.object({ kind: z.literal('incoming_document'), incoming_document_id: journalUuid }).strict(), z.object({ kind: z.literal('legacy_issuance_log'), legacy_id: journalUuid, legacy_binding_hash: journalHash, relationship_reason: reason }).strict()]);
export const registryDocumentTypeSchema = z.enum(['contract', 'enrollment_order', 'expulsion_order', 'certificate', 'diploma', 'qualification', 'protocol', 'invoice', 'act', 'other']);
const dataShape = { direction: z.enum(['incoming', 'outgoing']), document_type: registryDocumentTypeSchema, title: z.string().trim().min(1).max(500), document_date: registryDateSchema, declared_document_number: z.string().max(120).nullable(), source: registrySourceSchema, sender: registryPartySchema, recipient: registryPartySchema, subject: registrySubjectSchema, context: registryContextSchema, notes: z.string().max(4000) };
export const registryDataSchema = z.object({ ...dataShape, origin: registryOriginSchema }).strict();
export type RegistryData = Validated<z.infer<typeof registryDataSchema>>;
export const registryIncomingDataSchema = z.object(dataShape).strict().refine(value => value.direction === 'incoming');
export const registryCaptureIncomingSchema = z.object({ doc_type: z.enum(['contract', 'act', 'invoice', 'other']), title: z.string().trim().min(1).max(500), counterparty_name: z.string().trim().min(1).max(300).nullable(), counterparty_inn: z.string().regex(/^\d{10}(\d{2})?$/).nullable(), doc_number: z.string().max(120).nullable(), doc_date: registryDateSchema.nullable(), notes: z.string().max(4000), source: registrySourceSchema }).strict();
export type RegistryCaptureIncoming = Validated<z.infer<typeof registryCaptureIncomingSchema>>;
export type RegistryIncomingData = Validated<z.infer<typeof registryIncomingDataSchema>>;
export const registryIncomingTargetSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('new') }).strict(), z.object({ kind: z.literal('existing'), incoming_document_id: journalUuid, expected_binding_hash: journalHash.nullable() }).strict()]);
export type RegistryIncomingTarget = Validated<z.infer<typeof registryIncomingTargetSchema>>;
export const registryFiltersSchema = z.object({ direction: z.enum(['all', 'incoming', 'outgoing']), document_type: z.union([z.literal('all'), registryDocumentTypeSchema]), status: z.enum(['all', 'registered', 'archived']), date_from: registryDateSchema.nullable(), date_to: registryDateSchema.nullable(), text: z.string().max(200) }).strict().refine(value => !value.date_from || !value.date_to || value.date_from <= value.date_to);
export type RegistryFilters = Validated<z.infer<typeof registryFiltersSchema>>;
export const registryContextBindingSchema = z.object({ kind: z.enum(['organization', 'enrollment', 'contract', 'enrollment_contract']), organization_id: journalUuid, enrollment_id: journalUuid.nullable(), user_id: journalUuid.nullable(), course_id: journalUuid.nullable(), enrollment_status: z.string().nullable(), enrollment_revision: count.nullable(), contract_id: journalUuid.nullable(), contract_student_user_id: journalUuid.nullable(), contract_group_id: journalUuid.nullable(), contract_company_id: journalUuid.nullable(), contract_status: z.string().nullable(), contract_updated_at: instant.nullable(), scope_group_id: journalUuid.nullable(), binding_hash: journalHash }).strict();
export const registrySourceChoiceSchema = z.object({ label, source: registrySourceSchema }).strict();
export type RegistrySourceChoice = Validated<z.infer<typeof registrySourceChoiceSchema>>;
export const registryPartyChoiceSchema = z.object({ label, party: z.discriminatedUnion('kind', [studentParty, companyParty]) }).strict();
export type RegistryPartyChoice = Validated<z.infer<typeof registryPartyChoiceSchema>>;
export const registryContextChoiceSchema = z.object({ label, context: z.discriminatedUnion('kind', [enrollmentContext, contractContext, combinedContext]), student_id: journalUuid.nullable(), group_id: journalUuid.nullable(), company_id: journalUuid.nullable(), current_status: z.string().max(100) }).strict();
export type RegistryContextChoice = Validated<z.infer<typeof registryContextChoiceSchema>>;
export const registryLegacyClaimSchema = z.object({ id: journalUuid, enrollment_id: journalUuid.nullable(), stored_user_id: journalUuid.nullable(), stored_user_name: z.string(), document_type: z.string(), document_name: z.string(), reg_number: z.string().nullable(), issued_at: instant, send_method: z.string().nullable(), send_number: z.string().nullable(), file_url_present: z.boolean(), created_at: instant }).strict();
export const registryLegacySchema = z.object({ id: journalUuid, claim: registryLegacyClaimSchema, student: z.object({ user_id: journalUuid, label }).strict().nullable(), enrollment_id: journalUuid.nullable(), relationship_verified: z.boolean(), legacy_binding_hash: journalHash, file_state: z.enum(['missing', 'legacy_unversioned']), can_open_file: z.literal(false), linked_record_id: journalUuid.nullable() }).strict();
export type RegistryLegacy = Validated<z.infer<typeof registryLegacySchema>>;
export const registryIncomingSchema = z.object({ id: journalUuid, doc_type: z.enum(['contract', 'act', 'invoice', 'other']), title: z.string(), counterparty_name: z.string().nullable(), counterparty_inn: z.string().nullable(), doc_number: z.string().nullable(), doc_date: registryDateSchema.nullable(), notes: z.string().nullable(), created_at: instant, updated_at: instant, related_signature_id: journalUuid.nullable(), related_billing_doc_id: journalUuid.nullable(), related_company_id: journalUuid.nullable(), linked_source: registrySourceSchema.nullable(), source_label: label.nullable(), source_available: z.boolean(), binding_hash: journalHash.nullable(), registry_record_id: journalUuid.nullable(), registration_id: z.string().nullable(), legacy_unversioned: z.boolean(), can_register: z.boolean(), can_open_file: z.boolean() }).strict();
export type RegistryIncoming = Validated<z.infer<typeof registryIncomingSchema>>;
const fileCommon = { path: z.string().min(1).max(2000).refine(value => !value.includes('://') && !value.includes('..') && !/[?\u0000-\u001f\\]/.test(value) && !value.startsWith('/')), proof_hash: journalHash, file_name: z.string().min(1).max(1000), mime: z.string().min(1).max(200), size: count };
export const registryFileSchema = z.discriminatedUnion('kind', [z.object({ ...fileCommon, kind: z.literal('org_document_version'), bucket: z.literal('org-documents'), version_id: journalUuid }).strict(), z.object({ ...fileCommon, kind: z.literal('legacy_incoming_object'), bucket: z.literal('incoming-documents'), incoming_document_id: journalUuid }).strict()]);
export type RegistryFile = Validated<z.infer<typeof registryFileSchema>>;
export const registryCapabilitiesSchema = z.object({ can_read: z.boolean(), can_register: z.boolean(), can_correct: z.boolean(), can_archive: z.boolean(), can_open_file: z.boolean(), can_capture_source: z.boolean(), can_read_legacy: z.boolean(), can_register_incoming: z.boolean(), can_read_incoming: z.boolean(), can_capture_incoming: z.boolean() }).strict();
export type RegistryCapabilities = Validated<z.infer<typeof registryCapabilitiesSchema>>;
const base = { schema_version: z.literal(1), organization_id: journalUuid, scope: registryScopeSchema, registry_revision: count, capabilities: registryCapabilitiesSchema };
export const registryRecordSchema = z.object({ id: journalUuid, group_id: journalUuid.nullable(), registration_id: z.string().min(1).max(120), sequence_year: z.number().int().min(2000).max(2200), sequence_number: revision, revision, status: z.enum(['registered', 'archived']), data: registryDataSchema, context_binding: registryContextBindingSchema, registered_at: instant, recorded_by: journalUuid.nullable(), recorded_by_label: label.nullable(), updated_at: instant, source_label: label.nullable(), source_available: z.boolean(), sender_label: label, recipient_label: label, subject_label: label.nullable(), context_label: label, context_current: z.boolean(), legacy_claim: registryLegacyClaimSchema.nullable(), can_correct: z.boolean(), can_archive: z.boolean(), can_open_file: z.boolean() }).strict();
export type RegistryRecord = Validated<z.infer<typeof registryRecordSchema>>;
export const registryEventSchema = z.object({ id: journalUuid, record_id: journalUuid, revision, action: z.enum(['register', 'correct', 'archive', 'attach_legacy']), reason, snapshot: z.object({ data: registryDataSchema, status: z.enum(['registered', 'archived']), context_binding: registryContextBindingSchema }).strict(), recorded_at: instant, recorded_by: journalUuid.nullable(), recorded_by_label: label.nullable() }).strict();
export type RegistryEvent = Validated<z.infer<typeof registryEventSchema>>;
export const registryCountsSchema = z.object({ total: count, incoming: count, outgoing: count, contracts: count, orders: count }).strict();
export const registryValidationSchema = z.object({ valid: z.literal(true), data: registryDataSchema, context_binding: registryContextBindingSchema, source_label: label, sender_label: label, recipient_label: label, subject_label: label.nullable(), context_label: label }).strict();
export const registryIncomingValidationSchema = registryValidationSchema.extend({ data: registryIncomingDataSchema }).strict();
export const registrySnapshotSchema = z.object({ schema_version: z.literal(1), kind: z.literal('document_registry_export'), organization_id: journalUuid, scope: registryScopeSchema, registry_revision: count, captured_at: instant, captured_by: journalUuid.nullable(), filters: registryFiltersSchema, record_count: count, event_count: count, records: z.array(registryRecordSchema).max(1000), events: z.array(registryEventSchema).max(10000) }).strict();
export const registryExportSchema = z.object({ snapshot: registrySnapshotSchema, manifest_json: z.string().max(8 * 1024 * 1024), manifest_sha256: journalHash, manifest_bytes: revision }).strict();
export type RegistryExport = Validated<z.infer<typeof registryExportSchema>>;
export const registryQuerySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('list'), filters: registryFiltersSchema, after: z.string().max(4096).nullable(), limit: z.number().int().min(1).max(100) }).strict(),
  z.object({ kind: z.literal('detail'), record_id: journalUuid }).strict(),
  z.object({ kind: z.literal('history'), record_id: journalUuid, after_revision: count, limit: z.number().int().min(1).max(100) }).strict(),
  z.object({ kind: z.literal('sources'), text: z.string().max(200), ...page }).strict(),
  z.object({ kind: z.literal('source'), document_id: journalUuid, version_id: journalUuid }).strict(),
  z.object({ kind: z.literal('parties'), party_kind: z.enum(['student', 'company']), text: z.string().max(200), ...page }).strict(),
  z.object({ kind: z.literal('contexts'), subject: registrySubjectSchema, context_kind: z.enum(['enrollment', 'contract', 'enrollment_contract']), enrollment_id: journalUuid.nullable(), text: z.string().max(200), ...page }).strict(),
  z.object({ kind: z.literal('legacy_issuance'), ...page }).strict(), z.object({ kind: z.literal('incoming'), ...page }).strict(),
  z.object({ kind: z.literal('validate'), data: registryDataSchema }).strict(),
  z.object({ kind: z.literal('validate_incoming'), incoming: registryIncomingTargetSchema, data: registryIncomingDataSchema }).strict(),
  z.object({ kind: z.literal('file'), record_id: journalUuid, record_revision: revision }).strict(),
  z.object({ kind: z.literal('incoming_file'), incoming_document_id: journalUuid, expected_binding_hash: journalHash.nullable() }).strict(),
  z.object({ kind: z.literal('export'), filters: registryFiltersSchema }).strict(),
]);
export type RegistryQuery = Validated<z.infer<typeof registryQuerySchema>>;
export const registryReadSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('list'), records: z.array(registryRecordSchema).max(100), next_cursor: z.string().max(4096).nullable(), counts: registryCountsSchema }).strict(),
  z.object({ ...base, kind: z.literal('detail'), record: registryRecordSchema }).strict(),
  z.object({ ...base, kind: z.literal('history'), history: z.array(registryEventSchema).max(100), next_after_revision: revision.nullable() }).strict(),
  z.object({ ...base, kind: z.literal('sources'), sources: z.array(registrySourceChoiceSchema).max(100), next_after_id: journalUuid.nullable() }).strict(),
  z.object({ ...base, kind: z.literal('source'), source: registrySourceChoiceSchema }).strict(),
  z.object({ ...base, kind: z.literal('parties'), parties: z.array(registryPartyChoiceSchema).max(100), next_after_id: journalUuid.nullable() }).strict(),
  z.object({ ...base, kind: z.literal('contexts'), contexts: z.array(registryContextChoiceSchema).max(100), next_after_id: journalUuid.nullable() }).strict(),
  z.object({ ...base, kind: z.literal('legacy_issuance'), legacy_records: z.array(registryLegacySchema).max(100), next_after_id: journalUuid.nullable() }).strict(),
  z.object({ ...base, kind: z.literal('incoming'), incoming: z.array(registryIncomingSchema).max(100), next_after_id: journalUuid.nullable() }).strict(),
  z.object({ ...base, kind: z.literal('validate'), validation: registryValidationSchema }).strict(),
  z.object({ ...base, kind: z.literal('validate_incoming'), validation: registryIncomingValidationSchema }).strict(),
  z.object({ ...base, kind: z.literal('file'), file: registryFileSchema }).strict(), z.object({ ...base, kind: z.literal('incoming_file'), file: registryFileSchema }).strict(),
  z.object({ ...base, kind: z.literal('export'), export: registryExportSchema }).strict(),
]);
export type RegistryRead = Validated<z.infer<typeof registryReadSchema>>;
export const registryActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('capture_incoming'), data: registryCaptureIncomingSchema }).strict(),
  z.object({ action: z.literal('register'), data: registryDataSchema.refine(value => value.direction === 'outgoing' && value.origin.kind !== 'incoming_document'), reason }).strict(),
  z.object({ action: z.literal('register_incoming'), incoming: registryIncomingTargetSchema, data: registryIncomingDataSchema, reason }).strict(),
  z.object({ action: z.literal('correct'), record_id: journalUuid, data: registryDataSchema, reason }).strict(),
  z.object({ action: z.literal('archive'), record_id: journalUuid, reason }).strict(),
]);
export type RegistryAction = Validated<z.infer<typeof registryActionSchema>>;
const mutationBase = { ...base, request_id: journalUuid, replayed: z.boolean() };
export const registryMutationSchema = z.discriminatedUnion('kind', [
  z.object({ ...mutationBase, kind: z.literal('capture_incoming'), incoming: registryIncomingSchema }).strict(),
  z.object({ ...mutationBase, kind: z.literal('register'), record: registryRecordSchema }).strict(),
  z.object({ ...mutationBase, kind: z.literal('register_incoming'), record: registryRecordSchema }).strict(),
  z.object({ ...mutationBase, kind: z.literal('correct'), record: registryRecordSchema }).strict(),
  z.object({ ...mutationBase, kind: z.literal('archive'), record: registryRecordSchema }).strict(),
]);
export type RegistryMutation = Validated<z.infer<typeof registryMutationSchema>>;
export const registryErrorCodeSchema = z.enum(['INVALID_INPUT', 'ACCESS_DENIED', 'NOT_FOUND', 'SOURCE_UNAVAILABLE', 'SOURCE_CHANGED', 'CONTEXT_MISMATCH', 'CONTEXT_CHANGED', 'REVISION_CONFLICT', 'REQUEST_MISMATCH', 'LIMIT_EXCEEDED', 'DEPENDENCY_UNAVAILABLE']);
export type RegistryErrorCode = Validated<z.infer<typeof registryErrorCodeSchema>>;
export const registryErrorSchema = z.object({ code: registryErrorCodeSchema }).strict();
