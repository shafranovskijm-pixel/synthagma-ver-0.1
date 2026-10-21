import { supabase } from '@/integrations/supabase/client';
import { captureOfflineContext, isOfflineActorCurrent } from '@/utils/courseCache';
import * as c from './contract';

export interface CustomJournalScope { actorId:string; accessRevision:number; organizationId:string; current?:()=>boolean }
export class CustomJournalError extends Error { constructor(readonly code:c.JournalErrorCode='DEPENDENCY_UNAVAILABLE'){super(code);this.name='CustomJournalError';} }
export const customJournalMessages: Record<c.JournalErrorCode,string> = {
 ACCESS_DENIED:'Доступ к журналам организации не подтверждён.',INVALID_INPUT:'Проверьте поля и выбранного участника записи.',NOT_FOUND:'Журнал или запись не найдены.',
 REVISION_CONFLICT:'Запись изменил другой сотрудник. Обновите данные перед сохранением.',REQUEST_CONFLICT:'Этот запрос уже использован с другими данными.',
 IMPORT_CONFLICT:'Локальное определение конфликтует с уже перенесённым журналом. Исходные данные сохранены.',SOURCE_UNAVAILABLE:'Исходная версия недоступна для изменения.',
 DEPENDENCY_UNAVAILABLE:'Результат пока не подтверждён. Повторите тот же запрос.',LIMIT_EXCEEDED:'Достигнут предел текущего набора полей или записей.',
};
export function captureCustomJournalScope(organizationId:string,current?:()=>boolean):CustomJournalScope {
 const actor=captureOfflineContext(); if(!actor||!c.journalUuid.safeParse(organizationId).success)throw new CustomJournalError('ACCESS_DENIED');
 return {actorId:actor.actorId,accessRevision:actor.revision,organizationId,current};
}
export const customJournalScopeCurrent=(scope:CustomJournalScope)=>isOfflineActorCurrent(scope.actorId,scope.accessRevision)&&(!scope.current||scope.current());
function requireCurrent(scope:CustomJournalScope){if(!customJournalScopeCurrent(scope))throw new CustomJournalError('ACCESS_DENIED');}
export function normalizeCustomJournalError(error:unknown):CustomJournalError {
 if(error instanceof CustomJournalError)return error;
 const e=error as {code?:unknown;message?:unknown;status?:number}|null;
 if(e?.code==='42501'||e?.status===401||e?.status===403)return new CustomJournalError('ACCESS_DENIED');
 if(e?.code==='40001')return new CustomJournalError('REVISION_CONFLICT');
 const candidate=typeof e?.message==='string'?e.message.match(/CUSTOM_JOURNAL_(ACCESS_DENIED|INVALID_INPUT|NOT_FOUND|REVISION_CONFLICT|REQUEST_CONFLICT|IMPORT_CONFLICT|SOURCE_UNAVAILABLE|DEPENDENCY_UNAVAILABLE|LIMIT_EXCEEDED)(?:\b|$)/)?.[1]:e?.code;
 const parsed=c.journalErrorCode.safeParse(candidate);return new CustomJournalError(parsed.success?parsed.data:'DEPENDENCY_UNAVAILABLE');
}
async function bearer(scope:CustomJournalScope){requireCurrent(scope);const {data,error}=await supabase.auth.getSession();requireCurrent(scope);
 if(error||data.session?.user.id!==scope.actorId||!data.session.access_token)throw new CustomJournalError('ACCESS_DENIED');return 'Bearer '+data.session.access_token;}
async function call(scope:CustomJournalScope,name:string,args:Record<string,unknown>){const token=await bearer(scope);requireCurrent(scope);
 const result=await supabase.rpc(name as never,args as never).setHeader('Authorization',token);requireCurrent(scope);
 if(result.status===401||result.status===403)throw new CustomJournalError('ACCESS_DENIED');if(result.error)throw normalizeCustomJournalError(result.error);
 const failure=c.journalErrorSchema.safeParse(result.data);if(failure.success)throw new CustomJournalError(failure.data.code);return result.data;}
function ordered<T>(rows:T[],id:(v:T)=>string,after:string|null,next:string|null){let previous=after;
 for(const row of rows){const value=id(row);if(previous!==null&&value<=previous)throw new CustomJournalError();previous=value;}
 if(next!==null&&(!rows.length||next!==previous||next===after))throw new CustomJournalError();}
