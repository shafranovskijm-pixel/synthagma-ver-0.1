import { useAuth } from "@/hooks/useAuth";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { isCurrentOrganizationAccess } from "@/hooks/useDocumentActionPermissions";
import { captureOfflineContext } from "@/utils/courseCache";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { readSelfExaminationDraft, mutateSelfExaminationDraft, type SelfExaminationAction, type SelfExaminationDraft } from '@/lib/selfExamination/draft';
type State={key:string;draft:SelfExaminationDraft|null;loading:boolean;loaded:boolean;saving:boolean;conflict:boolean;denied:boolean;uncertain:boolean;error:string|null};
export function useSelfExaminationDraft(organizationId:string,reportingYear:number){
 const auth=useAuth(),permissions=useStaffPermissions(),offline=captureOfflineContext();
 const ready=!auth.loading&&!!auth.user?.id&&!permissions.loading&&!permissions.error&&isCurrentOrganizationAccess(permissions,organizationId)&&(permissions.can('documents.read')||permissions.can('documents.write'));
 const key=JSON.stringify([organizationId,reportingYear,auth.user?.id,auth.userRole,auth.loading,offline?.revision,permissions.organizationId,permissions.loading,permissions.error,permissions.orgRole,permissions.adminRole,[...permissions.orgPermissions].sort(),ready]);const active=useRef(key),epoch=useRef(0),busy=useRef(false);const pending=useRef<{key:string;requestId:string;revision:number;action:SelfExaminationAction}|null>(null);
 const empty=():State=>({key,draft:null,loading:ready,loaded:false,saving:false,conflict:false,denied:false,uncertain:false,error:null});const[state,setState]=useState<State>(empty);
 useLayoutEffect(()=>{active.current=key;++epoch.current;busy.current=false;pending.current=null;setState(empty());return()=>{++epoch.current;};},[key]);
 const reload=useCallback(async()=>{if(!ready||active.current!==key||busy.current)return;const run=++epoch.current;setState(empty());try{const draft=await readSelfExaminationDraft(organizationId,reportingYear);if(active.current!==key||epoch.current!==run)return;pending.current=null;setState({...empty(),draft,loading:false,loaded:true});}catch(error:any){if(active.current!==key||epoch.current!==run)return;setState({...empty(),loading:false,denied:error?.code==='42501',error:error?.code==='42501'?'Нет права читать самообследование этого центра.':'Не удалось загрузить сохранённый черновик. Повторите загрузку.'});}},[key,organizationId,reportingYear,ready]);
 useEffect(()=>{void reload();},[reload]);
 const mutate=async(action:SelfExaminationAction):Promise<SelfExaminationDraft|null>=>{if(!ready||!permissions.can('documents.write')||active.current!==key||state.key!==key||state.loading||!state.loaded||state.saving||state.denied||state.conflict||busy.current||state.draft&&!state.draft.can_write)return null;
  const actionKey=JSON.stringify(action);if(pending.current&&pending.current.key!==actionKey){setState(s=>({...s,error:'Исход предыдущего сохранения неизвестен. Повторите то же действие или обновите черновик.'}));return null;}
  pending.current??={key:actionKey,requestId:crypto.randomUUID(),revision:state.draft?.revision??0,action};const current=pending.current;busy.current=true;const run=++epoch.current;setState(s=>({...s,saving:true,error:null}));
  try{const result=await mutateSelfExaminationDraft(organizationId,reportingYear,current.revision,current.requestId,current.action);if(active.current!==key||epoch.current!==run)return null;pending.current=null;setState({...empty(),draft:result.draft,loading:false,loaded:true});return result.draft;}
  catch(error:any){if(active.current!==key||epoch.current!==run)return null;const sourceChanged=/^SELF_EXAMINATION_(SOURCE_UNAVAILABLE|SOURCE_CHANGED|MISSING_FACT|REVIEW_REQUIRED|CATALOG_CHANGED)/.test(error?.message??'');const conflict=error?.code==='40001'||error?.code==='55000'||sourceChanged,denied=error?.code==='42501',invalid=error?.code==='22023';if(conflict||denied||invalid)pending.current=null;setState(s=>({...s,saving:false,conflict,denied,uncertain:!conflict&&!denied&&!invalid,error:conflict?'Черновик изменился. Загрузите текущую версию и проверьте изменения.':denied?'Права изменились. Действие недоступно.':invalid?'Проверьте год, значения и выбранные источники.':'Сохранение не подтверждено. Повторите то же действие с прежним идентификатором или обновите черновик.'}));return null;}
  finally{if(active.current===key&&epoch.current===run)busy.current=false;}
 };
 const current=ready&&state.key===key;return{...state,canWrite:ready&&permissions.can('documents.write'),draft:current&&!state.denied?state.draft:null,mutate,reload,current,contextKey:key};
}
