// Pure browser/Edge adapter. Only an original-caller snapshot response is a
// source; historical membership never grants access to current profile fields.
import type { ProgramGeneration, ProgramGroupFields, ProgramFields } from './program-facts.ts';

export const EDUCATION_ARTIFACT_NOTICE = 'Word-бланк отображает четыре даты и общие поля; полный поурочный план сохранён в источнике. Имена — отдельно наблюдённые отображаемые подписи, не подтверждённые юридические имена.';
export const EDUCATION_GENERIC_ARTIFACT_NOTICE = 'Подтверждённый состав и полный поурочный план сохранены в источнике. Отметки посещаемости и результаты не подставляются из прохождения курса. Имена — отдельно наблюдённые отображаемые подписи, не подтверждённые юридические имена.';
export type EducationArtifactLayout='generic_html'|'four_date_word';
export class GroupEducationArtifactError extends Error {
  constructor(readonly code:'INVALID_INPUT'|'ACCESS_DENIED'|'SOURCE_CHANGED'|'SOURCE_UNAVAILABLE'|'TEMPLATE_INCOMPATIBLE'|'DEPENDENCY_UNAVAILABLE', readonly status=409) { super(code); this.name='GroupEducationArtifactError'; }
}
type Scope={organization_id:string;group_id:string;course_id:string};
type Ref={binding_id:string;binding_revision:number;program_id:string;version_id:string;binding_snapshot_hash:string;file_document_id:string;file_version_id:string;file_review_id:string;facts_hash:string};
type LabelSource={kind:'authorized_current_profile';subject_user_id:string}|{kind:'retained_observation';event_id:string};
export interface EducationSource {schema_version:1;snapshot_id:string;source_hash:string;roster_hash:string;calendar_version_id:string;calendar_hash:string;as_of:string;timezone:string;knowledge_revision:number;coverage_segment_id:string}
export interface EducationArtifactRow {user_id:string;subject_label:string|null;label_state:'available'|'unavailable'|'redacted';label_observed_at:string|null;label_source:LabelSource|null;enrollment_id:string|null;program_enrollment_snapshot_id:string|null;association:'confirmed'|'no_exact_enrollment'|'no_program_snapshot';membership_basis:'observed'|'corrected';effective_from:string|null;effective_until:string|null;observed_since:string;source_event_ids:string[]}
interface Prerequisite {code:string;label:string;target:string;lesson_id:string|null}
export interface EducationArtifactLesson {lesson_id:string;local_date:string;starts_at:string|null;ends_at:string|null;topic:string;module_label:string|null;course_lesson_id:string|null;academic_hours:string|null;teacher_user_id:string|null;status:'planned'|'cancelled';cancellation_reason:string|null;teacher_label:string|null;teacher_source_hash:string|null;teacher_label_state:'available'|'unavailable'|'redacted';teacher_label_observed_at:string|null;teacher_label_source:LabelSource|null}
export interface EducationArtifactCalendar {id:string;scope:Scope;revision_created:number;state:'draft'|'published'|'superseded';timezone:string;planned_start_date:string;planned_end_date:string;coverage:'whole_program'|'partial_plan';partial_reason:string|null;program_ref:Ref;lessons:EducationArtifactLesson[];academic_hours_total:string|null;content_hash:string;recorded_at:string;recorded_by:string|null;published_at:string|null;published_by:string|null;prerequisites:Prerequisite[];known_academic_hours_total:string;missing_hours_count:number}
interface Facts extends Record<string,unknown> {schema_version:1;full_title:string;program_type:string;academic_hours:number;training_form:'full_time'|'part_time'|'mixed';uses_elearning:boolean|null;uses_distance_learning:boolean|null;duration_calendar:string;attestation_form:string;attestation_criteria:string;qualification:string|null;profession:string|null}
interface Proof {schema_version:1;state:'confirmed';organization_id:string;group_id:string;course_id:string;program_id:string;version_id:string;file_document_id:string;file_version_id:string;file_review_id:string;facts_hash:string;binding_id:string;binding_revision:number;binding_snapshot_hash:string;enrollment_snapshot_ids:string[];facts_snapshot:Facts;group_snapshot:{name:string|null;start_date:string|null;end_date:string|null;training_dates:string[]|null;schedule_text:string|null;instructor_name:string|null}}
export interface EducationArtifactProjection {schema_version:1;scope:Scope;snapshot_id:string;source_hash:string;program_facts:Proof;calendar:EducationArtifactCalendar;as_of:string;knowledge_revision:number;coverage_segment_id:string;display_label_notice:'display_labels_observed_separately_not_verified_legal_names'}
export interface EducationArtifactHeader {id:string;scope:Scope;as_of:string;timezone:string;knowledge_revision:number;coverage:'complete_observed';calendar_version_id:string;calendar_hash:string;program_ref:Ref;roster_hash:string;source_hash:string;row_count:number;redacted_count:number;purpose:'document_batch'|'lesson_roster'|'assessment_draft';recorded_at:string;recorded_by:string|null;available:boolean;prerequisites:Prerequisite[];coverage_segment_id:string;coverage_known_from:string}
export interface EducationArtifactSnapshot {header:EducationArtifactHeader;rows:EducationArtifactRow[];projection:EducationArtifactProjection;source:EducationSource}
export interface GroupEducationArtifact extends EducationArtifactSnapshot {programme:ProgramGeneration}
interface SnapshotPage {schema_version:1;header:EducationArtifactHeader;rows:EducationArtifactRow[];next_after_user_id:string|null;artifact_projection:EducationArtifactProjection|null}
type Rule=(v:unknown)=>boolean;
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const owns=(v:object,k:string)=>Object.prototype.hasOwnProperty.call(v,k);
const exact=(fields:Record<string,Rule>):Rule=>v=>obj(v)&&Object.keys(v).length===Object.keys(fields).length&&Object.keys(v).every(k=>owns(fields,k))&&Object.entries(fields).every(([k,r])=>r(v[k]));
const literal=(x:unknown):Rule=>v=>v===x;
const oneOf=(...xs:string[]):Rule=>v=>typeof v==='string'&&xs.includes(v);
const nullable=(r:Rule):Rule=>v=>v===null||r(v);
const array=(r:Rule,max:number):Rule=>v=>Array.isArray(v)&&v.length<=max&&v.every(r);
const int=(min:number,max=Number.MAX_SAFE_INTEGER):Rule=>v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=(max:number,empty=false):Rule=>v=>typeof v==='string'&&v.length<=max&&(empty||v.length>0&&v.trim()===v);
const uuid:Rule=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const hash:Rule=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const bool:Rule=v=>typeof v==='boolean';
const date:Rule=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const instant:Rule=v=>typeof v==='string'&&v.length<=64&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&date(v.slice(0,10))&&Number.isFinite(Date.parse(v));
const zone:Rule=v=>{if(!text(100)(v))return false;try {new Intl.DateTimeFormat('en',{timeZone:v as string});return true;}catch{return false;}};
const hours:Rule=v=>typeof v==='string'&&/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(v)&&Number(v)>0&&Number(v)<=10000;
const total:Rule=v=>typeof v==='string'&&/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(v)&&Number(v)<=2500000;
const ids=(max=1000):Rule=>v=>array(uuid,max)(v)&&new Set(v as string[]).size===(v as string[]).length;
const scope=exact({organization_id:uuid,group_id:uuid,course_id:uuid});
const ref=exact({binding_id:uuid,binding_revision:int(1),program_id:uuid,version_id:uuid,binding_snapshot_hash:hash,file_document_id:uuid,file_version_id:uuid,file_review_id:uuid,facts_hash:hash});
const labelSource:Rule=v=>exact({kind:literal('authorized_current_profile'),subject_user_id:uuid})(v)||exact({kind:literal('retained_observation'),event_id:uuid})(v);
const prerequisite=exact({code:oneOf('NO_GROUP_COURSE','NO_UC111_BINDING','PROGRAM_SOURCE_UNAVAILABLE','HISTORY_NOT_INITIALIZED','TIMEZONE_REQUIRED','TEACHER_REQUIRED','HOURS_REQUIRED','PLAN_PARTIAL','LEGACY_HISTORY_UNKNOWN','LEGACY_SOURCE_CHANGED','SOURCE_ERASED','TEMPLATE_INCOMPATIBLE','LEGACY_DISPLAY_UNAVAILABLE','COVERAGE_GAP','ROSTER_LIMIT_EXCEEDED','HISTORY_DETAIL_UNAVAILABLE','HISTORY_REVISION_CAPACITY','DISPLAY_LABEL_UNAVAILABLE','LEGAL_NAME_EVIDENCE_REQUIRED'),label:text(240),target:oneOf('group','program','history','calendar','lesson','document'),lesson_id:nullable(uuid)});
const sourceRule=exact({schema_version:literal(1),snapshot_id:uuid,source_hash:hash,roster_hash:hash,calendar_version_id:uuid,calendar_hash:hash,as_of:instant,timezone:zone,knowledge_revision:int(1),coverage_segment_id:uuid});
const rowRule=exact({user_id:uuid,subject_label:nullable(text(240)),label_state:oneOf('available','unavailable','redacted'),label_observed_at:nullable(instant),label_source:nullable(labelSource),enrollment_id:nullable(uuid),program_enrollment_snapshot_id:nullable(uuid),association:oneOf('confirmed','no_exact_enrollment','no_program_snapshot'),membership_basis:oneOf('observed','corrected'),effective_from:nullable(instant),effective_until:nullable(instant),observed_since:instant,source_event_ids:ids(4)});
const lessonRule=exact({lesson_id:uuid,local_date:date,starts_at:nullable(instant),ends_at:nullable(instant),topic:text(1000),module_label:nullable(text(160)),course_lesson_id:nullable(uuid),academic_hours:nullable(hours),teacher_user_id:nullable(uuid),status:oneOf('planned','cancelled'),cancellation_reason:nullable(text(2000)),teacher_label:nullable(text(240)),teacher_source_hash:nullable(hash),teacher_label_state:oneOf('available','unavailable','redacted'),teacher_label_observed_at:nullable(instant),teacher_label_source:nullable(labelSource)});
const calendarRule=exact({id:uuid,scope,revision_created:int(1),state:oneOf('draft','published','superseded'),timezone:zone,planned_start_date:date,planned_end_date:date,coverage:oneOf('whole_program','partial_plan'),partial_reason:nullable(text(2000)),program_ref:ref,lessons:array(lessonRule,250),academic_hours_total:nullable(total),content_hash:hash,recorded_at:instant,recorded_by:nullable(uuid),published_at:nullable(instant),published_by:nullable(uuid),prerequisites:array(prerequisite,100),known_academic_hours_total:total,missing_hours_count:int(0,250)});
const factsRule=exact({schema_version:literal(1),full_title:text(4000),program_type:oneOf('dpo_upskilling','dpo_retraining','professional_training','internal_nonformal'),academic_hours:int(1,999999),training_form:oneOf('full_time','part_time','mixed'),uses_elearning:nullable(bool),uses_distance_learning:nullable(bool),duration_calendar:text(4000),attestation_form:text(4000),attestation_criteria:text(4000),qualification:nullable(text(4000,true)),profession:nullable(text(4000,true))});
const proofRule=exact({schema_version:literal(1),state:literal('confirmed'),organization_id:uuid,group_id:uuid,course_id:uuid,program_id:uuid,version_id:uuid,file_document_id:uuid,file_version_id:uuid,file_review_id:uuid,facts_hash:hash,binding_id:uuid,binding_revision:int(1),binding_snapshot_hash:hash,enrollment_snapshot_ids:ids(),facts_snapshot:factsRule,group_snapshot:exact({name:nullable(text(4000,true)),start_date:nullable(date),end_date:nullable(date),training_dates:nullable(array(date,250)),schedule_text:nullable(text(4000,true)),instructor_name:nullable(text(4000,true))})});
const projectionRule=exact({schema_version:literal(1),scope,snapshot_id:uuid,source_hash:hash,program_facts:proofRule,calendar:calendarRule,as_of:instant,knowledge_revision:int(1),coverage_segment_id:uuid,display_label_notice:literal('display_labels_observed_separately_not_verified_legal_names')});
const headerRule=exact({id:uuid,scope,as_of:instant,timezone:zone,knowledge_revision:int(1),coverage:literal('complete_observed'),calendar_version_id:uuid,calendar_hash:hash,program_ref:ref,roster_hash:hash,source_hash:hash,row_count:int(0,1000),redacted_count:int(0,1000),purpose:oneOf('document_batch','lesson_roster','assessment_draft'),recorded_at:instant,recorded_by:nullable(uuid),available:bool,prerequisites:array(prerequisite,100),coverage_segment_id:uuid,coverage_known_from:instant});
const pageRule=exact({schema_version:literal(1),header:headerRule,rows:array(rowRule,100),next_after_user_id:nullable(uuid),artifact_projection:nullable(projectionRule)});
function fail(code:GroupEducationArtifactError['code']='SOURCE_CHANGED'):never{throw new GroupEducationArtifactError(code,code==='INVALID_INPUT'?400:code==='ACCESS_DENIED'?403:code==='DEPENDENCY_UNAVAILABLE'?503:409);}
export const hasEducationSource=(raw:unknown):boolean=>obj(raw)&&owns(raw,'educationSource');
export function parseEducationSource(raw:unknown):EducationSource {if(!sourceRule(raw))fail('INVALID_INPUT');return structuredClone(raw) as EducationSource;}
export const sameEducationValue=(a:unknown,b:unknown):boolean=>{
 if(a===b)return true;if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>sameEducationValue(v,b[i]));
 return obj(a)&&obj(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>owns(b,k)&&sameEducationValue(a[k],b[k]));
};
function matchesRef(proof:Proof,expected:Ref){return Object.keys(expected).every(k=>proof[k as keyof Proof]===expected[k as keyof Ref]);}
function validateSnapshot(snapshot:EducationArtifactSnapshot,organizationId:string,groupId:string){
 const {header:h,source:s,projection:p,rows}=snapshot;
 if(!headerRule(h)||!sourceRule(s)||!projectionRule(p)||!array(rowRule,1000)(rows))fail();
 if(!h.available||h.redacted_count||h.prerequisites.some(x=>x.code!=='LEGAL_NAME_EVIDENCE_REQUIRED'))fail('SOURCE_UNAVAILABLE');
 if(h.scope.organization_id!==organizationId||h.scope.group_id!==groupId||!sameEducationValue(h.scope,p.scope)||!sameEducationValue(h.scope,p.calendar.scope)||h.purpose!=='document_batch')fail();
 const fromHeader={schema_version:1,snapshot_id:h.id,source_hash:h.source_hash,roster_hash:h.roster_hash,calendar_version_id:h.calendar_version_id,calendar_hash:h.calendar_hash,as_of:h.as_of,timezone:h.timezone,knowledge_revision:h.knowledge_revision,coverage_segment_id:h.coverage_segment_id};
 if(!sameEducationValue(s,fromHeader)||p.snapshot_id!==h.id||p.source_hash!==h.source_hash||p.as_of!==h.as_of||p.knowledge_revision!==h.knowledge_revision||p.coverage_segment_id!==h.coverage_segment_id||p.calendar.id!==h.calendar_version_id||p.calendar.content_hash!==h.calendar_hash||p.calendar.timezone!==h.timezone||!sameEducationValue(p.calendar.program_ref,h.program_ref))fail();
 const proof=p.program_facts;
 if(proof.organization_id!==organizationId||proof.group_id!==groupId||proof.course_id!==h.scope.course_id||!matchesRef(proof,h.program_ref)||rows.length!==h.row_count)fail();
 let previous='';const enrollmentIds=new Set<string>(),snapshotIds=new Set<string>();
 for(const row of rows){
  if(row.user_id<=previous||row.label_state!=='available'||!row.subject_label||!row.label_observed_at||!row.label_source||row.label_source.kind==='authorized_current_profile'&&row.label_source.subject_user_id!==row.user_id||row.association!=='confirmed'||!row.enrollment_id||!row.program_enrollment_snapshot_id||enrollmentIds.has(row.enrollment_id)||snapshotIds.has(row.program_enrollment_snapshot_id))fail('SOURCE_UNAVAILABLE');
  previous=row.user_id;enrollmentIds.add(row.enrollment_id);snapshotIds.add(row.program_enrollment_snapshot_id);
 }
 if(!sameEducationValue([...snapshotIds].sort(),[...proof.enrollment_snapshot_ids].sort()))fail();
}
function localParts(instantValue:string,timeZone:string){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instantValue));
 const get=(key:string)=>parts.find(p=>p.type===key)!.value;
 return {date:get('year')+'-'+get('month')+'-'+get('day'),clock:get('hour')+':'+get('minute')+(get('second')==='00'?'':':'+get('second'))};
}
export function educationArtifactGroupFields(snapshot:EducationArtifactSnapshot,layout:EducationArtifactLayout='four_date_word'):ProgramGroupFields {
 if(layout!=='generic_html'&&layout!=='four_date_word')fail('INVALID_INPUT');
 const {calendar:c,program_facts:p}=snapshot.projection;
 if(c.state==='draft'||!c.published_at||c.coverage!=='whole_program'||c.partial_reason!==null||c.lessons.length<1||c.lessons.length>250||c.lessons.some(l=>l.status!=='planned'||!l.academic_hours||!l.teacher_user_id||l.teacher_label_state!=='available'||!l.teacher_label||!l.teacher_label_observed_at||!l.teacher_label_source||!l.teacher_source_hash||l.teacher_label_source.kind==='authorized_current_profile'&&l.teacher_label_source.subject_user_id!==l.teacher_user_id)||c.prerequisites.some(x=>x.code!=='LEGAL_NAME_EVIDENCE_REQUIRED'))fail('TEMPLATE_INCOMPATIBLE');
 if(new Set(c.lessons.map(l=>l.lesson_id)).size!==c.lessons.length||c.planned_start_date>c.planned_end_date||c.lessons.some(l=>l.local_date<c.planned_start_date||l.local_date>c.planned_end_date))fail('TEMPLATE_INCOMPATIBLE');
 const hundredths=c.lessons.reduce((sum,l)=>sum+Math.round(Number(l.academic_hours)*100),0);
 if(c.missing_hours_count!==0||c.academic_hours_total===null||Math.round(Number(c.known_academic_hours_total)*100)!==hundredths||Math.round(Number(c.academic_hours_total)*100)!==hundredths||hundredths!==p.facts_snapshot.academic_hours*100)fail('TEMPLATE_INCOMPATIBLE');
 const teachers=new Map<string,string>(),clocks:string[]=[];let previousKey='';
 for(const l of c.lessons){
  const key=l.local_date+'|'+(l.starts_at??'~')+'|'+l.lesson_id;if(previousKey&&key<=previousKey)fail('TEMPLATE_INCOMPATIBLE');previousKey=key;
  if((l.starts_at===null)!==(l.ends_at===null))fail('TEMPLATE_INCOMPATIBLE');
  let value='';if(l.starts_at&&l.ends_at){
   if(Date.parse(l.ends_at)<=Date.parse(l.starts_at)||Date.parse(l.ends_at)-Date.parse(l.starts_at)>86400000)fail('TEMPLATE_INCOMPATIBLE');
   const a=localParts(l.starts_at,c.timezone),b=localParts(l.ends_at,c.timezone);if(a.date!==l.local_date)fail('TEMPLATE_INCOMPATIBLE');
   const offset=(Date.parse(b.date)-Date.parse(a.date))/86400000;if(offset!==0&&offset!==1)fail('TEMPLATE_INCOMPATIBLE');value=a.clock+'–'+b.clock+(offset?' (+1 день)':'');
  }
  clocks.push(value);
  if(teachers.has(l.teacher_user_id!)&&teachers.get(l.teacher_user_id!)!==l.teacher_label)fail('TEMPLATE_INCOMPATIBLE');
  teachers.set(l.teacher_user_id!,l.teacher_label!);
 }
 const uniformClock=clocks.every(v=>v===clocks[0])?clocks[0]:'';
 if(layout==='four_date_word'&&(c.lessons.length!==4||teachers.size!==1||!clocks.every(v=>v===clocks[0])))fail('TEMPLATE_INCOMPATIBLE');
 // Generic renderers retain every lesson in education_calendar. A global clock
 // is shown only when actually uniform; teacher labels are never invented.
 return {name:p.group_snapshot.name??'',start_date:c.planned_start_date,end_date:c.planned_end_date,training_dates:c.lessons.map(l=>l.local_date),schedule_text:uniformClock,instructor_name:[...teachers.values()].join('; ')};
}
export function parseEducationArtifactSnapshot(raw:unknown,organizationId:string,groupId:string,layout:EducationArtifactLayout='four_date_word'):GroupEducationArtifact {
 if(!exact({header:headerRule,rows:array(rowRule,1000),projection:projectionRule,source:sourceRule})(raw))fail();
 const snapshot=structuredClone(raw) as EducationArtifactSnapshot;validateSnapshot(snapshot,organizationId,groupId);
 const proof=snapshot.projection.program_facts,forms={full_time:'Очная',part_time:'Заочная',mixed:'Очно-заочная'};
 const programme:ProgramGeneration={state:'confirmed',reason:null,fields:{program_title:proof.facts_snapshot.full_title,program_hours:proof.facts_snapshot.academic_hours,program_form:forms[proof.facts_snapshot.training_form]},groupFields:educationArtifactGroupFields(snapshot,layout),facts:{...proof.facts_snapshot},provenance:proof};
 return {...snapshot,programme};
}
type RpcRequest=PromiseLike<{data:unknown;error:unknown}>&{setHeader?:(name:string,value:string)=>PromiseLike<{data:unknown;error:unknown}>};
type RpcClient={rpc(name:string,args:Record<string,unknown>):RpcRequest};
export async function resolveGroupEducationArtifact(db:RpcClient,organizationId:string,groupId:string,rawSource:unknown,originalBearer?:string):Promise<GroupEducationArtifact>{
 if(!uuid(organizationId)||!uuid(groupId))fail('INVALID_INPUT');const source=parseEducationSource(rawSource);let first:SnapshotPage|null=null,projection:EducationArtifactProjection|null=null,cursor:string|null=null;const rows:EducationArtifactRow[]=[];
 for(let page=0;page<11;page++){
  let request=db.rpc('read_group_education_facts',{p_organization_id:organizationId,p_group_id:groupId,p_query:{kind:'snapshot',snapshot_id:source.snapshot_id,after_user_id:cursor,limit:100}});
  if(originalBearer){if(!request.setHeader)fail('DEPENDENCY_UNAVAILABLE');request=request.setHeader('Authorization',originalBearer) as RpcRequest;}
  const {data,error}=await request;if(error){const e=error as {code?:string;status?:number;message?:unknown};if(e.code==='42501'||e.status===401||e.status===403)fail('ACCESS_DENIED');const known=typeof e.message==='string'?e.message.match(/^GROUP_FACTS_(SOURCE_CHANGED|SOURCE_UNAVAILABLE|TEMPLATE_INCOMPATIBLE|INVALID_INPUT|ACCESS_DENIED)$/)?.[1]:null;fail(known as GroupEducationArtifactError['code']||'DEPENDENCY_UNAVAILABLE');}
  if(!pageRule(data))fail();const value=data as SnapshotPage;
  if(value.header.scope.organization_id!==organizationId||value.header.scope.group_id!==groupId||value.header.id!==source.snapshot_id||value.header.source_hash!==source.source_hash||value.header.roster_hash!==source.roster_hash)fail();
  if(!first){first=value;projection=value.artifact_projection;if(!projection)fail('SOURCE_UNAVAILABLE');}else if(!sameEducationValue(value.header,first.header)||value.artifact_projection!==null&&!sameEducationValue(value.artifact_projection,projection))fail();
  if(!value.header.available||value.header.redacted_count)fail('SOURCE_UNAVAILABLE');
  let previous:string|null=cursor;for(const row of value.rows){if(previous&&row.user_id<=previous)fail();previous=row.user_id;}rows.push(...value.rows);
  if(rows.length>1000||rows.length>value.header.row_count)fail();
  if(value.next_after_user_id===null){if(!first||!projection)fail();return parseEducationArtifactSnapshot({header:first.header,rows,projection,source},organizationId,groupId);}
  if(!value.rows.length||value.next_after_user_id!==previous||value.next_after_user_id===cursor)fail();cursor=value.next_after_user_id;
 }
 return fail('SOURCE_UNAVAILABLE');
}
const snapshotOnly=(raw:EducationArtifactSnapshot)=>({header:raw.header,rows:raw.rows,projection:raw.projection,source:raw.source});
export function withEducationArtifact<T extends {organization:{id?:string|null};group:{id:string};students:unknown[];extras?:unknown}>(context:T,raw:EducationArtifactSnapshot,layout:EducationArtifactLayout='four_date_word'){
 const source=parseEducationArtifactSnapshot(snapshotOnly(raw),context.organization.id??'',context.group.id,layout);
 const {students:_students,extras:_extras,...rest}=context;
 return {...rest,group:{...context.group,...source.programme.groupFields,...source.programme.fields},students:source.rows.map(row=>({user_id:row.user_id,full_name:row.subject_label!})),extras:{}} as Omit<T,'students'|'group'|'extras'>&{group:T['group']&ProgramGroupFields&ProgramFields;students:{user_id:string;full_name:string}[];extras:Record<string,never>};
}
export function educationArtifactDocumentSnapshot(raw:EducationArtifactSnapshot,layout:EducationArtifactLayout='four_date_word'){
 const source=parseEducationArtifactSnapshot(snapshotOnly(raw),raw.header.scope.organization_id,raw.header.scope.group_id,layout);
 return {education_source:source.source,education_calendar:source.projection.calendar,education_source_notice:layout==='generic_html'?EDUCATION_GENERIC_ARTIFACT_NOTICE:EDUCATION_ARTIFACT_NOTICE,education_lesson_ids:source.projection.calendar.lessons.map(l=>l.lesson_id),program_facts:source.projection.program_facts,student_user_ids:source.rows.map(r=>r.user_id),students:source.rows.map((r,i)=>({row_number:i+1,user_id:r.user_id,full_name:r.subject_label!,label_observed_at:r.label_observed_at,label_source:r.label_source}))};
}
export function educationArtifactRows(source:EducationArtifactSnapshot,tokens:string[],layout:EducationArtifactLayout='four_date_word'):Record<string,string>[] {
 const result=parseEducationArtifactSnapshot(snapshotOnly(source),source.header.scope.organization_id,source.header.scope.group_id,layout),p=result.programme,period=[p.groupFields!.start_date,p.groupFields!.end_date].map(d=>d.slice(8,10)+'.'+d.slice(5,7)+'.'+d.slice(0,4)).join(' — ');
 return result.rows.map((row,i)=>Object.fromEntries(tokens.map(token=>[token,({N:String(i+1),STUDENT_NAME:row.subject_label!,STUDENT_PROGRAM:p.fields!.program_title,STUDENT_HOURS:String(p.fields!.program_hours),STUDENT_PERIOD:period,PROGRAM_GROUP:p.groupFields!.name} as Record<string,string>)[token]??''])));
}
