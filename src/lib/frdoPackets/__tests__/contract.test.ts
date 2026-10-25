import { describe, expect, it } from 'vitest';
import * as c from '../contract.ts';
import { uid, org, actor, hash, stamp, source } from '../../educationIssuance/__tests__/fixtures.ts';
const packet = { id: uid(501), revision: 1, state_hash: hash, snapshot_sha256: hash };
const artifact = { artifact_id: uid(502), packet_id: packet.id, snapshot_sha256: hash, byte_sha256: hash, byte_size: 100, binding_sha256: hash };
const authority = { id: uid(503), organization_id: org, operator_user_id: actor, revision: 1, state_hash: hash };
const evidence = { source, byte_sha256: hash, byte_size: 20 };
const envelope = { schema_version: 1, abi_revision: c.ABI_REVISION, organization_id: org, scope: { kind: 'organization' }, request_id: uid(504) };
const upload = { kind: 'record_fis_upload', packet, artifact, authority, submission_id: 'SYNTHETIC-1', occurred_at: stamp, evidence, external_operations: [] };
const build = { id: uid(505), artifact_id: artifact.artifact_id, packet_id: packet.id, input_revision: 1, snapshot_sha256: hash, worker_request_id: uid(506), recorded_at: stamp };

describe('persisted FRDO wire separates client claims, stored facts and trusted artifacts', () => {
  it('uses the genuine five-part canonical UUID shape and rejects truncated, foreign and malformed identifiers', () => {
    expect(c.uuid.safeParse(uid(1)).success).toBe(true);
    expect(c.uuid.safeParse('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee').success).toBe(true);
    for (const value of ['00000000-0000-4000-000000000001', '00000000-0000-4000-8000-00000000001', 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE', '00000000-0000-4000-8000-00000000000g']) {
      expect(c.uuid.safeParse(value).success).toBe(false);
    }
  });
  it('accepts explicit operator upload facts but rejects actor, capability and FIS-acceptance claims in a user command', () => {
    expect(c.mutationRequestSchema.safeParse({ ...envelope, action: upload }).success).toBe(true);
    for (const claim of [{ actor_id: actor }, { capabilities: { can_write: true } }, { fis_accepted: true }]) {
      expect(c.mutationRequestSchema.safeParse({ ...envelope, ...claim, action: upload }).success).toBe(false);
    }
    expect(c.mutationRequestSchema.safeParse({ ...envelope, action: { ...upload, accepted: true } }).success).toBe(false);
  });
  it('requires an exact appointment reference instead of accepting a platform-admin or owner flag', () => {
    const { authority: ignored, ...missing } = upload; void ignored;
    expect(c.actionSchema.safeParse(missing).success).toBe(false);
    expect(c.actionSchema.safeParse({ ...missing, platform_admin: true }).success).toBe(false);
    expect(c.actionSchema.safeParse({ ...upload, authority: { ...authority, role: 'owner' } }).success).toBe(false);
  });
  it('never upgrades an organizational appointment to verified external delegation', () => {
    const value = { ref: authority, fact_kind: 'organization_recorded_appointment', state: 'active', validity: { kind: 'explicit_open_end', from: stamp },
      evidence: { availability: 'available', evidence }, external_delegation_verified: false, recorded_at: stamp, recorded_by: actor, revocation_event_id: null };
    expect(c.authoritySchema.safeParse(value).success).toBe(true);
    expect(c.authoritySchema.safeParse({ ...value, external_delegation_verified: true }).success).toBe(false);
    expect(c.authoritySchema.safeParse({ ...value, state: 'revoked' }).success).toBe(false);
  });
  it('requires an explicit valid appointment interval and rejects reversed dates', () => {
    expect(c.authorityValiditySchema.safeParse({ kind: 'bounded', from: '2026-10-23T00:00:00Z', until: '2026-10-22T00:00:00Z' }).success).toBe(false);
    expect(c.authorityValiditySchema.safeParse({ kind: 'explicit_open_end', from: stamp }).success).toBe(true);
    expect(c.authorityValiditySchema.safeParse({ from: stamp }).success).toBe(false);
  });
  it('keeps unsealed builds unissued and rejects inconsistent failure/artifact bindings', () => {
    expect(c.artifactBuildSchema.safeParse({ ...build, state: 'queued', artifact: null, failure: null }).success).toBe(true);
    expect(c.artifactBuildSchema.safeParse({ ...build, state: 'queued', artifact, failure: null }).success).toBe(false);
    expect(c.artifactBuildSchema.safeParse({ ...build, state: 'failed', artifact: null, failure: null }).success).toBe(false);
  });
  it('does not accept client-chosen worker paths or metadata hashes as an artifact byte proof', () => {
    const request = { schema_version: 1, abi_revision: c.ABI_REVISION, organization_id: org, packet_id: packet.id, build_id: build.id, input_revision: 1, request_id: uid(507) };
    expect(c.workerRequestSchema.safeParse(request).success).toBe(true);
    expect(c.workerRequestSchema.safeParse({ ...request, output_path: 'other/export.xlsx' }).success).toBe(false);
    expect(c.artifactRefSchema.safeParse({ ...artifact, content_hash: hash }).success).toBe(false);
    const { byte_sha256: ignored, ...missing } = artifact; void ignored;
    expect(c.artifactRefSchema.safeParse({ ...missing, content_hash: hash }).success).toBe(false);
  });
  it('requires exact packet artifact/context tags rather than a fabricated single-pupil enrollment', () => {
    const value = { kind: 'frdo_packet_artifact', packet_id: packet.id, artifact_id: artifact.artifact_id, snapshot_sha256: hash, binding_sha256: hash };
    expect(c.registryPacketSourceSchema.safeParse(value).success).toBe(true);
    expect(c.registryPacketSourceSchema.safeParse({ ...value, enrollment_id: uid(508) }).success).toBe(false);
    expect(c.registryPacketContextSchema.safeParse({ kind: 'frdo_packet', packet_id: packet.id, artifact_id: artifact.artifact_id, snapshot_sha256: hash, participants: [actor] }).success).toBe(false);
  });
  it('uses bounded cursor pages without an ever-growing embedded artifact or correction list', () => {
    expect(c.querySchema.safeParse({ kind: 'artifacts', packet_id: packet.id, after_id: uid(509), limit: 50 }).success).toBe(true);
    expect(c.querySchema.safeParse({ kind: 'corrections', packet_id: packet.id, after_id: null, limit: 51 }).success).toBe(false);
    expect(c.querySchema.safeParse({ kind: 'history', packet_id: packet.id, ceiling_revision: 600, before_revision: 550, limit: 50 }).success).toBe(true);
  });
  it('keeps packet downloads and direct receipt reads explicit about identity, signing and unverified external origin', () => {
    const file = { schema_version: 1, organization_id: org, scope: { kind: 'organization' }, packet_id: packet.id, artifact_id: artifact.artifact_id,
      byte_sha256: hash, byte_size: 100, expires_at: stamp, signed_url: 'https://synthetic.invalid/file', purpose: 'historical_copy', signing: { status: 'not_verified' } };
    expect(c.downloadProjectionSchema.safeParse(file).success).toBe(true);
    expect(c.downloadProjectionSchema.safeParse({ ...file, job_id: packet.id }).success).toBe(false);
    expect(c.downloadProjectionSchema.safeParse({ ...file, signing: { status: 'verified' } }).success).toBe(false);
    const result = { schema_version: 1, abi_revision: c.ABI_REVISION, organization_id: org, scope: { kind: 'organization' }, actor_id: actor,
      kind: 'receipt', packet_id: packet.id, external_origin_verified: false, receipt: { event_id: uid(520), upload_event_id: uid(521), submission_id: 'SYNTHETIC',
        received_at: stamp, recorded_at: stamp, recorded_by: actor, receipt_evidence: { availability: 'available', evidence }, recording_method: 'authorized_operator_transcription',
        outcomes: [{ row_key: hash, row_sha256: hash, record_id: uid(522), outcome: 'accepted', external_record_reference: null }], operator_note: 'Синтетическая транскрипция' } };
    expect(c.readResultSchema.safeParse(result).success).toBe(true);
    expect(c.readResultSchema.safeParse({ ...result, external_origin_verified: true }).success).toBe(false);
    const { external_origin_verified: ignored, ...missing } = result; void ignored;
    expect(c.readResultSchema.safeParse(missing).success).toBe(false);
  });
  it('rejects fractional and unsafe revisions before a CAS command can be sent', () => {
    for (const value of [1.5, Number.MAX_SAFE_INTEGER + 1, 0]) expect(c.packetRefSchema.safeParse({ ...packet, revision: value }).success).toBe(false);
  });
});
