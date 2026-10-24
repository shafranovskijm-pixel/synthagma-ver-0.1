import {
 SIGNATURE_SOURCE_MAX_BYTES,signatureSourceVerificationRequestSchema,signatureFileContextSchema,
 signatureFileVerificationReceiptSchema,signatureSourceVerificationResultSchema,trustedSignatureFileProofSchema,signatureFileTupleSchema,
 type SignatureSourceVerificationRequest,type SignatureFileAction,type TrustedSignatureFileProof,
 type SignatureFileTuple,type SignatureFileContext,
 type SignatureSourceVerificationResult,
} from './contract.ts';

export type SignatureSourceFailure='ACCESS_DENIED'|'INVALID_INPUT'|'NOT_FOUND'|'REVISION_CONFLICT'|'REQUEST_CONFLICT'|'SOURCE_UNAVAILABLE'|'SOURCE_CHANGED'|'CLOSED'|'EXPIRED'|'LIMIT_EXCEEDED'|'DEPENDENCY_UNAVAILABLE';
export class SignatureSourceError extends Error{
 constructor(readonly code:SignatureSourceFailure){super(code);this.name='SignatureSourceError';}
}
const fail=(code:SignatureSourceFailure):never=>{throw new SignatureSourceError(code);};
export interface SignatureSourceServiceRequest{
 p_action:SignatureFileAction;p_observed_actor_user_id:string;p_request_ip:null;p_request_user_agent:null;
 p_original_proof:TrustedSignatureFileProof|null;p_scan_proof:null;
}
export interface SignatureSourceDependencies{
 /** Original captured Authorization JWT, verified through auth.getUser; never body actor. */
 observeOriginalActor(signal:AbortSignal):Promise<string|null>;
 /** Future owner-private service facade; performs current explicit-actor DB authorization. */
 service(input:SignatureSourceServiceRequest,signal:AbortSignal):Promise<unknown>;
 /** Uses only configured own Storage origin and the DB-selected canonical bucket/path. */
 readCanonicalObject(source:SignatureFileTuple,signal:AbortSignal):Promise<Response>;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const own=(v:unknown)=>typeof v==='object'&&v!==null&&!Array.isArray(v)?v as Record<string,unknown>:null;
const codes=new Set<SignatureSourceFailure>(['ACCESS_DENIED','INVALID_INPUT','NOT_FOUND','REVISION_CONFLICT','REQUEST_CONFLICT','SOURCE_UNAVAILABLE','SOURCE_CHANGED','CLOSED','EXPIRED','LIMIT_EXCEEDED','DEPENDENCY_UNAVAILABLE']);
function normalizeResponse(value:unknown):unknown{
 const v=own(value);
 if(v?.version===1&&v.ok===false){if(typeof v.code==='string'&&codes.has(v.code as SignatureSourceFailure)&&Object.keys(v).length===3)fail(v.code as SignatureSourceFailure);fail('DEPENDENCY_UNAVAILABLE');}
 return value;
}
function sameScope(source:SignatureFileTuple,request:SignatureSourceVerificationRequest){
 return source.organization_id===request.address.organization_id&&source.signature_id===request.address.signature_id&&source.chosen_party===request.address.chosen_party&&source.document_revision_id===request.expected_document_revision_id&&source.document_html_sha256===request.document_html_sha256&&source.purpose==='source';
}
function same(a:unknown,b:unknown):boolean{
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i]));
 const x=a as Record<string,unknown>,y=b as Record<string,unknown>,keys=Object.keys(x);return keys.length===Object.keys(y).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(y,k)&&same(x[k],y[k]));
}
function mime(value:string|null):string|null{
 if(value===null)return null;const first=value.split(';')[0].trim().toLowerCase();
 return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(first)&&first.length<=200?first:null;
}
function boundedAwait<T>(operation:Promise<T>,signal:AbortSignal):Promise<T>{
 if(signal.aborted)return Promise.reject(new SignatureSourceError('ACCESS_DENIED'));
 return new Promise<T>((resolve,reject)=>{
  const abort=()=>{signal.removeEventListener('abort',abort);reject(new SignatureSourceError('ACCESS_DENIED'));};
  signal.addEventListener('abort',abort,{once:true});
  operation.then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(new SignatureSourceError('ACCESS_DENIED'));else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
 });
}
async function boundedBytes(response:Response,signal:AbortSignal):Promise<Uint8Array<ArrayBuffer>>{
 if(!response.ok||response.redirected)fail(response.status===404?'SOURCE_UNAVAILABLE':'DEPENDENCY_UNAVAILABLE');
 const rawLength=response.headers.get('content-length');
 if(rawLength!==null&&(!/^\d{1,12}$/.test(rawLength)||Number(rawLength)>SIGNATURE_SOURCE_MAX_BYTES))fail('LIMIT_EXCEEDED');
  const encoding=response.headers.get('content-encoding')?.trim().toLowerCase()??'identity';
  if(!['identity','gzip','br','deflate'].includes(encoding))fail('DEPENDENCY_UNAVAILABLE');
 const body=response.body;if(!body)fail('SOURCE_UNAVAILABLE');
 const reader=body.getReader();let total=0;let complete=false;const parts:Uint8Array[]=[];
 try{
  for(;;){if(signal.aborted)fail('ACCESS_DENIED');const next=await boundedAwait(reader.read(),signal);if(signal.aborted)fail('ACCESS_DENIED');if(next.done)break;
   total+=next.value.byteLength;if(total>SIGNATURE_SOURCE_MAX_BYTES)fail('LIMIT_EXCEEDED');parts.push(next.value);
  }
  if(!total)fail('SOURCE_UNAVAILABLE');
   // Fetch exposes decoded bytes while a compressed Content-Length remains the
   // wire length. Exact bytes are still bound to the before/after Storage tuple.
   if(encoding==='identity'&&rawLength!==null&&total!==Number(rawLength))fail('SOURCE_CHANGED');
  const bytes=new Uint8Array(total);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.byteLength;}complete=true;return bytes;
 }finally{if(!complete)void reader.cancel().catch(()=>undefined);try{reader.releaseLock();}catch{/* an aborted pending read is being cancelled */}}
}
async function digest(bytes:Uint8Array<ArrayBuffer>):Promise<string>{
 const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
/** Technical source verification ONLY. No caller PDF/proof, signature status/event, bind or finalizer. */
export async function verifySignatureSource(input:unknown,deps:SignatureSourceDependencies,outerSignal?:AbortSignal):Promise<SignatureSourceVerificationResult>{
 const parsed=signatureSourceVerificationRequestSchema.safeParse(input);if(!parsed.success)fail('INVALID_INPUT');
 // Own immutable request snapshot; caller mutation during an await cannot retarget the operation.
 const request=signatureSourceVerificationRequestSchema.parse(JSON.parse(JSON.stringify(parsed.data)));
 const controller=new AbortController();const signal=controller.signal;
 const abort=()=>controller.abort();outerSignal?.addEventListener('abort',abort,{once:true});
 if(outerSignal?.aborted)abort();const timer=setTimeout(abort,45000);let actor:string|null=null;
 const current=async()=>{
  if(signal.aborted)fail('ACCESS_DENIED');const fresh=await boundedAwait(deps.observeOriginalActor(signal),signal);
  if(signal.aborted||!fresh||!uuid.test(fresh)||actor!==null&&fresh!==actor)fail('ACCESS_DENIED');actor=fresh;
 };
 const invoke=async(action:SignatureFileAction,proof:TrustedSignatureFileProof|null)=>{
  await current();const result=await boundedAwait(deps.service({p_action:action,p_observed_actor_user_id:actor!,p_request_ip:null,p_request_user_agent:null,p_original_proof:proof,p_scan_proof:null},signal),signal);
  await current();return normalizeResponse(result);
 };
 const action={address:request.address,expected_document_revision_id:request.expected_document_revision_id,document_html_sha256:request.document_html_sha256,purpose:'source' as const,scan_path:null};
 const attest={action:'attest_file' as const,...action,verification_request_id:request.verification_request_id};
 const finish=async(value:unknown,proof:TrustedSignatureFileProof|null)=>{
  const receipt=signatureFileVerificationReceiptSchema.safeParse(value);if(!receipt.success)fail('DEPENDENCY_UNAVAILABLE');const r=receipt.data!;
  if(r.verification_request_id!==request.verification_request_id||!sameScope(r.source,request))fail('SOURCE_CHANGED');
  if(proof===null&&r.outcome!=='replayed')fail('DEPENDENCY_UNAVAILABLE');
  if(proof&&(!same(r.source,proof.source)||!same(r.object,proof.object_after)||!same(r.file,proof.file)))fail('SOURCE_CHANGED');
  await current();return signatureSourceVerificationResultSchema.parse({version:1,ok:true,kind:'source_verified',verification_request_id:r.verification_request_id,verification_record_id:r.verification_record_id,outcome:r.outcome,verified_at:r.verified_at,organization_id:r.source.organization_id,signature_id:r.source.signature_id,chosen_party:r.source.chosen_party,document_revision_id:r.source.document_revision_id,document_html_sha256:r.source.document_html_sha256,byte_sha256:r.file.sha256,byte_size:r.file.bytes});
 };
 try{
  // Recovery returns the original private receipt under fresh current rights. NULL proof
  // cannot create a new receipt. A missing UUID returns SOURCE_UNAVAILABLE, not a fake proof.
  try{return await finish(await invoke(attest,null),null);}catch(error){if(!(error instanceof SignatureSourceError)||error.code!=='SOURCE_UNAVAILABLE')throw error;}
  const parseContext=(value:unknown):SignatureFileContext=>{
   const ctx=signatureFileContextSchema.safeParse(value);if(!ctx.success||!ctx.data)fail('DEPENDENCY_UNAVAILABLE');
   if(!sameScope(ctx.data.source,request))fail('SOURCE_CHANGED');return ctx.data;
  };
  const context=parseContext(await invoke({action:'file_context',...action},null));
  await current();const response=await boundedAwait(deps.readCanonicalObject(context.source,signal),signal);await current();
  const declaredMime=mime(response.headers.get('content-type'));
  if(!declaredMime||context.object.reported_mime!==null&&context.object.reported_mime!==declaredMime)fail('SOURCE_CHANGED');
  const bytes=await boundedBytes(response,signal);await current();const sha=await boundedAwait(digest(bytes),signal);await current();
  const after=parseContext(await invoke({action:'file_context',...action},null));
  if(!same(context,after))fail('SOURCE_CHANGED');
  const checked=trustedSignatureFileProofSchema.safeParse({assurance:'trusted_service_reread',source:context.source,object_before:context.object,file:{bucket:context.source.bucket,path:context.source.path,sha256:sha,bytes:bytes.byteLength,mime:declaredMime},object_after:after.object});
  if(!checked.success)fail('SOURCE_CHANGED');
  const proof=checked.data;return await finish(await invoke(attest,proof),proof);
 }catch(error){if(error instanceof SignatureSourceError)throw error;fail(signal.aborted?'ACCESS_DENIED':'DEPENDENCY_UNAVAILABLE');}
 finally{clearTimeout(timer);outerSignal?.removeEventListener('abort',abort);controller.abort();}
}

/** Own configured Storage origin only; no signed/public URL, redirect, caller URL or cookies. */
export function canonicalSignatureStorageReader(projectUrl:string,serviceKey:string,fetcher:typeof fetch=fetch){
 const origin=new URL(projectUrl);if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||!['','/'].includes(origin.pathname)||!serviceKey||/[\r\n]/.test(serviceKey))fail('DEPENDENCY_UNAVAILABLE');
 return async(source:SignatureFileTuple,signal:AbortSignal)=>{
  const checked=signatureFileTupleSchema.safeParse(source);if(!checked.success)fail('SOURCE_UNAVAILABLE');
  // Source has already passed the exact closed DB context schema; independent URL
  // construction encodes every segment and cannot interpret a host/path supplied by HTTP.
  const path=[checked.data.bucket,...checked.data.path.split('/')].map(encodeURIComponent).join('/');
  return fetcher(origin.origin+'/storage/v1/object/authenticated/'+path,{method:'GET',headers:{Authorization:'Bearer '+serviceKey,apikey:serviceKey},redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',signal});
 };
}
