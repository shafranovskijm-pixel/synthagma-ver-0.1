import { z } from "zod";
import { sameCopyValue } from "@/lib/copyRegistry/value";
import { supabase } from "@/integrations/supabase/client";
import { issuancePreparedArtifactSchema, issuanceErrorSchema } from "./contract";
import { assertIssuancePreparation, EducationIssuanceError, normalizeIssuanceError, readEducationIssuance, requireIssuanceScope, type EducationIssuanceScope } from "./client";
import type { IssuancePreparation } from "./types";

const uuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const fields={organization_id:uuid,preparation_id:uuid,item_id:uuid,input_revision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),request_id:uuid};
const requestSchema=z.object(fields).strict();
// Exact public subset of the pinned service-worker handshake; no HTML, URL, file UUID or approval input.
const resultSchema=z.object({schema_version:z.literal(1),...fields,status:z.enum(["rendered_unissued","consumed"]),final_record_id:uuid.nullable(),artifact:issuancePreparedArtifactSchema})
  .strict().refine(value=>(value.status==="consumed")===(value.final_record_id!==null));
const identity=(value:IssuancePreparation)=>[value.id,value.organization_id,value.scope,value.created_by,value.kind,value.template,value.plan,value.items.map(item=>[item.id,item.enrollment_id,item.user_id,item.course_id,item.group_id,item.input_revision,item.render_input_hash,item.number_plan])];
const stableArtifact=(artifact:NonNullable<IssuancePreparation["items"][number]["artifact"]>)=>{
  const {output_review,...value}=artifact;return value;
};
export function prepareArtifactRender(scope:EducationIssuanceScope,preparation:IssuancePreparation,itemId:string,requestId:string=crypto.randomUUID()){
  requireIssuanceScope(scope);assertIssuancePreparation(scope,preparation);
  const original=preparation.items.find(item=>item.id===itemId);if(!original)throw new EducationIssuanceError("INVALID_INPUT");
  const request=Object.freeze(requestSchema.parse({organization_id:scope.organizationId,preparation_id:preparation.id,item_id:itemId,input_revision:original.input_revision,request_id:requestId}));
  const expected=identity(preparation);
  const readCurrent=async()=>{
    const result=await readEducationIssuance(scope,{kind:"preparation",preparation_id:preparation.id});
    if(result.kind!=="preparation"||!sameCopyValue(identity(result.preparation),expected))throw new EducationIssuanceError("SOURCE_CHANGED");
    return result.preparation;
  };
  return {requestId,request,run:async():Promise<IssuancePreparation>=>{
    const current=await readCurrent(),item=current.items.find(item=>item.id===itemId)!;
    if(item.status==="stale")throw new EducationIssuanceError("SOURCE_CHANGED");
    if(item.status!=="prepared"){if(!item.artifact)throw new EducationIssuanceError("ARTIFACT_UNAVAILABLE");return current;}
    const session=await supabase.auth.getSession();requireIssuanceScope(scope);
    if(session.error||session.data.session?.user.id!==scope.actorId||!session.data.session.access_token)throw new EducationIssuanceError("ACCESS_DENIED");
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const response=await Promise.race([
        supabase.functions.invoke("education-issuance-artifact",{body:request,headers:{Authorization:"Bearer "+session.data.session.access_token}}),
        new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new EducationIssuanceError("DEPENDENCY_UNAVAILABLE",true)),60000);}),
      ]);
      requireIssuanceScope(scope);
      let errorPayload:unknown=response.data;
      if(response.error){
        try{const context=(response.error as unknown as {context?:Response}).context;if(context)errorPayload=await context.clone().json();}catch{/* Unknown transport result keeps the same request. */}
        requireIssuanceScope(scope);
        const failure=issuanceErrorSchema.safeParse(errorPayload);
        if(failure.success)throw new EducationIssuanceError(failure.data.code,failure.data.retryable);
        throw normalizeIssuanceError(response.error);
      }
      const failure=issuanceErrorSchema.safeParse(errorPayload);if(failure.success)throw new EducationIssuanceError(failure.data.code,failure.data.retryable);
      const parsed=resultSchema.safeParse(response.data);if(!parsed.success)throw new EducationIssuanceError();
      const result=parsed.data;
      if(Object.entries(request).some(([key,value])=>result[key as keyof typeof request]!==value)||result.artifact.render_input_hash!==original.render_input_hash)throw new EducationIssuanceError("SOURCE_CHANGED");
      const fresh=await readCurrent(),saved=fresh.items.find(row=>row.id===itemId)!;
      if(!saved.artifact||!sameCopyValue(stableArtifact(saved.artifact),stableArtifact(result.artifact as NonNullable<typeof saved.artifact>))||
          result.status==="consumed"&&(saved.status!=="consumed"||saved.final_record_id!==result.final_record_id))throw new EducationIssuanceError("SOURCE_CHANGED");
      return fresh;
    }finally{if(timer)clearTimeout(timer);}
  }};
}
export type PreparedArtifactRender=ReturnType<typeof prepareArtifactRender>;
