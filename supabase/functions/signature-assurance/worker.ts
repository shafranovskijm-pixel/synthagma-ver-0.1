import {publicEdgeRequest,publicEdgeSuccess,errorCode,uuid} from './contract.ts';
import {signatureFileContextSchema,signatureFileVerificationReceiptSchema,trustedSignatureFileProofSchema,type SignatureFileAction,type SignatureFileTuple,type TrustedSignatureFileProof} from './controlled-source/contract.ts';
import {canonicalSignatureStorageReader} from './controlled-source/worker.ts';
import type {z} from 'npm:zod@3.25.76';
export {canonicalSignatureStorageReader};
export class AssuranceError extends Error {constructor(readonly code:z.infer<typeof errorCode>){super(code);this.name='AssuranceError';}}
function fail(code:z.infer<typeof errorCode>):never{throw new AssuranceError(code);}
export interface InvitationDependencies {
 observeOriginalActor(signal:AbortSignal):Promise<string|null>;
 service(input:{p_action:unknown;p_observed_actor_user_id:string|null;p_request_ip:null;p_request_user_agent:null;p_original_proof:unknown;p_scan_proof:unknown},signal:AbortSignal):Promise<unknown>;
 verifyFile(input:{p_action:SignatureFileAction;p_observed_actor_user_id:string|null;p_request_ip:null;p_request_user_agent:null;p_original_proof:TrustedSignatureFileProof|null;p_scan_proof:null},signal:AbortSignal):Promise<unknown>;
 readCanonicalObject(source:SignatureFileTuple,signal:AbortSignal):Promise<Response>;
}
function same(a:unknown,b:unknown):boolean{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>same(x,b[i]));const x=a as Record<string,unknown>,y=b as Record<string,unknown>;return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>Object.hasOwn(y,k)&&same(x[k],y[k]));}
function checked(value:unknown){const v=value as {version?:unknown;ok?:unknown;code?:unknown}|null;if(v?.version===1&&v.ok===false){const code=errorCode.safeParse(v.code);fail(code.success?code.data:'DEPENDENCY_UNAVAILABLE');}return value;}
function waiting<T>(value:Promise<T>,signal:AbortSignal):Promise<T>{if(signal.aborted)return Promise.reject(new AssuranceError('DEPENDENCY_UNAVAILABLE'));return new Promise((resolve,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(new AssuranceError('DEPENDENCY_UNAVAILABLE'));};signal.addEventListener('abort',abort,{once:true});value.then(v=>{signal.removeEventListener('abort',abort);signal.aborted?reject(new AssuranceError('DEPENDENCY_UNAVAILABLE')):resolve(v);},e=>{signal.removeEventListener('abort',abort);reject(e);});});}
async function sha(value:Uint8Array|string){const input=typeof value==='string'?new TextEncoder().encode(value):value;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',input))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function verificationId(request:string,purpose:string){const h=await sha('uc022-invitation-proof:'+request+':'+purpose);return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);}
async function readBytes(response:Response,signal:AbortSignal){
 if(!response.ok||response.redirected||!response.body)fail(response.status===404?'SOURCE_UNAVAILABLE':'DEPENDENCY_UNAVAILABLE');
 const declared=response.headers.get('content-length'),encoding=response.headers.get('content-encoding')?.trim().toLowerCase()??'identity';if(declared!==null&&(!/^[0-9]{1,12}$/.test(declared)||Number(declared)>20971520)||!['identity','gzip','deflate','br'].includes(encoding))fail('LIMIT_EXCEEDED');
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let total=0,complete=false;try{for(;;){if(signal.aborted)fail('DEPENDENCY_UNAVAILABLE');const next=await waiting(reader.read(),signal);if(next.done)break;total+=next.value.byteLength;if(total>20971520)fail('LIMIT_EXCEEDED');parts.push(next.value);}if(!total)fail('SOURCE_UNAVAILABLE');if(encoding==='identity'&&declared!==null&&Number(declared)!==total)fail('SOURCE_CHANGED');const bytes=new Uint8Array(total);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.byteLength;}complete=true;return bytes;}finally{if(!complete)void reader.cancel().catch(()=>undefined);try{reader.releaseLock();}catch{/* pending aborted read */}}
}
/** No browser-supplied byte proof, observed identity, clock, URL or service field. */
export async function runInvitation(input:unknown,deps:InvitationDependencies,outer?:AbortSignal){
 const parsed=publicEdgeRequest.safeParse(input);if(!parsed.success)fail('INVALID_INPUT');const action=publicEdgeRequest.parse(structuredClone(parsed.data));
 const controller=new AbortController(),signal=controller.signal,abort=()=>controller.abort();outer?.addEventListener('abort',abort,{once:true});if(outer?.aborted)abort();const timer=setTimeout(abort,45000);let capturedActor:string|null|undefined;
 const current=async()=>{if(signal.aborted)fail('DEPENDENCY_UNAVAILABLE');const fresh=await waiting(deps.observeOriginalActor(signal),signal);if(fresh!==null&&!uuid.safeParse(fresh).success||capturedActor!==undefined&&fresh!==capturedActor)fail('ACCESS_DENIED');capturedActor=fresh;if(signal.aborted)fail('DEPENDENCY_UNAVAILABLE');};
 const invoke=async(request:unknown,original:unknown=null,scan:unknown=null)=>{await current();const value=checked(await waiting(deps.service({p_action:request,p_observed_actor_user_id:capturedActor!,p_request_ip:null,p_request_user_agent:null,p_original_proof:original,p_scan_proof:scan},signal),signal));await current();return value;};
 const fileCall=async(request:SignatureFileAction,proof:TrustedSignatureFileProof|null)=>{await current();const value=checked(await waiting(deps.verifyFile({p_action:request,p_observed_actor_user_id:capturedActor!,p_request_ip:null,p_request_user_agent:null,p_original_proof:proof,p_scan_proof:null},signal),signal));await current();return value;};
 try{
  const first=publicEdgeSuccess.safeParse(await invoke({action:'context',token:action.token,party_role:'recipient'}));if(!first.success||first.data.kind!=='context')fail('DEPENDENCY_UNAVAILABLE');const context=first.data.context;
  if(action.action==='context')return first.data;
  const finish=(raw:unknown)=>{const parsedResult=publicEdgeSuccess.safeParse(raw);if(!parsedResult.success||parsedResult.data.kind!=='confirmation')fail('DEPENDENCY_UNAVAILABLE');const result=parsedResult.data;if(result.context.organization_id!==context.organization_id||result.context.signature_id!==context.signature_id||result.receipt.request_id!==action.request_id||result.receipt.action!==action.action||result.receipt.entity_id!==context.signature_id||result.receipt.party_role!=='recipient'||result.receipt.revision_applied!==action.expected_revision+1||'binding_id'in action&&result.receipt.binding_id!==action.binding_id)fail('SOURCE_CHANGED');return result;};
  // Recovery goes through the exact DB request before current eligibility checks.
  // A null proof can replay an existing result but cannot create a file-backed fact.
  try{return finish(await invoke(action));}catch(error){if(!(error instanceof AssuranceError)||!['SOURCE_CHANGED','SOURCE_UNAVAILABLE'].includes(error.code))throw error;}
  if(context.latest_event_revision!==action.expected_revision)fail('REVISION_CONFLICT');if(context.current_document_revision_id!==action.expected_document_revision_id)fail('SOURCE_CHANGED');
  if(action.action==='reject')return finish(await invoke(action));
  if(context.current_document_html_sha256!==action.document_html_sha256)fail('SOURCE_CHANGED');
  const verify=async(purpose:'source'|'scan')=>{
   const base={address:{kind:'invitation' as const,token:action.token},expected_document_revision_id:action.expected_document_revision_id,document_html_sha256:action.document_html_sha256,purpose,scan_path:purpose==='scan'&&action.action==='receive_scan'?action.scan_path:null};
   const parseContext=(value:unknown)=>{const result=signatureFileContextSchema.safeParse(value);if(!result.success)fail('DEPENDENCY_UNAVAILABLE');const s=result.data.source;if(s.organization_id!==context.organization_id||s.signature_id!==context.signature_id||s.chosen_party!=='recipient'||s.document_revision_id!==action.expected_document_revision_id||s.document_html_sha256!==action.document_html_sha256||s.purpose!==purpose||purpose==='scan'&&s.path!==base.scan_path)fail('SOURCE_CHANGED');return result.data;};
   const raw=await fileCall({action:'file_context',...base},null);if(purpose==='source'&&same(raw,{version:1,ok:true,kind:'file_absent'}))return null;const before=parseContext(raw);
   await current();const response=await waiting(deps.readCanonicalObject(before.source,signal),signal);await current();const mime=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();if(!mime||!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime)||purpose==='scan'&&!['application/pdf','image/png','image/jpeg'].includes(mime))fail('SOURCE_CHANGED');const bytes=await readBytes(response,signal);await current();const hash=await waiting(sha(bytes),signal);await current();const after=parseContext(await fileCall({action:'file_context',...base},null));if(!same(before,after))fail('SOURCE_CHANGED');
   const proof=trustedSignatureFileProofSchema.safeParse({assurance:'trusted_service_reread',source:before.source,object_before:before.object,file:{bucket:before.source.bucket,path:before.source.path,sha256:hash,bytes:bytes.length,mime},object_after:after.object});if(!proof.success)fail('SOURCE_CHANGED');
   const id=await verificationId(action.request_id,purpose);await current();const stored=signatureFileVerificationReceiptSchema.safeParse(await fileCall({action:'attest_file',...base,verification_request_id:id},proof.data));if(!stored.success||stored.data.verification_request_id!==id||!same(stored.data.source,proof.data.source)||!same(stored.data.file,proof.data.file)||!same(stored.data.object,proof.data.object_after))fail('SOURCE_CHANGED');return stored.data.file;
  };
  const original=await verify('source'),scan=action.action==='receive_scan'?await verify('scan'):null;
  const result=finish(await invoke(action,original,scan));
  await current();return result;
 }catch(error){if(error instanceof AssuranceError)throw error;fail('DEPENDENCY_UNAVAILABLE');}finally{clearTimeout(timer);outer?.removeEventListener('abort',abort);controller.abort();}
}
