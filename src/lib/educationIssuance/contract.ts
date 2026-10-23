// UC019 controlled issuance/lifecycle wire contract. Unknown keys are rejected.
// All objects reject unknown keys. Exact imported UC014/UC010 shapes are reused.
import { z } from 'zod';
import { admissionProgramRefSchema, admissionScopeSchema, admissionLocalActRefSchema } from '@/lib/admissionCases/contract';
import { outcomeScopeSchema, outcomeCriteriaRefSchema } from '@/lib/learningOutcomes/contract';
const uuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const sha=z.string().regex(/^[a-f0-9]{64}$/);
const count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const rev=count.refine(v=>v>0);
const time=z.string().max(64).datetime({offset:true});
const text=(n=2000)=>z.string().trim().min(1).max(n);
const label=(n=1000)=>z.string().min(1).max(n).refine(v=>v.trim().length>0);
const nullableText=(n=2000)=>z.string().max(n).nullable();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00.000Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;});
const ids=(min=0,max=100)=>z.array(uuid).min(min).max(max).refine(v=>new Set(v).size===v.length);
export const issuanceScopeSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('organization')}).strict(),z.object({kind:z.literal('group'),group_id:uuid}).strict()]);
export const issuanceSourceSchema=z.object({kind:z.literal('org_document_version'),document_id:uuid,version_id:uuid,content_hash:sha}).strict();
export const issuanceBasisSchema=z.object({source:issuanceSourceSchema,provision:text(1000),reason:text()}).strict();
// Source content_hash is the UC018 canonical metadata proof, NOT a SHA of file bytes.
// Admission evidence refs below retain the stronger sealed byte SHA already in UC010.
export const issuanceSealedEvidenceRefSchema=z.object({evidence_id:uuid,requirement_id:uuid,review_event_id:uuid,byte_sha256:sha,byte_size:z.number().int().min(1).max(20971520)}).strict();
export const issuanceFinalEducationProofSchema=z.object({requirement_id:uuid,requirement_revision:rev,review_event_id:uuid,education_level:z.enum(['spo','vo']),evidence_refs:z.array(issuanceSealedEvidenceRefSchema).min(1).max(20)}).strict();
export const issuanceAdmissionRefSchema=z.object({case_id:uuid,scope:admissionScopeSchema,revision:rev,decision_event_id:uuid,decision_case_revision:rev,program_ref:admissionProgramRefSchema,rule_set_id:uuid,rule_set_digest:sha,requirements_digest:sha,evidence_refs:z.array(issuanceSealedEvidenceRefSchema).max(100),final_education_proof:issuanceFinalEducationProofSchema.nullable(),source_hash:sha}).strict();
export const issuanceOutcomeRefSchema=z.object({scope:outcomeScopeSchema,revision:rev,criteria_ref:outcomeCriteriaRefSchema,machine_result_id:uuid,machine_input_hash:sha,decision_id:uuid,decision_basis:z.enum(['machine','recognition']),source_hash:sha}).strict();
export const issuanceIdentityRefSchema=z.object({user_id:uuid,registration_hash:sha,source:z.literal('current_student_registration')}).strict();
export const issuanceEligibilityRefSchema=z.object({organization_id:uuid,group_id:uuid,enrollment_id:uuid,user_id:uuid,course_id:uuid,program_ref:admissionProgramRefSchema,outcome_ref:issuanceOutcomeRefSchema,admission_ref:issuanceAdmissionRefSchema,identity_ref:issuanceIdentityRefSchema,withdrawal_revision:count,source_hash:sha}).strict();
// Current registration facts are not a biometric identity-verification claim. No caller name/number input.
export const issuanceBlockerCodeSchema=z.enum(['ASSOCIATION_UNAVAILABLE','PROGRAM_UNCONFIRMED','PROGRAM_CHANGED','UNSUPPORTED_PROGRAM_TYPE','OUTCOME_UNAVAILABLE','ATTESTATION_NOT_PASSED','ATTESTATION_REVIEW_REQUIRED','ADMISSION_UNAVAILABLE','ADMISSION_NOT_CONFIRMED','ADMISSION_REVIEW_REQUIRED','ADMISSION_SOURCE_UNAVAILABLE','FINAL_ISSUANCE_CONDITION_UNCONFIRMED','PRIMARY_EDUCATION_EVIDENCE_REQUIRED','IDENTITY_DETAILS_INCOMPLETE','WITHDRAWN','ALREADY_ISSUED','ISSUANCE_AUTHORITY_REQUIRED']);
export const issuanceBlockerSchema=z.object({code:issuanceBlockerCodeSchema,label:text(300),next_action:z.enum(['select_exact_association','confirm_programme','open_outcome','open_admission','review_final_education','review_registration','open_existing_record','contact_authorized_staff'])}).strict();
export const issuanceCapabilitiesSchema=z.object({can_read:z.boolean(),can_issue:z.boolean(),can_write_metadata:z.boolean(),can_record_handover:z.boolean(),can_annul:z.boolean(),can_issue_duplicate:z.boolean(),can_export:z.boolean(),can_read_withdrawal:z.boolean(),can_withdraw:z.boolean()}).strict();
const base={schema_version:z.literal(1),organization_id:uuid,scope:issuanceScopeSchema,capabilities:issuanceCapabilitiesSchema};
const documentType=z.enum(['certificate','diploma','qualification']);
export const issuanceOfficialSchema=z.object({id:uuid,organization_id:uuid,enrollment_id:uuid.nullable(),user_id:uuid.nullable(),course_id:uuid.nullable(),group_id:uuid.nullable(),reg_number:label(120),document_number:label(120),document_series:nullableText(120),document_type:documentType,document_status:z.enum(['original','duplicate']),full_name:label(500),birth_date:date.nullable(),issue_date:date,specialty_name:label(4000),qualification_name:nullableText(4000),protocol_number:nullableText(120),protocol_date:date.nullable(),order_number:nullableText(120),order_date:date.nullable(),education_result:nullableText(4000),created_at:time,updated_at:time,deleted_at:time.nullable(),notes:nullableText(4000),delivery_method:z.enum(['not_recorded','personal','representative','postal']),delivery_details:nullableText(4000),original_document_data:nullableText(4000)}).strict();

