import { beforeAll, describe, expect, it, vi } from 'vitest';
import { input, duplicate, guard, seal } from '../../frdoFoundation/__tests__/fixtures';
import { uid, org, actor, hash, stamp, source } from '../../educationIssuance/__tests__/fixtures';
import { canonicalJson, sha256 } from '../../frdoFoundation/hash';
import { captureFrozenPacket } from '../canonicalCapture';
import { assertArtifactBinding, assertCurrentOperator, assertEnvelope, assertExactManifest, assertRejectedCorrection, assertSameRequestPayload,
  assertUploadReceiptBinding, deriveSubjectManifest, retainedPersonIds, validateReceiptPartition, verifyFrozenCapture } from '../invariants';
import type { Authority, FrozenCapture } from '../types';
import type { Row } from '../../frdoFoundation/types';
let capture: Readonly<FrozenCapture>;
beforeAll(async () => { capture = await captureFrozenPacket(await input(), guard); });
const clone = () => structuredClone(capture) as FrozenCapture;
const proof = { source, byte_sha256: hash, byte_size: 127 };
const packet = { id: uid(600), revision: 1, state_hash: hash, snapshot_sha256: hash };
const artifact = { artifact_id: uid(601), packet_id: packet.id, snapshot_sha256: hash, byte_sha256: hash, byte_size: 127, binding_sha256: hash };
function twoRows(): Row[] {
  const row = structuredClone(capture.mapped_batch.rows[0]), other = structuredClone(row);
  other.row_key = 'c'.repeat(64); other.row_sha256 = 'd'.repeat(64); other.record.record_id = uid(602);
  return [row, other];
}
function receipt(rows: readonly Row[]) {
  return { upload_event_id: uid(603), submission_id: 'SYNTHETIC-RECEIPT', receipt_evidence: proof, received_at: '2026-10-23T12:00:00Z',
    recording_method: 'authorized_operator_transcription' as const, operator_note: 'Синтетическая квитанция, не факт подачи',
    outcomes: rows.map(row => ({ row_key: row.row_key, row_sha256: row.row_sha256, record_id: row.record.record_id,
      outcome: 'rejected' as const, external_error_code: null, message: 'Синтетическое замечание' })) };
}
function authority(): Authority { return { ref: { id: uid(604), organization_id: org, operator_user_id: actor, revision: 1, state_hash: hash },
  fact_kind: 'organization_recorded_appointment', state: 'active', validity: { kind: 'bounded', from: '2026-10-01T00:00:00Z', until: '2026-11-01T00:00:00Z' },
  evidence: { availability: 'available', evidence: proof }, external_delegation_verified: false, recorded_at: stamp, recorded_by: actor, revocation_event_id: null }; }

