import { describe, it, expect } from 'vitest';
import { fixture, state, commitInput, fileInput, actor, scope, id, pdf } from '../../functions/_shared/__tests__/admission-case-evidence.fixture';
import { registeredOrder } from '../../../src/lib/individualEducationOrders/__tests__/fixtures';
import { individualAdmissionBindingSchema, individualAdmissionStateSchema } from '../../functions/_shared/individual-admission-evidence-schema';
import { type AdmissionDbResult } from '../../functions/_shared/admission-case-access';

const individualScope = { kind: 'individual_w1' as const, version: 1 as const, ...scope, group_id: null };
const inputScope = {schema_version: 2, kind: 'individual_w1', organization_id: scope.organization_id, enrollment_id: scope.enrollment_id};
const commitV2 = {...inputScope, ...commitInput}, fileV2 = {...inputScope, ...fileInput};
const rpcScope = {kind: 'individual_w1', version: 1, organization_id: scope.organization_id, enrollment_id: scope.enrollment_id};
function binding() {
  const order = registeredOrder(), {output_review: _review, ...artifact} = order.artifact!;
  return individualAdmissionBindingSchema.parse({kind: 'individual_w1_admission', version: 1, scope: individualScope,
    programme: order.programme, programme_facts: order.programme_facts, source_hash: 'a'.repeat(64), admission_order: {
      order_id: order.id, order_revision: order.revision, approved_order_revision: 2, approved_order_sha256: '2'.repeat(64),
      decision_event: {id: order.decision!.event_id, revision: 2, payload_sha256: order.decision!.payload_sha256},
      registration_event: {id: order.artifact!.output_review!.event_id, revision: 5, payload_sha256: '3'.repeat(64)},
      registry: order.registry, artifact, dates: order.dates,
    }});
}
async function individualFixture() {
  const f = await fixture(), exactBinding = binding();
  const toState = (revision = 5) => {
    const {prerequisites: _old, ...old} = state(f.hash, f.mime, f.bytes.length, revision);
    return individualAdmissionStateSchema.parse({...old, scope: individualScope, program_ref: exactBinding.programme,
      program_type: exactBinding.programme_facts.program_type, blockers: [], issuance_reviews: [], issuance_conditions: [], binding: exactBinding});
  };
  const toReceipt = (raw: ReturnType<typeof f.receipt>) => ({...raw, schema_version: 2, ok: true, scope: individualScope,
    receipt: {...raw.receipt, schema_version: 2}, state: toState(raw.state.revision)});
  const toContext = () => {
    const raw = f.context();
    return {...raw, schema_version: 2, scope: individualScope, binding: exactBinding,
      replay_result: raw.replay_result === null ? null : toReceipt(raw.replay_result)};
  };
  const toFileContext = () => ({...f.fileContext(), schema_version: 2, scope: individualScope});
  const original = f.rpc.getMockImplementation()!;
  f.rpc.mockImplementation(async (name, args): Promise<AdmissionDbResult> => {
    const raw = await original(name, args);
    if (name === 'uc_finalize_admission_case_evidence') return {data: toReceipt(raw.data as ReturnType<typeof f.receipt>), error: null};
    return {data: name === 'uc_admission_evidence_file_context' ? toFileContext() : toContext(), error: null};
  });
  return {...f, toContext, toFileContext, toState, exactBinding};
}

