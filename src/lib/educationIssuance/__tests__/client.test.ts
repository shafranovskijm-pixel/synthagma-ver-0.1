import { beforeEach, describe, expect, it, vi } from "vitest";
import { actor,org,group,enrollment,request,uid,caps,hash,withdrawal,withdrawalAction,mutation } from "./fixtures";
const mock=vi.hoisted(()=>({current:true,session:vi.fn(),rpc:vi.fn(),response:null as any,after:null as null|(()=>void)}));
vi.mock("@/utils/courseCache",()=>({captureOfflineContext:()=>({actorId:"00000000-0000-4000-8000-000000000001",revision:1}),isOfflineActorCurrent:()=>mock.current}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{auth:{getSession:mock.session},rpc:mock.rpc}}));
import { captureIssuanceScope, prepareEducationIssuanceMutation, readEducationIssuance } from "../client";
const capture=()=>captureIssuanceScope(org,{kind:"organization"},()=>true);
beforeEach(()=>{vi.clearAllMocks();mock.current=true;mock.after=null;mock.session.mockResolvedValue({data:{session:{user:{id:actor},access_token:"synthetic-token"}},error:null});
  mock.rpc.mockImplementation(()=>({setHeader:async()=>{mock.after?.();return {data:mock.response,error:null,status:200};}}));});
