// Pure W2 evidence decoder subset; exact frontend parity, no IO/auth/UI.
import { z } from 'npm:zod@3.25.76';
import { programmeRefSchema, orderProgrammeFacts, orderDatesSchema, orderArtifactImmutableSchema, orderRegistryRefSchema } from './individual-education-order-contract.ts';
export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const rev0 = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const rev = rev0.refine(value => value > 0);
const text = (max: number) => z.string().max(max).refine(value => value.trim() === value && value.length > 0 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value));
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===value;});
export const utc = z.string().max(64).datetime({offset:true}).refine(value => /(?:Z|\+00:00)$/.test(value));
const ids = (min=0,max=100) => z.array(uuid).min(min).max(max).refine(values => new Set(values).size===values.length);
export const same = (a: unknown,b: unknown): boolean => a===b || a!==null && b!==null && typeof a==='object' && typeof b==='object' && Object.keys(a).length===Object.keys(b).length && Object.keys(a).every(key => Object.prototype.hasOwnProperty.call(b,key) && same((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]));

const admissionUuid=uuid, admissionSha256=sha, positiveRevision=rev, admissionRevision=rev0;
const admissionText=(max=4000)=>z.string().min(1).max(max).refine(v=>v.trim()===v&&v.length>0);
const canonicalText=(max=2000)=>z.string().trim().min(1).max(max);
const admissionTime=z.string().datetime({offset:true}), admissionDate=date;
const admissionIds=ids;
const admissionMime=z.enum(['application/pdf','image/jpeg','image/png']);
const ADMISSION_MAX_BYTES=20971520;
const registrySourceSchema=z.object({kind:z.literal('org_document_version'),document_id:uuid,version_id:uuid,content_hash:sha}).strict();
export const admissionIssuanceConditionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("primary_education_before_qualification"), education_levels: z.tuple([z.literal("spo"), z.literal("vo")]),
    concurrent_study_admission_allowed: z.boolean() }).strict(),
  z.object({ kind: z.literal("no_separate_primary_education_condition"), reason: canonicalText(1000) }).strict(),
]);
export const admissionIssuanceEvidenceSchema = z.object({ kind: z.literal("completed_primary_education"), education_level: z.enum(["spo", "vo"]),
  evidence_version_ids: z.array(uuid).min(1).max(20).refine(ids => new Set(ids).size === ids.length) }).strict();
export const admissionIssuanceReviewSnapshotSchema = z.object({ requirement_id: uuid, requirement_revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  event_id: uuid, actor_id: uuid.nullable(), condition: admissionIssuanceConditionSchema, evidence: admissionIssuanceEvidenceSchema.nullable() }).strict();
export const admissionRequirementSchema = z.object({id: admissionUuid, revision: positiveRevision, rule_id: admissionUuid, rule_set_id: admissionUuid, rule_set_digest: admissionSha256,
  label: admissionText(160), applicability: z.enum(['unknown','applicable','not_applicable']), review_event_id: admissionUuid.nullable(), evidence_version_ids: admissionIds(),
  current_state: z.enum(['unknown','missing','unreviewed','satisfied','unreadable','exception_pending','exception_recorded']), public_next_action: admissionText(160).nullable()}).strict();
export const admissionEvidenceSchema = z.object({id: admissionUuid, case_id: admissionUuid, case_revision_created: positiveRevision, requirement_id: admissionUuid, supersedes_id: admissionUuid.nullable(),
  source_kind: z.enum(['upload','identity_document','enrollment_document','contract_artifact','organization_document_version']), captured_at: admissionTime, byte_sha256: admissionSha256,
  byte_size: z.number().int().min(1).max(ADMISSION_MAX_BYTES), mime_type: admissionMime, availability: z.enum(['available','unavailable','integrity_conflict']),
  review: z.enum(['unreviewed','accepted','rejected']), review_event_id: admissionUuid.nullable(), can_read_bytes: z.boolean()}).strict();
export const admissionTaskSchema = z.object({id: admissionUuid, key: admissionSha256, requirement_id: admissionUuid.nullable(),
  kind: z.enum(['supply_evidence','review_applicability','review_evidence','review_exception','recheck_source','recheck_programme']), status: z.enum(['open','resolved','superseded']),
  assignee_id: admissionUuid.nullable(), public_label: admissionText(160), deadline: z.object({kind: z.enum(['not_set','internal_target','reviewed_rule']), date: admissionDate.nullable(), rule_id: admissionUuid.nullable()}).strict(), reason: admissionText().nullable()}).strict();
export const admissionCapabilitiesSchema = z.object({can_initialize: z.boolean(), can_assign: z.boolean(), can_review: z.boolean(), can_decide: z.boolean(), can_prepare_evidence: z.boolean(), can_configure_rules: z.boolean()}).strict();
export const issuanceBlockerCodeSchema=z.enum(['ASSOCIATION_UNAVAILABLE','PROGRAM_UNCONFIRMED','PROGRAM_CHANGED','UNSUPPORTED_PROGRAM_TYPE','OUTCOME_UNAVAILABLE','ATTESTATION_NOT_PASSED','ATTESTATION_REVIEW_REQUIRED','ADMISSION_UNAVAILABLE','ADMISSION_NOT_CONFIRMED','ADMISSION_REVIEW_REQUIRED','ADMISSION_SOURCE_UNAVAILABLE','FINAL_ISSUANCE_CONDITION_UNCONFIRMED','PRIMARY_EDUCATION_EVIDENCE_REQUIRED','IDENTITY_DETAILS_INCOMPLETE','WITHDRAWN','ALREADY_ISSUED','ISSUANCE_AUTHORITY_REQUIRED']);
export const issuanceBlockerSchema=z.object({code:issuanceBlockerCodeSchema,label:canonicalText(300),next_action:z.enum(['select_exact_association','confirm_programme','open_outcome','open_admission','review_final_education','review_registration','open_existing_record','contact_authorized_staff'])}).strict();
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

export const individualAdmissionScopeSchema=individualScopeSchema;
export const individualAdmissionBindingSchema=admissionBindingSchema;
export const individualAdmissionStateSchema=admissionStateSchema;
type Validated<T>=[T] extends [null|undefined]?T:T extends readonly unknown[]?{[K in keyof T]-?:Validated<T[K]>}:T extends object?{[K in keyof T]-?:Validated<T[K]>}:T;
export type IndividualAdmissionScope=Validated<z.infer<typeof individualAdmissionScopeSchema>>;
export type IndividualAdmissionBinding=Validated<z.infer<typeof individualAdmissionBindingSchema>>;
export type IndividualAdmissionState=Validated<z.infer<typeof individualAdmissionStateSchema>>;