// UC021 gate: the saved PDF's real bytes are attested by a service worker.
// The metadata source hash, render-input hash and actual byte SHA have distinct meanings.
export const issuanceTemplateRefSchema=z.object({source:issuanceSourceSchema,review_id:uuid,review_revision:rev}).strict();
export const issuanceArtifactFinalRefSchema=z.object({preparation_id:uuid,item_id:uuid,input_revision:rev,source:issuanceSourceSchema,byte_sha256:sha,byte_size:z.number().int().min(1).max(20971520),render_input_hash:sha,template_byte_sha256:sha,html_sha256:sha,renderer:z.literal('browserless'),renderer_revision:z.literal('uc019-v1'),output_review_id:uuid,output_review_revision:rev}).strict();
export const issuanceArtifactProjectionSchema=z.object({artifact:issuanceArtifactFinalRefSchema.nullable(),availability:z.enum(['available','currently_unavailable','legacy_unverified'])}).strict().refine(v=>(v.artifact!==null)===(v.availability==='available'));
export const issuanceFrdoFactsSchema=z.object({schema_version:z.literal(1),source:z.literal('issuance_preparation_snapshot'),last_name:nullableText(200),first_name:nullableText(200),middle_name:nullableText(200),birth_date:date.nullable(),program_title:label(4000),program_type:z.enum(['dpo_upskilling','dpo_retraining','professional_training']),academic_hours:z.number().int().min(1).max(999999),qualification_name:nullableText(4000),profession:nullableText(4000),training_start_date:date.nullable(),training_end_date:date.nullable(),document_type:documentType,document_series:nullableText(120),document_number:label(120),reg_number:label(120),issue_date:date,missing:z.array(z.enum(['LAST_NAME','FIRST_NAME','BIRTH_DATE','TRAINING_START_DATE','TRAINING_END_DATE'])).max(5)}).strict();