describe("controlled retained withdrawal boundary",()=>{
  it("does not call RPC when the actor changed while refreshing a session",async()=>{
    mock.session.mockImplementation(async()=>{mock.current=false;return {data:{session:{user:{id:actor},access_token:"synthetic-token"}},error:null};});
    await expect(readEducationIssuance(capture(),{kind:"withdrawal",enrollment_id:enrollment})).rejects.toMatchObject({code:"ACCESS_DENIED"});
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("discards a late response after an access revision changed",async()=>{
    mock.response={schema_version:1,organization_id:org,scope:{kind:"organization"},capabilities:caps,kind:"withdrawal",state:withdrawal()};
    mock.after=()=>{mock.current=false;};
    await expect(readEducationIssuance(capture(),{kind:"withdrawal",enrollment_id:enrollment})).rejects.toMatchObject({code:"ACCESS_DENIED"});
  });
  it("rejects a different organization's factual withdrawal state",async()=>{
    mock.response={schema_version:1,organization_id:org,scope:{kind:"organization"},capabilities:caps,kind:"withdrawal",state:withdrawal()};
    mock.response.state.ref.organization_id=uid(99);
    await expect(readEducationIssuance(capture(),{kind:"withdrawal",enrollment_id:enrollment})).rejects.toThrow();
  });
  it("does not widen a selected group to an unrelated assignment",async()=>{
    mock.response={schema_version:1,organization_id:org,scope:{kind:"group",group_id:group},capabilities:caps,kind:"withdrawal",state:withdrawal()};
    mock.response.state.ref.group_id=uid(99);
    await expect(readEducationIssuance(captureIssuanceScope(org,{kind:"group",group_id:group},()=>true),{kind:"withdrawal",enrollment_id:enrollment})).rejects.toThrow();
  });
  it("retries the same request after an unknown result without changing retained facts",async()=>{
    const action=withdrawalAction(),prepared=prepareEducationIssuanceMutation(capture(),action,request);
    action.intent.basis.reason="Attempted caller mutation";
    mock.rpc.mockImplementationOnce(()=>({setHeader:async()=>({data:null,error:{message:"network unavailable"},status:0})}));
    await expect(prepared.run()).rejects.toMatchObject({code:"DEPENDENCY_UNAVAILABLE"});
    mock.response=mutation(true);await expect(prepared.run()).resolves.toMatchObject({withdrawals:[{state:"withdrawn",technical_progress:100,technical_time_spent:3600}]});
    const calls=mock.rpc.mock.calls;expect(calls).toHaveLength(2);expect(calls[0]).toEqual(calls[1]);
    expect(calls[1][0]).toBe("apply_education_issuance_action");expect(calls[1][1].p_request_id).toBe(request);
    expect(calls[1][1].p_action.intent.basis.reason).toBe("Фактическое заявление ученика");
  });
  it("rejects green responses that omit a selected assignment or invent an extra event",async()=>{
    mock.response=mutation();mock.response.withdrawals=[];
    await expect(prepareEducationIssuanceMutation(capture(),withdrawalAction(),request).run()).rejects.toThrow();
    mock.response=mutation();mock.response.receipt.event_ids.push(uid(91));
    await expect(prepareEducationIssuanceMutation(capture(),withdrawalAction(),request).run()).rejects.toThrow();
  });
  it("rejects an unknown physical-delete instruction before any RPC",()=>{
    expect(()=>prepareEducationIssuanceMutation(capture(),{...withdrawalAction(),delete_enrollments:true} as any,request)).toThrow();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("requires an exact selected set and cannot turn an unavailable source into a ready preview",async()=>{
    mock.response={schema_version:1,organization_id:org,scope:{kind:"organization"},capabilities:caps,kind:"withdrawal_preview",preview:{intent:withdrawalAction().intent,preview_hash:hash,items:[{...withdrawal(),can_withdraw:false}],ready:true}};
    await expect(readEducationIssuance(capture(),{kind:"withdrawal_preview",intent:withdrawalAction().intent})).rejects.toThrow();
  });
});

import { issuedRecord,issueAction,issueMutation,preparation } from './fixtures';
import { prepareEducationIssuanceArtifacts } from '../client';
describe('exact prepared artifact and frozen facts',()=>{
  it('cannot issue from technical completion or a template without an approved saved artifact',()=>{
    const action=issueAction();delete (action.items[0] as any).artifact;
    expect(()=>prepareEducationIssuanceMutation(capture(),action as any,request)).toThrow();expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('accepts an exact saved artifact and stable replay without a second numbering action',async()=>{
    const prepared=prepareEducationIssuanceMutation(capture(),issueAction(),request);mock.response=issueMutation();
    await expect(prepared.run()).resolves.toMatchObject({records:[{official:{document_number:'1'},artifact:{availability:'available'}}]});
    mock.response=issueMutation(true);await prepared.run();expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1]);
  });
  it('rejects a different artifact or a different pupil hidden inside a green issue response',async()=>{
    mock.response=issueMutation();mock.response.records[0].artifact.artifact.byte_sha256='b'.repeat(64);
    await expect(prepareEducationIssuanceMutation(capture(),issueAction(),request).run()).rejects.toThrow();
    mock.response=issueMutation();mock.response.records[0].official.user_id=uid(98);
    await expect(prepareEducationIssuanceMutation(capture(),issueAction(),request).run()).rejects.toThrow();
  });
  it('rejects mutable or inconsistent FRDO facts rather than filling them from live profile/course data',async()=>{
    mock.response={schema_version:1,organization_id:org,scope:{kind:'organization'},capabilities:caps,kind:'record',record:issuedRecord()};
    mock.response.record.frdo_facts.program_title='Другая текущая программа';
    await expect(readEducationIssuance(capture(),{kind:'record',record_id:uid(52)})).rejects.toThrow();
    mock.response.record=issuedRecord();mock.response.record.frdo_facts.missing=[];
    await expect(readEducationIssuance(capture(),{kind:'record',record_id:uid(52)})).rejects.toThrow();
  });
  it('creates only the exact unissued plan and retries a lost preparation response with the same request',async()=>{
    const prep=preparation(),operation=prepareEducationIssuanceArtifacts(capture(),prep.plan,request);
    mock.rpc.mockImplementationOnce(()=>({setHeader:async()=>({data:null,error:{message:'network lost'},status:0})}));
    await expect(operation.run()).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
    mock.response={schema_version:1,organization_id:org,scope:{kind:'organization'},capabilities:caps,receipt:{request_id:request,action:'prepare_artifacts',payload_hash:hash,preparation_id:prep.id,applied_at:prep.created_at,replayed:true},preparation:prep};
    await expect(operation.run()).resolves.toMatchObject({preparation:{items:[{status:'prepared',final_record_id:null}]}});
    expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1]);expect(mock.rpc.mock.calls[1][0]).toBe('prepare_education_issuance_artifacts');
  });
  it('rejects a recovered preparation with a foreign creator or a substituted immutable plan',async()=>{
    const prep=preparation();mock.response={schema_version:1,organization_id:org,scope:{kind:'organization'},capabilities:caps,kind:'preparation',preparation:prep};
    mock.response.preparation.created_by=uid(99);
    await expect(readEducationIssuance(capture(),{kind:'preparation',preparation_id:prep.id})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
});
