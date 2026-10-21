import { z } from 'zod';

export const journalUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const journalHash = z.string().regex(/^[0-9a-f]{64}$/);
export const journalRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const expectedRevision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const instant = z.string().max(64).datetime({ offset: true });
export const legacyFieldIds = ['full_name','phone','email','position','organization','doc_number','doc_date','doc_type','event_date','event_time','location','topic','result','grade','notes','signature'] as const;
export const fieldSemantic = z.enum([...legacyFieldIds, 'custom']);
export const fieldType = z.enum(['text','long_text','date','time','decimal','integer','boolean','select']);
export const journalFieldSchema = z.object({
  id: z.string().min(1).max(80), label: z.string().trim().min(1).max(120), type: fieldType,
  semantic: fieldSemantic, options: z.array(z.string().min(1).max(80)).min(1).max(50).optional(),
}).strict().superRefine((field, ctx) => {
  const expected = field.semantic === 'doc_date' || field.semantic === 'event_date' ? 'date'
    : field.semantic === 'event_time' ? 'time' : field.semantic === 'grade' ? 'decimal'
    : field.semantic === 'notes' ? 'long_text' : 'text';
  if (field.semantic === 'custom' ? !journalUuid.safeParse(field.id).success : field.id !== field.semantic || field.type !== expected)
    ctx.addIssue({ code: 'custom', message: 'Invalid stable field identity/type' });
  if (field.type === 'select' ? !field.options || new Set(field.options).size !== field.options.length : field.options !== undefined)
    ctx.addIssue({ code: 'custom', message: 'Invalid field options' });
});
export const journalFieldsSchema = z.array(journalFieldSchema).min(1).max(32)
  .refine(fields => new Set(fields.map(f => f.id)).size === fields.length, 'Duplicate field ID');
export type JournalField = z.infer<typeof journalFieldSchema>;
export const journalValuesSchema = z.record(z.union([z.string(), z.number().finite(), z.boolean(), z.null()]));
export type JournalValues = z.infer<typeof journalValuesSchema>;
export function validateJournalValues(fields: JournalField[], values: JournalValues): boolean {
  if (new TextEncoder().encode(JSON.stringify(values)).length > 32768) return false;
  const known = new Map(fields.map(f => [f.id, f]));
  return Object.entries(values).every(([key, value]) => {
    const f = known.get(key); if (!f) return false; if (value === null) return true;
    if (f.type === 'boolean') return typeof value === 'boolean';
    if (f.type === 'integer') return typeof value === 'number' && Number.isSafeInteger(value);
    if (typeof value !== 'string' || value.length > 4000) return false;
    if (f.type === 'decimal') return /^-?(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value);
    if (f.type === 'date') { const date = new Date(value + 'T00:00:00.000Z'); return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value; }
    if (f.type === 'time') return /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
    if (f.type === 'select') return !!f.options?.includes(value);
    return true;
  });
}
const schemaFields = z.array(journalFieldSchema).max(32);
export const journalSchemaVersion = z.object({ id:journalUuid,journal_id:journalUuid,version:journalRevision,hash:journalHash,
  fields:schemaFields,created_at:instant,created_by:journalUuid.nullable(),redacted:z.boolean(),
}).strict().refine(v => v.redacted ? v.fields.length === 0 : journalFieldsSchema.safeParse(v.fields).success);
export type JournalSchemaVersion = z.infer<typeof journalSchemaVersion>;
export const journalSummarySchema = z.object({id:journalUuid,title:z.string().max(200),description:z.string().max(2000),revision:journalRevision,
  archived:z.boolean(),current_schema_id:journalUuid,legacy_id:z.string().max(200).nullable(),redacted:z.boolean()}).strict();
export const journalDetailSchema = journalSummarySchema.extend({current_schema:journalSchemaVersion}).strict()
  .refine(v => v.current_schema_id === v.current_schema.id && v.id === v.current_schema.journal_id);
