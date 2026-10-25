import{z}from'zod';
import{ArchiveError,archiveErrorCode,archiveScope,archiveUuid}from'./archive-core/contract.ts';
import{readSealedArchiveManifest,readSealedArchiveFile,type ArchiveSealedReadPort}from'./archive-core/sealedRead.ts';
import{archiveSha256}from'./archive-core/package.ts';
const requestSchema=z.discriminatedUnion('action',[
 z.object({version:z.literal(1),action:z.literal('manifest'),organization_id:archiveUuid,scope:archiveScope,package_id:archiveUuid}).strict(),
 z.object({version:z.literal(1),action:z.literal('file'),organization_id:archiveUuid,scope:archiveScope,package_id:archiveUuid,file_id:archiveUuid}).strict(),
]);
interface Client{auth?:{getUser():Promise<{data:{user:{id:string}|null};error:unknown}>};rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown;status?:number}>;storage:{from(bucket:string):{download(path:string):Promise<{data:Blob|null;error:unknown}>}}}
export interface ArchiveReadRuntime{configured:boolean;createCaller(authorization:string,signal:AbortSignal):Client;createService(signal:AbortSignal):Client}
const baseHeaders={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type','access-control-allow-methods':'POST,OPTIONS','access-control-expose-headers':'x-archive-sha256,content-length','cache-control':'no-store','x-sintagma-archive-revision':'uc024-read-v1'};
function safeError(error:unknown):ArchiveError{if(error instanceof ArchiveError)return error;const row=error&&typeof error==='object'?error as Record<string,unknown>:{};if(row.status===401||row.status===403||row.statusCode==='401'||row.statusCode==='403'||row.code==='42501')return new ArchiveError('ACCESS_DENIED');const parsed=archiveErrorCode.safeParse(row.message);return new ArchiveError(parsed.success?parsed.data:'SOURCE_UNAVAILABLE');}
export async function archiveReadRequest(request:Request,runtime:ArchiveReadRuntime):Promise<Response>{
 const json=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:{...baseHeaders,'content-type':'application/json'}});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:baseHeaders});if(request.method!=='POST')return json(405,{ok:false,code:'INVALID_INPUT'});
 const controller=new AbortController();const abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});const timeout=setTimeout(abort,180000);
 try{
  const authorization=request.headers.get('authorization');if(!runtime.configured||!authorization?.match(/^Bearer [A-Za-z0-9._-]+$/))throw new ArchiveError('ACCESS_DENIED');if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new ArchiveError('INVALID_INPUT');
  const reader=request.body?.getReader();if(!reader)throw new ArchiveError('INVALID_INPUT');const chunks:Uint8Array[]=[];let length=0;const cancel=()=>{void reader.cancel().catch(()=>{});};controller.signal.addEventListener('abort',cancel,{once:true});
  let input:z.infer<typeof requestSchema>;
  try{for(;;){if(controller.signal.aborted)throw new ArchiveError('ACCESS_DENIED');const chunk=await reader.read();if(controller.signal.aborted)throw new ArchiveError('ACCESS_DENIED');if(chunk.done)break;length+=chunk.value.byteLength;if(length>8192){await reader.cancel();throw new ArchiveError('LIMIT_EXCEEDED');}chunks.push(chunk.value);}const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}try{input=requestSchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}catch{throw new ArchiveError('INVALID_INPUT');}}
  finally{controller.signal.removeEventListener('abort',cancel);reader.releaseLock();}
  const caller=runtime.createCaller(authorization,controller.signal);let observedActor:string|undefined;
  const current=()=>{if(controller.signal.aborted)throw new ArchiveError('ACCESS_DENIED');};
  const observe=async()=>{current();if(!caller.auth)throw new ArchiveError('DEPENDENCY_UNAVAILABLE');const response=await caller.auth.getUser();current();if(response.error||!response.data.user||!archiveUuid.safeParse(response.data.user.id).success||observedActor&&observedActor!==response.data.user.id)throw new ArchiveError('ACCESS_DENIED');observedActor=response.data.user.id;};
  await observe();const service=runtime.createService(controller.signal);
  const args={p_org:input.organization_id,p_scope:input.scope,p_package:input.package_id};
  const call=async(name:string,extra:Record<string,unknown>={})=>{current();const result=await caller.rpc(name,{...args,...extra});current();if(result.status===401||result.status===403)throw new ArchiveError('ACCESS_DENIED');if(result.error)throw safeError(result.error);return result.data;};
  const port:ArchiveSealedReadPort={observedActorId:observedActor!,organizationId:input.organization_id,scope:input.scope,packageId:input.package_id,assertCurrent:current,manifestContext:()=>call('archive_sealed_package_context'),fileContext:fileId=>call('archive_sealed_file_context',{p_file:fileId}),async downloadExact(context){current();const response=await service.storage.from(context.bucket).download(context.path);current();if(response.error)throw safeError(response.error);if(!response.data||response.data.size!==context.byte_size)throw new ArchiveError('SOURCE_CHANGED');const bytes=new Uint8Array(await response.data.arrayBuffer());current();return bytes;}};
  if(input.action==='manifest'){const value=await readSealedArchiveManifest(port);await observe();current();return new Response(value.bytes as unknown as BodyInit,{status:200,headers:{...baseHeaders,'content-type':'application/json','content-length':String(value.bytes.byteLength),'content-disposition':'attachment; filename="archive-'+input.package_id+'.json"','x-archive-sha256':value.sha256}});}
  const bytes=await readSealedArchiveFile(port,input.file_id);const byteHash=await archiveSha256(bytes);current();await observe();current();
  return new Response(bytes as unknown as BodyInit,{status:200,headers:{...baseHeaders,'content-type':'application/octet-stream','content-length':String(bytes.byteLength),'content-disposition':'attachment; filename="'+input.file_id+'.bin"','x-archive-sha256':byteHash}});
 }catch(error){const value=safeError(error);return json(value.code==='ACCESS_DENIED'?403:value.code==='NOT_FOUND'?404:['SOURCE_CHANGED','REVISION_CONFLICT'].includes(value.code)?409:value.code==='SOURCE_UNAVAILABLE'||value.code==='DEPENDENCY_UNAVAILABLE'?503:400,{ok:false,code:value.code});}
 finally{clearTimeout(timeout);request.signal.removeEventListener('abort',abort);}
}
