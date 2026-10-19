import { identificationRequestBoundary, identificationError, identificationJson, readIdentificationBody,
  parseIdentificationSubmit, requireIdentificationActor, identificationDbData, parseIdentificationContext,
  sameIdentificationContext, identificationJpeg, identificationSubmitResult, IdentificationError,
  type IdentificationDependencies, type IdentificationSubmitContext } from "./identification-access.ts";

/** A submission records pending evidence. It never performs an identity decision. */
export async function identificationSubmitRequest(request: Request, deps: IdentificationDependencies): Promise<Response> {
  try {
    const authorization = identificationRequestBoundary(request);
    if (authorization instanceof Response) return authorization;
    const input = parseIdentificationSubmit(await readIdentificationBody(request));
    if (!deps.configured || !deps.commit) throw new IdentificationError("IDENTIFICATION_UNAVAILABLE");
    const caller = deps.createCaller(authorization);
    const actor = await requireIdentificationActor(caller, authorization);
    const args = {p_identification_id: input.identificationId, p_source_id: input.sourceId,
      p_expected_revision: input.expectedRevision, p_request_id: input.requestId};
    const context = async () => parseIdentificationContext(identificationDbData(await caller.rpc("uc_identification_submit_context", args)), input, actor, input) as IdentificationSubmitContext;
    const before = await context();
    const proof = await identificationJpeg(caller, before);
    await requireIdentificationActor(caller, authorization, actor);
    const after = await context();
    sameIdentificationContext(before, after);
    if (after.mode === "committed") return identificationJson(identificationSubmitResult(after.replayResult, input, after, true));
    const result = identificationSubmitResult(identificationDbData(await deps.commit({
      p_actor_id: actor, ...args, p_storage_object_id: after.storageObjectId,
      p_object_updated_at: after.objectUpdatedAt, p_byte_sha256: proof.sha256, p_byte_size: proof.bytes.length,
    })), input, after);
    // Commit can succeed while its response is lost or rights change. A final
    // original-caller read gates the returned receipt, never the service client.
    await requireIdentificationActor(caller, authorization, actor);
    const committed = await context();
    const immutable = (value: IdentificationSubmitContext) => ({...value, revision: 0, mode: "committed", byteSha256: proof.sha256, replayResult: null});
    if (committed.mode !== "committed" || committed.byteSha256 !== proof.sha256) throw new IdentificationError("IDENTIFICATION_SOURCE_UNAVAILABLE", 409);
    sameIdentificationContext(immutable(after), immutable(committed));
    identificationSubmitResult(committed.replayResult, input, committed, true);
    return identificationJson(result);
  } catch (error) { return identificationError(error); }
}
