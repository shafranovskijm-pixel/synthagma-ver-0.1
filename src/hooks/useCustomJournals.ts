import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useStaffPermissions } from '@/hooks/useStaffPermissions';
import { captureOfflineContext } from '@/utils/courseCache';
import { captureCustomJournalScope, customJournalScopeCurrent, normalizeCustomJournalError, prepareCustomJournalMutation, readCustomJournals, CustomJournalError } from '@/lib/customJournals/client';
import type { JournalAction, JournalErrorCode, JournalMutation, JournalQuery, JournalSummary } from '@/lib/customJournals/contract';

export function useCustomJournals(organizationId:string,enabled=true){
 const {user,userRole,loading:authLoading}=useAuth();const permissions=useStaffPermissions();const actor=captureOfflineContext();
 const identity=JSON.stringify([organizationId,user?.id??null,userRole,actor?.revision??null,authLoading,permissions.loading,permissions.error,permissions.orgRole,permissions.adminRole,[...permissions.orgPermissions].sort(),enabled]);
 const generation=useRef({identity,number:0});
 if(generation.current.identity!==identity)generation.current={identity,number:generation.current.number+1};
 const key=identity+'|generation:'+generation.current.number;
 const currentKey=useRef(key);currentKey.current=key;const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const scope=useMemo(()=>{if(!enabled||authLoading||permissions.loading||permissions.error||!user?.id)return null;try{return captureCustomJournalScope(organizationId,()=>mounted.current&&currentKey.current===key);}catch{return null;}},[key]);
 type View={key:string;journals:JournalSummary[];next:string|null;canRead:boolean;canWrite:boolean;loading:boolean;error:JournalErrorCode|null};
 const [view,setView]=useState<View>({key,journals:[],next:null,canRead:false,canWrite:false,loading:enabled,error:null});
 const [refresh,setRefresh]=useState(0);const [savingKey,setSavingKey]=useState<string|null>(null);const [mutationError,setMutationError]=useState<{key:string;code:JournalErrorCode}|null>(null);
 const [pendingKey,setPendingKey]=useState<string|null>(null);const pending=useRef<{key:string;plan:ReturnType<typeof prepareCustomJournalMutation>}|null>(null);
 const running=useRef<string|null>(null);const pagination=useRef<{key:string;sequence:number}|null>(null);
 const listSequence=useRef(0);const sequenceIdentity=useRef(key);
 if(sequenceIdentity.current!==key){sequenceIdentity.current=key;listSequence.current++;}
 useEffect(()=>{const sequence=++listSequence.current;pending.current=null;setPendingKey(null);setMutationError(null);setSavingKey(null);running.current=null;pagination.current=null;
  setView({key,journals:[],next:null,canRead:false,canWrite:false,loading:!!scope,error:null});
  if(!scope)return;let live=true;
  readCustomJournals(scope,{kind:'list',after_id:null,limit:50,include_archived:true}).then(result=>{
   if(!live||sequence!==listSequence.current||!customJournalScopeCurrent(scope)||result.kind!=='list')return;
   setView({key,journals:result.journals,next:result.next_after_id,canRead:result.capabilities.can_read,canWrite:result.capabilities.can_write,loading:false,error:null});
  }).catch(error=>{if(live&&sequence===listSequence.current&&customJournalScopeCurrent(scope))setView({key,journals:[],next:null,canRead:false,canWrite:false,loading:false,error:normalizeCustomJournalError(error).code});});
  return()=>{live=false;};
 },[scope,key]);
 const read=useCallback(async(query:JournalQuery)=>{if(!scope)throw new CustomJournalError('ACCESS_DENIED');try{const result=await readCustomJournals(scope,query);
  if(!customJournalScopeCurrent(scope))throw new CustomJournalError('ACCESS_DENIED');return result;}catch(error){const e=normalizeCustomJournalError(error);if(customJournalScopeCurrent(scope))setView(old=>old.key===key?{...old,canWrite:false,error:e.code,...(e.code==='ACCESS_DENIED'?{canRead:false,journals:[]}: {})}:old);throw e;}},[scope,key]);
 const reload=useCallback(async()=>{if(!scope)return;const sequence=++listSequence.current;pagination.current=null;setRefresh(n=>n+1);setView(old=>old.key===key?{...old,loading:true,canWrite:false}:old);try{const result=await readCustomJournals(scope,{kind:'list',after_id:null,limit:50,include_archived:true});
  if(sequence===listSequence.current&&result.kind==='list'&&customJournalScopeCurrent(scope))setView({key,journals:result.journals,next:result.next_after_id,canRead:result.capabilities.can_read,canWrite:result.capabilities.can_write,loading:false,error:null});}catch(error){const e=normalizeCustomJournalError(error);if(sequence===listSequence.current&&customJournalScopeCurrent(scope))setView(old=>old.key===key?{...old,loading:false,canWrite:false,error:e.code,...(e.code==='ACCESS_DENIED'?{canRead:false,journals:[]}: {})}:old);throw e;}},[scope,key]);
 const visible=view.key===key?view:{key,journals:[],next:null,canRead:false,canWrite:false,loading:enabled,error:null};
 const loadMore=useCallback(async()=>{if(!scope||view.key!==key||view.loading||!view.next||pagination.current?.key===key||running.current===key||pending.current?.key===key)return;const sequence=++listSequence.current;pagination.current={key,sequence};
  try{const result=await readCustomJournals(scope,{kind:'list',after_id:view.next,limit:50,include_archived:true});if(sequence!==listSequence.current||result.kind!=='list'||!customJournalScopeCurrent(scope))return;
   setView(old=>old.key===key?{...old,journals:[...old.journals,...result.journals.filter(r=>!old.journals.some(v=>v.id===r.id))],next:result.next_after_id}:old);
  }catch(error){if(sequence===listSequence.current&&customJournalScopeCurrent(scope))setView(old=>old.key===key?{...old,error:normalizeCustomJournalError(error).code,canWrite:false}:old);}finally{if(pagination.current?.key===key&&pagination.current.sequence===sequence)pagination.current=null;}
 },[scope,key,view]);
 const perform=useCallback(async(plan:ReturnType<typeof prepareCustomJournalMutation>):Promise<JournalMutation>=>{
  if(!scope||!customJournalScopeCurrent(scope)||running.current===key)throw new CustomJournalError('ACCESS_DENIED');running.current=key;listSequence.current++;pagination.current=null;setSavingKey(key);setMutationError(null);
  try{const result=await plan.run();if(!customJournalScopeCurrent(scope))throw new CustomJournalError('ACCESS_DENIED');pending.current=null;setPendingKey(null);
   setView(old=>old.key===key?{...old,journals:old.journals.some(j=>j.id===result.journal.id)?old.journals.map(j=>j.id===result.journal.id?result.journal:j):[result.journal,...old.journals],canRead:result.capabilities.can_read,canWrite:result.capabilities.can_write,loading:false,error:null}:old);
   return result;
  }catch(error){const normalized=normalizeCustomJournalError(error);if(customJournalScopeCurrent(scope)){setMutationError({key,code:normalized.code});
    if(normalized.code!=='DEPENDENCY_UNAVAILABLE'){pending.current=null;setPendingKey(null);}setView(old=>old.key===key?{...old,loading:false}:old);if(normalized.code==='ACCESS_DENIED')setView(old=>old.key===key?{...old,canRead:false,canWrite:false,journals:[]}:old);}
   throw normalized;
  }finally{if(customJournalScopeCurrent(scope)&&running.current===key){listSequence.current++;running.current=null;setSavingKey(null);}}
 },[scope,key]);
 const mutate=useCallback(async(expected:number,action:JournalAction)=>{if(!scope||view.key!==key||!view.canWrite||view.loading)throw new CustomJournalError('ACCESS_DENIED');
  if(pending.current?.key===key)throw new CustomJournalError('REQUEST_CONFLICT');const plan=prepareCustomJournalMutation(scope,expected,action);pending.current={key,plan};setPendingKey(key);return perform(plan);
 },[scope,key,view,perform]);
 const retry=useCallback(async()=>{if(!scope||pending.current?.key!==key)throw new CustomJournalError('SOURCE_UNAVAILABLE');return perform(pending.current.plan);},[scope,key,perform]);
 return {contextKey:key,refresh,journals:visible.journals,next:visible.next,loading:visible.loading,error:visible.error,canRead:visible.canRead,canWrite:visible.canWrite,
  saving:savingKey===key,pending:pendingKey===key,mutationError:mutationError?.key===key?mutationError.code:null,read,reload,loadMore,mutate,retry};
}
export type CustomJournalsModel=ReturnType<typeof useCustomJournals>;
