import {canonicalJson,ensureCurrent}from'../../../src/lib/frdoFoundation/hash.ts';
import type{CurrentGuard,Stream}from'../../../src/lib/frdoFoundation/types.ts';
import type{XmlRuntime}from'../../../src/lib/frdoFoundation/xmlRuntime.ts';
import {uuid}from'../../../src/lib/frdoPackets/contract.ts';
import {sourceDescriptorSchema,type TrustedFrdoPorts}from'./trustedService.ts';

const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const userNames=new Set(['uc_frdo_begin_freeze','uc_frdo_begin_correction','uc_frdo_read_inputs','uc_frdo_read_correction_selection','uc_frdo_action_sources','uc_frdo_request_file','uc_frdo_claim_file','uc_frdo_assert_file_claim','uc_frdo_fail_file','uc_frdo_candidate_object','read_frdo_packets','uc_frdo_mutation_result','uc_frdo_apply_direct','uc_frdo_abandon_correction','uc_frdo_pending_worker_request']);
const serviceNames=new Set(['uc_frdo_commit_freeze','uc_frdo_commit_correction','uc_frdo_commit_supplement','uc_frdo_commit_evidenced_action','uc_frdo_seal_file']);
export class FrdoTransportError extends Error{
 constructor(readonly code:'AUTH_REQUIRED'|'ACCESS_DENIED'|'INVALID_REQUEST'|'SOURCE_UNAVAILABLE'|'DEPENDENCY_UNAVAILABLE'|'SOURCE_CHANGED'|'REVISION_CONFLICT'|'IDEMPOTENCY_CONFLICT'|'READINESS_BLOCKED'|'ARTIFACT_UNAVAILABLE'|'ILLEGAL_TRANSITION'|'RECEIPT_MISMATCH'|'TEMPLATE_CHANGED'|'FILE_GENERATION_FAILED'|'FRDO_PACKET_RETENTION_REVIEW_REQUIRED'){super(code);this.name='FrdoTransportError';}
}
function throwCode(code:FrdoTransportError['code']):never{throw new FrdoTransportError(code);}
interface TransportOptions{
 supabaseUrl:string;publishableKey:string;serviceKey:string;originalBearer:string;
 fetch:typeof fetch;guard:CurrentGuard;donor:(stream:Stream)=>Promise<Uint8Array>;xml:Readonly<XmlRuntime>;now?:()=>number;
}

/** One original request owns this closure. No credential/header is returned,
 * logged, accepted from JSON or forwarded to a redirect/caller-supplied URL. */
