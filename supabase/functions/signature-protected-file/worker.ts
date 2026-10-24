import {protectedFileRequestSchema,protectedFileContextSchema,protectedFileAbsentSchema,SIGNATURE_SOURCE_MAX_BYTES,type ProtectedFileRequest,type ProtectedFileContext,type ProtectedFileAbsent}from './contract.ts';
import {canonicalSignatureStorageReader}from './controlled-source/worker.ts';
export {canonicalSignatureStorageReader};
export type ProtectedFileFailure='ACCESS_DENIED'|'INVALID_INPUT'|'NOT_FOUND'|'REVISION_CONFLICT'|'REQUEST_CONFLICT'|'SOURCE_UNAVAILABLE'|'SOURCE_CHANGED'|'CLOSED'|'EXPIRED'|'LIMIT_EXCEEDED'|'DEPENDENCY_UNAVAILABLE';
export class ProtectedFileError extends Error{constructor(readonly code:ProtectedFileFailure){super(code);this.name='ProtectedFileError';}}
function fail(code:ProtectedFileFailure):never{throw new ProtectedFileError(code);}
const codes=new Set<ProtectedFileFailure>(['ACCESS_DENIED','INVALID_INPUT','NOT_FOUND','REVISION_CONFLICT','REQUEST_CONFLICT','SOURCE_UNAVAILABLE','SOURCE_CHANGED','CLOSED','EXPIRED','LIMIT_EXCEEDED','DEPENDENCY_UNAVAILABLE']);
export interface ProtectedFileDependencies{
 observeOriginalActor(signal:AbortSignal):Promise<string|null>;
 service(input:{p_action:ProtectedFileRequest;p_observed_actor_user_id:string|null},signal:AbortSignal):Promise<unknown>;
 readCanonicalObject:ReturnType<typeof canonicalSignatureStorageReader>;
}
export type ProtectedFileResult={kind:'file';context:ProtectedFileContext;bytes:Uint8Array;sha256:string;mime:string}|{kind:'file_absent';context:ProtectedFileAbsent};
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
 if(signal.aborted)return Promise.reject(new ProtectedFileError('ACCESS_DENIED'));
 return new Promise<T>((resolve,reject)=>{
  const abort=()=>{signal.removeEventListener('abort',abort);reject(new ProtectedFileError('ACCESS_DENIED'));};
  signal.addEventListener('abort',abort,{once:true});
  operation.then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(new ProtectedFileError('ACCESS_DENIED'));else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
 });
}
async function boundedBytes(response:Response,signal:AbortSignal):Promise<Uint8Array<ArrayBuffer>>{
 if(!response.ok||response.redirected)fail(response.status===404?'SOURCE_UNAVAILABLE':'DEPENDENCY_UNAVAILABLE');
 const rawLength=response.headers.get('content-length');
 if(rawLength!==null&&(!/^\d{1,12}$/.test(rawLength)||Number(rawLength)>SIGNATURE_SOURCE_MAX_BYTES))fail('LIMIT_EXCEEDED');
  const encoding=response.headers.get('content-encoding')?.trim().toLowerCase()??'identity';
  if(!['identity','gzip','br','deflate'].includes(encoding))fail('DEPENDENCY_UNAVAILABLE');
 if(!response.body)fail('SOURCE_UNAVAILABLE');
 const reader=response.body.getReader();let total=0;let complete=false;const parts:Uint8Array[]=[];
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

/** Binary disclosure only. No write, signed URL, public Storage grant or caller-supplied path. */
export async function readProtectedSignatureFile(input:unknown,deps:ProtectedFileDependencies,outer?:AbortSignal):Promise<ProtectedFileResult>{
 const parsed=protectedFileRequestSchema.safeParse(input);if(!parsed.success)fail('INVALID_INPUT');const request=protectedFileRequestSchema.parse(JSON.parse(JSON.stringify(parsed.data)));
 const ctl=new AbortController(),signal=ctl.signal,abort=()=>ctl.abort();outer?.addEventListener('abort',abort,{once:true});if(outer?.aborted)abort();const timer=setTimeout(abort,45000);let actor:string|null|undefined;
 const current=async()=>{if(signal.aborted)fail('ACCESS_DENIED');const fresh=await boundedAwait(deps.observeOriginalActor(signal),signal);if(signal.aborted||fresh!==null&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(fresh)||actor!==undefined&&fresh!==actor||request.address.kind==='authenticated_signature'&&fresh===null)fail('ACCESS_DENIED');actor=fresh;};
 const invoke=async()=>{await current();const result=await boundedAwait(deps.service({p_action:request,p_observed_actor_user_id:actor??null},signal),signal);await current();if(typeof result==='object'&&result!==null&&(result as {ok?:unknown}).ok===false){const r=result as Record<string,unknown>;if(r.version===1&&Object.keys(r).length===3&&typeof r.code==='string'&&codes.has(r.code as ProtectedFileFailure))fail(r.code as ProtectedFileFailure);fail('DEPENDENCY_UNAVAILABLE');}return result;};
 const checkScope=(value:{organization_id:string;signature_id:string;chosen_party:string;document_revision_id:string|null;document_html_sha256:string},binding:string|null)=>{if(value.document_revision_id!==request.expected_document_revision_id||value.document_html_sha256!==request.document_html_sha256||binding!==request.binding_id||request.address.kind==='authenticated_signature'&&(value.organization_id!==request.address.organization_id||value.signature_id!==request.address.signature_id||value.chosen_party!==request.address.chosen_party)||request.address.kind==='invitation'&&value.chosen_party!=='recipient')fail('SOURCE_CHANGED');};
 try{
  const raw=await invoke(),absent=protectedFileAbsentSchema.safeParse(raw);if(absent.success){if(request.file_kind!=='source')fail('SOURCE_UNAVAILABLE');checkScope(absent.data,absent.data.binding_id);await current();return{kind:'file_absent',context:absent.data};}
  const parse=(value:unknown)=>{const ctx=protectedFileContextSchema.safeParse(value);if(!ctx.success)fail('DEPENDENCY_UNAVAILABLE');checkScope(ctx.data.source,ctx.data.binding_id);if(ctx.data.source.purpose!==request.file_kind||request.event_revision!==null&&ctx.data.event_revision!==request.event_revision)fail('SOURCE_CHANGED');return ctx.data;};
  const before=parse(raw);await current();const response=await boundedAwait(deps.readCanonicalObject(before.source,signal),signal);await current();const actualMime=mime(response.headers.get('content-type'));
  if(!actualMime||before.object.reported_mime!==null&&before.object.reported_mime!==actualMime||before.expected_mime!==null&&before.expected_mime!==actualMime)fail('SOURCE_CHANGED');
  const bytes=await boundedBytes(response,signal);await current();const sha256=await boundedAwait(digest(bytes),signal);await current();
  if(before.object.reported_size!==null&&before.object.reported_size!==bytes.byteLength||before.expected_bytes!==null&&before.expected_bytes!==bytes.byteLength||before.expected_sha256!==null&&before.expected_sha256!==sha256)fail('SOURCE_CHANGED');
  const after=parse(await invoke());if(!same(before,after))fail('SOURCE_CHANGED');await current();return{kind:'file',context:before,bytes,sha256,mime:actualMime};
 }catch(error){if(error instanceof ProtectedFileError)throw error;return fail(signal.aborted?'ACCESS_DENIED':'DEPENDENCY_UNAVAILABLE');}
 finally{clearTimeout(timer);outer?.removeEventListener('abort',abort);ctl.abort();}
}