export const issuanceHandoverSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('personal'),occurred_at:time,recipient:z.object({kind:z.literal('learner')}).strict(),evidence:issuanceSourceSchema}).strict(),
 z.object({kind:z.literal('representative'),occurred_at:time,recipient:z.object({kind:z.literal('representative'),full_name:text(300)}).strict(),authorization:issuanceSourceSchema,evidence:issuanceSourceSchema}).strict(),
 z.object({kind:z.literal('postal_dispatched'),occurred_at:time,carrier:text(200),tracking_number:text(200),recipient:z.object({kind:z.literal('learner'),postal_address:text(1000)}).strict(),evidence:issuanceSourceSchema}).strict(),
 z.object({kind:z.literal('postal_delivered'),occurred_at:time,dispatch_event_id:uuid,evidence:issuanceSourceSchema}).strict()
]);
// Input evidence is mandatory; all read projections mask inaccessible source refs.
const sourceProjection=z.object({source:issuanceSourceSchema.nullable(),availability:z.enum(['available','currently_unavailable'])}).strict().refine(v=>(v.source!==null)===(v.availability==='available'));
const basisProjection=z.object({source:issuanceSourceSchema.nullable(),source_availability:z.enum(['available','currently_unavailable']),provision:text(1000),reason:text()}).strict().refine(v=>(v.source!==null)===(v.source_availability==='available'));
const handoverProjection=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('personal'),occurred_at:time,recipient:z.object({kind:z.literal('learner')}).strict(),evidence:sourceProjection}).strict(),
 z.object({kind:z.literal('representative'),occurred_at:time,recipient:z.object({kind:z.literal('representative'),full_name:text(300)}).strict(),authorization:sourceProjection,evidence:sourceProjection}).strict(),
 z.object({kind:z.literal('postal_dispatched'),occurred_at:time,carrier:text(200),tracking_number:text(200),recipient:z.object({kind:z.literal('learner'),postal_address:text(1000)}).strict(),evidence:sourceProjection}).strict(),
 z.object({kind:z.literal('postal_delivered'),occurred_at:time,dispatch_event_id:uuid,evidence:sourceProjection}).strict()
]);
const duplicateBasisProjection=z.object({kind:z.enum(['lost','damaged','correction_replacement']),basis:basisProjection}).strict();
const withdrawalBasisProjection=z.object({kind:z.enum(['learner_request','organization_decision','contract_termination','other_reviewed']),source:issuanceSourceSchema.nullable(),source_availability:z.enum(['available','currently_unavailable']),provision:text(1000),reason:text()}).strict().refine(v=>(v.source!==null)===(v.source_availability==='available'));
const handoverFact=z.object({event_id:uuid,fact:handoverProjection,recorded_at:time,recorded_by:uuid.nullable()}).strict();
export const issuanceMetadataPatchSchema=z.object({notes:z.string().max(4000)}).strict();
export const issuanceDuplicateBasisSchema=z.object({kind:z.enum(['lost','damaged','correction_replacement']),basis:issuanceBasisSchema}).strict();
export const issuanceRecordSchema=z.object({official:issuanceOfficialSchema,revision:count,state_hash:sha,provenance:z.enum(['controlled_issuance','legacy_unverified']),lifecycle:z.enum(['active','annulled']),original_record_id:uuid.nullable(),artifact:issuanceArtifactProjectionSchema,frdo_facts:issuanceFrdoFactsSchema.nullable(),proof:issuanceEligibilityRefSchema.nullable(),proof_availability:z.enum(['captured','legacy_unverified','currently_unavailable']),notes:z.string().max(4000),latest_handover:handoverFact.nullable(),annulment:z.object({event_id:uuid,recorded_at:time,actor_id:uuid.nullable(),basis:basisProjection,reason:text()}).strict().nullable(),capabilities:issuanceCapabilitiesSchema}).strict().superRefine((v,c)=>{
 if((v.proof!==null)!==(v.proof_availability==='captured')||(v.provenance==='legacy_unverified')!==(v.proof_availability==='legacy_unverified'))c.addIssue({code:'custom',message:'Unconfirmed proof availability'});
 if(v.proof&&(v.proof.organization_id!==v.official.organization_id||v.proof.enrollment_id!==v.official.enrollment_id||v.proof.user_id!==v.official.user_id||v.proof.course_id!==v.official.course_id||v.proof.group_id!==v.official.group_id))c.addIssue({code:'custom',message:'Unconfirmed issued subject proof'});
 if((v.lifecycle==='annulled')!==(v.annulment!==null))c.addIssue({code:'custom',message:'Unconfirmed annulment'});
});
export const issuanceCandidateSchema=z.object({enrollment_id:uuid,user_id:uuid,course_id:uuid,group_id:uuid.nullable(),learner_label:label(500),technical_status:label(80),technical_progress:z.number().finite().min(0).max(100),withdrawal_revision:count,withdrawn:z.boolean(),document_type:documentType.nullable(),existing_original_record_id:uuid.nullable(),eligibility_ref:issuanceEligibilityRefSchema.nullable(),blockers:z.array(issuanceBlockerSchema).max(30)}).strict().refine(v=>(v.eligibility_ref!==null)===(v.blockers.length===0));
const issueIntent=z.object({course_id:uuid,enrollment_ids:ids(1,100),issue_date:date,document_series:nullableText(120)}).strict();
export const issuancePreviewSchema=z.object({intent:issueIntent,preview_hash:sha,candidates:z.array(issuanceCandidateSchema).min(1).max(100),ready:z.boolean()}).strict();
export const withdrawalBasisSchema=z.object({kind:z.enum(['learner_request','organization_decision','contract_termination','other_reviewed']),source:issuanceSourceSchema,provision:text(1000),reason:text()}).strict();
export const withdrawalRefSchema=z.object({organization_id:uuid,enrollment_id:uuid,user_id:uuid,course_id:uuid,group_id:uuid.nullable(),revision:count,source_hash:sha}).strict();
export const withdrawalStateSchema=z.object({ref:withdrawalRefSchema,state:z.enum(['active','withdrawn']),effective_date:date.nullable(),recorded_at:time.nullable(),recorded_by:uuid.nullable(),basis:withdrawalBasisProjection.nullable(),technical_status:label(80),technical_progress:z.number().finite().min(0).max(100),technical_completed_at:time.nullable(),technical_time_spent:count,manual_credit_retained:z.boolean(),original_record_ids:ids(0,100),can_withdraw:z.boolean()}).strict();
const withdrawalIntent=z.object({enrollment_ids:ids(1,100),effective_date:date,basis:withdrawalBasisSchema}).strict();
export const withdrawalPreviewSchema=z.object({intent:withdrawalIntent,preview_hash:sha,items:z.array(withdrawalStateSchema).min(1).max(100),ready:z.boolean()}).strict();
// Source hash includes exact preserved technical facts/current factual scope, not labels alone.
export const issuanceChangeIntentSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('correct_metadata'),record_id:uuid,expected_revision:count,expected_state_hash:sha,patch:issuanceMetadataPatchSchema,reason:text()}).strict(),
 z.object({action:z.literal('record_handover'),record_id:uuid,expected_revision:count,expected_state_hash:sha,handover:issuanceHandoverSchema,reason:text()}).strict(),
 z.object({action:z.literal('void_handover'),record_id:uuid,expected_revision:count,expected_state_hash:sha,event_id:uuid,reason:text()}).strict(),
 z.object({action:z.literal('annul'),record_id:uuid,expected_revision:count,expected_state_hash:sha,basis:issuanceBasisSchema,reason:text()}).strict(),
 z.object({action:z.literal('issue_duplicate'),record_id:uuid,expected_revision:count,expected_state_hash:sha,issue_date:date,document_series:nullableText(120),basis:issuanceDuplicateBasisSchema,reason:text()}).strict()
]);
export const issuanceChangeSchema=z.union([issuanceChangeIntentSchema.refine(v=>v.action!=='issue_duplicate'),z.object({action:z.literal('issue_duplicate'),record_id:uuid,expected_revision:count,expected_state_hash:sha,issue_date:date,document_series:nullableText(120),basis:issuanceDuplicateBasisSchema,reason:text(),artifact:issuanceArtifactFinalRefSchema}).strict()]);
export const issuanceChangePreviewSchema=z.object({change:issuanceChangeIntentSchema,preview_hash:sha,record:issuanceRecordSchema,ready:z.boolean(),blockers:z.array(issuanceBlockerSchema).max(30)}).strict();

