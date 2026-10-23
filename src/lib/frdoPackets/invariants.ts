import * as c from './contract';
import { canonicalJson, ensureCurrent, sha256 } from '../frdoFoundation/hash';
import type { CurrentGuard, Row } from '../frdoFoundation/types';
import type { ArtifactRef, Authority, AuthorityRef, FrozenCapture, ManifestSubject, PacketContext, PacketRef } from './types';
import type { z } from 'zod';
import { receiptInputSchema } from '../frdoFoundation/contract';

export class PacketInvariantError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'ACCESS_DENIED' | 'SOURCE_CHANGED' | 'READINESS_BLOCKED' |
    'IDEMPOTENCY_CONFLICT' | 'REVISION_CONFLICT' | 'RECEIPT_MISMATCH' | 'ILLEGAL_TRANSITION') {
    super(code); this.name = 'PacketInvariantError';
  }
}
function refuse(code: PacketInvariantError['code']): never { throw new PacketInvariantError(code); }
export const sameValue = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);

/** Pure response validation only. The database still enforces actual current rights. */
export function assertEnvelope(expected: PacketContext, actual: PacketContext): void {
  if (expected.organization_id !== actual.organization_id || expected.actor_id !== actual.actor_id || !sameValue(expected.scope, actual.scope)) refuse('ACCESS_DENIED');
}
export function assertPacketRef(expected: PacketRef, actual: PacketRef): void {
  if (!c.packetRefSchema.safeParse(expected).success || !c.packetRefSchema.safeParse(actual).success || !sameValue(expected, actual)) refuse('REVISION_CONFLICT');
}
export function assertArtifactBinding(packet: PacketRef, artifact: ArtifactRef): void {
  if (!c.artifactRefSchema.safeParse(artifact).success || artifact.packet_id !== packet.id || artifact.snapshot_sha256 !== packet.snapshot_sha256) refuse('SOURCE_CHANGED');
}

export function deriveSubjectManifest(capture: FrozenCapture): ManifestSubject[] {
  const subjects = new Map<string, ManifestSubject>();
  const exactRefs = new Map<string, unknown>();
  for (const row of capture.source_cas.records) {
    for (const [ref, purpose] of [[row.record, 'selected'], [row.original_record, 'original']] as const) {
      if (!ref) continue;
      if (exactRefs.has(ref.record_id) && !sameValue(exactRefs.get(ref.record_id), ref)) refuse('SOURCE_CHANGED');
      exactRefs.set(ref.record_id, ref);
      const identity = { record_id: ref.record_id, user_id: ref.user_id, enrollment_id: ref.enrollment_id, course_id: ref.course_id, group_id: ref.group_id };
      const previous = subjects.get(ref.record_id);
      if (previous) {
        const { purposes: ignored, ...oldIdentity } = previous; void ignored;
        if (!sameValue(oldIdentity, identity)) refuse('SOURCE_CHANGED');
      }
      if (previous) { if (!previous.purposes.includes(purpose)) previous.purposes.push(purpose); }
      else subjects.set(ref.record_id, { ...identity, purposes: [purpose] });
    }
  }
  return [...subjects.values()].sort((a, b) => a.record_id < b.record_id ? -1 : a.record_id > b.record_id ? 1 : 0)
    .map(value => c.manifestSubjectSchema.parse({ ...value, purposes: [...value.purposes].sort() }));
}

/** Every stored row must be matched, not merely the first pupil or the current actor. */
export function assertExactManifest(capture: FrozenCapture, actual: readonly ManifestSubject[]): void {
  if (!sameValue(deriveSubjectManifest(capture), actual)) refuse('SOURCE_CHANGED');
}
export function retainedPersonIds(capture: FrozenCapture): string[] {
  // The actor is part of the immutable J context/hash. Presentation masking is not erasure.
  return [...new Set([capture.mapped_batch.context.actor_id, ...deriveSubjectManifest(capture).map(value => value.user_id)])].sort();
}

