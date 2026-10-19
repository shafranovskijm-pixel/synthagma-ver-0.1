import { admissionRequestBoundary, admissionError, admissionJson, admissionDeadline, admissionCheckSignal, readAdmissionBody,
  parseAdmissionCommit, requireAdmissionActor, admissionDbData, parseAdmissionContext, admissionDownload, admissionSame, admissionMutation,
  admissionSealedObject, admissionSealedInfo, admissionAttestation, admissionEvidenceEcho, ADMISSION_EVIDENCE_BUCKET, AdmissionError,
  type AdmissionDependencies, type AdmissionEvidenceContext } from "./admission-case-access.ts";

const same = (before: unknown, after: unknown) => {if (!admissionSame(before, after)) throw new AdmissionError("SOURCE_CHANGED");};
function identity(context: AdmissionEvidenceContext) {
  const {mode: _mode, case_revision: _revision, source: _source, sealed: _sealed, replay_result: _replay, ...stable} = context;
  return stable;
}
/** Sealing is byte attestation only. The original caller alone finalizes business evidence. */
export async function admissionEvidenceCommitRequest(request: Request, deps: AdmissionDependencies): Promise<Response> {
  try {
    const authorization = admissionRequestBoundary(request);
    if (authorization instanceof Response) return authorization;
    return await admissionDeadline(request, async signal => {
      const input = parseAdmissionCommit(await readAdmissionBody(request, signal));
      admissionCheckSignal(signal);
      if (!deps.configured) throw new AdmissionError("DEPENDENCY_UNAVAILABLE");
      const caller = deps.createCaller(authorization, signal), actor = await requireAdmissionActor(caller, authorization);
      const args = {p_case_id: input.case_id, p_reservation_id: input.reservation_id, p_expected_revision: input.expected_revision, p_request_id: input.request_id};
      const context = async () => {
        admissionCheckSignal(signal);
        const value = parseAdmissionContext(admissionDbData(await caller.rpc("uc_admission_evidence_context", args)), input, actor);
        admissionCheckSignal(signal); return value;
      };
      const before = await context();
      const service = deps.createService(signal);
      // Consumed replay is independent of mutable legacy source and original TTL;
      // its immutable sealed proof still receives actual-byte and current-right checks.
      const proof = await admissionDownload(before.mode === "consumed" ? service : caller, before.source, signal);
      await requireAdmissionActor(caller, authorization, actor);
      const after = await context(); same(before, after);
      if (after.mode === "consumed") return admissionJson(admissionMutation(after.replay_result, input, after.scope, true));

      const path = after.sealed.path, mime = after.source.mime_type;
      let uploadedId: string | undefined;
      if (after.mode === "prepared") {
        admissionCheckSignal(signal);
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
      const sealedBefore = await admissionSealedInfo(service, path, proof.bytes.length, mime, signal);
      if (uploadedId !== undefined && uploadedId !== sealedBefore.object_id) throw new AdmissionError("SOURCE_CHANGED");
      if (after.mode === "sealed") same(sealedBefore, {object_id: after.sealed.object_id, updated_at: after.sealed.updated_at});
      const sealedBytes = await admissionDownload(service, {bucket: ADMISSION_EVIDENCE_BUCKET, path, byte_size: proof.bytes.length,
        mime_type: mime, known_sha256: proof.sha256}, signal);
      const sealedAfter = await admissionSealedInfo(service, path, proof.bytes.length, mime, signal); same(sealedBefore, sealedAfter);
      if (sealedBytes.sha256 !== proof.sha256) throw new AdmissionError("SOURCE_CHANGED");
      await requireAdmissionActor(caller, authorization, actor);
      same(after, await context());
      if (after.mode === "prepared") {
        admissionCheckSignal(signal);
        admissionAttestation(admissionDbData(await service.rpc("uc_attest_admission_case_evidence", {
          p_actor_id: actor, ...args, p_source_object_id: after.source.object_id, p_source_updated_at: after.source.updated_at,
          p_source_fingerprint: after.source.fingerprint, p_sealed_object_id: sealedAfter.object_id, p_sealed_updated_at: sealedAfter.updated_at,
          p_byte_sha256: proof.sha256, p_byte_size: proof.bytes.length, p_mime_type: mime,
        })), after, proof);
      }
      await requireAdmissionActor(caller, authorization, actor);
      const sealed = await context();
      if (sealed.mode !== "sealed") throw new AdmissionError("SOURCE_CHANGED");
      same(identity(after), identity(sealed)); same(after.source, sealed.source);
      const object = admissionSealedObject(sealed);
      same({object_id: object.object_id, updated_at: object.updated_at}, sealedAfter);
      if (object.known_sha256 !== proof.sha256 || object.byte_size !== proof.bytes.length || object.mime_type !== mime) throw new AdmissionError("SOURCE_CHANGED");
      admissionCheckSignal(signal);
      const finalized = admissionMutation(admissionDbData(await caller.rpc("uc_finalize_admission_case_evidence", args)), input, after.scope);
      admissionEvidenceEcho(finalized, sealed, input.expected_revision);
      await requireAdmissionActor(caller, authorization, actor);
      const consumed = await context();
      if (consumed.mode !== "consumed") throw new AdmissionError("SOURCE_CHANGED");
      same(identity(sealed), identity(consumed)); same(sealed.sealed, consumed.sealed);
      const current = admissionMutation(consumed.replay_result, input, after.scope, true);
      same(finalized.receipt, current.receipt);
      admissionCheckSignal(signal);
      return admissionJson({...current, replayed: finalized.replayed});
    });
  } catch (error) {return admissionError(error);}
}
