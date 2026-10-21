import { z } from 'zod';

// All wire objects are strict. Retain the original timestamp strings, including
// PostgreSQL microseconds; Date is used only to validate instants, never to hash.
export const educationUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const educationHash = z.string().regex(/^[0-9a-f]{64}$/);
export const educationRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const educationExpectedRevision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const educationInstant = z.string().max(64).datetime({offset:true});
export const educationDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const d = new Date(value+'T00:00:00Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
});
export const educationZone = z.string().min(1).max(100).refine(value => {try {new Intl.DateTimeFormat('en',{timeZone:value});return true;} catch {return false;}});
const text = (max:number) => z.string().min(1).max(max).refine(v=>v.trim()===v);
export const educationReason = text(2000);
export const academicHours = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/).refine(v=>Number(v)>0 && Number(v)<=10000);
const totalHours = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/).refine(v=>Number(v)<=2500000);
const ids = (max=1000) => z.array(educationUuid).max(max).refine(v=>new Set(v).size===v.length);
export const educationScopeSchema = z.object({organization_id:educationUuid,group_id:educationUuid,course_id:educationUuid}).strict();
export const programRefSchema = z.object({binding_id:educationUuid,binding_revision:educationRevision,program_id:educationUuid,version_id:educationUuid,
  binding_snapshot_hash:educationHash,file_document_id:educationUuid,file_version_id:educationUuid,file_review_id:educationUuid,facts_hash:educationHash}).strict();
export const prerequisiteCodeSchema = z.enum(['NO_GROUP_COURSE','NO_UC111_BINDING','PROGRAM_SOURCE_UNAVAILABLE','HISTORY_NOT_INITIALIZED','TIMEZONE_REQUIRED','TEACHER_REQUIRED','HOURS_REQUIRED','PLAN_PARTIAL','LEGACY_HISTORY_UNKNOWN','LEGACY_SOURCE_CHANGED','SOURCE_ERASED','TEMPLATE_INCOMPATIBLE','LEGACY_DISPLAY_UNAVAILABLE','COVERAGE_GAP','ROSTER_LIMIT_EXCEEDED','HISTORY_DETAIL_UNAVAILABLE','HISTORY_REVISION_CAPACITY','DISPLAY_LABEL_UNAVAILABLE','LEGAL_NAME_EVIDENCE_REQUIRED']);
export const prerequisiteSchema = z.object({code:prerequisiteCodeSchema,label:text(240),target:z.enum(['group','program','history','calendar','lesson','document']),lesson_id:educationUuid.nullable()}).strict();
const prerequisites = z.array(prerequisiteSchema).max(100);
export const capabilitiesSchema = z.object({can_read:z.boolean(),can_initialize:z.boolean(),can_correct_membership_time:z.boolean(),can_edit_calendar:z.boolean(),can_publish_calendar:z.boolean(),can_capture_snapshot:z.boolean(),can_recover_coverage:z.boolean()}).strict();
export const countSchema = z.object({exact_count:z.number().int().min(0).max(1000).nullable(),count_lower_bound:z.number().int().min(0).max(1001)}).strict()
  .refine(v=>v.exact_count===null || v.count_lower_bound===v.exact_count);
export const coverageSchema = z.enum(['complete_observed','unknown_legacy','unknown_gap','source_unavailable']);
export const coverageGapSchema = z.object({id:educationUuid,started_at:educationInstant,last_complete_revision:educationRevision,
  reason:z.enum(['history_detail_budget','source_cardinality','revision_capacity','source_unavailable','source_changed']),recovered_at:educationInstant.nullable(),recovery_revision:educationRevision.nullable(),recovery_segment_id:educationUuid.nullable()}).strict()
  .refine(v=>(v.recovered_at===null)===(v.recovery_revision===null) && (v.recovered_at===null)===(v.recovery_segment_id===null));
export const labelSourceSchema = z.discriminatedUnion('kind',[
  z.object({kind:z.literal('authorized_current_profile'),subject_user_id:educationUuid}).strict(),
  z.object({kind:z.literal('retained_observation'),event_id:educationUuid}).strict(),
]);
const labelState = z.enum(['available','unavailable','redacted']);
const labelFields = {subject_label:text(240).nullable(),label_state:labelState,label_observed_at:educationInstant.nullable(),label_source:labelSourceSchema.nullable()};
const labelValid = (v:{subject_label?:string|null;label_state?:string;label_observed_at?:string|null;label_source?:unknown}) => v.label_state==='available'
  ? v.subject_label!==null && v.label_observed_at!==null && v.label_source!==null : v.subject_label===null && v.label_observed_at===null && v.label_source===null;
