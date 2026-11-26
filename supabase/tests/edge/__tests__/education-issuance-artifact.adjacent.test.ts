import {afterEach, describe, expect, it, vi} from 'vitest';
import {fixture, id, pdf} from '../../../functions/_shared/__tests__/education-issuance-artifact.fixture';
import {EDUCATION_ARTIFACT_MS} from '../../../functions/_shared/education-issuance-artifact';

afterEach(() => {vi.restoreAllMocks(); vi.useRealTimers();});
const revoked = {data: {user: {id: id(99)}}, error: null};

describe('adjacent-only fence coalescing preserves byte-bound authority', () => {
  it('fresh flow keeps the complete guard and matches the source-proven 52 to 33 witness', async () => {
    const f = await fixture(); const response = await f.run();
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Sintagma-Artifact-Fences')).toBe('fresh=33,reused=19');
    expect(f.callerRpc.mock.calls.filter(x => x[0] === 'uc_education_artifact_context')).toHaveLength(33);
    expect(f.getUser).toHaveBeenCalledTimes(67); // initial + TWO for every complete fresh guard
    expect(f.state.final_record_id).toBeNull(); expect(f.state.output.artifact?.output_review).toBeNull();
  });
  it.each(['stage', 'commit'] as const)('same request resumes after uncertain %s without a new render or number', async lostAt => {
    const f = await fixture(); const rpc = lostAt === 'stage' ? f.serviceRpc : f.callerRpc;
    const original = rpc.getMockImplementation()!; let lost = false;
    const target = lostAt === 'stage' ? 'uc_attest_education_issuance_staging' : 'commit_org_document_version';
    rpc.mockImplementation(async (name, args) => {const value = await original(name, args); if (name === target && !lost) {lost = true; return {data: null, error: {code: 'NETWORK'}};} return value;});
    expect((await f.run()).status).toBe(503); const winner = f.getStage();
    const response = await f.run(); expect(response.status).toBe(200);
    expect(response.headers.get('X-Sintagma-Artifact-Fences')).toBe(lostAt === 'stage' ? 'fresh=27,reused=17' : 'fresh=19,reused=13');
    expect(f.getStage()).toBe(winner); expect(f.render).toHaveBeenCalledTimes(1);
    expect(f.serviceUpload).toHaveBeenCalledTimes(1); expect(f.callerUpload).toHaveBeenCalledTimes(1);
    expect(f.callerRpc.mock.calls.filter(x => x[0] === 'commit_org_document_version')).toHaveLength(1);
    expect(f.state.final_record_id).toBeNull();
  });
  it.each(['staging', 'output'] as const)('remote %s observe(after) is NOT an adjacent reusable fence', async kind => {
    const f = await fixture(); const original = f.serviceRpc.getMockImplementation()!; let calls = 0;
    f.serviceRpc.mockImplementation(async (name, args) => {
      const value = await original(name, args);
      if (name === 'uc_observe_education_artifact_object' && args.p_kind === kind && ++calls === 2) f.getUser.mockResolvedValue(revoked);
      return value;
    });
    expect((await f.run()).status).toBe(403);
    expect(f.callerRpc.mock.calls.filter(x => x[0] === 'commit_org_document_version')).toHaveLength(0);
    if (kind === 'staging') expect(f.render).not.toHaveBeenCalled();
    expect(f.state.final_record_id).toBeNull();
  });
  it.each(['callerInfo', 'callerDownload', 'serviceInfo', 'serviceDownload', 'serviceUpload', 'callerUpload', 'render'] as const)
    ('identity revoked by %s is checked before further private work', async name => {
      const f = await fixture(); const fn = f[name]; const original = fn.getMockImplementation()!;
      fn.mockImplementationOnce(async (...args: any[]) => {const value = await (original as any)(...args); f.getUser.mockResolvedValue(revoked); return value;});
      expect((await f.run()).status).toBe(403);
      expect(f.state.output.artifact).toBeNull(); expect(f.state.final_record_id).toBeNull();
    });
  it.each(['uc_attest_education_issuance_staging', 'commit_org_document_version', 'uc_attest_education_issuance_artifact'])
    ('identity revoked after %s cannot become a successful response', async target => {
      const f = await fixture(); const fn = target === 'commit_org_document_version' ? f.callerRpc : f.serviceRpc;
      const original = fn.getMockImplementation()!;
      fn.mockImplementation(async (name, args) => {const value = await original(name, args); if (name === target) f.getUser.mockResolvedValue(revoked); return value;});
      expect((await f.run()).status).toBe(403); expect(f.state.final_record_id).toBeNull();
    });
  it('a local asynchronous Blob read forces fresh authority after hashing and before later private writes', async () => {
    const f = await fixture(); const original = f.callerDownload.getMockImplementation()!;
    f.callerDownload.mockImplementationOnce(async path => {
      const value = await original(path); const source = value.data!;
      class CheckedBlob extends Blob {async arrayBuffer() {const b = await super.arrayBuffer(); f.getUser.mockResolvedValue(revoked); return b;}}
      return {data: new CheckedBlob([await source.arrayBuffer()], {type: source.type}), error: null};
    });
    expect((await f.run()).status).toBe(403); expect(f.render).not.toHaveBeenCalled(); expect(f.serviceUpload).not.toHaveBeenCalled();
  });
  it('a local asynchronous digest invalidates authority before later storage operations', async () => {
    const f = await fixture(); const original = crypto.subtle.digest.bind(crypto.subtle); let first = true;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {const result = await original(...args); if (first) {first = false; f.getUser.mockResolvedValue(revoked);} return result;});
    expect((await f.run()).status).toBe(403); expect(f.render).not.toHaveBeenCalled();
  });
  it('55-second timeout exposes only finite diagnostics and stops a late remote observer', async () => {
    const f = await fixture(); const original = f.serviceRpc.getMockImplementation()!;
    let entered!: () => void, resolve!: (value: any) => void;
    const started = new Promise<void>(done => {entered = done;});
    f.serviceRpc.mockImplementationOnce(async (name, args) => {const value = await original(name, args); entered(); return new Promise(done => {resolve = () => done(value);});});
    vi.useFakeTimers(); const running = f.run(); await started; await vi.advanceTimersByTimeAsync(EDUCATION_ARTIFACT_MS);
    const response = await running; expect(response.status).toBe(503);
    expect(response.headers.get('X-Sintagma-Artifact-Deadline')).toBe('1');
    expect(response.headers.get('X-Sintagma-Artifact-Phase')).toBe('staging');
    expect(response.headers.get('X-Sintagma-Artifact-Step')).toBe('observe_staging');
    expect(JSON.stringify([...response.headers])).not.toContain('SYNTHETIC_ORIGINAL');
    expect(JSON.stringify([...response.headers])).not.toContain(f.state.subject_user_id);
    resolve(undefined); await Promise.resolve(); await Promise.resolve();
    expect(f.render).not.toHaveBeenCalled(); expect(f.callerUpload).not.toHaveBeenCalled();
  });
});
