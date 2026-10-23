import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useAuth} from '@/hooks/useAuth';
import {useStaffPermissions} from '@/hooks/useStaffPermissions';
import {isCurrentOrganizationAccess} from '@/hooks/useDocumentActionPermissions';
import {captureOfflineContext} from '@/utils/courseCache';
import {captureSignatureAssuranceScope,normalizeSignatureEvidenceError,prepareSignatureAssuranceMutation,readSignatureAssurance,signatureAssuranceScopeCurrent,SignatureEvidenceError} from '@/lib/signatureAssurance/client';
import {prepareEvidenceDownload,type EvidenceDownloadFormat,type PreparedEvidenceDownload} from '@/lib/signatureAssurance/download';
import {sameEvidenceValue} from '@/lib/signatureAssurance/validation';
import type {Capabilities,ErrorCode,Event,FrozenManifest,SignatureContext,SigningParty} from '@/lib/signatureAssurance/types';

/** History covers both parties and has no chosen confirmation party. Compare its
 * common read/export authority, never use it to grant a party's write action. */
function sameHistoryReadAuthority(a:Capabilities,b:Capabilities){
 return(['can_read','can_draft_policy','can_review_policy','can_accept_policy','can_capture_receipt']as const).every(key=>a[key]===b[key])
  &&sameEvidenceValue(a.supported_methods,b.supported_methods)&&sameEvidenceValue(a.unsupported_methods,b.unsupported_methods);
}
interface View {key:string;context:SignatureContext|null;events:Event[];through:number;next:number|null;loading:boolean;error:ErrorCode|null}
const empty=(key:string,loading=false):View=>({key,context:null,events:[],through:0,next:null,loading,error:null});
/** New workspace only. Existing signing pages and legacy transitions are not connected here. */
export function useSignatureAssuranceWorkspace(organizationId:string,signatureId:string,party:SigningParty,open:boolean){
  const auth=useAuth(),permissions=useStaffPermissions(),offline=captureOfflineContext();
  const ready=open&&!auth.loading&&!!auth.user?.id&&!permissions.loading&&!permissions.error&&isCurrentOrganizationAccess(permissions,organizationId);
  const identity=JSON.stringify([organizationId,signatureId,party,open,auth.user?.id,auth.userRole,auth.loading,offline?.actorId,offline?.revision,permissions.organizationId,permissions.loading,permissions.error,permissions.orgRole,permissions.adminRole,[...permissions.orgPermissions].sort(),ready]);
  const observed=useRef({identity,epoch:0});if(observed.current.identity!==identity)observed.current={identity,epoch:observed.current.epoch+1};
  const key=identity+'|'+observed.current.epoch,currentKey=useRef(key);currentKey.current=key;
  const mounted=useRef(true),sequence=useRef(0),busy=useRef<symbol|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;sequence.current++;};},[]);
  const scope=useMemo(()=>{if(!ready)return null;try{return captureSignatureAssuranceScope(organizationId,()=>mounted.current&&currentKey.current===key);}catch{return null;}},[key]);
  const current=useCallback(()=>!!scope&&signatureAssuranceScopeCurrent(scope),[scope]);
  const [view,setView]=useState<View>(()=>empty(key,!!scope)),[savingKey,setSavingKey]=useState<string|null>(null);
  const pending=useRef<{key:string;plan:ReturnType<typeof prepareSignatureAssuranceMutation>}|null>(null);
  const [pendingKey,setPendingKey]=useState<string|null>(null),[actionError,setActionError]=useState<{key:string;code:ErrorCode}|null>(null);
  const prepared=useRef<PreparedEvidenceDownload|null>(null),[download,setDownload]=useState<{key:string;value:PreparedEvidenceDownload}|null>(null);
  const disposeDownload=useCallback(()=>{prepared.current?.dispose();prepared.current=null;setDownload(null);},[]);
  const fail=useCallback((code:ErrorCode)=>{if(current()){disposeDownload();setView({...empty(key),error:code});}},[key,current,disposeDownload]);
  const reload=useCallback(async()=>{
    if(!scope||!current())return;const ticket=++sequence.current;disposeDownload();setView(empty(key,true));
    try{
      const response=await readSignatureAssurance(scope,{kind:'signature',signature_id:signatureId,party_role:party});
      if(!current()||ticket!==sequence.current)return;
      if(response.result.kind!=='signature')throw new SignatureEvidenceError();
      const context=response.result.context;
      const history=await readSignatureAssurance(scope,{kind:'events',stream_kind:'signature',stream_id:signatureId,after_revision:0,through_revision:context.latest_event_revision,limit:100});
      if(!current()||ticket!==sequence.current)return;
      if(history.result.kind!=='events'||!sameHistoryReadAuthority(response.capabilities,history.capabilities))throw new SignatureEvidenceError('ACCESS_DENIED');
      setView({key,context,events:history.result.page.events,through:history.result.page.through_revision,next:history.result.page.next_after_revision,loading:false,error:null});
    }catch(error){if(current()&&ticket===sequence.current)fail(normalizeSignatureEvidenceError(error).code);}
  },[scope,key,signatureId,party,current,disposeDownload,fail]);
  useEffect(()=>{sequence.current++;busy.current=null;pending.current=null;setSavingKey(null);setPendingKey(null);setActionError(null);disposeDownload();},[key,disposeDownload]);
  useEffect(()=>{void reload();},[reload]);
  useEffect(()=>()=>{prepared.current?.dispose();},[]);
  useEffect(()=>{if(!download||download.key!==key)return;const value=download.value,timer=setTimeout(()=>{if(prepared.current===value)disposeDownload();},300_000);return()=>clearTimeout(timer);},[download,key,disposeDownload]);
  const loadMore=useCallback(async()=>{
    if(!scope||!current()||view.key!==key||!view.context||view.next===null||view.loading||busy.current)return;
    const token=Symbol('history'),ticket=sequence.current;busy.current=token;setSavingKey(key);
    try{
      const response=await readSignatureAssurance(scope,{kind:'events',stream_kind:'signature',stream_id:signatureId,after_revision:view.next,through_revision:view.through,limit:100});
      if(!current()||ticket!==sequence.current)return;
      if(response.result.kind!=='events'||!sameHistoryReadAuthority(response.capabilities,view.context.capabilities))throw new SignatureEvidenceError('ACCESS_DENIED');
      const page=response.result.page;
      setView(old=>old.key!==key?old:{...old,events:[...old.events,...page.events],next:page.next_after_revision});
    }catch(error){if(current()&&ticket===sequence.current)fail(normalizeSignatureEvidenceError(error).code);}
    finally{if(busy.current===token){busy.current=null;if(current())setSavingKey(null);}}
  },[scope,key,view,signatureId,current,fail]);
  const capture=useCallback(async(format:EvidenceDownloadFormat,retry:boolean)=>{
    if(!scope||!current()||view.key!==key||!view.context||view.loading||!view.context.capabilities.can_capture_receipt||busy.current)throw new SignatureEvidenceError('ACCESS_DENIED');
    if(!retry&&pending.current?.key===key)throw new SignatureEvidenceError('REQUEST_CONFLICT');
    const token=Symbol('capture');busy.current=token;setSavingKey(key);setActionError(null);disposeDownload();
    try{
      let saved=pending.current;
      if(retry){if(!saved||saved.key!==key)throw new SignatureEvidenceError('SOURCE_UNAVAILABLE');}
      else{
        const revision=view.context.latest_event_revision;
        saved={key,plan:prepareSignatureAssuranceMutation(scope,revision,{action:'capture_receipt',signature_id:signatureId,party_role:party,through_revision:revision})};
        pending.current=saved;setPendingKey(key);
      }
      const response=await saved!.plan.run();if(!current())throw new SignatureEvidenceError('ACCESS_DENIED');
      // Confirmed capture consumes its exact pending request before any subsequent hash/download work.
      if(pending.current===saved){pending.current=null;setPendingKey(null);}
      if(response.result.kind!=='receipt')throw new SignatureEvidenceError();
      const manifest:FrozenManifest=response.result.manifest;
      const readyDownload=await prepareEvidenceDownload(manifest,format,{organizationId,signatureId,sourceManifestId:manifest.body.source_manifest_id,current});
      if(!current()){readyDownload.dispose();throw new SignatureEvidenceError('ACCESS_DENIED');}
      prepared.current=readyDownload;setDownload({key,value:readyDownload});return readyDownload;
    }catch(error){
      const normalized=normalizeSignatureEvidenceError(error);
      if(current()){
        setActionError({key,code:normalized.code});
        if(normalized.code!=='DEPENDENCY_UNAVAILABLE'){pending.current=null;setPendingKey(null);}
        if(['ACCESS_DENIED','SOURCE_UNAVAILABLE','NOT_FOUND'].includes(normalized.code))fail(normalized.code);
      }
      throw normalized;
    }finally{if(busy.current===token){busy.current=null;if(current())setSavingKey(null);}}
  },[scope,key,view,party,organizationId,signatureId,current,disposeDownload,fail]);
  // A changed owner/role/permission/open epoch masks data during render, before passive effects run.
  const visible=view.key===key&&current()?view:empty(key,!!scope);
  const readyDownload=download?.key===key&&current()&&download.value.available()?download.value:null;
  return {key,current,context:visible.context,events:visible.events,historyThrough:visible.through,historyComplete:visible.next===null,next:visible.next,
    loading:visible.loading,saving:savingKey===key,pending:pendingKey===key,error:!scope&&open?'ACCESS_DENIED' as const:visible.error,
    actionError:actionError?.key===key?actionError.code:null,download:readyDownload,reload,loadMore,
    prepareDownload:(format:EvidenceDownloadFormat)=>capture(format,false),retryDownload:(format:EvidenceDownloadFormat)=>capture(format,true)};
}
export type SignatureAssuranceWorkspace=ReturnType<typeof useSignatureAssuranceWorkspace>;
