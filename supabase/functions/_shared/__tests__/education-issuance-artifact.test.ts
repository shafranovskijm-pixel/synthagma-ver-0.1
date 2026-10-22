import {afterEach, describe, expect, it, vi} from 'vitest';
import {admissionHash} from '../admission-case-access';
import {educationArtifactContextSchema, educationArtifactWorkerResultSchema} from '../education-issuance-artifact-contract';
import {EDUCATION_ARTIFACT_MS} from '../education-issuance-artifact';
import {fixture, actor, subject, id, input, pdf} from './education-issuance-artifact.fixture';

afterEach(() => {vi.useRealTimers();});

describe('UC019 actual-byte artifact boundary (synthetic storage, no legal or renderer approval)', () => {
  it('attests the reread service winner before caller UC006, saves the same bytes, returns unissued and never allocates/finalizes', async () => {
    const f = await fixture(), response = await f.run(), result = educationArtifactWorkerResultSchema.parse(await response.json());
    expect(response.status).toBe(200);
    expect(result.status).toBe('rendered_unissued'); expect(result.final_record_id).toBeNull();
    expect(result.artifact.output_review).toBeNull();
    expect(f.state.staging.path.startsWith(`${subject}/`)).toBe(true); expect(subject).not.toBe(actor);
    const expectedHash = await admissionHash(pdf());
    expect(result.artifact.byte_sha256).toBe(expectedHash);
    expect(f.getOutput()?.bytes).toEqual(f.getStage()?.bytes);
    expect(f.events.indexOf('uc_attest_education_issuance_staging')).toBeLessThan(f.events.indexOf('caller.upload'));
    expect(f.events.indexOf('commit_org_document_version')).toBeLessThan(f.events.indexOf('uc_attest_education_issuance_artifact'));
    expect(new Set(f.callerRpc.mock.calls.map(call => call[0]))).toEqual(new Set(['uc_education_artifact_context', 'commit_org_document_version']));
    expect(f.serviceUpload.mock.calls[0][2]).toMatchObject({upsert: false, metadata: {byte_sha256: expectedHash, renderer: 'browserless', renderer_revision: 'uc019-v1'}});
  });

  it('retry reads immutable winner bytes without rerender/upload/second UC006 commit, including consumed replay', async () => {
    const f = await fixture(); expect((await f.run()).status).toBe(200);
    f.state.mode = 'consumed'; f.state.final_record_id = id(50);
    const result = await (await f.run()).json();
    expect(result.status).toBe('consumed'); expect(result.final_record_id).toBe(id(50));
    expect(f.render).toHaveBeenCalledTimes(1); expect(f.serviceUpload).toHaveBeenCalledTimes(1);
    expect(f.callerUpload).toHaveBeenCalledTimes(1);
    expect(f.callerRpc.mock.calls.filter(call => call[0] === 'commit_org_document_version')).toHaveLength(1);
    expect(f.serviceDownload).toHaveBeenCalledTimes(2);
  });

  it('a concurrent nondeterministic stage winner is canonical: 409 recovers its exact bytes instead of comparing a fresh render', async () => {
    const f = await fixture(), winningBytes = pdf('CONCURRENT_WINNER'), winningHash = await admissionHash(winningBytes);
    f.serviceUpload.mockImplementationOnce(async (_path, _bytes, options) => {
      f.setStage({bytes: winningBytes, id: id(31), metadata: {...options.metadata!, byte_sha256: winningHash}});
      return {data: null, error: {statusCode: '409'}};
    });
    const response = await f.run(); expect(response.status).toBe(200);
    expect((await response.json()).artifact.byte_sha256).toBe(winningHash);
    expect(f.getOutput()?.bytes).toEqual(winningBytes); expect(f.render).toHaveBeenCalledTimes(1);
  });

  it('uncertain stage attestation never reaches caller output until same-request replay confirms the stored proof', async () => {
    const f = await fixture(), original = f.serviceRpc.getMockImplementation()!;
    f.serviceRpc.mockImplementationOnce(async (name, args) => {await original(name, args); return {data: null, error: {code: 'NETWORK'}};});
    expect((await f.run()).status).toBe(503); expect(f.callerUpload).not.toHaveBeenCalled();
    expect((await f.run()).status).toBe(200); expect(f.render).toHaveBeenCalledTimes(1);
    expect(f.serviceRpc.mock.calls.filter(call => call[0] === 'uc_attest_education_issuance_staging')).toHaveLength(1);
  });

  it('uncertain UC006 response recovers the committed exact source with no second business request or allocation', async () => {
    const f = await fixture(), original = f.callerRpc.getMockImplementation()!; let lost = false;
    f.callerRpc.mockImplementation(async (name, args) => {
      const result = await original(name, args);
      if (name === 'commit_org_document_version' && !lost) {lost = true; return {data: null, error: {code: 'NETWORK'}};}
      return result;
    });
    expect((await f.run()).status).toBe(503);
    expect((await f.run()).status).toBe(200);
    expect(f.callerRpc.mock.calls.filter(call => call[0] === 'commit_org_document_version')).toHaveLength(1);
    expect(f.callerUpload).toHaveBeenCalledTimes(1); expect(f.render).toHaveBeenCalledTimes(1);
  });

  it('generic UC006 PT409 remains a finite conflict, preserves the unissued file and cannot reach output attestation', async () => {
    const f = await fixture(), original = f.callerRpc.getMockImplementation()!;
    f.callerRpc.mockImplementation(async (name, args) => name === 'commit_org_document_version'
      ? {data: null, error: {code: 'PT409', message: 'Document changed; reload before saving'}} : original(name, args));
    const response = await f.run(), result = await response.json();
    expect(response.status).toBe(409); expect(result.code).toBe('REVISION_CONFLICT'); expect(result.retryable).toBe(false);
    expect(f.getOutput()?.bytes).toEqual(f.getStage()?.bytes);
    expect(f.serviceRpc.mock.calls.filter(call => call[0] === 'uc_attest_education_issuance_artifact')).toHaveLength(0);
    expect(f.state.mode).toBe('staged'); expect(f.state.final_record_id).toBeNull();
  });

  it.each(['actor', 'organization', 'request', 'subject_path', 'mode'] as const)('refuses an unconfirmed %s tuple before privileged storage', async kind => {
    const f = await fixture();
    f.contextHook.mockImplementation(context => {
      if (kind === 'actor') context.user_id = id(99);
      if (kind === 'organization') context.organization_id = id(99);
      if (kind === 'request') context.request_id = id(99);
      if (kind === 'subject_path') context.staging.path = context.staging.path.replace(subject, actor);
      if (kind === 'mode') context.mode = 'consumed';
    });
    expect((await f.run()).status).not.toBe(200);
    expect(f.deps.createService).not.toHaveBeenCalled(); expect(f.render).not.toHaveBeenCalled();
  });

  it('rejects caller HTML/bytes/extra fields before caller/service creation', async () => {
    const f = await fixture(); expect((await f.run({...input, html: '<script>arbitrary</script>'})).status).toBe(400);
    expect(f.deps.createCaller).not.toHaveBeenCalled(); expect(f.deps.createService).not.toHaveBeenCalled();
  });

  it('live identity revocation after rendering prevents stage upload or any attestation', async () => {
    const f = await fixture();
    f.render.mockImplementationOnce(async () => {f.getUser.mockResolvedValue({data: {user: {id: id(99)}}, error: null}); return pdf();});
    expect((await f.run()).status).toBe(403);
    expect(f.serviceUpload).not.toHaveBeenCalled(); expect(f.serviceRpc).not.toHaveBeenCalled(); expect(f.callerUpload).not.toHaveBeenCalled();
  });

  it('immutable programme/scalar change after rendering fails before stage upload', async () => {
    const f = await fixture(); f.render.mockImplementationOnce(async () => {f.state.variables.program_title = 'Changed'; return pdf();});
    expect((await f.run()).status).toBe(409); expect(f.serviceUpload).not.toHaveBeenCalled(); expect(f.callerUpload).not.toHaveBeenCalled();
  });

  it('stage metadata mismatch is not repaired, rerendered or deleted', async () => {
    const f = await fixture(); expect((await f.run()).status).toBe(200);
    const stage = f.getStage()!; stage.metadata.render_input_hash = 'f'.repeat(64);
    expect((await f.run()).status).toBe(409); expect(f.render).toHaveBeenCalledTimes(1); expect(f.serviceUpload).toHaveBeenCalledTimes(1);
  });

  it('actual reread byte corruption cannot be attested from metadata alone', async () => {
    const f = await fixture();
    f.serviceDownload.mockImplementationOnce(async () => ({data: new Blob([Uint8Array.from(pdf('CORRUPT')).buffer], {type: 'application/pdf'}), error: null}));
    expect((await f.run()).status).not.toBe(200); expect(f.serviceRpc).not.toHaveBeenCalled(); expect(f.callerUpload).not.toHaveBeenCalled();
  });

  it('55-second deadline stops a late renderer from uploading, attesting or saving', async () => {
    const f = await fixture(); let entered!: () => void, resolve!: (bytes: Uint8Array) => void;
    const started = new Promise<void>(done => {entered = done;});
    f.render.mockImplementationOnce(() => {entered(); return new Promise(done => {resolve = done;});});
    vi.useFakeTimers(); const running = f.run(); await started;
    await vi.advanceTimersByTimeAsync(EDUCATION_ARTIFACT_MS);
    expect((await running).status).toBe(503);
    resolve(pdf()); await Promise.resolve(); await Promise.resolve();
    expect(f.serviceUpload).not.toHaveBeenCalled(); expect(f.serviceRpc).not.toHaveBeenCalled(); expect(f.callerUpload).not.toHaveBeenCalled();
  });

  it('strict shared schema refuses incoherent proof/mode/final tuples and preserves metadata hash vs byte hash distinction', async () => {
    const f = await fixture(); expect((await f.run()).status).toBe(200);
    expect(f.state.output.source!.content_hash).not.toBe(f.state.output.artifact!.byte_sha256);
    const mutations = [
      (v: typeof f.state) => {v.final_record_id = id(70);},
      (v: typeof f.state) => {v.staging.proof = null;},
      (v: typeof f.state) => {v.output.artifact!.byte_sha256 = 'e'.repeat(64);},
      (v: typeof f.state) => {v.output.object = null;},
      (v: typeof f.state) => {v.output.source!.document_id = id(71);},
    ];
    for (const mutate of mutations) {const copy = structuredClone(f.state); mutate(copy); expect(educationArtifactContextSchema.safeParse(copy).success).toBe(false);}
  });
});
