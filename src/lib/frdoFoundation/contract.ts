/** UC020 pure foundation source: strict reviewed V1 plus finite V2. No public API or authority grant.
 * Every request/response object is strict. Server-derived actor/capabilities/bytes are never caller claims.
 * Cross-object predicates listed in UC020_IMPLEMENTATION_CONTRACT_V1.json are mandatory at each endpoint.
 */
import { z } from 'zod';
import { issuanceRecordSchema, issuanceFrdoFactsSchema } from '../educationIssuance/contract';
import { OFFICIAL_TEMPLATES } from './officialMetadata';
export { issuanceFrdoFactsSchema };
const uuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const sha=z.string().regex(/^[a-f0-9]{64}$/);
const text=(max=2000)=>z.string().min(1).max(max).refine(v=>v.trim().length>0);
const rev=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const at=z.string().max(64).datetime({offset:true});
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00.000Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;});
const uniqueIds=(min=1,max=1000)=>z.array(uuid).min(min).max(max).refine(v=>new Set(v).size===v.length);
export const scopeSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('organization')}).strict(),
 z.object({kind:z.literal('group'),group_id:uuid}).strict()
]);
const stream=z.enum(['dpo','po']);
export const templateRefSchema=z.object({template_id:z.enum(['dpo20230116','po16102026']),byte_sha256:sha,mapping_revision:z.literal('uc020-v2'),dictionary_sha256:sha,column_count:z.union([z.literal(40),z.literal(35)])}).strict()
 .refine(v=>v.template_id==='dpo20230116'?v.column_count===40:v.column_count===35)
 .refine(v=>{const expected=v.template_id==='dpo20230116'?OFFICIAL_TEMPLATES.dpo:OFFICIAL_TEMPLATES.po;return v.byte_sha256===expected.donor_sha256&&v.dictionary_sha256===expected.dictionary_sha256;});