export async function readCustomJournals(scope:CustomJournalScope,query:c.JournalQuery):Promise<c.JournalRead>{
 const q=c.journalQuerySchema.parse(structuredClone(query));const parsed=c.journalReadSchema.safeParse(await call(scope,'read_custom_journals',{p_organization_id:scope.organizationId,p_query:q}));
 if(!parsed.success)throw new CustomJournalError();const v=parsed.data;
 if(v.organization_id!==scope.organizationId||v.kind!==q.kind||!v.capabilities.can_read||v.capabilities.can_write&&!v.capabilities.can_read)throw new CustomJournalError();
 if(q.kind==='list'&&v.kind==='list')ordered(v.journals,r=>r.id,q.after_id,v.next_after_id);
 if(q.kind==='journal'&&v.kind==='journal'&&v.journal.id!==q.journal_id)throw new CustomJournalError();
 if(q.kind==='records'&&v.kind==='records'){if(v.journal_id!==q.journal_id||v.records.some(r=>r.journal_id!==q.journal_id))throw new CustomJournalError();ordered(v.records,r=>r.id,q.after_id,v.next_after_id);}
 if(q.kind==='history'&&v.kind==='history'){
  if(v.journal_id!==q.journal_id||v.record_id!==q.record_id)throw new CustomJournalError();let previous=q.after_revision;
  for(const row of v.history){if(row.record_id!==q.record_id||row.schema.journal_id!==q.journal_id||row.revision<=previous)throw new CustomJournalError();previous=row.revision;}
  if(v.next_after_revision!==null&&(!v.history.length||v.next_after_revision!==previous||previous===q.after_revision))throw new CustomJournalError();
 }
 if(q.kind==='subjects'&&v.kind==='subjects')ordered(v.subjects,r=>r.user_id,q.after_id,v.next_after_id);
 if(q.kind==='legacy_inventory'&&v.kind==='legacy_inventory')ordered(v.legacy_journals,r=>r.legacy_id,q.after_legacy_id,v.next_after_legacy_id);
 if(q.kind==='preview_legacy'&&v.kind==='preview_legacy'&&v.legacy_id!==q.definition.id)throw new CustomJournalError();
 if(q.kind==='legacy_records'&&v.kind==='legacy_records'){if(v.legacy_id!==q.legacy_id)throw new CustomJournalError();ordered(v.records,r=>r.id,q.after_id,v.next_after_id);}
 requireCurrent(scope);return v;
}
function freeze<T>(value:T):T {if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
export function prepareCustomJournalMutation(scope:CustomJournalScope,expectedRevision:number,action:c.JournalAction,requestId:string=crypto.randomUUID()){
 requireCurrent(scope);c.journalExpectedRevision.parse(expectedRevision);c.journalUuid.parse(requestId);
 const validated=c.journalActionSchema.safeParse(structuredClone(action));if(!validated.success)throw new CustomJournalError('INVALID_INPUT');
 const saved=freeze(validated.data);const args={p_organization_id:scope.organizationId,p_expected_revision:expectedRevision,p_request_id:requestId,p_action:saved};
 return {requestId,run:async():Promise<c.JournalMutation>=>{
  requireCurrent(scope);const parsed=c.journalMutationSchema.safeParse(await call(scope,'apply_custom_journal_action',args));if(!parsed.success)throw new CustomJournalError();const v=parsed.data;
  const rowAction=saved.action==='save_record'||saved.action==='archive_record';
  if(v.organization_id!==scope.organizationId||!v.capabilities.can_write||!v.capabilities.can_read||v.receipt.request_id!==requestId||v.receipt.action!==saved.action
   ||'journal_id' in saved&&v.journal.id!==saved.journal_id||rowAction!==!!v.record||v.receipt.entity_id!==(rowAction?v.record?.id:v.journal.id)
   ||v.receipt.revision_applied>(rowAction?v.record!.revision:v.journal.revision))throw new CustomJournalError();
  if(rowAction&&'record_id' in saved&&saved.record_id!==null&&v.record!.id!==saved.record_id)throw new CustomJournalError();
  if(saved.action==='save_record'&&v.record!.subject_user_id!==saved.subject_user_id)throw new CustomJournalError();
  if(v.receipt.outcome==='applied'&&v.receipt.revision_applied!==expectedRevision+1)throw new CustomJournalError();
  if(v.receipt.outcome==='import_existing'&&saved.action!=='import_definition')throw new CustomJournalError();
  requireCurrent(scope);return v;
 }};
}
