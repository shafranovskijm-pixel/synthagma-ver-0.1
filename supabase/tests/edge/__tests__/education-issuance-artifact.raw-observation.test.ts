import {describe,expect,it,vi} from 'vitest';
import {fixture,id,input,pdf} from '../../../functions/_shared/__tests__/education-issuance-artifact.fixture';
const OBS='uc_observe_education_artifact_object';
const raw={template:'2026-10-23T00:00:00.546892Z',staging:'2026-10-23T00:00:00.123456Z',output:'2026-10-23T00:00:00.654321Z'};
const actionCalls=(f:Awaited<ReturnType<typeof exactFixture>>)=>f.serviceRpc.mock.calls.filter(c=>c[0].startsWith('uc_attest_'));
async function exactFixture(){
 const f=await fixture(),times={...raw};f.state.template.storage.updated_at=times.template;
 const observations=vi.fn((_value:any)=>{}),sdkAliases=vi.fn((_value:any,_kind:string)=>{});
 const oldCallerInfo=f.callerInfo.getMockImplementation()!,oldServiceInfo=f.serviceInfo.getMockImplementation()!;
 f.callerInfo.mockImplementation(async path=>{const r=await oldCallerInfo(path);if(r.data){const kind=path===f.state.template.storage.path?'template':'output';r.data.lastModified=new Date(times[kind]).toISOString();sdkAliases(r.data,kind);}return r;});
 f.serviceInfo.mockImplementation(async path=>{const r=await oldServiceInfo(path);if(r.data){r.data.lastModified=new Date(times.staging).toISOString();sdkAliases(r.data,'staging');}return r;});
 const oldCallerRpc=f.callerRpc.getMockImplementation()!;
 f.callerRpc.mockImplementation(async(name,args)=>{const r=await oldCallerRpc(name,args);if(name==='commit_org_document_version'&&f.state.output.object)f.state.output.object.updated_at=times.output;return r;});
 const oldServiceRpc=f.serviceRpc.getMockImplementation()!;
 f.serviceRpc.mockImplementation(async(name,args)=>{
  const r=await oldServiceRpc(name,args);
  if(name===OBS&&r.data){const value=r.data as any;if(value.object)value.object.updated_at=times[value.kind as 'staging'|'output'];observations(value);}
  else if(name==='uc_attest_education_issuance_staging'||name==='uc_attest_education_issuance_artifact'){
   (r.data as any).updated_at=name.endsWith('_staging')?times.staging:times.output;
  }
  return r;
 });
 return {...f,times,observations,sdkAliases};
}
describe('UC019 exact raw PG observations with lossy SDK transport (synthetic only)',()=>{
 it('keeps original6digits in both SQL attest proofs and returns the same originalcaller saved PDF unissued',async()=>{
  const f=await exactFixture(),response=await f.run();expect(response.status).toBe(200);const result=await response.json();
  expect(result.status).toBe('rendered_unissued');expect(result.final_record_id).toBeNull();
  const stage=actionCalls(f).find(c=>c[0].endsWith('_staging'))![1].p_proof as any;
  const output=actionCalls(f).find(c=>c[0].endsWith('_artifact'))![1].p_proof as any;
  expect(stage.template_updated_at).toBe(raw.template);expect(stage.staged_updated_at).toBe(raw.staging);
  expect(output.staged_updated_at).toBe(raw.staging);expect(output.output_updated_at).toBe(raw.output);
  expect(f.state.staging.proof!.updated_at).toBe(raw.staging);expect(f.state.output.object!.updated_at).toBe(raw.output);
  expect(f.getOutput()!.bytes).toEqual(f.getStage()!.bytes);expect(f.render).toHaveBeenCalledTimes(1);
  expect(new Set(f.callerRpc.mock.calls.map(c=>c[0]))).toEqual(new Set(['uc_education_artifact_context','commit_org_document_version']));
 });
 it('checks each mixed SDK alias at its actual observed precision without promoting padded zeros',async()=>{
  const f=await exactFixture();f.sdkAliases.mockImplementation((v,kind)=>{v.updatedAt=f.times[kind as keyof typeof raw];});
  expect((await f.run()).status).toBe(200);expect(actionCalls(f)).toHaveLength(2);
 });
 it('rejects a claimed6digit SDK alias that differs inside the same millisecond before rendering',async()=>{
  const f=await exactFixture();f.sdkAliases.mockImplementation((v,kind)=>{if(kind==='template')v.updatedAt='2026-10-23T00:00:00.546000Z';});
  expect((await f.run()).status).not.toBe(200);expect(f.render).not.toHaveBeenCalled();expect(actionCalls(f)).toHaveLength(0);
 });
 it('rejects template raw microsecond change across originalcaller byte download',async()=>{
  const f=await exactFixture(),download=f.callerDownload.getMockImplementation()!;
  f.callerDownload.mockImplementationOnce(async path=>{const result=await download(path);f.state.template.storage.updated_at='2026-10-23T00:00:00.546893Z';return result;});
  expect((await f.run()).status).not.toBe(200);expect(f.render).not.toHaveBeenCalled();expect(actionCalls(f)).toHaveLength(0);
 });
 it('rejects a stage update within one SDK millisecond between raw before/after snapshots',async()=>{
  const f=await exactFixture();f.sdkAliases.mockImplementation((_v,kind)=>{if(kind==='staging')f.times.staging='2026-10-23T00:00:00.123457Z';});
  expect((await f.run()).status).not.toBe(200);expect(f.callerUpload).not.toHaveBeenCalled();expect(actionCalls(f)).toHaveLength(0);
 });
 it('rejects raw full storage metadata changing despite unchanged id/time/SDK size and MIME',async()=>{
  const f=await exactFixture();let reads=0;
  f.observations.mockImplementation(v=>{if(v.kind==='staging'&&v.object&&++reads===2)v.object.storage_metadata.eTag='SYNTHETIC_OTHER_ETAG';});
  expect((await f.run()).status).not.toBe(200);expect(f.callerUpload).not.toHaveBeenCalled();expect(actionCalls(f)).toHaveLength(0);
 });
 it('rejects SDK provenance disagreeing with raw SQL metadata instead of inventing trusted provenance',async()=>{
  const f=await exactFixture();f.sdkAliases.mockImplementation((v,kind)=>{if(kind==='staging')v.metadata.renderInputHash='f'.repeat(64);});
  expect((await f.run()).status).not.toBe(200);expect(f.callerUpload).not.toHaveBeenCalled();expect(actionCalls(f)).toHaveLength(0);
 });
 it.each(['actor','organization','request','path','kind']as const)('rejects raw observer %s tuple substitution',async key=>{
  const f=await exactFixture();f.observations.mockImplementation(v=>{
   if(key==='actor')v.actor_id=id(99);if(key==='organization')v.organization_id=id(99);if(key==='request')v.request_id=id(99);
   if(key==='path'&&v.object)v.object.path=v.object.path.replace('/'+input.item_id+'/', '/'+id(99)+'/');
   if(key==='kind')v.kind='output';
  });
  expect((await f.run()).status).not.toBe(200);expect(f.callerUpload).not.toHaveBeenCalled();expect(actionCalls(f)).toHaveLength(0);
 });
 it('rejects output raw microsecond race before UC006 commit and output attestation',async()=>{
  const f=await exactFixture();f.sdkAliases.mockImplementation((_v,kind)=>{if(kind==='output')f.times.output='2026-10-23T00:00:00.654322Z';});
  expect((await f.run()).status).not.toBe(200);expect(f.callerRpc.mock.calls.filter(c=>c[0]==='commit_org_document_version')).toHaveLength(0);
  expect(actionCalls(f).filter(c=>c[0].endsWith('_artifact'))).toHaveLength(0);
 });
 it('does not attest correct raw metadata when downloaded stage bytes have another hash',async()=>{
  const f=await exactFixture();f.serviceDownload.mockResolvedValueOnce({data:new Blob([Uint8Array.from(pdf('B')).buffer],{type:'application/pdf'}),error:null});
  expect((await f.run()).status).not.toBe(200);expect(f.callerUpload).not.toHaveBeenCalled();expect(actionCalls(f)).toHaveLength(0);
 });
 it('recovers a lost attestation response with raw6 proof without rerender, duplicate upload or duplicate commit',async()=>{
  const f=await exactFixture(),rpc=f.serviceRpc.getMockImplementation()!;let lost=false;
  f.serviceRpc.mockImplementation(async(name,args)=>{const result=await rpc(name,args);if(name==='uc_attest_education_issuance_staging'&&!lost){lost=true;return{data:null,error:{code:'NETWORK'}};}return result;});
  expect((await f.run()).status).toBe(503);expect(f.callerUpload).not.toHaveBeenCalled();expect((await f.run()).status).toBe(200);
  expect(f.render).toHaveBeenCalledTimes(1);expect(f.serviceUpload).toHaveBeenCalledTimes(1);expect(f.callerUpload).toHaveBeenCalledTimes(1);
  expect(actionCalls(f).filter(c=>c[0].endsWith('_staging'))).toHaveLength(1);
  expect(f.callerRpc.mock.calls.filter(c=>c[0]==='commit_org_document_version')).toHaveLength(1);
 });
 it('replays a consumed exact winner without allocating, approving or changing immutable bytes',async()=>{
  const f=await exactFixture();expect((await f.run()).status).toBe(200);f.state.mode='consumed';f.state.final_record_id=id(90);
  const result=await(await f.run()).json();expect(result.status).toBe('consumed');expect(result.final_record_id).toBe(id(90));
  expect(f.render).toHaveBeenCalledTimes(1);expect(f.serviceUpload).toHaveBeenCalledTimes(1);expect(f.callerUpload).toHaveBeenCalledTimes(1);expect(actionCalls(f)).toHaveLength(2);
 });
});
