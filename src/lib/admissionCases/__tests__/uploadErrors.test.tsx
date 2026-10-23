import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {File as NodeFile,Blob as NodeBlob} from 'node:buffer';
import {createHash,webcrypto} from 'node:crypto';
import {setOfflineAuthActor} from '@/utils/courseCache';
import {AdmissionCaseCard} from '@/components/organization/student-detail/AdmissionCaseCard';
import * as api from '../client';
import * as f from './fixtures';
const m=vi.hoisted(()=>({actor:'',rpc:vi.fn(),invoke:vi.fn(),fetch:vi.fn(),prepared:null as any}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:m.actor},loading:false})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:m.actor},access_token:'SYNTHETIC_A'}},error:null})},rpc:m.rpc,functions:{invoke:m.invoke}}}));
const body='%PDF-synthetic-admission-upload';
const digest=createHash('sha256').update(body).digest('hex');
const file=()=>new File([body],'synthetic.pdf',{type:'application/pdf'});
const source=()=>({kind:'upload' as const,requirement_id:f.id(20),supersedes_id:null,declared_size:body.length,declared_mime:'application/pdf' as const,declared_sha256:digest});
const scope=()=>api.captureAdmissionScope(f.org,f.learner,f.scope);
const capture=()=>api.captureAdmissionEvidence(scope(),f.staffCase({evidence:[]}),source(),f.id(62),f.id(63),file());
function response(status:number,statusCode=String(status),privateText='PRIVATE_PROVIDER_PATH_TOKEN') {
  return new Response(JSON.stringify({statusCode,message:privateText}),{status,headers:{'Content-Type':'application/json'}});
}
beforeEach(()=>{
  vi.clearAllMocks();m.actor=f.actor;setOfflineAuthActor(null);setOfflineAuthActor(f.actor);
  vi.stubEnv('VITE_SUPABASE_URL','https://synthetic.invalid');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','SYNTHETIC_PUBLIC');
  vi.stubGlobal('File',NodeFile);vi.stubGlobal('Blob',NodeBlob);vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('fetch',m.fetch);
  m.rpc.mockImplementation((name:string,args:any)=>({setHeader:async(name:string,bearer:string)=>{
    expect(name).toBe('Authorization');expect(bearer).toBe('Bearer SYNTHETIC_A');
    if(args.p_query?.mode==='associations')return {data:f.associations(),error:null};
    if(args.p_query?.mode==='case')return {data:f.staffRead(f.staffCase({evidence:[]})),error:null};
    m.prepared={schema_version:1,case_id:f.caseId,case_revision:3,reservation_id:f.id(60),evidence_version_id:f.id(61),expires_at:'2026-10-19T01:00:00Z',source_kind:'upload',upload_slot:{bucket:'admission-case-evidence',path:f.learner+'/'+f.org+'/'+f.caseId+'/staging/'+f.actor+'/'+f.id(60),upsert:false,max_bytes:20971520}};
    return {data:m.prepared,error:null};
  }}));
  m.invoke.mockImplementation(async(_name:string,args:any)=>({data:{...f.mutation('evidence_committed',4,args.body.request_id),state:f.staffCase({revision:4,evidence:[f.evidence({id:f.id(61),case_revision_created:4,byte_sha256:digest,byte_size:body.length})]})},error:null}));
});
afterEach(()=>{cleanup();setOfflineAuthActor(null);vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('admission upload outcome through actual installed Storage SDK',()=>{
  it.each([[400,'INVALID_INPUT'],[401,'ACCESS_DENIED'],[403,'ACCESS_DENIED'],[404,'SOURCE_UNAVAILABLE'],[413,'LIMIT_REACHED'],[415,'SOURCE_UNAVAILABLE'],[422,'INVALID_INPUT'],[429,'DEPENDENCY_UNAVAILABLE']] as const)('stops before commit on definite HTTP %i and exposes only safe code/status',async(status,code)=>{
    m.fetch.mockResolvedValueOnce(response(status));
    const error=await capture().catch(error=>error);
    expect(error).toBeInstanceOf(api.AdmissionError);expect(error).toMatchObject({code,uploadHttpStatus:status});
    expect(error.message).toBe(code);expect(JSON.stringify(error)).not.toContain('PRIVATE_PROVIDER_PATH_TOKEN');expect(m.invoke).not.toHaveBeenCalled();
    const headers=new Headers(m.fetch.mock.calls[0][1]?.headers);expect(headers.get('Authorization')).toBe('Bearer SYNTHETIC_A');expect(headers.get('x-upsert')).toBe('false');
  });
  it('retains authoritative403 status even when malformed HTML loses SDK error status',async()=>{
    m.fetch.mockResolvedValueOnce(new Response('<html>PRIVATE_PROVIDER_PATH_TOKEN</html>',{status:403,headers:{'Content-Type':'text/html'}}));
    await expect(capture()).rejects.toMatchObject({code:'ACCESS_DENIED',uploadHttpStatus:403});expect(m.invoke).not.toHaveBeenCalled();
  });
  it('rejects misleading duplicate-body409 on authoritative HTTP403',async()=>{
    m.fetch.mockResolvedValueOnce(response(403,'409'));
    await expect(capture()).rejects.toMatchObject({code:'ACCESS_DENIED',uploadHttpStatus:403});expect(m.invoke).not.toHaveBeenCalled();
  });
  it.each([408,409,503])('reconciles uncertain HTTP %i only through the exact commit route',async status=>{
    m.fetch.mockResolvedValueOnce(response(status));const result=await capture();expect(result.receipt.kind).toBe('evidence_committed');
    expect(m.invoke).toHaveBeenCalledWith('admission-case-evidence-commit',expect.objectContaining({body:{case_id:f.caseId,reservation_id:f.id(60),expected_revision:3,request_id:f.id(63)},headers:{Authorization:'Bearer SYNTHETIC_A'}}));
  });
  it('reconciles legacy400 duplicate409 without accepting its response as saved evidence',async()=>{
    m.fetch.mockResolvedValueOnce(response(400,'409'));m.invoke.mockResolvedValueOnce({data:{schema_version:1,code:'SOURCE_CHANGED',retryable:false,message:'Fixed public text'},error:null});
    await expect(capture()).rejects.toMatchObject({code:'SOURCE_CHANGED'});expect(m.invoke).toHaveBeenCalledOnce();
  });
  it('reconciles a lost network reply with the original pinned bearer and request identifiers',async()=>{
    m.fetch.mockRejectedValueOnce(new TypeError('PRIVATE_NETWORK_DETAIL'));await capture();expect(m.invoke).toHaveBeenCalledOnce();
    expect(m.invoke.mock.calls[0][1].headers.Authorization).toBe('Bearer SYNTHETIC_A');
  });
  it('keeps the existing local byte-hash gate before any reservation or upload',async()=>{
    await expect(api.captureAdmissionEvidence(scope(),f.staffCase(),{...source(),declared_sha256:'0'.repeat(64)},f.id(62),f.id(63),file())).rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(m.rpc).not.toHaveBeenCalled();expect(m.fetch).not.toHaveBeenCalled();expect(m.invoke).not.toHaveBeenCalled();
  });
});
describe('upload failure witness through the actual admission hook and card',()=>{
  async function upload() {
    render(<AdmissionCaseCard organizationId={f.org} studentUserId={f.learner}/>);
    fireEvent.change(await screen.findByLabelText('Файл: Основание обучения'),{target:{files:[file()]}});
  }
  it('shows only safe HTTP403 witness while removing inaccessible case contents',async()=>{
    m.fetch.mockResolvedValueOnce(response(403));await upload();await screen.findByText('Не удалось загрузить файл (HTTP 403).');
    expect(screen.queryByLabelText('Файл: Основание обучения')).toBeNull();expect(document.body.textContent).not.toContain('PRIVATE_PROVIDER_PATH_TOKEN');
    expect(screen.queryByText(/Результат сохранения пока не подтверждён/)).toBeNull();expect(m.invoke).not.toHaveBeenCalled();
  });
  it('keeps HTTP415 visible without a false pending save and masks it on selection change',async()=>{
    m.fetch.mockResolvedValueOnce(response(415));await upload();await screen.findByText('Не удалось загрузить файл (HTTP 415).');
    expect(screen.queryByText(/Результат сохранения пока не подтверждён/)).toBeNull();expect(document.body.textContent).not.toContain('PRIVATE_PROVIDER_PATH_TOKEN');
    fireEvent.change(screen.getByRole('combobox',{name:'Группа и зачисление'}),{target:{value:''}});
    expect(screen.queryByText('Не удалось загрузить файл (HTTP 415).')).toBeNull();expect(m.invoke).not.toHaveBeenCalled();
  });
  it('retries a throttled upload with the same reservation command and clears status only after verified commit',async()=>{
    m.fetch.mockResolvedValueOnce(response(429)).mockResolvedValueOnce(new Response(JSON.stringify({Key:'stage',Id:f.id(64)}),{headers:{'Content-Type':'application/json'}}));
    await upload();await screen.findByText('Не удалось загрузить файл (HTTP 429).');expect(m.invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Повторить сохранение'}));await waitFor(()=>expect(m.invoke).toHaveBeenCalledOnce());
    await waitFor(()=>expect(screen.queryByText('Не удалось загрузить файл (HTTP 429).')).toBeNull());
    const prepares=m.rpc.mock.calls.filter(call=>call[0]==='prepare_admission_case_evidence');expect(prepares).toHaveLength(2);expect(prepares[0][1]).toEqual(prepares[1][1]);
  });
});
