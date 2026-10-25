import { z } from 'zod';
import * as foundation from '../frdoFoundation/contract.ts';

/** Runtime wire for UC020 persisted packets. Parsing grants no database/file rights.
 * Trusted service attestations are deliberately separate from user commands. */
export const ABI_REVISION = 'uc020-persisted-v4' as const;
export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const sha = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const text = (maximum: number) => z.string().min(1).max(maximum).refine(value => value.trim().length > 0);
const time = z.string().max(64).datetime({ offset: true });
const ids = (minimum = 0, maximum = 1000) => z.array(uuid).min(minimum).max(maximum).refine(values => new Set(values).size === values.length);
export const scopeSchema = foundation.scopeSchema;
export const packetRefSchema = foundation.jobRefSchema;
export const artifactRefSchema = z.object({ artifact_id: uuid, packet_id: uuid, snapshot_sha256: sha, byte_sha256: sha,
  byte_size: z.number().int().min(1).max(20971520), binding_sha256: sha }).strict();
export const authorityRefSchema = z.object({ id: uuid, organization_id: uuid, operator_user_id: uuid, revision,
  state_hash: sha }).strict();
export const authorityValiditySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bounded'), from: time, until: time }).strict(),
  z.object({ kind: z.literal('explicit_open_end'), from: time }).strict(),
]).refine(value => value.kind !== 'bounded' || Date.parse(value.until) > Date.parse(value.from));
// A recorded organizational appointment is not platform verification of external FIS delegation.
export const authoritySchema = z.object({ ref: authorityRefSchema, fact_kind: z.literal('organization_recorded_appointment'),
  state: z.enum(['active', 'revoked']), validity: authorityValiditySchema, evidence: foundation.sourceProjectionSchema,
  external_delegation_verified: z.literal(false), recorded_at: time, recorded_by: uuid.nullable(),
  revocation_event_id: uuid.nullable() }).strict().refine(value => (value.state === 'revoked') === (value.revocation_event_id !== null));

export const sourceCasRecordSchema = z.object({ record: foundation.recordRefSchema, original_record: foundation.recordRefSchema.nullable(),
  supplement: foundation.supplementRefSchema, original_supplement: foundation.supplementRefSchema.nullable() }).strict()
  .superRefine((value, context) => {
    const original = value.original_record;
    if ((original !== null) !== (value.original_supplement !== null)) context.addIssue({ code: 'custom', message: 'Original supplement binding missing' });
    if (value.supplement.frozen_facts_sha256 !== value.record.frozen_facts_sha256) context.addIssue({ code: 'custom', message: 'Supplement differs from frozen issued facts' });
    if (original && (original.user_id !== value.record.user_id || original.enrollment_id !== value.record.enrollment_id ||
      original.course_id !== value.record.course_id || original.group_id !== value.record.group_id ||
      value.original_supplement?.frozen_facts_sha256 !== original.frozen_facts_sha256)) context.addIssue({ code: 'custom', message: 'Original subject or facts differ' });
  });
export const sourceCasSchema = z.object({ organization_id: uuid, scope: scopeSchema, template: foundation.templateRefSchema,
  records: z.array(sourceCasRecordSchema).min(1).max(1000), sources: z.array(foundation.sealedEvidenceSchema).min(1).max(62000) }).strict();
export const frozenCaptureSchema = z.object({ schema_version: z.literal(1), abi_revision: z.literal(ABI_REVISION),
  mapped_batch: foundation.mappedBatchSchema, source_cas: sourceCasSchema, snapshot_sha256: sha }).strict();
export const manifestSubjectSchema = z.object({ record_id: uuid, user_id: uuid, enrollment_id: uuid, course_id: uuid,
  group_id: uuid.nullable(), purposes: z.array(z.enum(['selected', 'original'])).min(1).max(2)
    .refine(values => new Set(values).size === values.length) }).strict();
export const registryPacketSourceSchema = z.object({ kind: z.literal('frdo_packet_artifact'), packet_id: uuid,
  artifact_id: uuid, snapshot_sha256: sha, binding_sha256: sha }).strict();
export const registryPacketContextSchema = z.object({ kind: z.literal('frdo_packet'), packet_id: uuid,
  artifact_id: uuid, snapshot_sha256: sha }).strict();