export const rosterRowSchema = z.object({user_id:educationUuid,...labelFields,enrollment_id:educationUuid.nullable(),program_enrollment_snapshot_id:educationUuid.nullable(),
  association:z.enum(['confirmed','no_exact_enrollment','no_program_snapshot']),membership_basis:z.enum(['observed','corrected']),effective_from:educationInstant.nullable(),effective_until:educationInstant.nullable(),observed_since:educationInstant,source_event_ids:ids(4)}).strict()
  .refine(labelValid).refine(v=>v.association==='confirmed' ? !!v.enrollment_id && !!v.program_enrollment_snapshot_id : v.association==='no_exact_enrollment' ? v.enrollment_id===null && v.program_enrollment_snapshot_id===null : !!v.enrollment_id && v.program_enrollment_snapshot_id===null);
export const educationStateSchema = z.object({scope:educationScopeSchema,revision:educationRevision,coverage_known_from:educationInstant,timezone:educationZone,program_ref:programRefSchema,
  draft_calendar_id:educationUuid.nullable(),published_calendar_id:educationUuid.nullable(),legacy_calendar_changed:z.boolean(),recorded_at:educationInstant,prerequisites,capabilities:capabilitiesSchema,
  coverage:coverageSchema,coverage_segment_id:educationUuid.nullable(),active_gap:coverageGapSchema.nullable(),membership_count:countSchema}).strict();
export const legacyCalendarSchema = z.object({source:z.literal('legacy_display'),start_date:educationDate.nullable(),end_date:educationDate.nullable(),training_dates:z.array(educationDate).max(250),schedule_text:z.string().max(4000).nullable(),instructor_name:z.string().max(1000).nullable(),source_hash:educationHash}).strict();
export const groupEducationEnvelopeSchema = z.object({schema_version:z.literal(1),organization_id:educationUuid,group_id:educationUuid,scope:educationScopeSchema.nullable(),persisted:z.boolean(),state:educationStateSchema.nullable(),program_ref:programRefSchema.nullable(),legacy_calendar:legacyCalendarSchema.nullable(),prerequisites,capabilities:capabilitiesSchema}).strict()
  .refine(v=>v.persisted===(v.state!==null)).refine(v=>!v.state || v.scope!==null && v.scope.organization_id===v.organization_id && v.scope.group_id===v.group_id && v.state.scope.course_id===v.scope.course_id && v.state.scope.group_id===v.group_id && v.state.scope.organization_id===v.organization_id);
export const asOfSchema = z.discriminatedUnion('kind',[z.object({kind:z.literal('current')}).strict(),z.object({kind:z.literal('at'),at:educationInstant,timezone:educationZone}).strict()]);
export const groupRosterPageSchema = z.object({schema_version:z.literal(1),scope:educationScopeSchema,as_of:educationInstant,timezone:educationZone,knowledge_revision:educationRevision,
  coverage:coverageSchema,coverage_known_from:educationInstant,rows:z.array(rosterRowSchema).max(100),next_after_user_id:educationUuid.nullable(),prerequisites,
  excluded_archived_count:countSchema,coverage_segment_id:educationUuid.nullable(),coverage_gap:coverageGapSchema.nullable(),count:countSchema}).strict()
  .refine(v=>v.coverage==='complete_observed' ? v.count.exact_count!==null && v.coverage_segment_id!==null : v.rows.length===0 && v.count.exact_count===null && v.next_after_user_id===null);