export type FrdoRestPorts=TrustedFrdoPorts&{signArtifact:(descriptor:{bucket:'frdo-packet-artifacts';path:string})=>Promise<{signed_url:string;expires_at:string}>};
export function createRestFrdoPorts(options:Readonly<TransportOptions>):FrdoRestPorts{
 const url=new URL(options.supabaseUrl),now=options.now??Date.now,deadline=now()+110000;
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'&&url.pathname!=='')throwCode('DEPENDENCY_UNAVAILABLE');
 for(const secret of[options.publishableKey,options.serviceKey,options.originalBearer])if(!secret||secret.length>16384||/[\r\n]/.test(secret))throwCode('AUTH_REQUIRED');
 const base=url.origin;
 const guard:CurrentGuard={assertCurrent(){ensureCurrent(options.guard);if(now()>=deadline)throwCode('DEPENDENCY_UNAVAILABLE');}};
 const headers=(service:boolean)=>({Authorization:`Bearer ${service?options.serviceKey:options.originalBearer}`,apikey:service?options.serviceKey:options.publishableKey});
 function relativeObject(bucket:string,path:string){
  if(!['org-documents','frdo-packet-artifacts'].includes(bucket)||!path||path.length>2000||/[\\?\u0000-\u001f\u007f]/.test(path)||path.includes('://')||path.split('/').some(x=>!x||x==='.'||x==='..'))throwCode('INVALID_REQUEST');
  return `/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`;
 }
 async function bounded(response:Response,cap:number,current:CurrentGuard){
  ensureCurrent(current);const header=response.headers.get('content-length');
  if(header!==null&&(!/^[0-9]+$/.test(header)||!Number.isSafeInteger(Number(header))||Number(header)>cap)){await response.body?.cancel().catch(()=>{});throwCode('SOURCE_CHANGED');}
  if(!response.body){if(response.status===204||response.status===205||header==='0')return new Uint8Array();throwCode('SOURCE_UNAVAILABLE');}const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{for(;;){ensureCurrent(current);const part=await reader.read();ensureCurrent(current);if(part.done)break;if(!(part.value instanceof Uint8Array))throwCode('SOURCE_CHANGED');total+=part.value.length;if(total>cap)throwCode('SOURCE_CHANGED');chunks.push(new Uint8Array(part.value));}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const result=new Uint8Array(total);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}ensureCurrent(current);return result;
 }
 async function request(path:string,service:boolean,init:RequestInit,cap:number,current:CurrentGuard=guard){
  ensureCurrent(current);if(!path.startsWith('/')||path.startsWith('//'))throwCode('INVALID_REQUEST');const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),Math.max(1,Math.min(20000,deadline-now())));
  try{
   const response=await options.fetch(base+path,{...init,headers:{...headers(service),...init.headers},signal:abort.signal,redirect:'error',cache:'no-store'});ensureCurrent(current);
   // Actual authentication denial outranks even a recognized or oversized error body.
   if(response.status===401||response.status===403){await response.body?.cancel().catch(()=>{});throwCode(response.status===401?'AUTH_REQUIRED':'ACCESS_DENIED');}
   const bytes=await bounded(response,response.ok?cap:4096,current);ensureCurrent(current);
   return {response,bytes};
  }catch(error){if(error instanceof FrdoTransportError)throw error;ensureCurrent(current);throwCode('DEPENDENCY_UNAVAILABLE');}finally{clearTimeout(timeout);}
 }
 function parse(bytes:Uint8Array){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throwCode('DEPENDENCY_UNAVAILABLE');}}
 function reject(result:{response:Response;bytes:Uint8Array}):never{
  let value:unknown;try{value=parse(result.bytes);}catch{/* Never log body or pass provider error text to the caller. */}
  const message=value&&typeof value==='object'&&'message'in value?String(value.message):'';
  const codes:FrdoTransportError['code'][]=['AUTH_REQUIRED','ACCESS_DENIED','INVALID_REQUEST','SOURCE_UNAVAILABLE','DEPENDENCY_UNAVAILABLE','SOURCE_CHANGED','REVISION_CONFLICT','IDEMPOTENCY_CONFLICT','READINESS_BLOCKED','ARTIFACT_UNAVAILABLE','ILLEGAL_TRANSITION','RECEIPT_MISMATCH','TEMPLATE_CHANGED','FILE_GENERATION_FAILED','FRDO_PACKET_RETENTION_REVIEW_REQUIRED'];
  const matched=codes.find(code=>message===`FRDO_PACKET_${code}`);if(matched)throwCode(matched);
  throwCode(result.response.status===401?'AUTH_REQUIRED':result.response.status===403?'ACCESS_DENIED':result.response.status===404?'SOURCE_UNAVAILABLE':'DEPENDENCY_UNAVAILABLE');
 }
 async function rpc(name:string,args:Record<string,unknown>,service:boolean){
  if(!(service?serviceNames:userNames).has(name))throwCode('ACCESS_DENIED');const body=canonicalJson(args,8000000);
  const result=await request(`/rest/v1/rpc/${name}`,service,{method:'POST',headers:{'content-type':'application/json'},body},8000000);
  if(!result.response.ok)reject(result);return result.bytes.length?parse(result.bytes):null;
 }
 async function metadata(claim:Parameters<TrustedFrdoPorts['uploadCandidate']>[0]){
  return rpc('uc_frdo_candidate_object',{p_request:{schema_version:1,abi_revision:'uc020-persisted-v5',organization_id:claim.organization_id,packet_id:claim.packet.id,build_id:claim.build_id,input_revision:claim.input_revision,request_id:claim.request_id},p_lease:claim.lease_id},false);
 }
 return{
  async originalUser(){const result=await request('/auth/v1/user',false,{method:'GET'},131072);if(!result.response.ok)reject(result);const value=parse(result.bytes);if(!value||typeof value!=='object'||!('id'in value))throwCode('AUTH_REQUIRED');return{id:uuid.parse(value.id)};},
  originalRpc:(name,args)=>rpc(name,args,false),serviceRpc:(name,args)=>rpc(name,args,true),
  async readSource(raw,current){const descriptor=sourceDescriptorSchema.parse(raw);const result=await request(relativeObject(descriptor.bucket,descriptor.path),false,{method:'GET'},Math.min(20971520,descriptor.byte_size),current);if(!result.response.ok)reject(result);return result.bytes;},
  donor:options.donor,xml:options.xml,now,
  async signArtifact(descriptor){
   const started=now();if(descriptor.bucket!=='frdo-packet-artifacts')throwCode('ACCESS_DENIED');const objectPath=relativeObject(descriptor.bucket,descriptor.path),signPath=objectPath.replace('/storage/v1/object/','/storage/v1/object/sign/');
   const result=await request(signPath,false,{method:'POST',headers:{'content-type':'application/json'},body:'{"expiresIn":60}'},16384);if(!result.response.ok)reject(result);const value=parse(result.bytes);
   if(!value||typeof value!=='object')throwCode('DEPENDENCY_UNAVAILABLE');const raw='signedURL'in value?value.signedURL:'signedUrl'in value?value.signedUrl:null;if(typeof raw!=='string'||raw.length>8000)throwCode('DEPENDENCY_UNAVAILABLE');
   const signed=new URL(raw.startsWith('/object/sign/')?base+'/storage/v1'+raw:raw,base);if(signed.origin!==base||signed.pathname!==signPath||signed.username||signed.password||signed.hash||!signed.searchParams.get('token')||[...signed.searchParams.keys()].some(key=>key!=='token'))throwCode('ACCESS_DENIED');
   ensureCurrent(guard);return{signed_url:signed.href,expires_at:new Date(started+59000).toISOString()};
  },
  async uploadCandidate(claim,bytes,meta){
   ensureCurrent(guard);if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>20971520||meta.build_id!==claim.build_id||meta.lease_id!==claim.lease_id||meta.request_id!==claim.request_id||meta.snapshot_sha256!==claim.snapshot_sha256||Object.keys(meta).sort().join(',')!=='build_id,lease_id,request_id,snapshot_sha256')throwCode('INVALID_REQUEST');
   // Metadata UUID/hash strings are ASCII; base64 is transport encoding only.
   const result=await request(relativeObject('frdo-packet-artifacts',claim.storage.path),true,{method:'POST',headers:{'content-type':MIME,'cache-control':'max-age=0','x-upsert':'false','x-metadata':btoa(JSON.stringify(meta))},body:new Uint8Array(bytes)},131072);
   if(!result.response.ok&&result.response.status!==409)reject(result);
   // A 409 is recovery of the SAME immutable claimed location only. Metadata
   // still goes through original-current SQL and full actual J byte readback;
   // no name/size-only success and no overwrite or alternate path is allowed.
   return metadata(claim);
  },
  async readCandidate(claim,current){await metadata(claim);ensureCurrent(current);const result=await request(relativeObject('frdo-packet-artifacts',claim.storage.path),true,{method:'GET'},20971520,current);if(!result.response.ok)reject(result);await metadata(claim);ensureCurrent(current);return result.bytes;},
 };
}
