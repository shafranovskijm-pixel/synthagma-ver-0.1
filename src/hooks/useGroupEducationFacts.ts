import { useCallback,useEffect,useRef,useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { captureOfflineActor,isOfflineActorCurrent } from '@/utils/courseCache';
import * as api from '@/lib/groupEducationFacts/client';
import * as c from '@/lib/groupEducationFacts/contract';

type View={key:string;envelope:c.EducationEnvelope|null;roster:c.RosterPage|null;calendar:c.CalendarResponse|null;history:c.EducationHistory|null;teachers:c.EducationOptions|null;lessons:c.EducationOptions|null;snapshot:api.ConfirmedEducationSnapshot|null;loading:boolean;busy:boolean;error:c.EducationErrorCode|null;pending:boolean};
const empty=(key:string):View=>({key,envelope:null,roster:null,calendar:null,history:null,teachers:null,lessons:null,snapshot:null,loading:false,busy:false,error:null,pending:false});
const capability={initialize_history:'can_initialize',correct_membership_time:'can_correct_membership_time',save_calendar_version:'can_edit_calendar',publish_calendar_version:'can_publish_calendar',capture_roster_snapshot:'can_capture_snapshot',recover_coverage:'can_recover_coverage'} as const;

/** All private state is memory-only and masked synchronously on actor/scope ABA. */
export function useGroupEducationFacts(organizationId:string,groupId:string,enabled=true,mode:'manage'|'readonly'='manage',observedAccessKey=''){
 const {user,loading:authLoading}=useAuth();const revision=captureOfflineActor(user?.id);
 const key=JSON.stringify([user?.id,revision,organizationId,groupId,enabled,authLoading,mode,observedAccessKey]);
 const live=useRef({key,generation:0});if(live.current.key!==key)live.current={key,generation:live.current.generation+1};const generation=live.current.generation;
 const lifecycle=useRef({active:true,epoch:0});const authority=useRef(0);const seq=useRef(0);const resourceSeq=useRef<Record<string,number>>({});
 const [view,setView]=useState<View>(()=>empty(''));const currentView=useRef(view);currentView.current=view;
 const pending=useRef<ReturnType<typeof api.prepareEducationMutation>|null>(null);const working=useRef(false);
 const current=()=>lifecycle.current.active&&enabled&&!authLoading&&!!user&&live.current.generation===generation&&isOfflineActorCurrent(user.id,revision);
 const scope=()=>{const life=lifecycle.current.epoch,auth=authority.current;return api.captureEducationScope(organizationId,groupId,()=>current()&&lifecycle.current.epoch===life&&authority.current===auth,currentView.current.key===key?currentView.current.envelope?.scope?.course_id:undefined);};
 const deny=()=>{if(!current())return;authority.current++;seq.current++;resourceSeq.current={};pending.current=null;working.current=false;setView({...empty(key),error:'ACCESS_DENIED'});};
 const handleError=(error:unknown)=>{const code=api.normalizeEducationError(error).code;if(code==='ACCESS_DENIED')deny();else setView(v=>v.key===key?{...v,error:code}:v);};
 const refresh=useCallback(async()=>{
  if(!current()||pending.current||working.current)return null;authority.current++;resourceSeq.current={};const request=++seq.current,s=scope();setView({...empty(key),loading:true});
  try {const envelope=await api.readEducationState(s);if(!api.educationScopeCurrent(s)||request!==seq.current)return null;setView({...empty(key),envelope});return envelope;}
  catch(e){if(api.educationScopeCurrent(s)&&request===seq.current){setView({...empty(key),error:api.normalizeEducationError(e).code});if(api.normalizeEducationError(e).code==='ACCESS_DENIED')deny();}return null;}
 },[key]);
 useEffect(()=>{lifecycle.current.active=true;lifecycle.current.epoch++;pending.current=null;working.current=false;resourceSeq.current={};void refresh();return()=>{lifecycle.current.active=false;lifecycle.current.epoch++;seq.current++;pending.current=null;working.current=false;};},[key]);
 const resource=async<T,>(name:string,run:(s:api.EducationActorScope)=>Promise<T>,store:(v:View,data:T)=>View):Promise<T|null>=>{
  if(!current()||currentView.current.key!==key||!currentView.current.envelope?.state||currentView.current.error==='ACCESS_DENIED')return null;
  const s=scope(),request=(resourceSeq.current[name]??0)+1;resourceSeq.current[name]=request;
  try{const result=await run(s);if(!api.educationScopeCurrent(s)||resourceSeq.current[name]!==request)return null;setView(v=>v.key===key?store({...v,error:null},result):v);return result;}
  catch(e){if(api.educationScopeCurrent(s)&&resourceSeq.current[name]===request)handleError(e);return null;}
 };
 const roster=async(asOf:c.AsOf={kind:'current'},more=false)=>{
  const old=currentView.current.key===key?currentView.current.roster:null;
  const pinned=more&&old?{kind:'at' as const,at:old.as_of,timezone:old.timezone}:asOf;
  return resource('roster',s=>api.readEducationRoster(s,pinned,more?old?.knowledge_revision??null:null,more?old?.next_after_user_id??null:null),(v,data)=>({...v,roster:more&&old?{...data,rows:[...old.rows,...data.rows]}:data}));
 };
 const calendar=(selection:c.CalendarSelection={kind:'current',view:'published'})=>resource('calendar',s=>api.readEducationCalendar(s,selection),(v,data)=>({...v,calendar:data}));
 const history=(more=false)=>{const old=currentView.current.key===key?currentView.current.history:null;return resource('history',s=>api.readEducationHistory(s,more?old?.next_after_revision??0:0,more?old?.ceiling_revision??null:null),(v,data)=>({...v,history:more&&old?{...data,events:[...old.events,...data.events]}:data}));};
 const options=(facet:'teachers'|'course_lessons',more=false)=>{const old=currentView.current.key===key?(facet==='teachers'?currentView.current.teachers:currentView.current.lessons):null;return resource(facet,s=>api.readEducationOptions(s,facet,more?old?.next_after_id??null:null),(v,data)=>({...v,[facet==='teachers'?'teachers':'lessons']:more&&old?{...data,items:[...old.items,...data.items]}:data}));};
 const snapshot=(id:string)=>resource('snapshot',s=>api.readConfirmedEducationSnapshot(s,id),(v,data)=>({...v,snapshot:data}));
 const execute=async(operation:ReturnType<typeof api.prepareEducationMutation>)=>{
  if(!current()||mode==='readonly'||working.current)return false;resourceSeq.current={};const s=scope();working.current=true;pending.current=operation;setView(v=>v.key===key?{...v,busy:true,pending:true,error:null}:v);
  try{const result=await operation.run();if(!api.educationScopeCurrent(s))return false;seq.current++;resourceSeq.current={};pending.current=null;setView({...empty(key),envelope:result.envelope});return result;}
  catch(e){if(api.educationScopeCurrent(s)){const code=api.normalizeEducationError(e).code;const unknown=code==='DEPENDENCY_UNAVAILABLE';if(!unknown)pending.current=null;if(code==='ACCESS_DENIED')deny();else setView(v=>v.key===key?{...v,busy:false,pending:unknown,error:code}:v);}return false;}
  finally{if(api.educationScopeCurrent(s)){working.current=false;setView(v=>v.key===key?{...v,busy:false}:v);}}
 };
 const mutate=async(action:c.EducationAction)=>{
  const v=currentView.current;if(!current()||mode==='readonly'||v.key!==key||!v.envelope||v.loading||pending.current||working.current||!v.envelope.capabilities[capability[action.action]])return false;
  const calendar=v.calendar?.calendar;
  if((action.action==='publish_calendar_version'||action.action==='capture_roster_snapshot')&&calendar&&calendar.id===(action.action==='publish_calendar_version'?action.version_id:action.calendar_version_id)&&(calendar.prerequisites.some(p=>p.code==='SOURCE_ERASED')||calendar.lessons.some(l=>l.status==='planned'&&(!l.teacher_user_id||l.teacher_label_state!=='available')))){setView({...v,error:'SOURCE_UNAVAILABLE'});return false;}
  const expected=v.envelope.state?.revision??0;try{return execute(api.prepareEducationMutation(scope(),expected,action));}catch(e){handleError(e);return false;}
 };
 const visible=current()&&view.key===key;const shown=visible?view:empty(key);const renderedAuthority=authority.current;
 const scopeCurrent=()=>current()&&authority.current===renderedAuthority&&currentView.current.key===key&&!!currentView.current.envelope?.state&&currentView.current.error!=='ACCESS_DENIED';
 return {...shown,scopeKey:JSON.stringify([key,renderedAuthority]),rosterValue:shown.roster,calendarValue:shown.calendar,historyValue:shown.history,snapshotValue:shown.snapshot,scopeCurrent,invalidateAccess:deny,refresh,roster,calendar,history,options,snapshot,mutate,retry:()=>pending.current?execute(pending.current):Promise.resolve(false)};
}