const packetActionBase = { packet: packetRefSchema };
export const actionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('save_supplement'), input: foundation.supplementInputSchema }).strict(),
  z.object({ kind: z.literal('freeze_preview'), selection: foundation.selectionSchema, expected_preview_hash: sha }).strict(),
  z.object({ kind: z.literal('generate_file'), ...packetActionBase, expected_template: foundation.templateRefSchema }).strict(),
  z.object({ kind: z.literal('register_packet'), ...packetActionBase, artifact: artifactRefSchema, expected_registry_preview_hash: sha }).strict(),
  z.object({ kind: z.literal('record_admin_handover'), ...packetActionBase, artifact: artifactRefSchema,
    recipient: z.literal('platform_administrator'), note: text(2000) }).strict(),
  z.object({ kind: z.literal('record_fis_upload'), ...packetActionBase, artifact: artifactRefSchema, authority: authorityRefSchema,
    submission_id: text(300), occurred_at: time, evidence: foundation.sealedEvidenceSchema,
    external_operations: z.array(foundation.externalOperationSchema).max(1000) }).strict(),
  z.object({ kind: z.literal('record_receipt'), ...packetActionBase, authority: authorityRefSchema, receipt: foundation.receiptInputSchema }).strict(),
  z.object({ kind: z.literal('create_correction'), plan: foundation.correctionPlanSchema,
    template: foundation.templateRefSchema, expected_preview_hash: sha }).strict(),
  z.object({ kind: z.literal('appoint_operator'), operator_user_id: uuid, previous: authorityRefSchema.nullable(),
    validity: authorityValiditySchema, evidence: foundation.sealedEvidenceSchema, note: text(2000) }).strict(),
  z.object({ kind: z.literal('revoke_operator'), authority: authorityRefSchema, evidence: foundation.sealedEvidenceSchema, reason: text(2000) }).strict(),
]);
export const mutationRequestSchema = z.object({ schema_version: z.literal(1), abi_revision: z.literal(ABI_REVISION), organization_id: uuid,
  scope: scopeSchema, request_id: uuid, action: actionSchema }).strict();
export const querySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preview'), selection: foundation.selectionSchema }).strict(),
  z.object({ kind: z.literal('correction_preview'), plan: foundation.correctionPlanSchema, template: foundation.templateRefSchema }).strict(),
  z.object({ kind: z.literal('packet'), packet_id: uuid }).strict(),
  z.object({ kind: z.literal('packets'), after_id: uuid.nullable(), limit: z.number().int().min(1).max(50), stream: z.enum(['dpo', 'po']).nullable() }).strict(),
  z.object({ kind: z.literal('history'), packet_id: uuid, ceiling_revision: revision.nullable(), before_revision: revision.nullable(), limit: z.number().int().min(1).max(50) }).strict(),
  z.object({ kind: z.literal('artifacts'), packet_id: uuid, after_id: uuid.nullable(), limit: z.number().int().min(1).max(50) }).strict(),
  z.object({ kind: z.literal('corrections'), packet_id: uuid, after_id: uuid.nullable(), limit: z.number().int().min(1).max(50) }).strict(),
  z.object({ kind: z.literal('receipt'), packet_id: uuid, receipt_event_id: uuid }).strict(),
  z.object({ kind: z.literal('supplement'), record_id: uuid }).strict(),
  z.object({ kind: z.literal('authorities'), operator_user_id: uuid.nullable(), after_id: uuid.nullable(), limit: z.number().int().min(1).max(50) }).strict(),
  z.object({ kind: z.literal('download'), packet: packetRefSchema, artifact: artifactRefSchema,
    purpose: z.enum(['current_submission', 'historical_copy']) }).strict(),
]);
export const readRequestSchema = z.object({ schema_version: z.literal(1), abi_revision: z.literal(ABI_REVISION),
  organization_id: uuid, scope: scopeSchema, query: querySchema }).strict();
export const requestReceiptSchema = z.object({ request_id: uuid, action_kind: z.enum(['save_supplement', 'freeze_preview', 'generate_file',
  'register_packet', 'record_admin_handover', 'record_fis_upload', 'record_receipt', 'create_correction', 'appoint_operator', 'revoke_operator']),
  packet_ids: ids(0, 2), supplement_ids: ids(0, 1), authority_ids: ids(0, 1), event_ids: ids(0, 3),
  payload_sha256: sha, recorded_at: time }).strict();

