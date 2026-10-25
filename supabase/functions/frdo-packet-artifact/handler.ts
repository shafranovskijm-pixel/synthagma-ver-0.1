import{z}from'zod';
import{canonicalJson,ensureCurrent,sha256}from'../../../src/lib/frdoFoundation/hash.ts';
import type{CurrentGuard}from'../../../src/lib/frdoFoundation/types.ts';
import *as runtime from'../../../src/lib/frdoPackets/runtimeContract.ts';
import{PacketInvariantError}from'../../../src/lib/frdoPackets/invariants.ts';
import{createTrustedFrdoService}from'./trustedService.ts';
import{FrdoTransportError,type FrdoRestPorts}from'./restTransport.ts';
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type,x-client-info','access-control-allow-methods':'POST,OPTIONS','cache-control':'no-store'};
const requestSchema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('mutate'),command:runtime.mutationRequestSchema}).strict(),
 z.object({operation:z.literal('read'),request:runtime.readRequestSchema}).strict(),
]);
const descriptorSchema=z.object({bucket:z.literal('frdo-packet-artifacts'),path:z.string().min(1).max(1000),object_id:z.string().uuid(),updated_at:z.string(),byte_sha256:z.string().regex(/^[a-f0-9]{64}$/),byte_size:z.number().int().min(1).max(20971520),packet_id:z.string().uuid(),artifact_id:z.string().uuid(),signing:z.object({status:z.literal('not_verified')}).strict()}).strict();
function reply(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...cors,'content-type':'application/json; charset=utf-8'}});}
async function body(request:Request,guard:CurrentGuard){
 const length=request.headers.get('content-length');if(length!==null&&(!/^[0-9]+$/.test(length)||Number(length)>8000000))throw new FrdoTransportError('INVALID_REQUEST');if(!request.body)throw new FrdoTransportError('INVALID_REQUEST');
 const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0,timedOut=false;const timer=setTimeout(()=>{timedOut=true;void reader.cancel().catch(()=>{});},30000);
 try{for(;;){ensureCurrent(guard);const part=await reader.read();ensureCurrent(guard);if(timedOut)throw new FrdoTransportError('DEPENDENCY_UNAVAILABLE');if(part.done)break;size+=part.value.byteLength;if(size>8000000)throw new FrdoTransportError('INVALID_REQUEST');parts.push(new Uint8Array(part.value));}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{clearTimeout(timer);reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new FrdoTransportError('INVALID_REQUEST');}
}

/** HTTP dispatch has no identity/service/path options in its JSON body. The
 * native entry injects server environment and exact original bearer once. */
export function createFrdoHandler(makePorts:(originalBearer:string,guard:CurrentGuard)=>FrdoRestPorts,now:()=>number=Date.now){
 return async(request:Request)=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(request.method!=='POST')return reply({schema_version:1,code:'INVALID_REQUEST',retryable:false,message:'Поддерживается только POST.'},405);
  const started=now(),guard:CurrentGuard={assertCurrent(){if(request.signal.aborted)throw new FrdoTransportError('ACCESS_DENIED');if(now()-started>110000)throw new FrdoTransportError('DEPENDENCY_UNAVAILABLE');}};
  try{
   const authorization=request.headers.get('authorization'),match=authorization?.match(/^Bearer ([^\s]+)$/);if(!match)throw new FrdoTransportError('AUTH_REQUIRED');
   if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new FrdoTransportError('INVALID_REQUEST');
   const parsed=requestSchema.parse(await body(request,guard));ensureCurrent(guard);const ports=makePorts(match[1],guard),service=createTrustedFrdoService(ports);
   if(parsed.operation==='read'){
    const input=parsed.request,query=input.query;
    if(query.kind==='preview'||query.kind==='correction_preview')return reply(await service.preview(input,guard));
    const actor=await ports.originalUser();ensureCurrent(guard);const result=await ports.originalRpc('read_frdo_packets',{p_request:input});ensureCurrent(guard);
    if(query.kind!=='download'){
     const dto=runtime.readResultSchema.parse(result);if(dto.actor_id!==actor.id||dto.organization_id!==input.organization_id||canonicalJson(dto.scope)!==canonicalJson(input.scope))throw new FrdoTransportError('ACCESS_DENIED');return reply(dto);
    }
    const internal=z.object({schema_version:z.literal(1),abi_revision:z.literal(runtime.RUNTIME_ABI_REVISION),organization_id:z.string().uuid(),scope:runtime.readRequestSchema.shape.scope,actor_id:z.string().uuid(),kind:z.literal('download'),descriptor:descriptorSchema}).strict().parse(result);
    if(internal.actor_id!==actor.id||internal.organization_id!==input.organization_id||canonicalJson(internal.scope)!==canonicalJson(input.scope)||internal.descriptor.packet_id!==query.packet.id||internal.descriptor.artifact_id!==query.artifact.artifact_id||internal.descriptor.byte_sha256!==query.artifact.byte_sha256||internal.descriptor.byte_size!==query.artifact.byte_size)throw new FrdoTransportError('ACCESS_DENIED');
    const signed=await ports.signArtifact(internal.descriptor as {bucket:'frdo-packet-artifacts';path:string});ensureCurrent(guard);
    const after=await ports.originalRpc('read_frdo_packets',{p_request:input});ensureCurrent(guard);if(canonicalJson(after)!==canonicalJson(internal))throw new FrdoTransportError('SOURCE_CHANGED');
    const currentActor=await ports.originalUser();ensureCurrent(guard);if(currentActor.id!==actor.id)throw new FrdoTransportError('ACCESS_DENIED');if(!Number.isFinite(Date.parse(signed.expires_at))||Date.parse(signed.expires_at)<=ports.now()||Date.parse(signed.expires_at)>ports.now()+60000)throw new FrdoTransportError('ARTIFACT_UNAVAILABLE');
    return reply(runtime.readResultSchema.parse({schema_version:1,abi_revision:runtime.RUNTIME_ABI_REVISION,organization_id:input.organization_id,scope:input.scope,actor_id:actor.id,kind:'download',download:{schema_version:1,organization_id:input.organization_id,scope:input.scope,packet_id:query.packet.id,artifact_id:query.artifact.artifact_id,byte_sha256:query.artifact.byte_sha256,byte_size:query.artifact.byte_size,purpose:query.purpose,signing:{status:'not_verified'},...signed}}));
   }
   const command=parsed.command,action=command.action;let replayed=false;
   if(action.kind==='freeze_preview'||action.kind==='create_correction')replayed=Boolean((await service.freeze(command,guard)).replayed);
   else if(action.kind==='save_supplement'||action.kind==='appoint_operator'||action.kind==='revoke_operator'||action.kind==='record_fis_upload'||action.kind==='record_receipt')replayed=Boolean((await service.evidenced(command,guard)).replayed);
   else if(action.kind==='generate_file'){
    const worker=await ports.originalRpc('uc_frdo_pending_worker_request',{p_command:command});ensureCurrent(guard);const generated=await service.generate(worker,guard);ensureCurrent(guard);replayed=Boolean(generated&&typeof generated==='object'&&'replayed'in generated&&generated.replayed);
   }else{
    await ports.originalUser();ensureCurrent(guard);const result=await ports.originalRpc(action.kind==='abandon_correction'?'uc_frdo_abandon_correction':'uc_frdo_apply_direct',{p_command:command});ensureCurrent(guard);replayed=Boolean(result&&typeof result==='object'&&'replayed'in result&&result.replayed);
   }
   const result=await ports.originalRpc('uc_frdo_mutation_result',{p_command:command});ensureCurrent(guard);const dto=runtime.mutationResultSchema.parse(result);
   const currentActor=await ports.originalUser();ensureCurrent(guard);if(dto.actor_id!==currentActor.id||dto.organization_id!==command.organization_id||canonicalJson(dto.scope)!==canonicalJson(command.scope))throw new FrdoTransportError('ACCESS_DENIED');const commandHash=await sha256(canonicalJson(command));ensureCurrent(guard);if(dto.receipt.request_id!==command.request_id||dto.receipt.action_kind!==action.kind||dto.receipt.payload_sha256!==commandHash)throw new FrdoTransportError('IDEMPOTENCY_CONFLICT');return reply({...dto,replayed});
  }catch(error){
   const code=error instanceof FrdoTransportError||error instanceof PacketInvariantError?error.code:error instanceof z.ZodError?'INVALID_REQUEST':'DEPENDENCY_UNAVAILABLE';
   const status=code==='AUTH_REQUIRED'?401:code==='ACCESS_DENIED'?403:code==='DEPENDENCY_UNAVAILABLE'?503:['INVALID_REQUEST','READINESS_BLOCKED','RECEIPT_MISMATCH','TEMPLATE_CHANGED'].includes(code)?400:409;
   return reply({schema_version:1,code,retryable:['DEPENDENCY_UNAVAILABLE','REVISION_CONFLICT'].includes(code),message:code==='AUTH_REQUIRED'?'Войдите в аккаунт.':code==='ACCESS_DENIED'?'Нет действующего доступа ко всему пакету.':'Операция не подтверждена. Обновите данные пакета и проверьте указанную причину.'},status);
  }
 };
}
