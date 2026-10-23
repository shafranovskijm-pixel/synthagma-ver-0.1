import {z} from 'zod';
import * as held from './contract';
import * as foundation from '../frdoFoundation/contract';
import {canonicalJson} from '../frdoFoundation/hash';
import {issuerReviewIntentSchema,issuerReviewProjectionSchema,unconfirmedIssuerReview} from './issuerReview';

/** First persisted runtime evolves the source-only V4 wire explicitly. The inner
 * V4 capture/J hash domain is preserved; V5 adds a real per-packet issuer review.
 * Neither parsing nor a private source reference authenticates a user/service. */
export const RUNTIME_ABI_REVISION='uc020-persisted-v5' as const;
const abi=z.literal(RUNTIME_ABI_REVISION),time=z.string().max(64).datetime({offset:true});
const opaqueCursor=z.string().min(67).max(8195).regex(/^v1\.[a-f0-9]+$/).nullable();
const [saveSupplement,freezePreview,generateFile,registerPacket,adminHandover,fisUpload,receipt,correction,appointOperator,revokeOperator]=held.actionSchema.options;
const [previewQuery,correctionQuery,packetQuery,packetsQuery,historyQuery,artifactsQuery,correctionsQuery,receiptQuery,supplementQuery,authoritiesQuery,downloadQuery]=held.querySchema.options;
export const actionSchema=z.discriminatedUnion('kind',[
 saveSupplement,freezePreview.extend({issuer_review:issuerReviewIntentSchema}),generateFile,registerPacket,adminHandover,fisUpload,receipt,
 correction.extend({issuer_review:issuerReviewIntentSchema}),appointOperator,revokeOperator,
 z.object({kind:z.literal('abandon_correction'),packet:held.packetRefSchema,reason:z.string().min(1).max(4000).refine(value=>value.trim().length>0)}).strict(),
]);
export const querySchema=z.discriminatedUnion('kind',[
 previewQuery.extend({issuer_review:issuerReviewIntentSchema.default(unconfirmedIssuerReview)}),
 correctionQuery.extend({issuer_review:issuerReviewIntentSchema.default(unconfirmedIssuerReview)}),
 packetQuery,packetsQuery.omit({after_id:true}).extend({after_cursor:opaqueCursor}).strict(),historyQuery,artifactsQuery,correctionsQuery.omit({after_id:true}).extend({after_cursor:opaqueCursor}).strict(),receiptQuery,supplementQuery,authoritiesQuery,downloadQuery,
]);
export const mutationRequestSchema=held.mutationRequestSchema.omit({abi_revision:true,action:true}).extend({abi_revision:abi,action:actionSchema}).strict();
export const readRequestSchema=held.readRequestSchema.omit({abi_revision:true,query:true}).extend({abi_revision:abi,query:querySchema}).strict();
export const jobStateSchema=z.enum([...foundation.jobStateSchema.options,'correction_abandoned']);
export const requestReceiptSchema=held.requestReceiptSchema.extend({action_kind:z.enum([...held.requestReceiptSchema.shape.action_kind.options,'abandon_correction'])}).strict();
export const packetSummarySchema=held.packetSummarySchema.extend({state:jobStateSchema}).strict();
export const packetProjectionSchema=held.packetProjectionSchema.extend({state:jobStateSchema,issuer_review:issuerReviewProjectionSchema,capabilities:held.capabilitiesSchema.extend({can_abandon_correction:z.boolean()}).strict()}).strict();
const operationProjectionSchema=foundation.externalOperationSchema.omit({evidence:true}).extend({evidence:foundation.sourceProjectionSchema}).strict();
export const packetEventSchema=z.discriminatedUnion('kind',[
 z.object({id:held.uuid,revision:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),actor_id:held.uuid.nullable(),recorded_at:time,previous_state_hash:held.sha.nullable(),state_hash:held.sha,payload_sha256:held.sha,kind:z.literal('correction_abandoned'),parent_packet_id:held.uuid,reason:z.string().min(1).max(4000),external_operation_verified:z.literal(false)}).strict(),
 ...held.packetEventSchema.options.map(schema=>schema.shape.kind.value==='fis_upload'?schema.extend({external_operations:z.array(operationProjectionSchema).max(1000)}):schema),
]);
export const mutationResultSchema=held.mutationResultSchema.omit({abi_revision:true,packets:true}).extend({abi_revision:abi,packets:z.array(packetProjectionSchema).max(2),receipt:requestReceiptSchema}).strict();
const [previewRead,packetRead,packetsRead,historyRead,artifactsRead,correctionsRead,receiptRead,supplementRead,authoritiesRead,downloadRead]=held.readResultSchema.options;
const currentAbi=<Shape extends z.ZodRawShape>(schema:z.ZodObject<Shape,'strict'>)=>schema.extend({abi_revision:abi});
export const readResultSchema=z.discriminatedUnion('kind',[
 currentAbi(previewRead).extend({issuer_review:issuerReviewIntentSchema,issuer_evidence:foundation.sourceProjectionSchema}),
 currentAbi(packetRead).extend({packet:packetProjectionSchema}),currentAbi(packetsRead.omit({next_after_id:true})).extend({packets:z.array(packetSummarySchema).max(50),next_cursor:opaqueCursor}),currentAbi(historyRead).extend({events:z.array(packetEventSchema).max(50)}),currentAbi(artifactsRead),currentAbi(correctionsRead.omit({next_after_id:true})).extend({packets:z.array(packetSummarySchema).max(50),next_cursor:opaqueCursor}),currentAbi(receiptRead),currentAbi(supplementRead),currentAbi(authoritiesRead),currentAbi(downloadRead),
]);

