import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,render,renderHook,waitFor} from '@testing-library/react';
import {useLayoutEffect} from 'react';
import {webcrypto} from 'node:crypto';
import type * as t from '@/lib/signatureAssurance/types';
import type {PreparedEvidenceDownload} from '@/lib/signatureAssurance/download';
import {actor,caps,id,manifest,org,signature} from '@/lib/signatureAssurance/__tests__/fixtures';

const state=vi.hoisted(()=>({actor:'',revision:1,permissionOrg:'',permissions:['documents.read'],context:null as t.SignatureContext|null,manifest:null as t.FrozenManifest|null,events:[]as t.Event[],
  readWait:null as Promise<void>|null,runWait:null as Promise<void>|null,prepareWait:null as Promise<void>|null,runError:null as t.ErrorCode|null,
  historyCaps:null as t.Capabilities|null,reads:[]as {query:t.ReadQuery;org:string}[],plans:[]as {requestId:string;runs:number}[],downloads:[]as (PreparedEvidenceDownload&{disposed:boolean})[]}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:state.actor},userRole:'organization',loading:false})}));
vi.mock('@/hooks/useStaffPermissions',()=>({useStaffPermissions:()=>({organizationId:state.permissionOrg,loading:false,error:null,orgRole:'owner',adminRole:null,orgPermissions:new Set(state.permissions)})}));
vi.mock('@/hooks/useDocumentActionPermissions',()=>({isCurrentOrganizationAccess:(value:{organizationId:string},organizationId:string)=>value.organizationId===organizationId}));
vi.mock('@/utils/courseCache',()=>({captureOfflineContext:()=>({actorId:state.actor,revision:state.revision})}));
vi.mock('@/lib/signatureAssurance/client',()=>{
  class Failure extends Error{constructor(readonly code:t.ErrorCode='DEPENDENCY_UNAVAILABLE'){super(code);}}
  return {SignatureEvidenceError:Failure,normalizeSignatureEvidenceError:(value:unknown)=>value instanceof Failure?value:new Failure(),
    captureSignatureAssuranceScope:(organizationId:string,current:()=>boolean)=>({organizationId,actorId:state.actor,accessRevision:state.revision,current}),
    signatureAssuranceScopeCurrent:(scope:{actorId:string;accessRevision:number;current:()=>boolean})=>scope.actorId===state.actor&&scope.accessRevision===state.revision&&scope.current(),
    readSignatureAssurance:vi.fn(async(scope:{organizationId:string},query:t.ReadQuery)=>{
      state.reads.push({query,org:scope.organizationId});if(state.readWait)await state.readWait;if(!state.context)throw new Failure();
      if(query.kind==='signature')return{capabilities:state.context.capabilities,result:{kind:'signature',context:{...state.context,organization_id:scope.organizationId,signature_id:query.signature_id,chosen_party:query.party_role}}};
      if(query.kind==='events')return{capabilities:state.historyCaps??state.context.capabilities,result:{kind:'events',page:{stream_kind:'signature',stream_id:query.stream_id,through_revision:query.through_revision,after_revision:query.after_revision,events:state.events,next_after_revision:null}}};
      throw new Failure();
    }),
    prepareSignatureAssuranceMutation:(_scope:unknown,_expected:number,_action:unknown)=>{
      const plan={requestId:crypto.randomUUID(),runs:0};state.plans.push(plan);
      return{requestId:plan.requestId,run:async()=>{plan.runs++;if(state.runWait)await state.runWait;if(state.runError)throw new Failure(state.runError);return{result:{kind:'receipt',manifest:state.manifest}};}};
    },
  };
});
vi.mock('@/lib/signatureAssurance/download',()=>({prepareEvidenceDownload:vi.fn(async(_manifest:unknown,format:'json'|'html',scope:{current:()=>boolean})=>{
  if(state.prepareWait)await state.prepareWait;
  const value={filename:'Синтетический-пакет.'+format,format,disposed:false,available:()=>!value.disposed&&scope.current(),handoff:()=>{if(!value.available())throw new Error('STALE');},dispose:()=>{value.disposed=true;}};state.downloads.push(value);return value;
})}));
import {useSignatureAssuranceWorkspace} from '../useSignatureAssuranceWorkspace';
type Input={organizationId:string;signatureId:string;party:t.SigningParty;open:boolean};
const input:Input={organizationId:org,signatureId:signature,party:'recipient',open:true};
beforeEach(async()=>{vi.stubGlobal('crypto',webcrypto);state.actor=actor;state.revision=1;state.permissionOrg=org;state.permissions=['documents.read'];state.manifest=await manifest();state.context=state.manifest.body.context;state.events=state.manifest.body.events;
  state.readWait=null;state.runWait=null;state.prepareWait=null;state.runError=null;state.historyCaps=null;state.reads=[];state.plans=[];state.downloads=[];});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
