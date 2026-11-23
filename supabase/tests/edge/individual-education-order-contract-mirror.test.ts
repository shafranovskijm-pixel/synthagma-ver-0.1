import { describe, expect, it } from 'vitest';
import * as browser from '../../../src/lib/individualEducationOrders/contract';
import * as edge from '../../functions/_shared/individual-education-order-contract';
import { approvedOrder, context, hash, prepareAction, registeredOrder, renderReply, savedOrder, stamp, uid, variables } from '../../../src/lib/individualEducationOrders/__tests__/fixtures';

describe('W1 frontend and pure Deno DTO mirror', () => {
  it('has the same public schema exports without pulling actor or transport helpers into Edge', () => {
    expect(Object.keys(browser).sort()).toEqual(Object.keys(edge).sort()); expect(Object.keys(edge)).not.toContain('supabase'); expect(Object.keys(edge)).not.toContain('captureIndividualOrderScope');
  });
  it.each(['prepared', 'staged', 'saved'] as const)('agrees on the full %s context including exact raw observations and source shape', async stage => {
    const value = await context(stage); const front = browser.orderRenderContextSchema.safeParse(value), server = edge.orderRenderContextSchema.safeParse(value);
    expect(front.success).toBe(true); expect(server.success).toBe(true); if (front.success && server.success) expect(server.data).toEqual(front.data);
  });
  it.each(['wrong_job', 'ms_timestamp', 'missing_proof', 'wrong_owner_path', 'unknown_storage_field', 'fake_saved_state'] as const)('both reject %s instead of drifting at the worker boundary', async damage => {
    const value: any = await context('saved'); if (damage === 'wrong_job') value.staging.observed_object.provenance.render_job_id = uid(999); if (damage === 'ms_timestamp') value.output.observed_object.updated_at = '2026-11-23T12:00:00.123Z'; if (damage === 'missing_proof') value.staging.proof = null; if (damage === 'wrong_owner_path') value.output.file_path = uid(999) + '/other.pdf'; if (damage === 'unknown_storage_field') value.output.observed_object.bucket_grant = true; if (damage === 'fake_saved_state') value.render_job.stage = 'prepared';
    expect(browser.orderRenderContextSchema.safeParse(value).success).toBe(false); expect(edge.orderRenderContextSchema.safeParse(value).success).toBe(false);
  });
  it('agrees that raw metadata before first attestation does not claim verified HTML or output', async () => {
    const value = await context(), staged = await context('staged'); value.staging.observed_object = { ...staged.staging.observed_object!, provenance: { ...staged.staging.observed_object!.provenance, render_input_sha256: value.render_input_sha256 } };
    expect(browser.orderRenderContextSchema.safeParse(value).success).toBe(true); expect(edge.orderRenderContextSchema.safeParse(value).success).toBe(true); expect(value.render_job.html_sha256).toBeNull();
  });
  it('shares exact public render request/reply and keeps caller attestation input out', () => {
    const request = { version: 1, organization_id: uid(1), enrollment_id: uid(4), order_id: uid(6), expected_order_revision: 2, expected_order_sha256: hash, render_request_id: uid(41) };
    expect(edge.orderRenderRequestSchema.parse(request)).toEqual(browser.orderRenderRequestSchema.parse(request)); expect(edge.orderRenderReplySchema.parse(renderReply())).toEqual(browser.orderRenderReplySchema.parse(renderReply()));
    expect(edge.orderRenderRequestSchema.safeParse({ ...request, proof: { verified: true } }).success).toBe(false); expect(browser.orderRenderRequestSchema.safeParse({ ...request, proof: { verified: true } }).success).toBe(false);
  });
  it.each(['staging', 'output'] as const)('shares strict trusted %s attestation fields and the fixed renderer revision', kind => {
    const base = { kind, object_id: uid(51), object_updated_at: stamp, html_sha256: hash, render_input_sha256: hash, byte_sha256: hash, byte_size: 600, renderer: 'browserless', renderer_revision: 'uc-individual-order-v1' };
    const value = kind === 'staging' ? base : { ...base, source: savedOrder().artifact!.source, staging_object_id: uid(52), staging_updated_at: stamp };
    expect(edge.orderTrustedAttestationSchema.parse(value)).toEqual(browser.orderTrustedAttestationSchema.parse(value)); expect(edge.orderTrustedAttestationSchema.safeParse({ ...value, caller_verified: true }).success).toBe(false);
  });
  it('keeps programme facts and staff actions closed without a different Edge-only completion shortcut', () => {
    expect(edge.individualOrderActionSchema.parse(prepareAction())).toEqual(browser.individualOrderActionSchema.parse(prepareAction()));
    const wrong = { ...approvedOrder(), signed: true }; expect(edge.individualOrderSchema.safeParse(wrong).success).toBe(false); expect(browser.individualOrderSchema.safeParse(wrong).success).toBe(false);
    const record = registeredOrder(); record.programme_facts.program_type = 'internal_nonformal'; expect(edge.individualOrderSchema.safeParse(record).success).toBe(false); expect(browser.individualOrderSchema.safeParse(record).success).toBe(false);
  });
  it.each(['professional_training', 'dpo_upskilling', 'dpo_retraining'] as const)('uses the same %s render variables and programme labels', kind => {
    const value = variables(); value.programme_type = kind; value.programme_type_label = browser.programmeTypeLabels[kind];
    expect(edge.orderRenderVariablesSchema.parse(value)).toEqual(browser.orderRenderVariablesSchema.parse(value));
  });
});

 describe('W1 V4 committed output before service attestation', () => {
  it('accepts the real staged committed source without inventing artifact proof', async () => {
    const value = await context('staged'), saved = await context('saved');
    value.output.source = saved.output.source; value.output.object = saved.output.object; value.output.observed_object = saved.output.observed_object;
    expect(browser.orderRenderContextSchema.safeParse(value).success).toBe(true); expect(edge.orderRenderContextSchema.safeParse(value).success).toBe(true);
    expect(value.output.artifact).toBeNull(); expect(value.current_order_state).toBe('approved_unrendered'); expect(value.render_job.stage).toBe('staged');
  });
  it.each(['source_only', 'object_only', 'wrong_document', 'unobserved', 'prepared_committed'] as const)('rejects %s rather than treating metadata as saved proof', async damage => {
    const value = await context(damage === 'prepared_committed' ? 'prepared' : 'staged'), saved = await context('saved');
    value.output.source = saved.output.source; value.output.object = saved.output.object; value.output.observed_object = saved.output.observed_object;
    if (damage === 'source_only') value.output.object = null; if (damage === 'object_only') value.output.source = null; if (damage === 'wrong_document') value.output.source!.document_id = uid(999); if (damage === 'unobserved') value.output.observed_object = null;
    expect(browser.orderRenderContextSchema.safeParse(value).success).toBe(false); expect(edge.orderRenderContextSchema.safeParse(value).success).toBe(false);
  });
});