const buildBase = { id: uuid, artifact_id: uuid, packet_id: uuid, input_revision: revision, snapshot_sha256: sha,
  worker_request_id: uuid, recorded_at: time };
export const artifactBuildSchema = z.discriminatedUnion('state', [
  z.object({ ...buildBase, state: z.enum(['queued', 'generating', 'failed']), artifact: z.null(),
    failure: z.enum(['FILE_GENERATION_FAILED', 'DEPENDENCY_UNAVAILABLE', 'SOURCE_CHANGED']).nullable() }).strict(),
  z.object({ ...buildBase, state: z.literal('sealed'), artifact: artifactRefSchema, failure: z.null(),
    signing: foundation.signingSchema, template: foundation.templateRefSchema, readback_sha256: sha,
    registry_record_id: uuid.nullable() }).strict(),
]).superRefine((value, context) => {
  if (value.state === 'sealed' && (value.artifact.artifact_id !== value.artifact_id || value.artifact.packet_id !== value.packet_id ||
    value.artifact.snapshot_sha256 !== value.snapshot_sha256)) context.addIssue({ code: 'custom', message: 'Sealed artifact binding differs' });
  if (value.state !== 'sealed' && ((value.state === 'failed') !== (value.failure !== null))) context.addIssue({ code: 'custom', message: 'Unconfirmed build failure state' });
});
const eventBase = { id: uuid, revision, actor_id: uuid.nullable(), recorded_at: time, previous_state_hash: sha.nullable(), state_hash: sha, payload_sha256: sha };
export const packetEventSchema = z.discriminatedUnion('kind', [
  z.object({ ...eventBase, kind: z.literal('preview_frozen'), snapshot_sha256: sha }).strict(),
  z.object({ ...eventBase, kind: z.literal('file_requested'), build_id: uuid }).strict(),
  z.object({ ...eventBase, kind: z.literal('file_sealed'), artifact: artifactRefSchema, signing: foundation.signingSchema }).strict(),
  z.object({ ...eventBase, kind: z.literal('file_failed'), build_id: uuid, code: z.enum(['FILE_GENERATION_FAILED', 'DEPENDENCY_UNAVAILABLE', 'SOURCE_CHANGED']) }).strict(),
  z.object({ ...eventBase, kind: z.literal('registry_recorded'), artifact: artifactRefSchema, registry_record_id: uuid }).strict(),
  z.object({ ...eventBase, kind: z.literal('admin_handover'), artifact: artifactRefSchema, message_id: uuid, note: text(2000) }).strict(),
  z.object({ ...eventBase, kind: z.literal('fis_upload'), artifact: artifactRefSchema, authority: authorityRefSchema,
    submission_id: text(300), occurred_at: time, evidence: foundation.sourceProjectionSchema,
    recording_method: z.literal('authorized_operator_transcription'), external_origin_verified: z.literal(false) }).strict(),
  z.object({ ...eventBase, kind: z.literal('receipt_recorded'), authority: authorityRefSchema, receipt: foundation.receiptProjectionSchema,
    external_origin_verified: z.literal(false) }).strict(),
  z.object({ ...eventBase, kind: z.literal('correction_created'), correction_packet_id: uuid, parent_receipt_event_id: uuid,
    row_keys: z.array(sha).min(1).max(1000).refine(values => new Set(values).size === values.length) }).strict(),
]);
export const packetSummarySchema = z.object({ ref: packetRefSchema, stream: z.enum(['dpo', 'po']), state: foundation.jobStateSchema,
  row_count: z.number().int().min(1).max(1000), source_currency: z.enum(['current', 'changed', 'unavailable']), created_at: time }).strict();
export const capabilitiesSchema = foundation.capabilitiesSchema.extend({ can_register_packet: z.boolean(), can_manage_operators: z.boolean() }).strict();
export const packetProjectionSchema = z.object({ ref: packetRefSchema, stream: z.enum(['dpo', 'po']), state: foundation.jobStateSchema,
  capture: frozenCaptureSchema, created_at: time, created_by: uuid.nullable(), source_currency: z.enum(['current', 'changed', 'unavailable']),
  current_build: artifactBuildSchema.nullable(), latest_registry_record_id: uuid.nullable(), latest_admin_handover_event_id: uuid.nullable(),
  latest_upload_event_id: uuid.nullable(), latest_receipt_event_id: uuid.nullable(), parent_correction: foundation.correctionPlanSchema.nullable(),
  capabilities: capabilitiesSchema }).strict();
