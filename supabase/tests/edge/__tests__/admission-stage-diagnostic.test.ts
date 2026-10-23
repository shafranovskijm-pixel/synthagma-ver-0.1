// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { ADMISSION_EVIDENCE_REVISION } from '../../../functions/_shared/admission-case-access';
import { fixture, actor } from '../../../functions/_shared/__tests__/admission-case-evidence.fixture';

it('AD03 identifies late context CAS versus attestation without logging sensitive values or changing checks', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const expected = (stage: string, code: string) => ({ event: 'admission_evidence_commit_failure', revision: ADMISSION_EVIDENCE_REVISION, stage, code });
  const assertOnlySafeLog = (stage: string, code: string, forbidden: string[]) => {
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toHaveLength(1);
    const line = warn.mock.calls[0][0] as string;
    expect(JSON.parse(line)).toEqual(expected(stage, code));
    for (const value of forbidden) expect(line).not.toContain(value);
  };
  try {
    expect(ADMISSION_EVIDENCE_REVISION).toBe('uc-admission-case-evidence-20261023-v3');
    const late = await fixture(), original = late.rpc.getMockImplementation()!;
    let contexts = 0;
    late.rpc.mockImplementation(async (name, args) => {
      const result = await original(name, args);
      if (name === 'uc_admission_evidence_context' && ++contexts === 3) {
        return { ...result, data: { ...result.data, source: { ...result.data.source, fingerprint: 'a'.repeat(64) } } };
      }
      return result;
    });
    const denied = await late.run();
    expect(denied.status).toBe(409); expect((await denied.json()).code).toBe('SOURCE_CHANGED');
    expect(late.serviceDownload).toHaveBeenCalledOnce(); expect(late.attest).not.toHaveBeenCalled();
    expect(late.rpc.mock.calls.some(([name]) => name.includes('finalize'))).toBe(false);
    assertOnlySafeLog('context_before_attest', 'SOURCE_CHANGED', ['SYNTHETIC_A', actor, late.source.path, late.hash]);

    warn.mockClear();
    const attest = await fixture();
    const privateMessage = 'private SQL token=secret-person@example.invalid /sealed/private.pdf';
    attest.attest.mockResolvedValue({data: null, error: {code: 'P0001', message: 'ADMISSION_SOURCE_CHANGED', details: privateMessage}} as any);
    const rejected = await attest.run();
    expect(rejected.status).toBe(409); expect((await rejected.json()).code).toBe('SOURCE_CHANGED');
    expect(attest.attest).toHaveBeenCalledOnce(); expect(attest.rpc.mock.calls.some(([name]) => name.includes('finalize'))).toBe(false);
    assertOnlySafeLog('attest', 'SOURCE_CHANGED', [privateMessage, 'SYNTHETIC_A', actor, attest.source.path, attest.hash]);

    warn.mockClear();
    const success = await fixture();
    const response = await success.run();
    expect(response.status).toBe(200); expect(response.headers.get('X-Sintagma-Function-Revision')).toBe(ADMISSION_EVIDENCE_REVISION);
    expect(success.attest).toHaveBeenCalledOnce(); expect(success.rpc.mock.calls.some(([name]) => name.includes('finalize'))).toBe(true);
    expect(warn).not.toHaveBeenCalled();

    const loggerFailure = await fixture();
    loggerFailure.getUser.mockRejectedValueOnce(new Error(privateMessage));
    warn.mockImplementation(() => {throw new Error('synthetic logger failure');});
    const unavailable = await loggerFailure.run();
    expect(unavailable.status).toBe(503); expect((await unavailable.json()).code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(loggerFailure.upload).not.toHaveBeenCalled();
    assertOnlySafeLog('authenticate_initial', 'DEPENDENCY_UNAVAILABLE', [privateMessage, 'synthetic logger failure', 'SYNTHETIC_A', actor]);
  } finally {warn.mockRestore();}
});
