import {z} from 'zod';
import * as foundation from '../../../src/lib/frdoFoundation/contract';
import {canonicalJson,ensureCurrent,sha256} from '../../../src/lib/frdoFoundation/hash';
import type {CurrentGuard,Stream} from '../../../src/lib/frdoFoundation/types';
import type {XmlRuntime} from '../../../src/lib/frdoFoundation/xmlRuntime';
import {generateMappedOfficialWorkbook,verifyMappedOfficialWorkbook} from '../../../src/lib/frdoFoundation/template';
import * as held from '../../../src/lib/frdoPackets/contract';
import * as runtime from '../../../src/lib/frdoPackets/runtimeContract';
import {captureReviewedPacket,withReviewedIssuerRegime} from '../../../src/lib/frdoPackets/issuerReview';
import {mapFrozenProjections} from '../../../src/lib/frdoFoundation/mapper';
import {projectPendingFrdoDeadline} from '../../../src/lib/frdoFoundation/deadlineProjection';
import {reviewedPreviewHash,verifyTrustedFreezeCurrent} from '../../../src/lib/frdoPackets/trustedFreeze';
import {PacketInvariantError,verifyFrozenCapture} from '../../../src/lib/frdoPackets/invariants';

/** SOURCE ONLY: the deployment adapter must bundle these SAME canonical J modules.
 * No second mapper, user supplied mapped cells, source paths, actor or capabilities.
 * The adapter owns both clients; ORIGINAL JWT getUser, original RPC/Storage reads,
 * and narrowly enumerated service calls must never be replaced by browser state. */
const abi=z.literal(runtime.RUNTIME_ABI_REVISION),time=z.string().max(64).datetime({offset:true});
export const sourceDescriptorSchema=z.object({source:foundation.sourceRefSchema,bucket:z.literal('org-documents'),
 path:z.string().min(1).max(2000),object_id:held.uuid,updated_at:time,byte_size:z.number().int().min(1).max(20971520),expected_sha256:held.sha.nullable()}).strict()
 .superRefine((value,ctx)=>{const parts=value.path.split('/');if(parts.some(p=>!p||p==='.'||p==='..')||/[\\?\u0000-\u001f\u007f]/.test(value.path)||value.path.includes('://'))ctx.addIssue({code:'custom',message:'Private source path is not a relative storage key'});});
const descriptors=z.array(sourceDescriptorSchema).min(1).max(62000);
const inputEnvelope=z.object({input:foundation.foundationInputSchema,source_descriptors:descriptors}).strict();
const receiptResult=z.object({phase:z.enum(['pending','committed']),replayed:z.boolean().optional(),actor_id:held.uuid.optional(),request_id:held.uuid.optional(),payload_sha256:held.sha.optional(),receipt:runtime.requestReceiptSchema.nullable().optional(),schema_version:z.literal(1).optional(),abi_revision:abi.optional(),organization_id:held.uuid.optional(),scope:foundation.scopeSchema.optional()}).strict();
const workerRequestSchema=held.workerRequestSchema.omit({abi_revision:true}).extend({abi_revision:abi}).strict();
const buildClaimSchema=z.object({phase:z.literal('generating'),organization_id:held.uuid,actor_id:held.uuid,scope:foundation.scopeSchema,
 packet:held.packetRefSchema,build_id:held.uuid,artifact_id:held.uuid,request_id:held.uuid,input_revision:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
 snapshot_sha256:held.sha,capture:held.frozenCaptureSchema,template:foundation.templateRefSchema,lease_id:held.uuid,lease_until:time,
 storage:z.object({bucket:z.literal('frdo-packet-artifacts'),path:z.string().min(1).max(1000)}).strict()}).strict();
