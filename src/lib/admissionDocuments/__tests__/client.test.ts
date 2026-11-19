import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAdmissionDocumentSettings, captureAdmissionDocumentScope, readAdmissionDocumentSettings, readAutomaticAdmissionDraft } from '../client';
import { renderAdmissionDraft } from '../render';
import { draft, enrollmentScope, exported, ids, settings } from './fixtures';
const m=vi.hoisted(()=>({current:true,sessionActor:'',data:null as any,error:null as any,header:vi.fn(),rpc:vi.fn(),afterRpc:null as null|(()=>void)}));
vi.mock('@/utils/courseCache',()=>({captureOfflineContext:()=>({actorId:'10000000-0000-4000-8000-000000000002',revision:1}),isOfflineActorCurrent:()=>m.current}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:m.sessionActor},access_token:'existing-session'}},error:null})},rpc:(...args:unknown[])=>{m.rpc(...args);return{setHeader:async(...args:unknown[])=>{m.header(...args);m.afterRpc?.();return{data:m.data,error:m.error};}};}}}));
beforeEach(()=>{m.current=true;m.sessionActor=ids.actor;m.data=settings();m.error=null;m.afterRpc=null;m.rpc.mockClear();m.header.mockClear();});
const capture=()=>captureAdmissionDocumentScope(ids.org,enrollmentScope);
describe('admission document ordinary-session client',()=>{
 it('uses the captured current session and exact enrollment/group',async()=>{
  await expect(readAdmissionDocumentSettings(capture())).resolves.toMatchObject({organization_id:ids.org});
  expect(m.rpc).toHaveBeenCalledWith('read_admission_document_settings',{p_organization_id:ids.org,p_scope:{kind:'enrollment',enrollment_id:ids.enrollment,group_id:ids.group}});
  expect(m.header).toHaveBeenCalledWith('Authorization','Bearer existing-session');
 });
 it.each(['organization','scope','draft'])('rejects a foreign %s response',async field=>{
  if(field==='organization')m.data.organization_id=ids.peer;
  if(field==='scope')m.data.scope.enrollment_id=ids.peer;
  if(field==='draft'){m.data.draft=draft();m.data.draft.enrollment_id=ids.peer;}
  await expect(readAdmissionDocumentSettings(capture())).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
 });
 it('refuses changed actor before sending an RPC',async()=>{
  m.sessionActor=ids.peer;await expect(readAdmissionDocumentSettings(capture())).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(m.rpc).not.toHaveBeenCalled();
 });
 it('drops a result after the captured actor or view changes',async()=>{
  m.afterRpc=()=>{m.current=false;};await expect(readAdmissionDocumentSettings(capture())).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('keeps the same request identity and expected revision on retry',async()=>{
  const command={action:'reset' as const,reason:'inherit_reset' as const};
  m.error={message:'network unavailable'};await expect(applyAdmissionDocumentSettings(capture(),0,ids.peer,command)).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
  m.error=null;m.data={schema_version:1,request_id:ids.peer,replayed:true,processed:0,next_after_enrollment_id:null,state:settings()};
  await applyAdmissionDocumentSettings(capture(),0,ids.peer,command);
  expect(m.rpc.mock.calls[0]).toEqual(m.rpc.mock.calls[1]);
 });
 it('rejects malformed dates before sending a mutation',async()=>{
  await expect(applyAdmissionDocumentSettings(capture(),0,ids.peer,{action:'save',reason:'manual_settings',enabled:null,document_date:'2026-02-30',effective_admission_date:null,timezone:null})).rejects.toMatchObject({code:'INVALID_INPUT'});expect(m.rpc).not.toHaveBeenCalled();
 });
 it('rejects mismatched mutation receipt and foreign draft export',async()=>{
  m.data={schema_version:1,request_id:ids.org,replayed:false,processed:0,next_after_enrollment_id:null,state:settings()};
  await expect(applyAdmissionDocumentSettings(capture(),0,ids.peer,{action:'reset',reason:'inherit_reset'})).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
  m.data=exported();m.data.enrollment_id=ids.peer;await expect(readAutomaticAdmissionDraft(capture(),draft())).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
 });
 it('does not open another selected group draft',async()=>{
  const d=draft();d.group_id=ids.peer;await expect(readAutomaticAdmissionDraft(capture(),d)).rejects.toMatchObject({code:'INVALID_INPUT'});expect(m.rpc).not.toHaveBeenCalled();
 });
 it('logs only static validation stages/codes/schema paths without response PII, identifiers or authentication',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const privateValue='PRIVATE-STUDENT-Иванов-private@example.test-Bearer-secret-session';
  try{
   m.data={schema_version:1,request_id:privateValue,replayed:false,processed:0,next_after_enrollment_id:null,state:{...settings(),groups:[{id:privateValue,name:privateValue}],[privateValue]:privateValue},authorization:privateValue};
   await expect(applyAdmissionDocumentSettings(capture(),0,ids.peer,{action:'reset',reason:'inherit_reset'})).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
   m.error={code:'PRIVATE_RAW_CODE',message:privateValue,details:{authorization:privateValue,student_id:ids.learner}};
   await expect(readAdmissionDocumentSettings(capture())).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
   const serialized=JSON.stringify(warn.mock.calls);
   expect(serialized).toContain('mutation.response');expect(serialized).toContain('rpc.error');expect(serialized).toContain('invalid_string');
   for(const secret of [privateValue,'PRIVATE_RAW_CODE',ids.actor,ids.learner,ids.enrollment,ids.peer,'existing-session'])expect(serialized).not.toContain(secret);
   for(const call of warn.mock.calls){expect(call[0]).toBe('[AdmissionDocuments]');expect(Object.keys(call[1] as object).every(key=>['stage','code','issues'].includes(key))).toBe(true);}
  }finally{warn.mockRestore();}
 });
 it('escapes source text and retains explicit draft, date, signature and missing-fact notices',()=>{
  const data=exported();data.student_name='<img src=x onerror=alert(1)>';const html=renderAdmissionDraft(data);
  expect(html).toContain('&lt;img');expect(html).not.toContain('<img');expect(html).toContain('НЕ ПОДПИСАН, НОМЕР НЕ ПРИСВОЕН');expect(html).toContain('19.11.2026');expect(html).toContain('18.11.2026');expect(html).toContain('Подтвердите программу обучения');expect(html).not.toContain('Другой ученик');
 });
});