const lessonFields = {local_date:educationDate,starts_at:educationInstant.nullable(),ends_at:educationInstant.nullable(),topic:text(1000),module_label:text(160).nullable(),course_lesson_id:educationUuid.nullable(),academic_hours:academicHours.nullable(),teacher_user_id:educationUuid.nullable(),status:z.enum(['planned','cancelled']),cancellation_reason:educationReason.nullable()};
export const lessonInputSchema = z.object({lesson_id:educationUuid.nullable(),...lessonFields}).strict();
export const lessonSchema = z.object({lesson_id:educationUuid,...lessonFields,teacher_label:text(240).nullable(),teacher_source_hash:educationHash.nullable(),teacher_label_state:labelState,teacher_label_observed_at:educationInstant.nullable(),teacher_label_source:labelSourceSchema.nullable()}).strict();
export const calendarSelectionSchema = z.discriminatedUnion('kind',[z.object({kind:z.literal('current'),view:z.enum(['draft','published'])}).strict(),z.object({kind:z.literal('version'),version_id:educationUuid}).strict()]);
export const calendarSchema = z.object({id:educationUuid,scope:educationScopeSchema,revision_created:educationRevision,state:z.enum(['draft','published','superseded']),timezone:educationZone,
  planned_start_date:educationDate,planned_end_date:educationDate,coverage:z.enum(['whole_program','partial_plan']),partial_reason:educationReason.nullable(),program_ref:programRefSchema,
  lessons:z.array(lessonSchema).max(250),academic_hours_total:totalHours.nullable(),content_hash:educationHash,recorded_at:educationInstant,recorded_by:educationUuid.nullable(),published_at:educationInstant.nullable(),published_by:educationUuid.nullable(),prerequisites,
  known_academic_hours_total:totalHours,missing_hours_count:z.number().int().min(0).max(250)}).strict().superRefine((v,ctx)=>{
    const planned=v.lessons.filter(l=>l.status==='planned'),missing=planned.filter(l=>l.academic_hours===null).length;
    const cents=planned.reduce((n,l)=>n+Math.round(Number(l.academic_hours??0)*100),0);
    if(v.missing_hours_count!==missing || Math.round(Number(v.known_academic_hours_total)*100)!==cents || (v.academic_hours_total===null)!==(missing>0) || v.academic_hours_total!==null && Math.round(Number(v.academic_hours_total)*100)!==cents)ctx.addIssue({code:'custom',message:'Invalid hour totals'});
    if(v.planned_start_date>v.planned_end_date || v.lessons.some(l=>l.local_date<v.planned_start_date || l.local_date>v.planned_end_date) || new Set(v.lessons.map(l=>l.lesson_id)).size!==v.lessons.length)ctx.addIssue({code:'custom',message:'Invalid lesson range'});
    const erasedTeacher=(l:typeof planned[number])=>l.teacher_label_state==='redacted' && l.teacher_user_id===null && l.teacher_source_hash===null && v.prerequisites.some(p=>p.code==='SOURCE_ERASED'&&p.target==='calendar'&&p.lesson_id===null) && v.prerequisites.some(p=>p.code==='TEACHER_REQUIRED'&&p.target==='calendar'&&p.lesson_id===null);
    if(v.state!=='draft' && (!planned.length || missing || planned.some(l=>!l.teacher_user_id&&!erasedTeacher(l))))ctx.addIssue({code:'custom',message:'Incomplete published plan'});
    if(v.coverage==='partial_plan' && !v.partial_reason)ctx.addIssue({code:'custom',message:'Partial reason required'});
    for(const l of v.lessons){if((l.starts_at===null)!==(l.ends_at===null) || l.starts_at && l.ends_at && (Date.parse(l.ends_at)<=Date.parse(l.starts_at)||Date.parse(l.ends_at)-Date.parse(l.starts_at)>86400000) || l.status==='cancelled' && !l.cancellation_reason)ctx.addIssue({code:'custom',message:'Invalid lesson timing'});
      if(l.starts_at){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:v.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(l.starts_at));const part=(key:string)=>parts.find(p=>p.type===key)?.value;const local=part('year')+'-'+part('month')+'-'+part('day');if(local!==l.local_date)ctx.addIssue({code:'custom',message:'Timezone date mismatch'});}
      if(!labelValid({subject_label:l.teacher_label,label_state:l.teacher_label_state,label_observed_at:l.teacher_label_observed_at,label_source:l.teacher_label_source}))ctx.addIssue({code:'custom',message:'Invalid teacher label'});}
  });
