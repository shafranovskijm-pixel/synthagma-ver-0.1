import { observePublicPublication, type AnonymousPublicationObservation } from "../_shared/uc-publication-http.ts";
import { parsePublicPublicationUrl } from "../_shared/uc-publication-url.ts";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/;
export class PublicationWorkerError extends Error {constructor(readonly code:"ACCESS_DENIED"|"INVALID_INPUT"|"SOURCE_CHANGED"|"REVISION_CONFLICT"|"UNAVAILABLE"){super(code);}}
const fail=(code:PublicationWorkerError["code"]):never=>{throw new PublicationWorkerError(code);};
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=="object"||Array.isArray(value))return fail("UNAVAILABLE");return value as Record<string,unknown>;};
const closed=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(v,k));
const uuid=(v:unknown):string=>typeof v==="string"&&UUID.test(v)?v:fail("UNAVAILABLE");
export interface PublicationCheckInput {organizationId:string;editionId:string;expectedRevision:number;expectedEventSequence:number;requestId:string}
export function parsePublicationCheckInput(value:unknown):PublicationCheckInput{
 const v=object(value);if(!closed(v,["organizationId","editionId","expectedRevision","expectedEventSequence","requestId"])||typeof v.expectedRevision!=="number"||!Number.isSafeInteger(v.expectedRevision)||v.expectedRevision<1||typeof v.expectedEventSequence!=="number"||!Number.isSafeInteger(v.expectedEventSequence)||v.expectedEventSequence<1) return fail("INVALID_INPUT");
 try{return{organizationId:uuid(v.organizationId),editionId:uuid(v.editionId),expectedRevision:v.expectedRevision,expectedEventSequence:v.expectedEventSequence,requestId:uuid(v.requestId)};}catch{return fail("INVALID_INPUT");}
}
export interface PublicationCheckDependencies{
 originalActor(signal:AbortSignal):Promise<string|null>;
 prepare(input:Record<string,unknown>,signal:AbortSignal):Promise<unknown>;
 context(input:Record<string,unknown>,signal:AbortSignal):Promise<unknown>;
 commit(input:Record<string,unknown>,signal:AbortSignal):Promise<unknown>;
 read(input:Record<string,unknown>,signal:AbortSignal):Promise<unknown>;
 observe?:(input:{publicUrl:string;content:{sha256:string;bytes:number;mime:string}})=>Promise<AnonymousPublicationObservation>;
}
/** Original JWT owns prepare/read; service role only receives the exact stored lease/actor.
 * No caller supplies observed bytes, actor, lease or success flags. */
export async function checkPublication(input:PublicationCheckInput,deps:PublicationCheckDependencies,signal:AbortSignal):Promise<unknown>{
 const actor=uuid(await deps.originalActor(signal));if(signal.aborted)return fail("UNAVAILABLE");
 const prepared=object(await deps.prepare({p_organization_id:input.organizationId,p_edition_id:input.editionId,p_expected_revision:input.expectedRevision,p_expected_event_sequence:input.expectedEventSequence,p_request_id:input.requestId},signal));
 if(prepared.schema_version!==1||prepared.organization_id!==input.organizationId||prepared.actor_id!==actor||!["prepared","committed"].includes(String(prepared.state)))return fail("UNAVAILABLE");
 const serviceInput={p_organization_id:input.organizationId,p_job_id:uuid(prepared.job_id),p_lease_id:uuid(prepared.lease_id),p_actor_id:actor};
 const before=object(await deps.context(serviceInput,signal));
 if(before.schema_version!==1||before.organization_id!==input.organizationId||before.edition_id!==input.editionId||!["prepared","committed"].includes(String(before.state)))return fail("UNAVAILABLE");
 if(before.state==="prepared"){
  if(before.edition_revision!==input.expectedRevision||typeof before.public_url!=="string"||parsePublicPublicationUrl(before.public_url)!==before.public_url)return fail("SOURCE_CHANGED");
  const content=object(before.content);if(!closed(content,["sha256","bytes","mime"])||typeof content.sha256!=="string"||!SHA.test(content.sha256)||typeof content.bytes!=="number"||!Number.isSafeInteger(content.bytes)||content.bytes<1||content.bytes>20971520||typeof content.mime!=="string"||!["application/pdf","text/html","text/plain","image/png","image/jpeg"].includes(content.mime))return fail("UNAVAILABLE");
  const observation=await(deps.observe??observePublicPublication)({publicUrl:before.public_url,content:{sha256:content.sha256,bytes:content.bytes,mime:content.mime}});
  if(signal.aborted)return fail("UNAVAILABLE");
  // The SQL commit repeats rights, current subjects, source, sequence and lease CAS after network I/O.
  const committed=object(await deps.commit({...serviceInput,p_observation:observation},signal));
  if(committed.schema_version!==1||committed.state!=="committed"||committed.organization_id!==input.organizationId||committed.edition_id!==input.editionId)return fail("UNAVAILABLE");uuid(committed.check_id);
 }else uuid(before.check_id);
 if(signal.aborted)return fail("UNAVAILABLE");
 const result=object(await deps.read({p_organization_id:input.organizationId,p_edition_id:input.editionId,p_before_sequence:null,p_limit:100},signal));
 if(result.schema_version!==1||result.organization_id!==input.organizationId||object(result.edition).id!==input.editionId)return fail("UNAVAILABLE");
 return result;
}
