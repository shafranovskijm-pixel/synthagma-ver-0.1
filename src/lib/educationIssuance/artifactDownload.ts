import { supabase } from "@/integrations/supabase/client";
import { EducationIssuanceError, readEducationIssuance, requireIssuanceScope, type EducationIssuanceScope } from "./client";
import { downloadIssuanceBlob } from "./export";

/** Reads the exact attested immutable version. It never regenerates a historical original. */
export async function downloadIssuedPdf(scope:EducationIssuanceScope,recordId:string) {
  const result=await readEducationIssuance(scope,{kind:"record",record_id:recordId});
  if(result.kind!=="record"||result.record.artifact.availability!=="available"||!result.record.artifact.artifact)
    throw new EducationIssuanceError("ARTIFACT_UNAVAILABLE");
  const record=result.record,artifact=record.artifact.artifact;
  const session=await supabase.auth.getSession();requireIssuanceScope(scope);
  if(session.error||session.data.session?.user.id!==scope.actorId||!session.data.session.access_token)throw new EducationIssuanceError("ACCESS_DENIED");
  const authorization="Bearer "+session.data.session.access_token;
  const readVersion=async()=>{
    const response=await supabase.from("org_document_versions").select("id,document_id,organization_id,file_path,file_size,file_name")
      .eq("id",artifact.source.version_id).eq("document_id",artifact.source.document_id).eq("organization_id",scope.organizationId).single()
      .setHeader("Authorization",authorization);
    requireIssuanceScope(scope);
    if(response.error||!response.data?.file_path||response.data.id!==artifact.source.version_id||response.data.document_id!==artifact.source.document_id||response.data.organization_id!==scope.organizationId||response.data.file_size!==artifact.byte_size)throw new EducationIssuanceError("ARTIFACT_UNAVAILABLE");
    return response.data;
  };
  const before=await readVersion();requireIssuanceScope(scope);
  const response=await supabase.storage.from("org-documents").download(before.file_path);
  requireIssuanceScope(scope);if(response.error||!response.data)throw new EducationIssuanceError("ARTIFACT_UNAVAILABLE");
  const bytes=new Uint8Array(await response.data.arrayBuffer());requireIssuanceScope(scope);
  if(bytes.length!==artifact.byte_size||bytes.length>20971520||new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")throw new EducationIssuanceError("SOURCE_CHANGED");
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes.slice().buffer)),n=>n.toString(16).padStart(2,"0")).join("");
  requireIssuanceScope(scope);if(sha!==artifact.byte_sha256)throw new EducationIssuanceError("SOURCE_CHANGED");
  const after=await readVersion();
  if(before.file_path!==after.file_path||before.file_size!==after.file_size||before.id!==after.id)throw new EducationIssuanceError("SOURCE_CHANGED");
  downloadIssuanceBlob(scope,new Blob([bytes.slice().buffer],{type:"application/pdf"}),before.file_name??("Документ_"+record.official.document_number+".pdf"));
  return record;
}