export type JournalSummary = z.infer<typeof journalSummarySchema>;
export type JournalDetail = z.infer<typeof journalDetailSchema>;
export const journalRecordSchema = z.object({id:journalUuid,journal_id:journalUuid,schema_version_id:journalUuid,revision:journalRevision,
  subject_user_id:journalUuid.nullable(),values:journalValuesSchema,archived:z.boolean(),recorded_at:instant,recorded_by:journalUuid.nullable(),
  schema:journalSchemaVersion,redacted:z.boolean()}).strict().refine(v => v.schema.id === v.schema_version_id && v.schema.journal_id === v.journal_id
    && (v.redacted || v.schema.redacted ? Object.keys(v.values).length === 0 : v.subject_user_id !== null && validateJournalValues(v.schema.fields,v.values)));
export type JournalRecord = z.infer<typeof journalRecordSchema>;
export const journalHistorySchema = z.object({id:journalUuid,record_id:journalUuid,revision:journalRevision,action:z.enum(['save_record','archive_record']),
  reason:z.string().max(1000),recorded_at:instant,recorded_by:journalUuid.nullable(),schema:journalSchemaVersion,values:journalValuesSchema,
  subject_user_id:journalUuid.nullable(),archived:z.boolean(),redacted:z.boolean()}).strict()
  .refine(v => v.redacted || v.schema.redacted ? Object.keys(v.values).length === 0 : v.subject_user_id !== null && validateJournalValues(v.schema.fields,v.values));
export type JournalHistory = z.infer<typeof journalHistorySchema>;
export const legacyDefinitionSchema = z.object({id:z.string().min(1).max(200).regex(/^custom_[A-Za-z0-9_-]+$/),title:z.string().trim().min(1).max(200),
  description:z.string().max(2000),fields:z.array(z.enum(legacyFieldIds)).min(1).max(16),createdAt:z.string().max(100).optional()}).strict()
  .refine(v => new Set(v.fields).size === v.fields.length);
export type LegacyDefinition = z.infer<typeof legacyDefinitionSchema>;
const legacyRecord = z.object({id:journalUuid,journal_id:journalUuid,journal_title:z.string(),course_id:journalUuid.nullable(),user_id:journalUuid,
  entry_date:z.string(),entry_type:z.string(),value:z.string().nullable(),notes:z.string().nullable(),created_at:instant,updated_at:instant}).strict();