// Metadata content_hash is NOT a file byte SHA. This exact UC018 source shape is reused.
export const sourceRefSchema=z.object({kind:z.literal('org_document_version'),document_id:uuid,version_id:uuid,content_hash:sha}).strict();
export const sealedEvidenceSchema=z.object({source:sourceRefSchema,byte_sha256:sha,byte_size:z.number().int().min(1).max(20971520)}).strict();
export const sourceProjectionSchema=z.object({evidence:sealedEvidenceSchema.nullable(),availability:z.enum(['available','currently_unavailable'])}).strict().refine(v=>(v.evidence!==null)===(v.availability==='available'));
export const recordRefSchema=z.object({record_id:uuid,record_revision:rev,record_state_hash:sha,frozen_facts_sha256:sha,user_id:uuid,enrollment_id:uuid,course_id:uuid,group_id:uuid.nullable()}).strict();
// Known/absent/unknown stay distinct; no empty-string/NULL-to-default coercion.
const fact=<T extends z.ZodTypeAny>(value:T)=>z.discriminatedUnion('state',[
 z.object({state:z.literal('known'),value}).strict(),
 z.object({state:z.literal('confirmed_absent')}).strict(),
 z.object({state:z.literal('unknown')}).strict()
]);
const boolFact=fact(z.boolean());
const loss=z.enum(['Нет','Справка из органов внутренних дел','Справка из органов пожарной охраны','Объявление в газете','Другое']);
const exchange=z.enum(['Нет','Обмен по причине порчи','Обмен по причине наличия недостоверной информации']);
const financing=z.enum(['Федеральный бюджет','Региональный бюджет','Местный бюджет','Платное обучение']);
const form=z.enum(['Очная','Очно-заочная (вечерняя)','Заочная']);
const educationForm=z.enum(['в образовательной организации','вне образовательной организации']);
const priorEducation=z.enum(['Высшее образование','Среднее профессиональное образование','Справка','Стаж','Пункт 1 правил формирования ФИС ФРДО']);
/** Explicit operator-reviewed ACTUAL period. Index binds to the exact sealed evidence array; no planned calendar/issue-date inference. */
export const reviewedTrainingPeriodSchema=z.object({kind:z.literal('reviewed_actual_training_period_v1'),start_date:date,end_date:date,evidence_index:z.number().int().min(0).max(29)}).strict().refine(value=>value.start_date<=value.end_date);
const poSubtype=z.enum(['Программа профессиональной подготовки по профессии рабочего, должности служащего','Программа переподготовки рабочих, служащих','Программа повышения квалификации рабочих, служащих']);
export const supplementFieldsSchema=z.object({
 training_period:reviewedTrainingPeriodSchema.optional(),
 gender:fact(z.enum(['Муж','Жен'])),snils:fact(z.string().regex(/^\d{11}$/)),citizenship_code:fact(z.string().regex(/^\d{3}$/)),
 training_form:fact(form),financing_source:fact(financing),education_form:fact(educationForm),
 professional_area:fact(text(1000)),specialty_group:fact(text(1000)),prior_education_level:fact(priorEducation),
 prior_diploma_last_name:fact(text(200)),prior_diploma_series:fact(text(120)),prior_diploma_number:fact(text(120)),
 po_program_subtype:fact(poSubtype),qualification_rank:fact(text(120)),qualification_not_awarded:boolFact,
 patronymic_absence:boolFact,series_absence:boolFact,loss_confirmation:fact(loss),exchange_confirmation:fact(exchange),destruction_confirmation:fact(z.enum(['Да','Нет'])),
 snils_exception:z.discriminatedUnion('kind',[
  z.object({kind:z.literal('none')}).strict(),
  z.object({kind:z.literal('external_support_approval'),ticket_reference:text(200),not_assigned_confirmation:sealedEvidenceSchema,approval_evidence:sealedEvidenceSchema,approved_at:at,scope_note:text(1000)}).strict()
 ])
}).strict();
export const supplementInputSchema=z.object({record:recordRefSchema,expected_revision:count,fields:supplementFieldsSchema,evidence:z.array(sealedEvidenceSchema).min(1).max(30),review_note:text(4000)}).strict().refine(value=>!value.fields.training_period||value.fields.training_period.evidence_index<value.evidence.length);
export const supplementRefSchema=z.object({id:uuid,revision:rev,snapshot_sha256:sha,frozen_facts_sha256:sha}).strict();
const supplementReadFieldsSchema=supplementFieldsSchema.omit({snils_exception:true}).extend({snils_exception:z.discriminatedUnion('kind',[z.object({kind:z.literal('none')}).strict(),z.object({kind:z.literal('external_support_approval'),ticket_reference:text(200),not_assigned_confirmation:sourceProjectionSchema,approval_evidence:sourceProjectionSchema,approved_at:at,scope_note:text(1000)}).strict()])}).strict();
export const supplementReadSchema=z.object({ref:supplementRefSchema,record_id:uuid,user_id:uuid,fields:supplementReadFieldsSchema,reviewed_by:uuid.nullable(),reviewed_at:at,evidence:z.array(sourceProjectionSchema).max(30),review_note:text(4000)}).strict();
export const issueCodeSchema=z.enum(['LEGACY_UNCONFIRMED','ANNULLED','SOURCE_CHANGED','SOURCE_UNAVAILABLE','ORIGINAL_UNCONFIRMED','SUBJECT_MISMATCH','UNSUPPORTED_DOCUMENT','MISSING_REQUIRED','INVALID_ENUM','INVALID_DATE','INVALID_NAME','INVALID_NUMBER','INVALID_SNILS','EXTERNAL_SNILS_ROUTE_REQUIRED','FIELD_TOO_LONG','PROGRAMME_CONFLICT','DUPLICATE_EXTERNAL_OPERATION_REQUIRED','LEGAL_POLICY_UNVERIFIED','TEMPLATE_CHANGED','ROW_LIMIT_EXCEEDED','UNSUPPORTED_ISSUER_REGIME','WORKING_CALENDAR_UNAVAILABLE','SNILS_NOT_ASSIGNED_CONFIRMATION_REQUIRED']);
export const issueSchema=z.object({code:issueCodeSchema,severity:z.enum(['blocker','warning']),column_index:z.number().int().min(1).max(40).nullable(),field:text(120).nullable(),message:text(500),next_action:z.enum(['review_supplement','open_issued_record','review_original','select_other_record','review_external_operation','contact_fis_support','review_legal_policy','refresh_preview'])}).strict();
const rowCell=z.union([z.string().max(8000),z.number().finite(),z.null()]);
export const rowSchema=z.object({row_key:sha,record:recordRefSchema,original_record:recordRefSchema.nullable(),supplement:supplementRefSchema.nullable(),original_supplement:supplementRefSchema.nullable(),stream,cells:z.array(rowCell).min(35).max(40),row_sha256:sha,issues:z.array(issueSchema).max(80),ready:z.boolean()}).strict()
 .refine(v=>v.cells.length===(v.stream==='dpo'?40:35)&&v.cells[v.cells.length-1]===null&&v.ready===!v.issues.some(i=>i.severity==='blocker'));
