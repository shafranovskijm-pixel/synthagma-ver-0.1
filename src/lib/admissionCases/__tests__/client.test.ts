import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {FunctionsHttpError} from '@supabase/functions-js';
import {Blob as NodeBlob,File as NodeFile} from 'node:buffer';
import {createHash,webcrypto} from 'node:crypto';
import {Capacitor} from '@capacitor/core';
import {setOfflineAuthActor} from '@/utils/courseCache';
import * as api from '../client.ts';
import * as f from './fixtures.ts';
const mocks=vi.hoisted(()=>({session:vi.fn(),rpc:vi.fn(),invoke:vi.fn(),response:null as any,headers:[] as string[]}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:mocks.session},rpc:mocks.rpc,functions:{invoke:mocks.invoke}}}));
const scope=()=>api.captureAdmissionScope(f.org,f.learner,f.scope);
const bytes='%PDF-synthetic'; const digest=createHash('sha256').update(bytes).digest('hex');
beforeEach(()=>{
  vi.clearAllMocks();setOfflineAuthActor(null);setOfflineAuthActor(f.actor);mocks.headers=[];
  mocks.session.mockResolvedValue({data:{session:{user:{id:f.actor},access_token:'SYNTHETIC_A'}},error:null});
  mocks.rpc.mockImplementation(()=>({setHeader:(_name:string,bearer:string)=>{mocks.headers.push(bearer);return Promise.resolve({data:mocks.response,error:null});}}));
  vi.stubEnv('VITE_SUPABASE_URL','https://synthetic.invalid');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','SYNTHETIC_PUBLIC');
  vi.stubGlobal('Blob',NodeBlob);vi.stubGlobal('File',NodeFile);vi.stubGlobal('crypto',webcrypto);
});
afterEach(()=>{setOfflineAuthActor(null);vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('actual admission client: exact scope and strict reads',()=>{
  it('reads the exact tuple using captured original bearer and current immutable programme ref',async()=>{mocks.response=f.staffRead(null);expect((await api.readAdmissionCase(scope())).state).toBeNull();expect(mocks.headers).toEqual(['Bearer SYNTHETIC_A']);expect(mocks.rpc).toHaveBeenCalledWith('read_student_admission_case',expect.objectContaining({p_query:{mode:'case',group_id:f.group,enrollment_id:f.enrollment}}));});
  it.each([
    {...f.staffRead(),scope:{...f.scope,group_id:f.id(99)}},
    {...f.staffRead(),state:f.staffCase({scope:{...f.scope,organization_id:f.id(99)}})},
    {...f.staffRead(),file_url:'https://foreign.invalid/private'},null,
  ])('rejects foreign/unknown/null result instead of empty success %j',async response=>{mocks.response=response;await expect(api.readAdmissionCase(scope())).rejects.toThrow();});
  it('rejects duplicated group cursor rows and unknown associations even if course/enrollment match',async()=>{const list=f.associations();mocks.response={...list,items:[...list.items,...list.items]};await expect(api.readAdmissionAssociations(scope())).rejects.toThrow();});
  it('does not read caller ownership from stored admin preview hints',()=>{localStorage.setItem('adminViewAsStudent',JSON.stringify({userId:f.id(99)}));expect(scope().actorId).toBe(f.actor);localStorage.removeItem('adminViewAsStudent');});
  it('drops actual actor ABA before RPC even when actor id returns to A',async()=>{let finish!:(value:any)=>void;mocks.session.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));const result=api.readAdmissionCase(scope());setOfflineAuthActor(f.id(99));setOfflineAuthActor(f.actor);finish({data:{session:{user:{id:f.actor},access_token:'SYNTHETIC_A'}},error:null});await expect(result).rejects.toThrow();expect(mocks.rpc).not.toHaveBeenCalled();});
  it('drops a dispatched result after current access epoch changes',async()=>{let finish!:(value:any)=>void;mocks.rpc.mockReturnValueOnce({setHeader:()=>new Promise(resolve=>{finish=resolve;})});const pending=api.readAdmissionCase(scope());await vi.waitFor(()=>expect(finish).toBeDefined());setOfflineAuthActor(f.id(99));setOfflineAuthActor(f.actor);finish({data:f.staffRead(),error:null});await expect(pending).rejects.toThrow();});
});
describe('action receipts and error transport',()=>{
  it('accepts replay receipt with later freshly authorized current state, sends exact original CAS',async()=>{mocks.response={...f.mutation(),replayed:true,state:f.staffCase({revision:9})};const result=await api.applyAdmissionAction(scope(),f.action(),f.requestId);expect(result.state.revision).toBe(9);expect(mocks.rpc).toHaveBeenCalledWith('apply_student_admission_case_action',expect.objectContaining({p_request_id:f.requestId,p_command:f.action()}));});
  it.each(['request_id','case_id','kind','revision'])('rejects wrong receipt %s',async field=>{const response=f.mutation();mocks.response={...response,receipt:{...response.receipt,[field]:field==='revision'?77:field==='kind'?'record_decision':f.id(99)}};await expect(api.applyAdmissionAction(scope(),f.action(),f.requestId)).rejects.toThrow();});
  it('normalizes actual FunctionsHttpError403 as authoritative denial, even without a JSON body',async()=>{const error=new FunctionsHttpError(new Response('<html>forbidden</html>',{status:403}));expect((await api.admissionFunctionError(error,scope())).code).toBe('ACCESS_DENIED');});
  it('parses bounded strict error JSON, never forwards provider/private error text',async()=>{const body={schema_version:1,code:'SOURCE_CHANGED',retryable:false,message:'Fixed public text'};expect((await api.admissionFunctionError(new FunctionsHttpError(new Response(JSON.stringify(body),{status:409})),scope())).code).toBe('SOURCE_CHANGED');const oversized=new Response('private'.repeat(1000),{status:503});expect((await api.admissionFunctionError(new FunctionsHttpError(oversized),scope())).code).toBe('DEPENDENCY_UNAVAILABLE');});
});
describe('raw private bytes, history and installed SDK pinning',()=>{
  const fileEvidence=()=>f.evidence({byte_sha256:digest,byte_size:bytes.length});
  const fileResponse=()=>new Response(bytes,{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store'}});
  it('malformed proxy403 on the actual file route remains ACCESS_DENIED, never source-unavailable or success',async()=>{const evidence=fileEvidence();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>private provider response</html>',{status:403})));await expect(api.readAdmissionEvidenceFile(scope(),f.staffCase({evidence:[evidence]}),evidence)).rejects.toMatchObject({code:'ACCESS_DENIED'});});
  it('verifies actual bytes and opens exact historical metadata outside the current array',async()=>{const evidence=fileEvidence(),history=f.event({payload:{...f.event().payload,evidence:[evidence]}});const fetch=vi.fn().mockResolvedValue(fileResponse());vi.stubGlobal('fetch',fetch);const blob=await api.readAdmissionEvidenceFile(scope(),f.staffCase({evidence:[]}),evidence,history);expect(blob.size).toBe(bytes.length);expect(fetch).toHaveBeenCalledWith('https://synthetic.invalid/functions/v1/admission-case-evidence-file',expect.objectContaining({cache:'no-store',credentials:'omit',headers:expect.objectContaining({Authorization:'Bearer SYNTHETIC_A'}),body:JSON.stringify({case_id:f.caseId,evidence_version_id:evidence.id})}));});
  it.each(['wrong-case','future-revision','no-grant'])('rejects %s historical record before fetching',async kind=>{const evidence=fileEvidence();const history=f.event({case_id:kind==='wrong-case'?f.id(99):f.caseId,case_revision:kind==='future-revision'?55:3,payload:{...f.event().payload,evidence:[{...evidence,can_read_bytes:kind!=='no-grant'}]}});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(api.readAdmissionEvidenceFile(scope(),f.staffCase({evidence:[]}),history.payload.evidence[0],history)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();});
  it('rejects actual wrong byte hash, and drops late bytes after actor ABA',async()=>{const evidence=fileEvidence();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('wrong',{headers:{'Content-Type':'application/pdf'}})));await expect(api.readAdmissionEvidenceFile(scope(),f.staffCase({evidence:[evidence]}),evidence)).rejects.toThrow();let finish!:(value:Response)=>void;vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>new Promise(resolve=>{finish=resolve;})));const pending=api.readAdmissionEvidenceFile(scope(),f.staffCase({evidence:[evidence]}),evidence);await vi.waitFor(()=>expect(finish).toBeDefined());setOfflineAuthActor(f.id(99));setOfflineAuthActor(f.actor);finish(fileResponse());await expect(pending).rejects.toThrow();});
  it('actual installed RPC SDK lazy B-token cannot replace explicit A bearer',async()=>{let header='';const client=createClient('https://synthetic.invalid','SYNTHETIC_PUBLIC',{accessToken:async()=> 'LAZY_B',global:{fetch:async(_url,init)=>{header=new Headers(init?.headers).get('Authorization') || '';return new Response(JSON.stringify(f.staffRead()),{headers:{'Content-Type':'application/json'}});}}});mocks.rpc.mockImplementation((name:any,args:any)=>client.rpc(name,args));await api.readAdmissionCase(scope());expect(header).toBe('Bearer SYNTHETIC_A');});
  it('actual installed Storage and Functions SDK upload/commit keep original A through lazy B getters',async()=>{
    const prepared={schema_version:1,case_id:f.caseId,case_revision:3,reservation_id:f.id(60),evidence_version_id:f.id(61),expires_at:'2026-10-19T01:00:00Z',source_kind:'upload',upload_slot:{bucket:'admission-case-evidence',path:`${f.learner}/${f.org}/${f.caseId}/staging/${f.actor}/${f.id(60)}`,upsert:false,max_bytes:20971520}};
    const state=f.staffCase({revision:4,evidence:[f.evidence({id:f.id(61),case_revision_created:4,byte_sha256:digest,byte_size:bytes.length})]});
    const response={...f.mutation('evidence_committed',4,f.id(63)),state}; const seen:{url:string;bearer:string}[]=[];
    const fetch=vi.fn(async(input:any,init?:RequestInit)=>{const url=String(input);seen.push({url,bearer:new Headers(init?.headers).get('Authorization') || ''});if(url.includes('/storage/')) return new Response(JSON.stringify({Key:'stage',Id:f.id(64)}),{headers:{'Content-Type':'application/json'}});return new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}});});vi.stubGlobal('fetch',fetch);
    const client=createClient('https://synthetic.invalid','SYNTHETIC_PUBLIC',{accessToken:async()=> 'LAZY_B',global:{fetch}});
    mocks.response=prepared;mocks.invoke.mockImplementation((name:any,args:any)=>client.functions.invoke(name,args));
    const file=new File([bytes],'synthetic.pdf',{type:'application/pdf'});
    await api.captureAdmissionEvidence(scope(),f.staffCase(),{kind:'upload',requirement_id:f.id(20),supersedes_id:null,declared_size:bytes.length,declared_mime:'application/pdf',declared_sha256:digest},f.id(62),f.id(63),file);
    expect(seen.some(item=>item.url.includes('/storage/'))).toBe(true);expect(seen.some(item=>item.url.includes('admission-case-evidence-commit'))).toBe(true);expect(seen.every(item=>item.bearer==='Bearer SYNTHETIC_A')).toBe(true);expect(mocks.headers).toEqual(['Bearer SYNTHETIC_A']);
  });
  it('forced proxy preserves original bearer and fixed file route',async()=>{const socket=window.WebSocket,open=XMLHttpRequest.prototype.open;vi.spyOn(Capacitor,'isNativePlatform').mockReturnValue(true);const fetch=vi.fn().mockResolvedValue(fileResponse());vi.stubGlobal('fetch',fetch);try {const {installProxyFetch,getProxyStatus}=await import('@/utils/proxyFetch');vi.stubEnv('VITE_SUPABASE_URL',`https://${getProxyStatus().supabaseHost}`);installProxyFetch();const evidence=fileEvidence();await api.readAdmissionEvidenceFile(scope(),f.staffCase({evidence:[evidence]}),evidence);expect(fetch).toHaveBeenCalledWith('https://api.xn--80aaiswd0ak.xn--p1ai/sb-functions/admission-case-evidence-file',expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer SYNTHETIC_A'}),cache:'no-store'}));}finally{window.WebSocket=socket;XMLHttpRequest.prototype.open=open;}});
});