export const issuancePreparationPlanSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('original'),intent:issueIntent,preview_hash:sha,items:z.array(z.object({enrollment_id:uuid,expected_eligibility_ref:issuanceEligibilityRefSchema}).strict()).min(1).max(100),template:issuanceTemplateRefSchema,reason:text()}).strict(),
 z.object({kind:z.literal('duplicate'),change:z.object({action:z.literal('issue_duplicate'),record_id:uuid,expected_revision:count,expected_state_hash:sha,issue_date:date,document_series:nullableText(120),basis:issuanceDuplicateBasisSchema,reason:text()}).strict(),preview_hash:sha,template:issuanceTemplateRefSchema}).strict()
]);
export const issuancePreparedArtifactSchema=z.object({source:issuanceSourceSchema,byte_sha256:sha,byte_size:z.number().int().min(1).max(20971520),render_input_hash:sha,template_byte_sha256:sha,html_sha256:sha,renderer:z.literal('browserless'),renderer_revision:z.literal('uc019-v1'),output_review:z.object({id:uuid,revision:rev}).strict().nullable()}).strict();
export const issuancePreparationItemSchema=z.object({id:uuid,enrollment_id:uuid,user_id:uuid,course_id:uuid,group_id:uuid,input_revision:rev,status:z.enum(['prepared','rendered_unissued','approved_unissued','consumed','stale']),number_plan:z.object({state:z.literal('prospective_unreserved'),document_number:label(120),reg_number:label(120),document_series:nullableText(120),issue_date:date}).strict(),render_input_hash:sha,artifact:issuancePreparedArtifactSchema.nullable(),final_record_id:uuid.nullable()}).strict().superRefine((v,c)=>{
 const bad=(message:string)=>c.addIssue({code:'custom',message});
 if((v.status==='consumed')!==(v.final_record_id!==null))bad('Unconfirmed final preparation record');
 if(v.status==='prepared'&&v.artifact!==null)bad('Prepared item cannot claim artifact');
 if(['rendered_unissued','approved_unissued','consumed'].includes(v.status)&&v.artifact===null)bad('Missing prepared artifact');
 if(v.status==='approved_unissued'&&v.artifact?.output_review==null)bad('Missing exact output approval');
 if(v.status==='rendered_unissued'&&v.artifact?.output_review!=null)bad('Unconfirmed rendered approval state');
 if(v.artifact&&v.artifact.render_input_hash!==v.render_input_hash)bad('Unconfirmed artifact render input');
});
export const issuancePreparationSchema=z.object({id:uuid,organization_id:uuid,scope:issuanceScopeSchema,kind:z.enum(['original','duplicate']),created_at:time,created_by:uuid,intent_hash:sha,plan:issuancePreparationPlanSchema,template:issuanceTemplateRefSchema,items:z.array(issuancePreparationItemSchema).min(1).max(100)}).strict().refine(v=>new Set(v.items.map(x=>x.id)).size===v.items.length&&new Set(v.items.map(x=>x.enrollment_id)).size===v.items.length,'Duplicate preparation item or enrollment').superRefine((v,c)=>{
 const bad=(message:string)=>c.addIssue({code:'custom',message});const p=v.plan,t=p.template;
 if(v.kind!==p.kind||v.template.source.document_id!==t.source.document_id||v.template.source.version_id!==t.source.version_id||v.template.source.content_hash!==t.source.content_hash||v.template.review_id!==t.review_id||v.template.review_revision!==t.review_revision)bad('Unconfirmed stored preparation plan');
 if(p.kind==='original'){
  if(p.intent.enrollment_ids.length!==v.items.length||p.items.length!==v.items.length||new Set(p.items.map(x=>x.enrollment_id)).size!==p.items.length)bad('Unconfirmed preparation enrollment set');
  for(const i of v.items){const expected=p.items.find(x=>x.enrollment_id===i.enrollment_id)?.expected_eligibility_ref;
   if(!p.intent.enrollment_ids.includes(i.enrollment_id)||!expected||i.course_id!==p.intent.course_id||i.number_plan.issue_date!==p.intent.issue_date||i.number_plan.document_series!==p.intent.document_series||expected.organization_id!==v.organization_id||expected.enrollment_id!==i.enrollment_id||expected.user_id!==i.user_id||expected.course_id!==i.course_id||expected.group_id!==i.group_id)bad('Unconfirmed prepared subject intent');
  }
 }else if(v.items.length!==1||v.items[0].number_plan.issue_date!==p.change.issue_date||v.items[0].number_plan.document_series!==p.change.document_series)bad('Unconfirmed duplicate preparation intent');
});
export const issuancePreparationMutationSchema=z.object({...base,receipt:z.object({request_id:uuid,action:z.literal('prepare_artifacts'),payload_hash:sha,preparation_id:uuid,applied_at:time,replayed:z.boolean()}).strict(),preparation:issuancePreparationSchema}).strict();

