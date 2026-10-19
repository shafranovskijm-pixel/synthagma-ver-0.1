import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {FunctionsHttpError} from '@supabase/functions-js';
import {setOfflineAuthActor} from '@/utils/courseCache';
import * as f from '@/lib/admissionCases/__tests__/fixtures';
import {captureAdmissionScope} from '@/lib/admissionCases/client';
import {useAdmissionCase,useAdmissionEvidenceFile} from '../useAdmissionCase';
const m=vi.hoisted(()=>({user:{id:'11111111-1111-4111-8111-000000000001'},handler:(_name:string,_args:any):any=>null,rpc:vi.fn(),invoke:vi.fn(),media:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:m.user,loading:false})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:m.user.id},access_token:'SYNTHETIC_A'}},error:null})},rpc:m.rpc,functions:{invoke:m.invoke}}}));
vi.mock('@/lib/admissionCases/client',async original=>({...await original<typeof import('@/lib/admissionCases/client')>(),readAdmissionEvidenceFile:m.media}));
const scopeFor=(user:string)=>({...f.scope,user_id:user,group_id:user===f.learner?f.group:f.id(80)});
const stateFor=(user:string,extra:any={})=>f.staffCase({scope:scopeFor(user),...extra});
const readFor=(user:string,extra:any={})=>({...f.staffRead(stateFor(user,extra)),scope:scopeFor(user)});
const prepared=()=>({schema_version:1,case_id:f.caseId,case_revision:3,reservation_id:f.id(60),evidence_version_id:f.id(61),expires_at:'2026-10-19T01:00:00Z',source_kind:'existing',upload_slot:null});
const source={kind:'existing' as const,requirement_id:f.id(20),supersedes_id:null,candidate:{kind:'identity_document' as const,id:f.id(70),version_id:null,fingerprint:f.hash}};
beforeEach(()=>{
  vi.clearAllMocks();setOfflineAuthActor(null);setOfflineAuthActor(f.actor);m.user={id:f.actor};
  m.handler=(name,args)=>{
    if(name==='read_student_admission_case'){
      if(args.p_query.mode==='associations') return {data:{...f.associations(),user_id:args.p_student_user_id,items:[{scope:scopeFor(args.p_student_user_id),group_label:'Синтетическая группа',case_id:f.caseId,prerequisites:[]}]},error:null};
      return {data:readFor(args.p_student_user_id),error:null};
    }
    if(name==='prepare_admission_case_evidence') return {data:prepared(),error:null};
    return {data:f.mutation('assign_responsible',4,args.p_request_id),error:null};
  };
  m.rpc.mockImplementation((name,args)=>({setHeader:()=>Promise.resolve(m.handler(name,args))}));
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn().mockReturnValue('blob:synthetic-private')});
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});m.media.mockResolvedValue(new Blob(['synthetic'],{type:'application/pdf'}));
});
afterEach(()=>{cleanup();setOfflineAuthActor(null);});
const loaded=async(h:any)=>waitFor(()=>expect(h.result.current.staff?.id).toBe(f.caseId));
describe('actual hook + strict client authority and pending operations',()=>{
  it('confirmed exact case is cleared on same-key authoritative read denial',async()=>{const h=renderHook(()=>useAdmissionCase(f.org,f.learner));await loaded(h);m.handler=()=>({data:null,error:{code:'42501',message:'ADMISSION_ACCESS_DENIED'}});await act(async()=>{await h.result.current.refresh();});expect(h.result.current.data).toBeNull();expect(h.result.current.error).toBe('ACCESS_DENIED');});
  it.each(['options','history'] as const)('current denied %s masks the whole case and invalidates prior resource scopes without automatic resurrection',async mode=>{
    const h=renderHook(()=>useAdmissionCase(f.org,f.learner));await loaded(h);const prior=h.result.current.scope!;const count=m.rpc.mock.calls.length;
    const original=m.handler;m.handler=(name,args)=>args.p_query?.mode===mode?{data:null,error:{code:'42501',message:'ADMISSION_ACCESS_DENIED'}}:original(name,args);
    await act(async()=>{expect(await(mode==='options'?h.result.current.options('responsibles'):h.result.current.history())).toBeNull();});
    expect(h.result.current.data).toBeNull();expect(h.result.current.error).toBe('ACCESS_DENIED');expect(prior.current?.()).toBe(false);expect(m.rpc.mock.calls).toHaveLength(count+1);
  });
  it('case resource denial removes an already rendered private Blob and its URL',async()=>{
    const h=renderHook(()=>{const controller=useAdmissionCase(f.org,f.learner);const file=useAdmissionEvidenceFile(controller.staff?controller.scope:null,controller.staff,controller.staff?.evidence[0]||null,null,controller.denyAccess);return {controller,file};});
    await waitFor(()=>expect(h.result.current.file.url).toBe('blob:synthetic-private'));const original=m.handler;m.handler=(name,args)=>args.p_query?.mode==='options'?{data:null,error:{code:'42501',message:'ADMISSION_ACCESS_DENIED'}}:original(name,args);
    await act(async()=>{await h.result.current.controller.options('responsibles');});expect(h.result.current.controller.data).toBeNull();expect(h.result.current.file.url).toBeNull();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-private');
  });
  it('actual FunctionsHttpError403 after preparation clears private case and does not become uncertain retry',async()=>{const h=renderHook(()=>useAdmissionCase(f.org,f.learner));await loaded(h);m.invoke.mockResolvedValue({data:null,error:new FunctionsHttpError(new Response('forbidden',{status:403}))});await act(async()=>{expect(await h.result.current.capture(f.id(20),source)).toBe(false);});expect(h.result.current.data).toBeNull();expect(h.result.current.error).toBe('ACCESS_DENIED');expect(h.result.current.pending).toBe(false);});
  it('unknown action retry keeps original request and CAS after a newer read; no optimistic outcome',async()=>{
    const h=renderHook(()=>useAdmissionCase(f.org,f.learner));await loaded(h);const original=m.handler;let calls=0;
    m.handler=(name,args)=>name==='apply_student_admission_case_action'?(++calls===1?{data:null,error:{message:'network disconnected'}}:{data:{...f.mutation('assign_responsible',4,args.p_request_id),replayed:true,state:f.staffCase({revision:8})},error:null}):name==='read_student_admission_case'&&args.p_query.mode==='case'?{data:f.staffRead(f.staffCase({revision:8})),error:null}:original(name,args);
    await act(async()=>{expect(await h.result.current.mutate(f.action())).toBe(false);});expect(h.result.current.pending).toBe(true);expect(h.result.current.staff?.revision).toBe(3);
    await act(async()=>{await h.result.current.refresh();});expect(h.result.current.staff?.revision).toBe(8);
    await act(async()=>{expect(await h.result.current.mutate({...f.action(),expected_revision:8})).toBe(false);expect(await h.result.current.retryPending()).toBe(true);});
    const writes=m.rpc.mock.calls.filter(call=>call[0]==='apply_student_admission_case_action');expect(writes).toHaveLength(2);expect(writes[0][1]).toEqual(writes[1][1]);expect(writes[1][1].p_command.expected_revision).toBe(3);expect(h.result.current.pending).toBe(false);
  });
  it('unknown evidence retry preserves original prepare+commit request/body despite later state/replacement',async()=>{
    const h=renderHook(()=>useAdmissionCase(f.org,f.learner));await loaded(h);m.invoke.mockResolvedValueOnce({data:null,error:{message:'network'}}).mockImplementation(async(_name,args)=>({data:{...f.mutation('evidence_committed',4,args.body.request_id),replayed:true,state:f.staffCase({revision:8,evidence:[]})},error:null}));
    await act(async()=>{expect(await h.result.current.capture(f.id(20),source)).toBe(false);});expect(h.result.current.pending).toBe(true);
    const original=m.handler;m.handler=(name,args)=>name==='read_student_admission_case'&&args.p_query.mode==='case'?{data:f.staffRead(f.staffCase({revision:8})),error:null}:original(name,args);
    await act(async()=>{await h.result.current.refresh();expect(await h.result.current.retryPending()).toBe(true);});
    const prepares=m.rpc.mock.calls.filter(call=>call[0]==='prepare_admission_case_evidence');expect(prepares).toHaveLength(2);expect(prepares[0][1]).toEqual(prepares[1][1]);expect(prepares[1][1].p_expected_revision).toBe(3);expect(m.invoke.mock.calls[0][1].body).toEqual(m.invoke.mock.calls[1][1].body);expect(h.result.current.staff?.revision).toBe(8);
  });
  it('route A→B→A drops the first late private read even though the final student id matches',async()=>{
    let finish!:(value:any)=>void;const original=m.handler;let first=true;
    m.handler=(name,args)=>name==='read_student_admission_case'&&args.p_query.mode==='case'&&args.p_student_user_id===f.learner&&first?(first=false,new Promise(resolve=>{finish=resolve;})):original(name,args);
    const h=renderHook(({student})=>useAdmissionCase(f.org,student),{initialProps:{student:f.learner}});await waitFor(()=>expect(finish).toBeDefined());
    h.rerender({student:f.id(90)});await waitFor(()=>expect(h.result.current.staff?.scope.user_id).toBe(f.id(90)));h.rerender({student:f.learner});await loaded(h);
    await act(async()=>{finish({data:readFor(f.learner,{program_title:'OLD PRIVATE RESPONSE'}),error:null});});expect(h.result.current.staff?.program_title).not.toBe('OLD PRIVATE RESPONSE');
  });
  it('actual actor ABA cannot publish an old mutation or keep an unknown pending body',async()=>{
    const h=renderHook(()=>useAdmissionCase(f.org,f.learner));await loaded(h);let finish!:(value:any)=>void;const original=m.handler;
    m.handler=(name,args)=>name==='apply_student_admission_case_action'?new Promise(resolve=>{finish=resolve;}):original(name,args);
    let result!:Promise<boolean>;act(()=>{result=h.result.current.mutate(f.action());});await waitFor(()=>expect(finish).toBeDefined());
    act(()=>{m.user={id:f.id(99)};setOfflineAuthActor(f.id(99));h.rerender();});act(()=>{m.user={id:f.actor};setOfflineAuthActor(f.actor);h.rerender();});await loaded(h);
    await act(async()=>{finish({data:f.mutation(),error:null});expect(await result).toBe(false);});expect(h.result.current.staff?.revision).toBe(3);expect(h.result.current.pending).toBe(false);
  });
  it('observed permission revision invalidates a dispatched write and read-only state cannot call the mutation RPC',async()=>{
    const h=renderHook(({rights})=>useAdmissionCase(f.org,f.learner,true,rights),{initialProps:{rights:'both-write'}});await loaded(h);let finish!:(value:any)=>void;const original=m.handler;
    m.handler=(name,args)=>name==='apply_student_admission_case_action'?new Promise(resolve=>{finish=resolve;}):original(name,args);
    let result!:Promise<boolean>;act(()=>{result=h.result.current.mutate(f.action());});await waitFor(()=>expect(finish).toBeDefined());
    m.handler=(name,args)=>name==='read_student_admission_case'&&args.p_query.mode==='case'?{data:f.staffRead(f.staffCase({capabilities:{...f.caps,can_assign:false,can_review:false,can_decide:false,can_prepare_evidence:false,can_configure_rules:false}})),error:null}:original(name,args);
    h.rerender({rights:'read-only'});await loaded(h);await act(async()=>{finish({data:f.mutation(),error:null});expect(await result).toBe(false);});const count=m.rpc.mock.calls.filter(call=>call[0]==='apply_student_admission_case_action').length;
    await act(async()=>{expect(await h.result.current.mutate(f.action())).toBe(false);});expect(m.rpc.mock.calls.filter(call=>call[0]==='apply_student_admission_case_action')).toHaveLength(count);
  });
  it('own-only UI refuses a staff projection and cannot submit any staff decision',async()=>{m.user={id:f.learner};setOfflineAuthActor(f.learner);const h=renderHook(()=>useAdmissionCase(f.org,f.learner,true,'',true));await waitFor(()=>expect(h.result.current.error).toBe('ACCESS_DENIED'));expect(h.result.current.data).toBeNull();expect(await h.result.current.mutate(f.action())).toBe(false);});
});
describe('private Blob lifecycle uses actual actor/access epoch',()=>{
  it('opens only local Blob URL and revokes on close',async()=>{const scope=captureAdmissionScope(f.org,f.learner,f.scope);const h=renderHook(({record})=>useAdmissionEvidenceFile(scope,f.staffCase(),record),{initialProps:{record:f.evidence() as ReturnType<typeof f.evidence>|null}});await waitFor(()=>expect(h.result.current.url).toBe('blob:synthetic-private'));h.rerender({record:null});expect(h.result.current.url).toBeNull();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-private');});
  it('late Blob after actor A→B→A never gets a URL',async()=>{let finish!:(value:Blob)=>void;m.media.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const scope=captureAdmissionScope(f.org,f.learner,f.scope);const h=renderHook(()=>useAdmissionEvidenceFile(scope,f.staffCase(),f.evidence()));act(()=>{setOfflineAuthActor(f.id(99));setOfflineAuthActor(f.actor);});await act(async()=>{finish(new Blob(['late']));});expect(h.result.current.url).toBeNull();expect(URL.createObjectURL).not.toHaveBeenCalled();});
  it('already opened Blob is revoked on observed ABA even if caller holds the original scope',async()=>{const scope=captureAdmissionScope(f.org,f.learner,f.scope);const h=renderHook(()=>useAdmissionEvidenceFile(scope,f.staffCase(),f.evidence()));await waitFor(()=>expect(h.result.current.url).toBe('blob:synthetic-private'));act(()=>{setOfflineAuthActor(f.id(99));setOfflineAuthActor(f.actor);h.rerender();});expect(h.result.current.url).toBeNull();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-private');});
  it('unmount before bytes resolves discards them without creating an orphan URL',async()=>{let finish!:(value:Blob)=>void;m.media.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const scope=captureAdmissionScope(f.org,f.learner,f.scope);const h=renderHook(()=>useAdmissionEvidenceFile(scope,f.staffCase(),f.evidence()));h.unmount();await act(async()=>{finish(new Blob(['late']));});expect(URL.createObjectURL).not.toHaveBeenCalled();});
});