/** Metadata witness accompanying bytes read/hashed by a CLOSED trusted resolver.
 * It binds an actual version/object identity and update epoch, not a caller URL. */
export const sourceReadSchema=z.object({source:foundation.sourceRefSchema,byte_sha256:held.sha,
 byte_size:z.number().int().min(1).max(20971520),object_id:held.uuid,updated_at:time}).strict();
export const trustedFreezeCurrentSchema=held.trustedFreezeSchema.omit({abi_revision:true}).extend({abi_revision:abi,
 command:mutationRequestSchema,source_reads:z.array(sourceReadSchema).min(1).max(62000),
}).strict().superRefine((value,context)=>{
 const action=value.command.action;
 if(!['freeze_preview','create_correction'].includes(action.kind)){context.addIssue({code:'custom',message:'Only an exact pending freeze/correction intent is accepted'});return;}
 if(action.kind!=='freeze_preview'&&action.kind!=='create_correction')return;
 if(value.command.organization_id!==value.organization_id||canonicalJson(value.command.scope)!==canonicalJson(value.scope)||value.command.request_id!==value.request_id||action.expected_preview_hash!==value.expected_preview_hash||action.issuer_review.regime!=='ordinary_rf'||value.capture.mapped_batch.context.actor_id!==value.verified_actor_id||value.capture.mapped_batch.context.issuer_regime!==action.issuer_review.regime)context.addIssue({code:'custom',message:'Original intent/actor/context differs'});
 if(value.capture.mapped_batch.context.organization_id!==value.organization_id||value.capture.source_cas.organization_id!==value.organization_id||canonicalJson(value.capture.mapped_batch.context.scope)!==canonicalJson(value.scope)||canonicalJson(value.capture.source_cas.scope)!==canonicalJson(value.scope))context.addIssue({code:'custom',message:'Captured organization/scope differs'});
 if(action.kind==='freeze_preview'&&(action.selection.stream!==value.capture.mapped_batch.context.stream||canonicalJson(action.selection.template)!==canonicalJson(value.capture.mapped_batch.context.template)||canonicalJson([...action.selection.record_ids].sort())!==canonicalJson(value.capture.source_cas.records.map(entry=>entry.record.record_id).sort())))context.addIssue({code:'custom',message:'Selected exact record set/template differs'});
 if(action.kind==='create_correction'&&canonicalJson(action.template)!==canonicalJson(value.capture.mapped_batch.context.template))context.addIssue({code:'custom',message:'Correction template differs'});
 const bySource=new Map(value.source_reads.map(read=>[canonicalJson(read.source),read]));
 if(bySource.size!==value.source_reads.length||bySource.size!==value.capture.source_cas.sources.length||new Set(value.capture.source_cas.sources.map(source=>canonicalJson(source.source))).size!==value.capture.source_cas.sources.length)context.addIssue({code:'custom',message:'Exact required source witness set differs'});
 for(const source of value.capture.source_cas.sources){const read=bySource.get(canonicalJson(source.source));if(!read||source.byte_sha256!==read.byte_sha256||source.byte_size!==read.byte_size)context.addIssue({code:'custom',message:'Exact byte witness differs'});}
 if(action.issuer_review.regime==='ordinary_rf'&&!bySource.has(canonicalJson(action.issuer_review.evidence)))context.addIssue({code:'custom',message:'Issuer review evidence missing'});
 if((action.kind==='create_correction')!==(value.correction!==null)||action.kind==='create_correction'&&canonicalJson(action.plan)!==canonicalJson(value.correction))context.addIssue({code:'custom',message:'Correction lineage differs'});
});