export const issuancePreparationSummarySchema=z.object({id:uuid,kind:z.enum(['original','duplicate']),created_at:time,item_count:z.number().int().min(1).max(100),prepared_count:count,rendered_unissued_count:count,approved_unissued_count:count,consumed_count:count,stale_count:count}).strict().refine(v=>v.prepared_count+v.rendered_unissued_count+v.approved_unissued_count+v.consumed_count+v.stale_count===v.item_count);
export const issuanceQuerySchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('preparations'),after_id:uuid.nullable(),limit:z.number().int().min(1).max(50),filter:z.enum(['all','open','consumed'])}).strict(),
 z.object({kind:z.literal('templates'),after_version_id:uuid.nullable(),limit:z.number().int().min(1).max(100)}).strict(),
 z.object({kind:z.literal('preparation'),preparation_id:uuid}).strict(),
 z.object({kind:z.literal('candidates'),course_id:uuid,after_enrollment_id:uuid.nullable(),limit:z.number().int().min(1).max(100),filter:z.enum(['all','ready','blocked','already_issued'])}).strict(),
 z.object({kind:z.literal('preview_issue'),intent:issueIntent}).strict(),
 z.object({kind:z.literal('records'),course_id:uuid.nullable(),after_id:uuid.nullable(),limit:z.number().int().min(1).max(100),filter:z.enum(['all','active','annulled','legacy_unverified'])}).strict(),
 z.object({kind:z.literal('record'),record_id:uuid}).strict(),
 z.object({kind:z.literal('history'),record_id:uuid,ceiling_revision:count.nullable(),before_revision:rev.nullable(),limit:z.number().int().min(1).max(100)}).strict(),
 z.object({kind:z.literal('preview_change'),change:issuanceChangeIntentSchema}).strict(),
 z.object({kind:z.literal('withdrawal'),enrollment_id:uuid}).strict(),
 z.object({kind:z.literal('withdrawal_preview'),intent:withdrawalIntent}).strict(),
 z.object({kind:z.literal('withdrawal_history'),enrollment_id:uuid,ceiling_revision:count.nullable(),before_revision:rev.nullable(),limit:z.number().int().min(1).max(100)}).strict(),
 z.object({kind:z.literal('export'),selection:z.discriminatedUnion('kind',[z.object({kind:z.literal('records'),record_ids:ids(1,1000)}).strict(),z.object({kind:z.literal('enrollments'),course_id:uuid,enrollment_ids:ids(1,1000)}).strict()]),format:z.literal('canonical_snapshot')}).strict()
]);
const issueItem=z.object({enrollment_id:uuid,expected_eligibility_ref:issuanceEligibilityRefSchema,artifact:issuanceArtifactFinalRefSchema}).strict();
export const issuanceActionSchema=z.union([
 z.object({action:z.literal('issue_batch'),intent:issueIntent,preview_hash:sha,items:z.array(issueItem).min(1).max(100),reason:text()}).strict(),
 z.object({action:z.literal('apply_change'),preview_hash:sha,change:issuanceChangeSchema}).strict(),
 z.object({action:z.literal('withdraw_enrollments'),intent:withdrawalIntent,preview_hash:sha,items:z.array(withdrawalRefSchema).min(1).max(100),reason:text()}).strict()
]);
export const issuanceEventSchema=z.object({id:uuid,record_id:uuid,revision:rev,kind:z.enum(['issued','metadata_corrected','handover_recorded','handover_voided','duplicate_issued','annulled']),recorded_at:time,actor_id:uuid.nullable(),reason:text(),previous_state_hash:sha,state_hash:sha,payload:z.discriminatedUnion('kind',[
 z.object({kind:z.literal('issued'),official:issuanceOfficialSchema,artifact:issuanceArtifactProjectionSchema,frdo_facts:issuanceFrdoFactsSchema,proof:issuanceEligibilityRefSchema.nullable(),proof_availability:z.enum(['captured','currently_unavailable'])}).strict(),
 z.object({kind:z.literal('metadata_corrected'),before_notes:z.string().max(4000),after_notes:z.string().max(4000)}).strict(),
 z.object({kind:z.literal('handover_recorded'),handover:handoverProjection}).strict(),
 z.object({kind:z.literal('handover_voided'),event_id:uuid}).strict(),
 z.object({kind:z.literal('duplicate_issued'),original_record_id:uuid,duplicate_record_id:uuid,basis:duplicateBasisProjection}).strict(),
 z.object({kind:z.literal('annulled'),basis:basisProjection}).strict()
])}).strict();
export const withdrawalEventSchema=z.object({id:uuid,enrollment_id:uuid,revision:rev,kind:z.literal('withdrawn'),recorded_at:time,actor_id:uuid.nullable(),reason:text(),basis:withdrawalBasisProjection,effective_date:date,before:withdrawalStateSchema,after:withdrawalStateSchema}).strict();
export const issuanceExportSnapshotSchema=z.object({schema_version:z.literal(1),kind:z.literal('education_issuance_snapshot'),organization_id:uuid,scope:issuanceScopeSchema,captured_at:time,captured_by:uuid,records:z.array(issuanceRecordSchema).max(1000),history:z.array(issuanceEventSchema).max(10000),missing:z.array(z.object({enrollment_id:uuid,code:z.enum(['NOT_ISSUED','ANNULLED_ONLY'])}).strict()).max(1000),not_official_submission:z.literal(true)}).strict();
export const issuanceExportSchema=z.object({snapshot_json:z.string().max(8388608),snapshot_sha256:sha,html:z.string().max(8388608),html_sha256:sha,utf8_bytes:z.number().int().min(1).max(8388608)}).strict();
export const issuanceReadSchema=z.discriminatedUnion('kind',[
 z.object({...base,kind:z.literal('preparations'),items:z.array(issuancePreparationSummarySchema).max(50),next_after_id:uuid.nullable()}).strict(),
 z.object({...base,kind:z.literal('templates'),items:z.array(z.object({label:label(1000),template:issuanceTemplateRefSchema}).strict()).max(100),next_after_version_id:uuid.nullable()}).strict(),
 z.object({...base,kind:z.literal('preparation'),preparation:issuancePreparationSchema}).strict(),
 z.object({...base,kind:z.literal('candidates'),course_id:uuid,items:z.array(issuanceCandidateSchema).max(100),next_after_enrollment_id:uuid.nullable()}).strict(),
 z.object({...base,kind:z.literal('preview_issue'),preview:issuancePreviewSchema}).strict(),
 z.object({...base,kind:z.literal('records'),items:z.array(issuanceRecordSchema).max(100),next_after_id:uuid.nullable()}).strict(),
 z.object({...base,kind:z.literal('record'),record:issuanceRecordSchema}).strict(),
 z.object({...base,kind:z.literal('history'),record_id:uuid,ceiling_revision:count,items:z.array(issuanceEventSchema).max(100),next_before_revision:rev.nullable()}).strict(),
 z.object({...base,kind:z.literal('preview_change'),preview:issuanceChangePreviewSchema}).strict(),
 z.object({...base,kind:z.literal('withdrawal'),state:withdrawalStateSchema}).strict(),
 z.object({...base,kind:z.literal('withdrawal_preview'),preview:withdrawalPreviewSchema}).strict(),
 z.object({...base,kind:z.literal('withdrawal_history'),enrollment_id:uuid,ceiling_revision:count,items:z.array(withdrawalEventSchema).max(100),next_before_revision:rev.nullable()}).strict(),
 z.object({...base,kind:z.literal('export'),artifact:issuanceExportSchema}).strict()
]);
export const issuanceReceiptSchema=z.object({request_id:uuid,action:z.enum(['issue_batch','apply_change','withdraw_enrollments']),scope_hash:sha,payload_hash:sha,record_ids:ids(0,100),enrollment_ids:ids(0,100),event_ids:ids(1,200),applied_at:time,replayed:z.boolean()}).strict();
export const issuanceMutationSchema=z.object({...base,receipt:issuanceReceiptSchema,records:z.array(issuanceRecordSchema).max(100),withdrawals:z.array(withdrawalStateSchema).max(100)}).strict();
export const issuanceErrorSchema=z.object({schema_version:z.literal(1),code:z.enum(['INVALID_INPUT','ACCESS_DENIED','REVISION_CONFLICT','REQUEST_CONFLICT','SOURCE_CHANGED','SOURCE_UNAVAILABLE','PREREQUISITE_MISSING','REVIEW_REQUIRED','LIMIT_EXCEEDED','DEPENDENCY_UNAVAILABLE','NUMBER_PLAN_STALE','ARTIFACT_UNAVAILABLE','ARTIFACT_REVIEW_REQUIRED','ARTIFACT_RENDER_FAILED']),retryable:z.boolean(),message:text(500)}).strict();
// Minimal O2a extension ONLY to existing UC010 definitions/review actions/payload snapshots.
export const admissionIssuanceConditionSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('primary_education_before_qualification'),education_levels:z.tuple([z.literal('spo'),z.literal('vo')]),concurrent_study_admission_allowed:z.boolean()}).strict(),
 z.object({kind:z.literal('no_separate_primary_education_condition'),reason:text(1000)}).strict()
]);
export const admissionIssuanceEvidenceSchema=z.object({kind:z.literal('completed_primary_education'),education_level:z.enum(['spo','vo']),evidence_version_ids:ids(1,20)}).strict();
export const admissionIssuanceReviewSnapshotSchema=z.object({requirement_id:uuid,requirement_revision:rev,event_id:uuid,actor_id:uuid.nullable(),condition:admissionIssuanceConditionSchema,evidence:admissionIssuanceEvidenceSchema.nullable()}).strict();
export const admissionIssuanceConditionSnapshotSchema=z.object({requirement_id:uuid,requirement_revision:rev,condition:admissionIssuanceConditionSchema}).strict();
// StaffCase.issuance_conditions?: AdmissionIssuanceConditionSnapshot[] from current rule definitions.
// These fields are OPTIONAL on historical/current UC010 wire payloads; omitted != confirmed.
// LocalRequirementInput.issuance_condition?: admissionIssuanceConditionSchema; only education_basis.
// ReviewRequirementAction.issuance_evidence?: admissionIssuanceEvidenceSchema|null.
// EventPayload.issuance_reviews?: AdmissionIssuanceReviewSnapshot[]; historical snapshots remain unchanged.
// StaffCase.issuance_reviews?: AdmissionIssuanceReviewSnapshot[] for current UI correction/review.
// DPO must use primary_education_before_qualification; no_separate cannot override it.
// New professional_training may use confirmed no_separate (no DPO diploma gate invented).
// Exactly one education_basis definition is required for NEW issuance-ready rule sets.

