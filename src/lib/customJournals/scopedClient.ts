import {supabase} from '@/integrations/supabase/client';
import {captureCustomJournalScope,customJournalScopeCurrent,normalizeCustomJournalError,customJournalMessages,type CustomJournalScope} from './client.ts';
import * as c from './scopedContract.ts';
import {journalUuid} from './contract.ts';
export interface ScopedJournalScope extends CustomJournalScope {context:c.ScopedContextInput}
export class ScopedJournalError extends Error {constructor(readonly code:c.ScopedJournalErrorCode='DEPENDENCY_UNAVAILABLE'){super(code);this.name='ScopedJournalError';}}
export const scopedJournalMessages=customJournalMessages;
export function normalizeScopedJournalError(error:unknown):ScopedJournalError {
 if(error instanceof ScopedJournalError)return error;
 const direct=c.scopedErrorCodeSchema.safeParse((error as {code?:unknown}|null)?.code);if(direct.success)return new ScopedJournalError(direct.data);
 const ordinary=normalizeCustomJournalError(error);return new ScopedJournalError(c.scopedErrorCodeSchema.safeParse(ordinary.code).success?ordinary.code as c.ScopedJournalErrorCode:'DEPENDENCY_UNAVAILABLE');
}
export function captureScopedJournalScope(organizationId:string,context:c.ScopedContextInput,current?:()=>boolean):ScopedJournalScope{
 const selected=c.scopedContextInputSchema.parse(structuredClone(context));return {...captureCustomJournalScope(organizationId,current),context:Object.freeze(selected)};
}
export const scopedJournalScopeCurrent=(scope:ScopedJournalScope)=>customJournalScopeCurrent(scope);
function requireCurrent(scope:ScopedJournalScope){if(!scopedJournalScopeCurrent(scope))throw new ScopedJournalError('ACCESS_DENIED');}
async function call(scope:ScopedJournalScope,name:string,args:Record<string,unknown>){
 requireCurrent(scope);const {data,error}=await supabase.auth.getSession();requireCurrent(scope);
 if(error||data.session?.user.id!==scope.actorId||!data.session.access_token)throw new ScopedJournalError('ACCESS_DENIED');
 const result=await supabase.rpc(name as never,args as never).setHeader('Authorization','Bearer '+data.session.access_token);requireCurrent(scope);
 if(result.status===401||result.status===403)throw new ScopedJournalError('ACCESS_DENIED');if(result.error)throw normalizeScopedJournalError(result.error);
 const failure=c.scopedErrorSchema.safeParse(result.data);if(failure.success)throw new ScopedJournalError(failure.data.code);return result.data;
}
function envelope(scope:ScopedJournalScope,value:{organization_id?:string;context?:c.ScopedJournalContext;capabilities?:{can_read?:boolean;can_write?:boolean}}){if(!value.context||!value.capabilities||value.organization_id!==scope.organizationId||!c.contextMatchesRequest(value.context,scope.context)||!value.capabilities.can_read||value.capabilities.can_write&&!value.capabilities.can_read)throw new ScopedJournalError();}
function ordered<T>(rows:T[],id:(row:T)=>string,after:string|null,next:string|null){let previous=after;for(const row of rows){const key=id(row);if(previous!==null&&key<=previous)throw new ScopedJournalError();previous=key;}if(next!==null&&(!rows.length||next!==previous))throw new ScopedJournalError();}
function same(a:unknown,b:unknown):boolean{if(a===b)return true;if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i]));return !!a&&!!b&&typeof a==='object'&&typeof b==='object'&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.prototype.hasOwnProperty.call(b,k)&&same((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]));}
export async function readScopedCustomJournals(scope:ScopedJournalScope,query:c.ScopedJournalQuery):Promise<c.ScopedJournalRead>{
 const q=c.scopedQuerySchema.parse(structuredClone(query)),parsed=c.scopedReadSchema.safeParse(await call(scope,'read_scoped_custom_journals',{p_organization_id:scope.organizationId,p_context:scope.context,p_query:q}));if(!parsed.success)throw new ScopedJournalError();const v=parsed.data;envelope(scope,v);if(v.kind!==q.kind)throw new ScopedJournalError();
 if(v.kind==='list'&&q.kind==='list'){ordered(v.journals,r=>r.id,q.after_id,v.next_after_id);if(v.journals.some(j=>!c.contextMatchesRequest(j.context,scope.context)))throw new ScopedJournalError();}
 if(v.kind==='journal'&&q.kind==='journal'&&(v.journal.id!==q.journal_id||!c.sameScopedJournalContext(v.context,v.journal.context)))throw new ScopedJournalError();
 if('journal_id'in q&&'journal_id'in v&&q.journal_id!==v.journal_id)throw new ScopedJournalError();
 if(v.kind==='records'&&q.kind==='records'){if(v.records.some(r=>r.journal_id!==q.journal_id))throw new ScopedJournalError();ordered(v.records,r=>r.id,q.after_id,v.next_after_id);}
 if(v.kind==='subjects'&&q.kind==='subjects')ordered(v.subjects,r=>r.user_id,q.after_id,v.next_after_id);
 if(v.kind==='sources'&&q.kind==='sources'){ordered(v.sources,r=>r.id,q.after_id,v.next_after_id);if(v.sources.some(r=>r.source.kind!==q.source_kind||r.source.kind==='session'&&r.id!==r.source.session_version_id||r.source.kind==='outcome'&&r.id!==r.source.state_id))throw new ScopedJournalError();}
 if(v.kind==='history'&&q.kind==='history'){if(v.record_id!==q.record_id||v.history.some(r=>r.record_id!==q.record_id||r.schema.journal_id!==q.journal_id))throw new ScopedJournalError();let previous=q.after_revision;for(const h of v.history){if(h.revision<=previous)throw new ScopedJournalError();previous=h.revision;}if(v.next_after_revision!==null&&(!v.history.length||v.next_after_revision!==previous))throw new ScopedJournalError();}
 if(v.kind==='exports'&&q.kind==='exports'){if(v.exports.some(r=>r.journal_id!==q.journal_id))throw new ScopedJournalError();ordered(v.exports,r=>r.id,q.after_id,v.next_after_id);}
 if(v.kind==='export'&&q.kind==='export'&&(v.export.id!==q.export_id||v.export.journal_id!==q.journal_id||v.export.redacted))throw new ScopedJournalError('SOURCE_UNAVAILABLE');
 requireCurrent(scope);return v;
}
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.freeze(value);for(const part of Object.values(value))freeze(part);}return value;}
export function prepareScopedCustomJournalMutation(scope:ScopedJournalScope,expectedRevision:number,action:c.ScopedJournalAction,requestId:string=crypto.randomUUID()){
 requireCurrent(scope);if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new ScopedJournalError('INVALID_INPUT');const validated=c.scopedActionSchema.safeParse(structuredClone(action));if(!validated.success)throw new ScopedJournalError('INVALID_INPUT');const saved=freeze(validated.data);
 if(!journalUuid.safeParse(requestId).success)throw new ScopedJournalError('INVALID_INPUT');
 const args=freeze({p_organization_id:scope.organizationId,p_context:scope.context,p_expected_revision:expectedRevision,p_request_id:requestId,p_action:saved});
 return {requestId,action:saved,run:async():Promise<c.ScopedJournalMutation>=>{
  requireCurrent(scope);const parsed=c.scopedMutationSchema.safeParse(await call(scope,'apply_scoped_custom_journal_action',args));if(!parsed.success)throw new ScopedJournalError();const v=parsed.data;envelope(scope,v);
  const row=saved.action==='save_record'||saved.action==='archive_record',exporting=saved.action==='capture_export';
  if(!c.sameScopedJournalContext(v.context,v.journal.context)||!exporting&&!v.capabilities.can_write||v.receipt.request_id!==requestId||v.receipt.action!==saved.action||v.receipt.journal_id!==v.journal.id||'journal_id'in saved&&saved.journal_id!==v.journal.id||row!==!!v.record||exporting!==!!v.export)throw new ScopedJournalError();
  if(v.record&&(v.record.journal_id!==v.journal.id||v.receipt.entity_id!==v.record.id||v.receipt.revision_applied>v.record.revision))throw new ScopedJournalError();
  if(exporting){if(v.export!.redacted||v.export!.journal_id!==v.journal.id||v.receipt.entity_id!==v.export!.id||v.receipt.revision_applied>v.journal.revision)throw new ScopedJournalError();}
  else if(!row&&(v.receipt.entity_id!==v.journal.id||v.receipt.revision_applied>v.journal.revision))throw new ScopedJournalError();
  if(!exporting&&v.receipt.outcome==='applied'&&v.receipt.revision_applied!==expectedRevision+1)throw new ScopedJournalError();
  if(exporting&&!v.receipt.replayed&&v.receipt.revision_applied!==expectedRevision)throw new ScopedJournalError();
  if(row&&'record_id'in saved&&saved.record_id!==null&&v.record!.id!==saved.record_id)throw new ScopedJournalError();
  if(saved.action==='save_record'&&(!same(v.record!.subject,saved.subject)||!same(v.record!.source,saved.source)||v.record!.revision===v.receipt.revision_applied&&(!same(v.record!.values,saved.values)||v.record!.schema_version_id!==saved.schema_version_id)))throw new ScopedJournalError();
  requireCurrent(scope);return v;
 }};
}
