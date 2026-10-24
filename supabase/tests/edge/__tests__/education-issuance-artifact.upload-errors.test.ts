import {describe,expect,it} from 'vitest';
import {fixture,id,pdf} from '../../../functions/_shared/__tests__/education-issuance-artifact.fixture';
type Fixture=Awaited<ReturnType<typeof fixture>>;
const commits=(f:Fixture)=>f.callerRpc.mock.calls.filter(x=>x[0]==='commit_org_document_version');
const artifactAttests=(f:Fixture)=>f.serviceRpc.mock.calls.filter(x=>x[0]==='uc_attest_education_issuance_artifact');
const secret='SYNTHETIC_SECRET_TOKEN_77';
async function failed(f:Fixture,status:number,code:string){
 const response=await f.run(),text=await response.text(),body=JSON.parse(text);
 expect(response.status).toBe(status);expect(body.code).toBe(code);expect(body.retryable).toBe(code==='DEPENDENCY_UNAVAILABLE');
 expect(response.headers.get('X-Sintagma-Function-Revision')).toBe('uc-education-artifact-20261024-v4');
 for(const value of [secret,'prepared_education_output_context_unavailable','prepared_education_output_metadata_mismatch','customer-private-path'])expect(text).not.toContain(value);
 expect(f.state.staging.proof).not.toBeNull();expect(f.state.output.source).toBeNull();expect(f.state.output.artifact).toBeNull();
 expect(f.state.final_record_id).toBeNull();expect(commits(f)).toHaveLength(0);expect(artifactAttests(f)).toHaveLength(0);
 return response;
}
describe('UC019 output upload error classification after exact absent/winner observation',()=>{
 it('returns fixed access denied for the exact output-context guard failure and absent object without leaking its payload',async()=>{
  const f=await fixture();f.callerUpload.mockImplementation(async()=>({data:null,error:{statusCode:'400',message:'prepared_education_output_context_unavailable '+secret+' customer-private-path'} as any}));
  await failed(f,403,'ACCESS_DENIED');expect(f.getOutput()).toBeNull();expect(f.callerInfo).toHaveBeenCalledWith(f.state.output.file_path);
 });
 it('returns fixed source changed for the output metadata guard failure with exact absence',async()=>{
  const f=await fixture();f.callerUpload.mockImplementation(async()=>({data:null,error:{statusCode:'400',message:'Database: prepared_education_output_metadata_mismatch'} as any}));await failed(f,409,'SOURCE_CHANGED');
 });
 it('preserves standard output upload403 as access denied only after the absent-object check',async()=>{
  const f=await fixture();f.callerUpload.mockResolvedValue({data:null,error:{statusCode:'403'}});await failed(f,403,'ACCESS_DENIED');
 });
 it('keeps an uncertain thrown network error retryable without exposing raw exception data',async()=>{
  const f=await fixture();f.callerUpload.mockRejectedValue(new Error('Network '+secret+' customer-private-path'));await failed(f,503,'DEPENDENCY_UNAVAILABLE');
 });
 it('keeps an unknown returned provider failure retryable instead of treating404 as a missing source',async()=>{
  const f=await fixture();f.callerUpload.mockImplementation(async()=>({data:null,error:{statusCode:'502',message:'provider '+secret} as any}));await failed(f,503,'DEPENDENCY_UNAVAILABLE');
 });
 it('does not trust a success acknowledgement when both raw metadata and info still show no output',async()=>{
  const f=await fixture();f.callerUpload.mockResolvedValue({data:{id:id(22)},error:null});await failed(f,503,'DEPENDENCY_UNAVAILABLE');expect(f.getOutput()).toBeNull();
 });
 it('recovers the exact immutable winner after a lost failed acknowledgement before considering its guard message',async()=>{
  const f=await fixture(),upload=f.callerUpload.getMockImplementation()!;
  f.callerUpload.mockImplementation(async(...args)=>{await upload(...args);return{data:null,error:{statusCode:'400',message:'prepared_education_output_context_unavailable '+secret} as any};});
  const response=await f.run(),text=await response.text(),result=JSON.parse(text);expect(response.status).toBe(200);expect(result.status).toBe('rendered_unissued');expect(result.final_record_id).toBeNull();expect(text).not.toContain(secret);
  expect(commits(f)).toHaveLength(1);expect(artifactAttests(f)).toHaveLength(1);expect(f.callerUpload).toHaveBeenCalledTimes(1);expect(f.callerDownload).toHaveBeenCalledWith(f.state.output.file_path);expect(f.getOutput()?.bytes).toEqual(f.getStage()?.bytes);
  const replay=await f.run();expect(replay.status).toBe(200);expect(f.callerUpload).toHaveBeenCalledTimes(1);expect(f.render).toHaveBeenCalledTimes(1);expect(commits(f)).toHaveLength(1);expect(artifactAttests(f)).toHaveLength(1);
 });
 it('rejects a different PDF winner after an uncertain upload rather than letting its error bypass the byte hash',async()=>{
  const f=await fixture(),upload=f.callerUpload.getMockImplementation()!;
  f.callerUpload.mockImplementation(async(...args)=>{await upload(...args);f.getOutput()!.bytes=pdf('B');return{data:null,error:{statusCode:'502'}};});await failed(f,409,'SOURCE_CHANGED');
 });
 it('does not remap an info403 using an earlier metadata upload error',async()=>{
  const f=await fixture(),info=f.callerInfo.getMockImplementation()!;
  f.callerUpload.mockImplementation(async()=>({data:null,error:{message:'prepared_education_output_metadata_mismatch'} as any}));
  f.callerInfo.mockImplementation(async path=>path===f.state.output.file_path?{data:null,error:{statusCode:'403'}}:info(path));await failed(f,403,'ACCESS_DENIED');
 });
 it('does not remap a transient info error using an earlier context upload error',async()=>{
  const f=await fixture(),info=f.callerInfo.getMockImplementation()!;
  f.callerUpload.mockImplementation(async()=>({data:null,error:{message:'prepared_education_output_context_unavailable'} as any}));
  f.callerInfo.mockImplementation(async path=>path===f.state.output.file_path?{data:null,error:{statusCode:'500'}}:info(path));await failed(f,503,'DEPENDENCY_UNAVAILABLE');
 });
 it('does not call an object absent when trusted raw metadata exists but SDK info returns404',async()=>{
  const f=await fixture(),info=f.callerInfo.getMockImplementation()!,upload=f.callerUpload.getMockImplementation()!;
  f.callerUpload.mockImplementation(async(...args)=>{await upload(...args);return{data:null,error:{message:'prepared_education_output_context_unavailable'} as any};});
  f.callerInfo.mockImplementation(async path=>path===f.state.output.file_path?{data:null,error:{statusCode:'404'}}:info(path));await failed(f,409,'SOURCE_UNAVAILABLE');expect(f.getOutput()).not.toBeNull();
 });
});
