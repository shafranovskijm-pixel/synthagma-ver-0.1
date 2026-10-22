import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { org,pupil,enrollment,course,uid } from "@/lib/educationIssuance/__tests__/fixtures";
const mock=vi.hoisted(()=>({current:true,allowed:true,queryError:false,from:vi.fn(),rpc:vi.fn(),error:vi.fn()}));
vi.mock("@/utils/courseCache",()=>({captureOfflineContext:()=>({actorId:"00000000-0000-4000-8000-000000000001",revision:1}),isOfflineActorCurrent:()=>mock.current}));
vi.mock("@/hooks/useStaffPermissions",()=>({useStaffPermissions:()=>({organizationId:"00000000-0000-4000-8000-000000000002",loading:false,error:null,can:(permission:string)=>mock.allowed&&permission!=="documents.issue"})}));
vi.mock("@/utils/fetchUserRolesBatched",()=>({fetchUserRolesBatched:async()=>[]}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:mock.from,rpc:mock.rpc}}));
vi.mock("sonner",()=>({toast:{error:mock.error,success:vi.fn(),info:vi.fn()}}));
import { useFRDOManager } from "../useFRDOManager";
beforeEach(()=>{vi.clearAllMocks();mock.current=true;mock.allowed=true;mock.queryError=false;
  mock.from.mockImplementation((table:string)=>{
    const data=table==="profiles"?[{user_id:pupil,full_name:"Фактический ученик",email:"",student_group_id:null}]:table==="enrollments"?[{id:enrollment,user_id:pupil,course_id:course,started_at:"2026-10-01",completed_at:null,time_spent:0,courses:{id:course,title:"Текущий заголовок курса",duration:"999 часов"}}]:[];
    const chain:any=new Proxy({},{get:(_,key)=>key==="then"?(resolve:any)=>Promise.resolve({data,error:mock.queryError&&table==="enrollments"?{message:"unavailable"}:null}).then(resolve):()=>chain});return chain;
  });
});
afterEach(cleanup);
describe("FRDO preparation uses existing issuance facts only",()=>{
  it("does not read personal rows or export without current organization rights",async()=>{
    mock.allowed=false;const {result}=renderHook(()=>useFRDOManager(org));await act(async()=>{await result.current.handleBulkExport("dpo");});
    expect(result.current.canExport).toBe(false);expect(result.current.existingExport).toBeNull();expect(mock.from).not.toHaveBeenCalled();expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("opens exact assignment selection without issuing from mutable current names, hours or a completion percentage",async()=>{
    const {result}=renderHook(()=>useFRDOManager(org));await waitFor(()=>expect(result.current.students).toHaveLength(1));
    await act(async()=>{await result.current.handleBulkExport("dpo");});
    expect(result.current.existingExport).toEqual({assignments:[{enrollmentId:enrollment,courseId:course}],documentType:"dpo"});
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("does not expose partially loaded personal rows after a dependency error",async()=>{
    mock.queryError=true;const {result}=renderHook(()=>useFRDOManager(org));await waitFor(()=>expect(result.current.isLoading).toBe(false));
    expect(result.current.students).toEqual([]);expect(result.current.filteredStudents).toEqual([]);expect(result.current.courses).toEqual([]);
    await act(async()=>{await result.current.handleBulkExport("dpo");});expect(result.current.existingExport).toBeNull();expect(mock.error).toHaveBeenCalled();expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("hides a previously loaded selection after actor access changed",async()=>{
    const hook=renderHook(()=>useFRDOManager(org));await waitFor(()=>expect(hook.result.current.students).toHaveLength(1));
    mock.current=false;hook.rerender();expect(hook.result.current.students).toEqual([]);expect(hook.result.current.enrollmentsMap.size).toBe(0);
    await act(async()=>{await hook.result.current.handleBulkExport("po");});expect(hook.result.current.existingExport).toBeNull();
  });
});