export type LegacyJournalRecord = z.infer<typeof legacyRecord>;
const pageId = journalUuid.nullable();
export const journalQuerySchema = z.discriminatedUnion('kind',[
  z.object({kind:z.literal('list'),after_id:pageId,limit:z.number().int().min(1).max(50),include_archived:z.boolean()}).strict(),
  z.object({kind:z.literal('journal'),journal_id:journalUuid}).strict(),
  z.object({kind:z.literal('records'),journal_id:journalUuid,after_id:pageId,limit:z.number().int().min(1).max(25)}).strict(),
  z.object({kind:z.literal('history'),journal_id:journalUuid,record_id:journalUuid,after_revision:z.number().int().min(0),limit:z.number().int().min(1).max(25)}).strict(),
  z.object({kind:z.literal('subjects'),after_id:pageId,limit:z.number().int().min(1).max(50)}).strict(),
  z.object({kind:z.literal('preview_legacy'),definition:legacyDefinitionSchema}).strict(),
  z.object({kind:z.literal('legacy_inventory'),after_legacy_id:z.string().min(1).max(200).regex(/^custom_[A-Za-z0-9_-]+$/).nullable(),limit:z.number().int().min(1).max(50)}).strict(),
  z.object({kind:z.literal('legacy_records'),legacy_id:z.string().min(1).max(200).regex(/^custom_[A-Za-z0-9_-]+$/),after_id:pageId,limit:z.number().int().min(1).max(25)}).strict(),
]);
export type JournalQuery = z.infer<typeof journalQuerySchema>;
const title = z.string().trim().min(1).max(200), description = z.string().max(2000), reason = z.string().trim().min(1).max(1000);
export const journalActionSchema = z.discriminatedUnion('action',[
  z.object({action:z.literal('create'),title,description,fields:journalFieldsSchema}).strict(),
  z.object({action:z.literal('save_schema'),journal_id:journalUuid,title,description,fields:journalFieldsSchema,reason}).strict(),
  z.object({action:z.literal('archive_journal'),journal_id:journalUuid,archived:z.boolean(),reason}).strict(),
  z.object({action:z.literal('save_record'),journal_id:journalUuid,record_id:journalUuid.nullable(),schema_version_id:journalUuid,subject_user_id:journalUuid,values:journalValuesSchema,reason:z.string().max(1000)}).strict(),
  z.object({action:z.literal('archive_record'),journal_id:journalUuid,record_id:journalUuid,archived:z.boolean(),reason}).strict(),
  z.object({action:z.literal('import_definition'),definition:legacyDefinitionSchema}).strict(),
]);
export type JournalAction = z.infer<typeof journalActionSchema>;
const base = {schema_version:z.literal(1),organization_id:journalUuid,capabilities:z.object({can_read:z.boolean(),can_write:z.boolean()}).strict()};
export const journalReadSchema = z.discriminatedUnion('kind',[
  z.object({...base,kind:z.literal('list'),journals:z.array(journalSummarySchema).max(50),next_after_id:pageId}).strict(),
  z.object({...base,kind:z.literal('journal'),journal:journalDetailSchema}).strict(),
  z.object({...base,kind:z.literal('records'),journal_id:journalUuid,records:z.array(journalRecordSchema).max(25),next_after_id:pageId}).strict(),
  z.object({...base,kind:z.literal('history'),journal_id:journalUuid,record_id:journalUuid,history:z.array(journalHistorySchema).max(25),next_after_revision:z.number().int().min(1).nullable()}).strict(),
  z.object({...base,kind:z.literal('subjects'),subjects:z.array(z.object({user_id:journalUuid,label:z.string().max(240)}).strict()).max(50),next_after_id:pageId}).strict(),
  z.object({...base,kind:z.literal('preview_legacy'),legacy_id:z.string().min(1).max(200).regex(/^custom_[A-Za-z0-9_-]+$/),preview:z.object({state:z.enum(['ready','already_imported','conflict','invalid']),reason:z.string().max(1000),server_legacy_instance_count:z.number().int().min(0),server_legacy_entry_count:z.number().int().min(0),journal_id:journalUuid.nullable()}).strict()}).strict(),
  z.object({...base,kind:z.literal('legacy_inventory'),legacy_journals:z.array(z.object({legacy_id:z.string().min(1).max(200).regex(/^custom_[A-Za-z0-9_-]+$/),instance_count:z.number().int().min(0),entry_count:z.number().int().min(0)}).strict()).max(50),next_after_legacy_id:z.string().min(1).max(200).regex(/^custom_[A-Za-z0-9_-]+$/).nullable()}).strict(),
  z.object({...base,kind:z.literal('legacy_records'),legacy_id:z.string().min(1).max(200).regex(/^custom_[A-Za-z0-9_-]+$/),records:z.array(legacyRecord).max(25),next_after_id:pageId}).strict(),
]);
export type JournalRead = z.infer<typeof journalReadSchema>;
export const journalReceiptSchema = z.object({request_id:journalUuid,action:z.enum(['create','save_schema','archive_journal','save_record','archive_record','import_definition']),journal_id:journalUuid,entity_id:journalUuid,revision_applied:journalRevision,outcome:z.enum(['applied','unchanged','import_existing']),replayed:z.boolean()}).strict();
export const journalMutationSchema = z.object({...base,receipt:journalReceiptSchema,journal:journalDetailSchema,record:journalRecordSchema.nullable()}).strict()
  .refine(v => v.receipt.journal_id === v.journal.id && (!v.record || v.record.journal_id === v.journal.id));
export type JournalMutation = z.infer<typeof journalMutationSchema>;
export const journalErrorCode = z.enum(['ACCESS_DENIED','INVALID_INPUT','NOT_FOUND','REVISION_CONFLICT','REQUEST_CONFLICT','IMPORT_CONFLICT','SOURCE_UNAVAILABLE','DEPENDENCY_UNAVAILABLE','LIMIT_EXCEEDED']);
export type JournalErrorCode = z.infer<typeof journalErrorCode>;
export const journalErrorSchema = z.object({code:journalErrorCode}).strict();
export { expectedRevision as journalExpectedRevision };
