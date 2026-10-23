import { admissionRequestBoundary, admissionError, admissionJson, admissionDeadline, admissionCheckSignal, readAdmissionBody,
  parseAdmissionCommit, requireAdmissionActor, admissionDbData, parseAdmissionContext, admissionDownload, admissionSame, admissionMutation,
  admissionSealedObject, admissionSealedInfoObserved, admissionObservedSealedObject, admissionAttestation, admissionEvidenceEcho, ADMISSION_EVIDENCE_BUCKET, AdmissionError,
  ADMISSION_EVIDENCE_REVISION, admissionCodes, type AdmissionDependencies, type AdmissionEvidenceContext } from "./admission-case-access.ts";

const same = (before: unknown, after: unknown) => {if (!admissionSame(before, after)) throw new AdmissionError("SOURCE_CHANGED");};
function identity(context: AdmissionEvidenceContext) {
  const {mode: _mode, case_revision: _revision, source: _source, sealed: _sealed, replay_result: _replay, ...stable} = context;
  return stable;
}
/** Sealing is byte attestation only. The original caller alone finalizes business evidence. */
export async function admissionEvidenceCommitRequest(request: Request, deps: AdmissionDependencies): Promise<Response> {
  let diagnosticStage: "boundary" | "read_input" | "authenticate_initial" | "context_initial" | "source_download" | "authenticate_after_source" | "context_after_source" | "sealed_upload" | "sealed_info_before" | "sealed_observe_before" | "sealed_readback" | "sealed_info_after" | "sealed_observe_after" | "authenticate_before_attest" | "context_before_attest" | "attest" | "authenticate_after_attest" | "context_after_attest" | "finalize" | "authenticate_after_finalize" | "context_consumed" | "result" = "boundary";
  try {
    const authorization = admissionRequestBoundary(request);
    if (authorization instanceof Response) return authorization;
    return await admissionDeadline(request, async signal => {
      diagnosticStage = "read_input";
      const input = parseAdmissionCommit(await readAdmissionBody(request, signal));
      admissionCheckSignal(signal);
      if (!deps.configured) throw new AdmissionError("DEPENDENCY_UNAVAILABLE");
      diagnosticStage = "authenticate_initial";
      const caller = deps.createCaller(authorization, signal), actor = await requireAdmissionActor(caller, authorization);
      const args = {p_case_id: input.case_id, p_reservation_id: input.reservation_id, p_expected_revision: input.expected_revision, p_request_id: input.request_id};
      const context = async () => {
        admissionCheckSignal(signal);
        const value = parseAdmissionContext(admissionDbData(await caller.rpc("uc_admission_evidence_context", args)), input, actor);
        admissionCheckSignal(signal); return value;
      };
      diagnosticStage = "context_initial";
      const before = await context();
      const service = deps.createService(signal);
      // Consumed replay is independent of mutable legacy source and original TTL;
      // its immutable sealed proof still receives actual-byte and current-right checks.
      diagnosticStage = "source_download";
      const proof = await admissionDownload(before.mode === "consumed" ? service : caller, before.source, signal);
      diagnosticStage = "authenticate_after_source";
      await requireAdmissionActor(caller, authorization, actor);
      diagnosticStage = "context_after_source";
      const after = await context(); same(before, after);
      if (after.mode === "consumed") return admissionJson(admissionMutation(after.replay_result, input, after.scope, true));

      const path = after.sealed.path, mime = after.source.mime_type;
      let uploadedId: string | undefined;
      if (after.mode === "prepared") {
        admissionCheckSignal(signal);
        diagnosticStage = "sealed_upload";
        const upload = await service.storage.from(ADMISSION_EVIDENCE_BUCKET).upload(path, Uint8Array.from(proof.bytes).buffer,
          {contentType: mime, upsert: false, cacheControl: "0"});
        admissionCheckSignal(signal);
        if (upload.error) {
          const error = upload.error as {statusCode?: string | number; status?: string | number};
          if (String(error.statusCode ?? error.status) !== "409") throw new AdmissionError("DEPENDENCY_UNAVAILABLE");
        } else {
          if (!upload.data) throw new AdmissionError("SOURCE_UNAVAILABLE");
          uploadedId = upload.data.id;
        }
      }
      // A lost upload response may leave an orphan. Never overwrite it: prove
      // the exact object and bytes or fail, leaving it inaccessible for retry.
      diagnosticStage = "sealed_info_before";
      const sdkBefore = await admissionSealedInfoObserved(service, path, proof.bytes.length, mime, signal);
      diagnosticStage = "sealed_observe_before";
      const observe = async (sdk: typeof sdkBefore) => {
        admissionCheckSignal(signal);
        const object = admissionObservedSealedObject(admissionDbData(await service.rpc("uc_observe_admission_sealed_object", {p_actor_id: actor, ...args})), after, sdk);
        admissionCheckSignal(signal); return object;
      };
      const sealedBefore = await observe(sdkBefore);
      if (uploadedId !== undefined && uploadedId !== sealedBefore.object_id) throw new AdmissionError("SOURCE_CHANGED");
      if (after.mode === "sealed") same({object_id: sealedBefore.object_id, updated_at: sealedBefore.updated_at}, {object_id: after.sealed.object_id, updated_at: after.sealed.updated_at});
      diagnosticStage = "sealed_readback";
      const sealedBytes = await admissionDownload(service, {bucket: ADMISSION_EVIDENCE_BUCKET, path, byte_size: proof.bytes.length,
        mime_type: mime, known_sha256: proof.sha256}, signal);
      diagnosticStage = "sealed_info_after";
      const sdkAfter = await admissionSealedInfoObserved(service, path, proof.bytes.length, mime, signal); same(sdkBefore, sdkAfter);
      diagnosticStage = "sealed_observe_after";
      const sealedAfter = await observe(sdkAfter); same(sealedBefore, sealedAfter);
      if (sealedBytes.sha256 !== proof.sha256) throw new AdmissionError("SOURCE_CHANGED");
      diagnosticStage = "authenticate_before_attest";
      await requireAdmissionActor(caller, authorization, actor);
      diagnosticStage = "context_before_attest";
      same(after, await context());
      if (after.mode === "prepared") {
        admissionCheckSignal(signal);
        diagnosticStage = "attest";
        admissionAttestation(admissionDbData(await service.rpc("uc_attest_admission_case_evidence", {
          p_actor_id: actor, ...args, p_source_object_id: after.source.object_id, p_source_updated_at: after.source.updated_at,
          p_source_fingerprint: after.source.fingerprint, p_sealed_object_id: sealedAfter.object_id, p_sealed_updated_at: sealedAfter.updated_at,
          p_byte_sha256: proof.sha256, p_byte_size: proof.bytes.length, p_mime_type: mime,
        })), after, proof);
      }
      diagnosticStage = "authenticate_after_attest";
      await requireAdmissionActor(caller, authorization, actor);
      diagnosticStage = "context_after_attest";
      const sealed = await context();
      if (sealed.mode !== "sealed") throw new AdmissionError("SOURCE_CHANGED");
      same(identity(after), identity(sealed)); same(after.source, sealed.source);
      const object = admissionSealedObject(sealed);
      same({object_id: object.object_id, updated_at: object.updated_at}, {object_id: sealedAfter.object_id, updated_at: sealedAfter.updated_at});
      if (object.known_sha256 !== proof.sha256 || object.byte_size !== proof.bytes.length || object.mime_type !== mime) throw new AdmissionError("SOURCE_CHANGED");
      admissionCheckSignal(signal);
      diagnosticStage = "finalize";
      const finalized = admissionMutation(admissionDbData(await caller.rpc("uc_finalize_admission_case_evidence", args)), input, after.scope);
      admissionEvidenceEcho(finalized, sealed, input.expected_revision);
      diagnosticStage = "authenticate_after_finalize";
      await requireAdmissionActor(caller, authorization, actor);
      diagnosticStage = "context_consumed";
      const consumed = await context();
      if (consumed.mode !== "consumed") throw new AdmissionError("SOURCE_CHANGED");
      same(identity(sealed), identity(consumed)); same(sealed.sealed, consumed.sealed);
      const current = admissionMutation(consumed.replay_result, input, after.scope, true);
      same(finalized.receipt, current.receipt);
      admissionCheckSignal(signal);
      diagnosticStage = "result";
      return admissionJson({...current, replayed: finalized.replayed});
    });
  } catch (error) {
    // Fixed stage/code only: never log errors, request data, JWTs, identities, paths, metadata or proof values.
    try {
      const code = error instanceof AdmissionError && admissionCodes.includes(error.code) ? error.code : "DEPENDENCY_UNAVAILABLE";
      console.warn(JSON.stringify({event: "admission_evidence_commit_failure", revision: ADMISSION_EVIDENCE_REVISION, stage: diagnosticStage, code}));
    } catch { /* Diagnostics must not alter the existing safe HTTP result. */ }
    return admissionError(error);
  }
}
