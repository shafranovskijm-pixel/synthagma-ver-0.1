import { supabase } from '@/integrations/supabase/client';
import { educationBearer,educationScopeCurrent,normalizeEducationError,type EducationActorScope } from '@/lib/groupEducationFacts/client';
import * as c from './contract.ts';
import type { RequiredWire } from '@/lib/groupEducationFacts/contract';
export class ConductedSessionError extends Error { constructor(readonly code='DEPENDENCY_UNAVAILABLE'){super(code);this.name='ConductedSessionError';} }
export const sessionErrorMessage:Record<string,string>={
 ACCESS_DENIED:'Доступ к занятиям не подтверждён.',INVALID_INPUT:'Проверьте даты, часы и отметку каждого участника.',NOT_FOUND:'Запись не найдена.',
 SOURCE_UNAVAILABLE:'Источник недоступен или удалён. Проверьте опубликованный план и снимок состава.',SOURCE_CHANGED:'Источник изменился. Обновите сведения.',
 REVISION_CONFLICT:'Редакция изменилась. Обновите сведения перед повторным действием.',REQUEST_CONFLICT:'Запрос уже использован с другими сведениями.',
 PREREQUISITE_MISSING:'Для этого черновика нужны подтверждённые исходные сведения и решения по результатам.',LIMIT_EXCEEDED:'Уточните выбранный набор участников.',
 DEPENDENCY_UNAVAILABLE:'Результат запроса пока не подтверждён. Повторите тот же запрос.',
};
export function sessionError(e:unknown):ConductedSessionError {
 if(e instanceof ConductedSessionError)return e;
 const m=(e as {message?:string})?.message?.match(/UC_SESSION_([A-Z_]+)/)?.[1];
 if(m&&sessionErrorMessage[m])return new ConductedSessionError(m);
 return new ConductedSessionError(normalizeEducationError(e).code);
}
function current(s:EducationActorScope){if(!educationScopeCurrent(s))throw new ConductedSessionError('ACCESS_DENIED');}
async function rpc(s:EducationActorScope,name:string,args:Record<string,unknown>){
 current(s);const bearer=await educationBearer(s);current(s);
 const result=await supabase.rpc(name as never,args as never).setHeader('Authorization',bearer);current(s);
 if(result.status===401||result.status===403)throw new ConductedSessionError('ACCESS_DENIED');if(result.error)throw sessionError(result.error);return result.data;
}
function parse<T>(schema:{parse(v:unknown):T},v:unknown):RequiredWire<T>{try{return schema.parse(v) as RequiredWire<T>;}catch{throw new ConductedSessionError();}}
const scope=(s:EducationActorScope,v:{organization_id:string;group_id:string;course_id:string})=>{if(v.organization_id!==s.organizationId||v.group_id!==s.groupId||s.courseId&&v.course_id!==s.courseId)throw new ConductedSessionError();};
export async function listConductedSessions(s:EducationActorScope,after:string|null=null){
 const v=parse(c.sessionList,await rpc(s,'read_conducted_sessions',{p_organization_id:s.organizationId,p_group_id:s.groupId,p_query:{kind:'list',after_id:after,limit:50}}));scope(s,v.scope);
 if(new Set(v.sessions.map(x=>x.id)).size!==v.sessions.length||v.sessions.some((x,i)=>x.id<=(i?v.sessions[i-1].id:after??'')))throw new ConductedSessionError();return v;
}
export async function readConductedSession(s:EducationActorScope,id:string,revision:number|null=null,after:string|null=null){
 const v=parse(c.sessionDetail,await rpc(s,'read_conducted_sessions',{p_organization_id:s.organizationId,p_group_id:s.groupId,p_query:{kind:'session',session_id:id,revision,after_user_id:after,limit:50}}));
 try{c.assertSessionScope(v,s.organizationId,s.groupId,s.courseId);}catch{throw new ConductedSessionError();}
 if(v.session.id!==id||revision!==null&&v.version.revision!==revision||v.version.attendance.some((x,i)=>x.user_id<=(i?v.version.attendance[i-1].user_id:after??'')))throw new ConductedSessionError();return v;
}
export async function readSessionDraft(s:EducationActorScope,id:string){
 const v=parse(c.draftResponse,await rpc(s,'read_conducted_sessions',{p_organization_id:s.organizationId,p_group_id:s.groupId,p_query:{kind:'draft',draft_id:id}}));scope(s,v.scope);
 if(v.draft.id!==id)throw new ConductedSessionError();try{c.assertDraftScope(v,s.organizationId,s.groupId,s.courseId);}catch{throw new ConductedSessionError();}
 return v;
}
export async function readFullConductedSession(s:EducationActorScope,id:string,revision:number|null=null):Promise<c.SessionDetail>{
 let result:c.SessionDetail|null=null,after:string|null=null;
 for(let page=0;page<21;page++){
  const next=await readConductedSession(s,id,result?.version.revision??revision,after);
  if(result&&(next.version.id!==result.version.id||next.version.content_hash!==result.version.content_hash||next.source_current!==result.source_current||JSON.stringify(next.version.source_proof)!==JSON.stringify(result.version.source_proof)))throw new ConductedSessionError('SOURCE_CHANGED');
  result=result?{...result,version:{...result.version,attendance:[...result.version.attendance,...next.version.attendance]},outcomes:[...result.outcomes,...next.outcomes],next_after_user_id:next.next_after_user_id}:next;
  if(result.version.attendance.length>1000)throw new ConductedSessionError();
  if(next.next_after_user_id===null){if(result.version.attendance.length!==result.version.source_proof.roster_rows.length)throw new ConductedSessionError();return result;}
  if(!next.version.attendance.length||next.next_after_user_id===after||next.next_after_user_id!==next.version.attendance.at(-1)?.user_id)throw new ConductedSessionError();after=next.next_after_user_id;
 }
 throw new ConductedSessionError('LIMIT_EXCEEDED');
}
export function prepareSessionMutation(s:EducationActorScope,expectedRevision:number,action:c.SessionAction,requestId:string=crypto.randomUUID()){
 current(s);const a=c.sessionAction.parse(action);const expected=Number(expectedRevision);if(!Number.isSafeInteger(expected)||expected<0)throw new ConductedSessionError('INVALID_INPUT');
 const args={p_organization_id:s.organizationId,p_group_id:s.groupId,p_expected_revision:expected,p_request_id:requestId,p_action:structuredClone(a)};
 return {requestId,action:a,async run(){const v=parse(c.sessionReceipt,await rpc(s,'apply_conducted_session_action',args));
  if(v.receipt.request_id!==requestId||v.receipt.action!==a.action||a.action!=='confirm_session'&&v.receipt.session_id!==a.session_id||a.action==='confirm_session'&&v.receipt.revision!==1||a.action==='correct_attendance'&&v.receipt.revision!==expected+1||a.action==='create_draft'&&(v.receipt.revision!==expected||v.receipt.draft_revision!==a.expected_draft_revision+1))throw new ConductedSessionError();return v;}};
}
