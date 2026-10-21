import type { JournalDetail, JournalRecord, JournalMutation } from '../contract';
export const ids={org:'10000000-0000-4000-8000-000000000001',actor:'20000000-0000-4000-8000-000000000001',subject:'20000000-0000-4000-8000-000000000002',journal:'30000000-0000-4000-8000-000000000001',schema:'40000000-0000-4000-8000-000000000001',record:'50000000-0000-4000-8000-000000000001',request:'60000000-0000-4000-8000-000000000001',history:'70000000-0000-4000-8000-000000000001'};
export const at='2026-10-20T00:00:00.000Z';
export const schema={id:ids.schema,journal_id:ids.journal,version:1,hash:'a'.repeat(64),fields:[{id:'doc_number',label:'Номер документа',type:'text' as const,semantic:'doc_number' as const}],created_at:at,created_by:ids.actor,redacted:false};
export const journal:JournalDetail={id:ids.journal,title:'Синтетический журнал',description:'Проверка выбранных полей',revision:1,archived:false,current_schema_id:ids.schema,current_schema:schema,legacy_id:null,redacted:false};
export const summary={id:journal.id,title:journal.title,description:journal.description,revision:journal.revision,archived:journal.archived,current_schema_id:journal.current_schema_id,legacy_id:journal.legacy_id,redacted:journal.redacted};
export const record:JournalRecord={id:ids.record,journal_id:ids.journal,schema_version_id:ids.schema,revision:1,subject_user_id:ids.subject,values:{doc_number:'0007'},archived:false,recorded_at:at,recorded_by:ids.actor,schema,redacted:false};
export const capabilities={can_read:true,can_write:true};
export const base={schema_version:1 as const,organization_id:ids.org,capabilities};
export function mutation(overrides:Partial<JournalMutation>={}):JournalMutation{return {...base,receipt:{request_id:ids.request,action:'save_record',journal_id:ids.journal,entity_id:ids.record,revision_applied:1,outcome:'applied',replayed:false},journal,record,...overrides};}
