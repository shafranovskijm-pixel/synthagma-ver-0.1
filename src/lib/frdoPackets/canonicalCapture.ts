import * as foundation from '../frdoFoundation/contract';
import { mapFrozenProjections } from '../frdoFoundation/mapper';
import { BOUNDS, canonicalJson, deepFreeze, ensureCurrent, sha256 } from '../frdoFoundation/hash';
import type { CurrentGuard } from '../frdoFoundation/types';
import * as c from './contract';
import { PacketInvariantError, verifyFrozenCapture } from './invariants';
import type { FrozenCapture } from './types';
import type { z } from 'zod';

/** Produce one minimal immutable generation capture from genuine current UC019 DTOs.
 * Full DTOs exist only during mapping. Persist no notes/handover/eligibility history,
 * signed URLs, mutable capability projections or fabricated replacement DTOs.
 * The returned rows/refs are NOT authorization; trusted outer DB CAS is mandatory. */
export async function captureFrozenPacket(input: unknown, guard: CurrentGuard): Promise<Readonly<FrozenCapture>> {
  ensureCurrent(guard);
  if (!input || typeof input !== 'object' || !Array.isArray((input as { items?: unknown }).items) ||
    (input as { items: unknown[] }).items.length < 1 || (input as { items: unknown[] }).items.length > BOUNDS.rows) {
    throw new PacketInvariantError('INVALID_REQUEST');
  }
  canonicalJson(input, BOUNDS.inputBytes);
  const parsed = foundation.foundationInputSchema.safeParse(structuredClone(input));
  if (!parsed.success) throw new PacketInvariantError('INVALID_REQUEST');
  const source = parsed.data;
  source.items.sort((a, b) => a.record.official.id < b.record.official.id ? -1 : a.record.official.id > b.record.official.id ? 1 : 0);
  const batch = await mapFrozenProjections(source, guard); ensureCurrent(guard);
  if (!batch.ready || batch.rows.length !== source.items.length) throw new PacketInvariantError('READINESS_BLOCKED');
  const proofs = new Map<string, z.infer<typeof foundation.sealedEvidenceSchema>>();
  const add = (evidence: z.infer<typeof foundation.sealedEvidenceSchema>) => {
    const checked = foundation.sealedEvidenceSchema.parse(evidence), key = canonicalJson(checked.source), old = proofs.get(key);
    if (old && canonicalJson(old) !== canonicalJson(checked)) throw new PacketInvariantError('SOURCE_CHANGED');
    proofs.set(key, checked);
  };
  for (const entry of source.items) {
    for (const record of [entry.record, entry.original]) {
      if (!record) continue;
      const artifact = record.artifact.artifact;
      if (record.artifact.availability !== 'available' || !artifact) throw new PacketInvariantError('READINESS_BLOCKED');
      add({ source: artifact.source, byte_sha256: artifact.byte_sha256, byte_size: artifact.byte_size });
    }
    for (const supplement of [entry.supplement, entry.original_supplement]) {
      if (!supplement) continue;
      const values = [...supplement.evidence];
      const exception = supplement.fields.snils_exception;
      if (exception.kind === 'external_support_approval') values.push(exception.not_assigned_confirmation, exception.approval_evidence);
      for (const projection of values) {
        if (projection.availability !== 'available' || !projection.evidence) throw new PacketInvariantError('READINESS_BLOCKED');
        add(projection.evidence);
      }
    }
  }
  const records = batch.rows.map(row => {
    if (!row.supplement) throw new PacketInvariantError('READINESS_BLOCKED');
    return { record: row.record, original_record: row.original_record, supplement: row.supplement, original_supplement: row.original_supplement };
  });
  const body = { schema_version: 1 as const, abi_revision: c.ABI_REVISION, mapped_batch: batch,
    source_cas: { organization_id: source.context.organization_id, scope: source.context.scope, template: source.context.template,
      records, sources: [...proofs].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => value) } };
  const snapshot_sha256 = await sha256(canonicalJson(body)); ensureCurrent(guard);
  return deepFreeze(await verifyFrozenCapture({ ...body, snapshot_sha256 }, guard));
}
