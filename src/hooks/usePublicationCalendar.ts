import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parsePublicationCalendar, parsePublicationList, parsePublicationRules, parsePublicationRecord, parsePublicationEditions, validatePublicationMutationReply, type PublicationCalendarRow, type PublicationRecord, type PublicationRule } from "@/lib/uc-publication/api";
interface PublicationData {rules:PublicationRule[];records:{streamId:string;record:PublicationRecord}[];tasks:PublicationCalendarRow[];hasMoreRecords:boolean;hasMoreTasks:boolean}
interface State {key:string;data:PublicationData|null;loading:boolean;saving:boolean;denied:boolean;conflict:boolean;uncertain:boolean;error:string|null}
interface Operation {kind:"rpc"|"check";name:string;args:Record<string,unknown>;identity:string}
const blank=(key:string,loading=false):State=>({key,data:null,loading,saving:false,denied:false,conflict:false,uncertain:false,error:null});
export function usePublicationCalendar(org:string,year:number,canRead:boolean,canWrite:boolean,canSign:boolean,sourceRevisionKey:string=""){
 const {user,loading:authLoading}=useAuth();const key=JSON.stringify([user?.id??null,org,year,!authLoading&&canRead,canWrite,canSign,sourceRevisionKey]);
 const scope=useRef(key),generation=useRef(0),busy=useRef(false),pending=useRef<Operation|null>(null),controller=useRef<AbortController|null>(null);
 const rights=useRef({canRead:!authLoading&&canRead&&!!user,canWrite,canSign});rights.current={canRead:!authLoading&&canRead&&!!user,canWrite,canSign};
 if(scope.current!==key){scope.current=key;++generation.current;busy.current=false;pending.current=null;controller.current?.abort();}
 const [state,setState]=useState<State>(()=>blank(key,rights.current.canRead));
 useLayoutEffect(()=>{setState(blank(key,rights.current.canRead));return()=>{++generation.current;controller.current?.abort();};},[key]);
 const invoke=async(name:string,args:Record<string,unknown>,signal:AbortSignal)=>{const result=await(supabase.rpc as any)(name,args).abortSignal(signal);if(result.error)throw result.error;return result.data;};
 const reload=useCallback(async()=>{
  if(scope.current!==key||!rights.current.canRead||busy.current)return false;const run=++generation.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;pending.current=null;setState(blank(key,true));
  try{const [rules,list,calendar]=await Promise.all([
   invoke("list_publication_rule_versions",{p_organization_id:org},abort.signal),invoke("list_organization_publications",{p_organization_id:org,p_before_stream_id:null,p_limit:50},abort.signal),invoke("list_organization_publication_calendar",{p_organization_id:org,p_reporting_year:year,p_before_id:null,p_limit:100},abort.signal)]);
   const records=parsePublicationList(list,org),tasks=parsePublicationCalendar(calendar,org,year);const data={rules:parsePublicationRules(rules,org),records,tasks,hasMoreRecords:records.length===50,hasMoreTasks:tasks.length===100};
   if(scope.current!==key||run!==generation.current||!rights.current.canRead)return false;setState({...blank(key),data});return true;
  }catch(error){if(scope.current!==key||run!==generation.current)return false;const denied=(error as any)?.code==="42501";setState({...blank(key),denied,error:denied?"Нет текущего доступа к публикациям центра.":"Не удалось загрузить публикации и календарь. Обновите данные."});return false;}
 },[key,org,year]);
 useEffect(()=>{void reload();},[reload]);
 const perform=async(kind:Operation["kind"],name:string,args:Record<string,unknown>,requireSign=false)=>{
  if(scope.current!==key||!rights.current.canRead||!rights.current.canWrite||requireSign&&!rights.current.canSign||busy.current||state.key!==key||state.loading||state.denied||state.conflict)return false;
  const identity=JSON.stringify([kind,name,args]);if(pending.current&&pending.current.identity!==identity){setState(p=>({...p,error:"Сначала повторите прежнюю операцию или загрузите сохранённые данные."}));return false;}
  pending.current??={kind,name,args:structuredClone(args),identity};const op=pending.current;busy.current=true;const run=++generation.current;const abort=new AbortController();controller.current=abort;setState(p=>({...p,saving:true,error:null}));
  try{if(kind==="rpc"){const result=await invoke(op.name,op.args,abort.signal);validatePublicationMutationReply(op.name,op.args,result,org,user!.id);}else{const result=await supabase.functions.invoke("publication-accessibility",{body:op.args});if(result.error){let code="";try{code=(await(result.error as any).context?.json())?.error??"";}catch{}throw{code:code==="ACCESS_DENIED"?"42501":code==="REVISION_CONFLICT"||code==="SOURCE_CHANGED"?"40001":code==="INVALID_INPUT"?"22023":"P0001"};}const checked=parsePublicationRecord(result.data,org);if(checked.edition.id!==op.args.editionId||checked.edition.revision!==op.args.expectedRevision||checked.latest_event_sequence<(op.args.expectedEventSequence as number)+1)throw Error("UNCONFIRMED_PUBLICATION_CHECK");}
   if(scope.current!==key||run!==generation.current||!rights.current.canWrite)return false;pending.current=null;busy.current=false;setState(blank(key));return await reload();
  }catch(error){if(scope.current!==key||run!==generation.current)return false;const code=(error as any)?.code,denied=code==="42501",conflict=code==="40001",invalid=code==="22023";const uncertain=!denied&&!conflict&&!invalid;if(!uncertain)pending.current=null;setState({...blank(key),denied,conflict,uncertain,error:denied?"Права изменились. Данные скрыты.":conflict?"Редакция или история изменилась. Обновите данные перед новой операцией.":invalid?"Проверьте адрес, файл публичной редакции и основание.":"Результат операции не подтверждён. Повторите тот же запрос или загрузите сохранённые сведения."});return false;
  }finally{if(scope.current===key&&run===generation.current)busy.current=false;}
 };
 const retry=()=>pending.current?perform(pending.current.kind,pending.current.name,pending.current.args,/action|deadline/.test(pending.current.name)):Promise.resolve(false);
 const mutate=(name:string,args:Record<string,unknown>,sign=false)=>perform("rpc",name,args,sign);
 const check=(record:PublicationRecord)=>perform("check","publication-accessibility",{organizationId:org,editionId:record.edition.id,expectedRevision:record.edition.revision,expectedEventSequence:record.latest_event_sequence,requestId:crypto.randomUUID()});
 const readHistory=async(editionId:string,before:number|null=null)=>{
  if(scope.current!==key||!rights.current.canRead)return null;const run=generation.current;const abort=new AbortController();
  try{const raw=await invoke("read_organization_publication",{p_organization_id:org,p_edition_id:editionId,p_before_sequence:before,p_limit:100},abort.signal);const parsed=parsePublicationRecord(raw,org);return scope.current===key&&run===generation.current&&parsed.edition.id===editionId?parsed:null;}catch(error){if(scope.current===key&&run===generation.current){const denied=(error as any)?.code==="42501";setState({...blank(key),denied,error:denied?"Нет текущего доступа к истории публикаций.":"Не удалось подтвердить историю. Обновите сведения."});}return null;}
 };
 const readEditions=async(streamId:string,before:number|null=null)=>{
  if(scope.current!==key||!rights.current.canRead)return null;const run=generation.current;const abort=new AbortController();
  try{const raw=await invoke("list_organization_publication_editions",{p_organization_id:org,p_stream_id:streamId,p_before_revision:before,p_limit:25},abort.signal);const rows=parsePublicationEditions(raw,org,streamId,before);return scope.current===key&&run===generation.current?rows as PublicationRecord[]:null;}catch(error){if(scope.current===key&&run===generation.current){const denied=(error as any)?.code==="42501";setState({...blank(key),denied,error:denied?"Нет текущего доступа к истории публикаций.":"Не удалось подтвердить историю. Обновите сведения."});}return null;}
 };
 const loadMore=async(kind:"records"|"tasks")=>{
  if(scope.current!==key||!rights.current.canRead||busy.current||!state.data)return;const run=++generation.current;const abort=new AbortController();controller.current=abort;busy.current=true;
  try{if(kind==="records"){const before=state.data.records[state.data.records.length-1]?.streamId;const raw=await invoke("list_organization_publications",{p_organization_id:org,p_before_stream_id:before,p_limit:50},abort.signal);const more=parsePublicationList(raw,org);if(scope.current===key&&run===generation.current)setState(p=>p.data?{...p,data:{...p.data,records:[...p.data.records,...more],hasMoreRecords:more.length===50}}:p);}else{const before=state.data.tasks[state.data.tasks.length-1]?.id;const raw=await invoke("list_organization_publication_calendar",{p_organization_id:org,p_reporting_year:year,p_before_id:before,p_limit:100},abort.signal);const more=parsePublicationCalendar(raw,org,year);if(scope.current===key&&run===generation.current)setState(p=>p.data?{...p,data:{...p.data,tasks:[...p.data.tasks,...more],hasMoreTasks:more.length===100}}:p);}}
  catch{if(scope.current===key&&run===generation.current)setState({...blank(key),error:"Не удалось загрузить следующую страницу. Обновите сведения."});}finally{if(scope.current===key&&run===generation.current)busy.current=false;}
 };
 return{...(state.key===key?state:blank(key,rights.current.canRead)),actorId:user?.id??null,reload,mutate,check,retry,loadMore,readHistory,readEditions};
}
