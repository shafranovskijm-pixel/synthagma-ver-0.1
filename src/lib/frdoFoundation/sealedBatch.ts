import { mappedBatchSchema } from './contract';
import { BOUNDS, canonicalJson, ensureCurrent, refuse, sha256 } from './hash';
import type { CurrentGuard, MappedBatch } from './types';

/** A checksum/shape boundary, not authority. A trusted caller must independently
 * validate original actor, every source/subject and exact persisted CAS snapshot. */
export async function verifySealedMappedBatch(input: unknown, guard: CurrentGuard, checkpoint: () => void = () => undefined): Promise<MappedBatch> {
  ensureCurrent(guard); checkpoint();
  const candidate = input as { rows?: unknown[] } | null;
  if (!candidate || !Array.isArray(candidate.rows) || candidate.rows.length < 1 || candidate.rows.length > BOUNDS.rows) return refuse('INVALID_REQUEST');
  canonicalJson(input, BOUNDS.inputBytes);
  const parsed = mappedBatchSchema.safeParse(input); if (!parsed.success) return refuse('INVALID_REQUEST');
  const batch = parsed.data;
  if (!batch.ready || batch.blocked_records.length) return refuse('READINESS_BLOCKED');
  const keys = new Set<string>(), records = new Set<string>();
  for (const row of batch.rows) {
    if (keys.has(row.row_key) || records.has(row.record.record_id)) return refuse('SOURCE_CHANGED');
    keys.add(row.row_key); records.add(row.record.record_id);
    const expectedKey = await sha256(canonicalJson({ organization_id: batch.context.organization_id, scope: batch.context.scope,
      stream: batch.context.stream, record_id: row.record.record_id })); ensureCurrent(guard); checkpoint();
    const { row_sha256, ...rowBody } = row;
    if (row.row_key !== expectedKey || await sha256(canonicalJson(rowBody)) !== row_sha256) return refuse('SOURCE_CHANGED'); ensureCurrent(guard); checkpoint();
    if (row.stream !== batch.context.stream || batch.context.scope.kind === 'group' && row.record.group_id !== batch.context.scope.group_id) return refuse('SOURCE_CHANGED');
  }
  const { root_sha256, ...body } = batch;
  if (await sha256(canonicalJson(body)) !== root_sha256) return refuse('SOURCE_CHANGED'); ensureCurrent(guard); checkpoint();
  return batch;
}
