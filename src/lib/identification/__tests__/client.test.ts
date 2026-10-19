import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {Capacitor} from '@capacitor/core';
import {setOfflineAuthActor,captureOfflineContext} from '@/utils/courseCache';
import {captureIdentificationScope,readIdentificationStates,prepareIdentification,decideIdentification,readIdentificationMedia,submitIdentification} from '../client';
const mocks=vi.hoisted(()=>({session:vi.fn(),rpc:vi.fn(),invoke:vi.fn(),headers:[] as string[],response:null as any}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:mocks.session},rpc:mocks.rpc,functions:{invoke:mocks.invoke}}}));
const id=(suffix:string)=>`11111111-1111-4111-8111-${suffix.padStart(12,'0')}`;
const actor=id('1'),org=id('2'),recordId=id('3'),sourceId=id('4'),eventId=id('5'),requestId=id('6');
const caps={canSubmit:true,canReview:true,canReject:true,canReset:true,canReadMedia:true};
const record=(extra:any={})=>({identificationId:recordId,organizationId:org,studentUserId:actor,enrollmentId:null,revision:2,status:'pending',sourceKind:'self_photo',assurance:'submitted',createdAt:'2026-10-19T00:00:00Z',submittedAt:'2026-10-19T00:00:00Z',decidedAt:null,rejectionReason:null,media:{identificationId:recordId,sourceId},projectionPresent:true,capabilities:caps,...extra});
const subject=(extra:any={})=>({organizationId:org,studentUserId:actor,requestedEnrollmentId:null,current:record(),history:[],events:[],historyTruncated:false,compatibility:{historicalVerifiedObserved:false},capabilities:caps,...extra});
const mutation=(action='verified',extra:any={})=>({contractVersion:1,replayed:false,record:record({revision:3,status:'verified',assurance:'current_server_review'}),event:{eventId,identificationId:recordId,revision:3,action,at:'2026-10-19T00:01:00Z',reason:null,reviewerUserId:actor},...extra});
const prepared=()=>({contractVersion:1 as const,replayed:false,identificationId:recordId,sourceId,revision:1 as const,bucket:'student-identification-media' as const,path:`${actor}/${org}/${recordId}/${sourceId}/capture.jpg`,expiresAt:'2026-10-19T00:30:00Z',maxBytes:5242880 as const,mimeType:'image/jpeg' as const});
beforeEach(()=>{vi.clearAllMocks();setOfflineAuthActor(null);setOfflineAuthActor(actor);mocks.headers=[];
  mocks.session.mockResolvedValue({data:{session:{user:{id:actor},access_token:'SYNTHETIC_A'}},error:null});
  mocks.rpc.mockImplementation(()=>({setHeader:(_name:string,bearer:string)=>{mocks.headers.push(bearer);return Promise.resolve({data:mocks.response,error:null});}}));
  vi.stubEnv('VITE_SUPABASE_URL','https://synthetic.invalid');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','SYNTHETIC_PUBLIC');});
afterEach(()=>{setOfflineAuthActor(null);vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('strict canonical identification transport',()=>{
  it('reads exact authorized state with captured bearer and no raw locator fields',async()=>{mocks.response={contractVersion:1,subjects:[subject()]};const result=await readIdentificationStates(captureIdentificationScope(org,actor),[actor],true);
    expect(result[0].current?.media?.sourceId).toBe(sourceId);expect(mocks.headers).toEqual(['Bearer SYNTHETIC_A']);});
  it.each([{ids:[]},{ids:[actor,actor]},{ids:Array.from({length:101},(_,index)=>id(String(index+10)))},{ids:['../foreign']}])('rejects malformed batch before dispatch: %j',async({ids})=>{await expect(readIdentificationStates(captureIdentificationScope(org,actor),ids)).rejects.toThrow();expect(mocks.rpc).not.toHaveBeenCalled();});
  it.each([subject({studentUserId:id('9')}),subject({current:record({organizationId:id('9')})}),subject({current:{...record(),photo_url:'https://foreign.invalid/private'}}),subject({current:null,history:[],events:[{eventId,identificationId:id('9'),revision:1,action:'reset',at:'2026-10-19T00:00:00Z',reason:null,reviewerUserId:null}]})])('rejects foreign/unknown response shapes %j',async value=>{mocks.response={contractVersion:1,subjects:[value]};await expect(readIdentificationStates(captureIdentificationScope(org,actor),[actor],true)).rejects.toThrow();});
  it('distinguishes confirmed empty from errors',async()=>{mocks.response={contractVersion:1,subjects:[subject({current:null,history:[]})]};expect((await readIdentificationStates(captureIdentificationScope(org,actor),[actor]))[0].current).toBeNull();
    mocks.response=null;await expect(readIdentificationStates(captureIdentificationScope(org,actor),[actor])).rejects.toThrow();});
  it('drops A→B→A after deferred session resolution before any rpc',async()=>{let resolve!:(value:any)=>void;mocks.session.mockReturnValueOnce(new Promise(done=>{resolve=done;}));const scope=captureIdentificationScope(org,actor);const result=readIdentificationStates(scope,[actor]);
    setOfflineAuthActor(id('9'));setOfflineAuthActor(actor);resolve({data:{session:{user:{id:actor},access_token:'SYNTHETIC_A'}},error:null});await expect(result).rejects.toThrow();expect(mocks.rpc).not.toHaveBeenCalled();});
  it('drops canonical result when actual access epoch changes after dispatch',async()=>{let resolve!:(value:any)=>void;mocks.rpc.mockReturnValue({setHeader:()=>new Promise(done=>{resolve=done;})});const result=readIdentificationStates(captureIdentificationScope(org,actor),[actor]);await vi.waitFor(()=>expect(mocks.rpc).toHaveBeenCalled());
    setOfflineAuthActor(id('9'));setOfflineAuthActor(actor);resolve({data:{contractVersion:1,subjects:[subject()]},error:null});await expect(result).rejects.toThrow();});
  it('accepts only exact reserved private create-only destination',async()=>{mocks.response=prepared();expect((await prepareIdentification(captureIdentificationScope(org,actor),requestId)).path).toBe(prepared().path);
    mocks.response={...prepared(),path:'avatars/foreign.jpg'};await expect(prepareIdentification(captureIdentificationScope(org,actor),requestId)).rejects.toThrow();});
  it('decides one exact displayed id/revision and requires canonical event echo',async()=>{mocks.response=mutation();await decideIdentification(captureIdentificationScope(org,actor),'verify',record(),requestId);
    expect(mocks.rpc).toHaveBeenLastCalledWith('decide_student_identification',expect.objectContaining({p_identification_id:recordId,p_expected_revision:2,p_action:'verify'}));
    mocks.response=mutation('verified',{event:null});await expect(decideIdentification(captureIdentificationScope(org,actor),'verify',record(),requestId)).rejects.toThrow();});
  it('manual verification is intentional new no-photo provenance',async()=>{const manual=record({identificationId:id('8'),revision:1,status:'verified',sourceKind:'manual_staff_claim',assurance:'current_server_review',media:null});
    mocks.response={contractVersion:1,replayed:false,record:manual,event:{eventId,identificationId:id('8'),revision:1,action:'manual_verified',at:'2026-10-19T00:01:00Z',reason:null,reviewerUserId:actor}};
    await decideIdentification(captureIdentificationScope(org,actor),'manual_verify',null,requestId);
    expect(mocks.rpc).toHaveBeenLastCalledWith('decide_student_identification',expect.objectContaining({p_identification_id:null,p_expected_revision:0,p_action:'manual_verify'}));});
  it('private media uses fixed endpoint, pinned original bearer and no-store without signed URL',async()=>{const fetch=vi.fn().mockResolvedValue({ok:true,headers:new Headers({'Content-Type':'image/jpeg'}),blob:async()=>new Blob(['synthetic'],{type:'image/jpeg'})});vi.stubGlobal('fetch',fetch);
    expect((await readIdentificationMedia(captureIdentificationScope(org,actor),record())).type).toBe('image/jpeg');
    expect(fetch).toHaveBeenCalledWith('https://synthetic.invalid/functions/v1/student-identification-media',expect.objectContaining({cache:'no-store',credentials:'omit',headers:expect.objectContaining({Authorization:'Bearer SYNTHETIC_A'}),body:JSON.stringify({identificationId:recordId,sourceId})}));});
  it('actual installed StorageClient uploads create-only with original bearer, then accepts only pending submit echo',async()=>{
    const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({Key:prepared().path,Id:id('7')}),{status:200,headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetch);
    mocks.invoke.mockResolvedValue({data:{contractVersion:1,replayed:false,record:record(),event:{eventId,identificationId:recordId,revision:2,action:'submitted',at:'2026-10-19T00:00:00Z',reason:null,reviewerUserId:null}},error:null});
    const result=await submitIdentification(captureIdentificationScope(org,actor),prepared(),new Blob(['SYNTHETIC_JPEG'],{type:'image/jpeg'}),requestId);
    expect(result.record.status).toBe('pending');expect(fetch).toHaveBeenCalledOnce();
    const headers=new Headers(fetch.mock.calls[0][1]?.headers);expect(headers.get('Authorization')).toBe('Bearer SYNTHETIC_A');expect(headers.get('x-upsert')).toBe('false');
    expect(mocks.invoke).toHaveBeenCalledWith('student-identification-submit',expect.objectContaining({headers:{Authorization:'Bearer SYNTHETIC_A'},body:{identificationId:recordId,sourceId,expectedRevision:1,requestId}}));
  });
  it('caller cannot turn a reservation into an arbitrary bucket upload',async()=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(submitIdentification(captureIdentificationScope(org,actor),{...prepared(),bucket:'avatars'} as any,new Blob(['synthetic'],{type:'image/jpeg'}),requestId)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();expect(mocks.invoke).not.toHaveBeenCalled();});
  it('a dispatched A upload stays pinned, and later actor switch never submits it as B',async()=>{
    let resolve!:(response:Response)=>void;const fetch=vi.fn().mockImplementation(()=>new Promise(done=>{resolve=done;}));vi.stubGlobal('fetch',fetch);
    const pending=submitIdentification(captureIdentificationScope(org,actor),prepared(),new Blob(['SYNTHETIC_JPEG'],{type:'image/jpeg'}),requestId);
    await vi.waitFor(()=>expect(fetch).toHaveBeenCalledOnce());expect(new Headers(fetch.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer SYNTHETIC_A');
    setOfflineAuthActor(id('9'));setOfflineAuthActor(actor);resolve(new Response(JSON.stringify({Key:prepared().path,Id:id('7')}),{status:200}));
    await expect(pending).rejects.toThrow();expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('actual installed functions SDK cannot replace explicit original bearer with B from a deferred token getter',async()=>{
    let release!:()=>void,started!:()=>void;const gate=new Promise<void>(done=>{release=done;});const began=new Promise<void>(done=>{started=done;});let authorization:string|null=null;
    const client=createClient('https://synthetic.invalid','SYNTHETIC_PUBLIC',{accessToken:async()=>{started();await gate;return'SYNTHETIC_B';},
      global:{fetch:async(_input,init)=>{authorization=new Headers(init?.headers).get('Authorization');return new Response(JSON.stringify({contractVersion:1}),{status:200,headers:{'Content-Type':'application/json'}});}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const result=client.functions.invoke('student-identification-submit',{body:{identificationId:recordId,sourceId,expectedRevision:1,requestId},headers:{Authorization:'Bearer SYNTHETIC_A'}});
    await began;release();expect((await result).error).toBeNull();expect(authorization).toBe('Bearer SYNTHETIC_A');
  });
  it('source without media cannot read legacy arbitrary external locators',async()=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(readIdentificationMedia(captureIdentificationScope(org,actor),record({media:null,sourceKind:'legacy_unclassified',assurance:'historical_unproven'}))).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();});
  it('captures actor from authoritative Auth bridge, not stored preview hints',()=>{localStorage.setItem('adminViewAsStudent',JSON.stringify({userId:id('9')}));expect(captureOfflineContext()?.actorId).toBe(actor);expect(captureIdentificationScope(org,actor).actorId).toBe(actor);});
  it('actual installed forced-proxy adapter preserves media original bearer and fixed backend route',async()=>{
    const originalSocket=window.WebSocket,originalOpen=XMLHttpRequest.prototype.open;
    const native=vi.spyOn(Capacitor,'isNativePlatform').mockReturnValue(true);
    const fetch=vi.fn().mockResolvedValue({ok:true,status:200,headers:new Headers({'Content-Type':'image/jpeg'}),blob:async()=>new Blob(['synthetic'],{type:'image/jpeg'})});vi.stubGlobal('fetch',fetch);
    try {
      const {installProxyFetch,getProxyStatus}=await import('@/utils/proxyFetch');
      expect(getProxyStatus()).toMatchObject({enabled:true,forced:true});
      vi.stubEnv('VITE_SUPABASE_URL',`https://${getProxyStatus().supabaseHost}`);
      installProxyFetch();
      await readIdentificationMedia(captureIdentificationScope(org,actor),record());
      expect(fetch).toHaveBeenCalledWith('https://api.xn--80aaiswd0ak.xn--p1ai/sb-functions/student-identification-media',expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer SYNTHETIC_A'}),cache:'no-store'}));
    } finally {window.WebSocket=originalSocket;XMLHttpRequest.prototype.open=originalOpen;native.mockRestore();}
  });
});
