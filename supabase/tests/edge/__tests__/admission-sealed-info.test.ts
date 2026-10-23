// @vitest-environment node
import{describe,it,expect}from'vitest';
import{admissionSealedInfo,ADMISSION_EVIDENCE_REVISION}from'../../../functions/_shared/admission-case-access';
import{fixture,sealedId,id,pdf}from'../../../functions/_shared/__tests__/admission-case-evidence.fixture';
const dbTime='2026-10-19T03:00:00.123456Z';
async function provider(){
 const f=await fixture();
 const data={id:sealedId,name:f.sealedPath,bucketId:'admission-case-evidence',size:pdf.length,contentType:'application/pdf',metadata:null,lastModified:dbTime};
 f.info.mockResolvedValue({data,error:null}as any);
 return{...f,data,read:(signal=new AbortController().signal)=>admissionSealedInfo(f.service,f.sealedPath,pdf.length,'application/pdf',signal)};
}
async function microsecondContext(f:Awaited<ReturnType<typeof provider>>){
 const original=f.rpc.getMockImplementation()!;
 f.rpc.mockImplementation(async(name,args)=>{
  const result=await original(name,args);
  if(name==='uc_admission_evidence_context'){
   const data=structuredClone(result.data)as any;
   if(data.sealed.object_id!==null)data.sealed.updated_at=dbTime;
   if(data.mode==='consumed')data.source.updated_at=dbTime;
   return{data,error:result.error};
  }
  return result;
 });
}
describe('AD02 official Storage InfoRenderer metadata',()=>{
 it('accepts SDK lastModified as database updated_at and preserves all six microseconds',async()=>{
  const f=await provider();expect(await f.read()).toEqual({object_id:sealedId,updated_at:dbTime});expect(f.callerFrom).not.toHaveBeenCalled();
 });
 it('accepts the existing updatedAt response unchanged',async()=>{
  const f=await fixture();expect(await admissionSealedInfo(f.service,f.sealedPath,pdf.length,'application/pdf',new AbortController().signal)).toEqual({object_id:sealedId,updated_at:'2026-10-19T03:00:00.000000Z'});
 });
 it('normalizes UTC aliases only when all supplied database times agree',async()=>{
  const f=await provider();f.info.mockResolvedValue({data:{...f.data,updatedAt:dbTime,last_modified:dbTime.replace('Z','+00:00'),updated_at:dbTime},error:null}as any);expect((await f.read()).updated_at).toBe(dbTime);
 });
 it('supports the raw snake-case database alias without truncation',async()=>{
  const f=await provider();const{lastModified,...data}=f.data;f.info.mockResolvedValue({data:{...data,last_modified:lastModified},error:null}as any);expect((await f.read()).updated_at).toBe(dbTime);
 });
 it('rejects conflicting database aliases',async()=>{
  const f=await provider();f.info.mockResolvedValue({data:{...f.data,updatedAt:'2026-10-19T03:00:00.123455Z'},error:null}as any);await expect(f.read()).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE'});
 });
 it('does not obtain a timestamp from untrusted user metadata',async()=>{
  const f=await provider();const{lastModified,...data}=f.data;f.info.mockResolvedValue({data:{...data,metadata:{lastModified}},error:null}as any);await expect(f.read()).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE'});
 });
 it('rejects absent database time aliases',async()=>{
  const f=await provider();const{lastModified:_,...data}=f.data;f.info.mockResolvedValue({data,error:null}as any);await expect(f.read()).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE'});
 });
 it('rejects more than six digits instead of rounding a database timestamp',async()=>{
  const f=await provider();f.info.mockResolvedValue({data:{...f.data,lastModified:'2026-10-19T03:00:00.1234567Z'},error:null}as any);await expect(f.read()).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE'});
 });
 it('rejects an impossible timestamp calendar date',async()=>{
  const f=await provider();f.info.mockResolvedValue({data:{...f.data,lastModified:'2026-02-30T03:00:00.123456Z'},error:null}as any);await expect(f.read()).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE'});
 });
 it('keeps the exact service bucket and full path checks',async()=>{
  for(const patch of[{bucketId:'company-documents'},{name:'other/'+id(99)}]){const f=await provider();f.info.mockResolvedValue({data:{...f.data,...patch},error:null}as any);await expect(f.read()).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE'});}
 });
 it('keeps the exact object UUID check',async()=>{
  const f=await provider();f.info.mockResolvedValue({data:{...f.data,id:'not-an-id'},error:null}as any);await expect(f.read()).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE'});
 });
 it('keeps the exact actual byte-size check',async()=>{
  const f=await provider();f.info.mockResolvedValue({data:{...f.data,size:pdf.length+1},error:null}as any);await expect(f.read()).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE'});
 });
 it('keeps the exact MIME check',async()=>{
  const f=await provider();f.info.mockResolvedValue({data:{...f.data,contentType:'image/png'},error:null}as any);await expect(f.read()).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE'});
 });
 it('keeps the original contradictory info size protection',async()=>{
  const f=await provider();f.info.mockResolvedValue({data:{...f.data,metadata:{size:pdf.length+1,mimetype:'application/pdf'}},error:null}as any);await expect(f.read()).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE'});
 });
 it('keeps safe errors for malformed or failed info responses',async()=>{
  for(const response of[{data:null,error:{message:'SYNTHETIC_PROVIDER_PRIVATE'}},{data:[],error:null}]){const f=await provider();f.info.mockResolvedValue(response as any);await expect(f.read()).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE',message:'SOURCE_UNAVAILABLE'});}
 });
 it('checks cancellation before requesting privileged metadata',async()=>{
  const f=await provider(),controller=new AbortController();controller.abort();await expect(f.read(controller.signal)).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});expect(f.info).not.toHaveBeenCalled();
 });
 it('checks cancellation after receiving privileged metadata',async()=>{
  const f=await provider(),controller=new AbortController();f.info.mockImplementation(async()=>{controller.abort();return{data:f.data,error:null}as any;});await expect(f.read(controller.signal)).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});expect(f.attest).not.toHaveBeenCalled();
 });
 it('keeps original caller CAS actual-byte readback and exact SQL attestation identity',async()=>{
  const f=await provider();await microsecondContext(f);const response=await f.run();expect(response.status).toBe(200);expect(f.serviceDownload).toHaveBeenCalledExactlyOnceWith(f.sealedPath);
  expect(f.attest).toHaveBeenCalledExactlyOnceWith('uc_attest_admission_case_evidence',expect.objectContaining({p_sealed_object_id:sealedId,p_sealed_updated_at:dbTime,p_byte_sha256:f.hash,p_byte_size:pdf.length}));
  expect(f.rpc.mock.calls.some(([name])=>name==='uc_finalize_admission_case_evidence')).toBe(true);expect(f.upload.mock.calls[0][2]).toMatchObject({upsert:false});
  expect(response.headers.get('X-Sintagma-Function-Revision')).toBe(ADMISSION_EVIDENCE_REVISION);
 });
 it('rejects identity changes after actual sealed readback before attestation',async()=>{
  const f=await provider();f.info.mockResolvedValueOnce({data:f.data,error:null}as any).mockResolvedValueOnce({data:{...f.data,lastModified:'2026-10-19T03:00:00.123457Z'},error:null}as any);
  const response=await f.run();expect((await response.json()).code).toBe('SOURCE_CHANGED');expect(f.attest).not.toHaveBeenCalled();expect(f.rpc.mock.calls.some(([name])=>name==='uc_finalize_admission_case_evidence')).toBe(false);
 });
 it('exposes a unique native revision for deployed OPTIONS verification',async()=>{
  expect(ADMISSION_EVIDENCE_REVISION).toBe('uc-admission-case-evidence-20261023-v2');
  const f=await fixture();const{admissionEvidenceCommitRequest}=await import('../../../functions/_shared/admission-case-evidence-commit');
  const response=await admissionEvidenceCommitRequest(new Request('https://synthetic.invalid',{method:'OPTIONS'}),f.deps);
  expect(response.status).toBe(204);expect(response.headers.get('X-Sintagma-Function-Revision')).toBe(ADMISSION_EVIDENCE_REVISION);expect(f.createCaller).not.toHaveBeenCalled();
 });
});
