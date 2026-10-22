import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { actor, org, course, group, caps } from "@/lib/educationIssuance/__tests__/fixtures";
const mock=vi.hoisted(()=>({current:true,issue:false,read:vi.fn(),rpc:vi.fn(),from:vi.fn(),capture:vi.fn(),group:false}));
vi.mock("@/utils/courseCache",()=>({captureOfflineContext:()=>({actorId:"00000000-0000-4000-8000-000000000001",revision:1}),isOfflineActorCurrent:()=>mock.current}));
vi.mock("@/hooks/useStaffPermissions",()=>({useStaffPermissions:()=>({loading:false,error:null,organizationId:"00000000-0000-4000-8000-000000000002",can:(permission:string)=>mock.current&&(permission!=="documents.issue"||mock.issue),isOrgOwner:false})}));
vi.mock("@/hooks/useEducationIssuance",()=>({useEducationIssuanceScope:()=>mock.capture}));
vi.mock("@/lib/educationIssuance/client",async original=>({...await original<typeof import("@/lib/educationIssuance/client")>(),readEducationIssuance:mock.read}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:"00000000-0000-4000-8000-000000000001"},access_token:"synthetic"}},error:null})},from:mock.from,rpc:mock.rpc}}));
vi.mock("sonner",()=>({toast:{error:vi.fn(),success:vi.fn(),info:vi.fn()}}));
import { captureIssuanceScope } from "@/lib/educationIssuance/client";
import { useEducationDocumentsJournal } from "../useEducationDocumentsJournal";
function setup(context:null|{groupId:string;courseId:string;memberUserIds:string[]|null;status:"loading"|"ready"|"error"}=null){
  const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return renderHook(()=>useEducationDocumentsJournal({organizationId:org,groupContext:context}),{wrapper});
}
beforeEach(()=>{vi.clearAllMocks();mock.current=true;mock.issue=false;mock.group=false;
  mock.capture.mockImplementation(()=>captureIssuanceScope(org,mock.group?{kind:"group",group_id:group}:{kind:"organization"},()=>mock.current));
  mock.read.mockImplementation(async(scope,query)=>({schema_version:1,organization_id:org,scope:scope.issuanceScope,kind:"records",capabilities:{...caps,can_issue:mock.issue},items:[],next_after_id:null}));
  mock.from.mockImplementation((table:string)=>{const data=table==="organizations"?{name:"QA центр",branding:{}}:[];const chain:any=new Proxy({},{get:(_,key)=>key==="then"?(resolve:any)=>Promise.resolve({data,error:null}).then(resolve):()=>chain});return chain;});
});
afterEach(cleanup);
describe("journal permissions and group isolation",()=>{
  it("never fetches organization records while a group association is unresolved",()=>{
    const {result}=setup({groupId:group,courseId:course,memberUserIds:null,status:"loading"});
    expect(result.current.filteredRecords).toEqual([]);expect(result.current.canIssue).toBe(false);
    expect(mock.read).not.toHaveBeenCalled();expect(mock.from).not.toHaveBeenCalled();
  });
  it("a read-only user can inspect existing records but cannot stage issuance or allocate a number",async()=>{
    const {result}=setup();await waitFor(()=>expect(result.current.loading).toBe(false));
    act(()=>result.current.openIssue());expect(result.current.showIssueDialog).toBe(false);
    expect(result.current.canIssue).toBe(false);expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.read).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({kind:"records"}));
  });
  it("an authorized issuer reads the actual group/course without automatically issuing graduates",async()=>{
    mock.issue=true;mock.group=true;
    const {result}=setup({groupId:group,courseId:course,memberUserIds:[actor],status:"ready"});
    await waitFor(()=>expect(result.current.canIssue).toBe(true));
    expect(mock.read).toHaveBeenCalledWith(expect.objectContaining({issuanceScope:{kind:"group",group_id:group}}),expect.objectContaining({kind:"records",course_id:course}));
    expect(mock.rpc).not.toHaveBeenCalled();act(()=>result.current.openIssue());expect(result.current.showIssueDialog).toBe(true);
  });
  it("revocation suppresses cached records and action affordances immediately",async()=>{
    mock.issue=true;const hook=setup();await waitFor(()=>expect(hook.result.current.canIssue).toBe(true));
    mock.current=false;hook.rerender();expect(hook.result.current.records).toEqual([]);expect(hook.result.current.canIssue).toBe(false);expect(hook.result.current.canExport).toBe(false);
  });
});