const candidateObjectSchema=z.object({object_id:held.uuid,updated_at:time,byte_size:z.number().int().min(1).max(20971520)}).strict();
type Command=z.infer<typeof runtime.mutationRequestSchema>;
type Descriptor=z.infer<typeof sourceDescriptorSchema>;
type Request=z.infer<typeof workerRequestSchema>;
type Claim=z.infer<typeof buildClaimSchema>;
type UserRpc='uc_frdo_begin_freeze'|'uc_frdo_begin_correction'|'uc_frdo_read_inputs'|'uc_frdo_read_correction_selection'|'uc_frdo_action_sources'|'uc_frdo_request_file'|'uc_frdo_claim_file'|'uc_frdo_assert_file_claim'|'uc_frdo_fail_file'|'read_frdo_packets'|'uc_frdo_mutation_result'|'uc_frdo_apply_direct'|'uc_frdo_abandon_correction'|'uc_frdo_pending_worker_request';
type ServiceRpc='uc_frdo_commit_freeze'|'uc_frdo_commit_correction'|'uc_frdo_commit_supplement'|'uc_frdo_commit_evidenced_action'|'uc_frdo_seal_file';
export interface TrustedFrdoPorts {
 /** Must call Auth getUser against the original bearer, not decode an unverified JWT. */
 originalUser:()=>Promise<{id:string}>;
 originalRpc:(name:UserRpc,args:Record<string,unknown>)=>Promise<unknown>;
 serviceRpc:(name:ServiceRpc,args:Record<string,unknown>)=>Promise<unknown>;
 /** Bound authenticated GET; implementation must stream cap, abort and check guard. */
 readSource:(descriptor:Readonly<Descriptor>,guard:CurrentGuard)=>Promise<Uint8Array>;
 donor:(stream:Stream)=>Promise<Uint8Array>;
 xml:Readonly<XmlRuntime>;
 /** Fixed exact claimed location only; upsert:false. Metadata has four exact keys. */
 uploadCandidate:(claim:Readonly<Claim>,bytes:Uint8Array,metadata:{build_id:string;lease_id:string;request_id:string;snapshot_sha256:string})=>Promise<unknown>;
 /** Service readback only at the server claim location, before sealed user access. */
 readCandidate:(claim:Readonly<Claim>,guard:CurrentGuard)=>Promise<Uint8Array>;
 now:()=>number;
}
function refuse(code:PacketInvariantError['code']):never{throw new PacketInvariantError(code);}
function same(a:unknown,b:unknown){return canonicalJson(a)===canonicalJson(b);}

