import { beforeEach, describe, expect, it, vi } from "vitest";
import { actor,org,uid,preparation } from "./fixtures";
import { issuancePreparationSchema } from "../contract";
const mock=vi.hoisted(()=>({current:true,read:vi.fn(),session:vi.fn(),invoke:vi.fn(),rpc:vi.fn()}));
vi.mock("@/utils/courseCache",()=>({captureOfflineContext:()=>({actorId:"00000000-0000-4000-8000-000000000001",revision:1}),isOfflineActorCurrent:()=>mock.current}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{auth:{getSession:mock.session},functions:{invoke:mock.invoke},rpc:mock.rpc}}));
vi.mock("../client",async original=>({...await original<typeof import("../client")>(),readEducationIssuance:mock.read}));
import { captureIssuanceScope, artifactFinalRef } from "../client";
import { prepareArtifactRender } from "../artifactWorker";
const scope=()=>captureIssuanceScope(org,{kind:"organization"},()=>true);
const read=(value=preparation())=>({kind:"preparation",preparation:issuancePreparationSchema.parse(value)});
const result=(request:any,value=preparation("rendered_unissued"))=>({data:{schema_version:1,...request,status:value.items[0].status==="consumed"?"consumed":"rendered_unissued",final_record_id:value.items[0].final_record_id,artifact:value.items[0].artifact},error:null});
beforeEach(()=>{vi.clearAllMocks();mock.current=true;mock.session.mockResolvedValue({data:{session:{user:{id:actor},access_token:"synthetic"}},error:null});});
describe("trusted artifact preparation never finalizes or approves",()=>{
  it("requires explicit exact output approval before creating a final artifact reference",()=>{
    const draft=preparation("rendered_unissued");expect(()=>artifactFinalRef(draft,draft.items[0].id)).toThrow();
    const approved=preparation("approved_unissued"),ref=artifactFinalRef(approved,approved.items[0].id);
    expect(ref).toMatchObject({preparation_id:approved.id,item_id:approved.items[0].id,output_review_id:approved.items[0].artifact!.output_review!.id});
    expect(mock.rpc).not.toHaveBeenCalled();expect(mock.invoke).not.toHaveBeenCalled();
  });
  it("accepts only the exact request and a fresh stored artifact, while keeping it unissued",async()=>{
    const draft=preparation(),saved=preparation("rendered_unissued");
    mock.read.mockResolvedValueOnce(read(draft)).mockResolvedValueOnce(read(saved));
    mock.invoke.mockImplementation(async(_name,{body}:any)=>result(body,saved));
    const operation=prepareArtifactRender(scope(),draft,draft.items[0].id,uid(60));
    const value=await operation.run();expect(value.items[0].status).toBe("rendered_unissued");expect(value.items[0].final_record_id).toBeNull();
    expect(mock.invoke).toHaveBeenCalledWith("education-issuance-artifact",{body:operation.request,headers:{Authorization:"Bearer synthetic"}});
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("rejects a response for a different request even when its artifact looks valid",async()=>{
    const draft=preparation();mock.read.mockResolvedValue(read(draft));
    mock.invoke.mockImplementation(async(_name,{body}:any)=>result({...body,request_id:uid(99)}));
    await expect(prepareArtifactRender(scope(),draft,draft.items[0].id,uid(60)).run()).rejects.toMatchObject({code:"SOURCE_CHANGED"});
  });
  it("does not accept a green worker response without its exact saved preparation proof",async()=>{
    const draft=preparation();mock.read.mockResolvedValue(read(draft));
    mock.invoke.mockImplementation(async(_name,{body}:any)=>result(body));
    await expect(prepareArtifactRender(scope(),draft,draft.items[0].id,uid(60)).run()).rejects.toMatchObject({code:"SOURCE_CHANGED"});
  });
  it("recovers a lost response from the current saved state without rerendering or allocating numbers",async()=>{
    const draft=preparation(),saved=preparation("rendered_unissued");
    mock.read.mockResolvedValueOnce(read(draft)).mockResolvedValueOnce(read(saved));
    mock.invoke.mockResolvedValueOnce({data:null,error:{message:"network lost"}});
    const operation=prepareArtifactRender(scope(),draft,draft.items[0].id,uid(60));
    await expect(operation.run()).rejects.toMatchObject({code:"DEPENDENCY_UNAVAILABLE"});
    await expect(operation.run()).resolves.toMatchObject({items:[{status:"rendered_unissued",final_record_id:null}]});
    expect(mock.invoke).toHaveBeenCalledTimes(1);expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("rejects a changed immutable proof instead of accepting a matching display label",async()=>{
    const draft=preparation(),changed=preparation();if(changed.plan.kind!=="original")throw Error("fixture");changed.plan.items[0].expected_eligibility_ref.identity_ref.registration_hash="b".repeat(64);
    mock.read.mockResolvedValue(read(changed));await expect(prepareArtifactRender(scope(),draft,draft.items[0].id,uid(60)).run()).rejects.toMatchObject({code:"SOURCE_CHANGED"});expect(mock.invoke).not.toHaveBeenCalled();
  });
  it("does not silently replace the request after a renderer failure",async()=>{
    const draft=preparation();mock.read.mockResolvedValue(read(draft));
    mock.invoke.mockResolvedValue({data:{schema_version:1,code:"ARTIFACT_RENDER_FAILED",retryable:true,message:"Не удалось сформировать PDF"},error:null});
    const operation=prepareArtifactRender(scope(),draft,draft.items[0].id,uid(60));
    await expect(operation.run()).rejects.toMatchObject({code:"ARTIFACT_RENDER_FAILED"});
    await expect(operation.run()).rejects.toMatchObject({code:"ARTIFACT_RENDER_FAILED"});
    expect(mock.invoke.mock.calls[0][1].body).toEqual(mock.invoke.mock.calls[1][1].body);expect(mock.rpc).not.toHaveBeenCalled();
  });
});
