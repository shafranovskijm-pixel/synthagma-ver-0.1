import { identificationRequestBoundary, identificationError, identificationHeaders, readIdentificationBody,
  parseIdentificationMedia, requireIdentificationActor, identificationDbData, parseIdentificationContext,
  sameIdentificationContext, identificationJpeg, IdentificationError, type IdentificationDependencies } from "./identification-access.ts";

/** Exact committed source bytes only; no durable URL, legacy fetch or service read. */
export async function identificationMediaRequest(request: Request, deps: IdentificationDependencies): Promise<Response> {
  try {
    const authorization = identificationRequestBoundary(request);
    if (authorization instanceof Response) return authorization;
    const input = parseIdentificationMedia(await readIdentificationBody(request));
    if (!deps.configured) throw new IdentificationError("IDENTIFICATION_UNAVAILABLE");
    const caller = deps.createCaller(authorization);
    const actor = await requireIdentificationActor(caller, authorization);
    const context = async () => parseIdentificationContext(identificationDbData(await caller.rpc("uc_identification_media_context", {
      p_identification_id: input.identificationId, p_source_id: input.sourceId,
    })), input, actor);
    const before = await context();
    const proof = await identificationJpeg(caller, before);
    await requireIdentificationActor(caller, authorization, actor);
    sameIdentificationContext(before, await context());
    return new Response(Uint8Array.from(proof.bytes).buffer, {headers: {...identificationHeaders,
      "Content-Type": "image/jpeg", "Content-Length": String(proof.bytes.length), "Content-Disposition": "inline"}});
  } catch (error) { return identificationError(error); }
}
