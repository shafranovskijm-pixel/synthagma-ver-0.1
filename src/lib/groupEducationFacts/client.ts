import { supabase } from '@/integrations/supabase/client';
import { captureOfflineContext, isOfflineActorCurrent } from '@/utils/courseCache';
import * as c from './contract.ts';
import type { GeneratedDocument } from '@/lib/group-docs/schema';

export interface EducationActorScope {actorId:string;accessRevision:number;organizationId:string;groupId:string;courseId?:string;current?:()=>boolean}
export class EducationError extends Error {constructor(public code:c.EducationErrorCode='DEPENDENCY_UNAVAILABLE'){super(code);this.name='EducationError';}}
export const educationMessages:Record<c.EducationErrorCode,string>={ACCESS_DENIED:'Доступ к составу и календарю группы не подтверждён.',NOT_FOUND:'Запрошенная версия не найдена.',INVALID_INPUT:'Проверьте заполненные сведения.',PREREQUISITE_MISSING:'Сначала выполните указанные условия.',REVISION_CONFLICT:'Данные группы изменились. Обновите сведения перед новым действием.',REQUEST_CONFLICT:'Запрос уже использован с другими данными.',SOURCE_CHANGED:'Источник изменился. Обновите сведения.',LEGACY_HISTORY_UNKNOWN:'Состав до начала наблюдения неизвестен.',LIMIT_EXCEEDED:'Достигнут предел подтверждённого снимка или истории.',TEMPLATE_INCOMPATIBLE:'Календарь несовместим с выбранным шаблоном.',DEPENDENCY_UNAVAILABLE:'Не удалось подтвердить результат. Повторите тот же запрос.',COVERAGE_GAP:'За выбранный период есть пробел в наблюдении.',SOURCE_UNAVAILABLE:'Подтверждённый источник сейчас недоступен.'};
export function captureEducationScope(organizationId:string,groupId:string,current?:()=>boolean,courseId?:string):EducationActorScope {
  const actor=captureOfflineContext();if(!actor)throw new EducationError('ACCESS_DENIED');
  return {actorId:actor.actorId,accessRevision:actor.revision,organizationId,groupId,current,courseId};
}
export const educationScopeCurrent=(s:EducationActorScope)=>isOfflineActorCurrent(s.actorId,s.accessRevision)&&(!s.current||s.current());
function requireCurrent(s:EducationActorScope){if(!educationScopeCurrent(s))throw new EducationError('ACCESS_DENIED');if(![s.actorId,s.organizationId,s.groupId,...(s.courseId?[s.courseId]:[])].every(x=>c.educationUuid.safeParse(x).success))throw new EducationError('INVALID_INPUT');}
export function normalizeEducationError(error:unknown):EducationError {
  if(error instanceof EducationError)return error;
  const e=error as {code?:unknown;message?:unknown;status?:unknown}|null;
  if(c.educationErrorCodeSchema.safeParse(e?.code).success)return new EducationError(e!.code as c.EducationErrorCode);
  if(e?.code==='42501'||e?.code==='PGRST301'||e?.status===401||e?.status===403)return new EducationError('ACCESS_DENIED');
  const message=typeof e?.message==='string'?e.message.slice(0,300):'';
  const known=message.match(/\bGROUP_FACTS_([A-Z_]+)\b/)?.[1];
  if(c.educationErrorCodeSchema.safeParse(known).success)return new EducationError(known as c.EducationErrorCode);
  if(known==='MIXED_TRANSACTION_UNSUPPORTED'||known==='READ_COMMITTED_REQUIRED'||e?.code==='40001'||e?.code==='55P03')return new EducationError('SOURCE_CHANGED');
  if(known==='SOURCE_OBSERVATION_PENDING')return new EducationError('SOURCE_UNAVAILABLE');
  return new EducationError();
}
export async function educationBearer(s:EducationActorScope){requireCurrent(s);const {data,error}=await supabase.auth.getSession();requireCurrent(s);if(error||data.session?.user.id!==s.actorId||!data.session.access_token)throw new EducationError('ACCESS_DENIED');return 'Bearer '+data.session.access_token;}
function parse<T>(schema:{safeParse(v:unknown):{success:boolean;data?:T}},value:unknown):c.RequiredWire<T> {const r=schema.safeParse(value);if(!r.success)throw new EducationError();return r.data as c.RequiredWire<T>;}
const same=(a:unknown,b:unknown):boolean=>{if(a===b)return true;if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i]));return !!a&&!!b&&typeof a==='object'&&typeof b==='object'&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.prototype.hasOwnProperty.call(b,k)&&same((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]));};
function instantMicros(value:string){const fraction=value.match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1]??'';return BigInt(Date.parse(value))*BigInt(1000)+BigInt((fraction.padEnd(6,'0').slice(3,6))||'0');}
function assertScope(s:EducationActorScope,value:c.EducationScope){if(value.organization_id!==s.organizationId||value.group_id!==s.groupId||s.courseId&&value.course_id!==s.courseId)throw new EducationError();}
function assertEnvelope(s:EducationActorScope,v:c.EducationEnvelope){
 if(v.organization_id!==s.organizationId||v.group_id!==s.groupId)throw new EducationError();if(v.scope)assertScope(s,v.scope);
 if(v.state){assertScope(s,v.state.scope);if(!same(v.capabilities,v.state.capabilities)||!same(v.prerequisites,v.state.prerequisites))throw new EducationError();
  if(!same(v.state.program_ref,v.program_ref)){
   const prerequisite=(code:string,target:string)=>v.prerequisites.some(p=>p.code===code&&p.target===target&&p.lesson_id===null);
   // Retained history is never silently rebound to today's programme. Current
   // file availability and historical membership coverage are separate facts.
   const unavailable=v.program_ref===null&&(prerequisite('PROGRAM_SOURCE_UNAVAILABLE','program')||prerequisite('NO_UC111_BINDING','program'));
   const changed=v.program_ref!==null&&v.state.active_gap!==null&&['unknown_gap','source_unavailable'].includes(v.state.coverage)&&prerequisite('COVERAGE_GAP','history');
   if(!unavailable&&!changed)throw new EducationError();
  }
 }
}
async function rpc(s:EducationActorScope,name:string,args:Record<string,unknown>,bearer:string):Promise<unknown>{requireCurrent(s);const r=await supabase.rpc(name as never,args as never).setHeader('Authorization',bearer);requireCurrent(s);if(r.status===401||r.status===403)throw new EducationError('ACCESS_DENIED');if(r.error)throw normalizeEducationError(r.error);const error=c.educationErrorSchema.safeParse(r.data);if(error.success)throw new EducationError(error.data.code);return r.data;}
function rowsOrdered(rows:c.RosterRow[],after:string|null){let prev=after;for(const row of rows){if(prev&&row.user_id<=prev)throw new EducationError();if(row.label_source?.kind==='authorized_current_profile'&&row.label_source.subject_user_id!==row.user_id)throw new EducationError();prev=row.user_id;}}
export async function readEducationState(s:EducationActorScope){const v=parse(c.groupEducationEnvelopeSchema,await rpc(s,'read_group_education_facts',{p_organization_id:s.organizationId,p_group_id:s.groupId,p_query:{kind:'state'}},await educationBearer(s)));assertEnvelope(s,v);return v;}
export async function readEducationRoster(s:EducationActorScope,asOf:c.AsOf={kind:'current'},knowledgeRevision:number|null=null,after:string|null=null):Promise<c.RosterPage>{
 if(after!==null&&(asOf.kind!=='at'||knowledgeRevision===null))throw new EducationError('INVALID_INPUT');
 const query=c.educationQuerySchema.parse({kind:'roster',as_of:asOf,knowledge_revision:knowledgeRevision,after_user_id:after,limit:100});
 const v=parse(c.groupRosterPageSchema,await rpc(s,'read_group_education_facts',{p_organization_id:s.organizationId,p_group_id:s.groupId,p_query:query},await educationBearer(s)));assertScope(s,v.scope);rowsOrdered(v.rows,after);
 if(knowledgeRevision!==null&&v.knowledge_revision!==knowledgeRevision||v.next_after_user_id!==null&&(!v.rows.length||v.next_after_user_id!==v.rows[v.rows.length-1].user_id)||v.count.exact_count!==null&&v.rows.length>v.count.exact_count)throw new EducationError();
 if(asOf.kind==='at'&&(instantMicros(v.as_of)!==instantMicros(asOf.at)||v.timezone!==asOf.timezone))throw new EducationError();return v;
}
export async function readEducationCalendar(s:EducationActorScope,selection:c.CalendarSelection):Promise<c.CalendarResponse>{const query=c.educationQuerySchema.parse({kind:'calendar',selection});const v=parse(c.groupCalendarResponseSchema,await rpc(s,'read_group_education_facts',{p_organization_id:s.organizationId,p_group_id:s.groupId,p_query:query},await educationBearer(s)));assertScope(s,v.scope);if(!same(v.selection,selection))throw new EducationError();if(v.calendar){assertScope(s,v.calendar.scope);if(selection.kind==='version'?v.calendar.id!==selection.version_id:v.calendar.state!==selection.view)throw new EducationError();}return v;}
export async function readEducationHistory(s:EducationActorScope,after=0,ceiling:number|null=null):Promise<c.EducationHistory>{
 if(ceiling===null&&after!==0||ceiling!==null&&after>ceiling)throw new EducationError('INVALID_INPUT');
 const query=c.educationQuerySchema.parse({kind:'history',after_revision:after,ceiling_revision:ceiling,limit:50});const v=parse(c.groupEducationHistorySchema,await rpc(s,'read_group_education_facts',{p_organization_id:s.organizationId,p_group_id:s.groupId,p_query:query},await educationBearer(s)));assertScope(s,v.scope);
 if(ceiling!==null&&v.ceiling_revision!==ceiling||v.ceiling_revision>v.current_revision||v.next_after_revision!==null&&(v.next_after_revision<=after||v.next_after_revision>v.ceiling_revision))throw new EducationError();
 let previous=after;for(const event of v.events){assertScope(s,event.scope);if(event.revision<=previous||event.revision>v.ceiling_revision)throw new EducationError();previous=event.revision;}
 return v;
}
export async function readEducationOptions(s:EducationActorScope,facet:'teachers'|'course_lessons',after:string|null=null):Promise<c.EducationOptions>{const v=parse(c.groupEducationOptionsSchema,await rpc(s,'read_group_education_facts',{p_organization_id:s.organizationId,p_group_id:s.groupId,p_query:{kind:'options',facet,after_id:after,limit:50}},await educationBearer(s)));assertScope(s,v.scope);if(v.facet!==facet||new Set(v.items.map(x=>x.id)).size!==v.items.length||v.next_after_id!==null&&(!v.items.length||v.next_after_id!==v.items[v.items.length-1].id||v.next_after_id===after))throw new EducationError();return v;}
export function prepareEducationMutation(s:EducationActorScope,expectedRevision:number,action:c.EducationAction,requestId:string=crypto.randomUUID()){
 requireCurrent(s);c.educationExpectedRevision.parse(expectedRevision);c.educationUuid.parse(requestId);
 const validated=c.educationActionSchema.safeParse(structuredClone(action));if(!validated.success)throw new EducationError('INVALID_INPUT');const frozenAction=validated.data;const args={p_organization_id:s.organizationId,p_group_id:s.groupId,p_expected_revision:expectedRevision,p_request_id:requestId,p_action:frozenAction};
 let originalBearer:Promise<string>|null=null;
 return {requestId,action:frozenAction,expectedRevision,run:async():Promise<c.EducationMutation>=>{
  const bearer=await(originalBearer??=educationBearer(s));requireCurrent(s);
  const v=parse(c.groupEducationMutationSchema,await rpc(s,'apply_group_education_facts_action',args,bearer));assertEnvelope(s,v.envelope);assertScope(s,v.event.scope);
  const eventAction={initialize_history:'initialized',correct_membership_time:'membership_time_corrected',save_calendar_version:'calendar_saved',publish_calendar_version:'calendar_published',capture_roster_snapshot:'roster_captured',recover_coverage:'coverage_recovered'}[frozenAction.action];
  if(v.receipt.request_id!==requestId||v.receipt.action!==frozenAction.action||v.receipt.revision_applied!==expectedRevision+1||v.event.id!==v.receipt.event_id||v.event.revision!==v.receipt.revision_applied||v.event.action!==eventAction||!v.envelope.state||v.envelope.state.revision<v.receipt.revision_applied||v.event.snapshot_id!==v.receipt.snapshot_id||v.event.calendar_version_id!==v.receipt.calendar_version_id)throw new EducationError();
  return v;
 }};
}
export interface ConfirmedEducationSnapshot {header:c.SnapshotPage['header'];rows:c.RosterRow[];projection:c.ArtifactProjection;source:c.EducationSource}
export async function readConfirmedEducationSnapshot(s:EducationActorScope,snapshotId:string):Promise<ConfirmedEducationSnapshot>{
 c.educationUuid.parse(snapshotId);const bearer=await educationBearer(s);let first:c.SnapshotPage|null=null;let projection:c.ArtifactProjection|null=null;let cursor:string|null=null;const rows:c.RosterRow[]=[];
 for(let page=0;page<11;page++){
  const v=parse(c.groupSnapshotPageSchema,await rpc(s,'read_group_education_facts',{p_organization_id:s.organizationId,p_group_id:s.groupId,p_query:{kind:'snapshot',snapshot_id:snapshotId,after_user_id:cursor,limit:100}},bearer));assertScope(s,v.header.scope);
  if(v.header.id!==snapshotId||!v.header.available||v.header.redacted_count||first&&!same(first.header,v.header))throw new EducationError('SOURCE_UNAVAILABLE');
  if(!first){first=v;projection=v.artifact_projection;if(!projection)throw new EducationError('SOURCE_UNAVAILABLE');assertScope(s,projection.scope);assertScope(s,projection.calendar.scope);const p=projection.program_facts;if(projection.snapshot_id!==snapshotId||projection.source_hash!==v.header.source_hash||projection.as_of!==v.header.as_of||projection.knowledge_revision!==v.header.knowledge_revision||projection.coverage_segment_id!==v.header.coverage_segment_id||projection.calendar.id!==v.header.calendar_version_id||projection.calendar.content_hash!==v.header.calendar_hash||projection.calendar.timezone!==v.header.timezone||!same(projection.calendar.program_ref,v.header.program_ref)||Object.keys(v.header.program_ref).some(k=>p[k as keyof typeof p]!==v.header.program_ref[k as keyof typeof v.header.program_ref])||p.organization_id!==s.organizationId||p.group_id!==s.groupId||p.course_id!==v.header.scope.course_id)throw new EducationError();}
  else if(v.artifact_projection&&!same(v.artifact_projection,projection))throw new EducationError();
  rowsOrdered(v.rows,cursor);rows.push(...v.rows);if(rows.length>1000||rows.length>v.header.row_count)throw new EducationError();
  if(v.next_after_user_id===null){if(rows.length!==v.header.row_count||!projection||!first)throw new EducationError();if(rows.some(r=>r.association!=='confirmed'||r.label_state!=='available')||new Set(rows.map(r=>r.enrollment_id)).size!==rows.length||!same(rows.map(r=>r.program_enrollment_snapshot_id).sort(),[...projection.program_facts.enrollment_snapshot_ids].sort()))throw new EducationError('SOURCE_UNAVAILABLE');const h=first.header;const source=parse(c.educationSourceSchema,{schema_version:1,snapshot_id:h.id,source_hash:h.source_hash,roster_hash:h.roster_hash,calendar_version_id:h.calendar_version_id,calendar_hash:h.calendar_hash,as_of:h.as_of,timezone:h.timezone,knowledge_revision:h.knowledge_revision,coverage_segment_id:h.coverage_segment_id});return {header:h,rows,projection,source};}
  if(!v.rows.length||v.next_after_user_id!==v.rows[v.rows.length-1].user_id||v.next_after_user_id===cursor)throw new EducationError();cursor=v.next_after_user_id;
 }
 throw new EducationError('LIMIT_EXCEEDED');
}
/** Existing batch RPC, original caller and exact immutable provenance; no new command. */
export async function saveEducationDocuments(s:EducationActorScope,docs:GeneratedDocument[],originalBearer:string){
 if(!docs.length||docs.some(d=>d.doc_type==='contract'||d.doc_status!=='draft'||d.document_number!==null||!c.educationSourceSchema.safeParse(d.variables_snapshot?.education_source).success))throw new EducationError('INVALID_INPUT');
 const source=docs[0].variables_snapshot?.education_source;if(docs.some(d=>!same(d.variables_snapshot?.education_source,source)))throw new EducationError('SOURCE_CHANGED');
 const payload=docs.map(d=>({doc_type:d.doc_type,name:d.name,document_number:null,document_date:d.document_date,variables:d.variables,html:d.html,doc_status:'draft',fill_mode:d.fill_mode,layout_format:d.layout_format,source_note:d.source_note??null,variables_snapshot:d.variables_snapshot}));
 const raw=await rpc(s,'create_group_document_batch',{p_organization_id:s.organizationId,p_group_id:s.groupId,p_docs:payload},originalBearer);const value=Array.isArray(raw)&&raw.length===1?raw[0]:raw;
 const row=value as {batch_id?:unknown;batch_version?:unknown;inserted_count?:unknown}|null;
 if(!c.educationUuid.safeParse(row?.batch_id).success||!c.educationRevision.safeParse(row?.batch_version).success||row?.inserted_count!==docs.length)throw new EducationError();
 return {batchId:row!.batch_id as string,version:row!.batch_version as number,insertedCount:docs.length};
}
