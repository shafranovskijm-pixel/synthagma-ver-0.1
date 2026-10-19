import { admissionRequestBoundary, admissionError, admissionHeaders, admissionDeadline, admissionCheckSignal, readAdmissionBody,
  parseAdmissionFile, requireAdmissionActor, admissionDbData, parseAdmissionFileContext, admissionDownload, admissionSame, AdmissionError,
  type AdmissionDependencies } from "./admission-case-access.ts";

/** Original JWT authorizes each exact private proof; service transports only its sealed bytes. */
export async function admissionEvidenceFileRequest(request: Request, deps: AdmissionDependencies): Promise<Response> {
  try {
    const authorization = admissionRequestBoundary(request);
    if (authorization instanceof Response) return authorization;
    return await admissionDeadline(request, async signal => {
      const input = parseAdmissionFile(await readAdmissionBody(request, signal));
      admissionCheckSignal(signal);
      if (!deps.configured) throw new AdmissionError("DEPENDENCY_UNAVAILABLE");
      const caller = deps.createCaller(authorization, signal), actor = await requireAdmissionActor(caller, authorization);
      const context = async () => {
        admissionCheckSignal(signal);
        const result = parseAdmissionFileContext(admissionDbData(await caller.rpc("uc_admission_evidence_file_context", {
          p_case_id: input.case_id, p_evidence_version_id: input.evidence_version_id,
        })), input, actor);
        admissionCheckSignal(signal); return result;
      };
      const before = await context();
      const proof = await admissionDownload(deps.createService(signal), before.object, signal);
      await requireAdmissionActor(caller, authorization, actor);
      const after = await context();
      if (!admissionSame(before, after)) throw new AdmissionError("SOURCE_CHANGED");
      admissionCheckSignal(signal);
      const extension = after.mime_type === "application/pdf" ? "pdf" : after.mime_type === "image/png" ? "png" : "jpg";
      return new Response(Uint8Array.from(proof.bytes).buffer, {headers: {...admissionHeaders,
        "Content-Type": after.mime_type, "Content-Length": String(proof.bytes.length),
        "Content-Disposition": `attachment; filename="admission-document.${extension}"`, "Content-Security-Policy": "sandbox; default-src 'none'"}});
    });
  } catch (error) {return admissionError(error);}
}