describe('individual admission uses the same private evidence byte engine', () => {
  it.each(['prepared', 'sealed', 'consumed'] as const)('handles %s with real scope overload and original actor', async mode => {
    const f = await individualFixture(); f.setMode(mode);
    const response = await f.run(commitV2);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({schema_version: 2, ok: true, scope: individualScope,
      receipt: {schema_version: 2, request_id: commitInput.request_id, kind: 'evidence_committed'}, state: {decision: null}});
    expect(f.rpc.mock.calls.filter(([name]) => name === 'uc_admission_evidence_context' || name === 'uc_finalize_admission_case_evidence')
      .every(([, args]) => JSON.stringify(args.p_individual_scope) === JSON.stringify(rpcScope))).toBe(true);
    expect(f.getUser.mock.calls.every(([token]) => token === 'SYNTHETIC_A')).toBe(true);
    expect(f.upload.mock.calls.every(([, , options]) => (options as {upsert: boolean}).upsert === false)).toBe(true);
    expect(f.attest.mock.calls.every(([, args]) => !('p_individual_scope' in args))).toBe(true);
    if (mode === 'consumed') {expect(f.download).not.toHaveBeenCalled(); expect(f.upload).not.toHaveBeenCalled();}
  });
  it('returns the exact sealed PDF with the individual scoped read overload', async () => {
    const f = await individualFixture(), response = await f.file(fileV2);
    expect(response.status).toBe(200); expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(f.rpc).toHaveBeenCalledWith('uc_admission_evidence_file_context', {...{
      p_case_id: fileInput.case_id, p_evidence_version_id: fileInput.evidence_version_id}, p_individual_scope: rpcScope});
    expect(f.attest).not.toHaveBeenCalled(); expect(f.upload).not.toHaveBeenCalled();
  });
  it.each([{kind: 'group'}, {schema_version: 3}, {user_id: scope.user_id}, {course_id: scope.course_id}, {group_id: id(99)}, {path: '/private'}, {organization_id: null}])
    ('rejects malformed or client-selected authority %j before clients', async patch => {
      const f = await individualFixture(), response = await f.run({...commitV2, ...patch});
      expect(response.status).toBe(400); expect(f.createCaller).not.toHaveBeenCalled();
    });
  it('rejects V2 context under a legacy body instead of widening grouped scope', async () => {
    const f = await individualFixture(); expect((await f.run(commitInput)).status).toBe(409);
    expect(f.download).not.toHaveBeenCalled(); expect(f.createService).not.toHaveBeenCalled();
    const file = await individualFixture(); expect((await file.file(fileInput)).status).toBe(409); expect(file.serviceDownload).not.toHaveBeenCalled();
  });
  it.each(['organization_id', 'enrollment_id'] as const)('rejects an exact-context target mismatch: %s', async field => {
    const f = await individualFixture(); expect((await f.run({...commitV2, [field]: id(99)})).status).toBe(409);
    expect(f.download).not.toHaveBeenCalled(); expect(f.createService).not.toHaveBeenCalled();
  });
  it('requires the exact persisted binding and null group before source access', async () => {
    const f = await individualFixture(); f.rpc.mockResolvedValue({data: {...f.toContext(), binding: {...f.exactBinding, scope: {...individualScope, course_id: id(99)}}}, error: null});
    expect((await f.run(commitV2)).status).toBe(409); expect(f.download).not.toHaveBeenCalled();
    const grouped = await individualFixture(); grouped.rpc.mockResolvedValue({data: {...grouped.toContext(), scope: {...individualScope, group_id: scope.group_id}}, error: null});
    expect((await grouped.run(commitV2)).status).toBe(409); expect(grouped.download).not.toHaveBeenCalled();
  });
  it('suppresses individual bytes after current authority is denied', async () => {
    const f = await individualFixture(); f.rpc.mockResolvedValueOnce({data: f.toFileContext(), error: null})
      .mockResolvedValueOnce({data: null, error: {code: '42501'}});
    const response = await f.file(fileV2); expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({schema_version: 2, code: 'ACCESS_DENIED'}); expect(f.serviceDownload).toHaveBeenCalledOnce();
  });
  it('never returns a foreign current state after a lost finalize acknowledgement', async () => {
    const f = await individualFixture(); f.setMode('consumed');
    const raw = f.toContext(), replay = raw.replay_result!;
    f.rpc.mockResolvedValue({data: {...raw, replay_result: {...replay, state: {...replay.state, scope: {...individualScope, user_id: id(99)}}}}, error: null});
    expect((await f.run(commitV2)).status).toBe(409); expect(f.serviceDownload).not.toHaveBeenCalled();
  });
  it('cannot attribute a genuine source to another observed actor', async () => {
    const f = await individualFixture(); f.rpc.mockResolvedValue({data: {...f.toContext(), actor_id: id(99)}, error: null});
    expect((await f.run(commitV2)).status).toBe(409); expect(f.download).not.toHaveBeenCalled();
    expect(actor).not.toBe(id(99));
  });
});