export const groupCalendarResponseSchema = z.object({schema_version:z.literal(1),scope:educationScopeSchema,selection:calendarSelectionSchema,calendar:calendarSchema.nullable(),prerequisites}).strict();
const purpose = z.enum(['document_batch','lesson_roster','assessment_draft']);
export const snapshotHeaderSchema = z.object({id:educationUuid,scope:educationScopeSchema,as_of:educationInstant,timezone:educationZone,knowledge_revision:educationRevision,coverage:z.literal('complete_observed'),calendar_version_id:educationUuid,calendar_hash:educationHash,program_ref:programRefSchema,roster_hash:educationHash,source_hash:educationHash,row_count:z.number().int().min(0).max(1000),redacted_count:z.number().int().min(0).max(1000),purpose,recorded_at:educationInstant,recorded_by:educationUuid.nullable(),available:z.boolean(),prerequisites,coverage_segment_id:educationUuid,coverage_known_from:educationInstant}).strict();
export const programFactsSnapshotSchema = z.object({schema_version:z.literal(1),full_title:text(4000),program_type:z.enum(['dpo_upskilling','dpo_retraining','professional_training','internal_nonformal']),academic_hours:z.number().int().min(1).max(999999),training_form:z.enum(['full_time','part_time','mixed']),uses_elearning:z.boolean().nullable(),uses_distance_learning:z.boolean().nullable(),duration_calendar:text(4000),attestation_form:text(4000),attestation_criteria:text(4000),qualification:z.string().max(4000).nullable(),profession:z.string().max(4000).nullable()}).strict();
export const retainedProgramProofSchema = z.object({schema_version:z.literal(1),state:z.literal('confirmed'),organization_id:educationUuid,group_id:educationUuid,course_id:educationUuid,program_id:educationUuid,version_id:educationUuid,file_document_id:educationUuid,file_version_id:educationUuid,file_review_id:educationUuid,facts_hash:educationHash,binding_id:educationUuid,binding_revision:educationRevision,binding_snapshot_hash:educationHash,enrollment_snapshot_ids:ids(),facts_snapshot:programFactsSnapshotSchema,
  group_snapshot:z.object({name:z.string().max(4000).nullable(),start_date:educationDate.nullable(),end_date:educationDate.nullable(),training_dates:z.array(educationDate).max(250).nullable(),schedule_text:z.string().max(4000).nullable(),instructor_name:z.string().max(4000).nullable()}).strict()}).strict();
export const artifactProjectionSchema = z.object({schema_version:z.literal(1),scope:educationScopeSchema,snapshot_id:educationUuid,source_hash:educationHash,program_facts:retainedProgramProofSchema,calendar:calendarSchema,as_of:educationInstant,knowledge_revision:educationRevision,coverage_segment_id:educationUuid,display_label_notice:z.literal('display_labels_observed_separately_not_verified_legal_names')}).strict()
  .refine(v=>v.calendar.state!=='draft' && !v.calendar.prerequisites.some(p=>p.code==='SOURCE_ERASED') && v.calendar.lessons.filter(l=>l.status==='planned').every(l=>l.teacher_user_id!==null&&l.teacher_label_state==='available'&&l.teacher_source_hash!==null));
export const educationSourceSchema = z.object({schema_version:z.literal(1),snapshot_id:educationUuid,source_hash:educationHash,roster_hash:educationHash,calendar_version_id:educationUuid,calendar_hash:educationHash,as_of:educationInstant,timezone:educationZone,knowledge_revision:educationRevision,coverage_segment_id:educationUuid}).strict();
export const groupSnapshotPageSchema = z.object({schema_version:z.literal(1),header:snapshotHeaderSchema,rows:z.array(rosterRowSchema).max(100),next_after_user_id:educationUuid.nullable(),artifact_projection:artifactProjectionSchema.nullable()}).strict();