describe('minimal immutable FRDO capture and exact cross-object invariants', () => {
  it('uses the genuine J mapper, freezes exact rows, and retains no K notes/handover or capability snapshots', async () => {
    const value = await input(); value.items[0].record.notes = 'PRIVATE_UNRELATED_NOTE';
    const before = canonicalJson(value), result = await captureFrozenPacket(value, guard);
    expect(canonicalJson(value)).toBe(before); expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.mapped_batch.rows[0].cells)).toBe(true);
    expect(canonicalJson(result)).not.toContain('PRIVATE_UNRELATED_NOTE');
    expect(canonicalJson(result)).not.toContain('capabilities');
    expect(await verifyFrozenCapture(result, guard)).toEqual(result);
  });
  it('rejects an excessive row count before traversing its cell content', async () => {
    let reads = 0; const row = Object.defineProperty({}, 'cells', { enumerable: true, get: () => { reads++; throw Error('Should not traverse'); } });
    const value = { mapped_batch: { rows: Array.from({ length: 1001 }, () => row) }, source_cas: { records: [{}], sources: [{}] } };
    await expect(verifyFrozenCapture(value, guard)).rejects.toMatchObject({ code: 'INVALID_REQUEST' }); expect(reads).toBe(0);
  });
  it('counts the hashed actor as retained personal data even when presentation attribution could be hidden', () => {
    expect(retainedPersonIds(capture)).toEqual([...new Set([actor, capture.mapped_batch.rows[0].record.user_id])].sort());
    expect(retainedPersonIds(capture)).toContain(actor);
  });
  it('derives every exact original/duplicate binding and rejects a first-pupil-only manifest', async () => {
    const value = await captureFrozenPacket(await duplicate(), guard), manifest = deriveSubjectManifest(value);
    expect(manifest).toHaveLength(2); expect(manifest.flatMap(item => item.purposes).sort()).toEqual(['original', 'selected']);
    expect(() => assertExactManifest(value, manifest.slice(0, 1))).toThrowError('SOURCE_CHANGED');
    expect(() => assertExactManifest(value, manifest)).not.toThrow();
  });
  it('refuses stale source revisions even when a caller rehashes the outer capture', async () => {
    const changed = clone(); changed.source_cas.records[0].record.record_revision++;
    const { snapshot_sha256: ignored, ...body } = changed; void ignored;
    changed.snapshot_sha256 = await sha256(canonicalJson(body));
    await expect(verifyFrozenCapture(changed, guard)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  });
  it('refuses a changed literal row even when its batch and snapshot outer hashes were recomputed', async () => {
    const changed = clone(); changed.mapped_batch.rows[0].cells[0] = 'Подменённый документ';
    const { root_sha256: ignored, ...batch } = changed.mapped_batch; void ignored;
    changed.mapped_batch.root_sha256 = await sha256(canonicalJson(batch));
    const { snapshot_sha256: alsoIgnored, ...body } = changed; void alsoIgnored;
    changed.snapshot_sha256 = await sha256(canonicalJson(body));
    await expect(verifyFrozenCapture(changed, guard)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  });
  it('blocks conflicting byte proofs for the same actual immutable version', async () => {
    const value = await input(), entry = value.items[0], artifact = entry.record.artifact.artifact!;
    entry.supplement!.evidence = [{ availability: 'available', evidence: { source: artifact.source, byte_sha256: 'e'.repeat(64), byte_size: artifact.byte_size } }];
    await seal(entry);
    await expect(captureFrozenPacket(value, guard)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  });
  it('denies source reads lacking current export permission and leaves the input untouched', async () => {
    const value = await input(); value.items[0].record.capabilities.can_export = false; const before = canonicalJson(value);
    await expect(captureFrozenPacket(value, guard)).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); expect(canonicalJson(value)).toBe(before);
  });
  it('does not return a late capture after current rights are withdrawn during a digest', async () => {
    const value = await input(), native = crypto.subtle.digest.bind(crypto.subtle); let live = true, release!: (bytes: ArrayBuffer) => void;
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(() => new Promise<ArrayBuffer>(done => { release = done; }));
    try {
      const pending = captureFrozenPacket(value, { assertCurrent: () => { if (!live) throw Error('Revoked epoch'); } });
      const rejected = expect(pending).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
      await vi.waitFor(() => expect(spy).toHaveBeenCalled()); live = false;
      const [algorithm, data] = spy.mock.calls[0]; release(await native(algorithm, data)); await rejected;
    } finally { spy.mockRestore(); }
  });
  it('does not let a manifest from another organization/group/actor satisfy an envelope', () => {
    const expected = { organization_id: org, actor_id: actor, scope: { kind: 'organization' as const } };
    for (const actual of [{ ...expected, actor_id: uid(610) }, { ...expected, organization_id: uid(611) }, { ...expected, scope: { kind: 'group' as const, group_id: uid(612) } }]) {
      expect(() => assertEnvelope(expected, actual)).toThrowError('ACCESS_DENIED');
    }
  });
  it('rejects missing, extra, duplicate, foreign or mismatched receipt rows instead of deriving acceptance', () => {
    const rows = twoRows(), good = receipt(rows);
    expect(validateReceiptPartition(rows, good).state).toBe('rejected');
    const missing = { ...good, outcomes: good.outcomes.slice(0, 1) };
    const duplicate = { ...good, outcomes: [good.outcomes[0], good.outcomes[0]] };
    const foreign = structuredClone(good); foreign.outcomes[0].record_id = uid(613);
    const rehashed = structuredClone(good); rehashed.outcomes[0].row_sha256 = 'f'.repeat(64);
    const extra = { ...good, outcomes: [...good.outcomes, { ...good.outcomes[0], row_key: 'a'.repeat(64) }] };
    for (const value of [missing, duplicate, foreign, rehashed, extra]) expect(() => validateReceiptPartition(rows, value)).toThrowError('RECEIPT_MISMATCH');
  });
  it('keeps accepted, partially rejected and unresolved receipts distinct', () => {
    const rows = twoRows(), good = receipt(rows), accepted = { ...good.outcomes[0], outcome: 'accepted' as const, external_record_reference: 'SYNTHETIC' };
    const { message: ignored, external_error_code: alsoIgnored, ...acceptedClean } = accepted; void ignored; void alsoIgnored;
    expect(validateReceiptPartition(rows, { ...good, outcomes: [acceptedClean, good.outcomes[1]] }).state).toBe('partially_rejected');
    const second = { ...acceptedClean, row_key: rows[1].row_key, row_sha256: rows[1].row_sha256, record_id: rows[1].record.record_id };
    expect(validateReceiptPartition(rows, { ...good, outcomes: [acceptedClean, second] }).state).toBe('accepted');
    const unresolved = { row_key: rows[1].row_key, row_sha256: rows[1].row_sha256, record_id: rows[1].record.record_id, outcome: 'unresolved', message: 'Ответ не определён' };
    expect(validateReceiptPartition(rows, { ...good, outcomes: [acceptedClean, unresolved] }).state).toBe('receipt_unresolved');
  });
  it('allows corrections only for the exact rejected parent subset, never accepted or unknown rows', () => {
    const rows = twoRows(), good = receipt(rows);
    expect(() => assertRejectedCorrection(rows, good, [rows[0].row_key])).not.toThrow();
    expect(() => assertRejectedCorrection(rows, good, ['0'.repeat(64)])).toThrowError('ILLEGAL_TRANSITION');
    expect(() => assertRejectedCorrection(rows, good, [rows[0].row_key, rows[0].row_key])).toThrowError('ILLEGAL_TRANSITION');
    const accepted = { row_key: rows[0].row_key, row_sha256: rows[0].row_sha256, record_id: rows[0].record.record_id, outcome: 'accepted' as const, external_record_reference: 'SYNTHETIC' };
    expect(() => assertRejectedCorrection(rows, { ...good, outcomes: [accepted, good.outcomes[1]] }, [rows[0].row_key])).toThrowError('ILLEGAL_TRANSITION');
  });
  it('binds an external receipt to the actual upload, submission and exact artifact', () => {
    const value = receipt(twoRows()), upload = { event_id: value.upload_event_id, submission_id: value.submission_id, artifact, occurred_at: '2026-10-23T11:00:00Z' };
    expect(() => assertUploadReceiptBinding(upload, packet, value)).not.toThrow();
    expect(() => assertUploadReceiptBinding({ ...upload, submission_id: 'OTHER' }, packet, value)).toThrowError('RECEIPT_MISMATCH');
    expect(() => assertArtifactBinding(packet, { ...artifact, snapshot_sha256: '0'.repeat(64) })).toThrowError('SOURCE_CHANGED');
  });
  it('requires the actual current operator, current exact appointment, evidence and unexpired validity', () => {
    const value = authority(), current = { organization_id: org, actor_id: actor, scope: { kind: 'organization' as const } };
    expect(() => assertCurrentOperator(value, value.ref, current, '2026-10-23T00:00:00Z')).not.toThrow();
    expect(() => assertCurrentOperator(value, value.ref, { ...current, actor_id: uid(614) }, '2026-10-23T00:00:00Z')).toThrowError('ACCESS_DENIED');
    expect(() => assertCurrentOperator(value, value.ref, current, '2026-11-01T00:00:00Z')).toThrowError('ACCESS_DENIED');
    expect(() => assertCurrentOperator({ ...value, evidence: { availability: 'currently_unavailable', evidence: null } }, value.ref, current, '2026-10-23T00:00:00Z')).toThrowError('ACCESS_DENIED');
    expect(() => assertCurrentOperator(value, { ...value.ref, revision: 2 }, current, '2026-10-23T00:00:00Z')).toThrowError('ACCESS_DENIED');
  });
  it('retains the same request payload hash and denies a changed or revoked retry', async () => {
    const payload = { action: 'generate_file', packet_id: packet.id }, digest = await sha256(canonicalJson(payload));
    await expect(assertSameRequestPayload(digest, payload, guard)).resolves.toBeUndefined();
    await expect(assertSameRequestPayload(digest, { ...payload, packet_id: uid(615) }, guard)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(assertSameRequestPayload(digest, payload, { assertCurrent: () => { throw Error('Revoked'); } })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
});
