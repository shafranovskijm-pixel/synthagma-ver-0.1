import {z} from 'zod';
import {journalUuid,journalHash,journalRevision,journalSchemaVersion,journalFieldsSchema,journalValuesSchema,validateJournalValues} from './contract.ts';
const instant=z.string().max(64).datetime({offset:true}),expected=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),page=journalUuid.nullable();
const title=z.string().trim().min(1).max(200),description=z.string().max(2000),reason=z.string().trim().min(1).max(1000);
export const scopedContextInputSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('organization')}).strict(),z.object({kind:z.literal('group'),group_id:journalUuid}).strict()]);
export type ScopedContextInput=z.infer<typeof scopedContextInputSchema>;
export const scopedProgramRefSchema=z.object({binding_id:journalUuid,binding_revision:journalRevision,version_id:journalUuid,binding_snapshot_hash:journalHash}).strict();
export const scopedContextSchema=z.object({kind:z.enum(['organization','group']),group_id:journalUuid.nullable(),course_id:journalUuid.nullable(),program_ref:scopedProgramRefSchema.nullable()}).strict().refine(v=>v.kind==='organization'?v.group_id===null&&v.course_id===null&&v.program_ref===null:v.group_id!==null);
export type ScopedJournalContext=z.infer<typeof scopedContextSchema>;
export const sameScopedJournalContext=(a:ScopedJournalContext,b:ScopedJournalContext)=>a.kind===b.kind&&a.group_id===b.group_id&&a.course_id===b.course_id&&(a.program_ref===null||b.program_ref===null?a.program_ref===b.program_ref:a.program_ref.binding_id===b.program_ref.binding_id&&a.program_ref.binding_revision===b.program_ref.binding_revision&&a.program_ref.version_id===b.program_ref.version_id&&a.program_ref.binding_snapshot_hash===b.program_ref.binding_snapshot_hash);
export const contextMatchesRequest=(context:ScopedJournalContext,input:ScopedContextInput)=>context.kind===input.kind&&(input.kind==='organization'?context.group_id===null:context.group_id===input.group_id);
export const scopedSubjectSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('person'),user_id:journalUuid}).strict(),z.object({kind:z.literal('none')}).strict()]);
export type ScopedJournalSubject=z.infer<typeof scopedSubjectSchema>;
export const scopedSourceSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('none')}).strict(),
 z.object({kind:z.literal('session'),session_id:journalUuid,session_version_id:journalUuid,content_hash:journalHash}).strict(),
 z.object({kind:z.literal('outcome'),program_enrollment_snapshot_id:journalUuid,state_id:journalUuid,revision:journalRevision,machine_id:journalUuid,machine_input_hash:journalHash,decision_id:journalUuid}).strict(),
]);
export type ScopedJournalSource=z.infer<typeof scopedSourceSchema>;
export const nonpersonalForbiddenSemantics=new Set(['full_name','phone','email','position','signature']);
export const allowsNonpersonal=(fields:ReadonlyArray<{semantic?:string}>)=>fields.every(field=>typeof field.semantic==='string'&&!nonpersonalForbiddenSemantics.has(field.semantic));
const summaryShape={id:journalUuid,title:z.string().max(200),description:z.string().max(2000),revision:journalRevision,archived:z.boolean(),current_schema_id:journalUuid,legacy_id:z.string().max(200).nullable(),redacted:z.boolean(),context:scopedContextSchema,source_current:z.boolean()};
export const scopedJournalSummarySchema=z.object(summaryShape).strict();
export const scopedJournalDetailSchema=z.object({...summaryShape,current_schema:journalSchemaVersion}).strict().refine(v=>v.current_schema_id===v.current_schema.id&&v.id===v.current_schema.journal_id);
export type ScopedJournalSummary=z.infer<typeof scopedJournalSummarySchema>;
export type ScopedJournalDetail=z.infer<typeof scopedJournalDetailSchema>;
const recordShape={id:journalUuid,journal_id:journalUuid,schema_version_id:journalUuid,revision:journalRevision,subject:scopedSubjectSchema,subject_label:z.string().max(240).nullable(),source:scopedSourceSchema,source_current:z.boolean(),values:journalValuesSchema,archived:z.boolean(),recorded_at:instant,recorded_by:journalUuid.nullable(),schema:journalSchemaVersion,redacted:z.boolean()};
function recordValid(v:{journal_id:string;schema_version_id:string;schema:z.infer<typeof journalSchemaVersion>;subject:ScopedJournalSubject;source:ScopedJournalSource;values:z.infer<typeof journalValuesSchema>;redacted:boolean}){
 return v.schema.id===v.schema_version_id&&v.schema.journal_id===v.journal_id&&(v.redacted||v.schema.redacted?Object.keys(v.values).length===0:validateJournalValues(v.schema.fields,v.values)&&(v.subject.kind==='person'||allowsNonpersonal(v.schema.fields)&&v.source.kind!=='outcome'));
}
export const scopedRecordSchema=z.object(recordShape).strict().refine(recordValid);
export type ScopedJournalRecord=z.infer<typeof scopedRecordSchema>;
const historyShape={id:journalUuid,record_id:journalUuid,revision:journalRevision,action:z.enum(['save_record','archive_record']),reason:z.string().max(1000),recorded_at:instant,recorded_by:journalUuid.nullable(),schema:journalSchemaVersion,subject:scopedSubjectSchema,subject_label:z.string().max(240).nullable(),source:scopedSourceSchema,values:journalValuesSchema,archived:z.boolean(),redacted:z.boolean()};
export const scopedHistorySchema=z.object(historyShape).strict().refine(v=>v.redacted||v.schema.redacted?Object.keys(v.values).length===0:validateJournalValues(v.schema.fields,v.values)&&(v.subject.kind==='person'||allowsNonpersonal(v.schema.fields)&&v.source.kind!=='outcome'));
export type ScopedJournalHistory=z.infer<typeof scopedHistorySchema>;
export const scopedExportSummarySchema=z.object({id:journalUuid,journal_id:journalUuid,record_count:z.number().int().min(0).max(1000),manifest_hash:journalHash,html_hash:journalHash,recorded_at:instant,recorded_by:journalUuid.nullable(),redacted:z.boolean()}).strict();
export const scopedExportDetailSchema=scopedExportSummarySchema.extend({manifest_text:z.string().max(8*1024*1024),html_text:z.string().max(8*1024*1024)}).strict();
export type ScopedJournalExport=z.infer<typeof scopedExportDetailSchema>;
export type ScopedJournalExportSummary=z.infer<typeof scopedExportSummarySchema>;
export const scopedManifestRecordSchema=z.object({...recordShape,history:z.array(scopedHistorySchema).max(10000)}).strict().refine(recordValid);
export const scopedExportManifestSchema=z.object({schema_version:z.literal(1),export_id:journalUuid,organization_id:journalUuid,context:scopedContextSchema,journal:z.object({id:journalUuid,title:z.string().max(200),description:z.string().max(2000),revision:journalRevision}).strict(),captured_at:instant,record_count:z.number().int().min(0).max(1000),records:z.array(scopedManifestRecordSchema).max(1000)}).strict();
export type ScopedExportManifest=z.infer<typeof scopedExportManifestSchema>;
export const scopedQuerySchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('list'),after_id:page,limit:z.number().int().min(1).max(50),include_archived:z.boolean()}).strict(),
 z.object({kind:z.literal('journal'),journal_id:journalUuid}).strict(),
 z.object({kind:z.literal('records'),journal_id:journalUuid,after_id:page,limit:z.number().int().min(1).max(25)}).strict(),
 z.object({kind:z.literal('history'),journal_id:journalUuid,record_id:journalUuid,after_revision:expected,limit:z.number().int().min(1).max(25)}).strict(),
 z.object({kind:z.literal('subjects'),journal_id:journalUuid,after_id:page,limit:z.number().int().min(1).max(50)}).strict(),
 z.object({kind:z.literal('sources'),journal_id:journalUuid,source_kind:z.enum(['session','outcome']),subject_user_id:journalUuid.nullable(),after_id:page,limit:z.number().int().min(1).max(25)}).strict(),
 z.object({kind:z.literal('exports'),journal_id:journalUuid,after_id:page,limit:z.number().int().min(1).max(25)}).strict(),
 z.object({kind:z.literal('export'),journal_id:journalUuid,export_id:journalUuid}).strict(),
]).refine(v=>v.kind!=='sources'||v.source_kind!=='outcome'||v.subject_user_id!==null);
export type ScopedJournalQuery=z.infer<typeof scopedQuerySchema>;
export const scopedActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),title,description,fields:journalFieldsSchema}).strict(),
 z.object({action:z.literal('save_schema'),journal_id:journalUuid,title,description,fields:journalFieldsSchema,reason}).strict(),
 z.object({action:z.literal('archive_journal'),journal_id:journalUuid,archived:z.boolean(),reason}).strict(),
 z.object({action:z.literal('save_record'),journal_id:journalUuid,record_id:journalUuid.nullable(),schema_version_id:journalUuid,subject:scopedSubjectSchema,source:scopedSourceSchema,values:journalValuesSchema,reason:z.string().max(1000)}).strict(),
 z.object({action:z.literal('archive_record'),journal_id:journalUuid,record_id:journalUuid,archived:z.boolean(),reason}).strict(),
 z.object({action:z.literal('capture_export'),journal_id:journalUuid}).strict(),
]).refine(v=>v.action!=='save_record'||(v.record_id===null||v.reason.trim().length>0)&&(v.subject.kind==='person'||v.source.kind!=='outcome'));
export type ScopedJournalAction=z.infer<typeof scopedActionSchema>;
const base={schema_version:z.literal(2),organization_id:journalUuid,context:scopedContextSchema,capabilities:z.object({can_read:z.boolean(),can_write:z.boolean()}).strict()};
export const scopedReadSchema=z.discriminatedUnion('kind',[
 z.object({...base,kind:z.literal('list'),journals:z.array(scopedJournalSummarySchema).max(50),next_after_id:page}).strict(),
 z.object({...base,kind:z.literal('journal'),journal:scopedJournalDetailSchema}).strict(),
 z.object({...base,kind:z.literal('records'),journal_id:journalUuid,records:z.array(scopedRecordSchema).max(25),next_after_id:page}).strict(),
 z.object({...base,kind:z.literal('history'),journal_id:journalUuid,record_id:journalUuid,history:z.array(scopedHistorySchema).max(25),next_after_revision:journalRevision.nullable()}).strict(),
 z.object({...base,kind:z.literal('subjects'),journal_id:journalUuid,subjects:z.array(z.object({user_id:journalUuid,label:z.string().max(240)}).strict()).max(50),next_after_id:page}).strict(),
 z.object({...base,kind:z.literal('sources'),journal_id:journalUuid,sources:z.array(z.object({id:journalUuid,label:z.string().max(240),source:scopedSourceSchema}).strict()).max(25),next_after_id:page}).strict(),
 z.object({...base,kind:z.literal('exports'),journal_id:journalUuid,exports:z.array(scopedExportSummarySchema).max(25),next_after_id:page}).strict(),
 z.object({...base,kind:z.literal('export'),journal_id:journalUuid,export:scopedExportDetailSchema}).strict(),
]);
export type ScopedJournalRead=z.infer<typeof scopedReadSchema>;
export const scopedMutationSchema=z.object({...base,receipt:z.object({request_id:journalUuid,action:z.enum(['create','save_schema','archive_journal','save_record','archive_record','capture_export']),journal_id:journalUuid,entity_id:journalUuid,revision_applied:journalRevision,outcome:z.enum(['applied','unchanged']),replayed:z.boolean()}).strict(),journal:scopedJournalDetailSchema,record:scopedRecordSchema.nullable(),export:scopedExportDetailSchema.nullable()}).strict();
export type ScopedJournalMutation=z.infer<typeof scopedMutationSchema>;
export const scopedErrorCodeSchema=z.enum(['ACCESS_DENIED','INVALID_INPUT','NOT_FOUND','REVISION_CONFLICT','REQUEST_CONFLICT','SOURCE_UNAVAILABLE','DEPENDENCY_UNAVAILABLE','LIMIT_EXCEEDED']);
export type ScopedJournalErrorCode=z.infer<typeof scopedErrorCodeSchema>;
export const scopedErrorSchema=z.object({code:scopedErrorCodeSchema}).strict();
