import {supabase}from '@/integrations/supabase/client';
import {publicEdgeRequest,publicEdgeSuccess,failure}from './contract.ts';
import {SignatureEvidenceError,sameEvidenceValue,verifyLiteral}from './validation.ts';
import type {PublicEdgeRequest,PublicEdgeSuccess,PublicContext}from './types.ts';
import type {SignatureFileReadScope}from './protectedFile.ts';
const fail=(code:ConstructorParameters<typeof SignatureEvidenceError>[0]='DEPENDENCY_UNAVAILABLE'):never=>{throw new SignatureEvidenceError(code);};
/** The invitation stays in transient transport; callers cannot provide an observed actor. */
export function prepareInvitationAssurance(scope:SignatureFileReadScope,input:PublicEdgeRequest,expectedContext:PublicContext|null=null){
 const parsed=publicEdgeRequest.safeParse(structuredClone(input));if(!parsed.success)fail('INVALID_INPUT');const request=parsed.data;let inFlight:Promise<PublicEdgeSuccess>|null=null,originalReceipt:unknown=null;const actor=scope.actorId;
 const current=()=>{if(!scope.isCurrent())fail('ACCESS_DENIED');};
 const observe=async()=>{current();const session=await supabase.auth.getSession();current();if(session.error||(session.data.session?.user.id??null)!==actor)fail('ACCESS_DENIED');const jwt=session.data.session?.access_token??null;if(jwt){const user=await supabase.auth.getUser(jwt);current();if(user.error||user.data.user?.id!==actor)fail('ACCESS_DENIED');}else if(actor!==null)fail('ACCESS_DENIED');return jwt;};
 const execute=async()=>{const jwt=await observe(),key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;if(!key)fail('DEPENDENCY_UNAVAILABLE');const response=await supabase.functions.invoke('signature-assurance',{body:request,headers:{Authorization:'Bearer '+(jwt??key)},timeout:60000});current();await observe();let value:unknown=response.data;if(response.error){const context=(response.error as{context?:unknown}).context;if(context instanceof Response){try{value=await context.clone().json();}catch{value=null;}current();}const denied=failure.safeParse(value);fail(denied.success?denied.data.code:'DEPENDENCY_UNAVAILABLE');}const denied=failure.safeParse(value);if(denied.success)fail(denied.data.code);const result=publicEdgeSuccess.safeParse(value);if(!result.success)fail();const v=result.data as PublicEdgeSuccess;
  if(request.action==='context'?v.kind!=='context':v.kind!=='confirmation')fail();if(expectedContext&&(v.context.organization_id!==expectedContext.organization_id||v.context.signature_id!==expectedContext.signature_id))fail('SOURCE_CHANGED');
  for(const terms of [v.context.policy?.agreement,v.context.policy?.consent])if(terms)await verifyLiteral(terms.text,terms.sha256,65536,scope.isCurrent);
  if(request.action!=='context'&&v.kind==='confirmation'){const r=v.receipt;if(r.request_id!==request.request_id||r.action!==request.action||r.party_role!=='recipient'||r.entity_id!==v.context.signature_id||!r.event_id||r.revision_applied!==request.expected_revision+1||r.binding_id!==(request.action==='reject'?null:request.binding_id)||v.context.latest_event_revision<r.revision_applied)fail();const{outcome:_,...immutable}=r;if(originalReceipt&&!sameEvidenceValue(originalReceipt,immutable))fail();originalReceipt=structuredClone(immutable);}
  current();return v;
 };
 return Object.freeze({run(){current();if(!inFlight)inFlight=execute().catch(error=>{if(error instanceof SignatureEvidenceError)throw error;return fail();}).finally(()=>{inFlight=null;});return inFlight;}});
}
