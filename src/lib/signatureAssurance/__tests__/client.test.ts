import {beforeEach,describe,expect,it,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {actor,actorFact,caps,id,legacy,manifest,org,policy,signature,stamp,twoPartyManifest,zero} from './fixtures';
import type * as t from '../types';
const state=vi.hoisted(()=>({actor:'',revision:1,sessionActor:'',response:null as unknown,error:null as unknown,status:200,wait:null as Promise<unknown>|null,calls:[]as {name:string;args:unknown;header:string;token:string}[]}));
vi.mock('@/utils/courseCache',()=>({captureOfflineContext:()=>state.actor?{actorId:state.actor,revision:state.revision}:null,isOfflineActorCurrent:(actorId:string,revision:number)=>actorId===state.actor&&revision===state.revision}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:vi.fn(async()=>({data:{session:{user:{id:state.sessionActor},access_token:'SYNTHETIC_TRANSPORT_ONLY'}},error:null}))},rpc:vi.fn((name:string,args:unknown)=>({setHeader:async(header:string,token:string)=>{
 state.calls.push({name,args:structuredClone(args),header,token});return state.wait?await state.wait:{data:state.response,error:state.error,status:state.status};
}}))}}));
import {captureSignatureAssuranceScope,normalizeSignatureEvidenceError,prepareSignatureAssuranceMutation,readSignatureAssurance} from '../client';
import {evidenceSha256} from '../validation';
const query:t.ReadQuery={kind:'policy_list',after_id:null,limit:2};
const success=(result:t.ReadResult):t.ReadSuccess=>({version:1,ok:true,scope:{actor_user_id:actor,organization_id:org},capabilities:structuredClone(caps),result});
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);state.actor=actor;state.revision=1;state.sessionActor=actor;state.response=success({kind:'policy_list',policies:[],next_after_id:null});state.error=null;state.status=200;state.wait=null;state.calls=[];});
describe('signature assurance tenant/account/literal result fences',()=>{
 it('uses the captured exact actor bearer and strict canonical query',async()=>{
  await readSignatureAssurance(captureSignatureAssuranceScope(org),query);
  expect(state.calls).toEqual([{name:'read_signature_assurance',args:{p_organization_id:org,p_query:query},header:'Authorization',token:'Bearer SYNTHETIC_TRANSPORT_ONLY'}]);
 });
 it('refuses an actor ABA before React render or a session belonging to a different actor before any RPC',async()=>{
  const scope=captureSignatureAssuranceScope(org);state.actor=id(99);state.revision++;state.actor=actor;state.revision++;
  await expect(readSignatureAssurance(scope,query)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(state.calls).toHaveLength(0);
  state.sessionActor=id(98);await expect(readSignatureAssurance(captureSignatureAssuranceScope(org),query)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(state.calls).toHaveLength(0);
 });
 it('discards a delayed valid response after an observed account/access revision change',async()=>{
  let release!:(value:unknown)=>void;state.wait=new Promise(resolve=>{release=resolve;});
  const pending=readSignatureAssurance(captureSignatureAssuranceScope(org),query);await vi.waitFor(()=>expect(state.calls).toHaveLength(1));state.revision++;
  release({data:state.response,error:null,status:200});await expect(pending).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('refuses unknown input fields without issuing a request',async()=>{
  await expect(readSignatureAssurance(captureSignatureAssuranceScope(org),{...query,verified:true}as t.ReadQuery)).rejects.toMatchObject({code:'INVALID_INPUT'});
  expect(state.calls).toHaveLength(0);
 });
 it('refuses wrong response actor/org and a wrong requested signature',async()=>{
  state.response={...success({kind:'policy_list',policies:[],next_after_id:null}),scope:{actor_user_id:id(99),organization_id:org}};
  await expect(readSignatureAssurance(captureSignatureAssuranceScope(org),query)).rejects.toThrow();
  state.response={...success({kind:'policy_list',policies:[],next_after_id:null}),scope:{actor_user_id:actor,organization_id:id(99)}};
  await expect(readSignatureAssurance(captureSignatureAssuranceScope(org),query)).rejects.toThrow();
  const value=await manifest();state.response=success({kind:'signature',context:{...value.body.context,signature_id:id(99)}});
  await expect(readSignatureAssurance(captureSignatureAssuranceScope(org),{kind:'signature',signature_id:signature,party_role:'recipient'})).rejects.toThrow();
 });
 it('does not accept duplicate/reversed policy rows or a non-progressing cursor',async()=>{
  const first=await policy(),second={...first,id:id(15)};
  for(const result of [{policies:[first,first],next_after_id:null},{policies:[second,first],next_after_id:null},{policies:[first],next_after_id:id(99)}]){
   state.response=success({kind:'policy_list',...result});await expect(readSignatureAssurance(captureSignatureAssuranceScope(org),query)).rejects.toThrow();
  }
 });
 it('verifies declared subject, exact terms and rendered literal hashes before returning terms',async()=>{
  const value=await policy(),terms=value.body.agreement!,rendered='Точный текст\nУчастник: Тестовый человек';
  const result:t.ReadResult={kind:'terms',policy_version_id:value.id,subject_user_id:actor,terms,rendered_text:rendered,rendered_text_sha256:await evidenceSha256(rendered),declared_full_name:'Тестовый человек'};
  const requested:t.ReadQuery={kind:'terms',policy_version_id:value.id,terms_kind:'pep_agreement',declared_full_name:'Тестовый человек'};
  state.response=success(result);await expect(readSignatureAssurance(captureSignatureAssuranceScope(org),requested)).resolves.toBeDefined();
  state.response=success({...result,declared_full_name:'Другой человек'});await expect(readSignatureAssurance(captureSignatureAssuranceScope(org),requested)).rejects.toThrow();
  state.response=success({...result,rendered_text:rendered+' подмена'});await expect(readSignatureAssurance(captureSignatureAssuranceScope(org),requested)).rejects.toThrow();
 });
 it('keeps a legacy global agreement self-only and refuses duplicate merged subject identities',async()=>{
  const stored=legacy(),subjectResult:t.ReadResult={kind:'subject',subject_user_id:stored.subject_user_id,agreement_stream_id:id(80),agreement_revision:0,consent_stream_id:id(81),consent_revision:0,agreements:[stored],consents:[],next_after_id:null};
  state.response=success(subjectResult);await expect(readSignatureAssurance(captureSignatureAssuranceScope(org),{kind:'subject',subject_user_id:stored.subject_user_id,after_id:null,limit:2})).rejects.toThrow();
  stored.subject_user_id=actor;stored.actor.user_id=actor;state.response=success({...subjectResult,subject_user_id:actor});
  await expect(readSignatureAssurance(captureSignatureAssuranceScope(org),{kind:'subject',subject_user_id:actor,after_id:null,limit:2})).resolves.toBeDefined();
  state.response=success({...subjectResult,subject_user_id:actor,agreements:[stored,stored]});await expect(readSignatureAssurance(captureSignatureAssuranceScope(org),{kind:'subject',subject_user_id:actor,after_id:null,limit:2})).rejects.toThrow();
 });
 it('requires complete contiguous requested event history and byte-valid disclosed references',async()=>{
  const value=await manifest(),event=value.body.events[0];state.response=success({kind:'events',page:{stream_kind:'signature',stream_id:signature,through_revision:2,events:[event],after_revision:0,next_after_revision:null}});
  await expect(readSignatureAssurance(captureSignatureAssuranceScope(org),{kind:'events',stream_kind:'signature',stream_id:signature,after_revision:0,through_revision:2,limit:2})).rejects.toThrow();
  const forged={...event,authority:{kind:'exact_document_reference' as const,declaration:null,verification:'exact_reference_checked' as const,document_reference:{visibility:'available' as const,captured_reference_json:'{}',captured_reference_sha256:zero,value:{kind:'org_document_version' as const,organization_id:org,source:{kind:'org_document_version' as const,document_id:id(10),version_id:id(11),content_hash:zero},byte_proof:null}}}};
  state.response=success({kind:'events',page:{stream_kind:'signature',stream_id:signature,through_revision:1,events:[forged],after_revision:0,next_after_revision:null}});
  await expect(readSignatureAssurance(captureSignatureAssuranceScope(org),{kind:'events',stream_kind:'signature',stream_id:signature,after_revision:0,through_revision:1,limit:2})).rejects.toThrow();
 });
 it('retains frozen mutation bytes/request UUID and immutable receipt facts across uncertain/replayed retries',async()=>{
  const value=await policy(),terms=value.body.agreement!,rendered='Подтверждаю точный текст.';
  const action:t.ApplyAction={action:'accept_agreement',policy_version_id:value.id,terms_sha256:terms.sha256,rendered_text_sha256:await evidenceSha256(rendered),declared_full_name:'Тестовый участник'};
  const agreement:Extract<t.AgreementSnapshot,{kind:'account_acceptance'}>={kind:'account_acceptance',id:id(90),legacy_agreement_id:null,organization_id:org,subject_user_id:actor,terms,rendered_text:rendered,rendered_text_sha256:action.rendered_text_sha256,actor:{...actorFact,declared_full_name:action.declared_full_name},policy_version_id:value.id,policy_sha256:value.body_sha256,accepted_at:stamp,timestamp_assurance:'platform_server_time',identity_assurance:'observed_account_control',assurance:'account_acceptance'};
  const response:t.ApplySuccess={...success({kind:'policy_list',policies:[],next_after_id:null}),receipt:{request_id:id(91),payload_sha256:zero,outcome:'applied',action:'accept_agreement',event_id:id(92),party_role:null,binding_id:null,entity_id:agreement.id,revision_applied:1,server_at:stamp},result:{kind:'agreement',agreement}};
  const operation=prepareSignatureAssuranceMutation(captureSignatureAssuranceScope(org),0,action,id(91));action.declared_full_name='Изменённая форма';
  state.response=response;await expect(operation.run()).resolves.toBeDefined();
  state.response={...response,receipt:{...response.receipt,outcome:'replayed'}};await operation.run();
  expect(state.calls[0].args).toEqual(state.calls[1].args);expect(state.calls[0].args).toMatchObject({p_action:{declared_full_name:'Тестовый участник'}});
  state.response={...response,receipt:{...response.receipt,outcome:'replayed',payload_sha256:'b'.repeat(64)}};await expect(operation.run()).rejects.toThrow();
 });
 it('refuses another action or entity receipt as a successful mutation',async()=>{
  const value=await manifest(),context=value.body.context;
  const action:t.ApplyAction={action:'record_graphic_preparation',signature_id:signature,party_role:'recipient',binding_id:null,document_html_sha256:context.current_document_html_sha256,reason:'Синтетическая подготовка макета.'};
  const response:t.ApplySuccess={version:1,ok:true,scope:{actor_user_id:actor,organization_id:org},capabilities:structuredClone(caps),
   receipt:{request_id:id(91),payload_sha256:zero,outcome:'applied',action:'record_graphic_preparation',event_id:id(92),party_role:'recipient',binding_id:null,entity_id:id(99),revision_applied:1,server_at:stamp},result:{kind:'signature',context}};
  state.response=response;await expect(prepareSignatureAssuranceMutation(captureSignatureAssuranceScope(org),0,action,id(91)).run()).rejects.toThrow();
  state.response={...response,receipt:{...response.receipt,entity_id:signature,action:'revoke_invitation'}};
  await expect(prepareSignatureAssuranceMutation(captureSignatureAssuranceScope(org),0,action,id(91)).run()).rejects.toThrow();
 });
 it('does not expose raw database details or normalize a domain-specific conflict into generic retry',()=>{
  expect(normalizeSignatureEvidenceError({code:'PT409',message:'SIGNATURE_EVIDENCE_POLICY_CHANGED'}).code).toBe('POLICY_CHANGED');
  expect(normalizeSignatureEvidenceError({code:'PT409',message:'Document changed'}).code).toBe('REVISION_CONFLICT');
  expect(normalizeSignatureEvidenceError({message:'INTERNAL_SYNTHETIC_DATABASE_DETAILS'}).message).not.toContain('INTERNAL');
 });
 it('does not return a recipient context for an explicit sender read or a peer-scoped policy selection',async()=>{
  const value=await twoPartyManifest();state.response=success({kind:'signature',context:value.body.context});
  await expect(readSignatureAssurance(captureSignatureAssuranceScope(org),{kind:'signature',signature_id:signature,party_role:'sender'})).rejects.toThrow();
  state.response=success({kind:'policy_choices',signature_id:signature,party_role:'sender',purpose:'signature',choices:[],next_after_id:null});
  await expect(readSignatureAssurance(captureSignatureAssuranceScope(org),{kind:'policy_choices',signature_id:signature,party_role:'recipient',purpose:'signature',after_id:null,limit:10})).rejects.toThrow();
 });
 it('keeps the original recipient binding in a replay receipt after a later explicit recipient rebind',async()=>{
  const value=await twoPartyManifest(),action:t.ApplyAction={action:'record_graphic_preparation',signature_id:signature,party_role:'recipient',binding_id:id(50),document_html_sha256:value.body.context.current_document_html_sha256,reason:'Сохранённый прежний запрос.'};
  const response:t.ApplySuccess={version:1,ok:true,scope:{actor_user_id:actor,organization_id:org},capabilities:structuredClone(caps),receipt:{request_id:id(91),payload_sha256:zero,outcome:'replayed',action:'record_graphic_preparation',event_id:id(92),party_role:'recipient',binding_id:id(50),entity_id:signature,revision_applied:3,server_at:stamp},result:{kind:'signature',context:value.body.context}};
  const operation=prepareSignatureAssuranceMutation(captureSignatureAssuranceScope(org),2,action,id(91));state.response=response;await expect(operation.run()).resolves.toBeDefined();
  expect(value.body.context.parties.recipient.binding?.id).toBe(id(70));
  state.response={...response,receipt:{...response.receipt,binding_id:id(70)}};await expect(operation.run()).rejects.toThrow();
 });
 it('never reports a same-hash peer party receipt or a peer capability vector as the requested successful action',async()=>{
  const value=await manifest(),action:t.ApplyAction={action:'record_graphic_preparation',signature_id:signature,party_role:'recipient',binding_id:null,document_html_sha256:value.body.context.current_document_html_sha256,reason:'Макет получателя.'};
  const response:t.ApplySuccess={version:1,ok:true,scope:{actor_user_id:actor,organization_id:org},capabilities:structuredClone(caps),receipt:{request_id:id(91),payload_sha256:zero,outcome:'applied',action:'record_graphic_preparation',event_id:id(92),party_role:'sender',binding_id:null,entity_id:signature,revision_applied:1,server_at:stamp},result:{kind:'signature',context:value.body.context}};
  state.response=response;await expect(prepareSignatureAssuranceMutation(captureSignatureAssuranceScope(org),0,action,id(91)).run()).rejects.toThrow();
  state.response={...response,receipt:{...response.receipt,party_role:'recipient'},capabilities:{...caps,can_confirm_sender:true}};await expect(prepareSignatureAssuranceMutation(captureSignatureAssuranceScope(org),0,action,id(91)).run()).rejects.toThrow();
 });
});
