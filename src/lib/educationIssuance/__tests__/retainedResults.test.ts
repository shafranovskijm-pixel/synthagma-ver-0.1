import { beforeEach, describe, expect, it, vi } from "vitest";
import { actor,org,course,enrollment,uid } from "./fixtures";
const mock=vi.hoisted(()=>({current:true,response:null as any,rpc:vi.fn(),session:vi.fn(),after:null as null|(()=>void)}));
vi.mock("@/utils/courseCache",()=>({captureOfflineContext:()=>({actorId:"00000000-0000-4000-8000-000000000001",revision:1}),isOfflineActorCurrent:()=>mock.current}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{auth:{getSession:mock.session},rpc:mock.rpc}}));
import { captureOwnRetainedScope, readOwnRetainedLearningSummary } from "../retainedResults";
const summary=()=>({schema_version:1,kind:"retained_summary",organization_id:org,user_id:actor,enrollment_id:enrollment,course_id:course,
  withdrawal:{effective_date:"2026-10-22",recorded_at:"2026-10-22T10:00:00Z"},technical:{status:"completed",progress:100,completed_at:"2026-10-21T10:00:00Z"},
  decisions:[{id:uid(11),outcome:"deferred",learner_summary:"Нужна дополнительная проверка ответственного.",recorded_at:"2026-10-21T10:00:00Z",supersedes_id:null}],next_after_decision_id:null});
beforeEach(()=>{vi.clearAllMocks();mock.current=true;mock.after=null;mock.response=summary();
  mock.session.mockResolvedValue({data:{session:{user:{id:actor},access_token:"synthetic-own-token"}},error:null});
  mock.rpc.mockImplementation(()=>({setHeader:async()=>{mock.after?.();return {data:mock.response,error:null,status:200};}}));
});
describe("own retained outcome without reopening course content",()=>{
  it("cannot use a staff preview identity as the current learner",()=>{
    expect(()=>captureOwnRetainedScope(org,uid(99))).toThrow();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("reads only the stored summary and preserves deferred rather than inferring passed from 100%",async()=>{
    const result=await readOwnRetainedLearningSummary(captureOwnRetainedScope(org,actor),enrollment,course);
    expect(result.technical.progress).toBe(100);expect(result.decisions[0].outcome).toBe("deferred");
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.rpc.mock.calls[0]).toEqual(["read_learning_outcome",{p_organization_id:org,p_query:{kind:"retained_summary",enrollment_id:enrollment,after_decision_id:null,limit:50}}]);
  });
  it("rejects a different learner or course despite a successful server status",async()=>{
    mock.response.user_id=uid(99);
    await expect(readOwnRetainedLearningSummary(captureOwnRetainedScope(org,actor),enrollment,course)).rejects.toThrow();
    mock.response=summary();mock.response.course_id=uid(98);
    await expect(readOwnRetainedLearningSummary(captureOwnRetainedScope(org,actor),enrollment,course)).rejects.toThrow();
  });
  it("rejects lesson content or private evidence links accidentally added to the narrow projection",async()=>{
    mock.response.source_ref={version_id:uid(90)};mock.response.lessons=[{content:"private"}];
    await expect(readOwnRetainedLearningSummary(captureOwnRetainedScope(org,actor),enrollment,course)).rejects.toThrow();
  });
  it("rejects out-of-order or repeated historical decisions",async()=>{
    const first=mock.response.decisions[0];mock.response.decisions.push({...first,outcome:"passed"});
    await expect(readOwnRetainedLearningSummary(captureOwnRetainedScope(org,actor),enrollment,course)).rejects.toThrow();
  });
  it("drops an in-flight personal summary when the actor changes",async()=>{
    mock.after=()=>{mock.current=false;};
    await expect(readOwnRetainedLearningSummary(captureOwnRetainedScope(org,actor),enrollment,course)).rejects.toMatchObject({code:"ACCESS_DENIED"});
  });
});