const envelope = { schema_version: z.literal(1), abi_revision: z.literal(ABI_REVISION), organization_id: uuid, scope: scopeSchema, actor_id: uuid };
export const downloadProjectionSchema = foundation.downloadSchema.omit({ job_id: true }).extend({ packet_id: uuid, signing: foundation.signingSchema }).strict();
export const readResultSchema = z.discriminatedUnion('kind', [
  z.object({ ...envelope, kind: z.literal('preview'), preview: foundation.previewSchema }).strict(),
  z.object({ ...envelope, kind: z.literal('packet'), packet: packetProjectionSchema }).strict(),
  z.object({ ...envelope, kind: z.literal('packets'), packets: z.array(packetSummarySchema).max(50), next_after_id: uuid.nullable() }).strict(),
  z.object({ ...envelope, kind: z.literal('history'), packet_id: uuid, events: z.array(packetEventSchema).max(50), ceiling_revision: revision, next_before_revision: revision.nullable() }).strict(),
  z.object({ ...envelope, kind: z.literal('artifacts'), packet_id: uuid, artifacts: z.array(artifactBuildSchema).max(50), next_after_id: uuid.nullable() }).strict(),
  z.object({ ...envelope, kind: z.literal('corrections'), packet_id: uuid, packets: z.array(packetSummarySchema).max(50), next_after_id: uuid.nullable() }).strict(),
  z.object({ ...envelope, kind: z.literal('receipt'), packet_id: uuid, receipt: foundation.receiptProjectionSchema, external_origin_verified: z.literal(false) }).strict(),
  z.object({ ...envelope, kind: z.literal('supplement'), supplement: foundation.supplementReadSchema.nullable() }).strict(),
  z.object({ ...envelope, kind: z.literal('authorities'), authorities: z.array(authoritySchema).max(50), next_after_id: uuid.nullable() }).strict(),
  z.object({ ...envelope, kind: z.literal('download'), download: downloadProjectionSchema }).strict(),
]);
export const mutationResultSchema = z.object({ ...envelope, replayed: z.boolean(), receipt: requestReceiptSchema,
  packets: z.array(packetProjectionSchema).max(2), supplement: foundation.supplementReadSchema.nullable(), authority: authoritySchema.nullable() }).strict();

/** Service-only freeze/seal wire. No caller-provided paths, capabilities or signature claims. */
export const trustedFreezeSchema = z.object({ schema_version: z.literal(1), abi_revision: z.literal(ABI_REVISION), organization_id: uuid,
  scope: scopeSchema, verified_actor_id: uuid, request_id: uuid, command_payload_sha256: sha, expected_preview_hash: sha,
  capture: frozenCaptureSchema, correction: foundation.correctionPlanSchema.nullable() }).strict();
export const workerRequestSchema = z.object({ schema_version: z.literal(1), abi_revision: z.literal(ABI_REVISION), organization_id: uuid,
  packet_id: uuid, build_id: uuid, input_revision: revision, request_id: uuid }).strict();
export const workerAttestationSchema = z.object({ ...workerRequestSchema.shape, verified_actor_id: uuid, snapshot_sha256: sha,
  byte_sha256: sha, byte_size: z.number().int().min(1).max(20971520), readback_sha256: sha,
  template: foundation.templateRefSchema, signing: foundation.signingSchema }).strict();
export const errorSchema = z.object({ schema_version: z.literal(1), code: z.enum(['INVALID_REQUEST', 'AUTH_REQUIRED', 'ACCESS_DENIED',
  'SOURCE_UNAVAILABLE', 'SOURCE_CHANGED', 'READINESS_BLOCKED', 'TEMPLATE_CHANGED', 'IDEMPOTENCY_CONFLICT', 'REVISION_CONFLICT',
  'ARTIFACT_UNAVAILABLE', 'FILE_GENERATION_FAILED', 'RECEIPT_MISMATCH', 'ILLEGAL_TRANSITION', 'DEPENDENCY_UNAVAILABLE',
  'FRDO_PACKET_RETENTION_REVIEW_REQUIRED']), retryable: z.boolean(), message: text(500) }).strict();