export const issuerRegimeSchema=z.enum(['ordinary_rf','joint_rf_foreign','unconfirmed']);
// Phase1 supports only positively established ordinary RF issuers. A foreign pupil or
// a network programme is not evidence of a joint RF/foreign-government institution.
// Joint5/60 and special UNEP delivery are not enabled in this ordinary-issuer foundation.
// Original-act mirror evidence does not replace full publication/effective-policy review.
export const ordinaryDeadlineRuleSchema=z.discriminatedUnion('rule_id',[
 z.object({rule_id:z.literal('ordinary_po_3_working'),issuer_regime:z.literal('ordinary_rf'),stream:z.literal('po'),period:z.literal(3),unit:z.literal('working_days')}).strict(),
 z.object({rule_id:z.literal('ordinary_dpo_30_calendar_from_20250901'),issuer_regime:z.literal('ordinary_rf'),stream:z.literal('dpo'),period:z.literal(30),unit:z.literal('calendar_days')}).strict()
]);
const policyProjection=z.object({source:sourceProjectionSchema,rule_revision:rev,review_event_id:uuid.nullable(),policy_snapshot_sha256:sha,primary_source_sha256s:z.array(sha).min(1).max(30).refine(v=>new Set(v).size===v.length),effective_from:date,effective_to:date.nullable(),checked_as_of:date}).strict();
export const deadlineSchema=z.discriminatedUnion('verification',[
 z.object({verification:z.literal('source_checked_pending_consolidation'),stream,rule:ordinaryDeadlineRuleSchema,candidate_due_date:date.nullable(),official_source_sha256:sha,calendar_sha256:sha.nullable(),message:text(500)}).strict(),
 z.object({verification:z.literal('pending_primary_current_law'),stream,issuer_regime:issuerRegimeSchema,due_date:z.null(),policy_ref:z.null(),message:text(500)}).strict(),
 z.object({verification:z.literal('reviewed_policy_calculation_pending'),stream,rule:ordinaryDeadlineRuleSchema,due_date:z.null(),policy:policyProjection,calendar_sha256:z.null(),reason:z.literal('reviewed_calendar_unavailable'),message:text(500)}).strict(),
 z.object({verification:z.literal('reviewed_policy'),stream,rule:ordinaryDeadlineRuleSchema,due_date:date,policy:policyProjection,calendar_sha256:sha,message:text(500)}).strict()
]).superRefine((v,c)=>{
 if('rule' in v&&v.stream!==v.rule.stream)c.addIssue({code:'custom',message:'Deadline stream differs from exact rule'});
 if(v.verification==='source_checked_pending_consolidation'&&v.rule.unit==='working_days'&&v.candidate_due_date!==null&&v.calendar_sha256===null)c.addIssue({code:'custom',message:'No workday deadline without a pinned official calendar'});
 if('policy' in v&&(v.policy.effective_to!==null&&v.policy.effective_to<v.policy.effective_from||v.policy.checked_as_of<v.policy.effective_from))c.addIssue({code:'custom',message:'Unconfirmed policy effective interval'});
});

export const jobRefSchema=z.object({id:uuid,revision:rev,state_hash:sha,snapshot_sha256:sha}).strict();
export const correctionPlanSchema=z.object({parent_job:jobRefSchema,receipt_event_id:uuid,replacements:z.array(z.object({parent_row_key:sha,record_id:uuid}).strict()).min(1).max(1000),reason:text(4000)}).strict().refine(v=>new Set(v.replacements.map(r=>r.parent_row_key)).size===v.replacements.length&&new Set(v.replacements.map(r=>r.record_id)).size===v.replacements.length);
export const selectionSchema=z.object({stream,record_ids:uniqueIds(),template:templateRefSchema}).strict();
export const previewSchema=z.object({schema_version:z.literal(1),organization_id:uuid,scope:scopeSchema,actor_id:uuid,as_of_date:date,selection:selectionSchema,correction:correctionPlanSchema.nullable(),preview_hash:sha,rows:z.array(rowSchema).min(1).max(1000),deadlines:z.array(z.object({row_key:sha,deadline:deadlineSchema}).strict()).min(1).max(1000),ready:z.boolean(),expires_at:at}).strict()
 .refine(v=>new Set(v.rows.map(r=>r.record.record_id)).size===v.rows.length&&new Set(v.rows.map(r=>r.row_key)).size===v.rows.length&&v.rows.every(r=>r.stream===v.selection.stream)&&v.ready===v.rows.every(r=>r.ready));
