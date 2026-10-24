import {describe, expect, it} from 'vitest';
import {fixture} from '../../../functions/_shared/__tests__/education-issuance-artifact.fixture';

const rawTemplateTime = '2026-10-23T00:00:00.546892Z';
type Fixture = Awaited<ReturnType<typeof fixture>>;
const attestCalls = (f: Fixture) => f.serviceRpc.mock.calls.filter(call => call[0].startsWith('uc_attest_'));
const commitCalls = (f: Fixture) => f.callerRpc.mock.calls.filter(call => call[0] === 'commit_org_document_version');

async function withPlainHtmlTransport() {
  const f = await fixture();
  f.state.template.storage.updated_at = rawTemplateTime;
  const originalInfo = f.callerInfo.getMockImplementation()!;
  f.callerInfo.mockImplementation(async path => {
    const result = await originalInfo(path);
    if (path === f.state.template.storage.path && result.data) {
      result.data.lastModified = '2026-10-23T00:00:00.546Z';
    }
    return result;
  });
  const originalDownload = f.callerDownload.getMockImplementation()!;
  f.callerDownload.mockImplementation(async path => {
    const result = await originalDownload(path);
    if (path === f.state.template.storage.path && result.data) {
      return {data: new Blob([await result.data.arrayBuffer()], {type: 'text/plain'}), error: null};
    }
    return result;
  });
  return f;
}

async function expectNoTemplateMutation(f: Fixture) {
  const response = await f.run();
  expect(response.status).not.toBe(200);
  expect(f.render).not.toHaveBeenCalled();
  expect(f.serviceUpload).not.toHaveBeenCalled();
  expect(f.callerUpload).not.toHaveBeenCalled();
  expect(attestCalls(f)).toHaveLength(0);
  expect(commitCalls(f)).toHaveLength(0);
}

describe('UC019 exact original-caller HTML transport compatibility (synthetic only)', () => {
  it('accepts observed plain transport only for the verified HTML source and preserves raw time, hash and unissued PDF', async () => {
    const f = await withPlainHtmlTransport(), response = await f.run();
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.status).toBe('rendered_unissued');
    expect(result.final_record_id).toBeNull();
    expect(f.render).toHaveBeenCalledTimes(1);
    expect(f.serviceUpload).toHaveBeenCalledTimes(1);
    expect(f.callerUpload).toHaveBeenCalledTimes(1);
    expect(attestCalls(f)).toHaveLength(2);
    const stageProof = attestCalls(f).find(call => call[0].endsWith('_staging'))![1].p_proof as Record<string, unknown>;
    expect(stageProof.template_updated_at).toBe(rawTemplateTime);
    expect(stageProof.template_byte_sha256).toBe(f.templateHash);
    expect(f.state.template.storage.mime_type).toBe('text/html');
    expect(f.state.staging.proof!.template_byte_sha256).toBe(f.templateHash);
    expect(f.getOutput()!.bytes).toEqual(f.getStage()!.bytes);
    expect(f.state.output.artifact!.output_review).toBeNull();
  });

  it.each(['text/csv', 'application/octet-stream', 'text/plain;charset=utf-8'])('rejects unobserved HTML transport MIME %s without broadening a MIME allowlist', async mime => {
    const f = await withPlainHtmlTransport(), download = f.callerDownload.getMockImplementation()!;
    f.callerDownload.mockImplementation(async path => {
      const result = await download(path);
      return path === f.state.template.storage.path && result.data
        ? {data: new Blob([await result.data.arrayBuffer()], {type: mime}), error: null}
        : result;
    });
    await expectNoTemplateMutation(f);
  });

  it('rejects a plain template with a wrong byte size before rendering or attesting', async () => {
    const f = await withPlainHtmlTransport(), download = f.callerDownload.getMockImplementation()!;
    f.callerDownload.mockImplementation(async path => {
      const result = await download(path);
      return path === f.state.template.storage.path && result.data
        ? {data: new Blob([(await result.data.arrayBuffer()).slice(1)], {type: 'text/plain'}), error: null}
        : result;
    });
    await expectNoTemplateMutation(f);
  });

  it('rejects same-size plain template bytes that disagree with the known source hash', async () => {
    const f = await withPlainHtmlTransport(), download = f.callerDownload.getMockImplementation()!;
    f.callerDownload.mockImplementation(async path => {
      const result = await download(path);
      if (path !== f.state.template.storage.path || !result.data) return result;
      const tampered = new Uint8Array(await result.data.arrayBuffer());
      tampered[0] ^= 1;
      return {data: new Blob([tampered.buffer], {type: 'text/plain'}), error: null};
    });
    await expectNoTemplateMutation(f);
  });

  it('rejects a raw microsecond source change across the accepted plain download', async () => {
    const f = await withPlainHtmlTransport(), download = f.callerDownload.getMockImplementation()!;
    f.callerDownload.mockImplementation(async path => {
      const result = await download(path);
      if (path === f.state.template.storage.path) f.state.template.storage.updated_at = '2026-10-23T00:00:00.546893Z';
      return result;
    });
    await expectNoTemplateMutation(f);
  });

  it('still requires canonical HTML info MIME instead of trusting the download transport type', async () => {
    const f = await withPlainHtmlTransport(), info = f.callerInfo.getMockImplementation()!;
    f.callerInfo.mockImplementation(async path => {
      const result = await info(path);
      if (path === f.state.template.storage.path && result.data) {
        result.data.contentType = 'text/plain';
      }
      return result;
    });
    await expectNoTemplateMutation(f);
  });

  it('rejects plain transport for the staged PDF before any SQL attestation', async () => {
    const f = await withPlainHtmlTransport(), download = f.serviceDownload.getMockImplementation()!;
    f.serviceDownload.mockImplementation(async () => {
      const result = await download();
      return result.data ? {data: new Blob([await result.data.arrayBuffer()], {type: 'text/plain'}), error: null} : result;
    });
    expect((await f.run()).status).not.toBe(200);
    expect(f.render).toHaveBeenCalledTimes(1);
    expect(attestCalls(f)).toHaveLength(0);
    expect(f.callerUpload).not.toHaveBeenCalled();
    expect(commitCalls(f)).toHaveLength(0);
  });

  it('rejects plain transport for the caller PDF before UC006 commit or output attestation', async () => {
    const f = await withPlainHtmlTransport(), download = f.callerDownload.getMockImplementation()!;
    f.callerDownload.mockImplementation(async path => {
      const result = await download(path);
      return path !== f.state.template.storage.path && result.data
        ? {data: new Blob([await result.data.arrayBuffer()], {type: 'text/plain'}), error: null}
        : result;
    });
    expect((await f.run()).status).not.toBe(200);
    expect(attestCalls(f).filter(call => call[0].endsWith('_staging'))).toHaveLength(1);
    expect(attestCalls(f).filter(call => call[0].endsWith('_artifact'))).toHaveLength(0);
    expect(commitCalls(f)).toHaveLength(0);
    expect(f.state.output.artifact).toBeNull();
  });
});
