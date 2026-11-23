import { z } from 'zod';
import { draftSchema } from '@/lib/admissionDocuments/contract';
import { journalTypeSchema } from '@/lib/educationJournalWorkspace/contract';

type Validated<T> = T extends (infer Item)[] ? Validated<Item>[] : T extends object ? { [Key in keyof T]-?: Validated<T[Key]> } : T;
export const chainUuid = z.string().uuid();
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const label = z.string().min(1).max(2000), why = z.string().min(1).max(2000).nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
export const chainScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('organization') }).strict(),
  z.object({ kind: z.literal('group'), group_id: chainUuid }).strict(),
  z.object({ kind: z.literal('student'), student_user_id: chainUuid, enrollment_id: chainUuid.nullable(), group_id: chainUuid.nullable() }).strict(),
]);
export type ChainScope = Validated<z.infer<typeof chainScopeSchema>>;
export const chainSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('admission_draft'), id: chainUuid, revision, enrollment_id: chainUuid, group_id: chainUuid.nullable() }).strict(),
  z.object({ kind: z.literal('registry_record'), id: chainUuid, revision, document_id: chainUuid, version_id: chainUuid }).strict(),
  z.object({ kind: z.literal('education_record'), id: chainUuid, revision, enrollment_id: chainUuid }).strict(),
  z.object({ kind: z.literal('org_document_version'), document_id: chainUuid, version_id: chainUuid, proof_hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
]);
export type ChainSourceRef = Validated<z.infer<typeof chainSourceSchema>>;
export const chainActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('open_source'), source: chainSourceSchema }).strict(),
  z.object({ kind: z.literal('review_admission_draft'), enrollment_id: chainUuid, group_id: chainUuid.nullable() }).strict(),
  z.object({ kind: z.literal('review_group_program'), group_id: chainUuid }).strict(),
  z.object({ kind: z.literal('choose_group'), enrollment_id: chainUuid }).strict(),
  z.object({ kind: z.literal('review_completion'), enrollment_id: chainUuid, group_id: chainUuid.nullable() }).strict(),
  z.object({ kind: z.literal('review_issuance'), enrollment_id: chainUuid, course_id: chainUuid, group_id: chainUuid.nullable() }).strict(),
]);
export type ChainAction = Validated<z.infer<typeof chainActionSchema>>;
export const chainSlotSchema = z.object({
  kind: z.enum(['admission_order', 'completion_order', 'education_document']),
  state: z.enum(['not_created', 'needs_information', 'draft', 'in_review', 'registered', 'issued', 'legacy_unverified', 'annulled', 'not_applicable', 'unavailable']),
  why_code: z.string().min(1).max(100).nullable(), why,
  number: z.string().min(1).max(200).nullable(), document_date: date.nullable(),
  source: chainSourceSchema.nullable(), capabilities: z.object({ can_open: z.boolean(), can_continue: z.boolean() }).strict(),
  next_action: chainActionSchema.nullable(),
}).strict();
export type ChainSlot = Validated<z.infer<typeof chainSlotSchema>>;
export const chainRowSchema = z.object({
  enrollment_id: chainUuid, student_user_id: chainUuid, student_label: label,
  course_id: chainUuid, course_label: label, group_id: chainUuid.nullable(), group_label: label.nullable(),
  association_state: z.enum(['confirmed', 'choose_group', 'group_missing', 'course_unbound', 'program_unconfirmed', 'unavailable']),
  association_why: why, admission_order: chainSlotSchema, completion_order: chainSlotSchema,
  education_document: chainSlotSchema, journals_available: z.boolean(),
}).strict();
export type ChainRow = Validated<z.infer<typeof chainRowSchema>>;
export const chainQuerySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('list'), after_enrollment_id: chainUuid.nullable(), limit: z.number().int().min(1).max(50) }).strict(),
  z.object({ kind: z.literal('detail'), enrollment_id: chainUuid, group_id: chainUuid.nullable() }).strict(),
  z.object({ kind: z.literal('source'), enrollment_id: chainUuid, group_id: chainUuid.nullable(), source: chainSourceSchema }).strict(),
  z.object({ kind: z.literal('journal_source'), journal_type: journalTypeSchema, row_id: z.string().min(1).max(240), source_id: z.string().min(1).max(240), source_revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(), enrollment_id: chainUuid.nullable(), group_id: chainUuid.nullable() }).strict(),
]);
export type ChainQuery = Validated<z.infer<typeof chainQuerySchema>>;
export const chainContextSchema = z.object({ organization_id: chainUuid, student_user_id: chainUuid, enrollment_id: chainUuid, course_id: chainUuid, group_id: chainUuid.nullable() }).strict();
export const chainOwnIndividualOrderTargetSchema = z.object({ kind: z.literal('own_individual_order_file'), order_id: chainUuid, order_revision: revision, registry_record_id: chainUuid, registry_record_revision: revision, document_id: chainUuid, version_id: chainUuid, content_hash: z.string().regex(/^[a-f0-9]{64}$/), byte_sha256: z.string().regex(/^[a-f0-9]{64}$/), byte_size: z.number().int().min(1).max(20971520) }).strict();
export type ChainOwnIndividualOrderTarget = Validated<z.infer<typeof chainOwnIndividualOrderTargetSchema>>;
export const chainOpenTargetSchema = z.discriminatedUnion('kind', [
  chainOwnIndividualOrderTargetSchema,
  z.object({ kind: z.literal('admission_draft'), draft: draftSchema, enrollment_id: chainUuid, group_id: chainUuid.nullable() }).strict(),
  z.object({ kind: z.literal('registry_record'), record_id: chainUuid, revision }).strict(),
  z.object({ kind: z.literal('education_record'), record_id: chainUuid, revision, enrollment_id: chainUuid }).strict(),
  z.object({ kind: z.literal('org_document_version'), document_id: chainUuid, version_id: chainUuid, proof_hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
]);
export type ChainOpenTarget = Validated<z.infer<typeof chainOpenTargetSchema>>;
const envelope = {
  schema_version: z.literal(1), organization_id: chainUuid, scope: chainScopeSchema,
  observed_at: z.string().datetime({ offset: true }), viewer: z.enum(['staff', 'self']),
  capabilities: z.object({ can_read: z.boolean(), can_open_sources: z.boolean(), can_open_journals: z.boolean() }).strict(),
};
export const chainReadSchema = z.discriminatedUnion('kind', [
  z.object({ ...envelope, kind: z.literal('list'), availability: z.enum(['available', 'unavailable']), why,
    rows: z.array(chainRowSchema).max(50), next_after_enrollment_id: chainUuid.nullable(), total_count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable() }).strict(),
  z.object({ ...envelope, kind: z.literal('detail'), availability: z.enum(['available', 'unavailable']), why, row: chainRowSchema.nullable() }).strict(),
  z.object({ ...envelope, kind: z.literal('source'), availability: z.enum(['available', 'unavailable']), why,
    source: chainSourceSchema, context: chainContextSchema, target: chainOpenTargetSchema.nullable() }).strict(),
  z.object({ ...envelope, kind: z.literal('journal_source'), availability: z.enum(['available', 'unavailable']), why,
    source: chainSourceSchema.nullable(), context: z.object({ organization_id: chainUuid, student_user_id: chainUuid.nullable(), enrollment_id: chainUuid.nullable(), course_id: chainUuid.nullable(), group_id: chainUuid.nullable() }).strict(), target: chainOpenTargetSchema.nullable() }).strict(),
]);
export type ChainRead = Validated<z.infer<typeof chainReadSchema>>;
export type ChainListRead = Extract<ChainRead, { kind: 'list' }>;
export type ChainDetailRead = Extract<ChainRead, { kind: 'detail' }>;
export type ChainSourceRead = Extract<ChainRead, { kind: 'source' }>;
export type ChainJournalSourceRead = Extract<ChainRead, { kind: 'journal_source' }>;
export const chainErrorCodeSchema = z.enum(['ACCESS_DENIED', 'INVALID_INPUT', 'NOT_FOUND', 'SOURCE_CHANGED', 'DEPENDENCY_UNAVAILABLE']);
export type ChainErrorCode = z.infer<typeof chainErrorCodeSchema>;