describe('signature workspace observed owner epochs',()=>{
  it('loads the explicit party and a complete history page pinned to the same global boundary',async()=>{
    const {result}=renderHook(()=>useSignatureAssuranceWorkspace(org,signature,'recipient',true));await waitFor(()=>expect(result.current.context).not.toBeNull());
    expect(state.reads.map(value=>value.query)).toEqual([{kind:'signature',signature_id:signature,party_role:'recipient'},{kind:'events',stream_kind:'signature',stream_id:signature,after_revision:0,through_revision:1,limit:100}]);
    expect(result.current.events).toHaveLength(1);expect(result.current.historyComplete).toBe(true);
  });
  it.each(['actor','organization','signature','party','permissions','open']as const)('masks old data during layout and never revives it after observed %s A→B→A before passive reset',async(kind)=>{
    const observed:(t.SignatureContext|null)[]=[];let capture=false;
    function Probe(props:Input){const model=useSignatureAssuranceWorkspace(props.organizationId,props.signatureId,props.party,props.open);useLayoutEffect(()=>{if(capture)observed.push(model.context);});return <span>{model.context?.signature_id??'empty'}</span>;}
    const view=render(<Probe {...input}/>);await waitFor(()=>expect(view.container.textContent).toBe(signature));
    state.readWait=new Promise(()=>{});capture=true;let other={...input};
    if(kind==='actor'){state.actor=id(99);state.revision++;}if(kind==='organization')other.organizationId=id(99);if(kind==='signature')other.signatureId=id(99);if(kind==='party')other.party='sender';if(kind==='permissions')state.permissions=[];if(kind==='open')other.open=false;
    act(()=>view.rerender(<Probe {...other}/>));expect(observed.length).toBeGreaterThan(0);expect(observed.every(value=>value===null)).toBe(true);
    if(kind==='actor'){state.actor=actor;state.revision++;}if(kind==='permissions')state.permissions=['documents.read'];
    act(()=>view.rerender(<Probe {...input}/>));expect(observed.every(value=>value===null)).toBe(true);expect(view.container.textContent).toBe('empty');
  });
  it('does not prepare or hand off a late capture result after actor changes',async()=>{
    const {result,rerender}=renderHook(()=>useSignatureAssuranceWorkspace(org,signature,'recipient',true));await waitFor(()=>expect(result.current.context).not.toBeNull());
    let release!:()=>void;state.runWait=new Promise(resolve=>{release=resolve;});let pending!:Promise<PreparedEvidenceDownload>;
    act(()=>{pending=result.current.prepareDownload('json');});await waitFor(()=>expect(state.plans).toHaveLength(1));state.actor=id(99);state.revision++;rerender();release();
    await expect(pending).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(state.downloads).toHaveLength(0);expect(result.current.download).toBeNull();
  });
  it('disposes a late prepared blob after close and re-open instead of reviving a ready link',async()=>{
    let open=true;const {result,rerender}=renderHook(()=>useSignatureAssuranceWorkspace(org,signature,'recipient',open));await waitFor(()=>expect(result.current.context).not.toBeNull());
    let release!:()=>void;state.prepareWait=new Promise(resolve=>{release=resolve;});let pending!:Promise<PreparedEvidenceDownload>;
    act(()=>{pending=result.current.prepareDownload('json');});await waitFor(()=>expect(state.plans[0]?.runs).toBe(1));
    act(()=>{open=false;rerender();});act(()=>{open=true;rerender();});release();
    await expect(pending).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(state.downloads[0]?.disposed).toBe(true);expect(result.current.download).toBeNull();
  });
  it('keeps one original uncertain request and does not discard it when a second capture is refused',async()=>{
    const {result}=renderHook(()=>useSignatureAssuranceWorkspace(org,signature,'recipient',true));await waitFor(()=>expect(result.current.context).not.toBeNull());state.runError='DEPENDENCY_UNAVAILABLE';
    await act(async()=>{await expect(result.current.prepareDownload('json')).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});});expect(result.current.pending).toBe(true);
    await expect(result.current.prepareDownload('html')).rejects.toMatchObject({code:'REQUEST_CONFLICT'});expect(result.current.pending).toBe(true);state.runError=null;
    await act(async()=>{await result.current.retryDownload('json');});expect(state.plans).toHaveLength(1);expect(state.plans[0].runs).toBe(2);expect(result.current.pending).toBe(false);expect(result.current.download?.format).toBe('json');
  });
  it('preserves history read authority when only party-specific write capabilities differ',async()=>{
    state.context={...state.context!,capabilities:{...caps,can_confirm_sender:true,can_bind_signature:true}};state.historyCaps={...caps,can_confirm_sender:false,can_bind_signature:false};
    const {result}=renderHook(()=>useSignatureAssuranceWorkspace(org,signature,'sender',true));await waitFor(()=>expect(result.current.context).not.toBeNull());expect(result.current.error).toBeNull();expect(result.current.context!.capabilities.can_confirm_sender).toBe(true);expect(result.current.events).toHaveLength(1);
  });
  it('does not retain source context when a history response observes a changed capability vector',async()=>{
    state.historyCaps={...caps,can_capture_receipt:false};const {result}=renderHook(()=>useSignatureAssuranceWorkspace(org,signature,'recipient',true));await waitFor(()=>expect(result.current.error).toBe('ACCESS_DENIED'));expect(result.current.context).toBeNull();expect(result.current.events).toEqual([]);
  });
  it('invalidates captured callbacks and an existing prepared download on account ABA even without a React render',async()=>{
    const {result}=renderHook(()=>useSignatureAssuranceWorkspace(org,signature,'recipient',true));await waitFor(()=>expect(result.current.context).not.toBeNull());
    let ready!:PreparedEvidenceDownload;await act(async()=>{ready=await result.current.prepareDownload('json');});expect(ready.available()).toBe(true);
    state.actor=id(99);state.revision++;state.actor=actor;state.revision++;expect(result.current.current()).toBe(false);expect(ready.available()).toBe(false);expect(()=>ready.handoff()).toThrow();
  });
});