// Read/replay/export masking is a projection, never a rewrite of immutable server proof.
// If current actor cannot read the exact admission case/every sealed evidence ref,
// record.proof=null/proof_availability=currently_unavailable; same for issued history payload.
// Candidate eligibility_ref=null with masked ADMISSION_UNAVAILABLE blocker in that case.
// Evidence/source projection wrappers hide UUIDs/hashes when current source rights are absent.
// Receipt contains lifecycle record/enrollment/event IDs only; never admission/source proof refs.
// Ungrouped enrollment: candidate.group_id=null with ASSOCIATION_UNAVAILABLE for original issue.
// Withdrawal group_id may be null, authorized against actual organization/course/enrollment.
// Group scope never fabricates membership; ungrouped withdrawal uses legitimate organization/course scope.

// A personally owned stored result is separate from licensed course content.
export const retainedLearningSummaryQuerySchema=z.object({kind:z.literal('retained_summary'),enrollment_id:uuid,after_decision_id:uuid.nullable(),limit:z.number().int().min(1).max(50)}).strict();
export const retainedLearningSummarySchema=z.object({schema_version:z.literal(1),kind:z.literal('retained_summary'),organization_id:uuid,user_id:uuid,enrollment_id:uuid,course_id:uuid,withdrawal:z.object({effective_date:date,recorded_at:time}).strict(),technical:z.object({status:label(80),progress:z.number().finite().min(0).max(100),completed_at:time.nullable()}).strict(),decisions:z.array(z.object({id:uuid,outcome:z.enum(['passed','not_passed','deferred']),learner_summary:text(1000),recorded_at:time,supersedes_id:uuid.nullable()}).strict()).max(50),next_after_decision_id:uuid.nullable()}).strict();
type Validated<T>=T extends(infer Item)[]?Validated<Item>[]:T extends object?{[Key in keyof T]-?:Validated<T[Key]>}:T;
export type IssuanceScope=Validated<z.infer<typeof issuanceScopeSchema>>;
export type IssuanceQuery=Validated<z.infer<typeof issuanceQuerySchema>>;
export type IssuanceAction=Validated<z.infer<typeof issuanceActionSchema>>;
export type IssuanceRecord=Validated<z.infer<typeof issuanceRecordSchema>>;
export type IssuanceCandidate=Validated<z.infer<typeof issuanceCandidateSchema>>;
export type IssuanceRead=Validated<z.infer<typeof issuanceReadSchema>>;
export type IssuanceMutation=Validated<z.infer<typeof issuanceMutationSchema>>;
export type IssuanceExportSnapshot=Validated<z.infer<typeof issuanceExportSnapshotSchema>>;
export type WithdrawalState=Validated<z.infer<typeof withdrawalStateSchema>>;
export type RetainedLearningSummary=Validated<z.infer<typeof retainedLearningSummarySchema>>;

export type IssuanceChangeIntent=Validated<z.infer<typeof issuanceChangeIntentSchema>>;
export type IssuancePreparationPlan=Validated<z.infer<typeof issuancePreparationPlanSchema>>;
export type IssuancePreparation=Validated<z.infer<typeof issuancePreparationSchema>>;
export type IssuancePreparationMutation=Validated<z.infer<typeof issuancePreparationMutationSchema>>;
export type IssuanceArtifactFinalRef=Validated<z.infer<typeof issuanceArtifactFinalRefSchema>>;