export async function verifyFrozenCapture(value: unknown, guard: CurrentGuard): Promise<FrozenCapture> {
  ensureCurrent(guard);
  const candidate = value as { mapped_batch?: { rows?: unknown[] }; source_cas?: { records?: unknown[]; sources?: unknown[] } } | null;
  if (!candidate || !Array.isArray(candidate.mapped_batch?.rows) || candidate.mapped_batch.rows.length < 1 || candidate.mapped_batch.rows.length > 1000 ||
    !Array.isArray(candidate.source_cas?.records) || candidate.source_cas.records.length < 1 || candidate.source_cas.records.length > 1000 ||
    !Array.isArray(candidate.source_cas?.sources) || candidate.source_cas.sources.length < 1 || candidate.source_cas.sources.length > 62000) return refuse('INVALID_REQUEST');
  canonicalJson(value); // Bound the whole JSON domain before schema cloning or digest allocations.
  const parsed = c.frozenCaptureSchema.safeParse(value); if (!parsed.success) return refuse('INVALID_REQUEST');
  const capture = parsed.data, batch = capture.mapped_batch, cas = capture.source_cas;
  if (!batch.ready || batch.blocked_records.length || !batch.rows.length) return refuse('READINESS_BLOCKED');
  if (cas.organization_id !== batch.context.organization_id || !sameValue(cas.scope, batch.context.scope) || !sameValue(cas.template, batch.context.template)) return refuse('SOURCE_CHANGED');
  if (cas.records.length !== batch.rows.length) return refuse('SOURCE_CHANGED');
  let previous = '';
  for (let index = 0; index < cas.records.length; index++) {
    const source = cas.records[index], row = batch.rows[index];
    if (source.record.record_id <= previous) return refuse('SOURCE_CHANGED'); previous = source.record.record_id;
    if (!sameValue(source.record, row.record) || !sameValue(source.original_record, row.original_record) ||
      !sameValue(source.supplement, row.supplement) || !sameValue(source.original_supplement, row.original_supplement)) return refuse('SOURCE_CHANGED');
    const { row_sha256, ...rowBody } = row;
    const rowKey = await sha256(canonicalJson({ organization_id: cas.organization_id, scope: cas.scope, stream: batch.context.stream, record_id: row.record.record_id })); ensureCurrent(guard);
    if (row.row_key !== rowKey || await sha256(canonicalJson(rowBody)) !== row_sha256) return refuse('SOURCE_CHANGED'); ensureCurrent(guard);
    if (cas.scope.kind === 'group' && (source.record.group_id !== cas.scope.group_id || source.original_record && source.original_record.group_id !== cas.scope.group_id)) return refuse('ACCESS_DENIED');
  }
  let previousSource = '';
  for (const source of cas.sources) {
    const key = canonicalJson(source.source);
    if (key <= previousSource) return refuse('SOURCE_CHANGED'); previousSource = key;
  }
  const { root_sha256, ...batchBody } = batch;
  if (await sha256(canonicalJson(batchBody)) !== root_sha256) return refuse('SOURCE_CHANGED'); ensureCurrent(guard);
  const { snapshot_sha256, ...snapshotBody } = capture;
  if (await sha256(canonicalJson(snapshotBody)) !== snapshot_sha256) return refuse('SOURCE_CHANGED'); ensureCurrent(guard);
  deriveSubjectManifest(capture);
  return capture;
}

/** Receipt status is derived from an exact complete partition of frozen rows. */
export function validateReceiptPartition(rows: readonly Row[], value: unknown) {
  const parsed = receiptInputSchema.safeParse(value); if (!parsed.success) return refuse('RECEIPT_MISMATCH');
  const receipt = parsed.data;
  if (!rows.length || receipt.outcomes.length !== rows.length) return refuse('RECEIPT_MISMATCH');
  const expected = new Map(rows.map(row => [row.row_key, row]));
  if (expected.size !== rows.length) return refuse('RECEIPT_MISMATCH');
  let accepted = 0, rejected = 0, unresolved = 0;
  for (const outcome of receipt.outcomes) {
    const row = expected.get(outcome.row_key);
    if (!row || row.record.record_id !== outcome.record_id || row.row_sha256 !== outcome.row_sha256) return refuse('RECEIPT_MISMATCH');
    expected.delete(outcome.row_key);
    if (outcome.outcome === 'accepted') accepted++; else if (outcome.outcome === 'rejected') rejected++; else unresolved++;
  }
  if (expected.size) return refuse('RECEIPT_MISMATCH');
  const state = unresolved ? 'receipt_unresolved' : accepted === rows.length ? 'accepted' : rejected === rows.length ? 'rejected' : 'partially_rejected';
  return { state, accepted, rejected, unresolved, receipt } as const;
}

export function assertUploadReceiptBinding(upload: { event_id: string; submission_id: string; artifact: ArtifactRef; occurred_at: string },
  packet: PacketRef, value: unknown): void {
  const receipt = receiptInputSchema.safeParse(value); if (!receipt.success) return refuse('RECEIPT_MISMATCH');
  assertArtifactBinding(packet, upload.artifact);
  if (receipt.data.upload_event_id !== upload.event_id || receipt.data.submission_id !== upload.submission_id ||
    Date.parse(receipt.data.received_at) < Date.parse(upload.occurred_at)) return refuse('RECEIPT_MISMATCH');
}
export function assertCurrentOperator(authority: Authority, expected: AuthorityRef, current: PacketContext, serverNow: string): void {
  if (!c.authoritySchema.safeParse(authority).success || !sameValue(authority.ref, expected) || authority.ref.organization_id !== current.organization_id ||
    authority.ref.operator_user_id !== current.actor_id || authority.state !== 'active' || authority.evidence.availability !== 'available') return refuse('ACCESS_DENIED');
  const at = Date.parse(serverNow), from = Date.parse(authority.validity.from);
  if (!Number.isFinite(at) || at < from || authority.validity.kind === 'bounded' && at >= Date.parse(authority.validity.until)) return refuse('ACCESS_DENIED');
}
export async function assertSameRequestPayload(storedSha: string, payload: unknown, guard: CurrentGuard): Promise<void> {
  ensureCurrent(guard); const hash = await sha256(canonicalJson(payload)); ensureCurrent(guard);
  if (storedSha !== hash) refuse('IDEMPOTENCY_CONFLICT');
}
export function assertRejectedCorrection(parentRows: readonly Row[], receipt: z.infer<typeof receiptInputSchema>, selectedKeys: readonly string[]): void {
  const validated = validateReceiptPartition(parentRows, receipt);
  if (!selectedKeys.length || new Set(selectedKeys).size !== selectedKeys.length) return refuse('ILLEGAL_TRANSITION');
  const rejected = new Set(validated.receipt.outcomes.filter(value => value.outcome === 'rejected').map(value => value.row_key));
  if (selectedKeys.some(key => !rejected.has(key))) refuse('ILLEGAL_TRANSITION');
}