export const fileRefSchema=z.object({artifact_id:uuid,byte_sha256:sha,byte_size:z.number().int().min(1).max(20971520),mime:z.enum(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/pdf','application/zip','application/octet-stream']),file_name:text(200)}).strict();
// Crypto verification is unimplemented; neither declared metadata nor an operator checkbox upgrades it.
export const signingSchema=z.object({status:z.literal('not_verified')}).strict();
const signing=signingSchema;
export const fileSchema=z.object({file:fileRefSchema,kind:z.enum(['official_template_export','external_receipt','external_submission_package','administrative_attachment']),created_at:at,created_by:uuid.nullable(),snapshot_sha256:sha,signing}).strict();
export const rowOutcomeSchema=z.discriminatedUnion('outcome',[
 z.object({row_key:sha,row_sha256:sha,record_id:uuid,outcome:z.literal('accepted'),external_record_reference:text(300).nullable()}).strict(),
 z.object({row_key:sha,row_sha256:sha,record_id:uuid,outcome:z.literal('rejected'),external_error_code:text(100).nullable(),message:text(2000)}).strict(),
 z.object({row_key:sha,row_sha256:sha,record_id:uuid,outcome:z.literal('unresolved'),message:text(2000)}).strict()
]);
export const receiptInputSchema=z.object({upload_event_id:uuid,submission_id:text(300),receipt_evidence:sealedEvidenceSchema,received_at:at,recording_method:z.literal('authorized_operator_transcription'),outcomes:z.array(rowOutcomeSchema).min(1).max(1000),operator_note:text(4000)}).strict()
 .refine(v=>new Set(v.outcomes.map(r=>r.row_key)).size===v.outcomes.length);
export const externalOperationSchema=z.object({kind:z.enum(['remove_original_for_duplicate','amend_existing_external_record']),record_id:uuid,original_record_id:uuid.nullable(),external_reference:text(300),occurred_at:at,evidence:sealedEvidenceSchema,note:text(2000)}).strict();
export const adminHandoverProjectionSchema=z.object({event_id:uuid,file_artifact_id:uuid,recorded_at:at,recorded_by:uuid.nullable(),message_id:uuid.nullable(),note:text(2000)}).strict();
export const uploadProjectionSchema=z.object({event_id:uuid,file_artifact_id:uuid,submission_id:text(300),occurred_at:at,recorded_at:at,recorded_by:uuid.nullable(),upload_evidence:sourceProjectionSchema,external_operations:z.array(z.object({kind:z.enum(['remove_original_for_duplicate','amend_existing_external_record']),record_id:uuid,original_record_id:uuid.nullable(),external_reference:text(300),occurred_at:at,evidence:sourceProjectionSchema,note:text(2000)}).strict()).max(1000)}).strict();
export const receiptProjectionSchema=z.object({event_id:uuid,upload_event_id:uuid,submission_id:text(300),received_at:at,recorded_at:at,recorded_by:uuid.nullable(),receipt_evidence:sourceProjectionSchema,recording_method:z.literal('authorized_operator_transcription'),outcomes:z.array(rowOutcomeSchema).min(1).max(1000),operator_note:text(4000)}).strict();
export const jobStateSchema=z.enum(['preview_frozen','file_generating','file_generation_failed','file_generated','administrative_handover_recorded','fis_upload_recorded','accepted','partially_rejected','rejected','receipt_unresolved']);
export const eventSchema=z.object({id:uuid,revision:rev,kind:z.enum(['preview_frozen','file_requested','file_sealed','file_failed','admin_handover','fis_upload','receipt_recorded','external_operation','correction_created']),actor_id:uuid.nullable(),recorded_at:at,previous_state_hash:sha.nullable(),state_hash:sha,payload_sha256:sha}).strict();
export const capabilitiesSchema=z.object({can_read:z.boolean(),can_preview:z.boolean(),can_review_supplement:z.boolean(),can_generate_file:z.boolean(),can_record_admin_handover:z.boolean(),can_record_external_upload:z.boolean(),can_record_receipt:z.boolean(),can_create_correction:z.boolean()}).strict();
export const jobSchema=z.object({schema_version:z.literal(1),organization_id:uuid,scope:scopeSchema,ref:jobRefSchema,stream,state:jobStateSchema,created_by:uuid.nullable(),created_at:at,selection:selectionSchema,rows:z.array(rowSchema).min(1).max(1000),deadlines:z.array(z.object({row_key:sha,deadline:deadlineSchema}).strict()).min(1).max(1000),files:z.array(fileSchema).max(100),events:z.array(eventSchema).min(1).max(50),next_before_event_revision:rev.nullable(),event_ceiling_revision:rev,parent_correction:correctionPlanSchema.nullable(),correction_job_ids:uniqueIds(0,100),source_currency:z.enum(['current','changed','unavailable']),latest_admin_handover:adminHandoverProjectionSchema.nullable(),latest_fis_upload:uploadProjectionSchema.nullable(),latest_receipt:receiptProjectionSchema.nullable(),capabilities:capabilitiesSchema}).strict();
const jobActionBase={job:jobRefSchema};
export const actionSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('save_supplement'),input:supplementInputSchema}).strict(),
 z.object({kind:z.literal('freeze_preview'),selection:selectionSchema,expected_preview_hash:sha}).strict(),
 z.object({kind:z.literal('generate_file'),...jobActionBase,expected_template:templateRefSchema}).strict(),
 z.object({kind:z.literal('record_admin_handover'),...jobActionBase,file_artifact_id:uuid,recipient:z.literal('platform_administrator'),note:text(2000)}).strict(),
 z.object({kind:z.literal('record_fis_upload'),...jobActionBase,file_artifact_id:uuid,submission_id:text(300),occurred_at:at,upload_evidence:sealedEvidenceSchema,external_operations:z.array(externalOperationSchema).max(1000)}).strict(),
 z.object({kind:z.literal('record_receipt'),...jobActionBase,receipt:receiptInputSchema}).strict(),
 z.object({kind:z.literal('create_correction'),plan:correctionPlanSchema,template:templateRefSchema,expected_preview_hash:sha}).strict()
]);
export const mutationRequestSchema=z.object({schema_version:z.literal(1),organization_id:uuid,scope:scopeSchema,request_id:uuid,action:actionSchema}).strict();
export const querySchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('preview'),selection:selectionSchema}).strict(),
 z.object({kind:z.literal('correction_preview'),plan:correctionPlanSchema,template:templateRefSchema}).strict(),
 z.object({kind:z.literal('job'),job_id:uuid}).strict(),
 z.object({kind:z.literal('history'),job_id:uuid,ceiling_revision:rev.nullable(),before_revision:rev.nullable(),limit:z.number().int().min(1).max(50)}).strict(),
 z.object({kind:z.literal('receipt'),job_id:uuid,receipt_event_id:uuid}).strict(),
 z.object({kind:z.literal('jobs'),after_id:uuid.nullable(),limit:z.number().int().min(1).max(50),stream:stream.nullable()}).strict(),
 z.object({kind:z.literal('supplement'),record_id:uuid}).strict(),
 z.object({kind:z.literal('download'),job:jobRefSchema,artifact_id:uuid,purpose:z.enum(['current_submission','historical_copy'])}).strict()
]);
export const readRequestSchema=z.object({schema_version:z.literal(1),organization_id:uuid,scope:scopeSchema,query:querySchema}).strict();
export const mutationReceiptSchema=z.object({request_id:uuid,action_kind:z.enum(['save_supplement','freeze_preview','generate_file','record_admin_handover','record_fis_upload','record_receipt','create_correction']),job_ids:uniqueIds(0,2),supplement_ids:uniqueIds(0,1),event_ids:uniqueIds(0,2),payload_sha256:sha,recorded_at:at}).strict();
export const mutationResultSchema=z.object({schema_version:z.literal(1),organization_id:uuid,scope:scopeSchema,actor_id:uuid,replayed:z.boolean(),receipt:mutationReceiptSchema,jobs:z.array(jobSchema).max(2),supplement:supplementReadSchema.nullable()}).strict();
// URL is a transient bearer result, never stored in job/source/history. Caller validates exact configured origin/path and <=60sec.
export const downloadSchema=z.object({schema_version:z.literal(1),organization_id:uuid,scope:scopeSchema,job_id:uuid,artifact_id:uuid,byte_sha256:sha,byte_size:z.number().int().min(1).max(20971520),expires_at:at,signed_url:z.string().url().max(8000),purpose:z.enum(['current_submission','historical_copy'])}).strict();
export const jobSummarySchema=z.object({id:uuid,revision:rev,stream,state:jobStateSchema,created_at:at,row_count:z.number().int().min(1).max(1000),source_currency:z.enum(['current','changed','unavailable'])}).strict();
const envelope={schema_version:z.literal(1),organization_id:uuid,scope:scopeSchema,actor_id:uuid};
export const readResultSchema=z.discriminatedUnion('kind',[
 z.object({...envelope,kind:z.literal('preview'),preview:previewSchema}).strict(),
 z.object({...envelope,kind:z.literal('job'),job:jobSchema}).strict(),
 z.object({...envelope,kind:z.literal('history'),job_id:uuid,events:z.array(eventSchema).max(50),ceiling_revision:rev,next_before_revision:rev.nullable()}).strict(),
 z.object({...envelope,kind:z.literal('receipt'),job_id:uuid,receipt:receiptProjectionSchema}).strict(),
 z.object({...envelope,kind:z.literal('jobs'),jobs:z.array(jobSummarySchema).max(50),next_after_id:uuid.nullable()}).strict(),
 z.object({...envelope,kind:z.literal('supplement'),supplement:supplementReadSchema.nullable()}).strict(),
 z.object({...envelope,kind:z.literal('download'),download:downloadSchema}).strict()
]);
export const errorSchema=z.object({schema_version:z.literal(1),code:z.enum(['INVALID_REQUEST','AUTH_REQUIRED','ACCESS_DENIED','SOURCE_UNAVAILABLE','SOURCE_CHANGED','READINESS_BLOCKED','TEMPLATE_CHANGED','IDEMPOTENCY_CONFLICT','REVISION_CONFLICT','ARTIFACT_UNAVAILABLE','FILE_GENERATION_FAILED','RECEIPT_MISMATCH','ILLEGAL_TRANSITION','DEPENDENCY_UNAVAILABLE']),retryable:z.boolean(),message:text(500)}).strict();
export type UC020Request=z.infer<typeof mutationRequestSchema>;
export type UC020ReadRequest=z.infer<typeof readRequestSchema>;
export type UC020Job=z.infer<typeof jobSchema>;
export type UC020Preview=z.infer<typeof previewSchema>;
export type UC020Supplement=z.infer<typeof supplementReadSchema>;
export type UC020Result=z.infer<typeof mutationResultSchema>;