export function createTrustedFrdoService(ports:Readonly<TrustedFrdoPorts>){
 async function actorGuard(outer:CurrentGuard){
  ensureCurrent(outer);const first=await ports.originalUser();ensureCurrent(outer);const actor=held.uuid.parse(first.id);
  return {actor,guard:outer,async refresh(){ensureCurrent(outer);const current=await ports.originalUser();ensureCurrent(outer);if(current.id!==actor)refuse('ACCESS_DENIED');}};
 }
 async function readExactSources(raw:unknown,org:string,guard:CurrentGuard){
  const values=descriptors.parse(raw),seen=new Set<string>(),reads:z.infer<typeof runtime.sourceReadSchema>[]=[];
  let total=0;
  for(const descriptor of values){
   ensureCurrent(guard);const key=canonicalJson(descriptor.source);if(seen.has(key)||descriptor.path.split('/')[0]!==org)refuse('SOURCE_CHANGED');seen.add(key);
   total+=descriptor.byte_size;if(total>268435456)refuse('READINESS_BLOCKED'); // disclosed technical per-operation bound; no tariff quota
   const rawBytes=await ports.readSource(Object.freeze(structuredClone(descriptor)),guard);ensureCurrent(guard);
   if(!(rawBytes instanceof Uint8Array)||rawBytes.length!==descriptor.byte_size)refuse('SOURCE_CHANGED');
   const actual=await sha256(rawBytes);ensureCurrent(guard);if(descriptor.expected_sha256!==null&&actual!==descriptor.expected_sha256)refuse('SOURCE_CHANGED');
   reads.push(runtime.sourceReadSchema.parse({source:descriptor.source,byte_sha256:actual,byte_size:rawBytes.length,object_id:descriptor.object_id,updated_at:descriptor.updated_at}));
  }
  return reads;
 }
 async function freeze(raw:unknown,outer:CurrentGuard){
  const command=runtime.mutationRequestSchema.parse(structuredClone(raw)),action=command.action;
  if(action.kind!=='freeze_preview'&&action.kind!=='create_correction')refuse('INVALID_REQUEST');
  const actor=await actorGuard(outer),beginName=action.kind==='freeze_preview'?'uc_frdo_begin_freeze':'uc_frdo_begin_correction';
  const beginning=receiptResult.parse(await ports.originalRpc(beginName,{p_command:command}));ensureCurrent(outer);
  if(beginning.actor_id!==actor.actor||beginning.payload_sha256!==await sha256(canonicalJson(command)))refuse('ACCESS_DENIED');ensureCurrent(outer);
  if(beginning.phase==='committed')return {...beginning,replayed:true};
  let selection: z.infer<typeof foundation.selectionSchema>;
  if(action.kind==='freeze_preview')selection=action.selection;
  else{
   const plan=z.object({parent_packet_id:held.uuid,stream:z.enum(['dpo','po']),record_ids:z.array(held.uuid).min(1).max(1000)}).strict()
    .parse(await ports.originalRpc('uc_frdo_read_correction_selection',{p_org:command.organization_id,p_scope:command.scope,p_plan:action.plan}));ensureCurrent(outer);
   selection=foundation.selectionSchema.parse({stream:plan.stream,record_ids:plan.record_ids,template:action.template});
  }
  const sources=inputEnvelope.parse(await ports.originalRpc('uc_frdo_read_inputs',{p_org:command.organization_id,p_scope:command.scope,p_selection:selection,p_issuer:action.issuer_review}));ensureCurrent(outer);
  if(sources.input.context.actor_id!==actor.actor||sources.input.context.organization_id!==command.organization_id||!same(sources.input.context.scope,command.scope)||!same(sources.input.context.template,selection.template)||sources.input.context.stream!==selection.stream||!same(sources.input.items.map(x=>x.record.official.id).sort(),[...selection.record_ids].sort()))refuse('SOURCE_CHANGED');
  const source_reads=await readExactSources(sources.source_descriptors,command.organization_id,outer);ensureCurrent(outer);
  if(action.issuer_review.regime!=='ordinary_rf')refuse('READINESS_BLOCKED');
  const issuer=source_reads.find(value=>same(value.source,action.issuer_review.evidence));if(!issuer)refuse('SOURCE_CHANGED');
  const captured=await captureReviewedPacket(sources.input,action.issuer_review,{source:issuer.source,byte_sha256:issuer.byte_sha256,byte_size:issuer.byte_size},outer);ensureCurrent(outer);
  const correction=action.kind==='create_correction'?action.plan:null,expected=await reviewedPreviewHash(captured.capture,action.issuer_review,correction,outer);ensureCurrent(outer);
  if(expected!==action.expected_preview_hash)refuse('SOURCE_CHANGED');
  const value=await verifyTrustedFreezeCurrent({schema_version:1,abi_revision:runtime.RUNTIME_ABI_REVISION,organization_id:command.organization_id,scope:command.scope,verified_actor_id:actor.actor,request_id:command.request_id,
   command_payload_sha256:beginning.payload_sha256,expected_preview_hash:expected,capture:captured.capture,correction,command,source_reads},outer);ensureCurrent(outer);
  await actor.refresh();const result=await ports.serviceRpc(action.kind==='freeze_preview'?'uc_frdo_commit_freeze':'uc_frdo_commit_correction',{p_value:value});ensureCurrent(outer);return receiptResult.parse(result);
 }
 async function evidenced(raw:unknown,outer:CurrentGuard){
  const command=runtime.mutationRequestSchema.parse(structuredClone(raw)),kind=command.action.kind;
  if(!['save_supplement','appoint_operator','revoke_operator','record_fis_upload','record_receipt'].includes(kind))refuse('INVALID_REQUEST');
  const actor=await actorGuard(outer),resolved=z.object({phase:z.enum(['pending','committed']),receipt:runtime.requestReceiptSchema.nullable(),source_descriptors:z.array(sourceDescriptorSchema).max(62000)}).strict()
   .parse(await ports.originalRpc('uc_frdo_action_sources',{p_command:command}));ensureCurrent(outer);
  if(resolved.phase==='committed')return {phase:'committed' as const,replayed:true,receipt:resolved.receipt};
  const source_reads=await readExactSources(resolved.source_descriptors,command.organization_id,outer);ensureCurrent(outer);
  await actor.refresh();const value={schema_version:1,abi_revision:runtime.RUNTIME_ABI_REVISION,verified_actor_id:actor.actor,command,command_payload_sha256:await sha256(canonicalJson(command)),source_reads};ensureCurrent(outer);
  const result=await ports.serviceRpc(kind==='save_supplement'?'uc_frdo_commit_supplement':'uc_frdo_commit_evidenced_action',{p_value:value});ensureCurrent(outer);return receiptResult.parse(result);
 }
 async function generate(raw:unknown,outer:CurrentGuard){
  const request=workerRequestSchema.parse(structuredClone(raw)),actor=await actorGuard(outer);
  const rawClaim=await ports.originalRpc('uc_frdo_claim_file',{p_request:request});ensureCurrent(outer);
  const replay=z.object({phase:z.literal('sealed'),artifact:held.artifactRefSchema}).strict().safeParse(rawClaim);if(replay.success)return {...replay.data,replayed:true};
  const claim=buildClaimSchema.parse(rawClaim);
  if(claim.actor_id!==actor.actor||claim.organization_id!==request.organization_id||claim.packet.id!==request.packet_id||claim.build_id!==request.build_id||claim.request_id!==request.request_id||claim.input_revision!==request.input_revision||claim.snapshot_sha256!==claim.packet.snapshot_sha256||claim.storage.path!==`${request.organization_id}/packets/${request.packet_id}/${request.build_id}/${claim.artifact_id}.xlsx`)refuse('SOURCE_CHANGED');
  const local:CurrentGuard={assertCurrent(){ensureCurrent(outer);if(ports.now()>=Date.parse(claim.lease_until))refuse('REVISION_CONFLICT');}};
  const check=async()=>{await actor.refresh();await ports.originalRpc('uc_frdo_assert_file_claim',{p_request:request,p_lease:claim.lease_id});ensureCurrent(local);};
  try{
   const capture=await verifyFrozenCapture(claim.capture,local);ensureCurrent(local);
   if(capture.snapshot_sha256!==claim.snapshot_sha256||capture.mapped_batch.context.organization_id!==claim.organization_id||!same(capture.mapped_batch.context.scope,claim.scope)||!same(capture.mapped_batch.context.template,claim.template))refuse('SOURCE_CHANGED');
   const donor=await ports.donor(capture.mapped_batch.context.stream);ensureCurrent(local);
   const output=await generateMappedOfficialWorkbook(capture.mapped_batch,donor,local,{xml:ports.xml});ensureCurrent(local);
   await check();
   const object=candidateObjectSchema.parse(await ports.uploadCandidate(Object.freeze(structuredClone(claim)),output.bytes,{build_id:claim.build_id,lease_id:claim.lease_id,request_id:claim.request_id,snapshot_sha256:claim.snapshot_sha256}));ensureCurrent(local);
   if(object.byte_size!==output.byte_size)refuse('SOURCE_CHANGED');
   await check();const saved=await ports.readCandidate(Object.freeze(structuredClone(claim)),local);ensureCurrent(local);
   if(!(saved instanceof Uint8Array)||saved.length!==output.byte_size)refuse('SOURCE_CHANGED');
   const verified=await verifyMappedOfficialWorkbook(capture.mapped_batch,donor,saved,local,{xml:ports.xml});ensureCurrent(local);
   if(verified.byte_sha256!==output.byte_sha256||verified.byte_size!==output.byte_size||!same(verified.parts,output.parts))refuse('SOURCE_CHANGED');
   await check();const value={...request,verified_actor_id:actor.actor,lease_id:claim.lease_id,snapshot_sha256:claim.snapshot_sha256,byte_sha256:output.byte_sha256,byte_size:output.byte_size,readback_sha256:verified.byte_sha256,template:claim.template,signing:output.signing,parts:verified.parts,object_id:object.object_id,object_updated_at:object.updated_at};
   const result=await ports.serviceRpc('uc_frdo_seal_file',{p_value:value});ensureCurrent(local);return result;
  }catch(error){
   // Failure reporting is best effort and still ORIGINAL JWT/CAS/lease scoped.
   // Never delete a historical object, broaden rights, auto requeue or hide error.
   try{await actor.refresh();await ports.originalRpc('uc_frdo_fail_file',{p_build:claim.build_id,p_lease:claim.lease_id,p_code:error instanceof PacketInvariantError&&error.code==='SOURCE_CHANGED'?'SOURCE_CHANGED':'FILE_GENERATION_FAILED'});}catch{/* Original failure remains authoritative. */}
   throw error;
  }
 }
 async function preview(raw:unknown,outer:CurrentGuard){
  const request=runtime.readRequestSchema.parse(structuredClone(raw)),query=request.query;if(query.kind!=='preview'&&query.kind!=='correction_preview')refuse('INVALID_REQUEST');
  const actor=await actorGuard(outer);let selection:z.infer<typeof foundation.selectionSchema>;const correction=query.kind==='correction_preview'?query.plan:null;
  if(query.kind==='preview')selection=query.selection;else{const plan=z.object({parent_packet_id:held.uuid,stream:z.enum(['dpo','po']),record_ids:z.array(held.uuid).min(1).max(1000)}).strict().parse(await ports.originalRpc('uc_frdo_read_correction_selection',{p_org:request.organization_id,p_scope:request.scope,p_plan:query.plan}));ensureCurrent(outer);selection=foundation.selectionSchema.parse({stream:plan.stream,record_ids:plan.record_ids,template:query.template});}
  const resolved=inputEnvelope.parse(await ports.originalRpc('uc_frdo_read_inputs',{p_org:request.organization_id,p_scope:request.scope,p_selection:selection,p_issuer:query.issuer_review,p_preview:true}));ensureCurrent(outer);
  if(resolved.input.context.actor_id!==actor.actor||resolved.input.context.organization_id!==request.organization_id||!same(resolved.input.context.scope,request.scope)||!same(resolved.input.items.map(value=>value.record.official.id).sort(),[...selection.record_ids].sort()))refuse('SOURCE_CHANGED');
  const batch=await mapFrozenProjections(withReviewedIssuerRegime(resolved.input,query.issuer_review),outer);ensureCurrent(outer);
  let preview_hash=await sha256(canonicalJson({batch,issuer_review:query.issuer_review,correction}));ensureCurrent(outer);let issuer_evidence:z.infer<typeof foundation.sourceProjectionSchema>={availability:'currently_unavailable',evidence:null};
  if(batch.ready&&query.issuer_review.regime==='ordinary_rf'){const reads=await readExactSources(resolved.source_descriptors,request.organization_id,outer);ensureCurrent(outer);const proof=reads.find(value=>same(value.source,query.issuer_review.evidence));if(!proof)refuse('SOURCE_CHANGED');const evidence={source:proof.source,byte_sha256:proof.byte_sha256,byte_size:proof.byte_size};const captured=await captureReviewedPacket(resolved.input,query.issuer_review,evidence,outer);ensureCurrent(outer);preview_hash=await reviewedPreviewHash(captured.capture,query.issuer_review,correction,outer);ensureCurrent(outer);issuer_evidence={availability:'available',evidence};}
  const value={schema_version:1 as const,abi_revision:runtime.RUNTIME_ABI_REVISION,organization_id:request.organization_id,scope:request.scope,actor_id:actor.actor,kind:'preview' as const,issuer_review:query.issuer_review,issuer_evidence,preview:{schema_version:1 as const,organization_id:request.organization_id,scope:request.scope,actor_id:actor.actor,as_of_date:batch.context.as_of_date,selection,correction,preview_hash,rows:batch.rows,ready:batch.ready,expires_at:new Date(ports.now()+300000).toISOString(),deadlines:batch.rows.map(row=>({row_key:row.row_key,deadline:projectPendingFrdoDeadline(row.stream,query.issuer_review.regime,resolved.input.items.find(item=>item.record.official.id===row.record.record_id)?.record.frdo_facts?.issue_date)}))}};
  await actor.refresh();
  const after=inputEnvelope.parse(await ports.originalRpc('uc_frdo_read_inputs',{p_org:request.organization_id,p_scope:request.scope,p_selection:selection,p_issuer:query.issuer_review,p_preview:true}));ensureCurrent(outer);if(!same(after,resolved))refuse('SOURCE_CHANGED');
  if(query.kind==='correction_preview'){const parent=z.object({parent_packet_id:held.uuid,stream:z.enum(['dpo','po']),record_ids:z.array(held.uuid).min(1).max(1000)}).strict().parse(await ports.originalRpc('uc_frdo_read_correction_selection',{p_org:request.organization_id,p_scope:request.scope,p_plan:query.plan}));ensureCurrent(outer);if(parent.stream!==selection.stream||!same([...parent.record_ids].sort(),[...selection.record_ids].sort()))refuse('SOURCE_CHANGED');}
  ensureCurrent(outer);return runtime.readResultSchema.parse(value);
 }
 return Object.freeze({freeze,evidenced,generate,preview});
}
