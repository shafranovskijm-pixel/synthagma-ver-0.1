import {afterEach, describe, expect, it, vi} from "vitest";
import {admissionEvidenceCommitRequest} from "../../functions/_shared/admission-case-evidence-commit";
import {admissionSealedInfo, type AdmissionDbResult} from "../../functions/_shared/admission-case-access";
import {actor, caseId, commitInput, evidence, fixture, post, requestId, reservation, sealedId} from "../../functions/_shared/__tests__/admission-case-evidence.fixture";

const pgTime = "2026-10-23T12:08:57.631199Z";
async function observedFixture(sdkTime = "2026-10-23T12:08:57.631Z") {
  const f = await fixture(), oldRpc = f.rpc.getMockImplementation()!;
  f.info.mockImplementation(async () => ({data: {id: sealedId, bucketId: "admission-case-evidence", name: f.sealedPath,
    updatedAt: sdkTime, size: f.bytes.length, contentType: f.mime, metadata: {size: f.bytes.length, mimetype: f.mime}}, error: null}));
  f.rpc.mockImplementation(async (name, args) => {
    const result = await oldRpc(name, args), data = result.data as Record<string, any>;
    if (name === "uc_admission_evidence_context" && data.mode !== "prepared") {
      data.sealed.updated_at = pgTime;
      if (data.mode === "consumed") data.source.updated_at = pgTime;
    }
    return result;
  });
  const observation = () => ({schema_version: 1, actor_id: actor, case_id: caseId, reservation_id: reservation,
    evidence_version_id: evidence, expected_revision: commitInput.expected_revision, request_id: requestId,
    source_fingerprint: f.source.fingerprint, object: {bucket: "admission-case-evidence", path: f.sealedPath, object_id: sealedId,
      updated_at: pgTime, byte_size: f.bytes.length, mime_type: f.mime, known_sha256: null, fingerprint: "9".repeat(64)}});
  f.observe.mockImplementation(async () => ({data: observation(), error: null}));
  return {...f, observation};
}
afterEach(() => {vi.restoreAllMocks();});
describe("AD04 exact database timestamp with observed SDK precision", () => {
  it("commits SDK milliseconds using unchanged exact PostgreSQL microseconds at attestation", async () => {
    const f = await observedFixture();
    const response = await admissionEvidenceCommitRequest(post(), f.deps);
    expect(response.status).toBe(200); expect((await response.json()).receipt.request_id).toBe(requestId);
    expect(f.observe).toHaveBeenCalledTimes(2);
    expect(f.observe).toHaveBeenNthCalledWith(1, {p_actor_id: actor, p_case_id: caseId, p_reservation_id: reservation, p_expected_revision: 4, p_request_id: requestId});
    expect(f.attest).toHaveBeenCalledExactlyOnceWith("uc_attest_admission_case_evidence", expect.objectContaining({p_sealed_object_id: sealedId,
      p_sealed_updated_at: pgTime, p_source_updated_at: f.source.updated_at, p_byte_sha256: f.hash}));
    expect(f.serviceDownload).toHaveBeenCalledTimes(1); expect(f.getUser).toHaveBeenCalledTimes(5);
  });
  it("preserves exact SDK microseconds and the compatibility info return shape", async () => {
    const f = await observedFixture(pgTime);
    expect(await admissionSealedInfo(f.service, f.sealedPath, f.bytes.length, f.mime, new AbortController().signal)).toEqual({object_id: sealedId, updated_at: pgTime});
    const response = await f.run(); expect(response.status).toBe(200);
    expect(f.attest.mock.calls[0][1].p_sealed_updated_at).toBe(pgTime);
  });
  it("rejects a database microsecond mutation hidden inside unchanged SDK milliseconds", async () => {
    const f = await observedFixture(); let call = 0;
    f.observe.mockImplementation(async () => {const data = f.observation(); if (++call === 2) data.object.updated_at = "2026-10-23T12:08:57.631200Z"; return {data, error: null};});
    const response = await f.run(); expect(response.status).toBe(409); expect((await response.json()).code).toBe("SOURCE_CHANGED"); expect(f.attest).not.toHaveBeenCalled();
  });
  it("rejects metadata fingerprint mutation despite stable identity time and SDK output", async () => {
    const f = await observedFixture(); let call = 0;
    f.observe.mockImplementation(async () => {const data = f.observation(); if (++call === 2) data.object.fingerprint = "8".repeat(64); return {data, error: null};});
    const response = await f.run(); expect((await response.json()).code).toBe("SOURCE_CHANGED"); expect(f.attest).not.toHaveBeenCalled();
  });
  it("rejects SDK time outside its declared precision prefix", async () => {
    const f = await observedFixture("2026-10-23T12:08:57.632Z");
    const response = await f.run(); expect((await response.json()).code).toBe("SOURCE_UNAVAILABLE"); expect(f.observe).toHaveBeenCalledTimes(1); expect(f.attest).not.toHaveBeenCalled();
  });
  it("retains conflicting three and six digit alias denial", async () => {
    const f = await observedFixture(); const original = f.info.getMockImplementation()!;
    f.info.mockImplementation(async path => {const result = await original(path); return {...result, data: {...result.data, lastModified: pgTime}};});
    const response = await f.run(); expect((await response.json()).code).toBe("SOURCE_UNAVAILABLE"); expect(f.observe).not.toHaveBeenCalled(); expect(f.attest).not.toHaveBeenCalled();
  });
  it("rejects observation scope substitution before attestation", async () => {
    const f = await observedFixture();
    f.observe.mockImplementation(async () => ({data: {...f.observation(), request_id: caseId}, error: null}));
    const response = await f.run(); expect((await response.json()).code).toBe("SOURCE_UNAVAILABLE"); expect(f.attest).not.toHaveBeenCalled();
  });
  it("preserves current actor server denial and prevents finalize", async () => {
    const f = await observedFixture();
    f.observe.mockImplementation(async (): Promise<AdmissionDbResult> => ({data: null, error: {message: "UC_ADMISSION:ACCESS_DENIED", code: "42501"}}));
    const response = await f.run(); expect(response.status).toBe(403); expect((await response.json()).code).toBe("ACCESS_DENIED");
    expect(f.attest).not.toHaveBeenCalled(); expect(f.rpc.mock.calls.some(([name]) => name === "uc_finalize_admission_case_evidence")).toBe(false);
  });
});
