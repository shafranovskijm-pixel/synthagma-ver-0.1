import { z } from 'zod';
import { programmeRefSchema, orderProgrammeFacts, orderDatesSchema, orderArtifactImmutableSchema, orderRegistryRefSchema, recordedOrderDecisionSchema } from '@/lib/individualEducationOrders/contract';
import { registrySourceSchema } from '@/lib/documentRegistry/contract';
import { admissionRequirementSchema, admissionEvidenceSchema, admissionTaskSchema, admissionCapabilitiesSchema, admissionLocalActRefSchema, admissionLocalRequirementInputSchema, admissionCandidateSchema, admissionEvidenceSourceSchema, admissionPreparationSchema, admissionEventPayloadSchema, admissionResponsibleOptionSchema, admissionLocalActOptionSchema } from '@/lib/admissionCases/contract';
import { admissionIssuanceConditionSchema, admissionIssuanceEvidenceSchema, admissionIssuanceReviewSnapshotSchema } from '@/lib/admissionCases/issuanceCondition';
import { issuanceIdentityRefSchema, issuanceSealedEvidenceRefSchema, issuanceFinalEducationProofSchema, issuanceBlockerSchema, issuanceTemplateRefSchema, issuanceArtifactFinalRefSchema, issuancePreparationItemSchema, issuancePreparationSummarySchema, issuanceRecordSchema, issuanceErrorSchema } from '@/lib/educationIssuance/contract';

