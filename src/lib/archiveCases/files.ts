import{z}from'zod';
import{ArchiveError,archiveErrorCode,archiveHash,archiveManifest,archivePackageSummary,archiveRestore,archiveScope,archiveSource,archiveUuid,type ArchiveManifest,type ArchiveSource}from'./contract';
import{assertArchiveScope,requireArchiveJwt,type ArchiveClientScope}from'./client';
import{archiveSha256,archiveUtf8,canonicalArchiveJson,verifyArchivePackage}from'./package';
const MAX_BROWSER_PACKAGE_BYTES=256*1024*1024;
type EdgeName='archive-case-read'|'archive-case-package'|'archive-case-restore'|'archive-rule-source-check';
async function invoke(scope:ArchiveClientScope,name:EdgeName,body:object,maxBytes:number):Promise<{bytes:Uint8Array;headers:Headers}>{
 assertArchiveScope(scope);const jwt=await requireArchiveJwt(scope);const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),180000);
 try{const response=await window.fetch(import.meta.env.VITE_SUPABASE_URL+'/functions/v1/'+name,{method:'POST',headers:{Authorization:'Bearer '+jwt,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store',credentials:'omit',signal:controller.signal});assertArchiveScope(scope);
  if(response.status===401||response.status===403){await response.body?.cancel().catch(()=>{});throw new ArchiveError('ACCESS_DENIED');}
  const reader=response.body?.getReader();if(!reader)throw new ArchiveError('SOURCE_UNAVAILABLE');const chunks:Uint8Array[]=[];let total=0;
  try{for(;;){assertArchiveScope(scope);const chunk=await reader.read();assertArchiveScope(scope);if(controller.signal.aborted)throw new ArchiveError('DEPENDENCY_UNAVAILABLE');if(chunk.done)break;total+=chunk.value.byteLength;if(total>maxBytes){await reader.cancel();throw new ArchiveError('LIMIT_EXCEEDED');}chunks.push(chunk.value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  if(!response.ok){let code:unknown;try{code=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)).code;}catch{}const parsed=archiveErrorCode.safeParse(code);throw new ArchiveError(parsed.success?parsed.data:'SOURCE_UNAVAILABLE');}
  assertArchiveScope(scope);return{bytes,headers:response.headers};
 }catch(error){assertArchiveScope(scope);if(error instanceof ArchiveError)throw error;throw new ArchiveError('DEPENDENCY_UNAVAILABLE');}
 finally{clearTimeout(timeout);controller.abort();}
}
function json(bytes:Uint8Array):unknown{try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new ArchiveError('SOURCE_UNAVAILABLE');}}
const same=(left:object,right:object)=>canonicalArchiveJson(left)===canonicalArchiveJson(right);
function checkActor(scope:ArchiveClientScope,result:Pick<z.infer<typeof packageReply>,'organization_id'|'actor_id'>){if(result.organization_id!==scope.organizationId||result.actor_id!==scope.actorId)throw new ArchiveError('SOURCE_CHANGED');}
export async function readArchiveManifestBytes(scope:ArchiveClientScope,expected:z.infer<typeof archivePackageSummary>):Promise<{manifest:ArchiveManifest;bytes:Uint8Array;sha256:string}>{
 if(!archivePackageSummary.safeParse(expected).success||expected.organization_id!==scope.organizationId||expected.phase!=='sealed'||!expected.manifest_sha256||!expected.manifest_bytes)throw new ArchiveError('INVALID_INPUT');
 const response=await invoke(scope,'archive-case-read',{version:1,action:'manifest',organization_id:scope.organizationId,scope:scope.archiveScope,package_id:expected.id},4194304);assertArchiveScope(scope);
 if(response.bytes.byteLength!==expected.manifest_bytes||response.headers.get('x-archive-sha256')!==expected.manifest_sha256||await archiveSha256(response.bytes)!==expected.manifest_sha256)throw new ArchiveError('HASH_MISMATCH');assertArchiveScope(scope);
 const parsed=archiveManifest.safeParse(json(response.bytes));if(!parsed.success)throw new ArchiveError('PACKAGE_INCOMPLETE');const manifest=parsed.data;
 if(manifest.package_id!==expected.id||manifest.organization_id!==scope.organizationId||manifest.case_id!==expected.case_id||manifest.case_revision!==expected.input_revision||manifest.case_state_hash!==expected.input_state_hash||manifest.completeness!==expected.completeness||!same(manifest.blockers,expected.blockers)||new TextDecoder().decode(archiveUtf8(manifest))!==new TextDecoder().decode(response.bytes))throw new ArchiveError('SOURCE_CHANGED');
 return{manifest,bytes:response.bytes,sha256:expected.manifest_sha256};
}
export async function readArchiveFileBytes(scope:ArchiveClientScope,packageId:string,file:ArchiveManifest['files'][number]):Promise<Uint8Array>{
 if(!archiveUuid.safeParse(packageId).success)throw new ArchiveError('INVALID_INPUT');const response=await invoke(scope,'archive-case-read',{version:1,action:'file',organization_id:scope.organizationId,scope:scope.archiveScope,package_id:packageId,file_id:file.id},104857600);assertArchiveScope(scope);
 if(response.bytes.byteLength!==file.byte_size||response.headers.get('x-archive-sha256')!==file.byte_sha256||await archiveSha256(response.bytes)!==file.byte_sha256)throw new ArchiveError('HASH_MISMATCH');assertArchiveScope(scope);return response.bytes;
}
export async function exportArchiveZip(scope:ArchiveClientScope,expected:z.infer<typeof archivePackageSummary>):Promise<Uint8Array>{
 const header=await readArchiveManifestBytes(scope,expected);const total=header.manifest.files.reduce((sum,file)=>sum+file.byte_size,0);if(!Number.isSafeInteger(total)||total>MAX_BROWSER_PACKAGE_BYTES)throw new ArchiveError('LIMIT_EXCEEDED');
 const files=new Map<string,Uint8Array>();for(const file of header.manifest.files){assertArchiveScope(scope);files.set(file.archive_path,await readArchiveFileBytes(scope,expected.id,file));}
 await verifyArchivePackage({manifest_bytes:header.bytes,manifest_sha256:header.sha256,files},{assertCurrent:()=>assertArchiveScope(scope)});assertArchiveScope(scope);
 const{default:JSZip}=await import('jszip');assertArchiveScope(scope);const zip=new JSZip();zip.file('manifest.json',header.bytes);for(const[name,bytes]of files)zip.file(name,bytes);const bytes=await zip.generateAsync({type:'uint8array',compression:'STORE'});assertArchiveScope(scope);return bytes;
}
const committedPackage=archivePackageSummary.extend({actor_id:archiveUuid,request_id:archiveUuid,replayed:z.boolean()}).strict();
const packageReply=z.object({version:z.literal(1),ok:z.literal(true),organization_id:archiveUuid,package_id:archiveUuid,actor_id:archiveUuid,result:z.union([archivePackageSummary,committedPackage])}).strict();
export async function buildPersistedArchivePackage(scope:ArchiveClientScope,expected:z.infer<typeof archivePackageSummary>,requestId:string){
 if(expected.organization_id!==scope.organizationId||!archiveUuid.safeParse(requestId).success||expected.actor_id!==undefined&&expected.actor_id!==scope.actorId||expected.request_id!==undefined&&expected.request_id!==requestId)throw new ArchiveError('INVALID_INPUT');const response=await invoke(scope,'archive-case-package',{version:1,action:'build_package',organization_id:scope.organizationId,scope:scope.archiveScope,package_id:expected.id,request_id:requestId},1048576);const reply=packageReply.safeParse(json(response.bytes));if(!reply.success)throw new ArchiveError('SOURCE_UNAVAILABLE');checkActor(scope,reply.data);const value=reply.data.result;
 if(reply.data.package_id!==expected.id||value.id!==expected.id||value.organization_id!==scope.organizationId||value.case_id!==expected.case_id||value.input_revision!==expected.input_revision||value.input_state_hash!==expected.input_state_hash||value.phase!=='sealed'||!value.manifest_sha256||!value.manifest_bytes||'actor_id'in value&&(value.actor_id!==scope.actorId||value.request_id!==requestId))throw new ArchiveError('SOURCE_CHANGED');assertArchiveScope(scope);return value;
}
const restoreReply=z.object({version:z.literal(1),ok:z.literal(true),organization_id:archiveUuid,scope:archiveScope,actor_id:archiveUuid,restore:archiveRestore}).strict();
export async function runPersistedArchiveRestore(scope:ArchiveClientScope,expected:z.infer<typeof archiveRestore>){
 if(expected.organization_id!==scope.organizationId||expected.actor_id!==scope.actorId)throw new ArchiveError('INVALID_INPUT');const response=await invoke(scope,'archive-case-restore',{version:1,action:'restore_package',organization_id:scope.organizationId,scope:scope.archiveScope,package_id:expected.package_id,restore_id:expected.id,request_id:expected.request_id},1048576);const parsed=restoreReply.safeParse(json(response.bytes));if(!parsed.success)throw new ArchiveError('SOURCE_UNAVAILABLE');const reply=parsed.data;checkActor(scope,reply);
 if(!same(reply.scope,scope.archiveScope)||reply.restore.id!==expected.id||reply.restore.package_id!==expected.package_id||reply.restore.organization_id!==scope.organizationId||reply.restore.actor_id!==scope.actorId||reply.restore.request_id!==expected.request_id||reply.restore.manifest_sha256!==expected.manifest_sha256||reply.restore.state!=='verified')throw new ArchiveError('SOURCE_CHANGED');assertArchiveScope(scope);return reply.restore;
}
export function saveArchiveDownload(scope:ArchiveClientScope,bytes:Uint8Array,name:string,mime:string){assertArchiveScope(scope);if(!/^[a-z0-9._-]{1,180}$/i.test(name)||!['application/zip','application/json','application/octet-stream'].includes(mime))throw new ArchiveError('INVALID_INPUT');const url=URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer],{type:mime}));try{assertArchiveScope(scope);const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}}