// Pure mapping boundary. Inputs are fresh authorized UC019 projections captured by a
// future trusted orchestrator; parsing this shape does NOT grant database/file rights.
export const foundationContextSchema=z.object({schema_version:z.literal(1),organization_id:uuid,actor_id:uuid,scope:scopeSchema,as_of_date:date,stream,template:templateRefSchema,issuer_regime:issuerRegimeSchema}).strict()
 .refine(v=>v.template.template_id===(v.stream==='dpo'?'dpo20230116':'po16102026'));
export const mapperEntrySchema=z.object({record:issuanceRecordSchema,supplement:supplementReadSchema.nullable(),original:issuanceRecordSchema.nullable(),original_supplement:supplementReadSchema.nullable()}).strict();
export const foundationInputSchema=z.object({context:foundationContextSchema,items:z.array(mapperEntrySchema).min(1).max(1000)}).strict()
 .refine(v=>new Set(v.items.map(item=>item.record.official.id)).size===v.items.length);
export const blockedRecordSchema=z.object({record_id:uuid,issues:z.array(issueSchema).min(1).max(80)}).strict();
export const mappedBatchSchema=z.object({context:foundationContextSchema,rows:z.array(rowSchema).max(1000),blocked_records:z.array(blockedRecordSchema).max(1000),ready:z.boolean(),root_sha256:sha,signing:signingSchema,legal_policy_verification:z.literal('pending_primary_current_law')}).strict()
 .refine(v=>v.ready===(v.blocked_records.length===0&&v.rows.length>0&&v.rows.every(row=>row.ready)));
