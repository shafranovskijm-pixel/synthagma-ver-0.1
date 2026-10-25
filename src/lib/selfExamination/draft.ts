import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { validateSelfExaminationDraft, type SelfExaminationDraftInput, type SelfExaminationSource } from '../../../supabase/functions/_shared/self-examination-workflow-contract.ts';
export type { SelfExaminationDraftInput, SelfExaminationSource, SelfExaminationNumber } from '../../../supabase/functions/_shared/self-examination-workflow-contract.ts';
type Validated<T> = T extends (infer Item)[] ? Validated<Item>[] : T extends object ? { [Key in keyof T]-?: Validated<T[Key]> } : T;
const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const positive = z.number().int().safe().positive();
const nullableText = z.string().nullable();
export const selfExaminationSourceSchema = z.object({ kind: z.literal('org_document_version'), document_id: uuid, version_id: uuid, content_hash: hash }).strict();
const factSchema = z.object({ fact_key: z.string().min(1).max(220), state: z.enum(['unknown','entered','confirmed','not_applicable']), value: z.unknown(), value_hash: hash, required: z.boolean(), source_current: z.boolean(), source: selfExaminationSourceSchema.nullable(), location: nullableText, review_note: nullableText, confirmed_by: uuid.nullable(), confirmed_at: nullableText }).strict();
const artifactSchema = z.object({ generation_id: uuid, source: selfExaminationSourceSchema, fact_hash: hash, byte_sha256: hash, recorded_by: uuid, recorded_at: z.string(), status: z.literal('operator_recorded_draft') }).strict();
const finalSchema = z.object({ fact_hash: hash, source: selfExaminationSourceSchema, source_proof_hash: hash, review_id: uuid, approval_number: z.string(), approval_date: z.string(), approved_by: uuid, verification_note: z.string(), recorded_by: uuid, recorded_at: z.string(), scope: z.string() }).strict();
const publicationSchema = z.object({ fact_hash: hash, final_source: selfExaminationSourceSchema, public_url: z.string().url(), declaration: z.string(), declared_by: uuid, declared_at: z.string(), state: z.literal('declared_by_centre_not_independently_verified') }).strict();
export const selfExaminationDraftSchema = z.object({ schema_version: z.literal(1), id: uuid, organization_id: uuid, reporting_year: z.number().int(), revision: positive, body: z.unknown().transform(value => validateSelfExaminationDraft(value)), fact_hash: hash, facts: z.array(factSchema).max(500), missing_fact_keys: z.array(z.string()).max(500), latest_artifact: artifactSchema.nullable(), artifact_current: z.boolean(), centre_final: finalSchema.nullable(), centre_final_current: z.boolean(), publication: publicationSchema.nullable(), status: z.enum(['draft','centre_review_required','centre_final_recorded','publication_declared_by_centre']), can_write: z.boolean(), service_price: z.object({ amount_rub: z.literal(3500), label: z.literal('3 500 ₽'), decision: z.literal('user20261023') }).strict(), service_order_state: z.literal('separate_existing_order_flow'), updated_at: z.string() }).strict();
export type SelfExaminationDraft = Validated<z.infer<typeof selfExaminationDraftSchema>>;
export type SelfExaminationFact = SelfExaminationDraft['facts'][number];
export type SelfExaminationAction =
 | {kind:'save';body:SelfExaminationDraftInput}
 | {kind:'review_fact';fact_key:string;expected_value_hash:string;state:'confirmed'|'not_applicable';source:SelfExaminationSource;location:string;review_note:string}
 | {kind:'clear_review';fact_key:string}
 | {kind:'record_centre_final';expected_fact_hash:string;source:SelfExaminationSource;review_id:string;verification_note:string}
 | {kind:'record_publication';expected_fact_hash:string;public_url:string;declaration:string};
const receiptSchema=z.object({event_id:uuid,draft_id:uuid,organization_id:uuid,reporting_year:z.number().int(),revision:positive,action:z.string(),actor_id:uuid,request_id:uuid,payload_sha256:hash}).strict();
const mutationSchema=z.object({schema_version:z.literal(1),request_id:uuid,replayed:z.boolean(),receipt:receiptSchema,generation_capture:z.unknown().optional(),draft:selfExaminationDraftSchema}).strict();
export async function readSelfExaminationDraft(organizationId:string,reportingYear:number):Promise<SelfExaminationDraft|null>{
 const result=await(supabase.rpc as any)('read_self_examination_draft',{p_organization_id:organizationId,p_reporting_year:reportingYear});
 if(result.error)throw result.error;
 const envelope=z.object({schema_version:z.literal(1),organization_id:uuid,reporting_year:z.number().int(),catalog:z.unknown(),draft:selfExaminationDraftSchema.nullable()}).strict().parse(result.data);
 if(envelope.organization_id!==organizationId||envelope.reporting_year!==reportingYear||envelope.draft&&(envelope.draft.organization_id!==organizationId||envelope.draft.reporting_year!==reportingYear))throw Error('SELF_EXAMINATION_SCOPE_CHANGED');
 return envelope.draft as SelfExaminationDraft|null;
}
export async function mutateSelfExaminationDraft(organizationId:string,reportingYear:number,revision:number,requestId:string,action:SelfExaminationAction){
 const result=await(supabase.rpc as any)('apply_self_examination_draft',{p_organization_id:organizationId,p_reporting_year:reportingYear,p_expected_revision:revision,p_request_id:requestId,p_action:action});
 if(result.error)throw result.error;const parsed=mutationSchema.parse(result.data) as Validated<z.infer<typeof mutationSchema>>;
 if(parsed.request_id!==requestId||parsed.receipt.request_id!==requestId||parsed.receipt.organization_id!==organizationId||parsed.receipt.reporting_year!==reportingYear||parsed.receipt.action!==action.kind||parsed.draft.organization_id!==organizationId||parsed.draft.reporting_year!==reportingYear||parsed.receipt.draft_id!==parsed.draft.id)throw Error('SELF_EXAMINATION_SCOPE_CHANGED');return parsed;
}

const historyEventSchema=z.object({id:uuid,revision:positive,actor_id:uuid,action:z.string().max(64),recorded_at:z.string(),snapshot:z.object({body:z.unknown().transform(value=>validateSelfExaminationDraft(value))}).passthrough(),receipt:receiptSchema}).strict();
export async function readSelfExaminationHistory(organizationId:string,year:number,before:number|null=null){
 const result=await(supabase.rpc as any)('read_self_examination_history',{p_organization_id:organizationId,p_reporting_year:year,p_before_revision:before,p_limit:25});if(result.error)throw result.error;
 const parsed=z.object({schema_version:z.literal(1),organization_id:uuid,draft_id:uuid,reporting_year:z.number().int(),history:z.array(historyEventSchema).max(25),next_before_revision:positive.nullable()}).strict().parse(result.data);
 if(parsed.organization_id!==organizationId||parsed.reporting_year!==year||parsed.history.some(row=>row.receipt.organization_id!==organizationId||row.receipt.reporting_year!==year||row.receipt.draft_id!==parsed.draft_id||row.receipt.event_id!==row.id||row.receipt.revision!==row.revision||row.snapshot.body.reporting_year!==year))throw Error('SELF_EXAMINATION_SCOPE_CHANGED');return parsed;
}