// W2 V1 + exact R2/R3 deltas. Old grouped schemas remain unchanged.
export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const rev0 = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const rev = rev0.refine(value => value > 0);
const text = (max: number) => z.string().max(max).refine(value => value.trim() === value && value.length > 0 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value));
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===value;});
export const utc = z.string().max(64).datetime({offset:true}).refine(value => /(?:Z|\+00:00)$/.test(value));
const ids = (min=0,max=100) => z.array(uuid).min(min).max(max).refine(values => new Set(values).size===values.length);
export const same = (a: unknown,b: unknown): boolean => a===b || a!==null && b!==null && typeof a==='object' && typeof b==='object' && Object.keys(a).length===Object.keys(b).length && Object.keys(a).every(key => Object.prototype.hasOwnProperty.call(b,key) && same((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]));
export const individualScopeSchema=z.object({kind:z.literal('individual_w1'),version:z.literal(1),organization_id:uuid,enrollment_id:uuid,user_id:uuid,course_id:uuid,group_id:z.null()}).strict();
export const eventRefSchema=z.object({id:uuid,revision:rev,payload_sha256:sha}).strict();
export const registeredOrderWitnessSchema=z.object({order_id:uuid,order_revision:rev,approved_order_revision:rev,approved_order_sha256:sha,decision_event:eventRefSchema,registration_event:eventRefSchema,registry:orderRegistryRefSchema,artifact:orderArtifactImmutableSchema,dates:orderDatesSchema}).strict().superRefine((value,ctx)=>{
  if(value.decision_event.revision!==value.approved_order_revision || value.registration_event.revision<=value.decision_event.revision || value.registration_event.revision>value.order_revision || !same(value.registry.source,value.artifact.source))ctx.addIssue({code:'custom',message:'Unconfirmed actual W1 private events/source'});
});
export const admissionBindingSchema=z.object({kind:z.literal('individual_w1_admission'),version:z.literal(1),scope:individualScopeSchema,programme:programmeRefSchema,programme_facts:orderProgrammeFacts,admission_order:registeredOrderWitnessSchema,source_hash:sha}).strict();
export const admissionDecisionSchema=z.object({event_id:uuid,case_revision:rev,outcome:z.enum(['needs_information','admitted','not_admitted']),recorded_at:utc,responsible_id:uuid.nullable(),reason:text(4000),program_ref:programmeRefSchema,rule_set_id:uuid,requirements_digest:sha,evidence_version_ids:ids(),authority_snapshot_hash:sha,later_review_required:z.boolean()}).strict();
export const protocolFactsReviewSchema=z.object({id:uuid,case_revision:rev,actor_user_id:uuid,recorded_at:utc,completion_order_id:uuid,completion_decision_event_id:uuid,protocol_source:registrySourceSchema,protocol_review_id:uuid,protocol_review_revision:rev0,protocol_number:text(120),protocol_date:date,subject_and_programme_checked:z.literal(true),required_practice_checked:z.literal(true),attestation_criteria_checked:z.literal(true),actual_outcome:z.literal('passed'),grounds:text(2000),review_sha256:sha}).strict();
export const admissionStateSchema=z.object({id:uuid,scope:individualScopeSchema,revision:rev,program_ref:programmeRefSchema,program_title:text(4000),program_type:z.enum(['professional_training','dpo_upskilling','dpo_retraining']),responsible_id:uuid.nullable(),rule_set_id:uuid.nullable(),requirements:z.array(admissionRequirementSchema).max(50),evidence:z.array(admissionEvidenceSchema).max(100),tasks:z.array(admissionTaskSchema).max(50),decision:admissionDecisionSchema.nullable(),blockers:z.array(issuanceBlockerSchema).max(30),capabilities:admissionCapabilitiesSchema,rule_set_digest:sha.nullable(),requirements_digest:sha,issuance_reviews:z.array(admissionIssuanceReviewSnapshotSchema).max(50),issuance_conditions:z.array(z.object({requirement_id:uuid,requirement_revision:rev,condition:admissionIssuanceConditionSchema}).strict()).max(50),binding:admissionBindingSchema}).strict().superRefine((value,ctx)=>{
  if(!same(value.scope,value.binding.scope)||!same(value.program_ref,value.binding.programme)||value.program_type!==value.binding.programme_facts.program_type||value.decision&&!same(value.decision.program_ref,value.program_ref)||value.evidence.some(e=>e.case_id!==value.id)||new Set(value.requirements.map(r=>r.id)).size!==value.requirements.length||new Set(value.evidence.map(e=>e.id)).size!==value.evidence.length)ctx.addIssue({code:'custom',message:'Unconfirmed exact individual admission case'});
});
export const admissionRefSchema=z.object({kind:z.literal('individual_w1_admission_review'),version:z.literal(1),case_id:uuid,scope:individualScopeSchema,revision:rev,decision_event_id:uuid,decision_case_revision:rev,program_ref:programmeRefSchema,rule_set_id:uuid,rule_set_digest:sha,requirements_digest:sha,evidence_refs:z.array(issuanceSealedEvidenceRefSchema).max(100),final_education_proof:issuanceFinalEducationProofSchema.nullable(),source_hash:sha}).strict();
export const finalProtocolWitnessSchema=z.object({source:registrySourceSchema,review_id:uuid,review_revision:rev0,review_sha256:sha,provision:text(2000),facts_review:protocolFactsReviewSchema}).strict().superRefine((value,ctx)=>{if(!same(value.source,value.facts_review.protocol_source)||value.review_id!==value.facts_review.protocol_review_id||value.review_revision!==value.facts_review.protocol_review_revision)ctx.addIssue({code:'custom',message:'Unconfirmed exact protocol review source'});});
export const individualEligibilitySchema=z.object({kind:z.literal('individual_w1'),version:z.literal(1),scope:individualScopeSchema,programme:programmeRefSchema,programme_facts:orderProgrammeFacts,admission_order:registeredOrderWitnessSchema,admission_review:admissionRefSchema,completion_order:registeredOrderWitnessSchema,completion_decision:recordedOrderDecisionSchema,final_protocol:finalProtocolWitnessSchema,identity_ref:issuanceIdentityRefSchema,withdrawal_revision:rev0,source_hash:sha}).strict().superRefine((value,ctx)=>{
 const complete=value.completion_decision,review=value.final_protocol.facts_review; const dpo=['dpo_upskilling','dpo_retraining'].includes(value.programme_facts.program_type||'');
 if(!same(value.scope,value.admission_review.scope)||!same(value.programme,value.admission_review.program_ref)||value.identity_ref.user_id!==value.scope.user_id||value.admission_order.order_id===value.completion_order.order_id||complete.kind!=='complete'||complete.event_id!==value.completion_order.decision_event.id||complete.payload_sha256!==value.completion_order.decision_event.payload_sha256||complete.decision.kind!=='complete'||!same(complete.decision.final_protocol_source,value.final_protocol.source)||review.completion_order_id!==value.completion_order.order_id||review.completion_decision_event_id!==complete.event_id||dpo&&!value.admission_review.final_education_proof)ctx.addIssue({code:'custom',message:'Unconfirmed individual qualification source'});
});
const oldEventPayload=admissionEventPayloadSchema.omit({program_ref:true,decision:true}).extend({program_ref:programmeRefSchema,decision:admissionDecisionSchema.nullable()}).strict();
const eventBase={id:uuid,case_id:uuid,case_revision:rev,recorded_at:utc,actor_id:uuid.nullable()};
export const caseEventSchema=z.union([
 z.object({...eventBase,kind:z.enum(['initialize','assign_responsible','review_local_rules','review_requirement','review_evidence','record_decision','evidence_committed']),payload:oldEventPayload}).strict(),
 z.object({...eventBase,kind:z.literal('review_protocol_facts'),payload:protocolFactsReviewSchema.nullable()}).strict().superRefine((value,ctx)=>{const p=value.payload;if(p?value.actor_id===null||p.id!==value.id||p.case_revision!==value.case_revision||p.actor_user_id!==value.actor_id||p.recorded_at!==value.recorded_at:value.actor_id!==null)ctx.addIssue({code:'custom',message:'Unconfirmed protocol chronology/redaction'});}),
]);
export const contextSchema=z.object({w1_binding:admissionBindingSchema.nullable(),admission_case:admissionStateSchema.nullable(),completion_order:registeredOrderWitnessSchema.nullable(),protocol_review:protocolFactsReviewSchema.nullable(),eligibility_ref:individualEligibilitySchema.nullable(),existing_original_record_id:uuid.nullable(),blockers:z.array(issuanceBlockerSchema).max(30),capabilities:z.object({can_read:z.boolean(),can_review_admission:z.boolean(),can_prepare_evidence:z.boolean(),can_prepare_artifact:z.boolean(),can_issue:z.boolean(),can_open_evidence:z.boolean()}).strict()}).strict().superRefine((value,ctx)=>{
 if((value.eligibility_ref!==null)!==(value.blockers.length===0)||value.admission_case&&(!value.w1_binding||!same(value.admission_case.binding,value.w1_binding))||value.eligibility_ref&&(!value.protocol_review||!same(value.protocol_review,value.eligibility_ref.final_protocol.facts_review)))ctx.addIssue({code:'custom',message:'Unconfirmed eligibility/current review'});
});
export const issueIntentSchema=z.object({course_id:uuid,enrollment_ids:z.tuple([uuid]),issue_date:date,document_series:z.string().max(120).nullable()}).strict();
export const originalPlanSchema=z.object({kind:z.literal('original'),intent:issueIntentSchema,preview_hash:sha,items:z.tuple([z.object({enrollment_id:uuid,expected_eligibility_ref:individualEligibilitySchema}).strict()]),template:issuanceTemplateRefSchema,reason:text(2000)}).strict();
export const preparationItemSchema=issuancePreparationItemSchema.innerType().omit({group_id:true}).extend({source_kind:z.literal('individual_w1'),group_id:z.null()}).strict().superRefine((value,ctx)=>{
 if((value.status==='consumed')!==(value.final_record_id!==null)||value.status==='prepared'&&value.artifact!==null||['rendered_unissued','approved_unissued','consumed'].includes(value.status)&&value.artifact===null||value.status==='approved_unissued'&&!value.artifact?.output_review||value.status==='rendered_unissued'&&value.artifact?.output_review||value.artifact&&value.artifact.render_input_hash!==value.render_input_hash)ctx.addIssue({code:'custom',message:'Unconfirmed canonical item stage'});
});
export const preparationSchema=z.object({id:uuid,organization_id:uuid,scope:z.object({kind:z.literal('organization')}).strict(),source_kind:z.literal('individual_w1'),kind:z.literal('original'),created_at:utc,created_by:uuid,intent_hash:sha,plan:originalPlanSchema,template:issuanceTemplateRefSchema,items:z.tuple([preparationItemSchema])}).strict().superRefine((value,ctx)=>{
 const i=value.items[0],p=value.plan,e=p.items[0].expected_eligibility_ref;
 if(!same(value.template,p.template)||p.intent.enrollment_ids[0]!==i.enrollment_id||p.items[0].enrollment_id!==i.enrollment_id||e.scope.organization_id!==value.organization_id||e.scope.enrollment_id!==i.enrollment_id||e.scope.user_id!==i.user_id||e.scope.course_id!==i.course_id||p.intent.course_id!==i.course_id||p.intent.issue_date!==i.number_plan.issue_date||p.intent.document_series!==i.number_plan.document_series)ctx.addIssue({code:'custom',message:'Unconfirmed actual preparation item/intent'});
});
export const recordSchema=issuanceRecordSchema.innerType().omit({proof:true}).extend({proof:individualEligibilitySchema.nullable()}).strict().superRefine((value,ctx)=>{
 const p=value.proof,o=value.official;
 if((p!==null)!==(value.proof_availability==='captured')||(value.provenance==='legacy_unverified')!==(value.proof_availability==='legacy_unverified')||p&&(p.scope.organization_id!==o.organization_id||p.scope.enrollment_id!==o.enrollment_id||p.scope.user_id!==o.user_id||p.scope.course_id!==o.course_id||o.group_id!==null)||(value.lifecycle==='annulled')!==(value.annulment!==null))ctx.addIssue({code:'custom',message:'Unconfirmed actual individual issued record'});
});
const caseCommon={case_id:uuid,expected_revision:rev,expected_program_ref:programmeRefSchema};
export const admissionCommandSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('assign_responsible'),...caseCommon,responsible_id:uuid,reason:text(4000)}).strict(),
 z.object({action:z.literal('review_local_rules'),...caseCommon,sources:z.array(admissionLocalActRefSchema).min(1).max(3),requirements:z.array(admissionLocalRequirementInputSchema).min(3).max(50),review_reason:text(4000)}).strict(),
 z.object({action:z.literal('review_requirement'),...caseCommon,requirement_id:uuid,expected_requirement_revision:rev,applicability:z.enum(['applicable','not_applicable','unknown']),evidence_version_ids:ids(),reason:text(4000),issuance_evidence:admissionIssuanceEvidenceSchema.nullable().optional(),exception:z.object({rule_id:uuid,reason:text(4000),evidence_version_ids:ids(1)}).strict().nullable()}).strict(),
 z.object({action:z.literal('review_evidence'),...caseCommon,requirement_id:uuid,expected_requirement_revision:rev,evidence_version_id:uuid,byte_sha256:sha,outcome:z.enum(['accepted','rejected']),reason:text(4000)}).strict(),
 z.object({action:z.literal('record_decision'),...caseCommon,rule_set_id:uuid,rule_set_digest:sha,requirements_digest:sha,evidence_version_ids:ids(),outcome:z.enum(['needs_information','admitted','not_admitted']),reason:text(4000)}).strict(),
]).superRefine((value,ctx)=>{if(value.action==='review_local_rules'&&(new Set(value.sources.map(s=>s.document_id)).size!==value.sources.length||new Set(value.requirements.map(r=>r.key)).size!==value.requirements.length||['education_basis','application','contract_or_funding'].some(k=>!value.requirements.some(r=>r.kind===k))||value.requirements.some(r=>r.source_version_ids.some(id=>!value.sources.some(s=>s.version_id===id)))))ctx.addIssue({code:'custom',message:'Exact reviewed admission rules required'});});
export const commandSchema=z.discriminatedUnion('action',[
 z.object({schema_version:z.literal(2),action:z.literal('initialize_admission'),expected_case_revision:z.literal(0),binding:admissionBindingSchema}).strict(),
 z.object({schema_version:z.literal(2),action:z.literal('apply_admission_review'),binding:admissionBindingSchema,command:admissionCommandSchema}).strict(),
 z.object({schema_version:z.literal(2),action:z.literal('prepare_evidence'),case_id:uuid,expected_case_revision:rev,binding:admissionBindingSchema,source:admissionEvidenceSourceSchema}).strict(),
 z.object({schema_version:z.literal(2),action:z.literal('review_protocol_facts'),case_id:uuid,expected_case_revision:rev,binding:admissionBindingSchema,completion_order:registeredOrderWitnessSchema,protocol_source:registrySourceSchema,protocol_review_id:uuid,protocol_review_revision:rev0,protocol_number:text(120),protocol_date:date,subject_and_programme_checked:z.literal(true),required_practice_checked:z.literal(true),attestation_criteria_checked:z.literal(true),actual_outcome:z.literal('passed'),grounds:text(2000)}).strict(),
 z.object({schema_version:z.literal(2),action:z.literal('prepare_artifact'),plan:originalPlanSchema}).strict(),
 z.object({schema_version:z.literal(2),action:z.literal('issue'),intent:issueIntentSchema,preview_hash:sha,preparation_id:uuid,item_id:uuid,expected_eligibility_ref:individualEligibilitySchema,artifact:issuanceArtifactFinalRefSchema,reason:text(2000)}).strict(),
]);
const page={after_id:uuid.nullable(),limit:z.number().int().min(1).max(50)};
export const querySchema=z.discriminatedUnion('kind',[
 z.object({schema_version:z.literal(2),kind:z.literal('context')}).strict(),
 z.object({schema_version:z.literal(2),kind:z.literal('admission_options'),case_id:uuid,option_kind:z.enum(['responsibles','local_acts']),...page}).strict(),
 z.object({schema_version:z.literal(2),kind:z.literal('evidence_candidates'),case_id:uuid,source_kind:z.enum(['identity_document','enrollment_document']),...page}).strict(),
 z.object({schema_version:z.literal(2),kind:z.literal('case_history'),case_id:uuid,ceiling_revision:rev.nullable(),before_revision:rev.nullable(),limit:page.limit}).strict(),
 z.object({schema_version:z.literal(2),kind:z.literal('preparations'),...page}).strict(),
 z.object({schema_version:z.literal(2),kind:z.literal('preparation'),preparation_id:uuid}).strict(),
 z.object({schema_version:z.literal(2),kind:z.literal('preview_issue'),intent:issueIntentSchema}).strict(),
 z.object({schema_version:z.literal(2),kind:z.literal('record'),record_id:uuid}).strict(),
]);
const envelope={schema_version:z.literal(2),ok:z.literal(true),organization_id:uuid,enrollment_id:uuid,user_id:uuid,course_id:uuid,actor_user_id:uuid};
const previewFields=z.object({intent:issueIntentSchema,preview_hash:sha,ready:z.boolean(),candidate:z.object({enrollment_id:uuid,user_id:uuid,course_id:uuid,group_id:z.null(),document_type:z.enum(['certificate','diploma','qualification']).nullable(),eligibility_ref:individualEligibilitySchema.nullable(),existing_original_record_id:uuid.nullable(),blockers:z.array(issuanceBlockerSchema).max(30)}).strict()}).strict();
export const previewSchema=previewFields.refine(v=>v.ready===(v.candidate.eligibility_ref!==null&&v.candidate.blockers.length===0));
export const readResultSchema=z.union([
 z.object({...envelope,kind:z.literal('context'),context:contextSchema}).strict(),
 z.object({...envelope,kind:z.literal('admission_options'),case_id:uuid,case_revision:rev,option_kind:z.literal('responsibles'),items:z.array(admissionResponsibleOptionSchema).max(50),next_after_id:uuid.nullable()}).strict(),
 z.object({...envelope,kind:z.literal('admission_options'),case_id:uuid,case_revision:rev,option_kind:z.literal('local_acts'),items:z.array(admissionLocalActOptionSchema).max(50),next_after_id:uuid.nullable()}).strict(),
 z.object({...envelope,kind:z.literal('evidence_candidates'),case_id:uuid,case_revision:rev,source_kind:z.enum(['identity_document','enrollment_document']),items:z.array(admissionCandidateSchema).max(50),next_after_id:uuid.nullable()}).strict(),
 z.object({...envelope,kind:z.literal('case_history'),case_id:uuid,ceiling_revision:rev,items:z.array(caseEventSchema).max(50),next_before_revision:rev.nullable()}).strict(),
 z.object({...envelope,kind:z.literal('preparations'),items:z.array(issuancePreparationSummarySchema).max(50),next_after_id:uuid.nullable()}).strict(),
 z.object({...envelope,kind:z.literal('preparation'),preparation:preparationSchema}).strict(),
 z.object({...envelope,kind:z.literal('preview_issue'),...previewFields.shape}).strict(),
 z.object({...envelope,kind:z.literal('record'),record:recordSchema}).strict(),
]).superRefine((value,ctx)=>{if(value.kind==='preview_issue'&&value.ready!==(value.candidate.eligibility_ref!==null&&value.candidate.blockers.length===0))ctx.addIssue({code:'custom',message:'Unconfirmed issue readiness'});});
export const receiptSchema=z.object({request_id:uuid,operation:z.enum(['initialize_admission','apply_admission_review','prepare_evidence','review_protocol_facts','prepare_artifact','issue']),payload_sha256:sha,case_id:uuid.nullable(),case_revision:rev.nullable(),event_ids:ids(0,2),preparation_id:uuid.nullable(),item_id:uuid.nullable(),record_id:uuid.nullable(),applied_at:utc,replayed:z.boolean()}).strict();
export const evidencePreparationSchema=admissionPreparationSchema.omit({schema_version:true}).extend({schema_version:z.literal(2),kind:z.literal('individual_w1'),scope:individualScopeSchema}).strict();
const mutationEnvelope={...envelope,receipt:receiptSchema};
export const mutationResultSchema=z.discriminatedUnion('kind',[
 z.object({...mutationEnvelope,kind:z.literal('initialize_admission'),state:admissionStateSchema}).strict(),
 z.object({...mutationEnvelope,kind:z.literal('apply_admission_review'),state:admissionStateSchema}).strict(),
 z.object({...mutationEnvelope,kind:z.literal('prepare_evidence'),preparation:evidencePreparationSchema}).strict(),
 z.object({...mutationEnvelope,kind:z.literal('review_protocol_facts'),state:admissionStateSchema,protocol_review:protocolFactsReviewSchema}).strict(),
 z.object({...mutationEnvelope,kind:z.literal('prepare_artifact'),preparation:preparationSchema}).strict(),
 z.object({...mutationEnvelope,kind:z.literal('issue'),record:recordSchema}).strict(),
]);
export const failureSchema=z.object({schema_version:z.literal(2),ok:z.literal(false),code:issuanceErrorSchema.shape.code,retryable:z.boolean(),message:text(500),blockers:z.array(issuanceBlockerSchema).max(30)}).strict();
type Validated<T>=[T] extends [null|undefined]?T:T extends readonly unknown[]?{[K in keyof T]-?:Validated<T[K]>}:T extends object?{[K in keyof T]-?:Validated<T[K]>}:T;
export type IndividualScope=Validated<z.infer<typeof individualScopeSchema>>;
export type Binding=Validated<z.infer<typeof admissionBindingSchema>>;
export type AdmissionState=Validated<z.infer<typeof admissionStateSchema>>;
export type Eligibility=Validated<z.infer<typeof individualEligibilitySchema>>;
export type Context=Validated<z.infer<typeof contextSchema>>;
export type PreparationItem=Validated<z.infer<typeof preparationItemSchema>>;
export type OriginalPlan=Omit<Validated<z.infer<typeof originalPlanSchema>>,'items'> & {items:[{enrollment_id:string;expected_eligibility_ref:Eligibility}]};
export type Preparation=Omit<Validated<z.infer<typeof preparationSchema>>,'items'|'plan'> & {items:[PreparationItem];plan:OriginalPlan};
export type RecordResult=Validated<z.infer<typeof recordSchema>>;
export type Query=Validated<z.infer<typeof querySchema>>;
export type Command=Validated<z.infer<typeof commandSchema>>;
type ReadBase=Validated<z.infer<typeof readResultSchema>>;
export type ReadResult=Exclude<ReadBase,{kind:'preparation'}>|(Omit<Extract<ReadBase,{kind:'preparation'}>,'preparation'>&{preparation:Preparation});
type MutationBase=Validated<z.infer<typeof mutationResultSchema>>;
export type MutationResult=Exclude<MutationBase,{kind:'prepare_artifact'}>|(Omit<Extract<MutationBase,{kind:'prepare_artifact'}>,'preparation'>&{preparation:Preparation});
export type EvidencePreparation=Validated<z.infer<typeof evidencePreparationSchema>>;
