import { input, guard } from '../../frdoFoundation/__tests__/fixtures';
import { uid, org, actor, group, hash, stamp, source } from '../../educationIssuance/__tests__/fixtures';
import { captureReviewedPacket } from '../issuerReview';
import { packetProjectionSchema, RUNTIME_ABI_REVISION } from '../runtimeContract';
import type { FrdoPacket, FrdoScope } from '../client';
export { uid, org, actor, group, hash, stamp, source };
export const proof = { source, byte_sha256: 'b'.repeat(64), byte_size: 127 };
export const review = { regime: 'ordinary_rf' as const, evidence: source, review_note: 'Синтетическая проверка режима, не правовое утверждение' };
export const scope = (current = () => true): FrdoScope => ({ organizationId: org, actorId: actor, issuanceScope: { kind: 'group', group_id: group }, current } as FrdoScope);
export const envelope = (kind: string) => ({ schema_version: 1, abi_revision: RUNTIME_ABI_REVISION, organization_id: org, actor_id: actor, scope: { kind: 'group', group_id: group }, kind });
export async function packet(sealed = false): Promise<FrdoPacket> {
  const value = await captureReviewedPacket(await input(), review, proof, guard), capture = value.capture;
  const ref = { id: uid(700), revision: 1, state_hash: hash, snapshot_sha256: capture.snapshot_sha256 };
  const artifact = { artifact_id: uid(701), packet_id: ref.id, snapshot_sha256: ref.snapshot_sha256, byte_sha256: hash, byte_size: 3, binding_sha256: hash };
  return packetProjectionSchema.parse({ ref, stream: 'dpo', state: sealed ? 'file_generated' : 'preview_frozen', capture, created_at: stamp, created_by: actor, source_currency: 'current',
    current_build: sealed ? { id: uid(702), artifact_id: artifact.artifact_id, packet_id: ref.id, input_revision: 1, snapshot_sha256: ref.snapshot_sha256, worker_request_id: uid(703), recorded_at: stamp, state: 'sealed', artifact, failure: null, signing: { status: 'not_verified' }, template: capture.source_cas.template, readback_sha256: hash, registry_record_id: null } : null,
    latest_registry_record_id: null, latest_admin_handover_event_id: null, latest_upload_event_id: null, latest_receipt_event_id: null, parent_correction: null,
    issuer_review: { fact_kind: 'operator_recorded_issuer_regime', regime: 'ordinary_rf', evidence: { availability: 'available', evidence: proof }, review_note: review.review_note, recorded_by: actor, recorded_at: stamp, legal_policy_verified: false, external_origin_verified: false },
    capabilities: { can_read: true, can_preview: true, can_review_supplement: true, can_generate_file: true, can_record_admin_handover: sealed, can_record_external_upload: sealed, can_record_receipt: false, can_create_correction: false, can_register_packet: sealed, can_manage_operators: true, can_abandon_correction: false }
  }) as FrdoPacket;
}
export const eventBase = (revision = 1) => ({ id: uid(720 + revision), revision, actor_id: actor, recorded_at: stamp, previous_state_hash: revision === 1 ? null : hash, state_hash: hash, payload_sha256: hash });
export const summary = (p: FrdoPacket) => ({ ref: p.ref, stream: p.stream, state: p.state, row_count: p.capture.mapped_batch.rows.length, source_currency: p.source_currency, created_at: p.created_at });