const eventPayloads = {
  initialized:z.object({coverage_known_from:educationInstant,coverage_segment_id:educationUuid,timezone:educationZone,baseline_present_count:z.number().int().min(0).max(1000),baseline_archived_count:z.number().int().min(0).max(1000),label_observation_hash:educationHash}).strict(),
  membership_observed:z.object({change:z.enum(['join','leave','archive','unarchive','source_edge']),previous_present:z.boolean(),next_present:z.boolean(),previous_archived:z.boolean(),next_archived:z.boolean(),source:z.enum(['primary','additional','profile_archive','registration','group_lifecycle']),...labelFields}).strict(),
  membership_time_corrected:z.object({event_id:educationUuid,previous_effective_at:educationInstant,corrected_effective_at:educationInstant,expected_event_hash:educationHash}).strict(),
  calendar_saved:z.object({version_id:educationUuid,content_hash:educationHash,base_version_id:educationUuid.nullable()}).strict(),
  calendar_published:z.object({version_id:educationUuid,content_hash:educationHash,previous_published_id:educationUuid.nullable()}).strict(),
  roster_captured:z.object({snapshot_id:educationUuid,source_hash:educationHash,as_of:educationInstant,knowledge_revision:educationRevision}).strict(),
  legacy_calendar_changed:z.object({changed_fields:z.array(z.enum(['start_date','end_date','training_dates','schedule_text','instructor_name'])).max(5),previous_hash:educationHash,next_hash:educationHash}).strict(),
  association_observed:z.object({enrollment_id:educationUuid.nullable(),program_enrollment_snapshot_id:educationUuid.nullable(),previous_enrollment_id:educationUuid.nullable(),previous_program_enrollment_snapshot_id:educationUuid.nullable(),source:z.enum(['enrollment','program_association']),observed_at:educationInstant}).strict(),
  coverage_gap:z.object({gap:coverageGapSchema}).strict(),
  coverage_recovered:z.object({gap:coverageGapSchema,baseline_observed_at:educationInstant,baseline_present_count:z.number().int().min(0).max(1000),baseline_archived_count:z.number().int().min(0).max(1000),label_observation_hash:educationHash,program_ref:programRefSchema}).strict(),
};
const eventBase={id:educationUuid,scope:educationScopeSchema,revision:educationRevision,recorded_at:educationInstant,effective_at:educationInstant.nullable(),actor_id:educationUuid.nullable(),origin:z.enum(['authenticated','system','service']),reason:educationReason.nullable(),subject_user_id:educationUuid.nullable(),source_event_id:educationUuid.nullable(),calendar_version_id:educationUuid.nullable(),snapshot_id:educationUuid.nullable(),input_hash:educationHash,authority_snapshot_hash:educationHash};
const eventVariants=Object.entries(eventPayloads).map(([action,payload])=>z.object({...eventBase,action:z.literal(action),payload}).strict());
export const educationEventSchema=z.union(eventVariants as [typeof eventVariants[number],typeof eventVariants[number],...typeof eventVariants[number][]]);
export const groupEducationHistorySchema=z.object({schema_version:z.literal(1),scope:educationScopeSchema,events:z.array(educationEventSchema).max(50),next_after_revision:educationExpectedRevision.nullable(),ceiling_revision:educationRevision,current_revision:educationRevision,current_coverage:coverageSchema,active_gap:coverageGapSchema.nullable()}).strict();
export const groupEducationOptionsSchema=z.object({schema_version:z.literal(1),scope:educationScopeSchema,facet:z.enum(['teachers','course_lessons']),items:z.array(z.object({id:educationUuid,label:text(240)}).strict()).max(50),next_after_id:educationUuid.nullable()}).strict();
const saveFields={base_version_id:educationUuid.nullable(),expected_program_ref:programRefSchema,timezone:educationZone,planned_start_date:educationDate,planned_end_date:educationDate,coverage:z.enum(['whole_program','partial_plan']),partial_reason:educationReason.nullable(),lessons:z.array(lessonInputSchema).max(250),reason:educationReason};
export const educationActionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('initialize_history'),timezone:educationZone,expected_program_ref:programRefSchema,reason:educationReason}).strict(),
  z.object({action:z.literal('correct_membership_time'),event_id:educationUuid,expected_event_hash:educationHash,corrected_effective_at:educationInstant,reason:educationReason}).strict(),
  z.object({action:z.literal('save_calendar_version'),...saveFields}).strict(),
  z.object({action:z.literal('publish_calendar_version'),version_id:educationUuid,expected_content_hash:educationHash,expected_program_ref:programRefSchema,reason:educationReason}).strict(),
  z.object({action:z.literal('capture_roster_snapshot'),as_of:asOfSchema,knowledge_revision:educationRevision,calendar_version_id:educationUuid,expected_calendar_hash:educationHash,expected_program_ref:programRefSchema,purpose,reason:educationReason}).strict(),
  z.object({action:z.literal('recover_coverage'),gap_id:educationUuid,expected_program_ref:programRefSchema,reason:educationReason}).strict(),
]);
export const educationQuerySchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('state')}).strict(),
  z.object({kind:z.literal('roster'),as_of:asOfSchema,knowledge_revision:educationRevision.nullable(),after_user_id:educationUuid.nullable(),limit:z.number().int().min(1).max(100)}).strict(),
  z.object({kind:z.literal('calendar'),selection:calendarSelectionSchema}).strict(),
  z.object({kind:z.literal('history'),after_revision:educationExpectedRevision,ceiling_revision:educationRevision.nullable(),limit:z.number().int().min(1).max(50)}).strict(),
  z.object({kind:z.literal('options'),facet:z.enum(['teachers','course_lessons']),after_id:educationUuid.nullable(),limit:z.number().int().min(1).max(50)}).strict(),
  z.object({kind:z.literal('snapshot'),snapshot_id:educationUuid,after_user_id:educationUuid.nullable(),limit:z.number().int().min(1).max(100)}).strict(),
]);
export const educationActionNames=['initialize_history','correct_membership_time','save_calendar_version','publish_calendar_version','capture_roster_snapshot','recover_coverage'] as const;
export const educationReceiptSchema=z.object({request_id:educationUuid,action:z.enum(educationActionNames),input_hash:educationHash,revision_applied:educationRevision,event_id:educationUuid,calendar_version_id:educationUuid.nullable(),snapshot_id:educationUuid.nullable(),replayed:z.boolean()}).strict();
export const groupEducationMutationSchema=z.object({schema_version:z.literal(1),envelope:groupEducationEnvelopeSchema,receipt:educationReceiptSchema,event:educationEventSchema}).strict();
export const educationErrorCodeSchema=z.enum(['ACCESS_DENIED','NOT_FOUND','INVALID_INPUT','PREREQUISITE_MISSING','REVISION_CONFLICT','REQUEST_CONFLICT','SOURCE_CHANGED','LEGACY_HISTORY_UNKNOWN','LIMIT_EXCEEDED','TEMPLATE_INCOMPATIBLE','DEPENDENCY_UNAVAILABLE','COVERAGE_GAP','SOURCE_UNAVAILABLE']);
export const educationErrorSchema=z.object({code:educationErrorCodeSchema,message:text(240)}).strict();
// The application's legacy strictNullChecks=false makes Zod infer required
// keys as optional. Restore only required wire keys, after runtime validation.
export type RequiredWire<T> = T extends Array<infer U> ? RequiredWire<U>[] : T extends object ? {[K in keyof T]-?:RequiredWire<T[K]>} : T;
export type EducationScope=RequiredWire<z.infer<typeof educationScopeSchema>>;
export type ProgramRef=RequiredWire<z.infer<typeof programRefSchema>>;
export type EducationEnvelope=RequiredWire<z.infer<typeof groupEducationEnvelopeSchema>>;
export type EducationState=RequiredWire<z.infer<typeof educationStateSchema>>;
export type RosterRow=RequiredWire<z.infer<typeof rosterRowSchema>>;
export type RosterPage=RequiredWire<z.infer<typeof groupRosterPageSchema>>;
export type EducationCalendar=RequiredWire<z.infer<typeof calendarSchema>>;
export type CalendarResponse=RequiredWire<z.infer<typeof groupCalendarResponseSchema>>;
export type CalendarSelection=RequiredWire<z.infer<typeof calendarSelectionSchema>>;
export type LessonInput=RequiredWire<z.infer<typeof lessonInputSchema>>;
export type EducationHistory=RequiredWire<z.infer<typeof groupEducationHistorySchema>>;
export type EducationOptions=RequiredWire<z.infer<typeof groupEducationOptionsSchema>>;
export type SnapshotPage=RequiredWire<z.infer<typeof groupSnapshotPageSchema>>;
export type ArtifactProjection=RequiredWire<z.infer<typeof artifactProjectionSchema>>;
export type EducationSource=RequiredWire<z.infer<typeof educationSourceSchema>>;
export type EducationAction=RequiredWire<z.infer<typeof educationActionSchema>>;
export type EducationQuery=RequiredWire<z.infer<typeof educationQuerySchema>>;
export type EducationMutation=RequiredWire<z.infer<typeof groupEducationMutationSchema>>;
export type EducationErrorCode=z.infer<typeof educationErrorCodeSchema>;
export type AsOf=RequiredWire<z.infer<typeof asOfSchema>>;