const inspectionReply=z.object({version:z.literal(1),ok:z.literal(true),organization_id:archiveUuid,actor_id:archiveUuid,source:archiveSource,byte_sha256:archiveHash,byte_size:z.number().int().positive().max(104857600),inspection_only:z.literal(true),legal_review:z.literal(false),center_approval:z.literal(false)}).strict();
export async function inspectArchiveRuleSource(scope:ArchiveClientScope,source:ArchiveSource){
 if(scope.archiveScope.kind!=='organization'||source.kind!=='organization_document_version'||!archiveSource.safeParse(source).success)throw new ArchiveError('INVALID_INPUT');const response=await invoke(scope,'archive-rule-source-check',{version:1,action:'inspect_source',organization_id:scope.organizationId,source},1048576);const parsed=inspectionReply.safeParse(json(response.bytes));if(!parsed.success)throw new ArchiveError('SOURCE_UNAVAILABLE');checkActor(scope,parsed.data);if(!same(parsed.data.source,source))throw new ArchiveError('SOURCE_CHANGED');assertArchiveScope(scope);return parsed.data;
}
const verifiedSourceReply=z.object({version:z.literal(1),ok:z.literal(true),organization_id:archiveUuid,actor_id:archiveUuid,result:z.object({schema_version:z.literal(1),job_id:archiveUuid,actor_id:archiveUuid,request_id:archiveUuid,verified_rule_version_id:archiveUuid,byte_sha256:archiveHash,byte_size:z.number().int().positive().max(104857600),replayed:z.boolean()}).strict(),legal_review:z.literal(false),center_approval:z.literal(false)}).strict();
export async function verifyArchiveRuleSource(scope:ArchiveClientScope,ruleVersionId:string,requestId:string){
 if(scope.archiveScope.kind!=='organization'||!archiveUuid.safeParse(ruleVersionId).success||!archiveUuid.safeParse(requestId).success)throw new ArchiveError('INVALID_INPUT');const response=await invoke(scope,'archive-rule-source-check',{version:1,action:'verify_rule_source',organization_id:scope.organizationId,rule_version_id:ruleVersionId,request_id:requestId},1048576);const parsed=verifiedSourceReply.safeParse(json(response.bytes));if(!parsed.success)throw new ArchiveError('SOURCE_UNAVAILABLE');checkActor(scope,parsed.data);if(parsed.data.result.actor_id!==scope.actorId||parsed.data.result.request_id!==requestId||parsed.data.result.verified_rule_version_id===ruleVersionId)throw new ArchiveError('SOURCE_CHANGED');assertArchiveScope(scope);return parsed.data.result;
}
