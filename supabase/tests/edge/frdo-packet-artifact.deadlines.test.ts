import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createTrustedFrdoService, type TrustedFrdoPorts } from '../../functions/frdo-packet-artifact/trustedService';
import { input, seal, guard } from '../../../src/lib/frdoFoundation/__tests__/fixtures';
import { actor, org, source, uid } from '../../../src/lib/educationIssuance/__tests__/fixtures';
import type { Stream } from '../../../src/lib/frdoFoundation/types';
import type { IssuerReviewIntent } from '../../../src/lib/frdoPackets/issuerReview';

beforeAll(() => vi.stubGlobal('crypto', webcrypto)); afterAll(() => vi.unstubAllGlobals());
function ports() {
  return {
    originalUser: vi.fn(async () => ({ id: actor })),
    originalRpc: vi.fn(async (_name: string, _args: Record<string, unknown>): Promise<unknown> => undefined),
    serviceRpc: vi.fn(), readSource: vi.fn(), donor: vi.fn(), xml: {} as TrustedFrdoPorts['xml'],
    uploadCandidate: vi.fn(), readCandidate: vi.fn(), now: () => Date.parse('2026-10-24T00:00:00Z'),
  } satisfies TrustedFrdoPorts;
}
async function scenario(stream: Stream, issueDate = '2026-10-22', regime: IssuerReviewIntent['regime'] = 'ordinary_rf') {
  const fixture = await input(stream), entry = fixture.items[0], facts = entry.record.frdo_facts!;
  entry.record.official.issue_date = facts.issue_date = issueDate;
  facts.training_start_date = facts.training_end_date = null; facts.missing = ['TRAINING_START_DATE', 'TRAINING_END_DATE'];
  await seal(entry);
  const envelope = { input: fixture, source_descriptors: [{ source, bucket: 'org-documents', path: `${org}/versions/${source.document_id}/fixture.pdf`, object_id: uid(930), updated_at: '2026-10-24T00:00:00Z', byte_size: 127, expected_sha256: 'b'.repeat(64) }] };
  const issuer_review: IssuerReviewIntent = regime === 'unconfirmed' ? { regime, evidence: null, review_note: null } : { regime, evidence: source, review_note: 'Синтетическая проверка режима, не утверждение законодательства' };
  const request = { schema_version: 1, abi_revision: 'uc020-persisted-v5', organization_id: org, scope: fixture.context.scope, query: { kind: 'preview', selection: { stream, record_ids: [entry.record.official.id], template: fixture.context.template }, issuer_review } };
  const p = ports(); p.originalRpc.mockResolvedValue(envelope);
  return { fixture, envelope, request, p, service: createTrustedFrdoService(p) };
}
describe('trusted preview separates per-stream pending deadlines without changing readiness or authority', () => {
  it.each(['po', 'dpo'] as const)('projects %s from the matching frozen issue facts while missing training dates still block a snapshot', async stream => {
    const s = await scenario(stream), result = await s.service.preview(s.request, guard);
    expect(result.kind).toBe('preview'); if (result.kind !== 'preview') throw Error('Expected preview');
    expect(result.preview.deadlines[0]).toMatchObject({ row_key: result.preview.rows[0].row_key, deadline: { verification: 'source_checked_pending_consolidation', stream, candidate_due_date: null, rule: { unit: stream === 'po' ? 'working_days' : 'calendar_days', period: stream === 'po' ? 3 : 30 } } });
    expect(result.preview.ready).toBe(false); expect(result.preview.rows[0].issues.some(issue => issue.code === 'MISSING_REQUIRED' && issue.severity === 'blocker')).toBe(true);
    expect(s.p.originalRpc).toHaveBeenCalledTimes(2); expect(s.p.originalUser).toHaveBeenCalledTimes(2);
    expect(s.p.readSource).not.toHaveBeenCalled(); expect(s.p.serviceRpc).not.toHaveBeenCalled();
  });
  it('uses the exact historical issue date rather than the current preview/as-of date', async () => {
    const s = await scenario('dpo', '2025-08-31'), result = await s.service.preview(s.request, guard);
    if (result.kind !== 'preview') throw Error('Expected preview');
    expect(result.preview.as_of_date).toBe('2026-10-23');
    expect(result.preview.deadlines[0].deadline).toMatchObject({ verification: 'pending_primary_current_law', due_date: null });
    expect(result.preview.deadlines[0].deadline).not.toHaveProperty('rule');
  });
  it('retains joint-regime readiness blockers and never emits an ordinary source orientation', async () => {
    const s = await scenario('po', '2026-10-22', 'joint_rf_foreign'), result = await s.service.preview(s.request, guard);
    if (result.kind !== 'preview') throw Error('Expected preview');
    expect(result.preview.ready).toBe(false); expect(result.preview.rows[0].issues.some(issue => issue.code === 'UNSUPPORTED_ISSUER_REGIME')).toBe(true);
    expect(result.preview.deadlines[0].deadline).toMatchObject({ verification: 'pending_primary_current_law', issuer_regime: 'joint_rf_foreign', due_date: null });
  });
  it('still refuses a changed original-source envelope after building pending messages', async () => {
    const s = await scenario('po'), changed = structuredClone(s.envelope); changed.input.context.as_of_date = '2026-10-24';
    s.p.originalRpc.mockResolvedValueOnce(s.envelope).mockResolvedValueOnce(changed);
    await expect(s.service.preview(s.request, guard)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    expect(s.p.serviceRpc).not.toHaveBeenCalled();
  });
  it('still refuses a different original authenticated actor before returning the projection', async () => {
    const s = await scenario('dpo'); s.p.originalUser.mockResolvedValueOnce({ id: actor }).mockResolvedValueOnce({ id: uid(931) });
    await expect(s.service.preview(s.request, guard)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(s.p.serviceRpc).not.toHaveBeenCalled();
  });
  it('rejects caller-supplied legal approval instead of accepting it as deadline authority', async () => {
    const s = await scenario('dpo');
    await expect(s.service.preview({ ...s.request, query: { ...s.request.query, issuer_review: { ...s.request.query.issuer_review, legal_policy_verified: true } } }, guard)).rejects.toThrow();
    expect(s.p.originalUser).not.toHaveBeenCalled(); expect(s.p.originalRpc).not.toHaveBeenCalled();
  });
});
