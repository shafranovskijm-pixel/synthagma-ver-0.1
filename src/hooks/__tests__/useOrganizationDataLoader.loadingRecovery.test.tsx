import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrganizationDataLoader } from "../useOrganizationDataLoader";

const mocks = vi.hoisted(() => ({
  profile: vi.fn(), owner: vi.fn(), memberships: vi.fn(), core: vi.fn(), dataQuery: vi.fn(), adminView: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/utils/adminViewOrg", () => ({ resolveAdminViewOrg: mocks.adminView }));
vi.mock("sonner", () => ({ toast: { error: mocks.toast, loading: vi.fn(), dismiss: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (name: string, args: unknown) => name === "get_organization_core" ? mocks.core(args) : mocks.owner(name, args),
  from: (table: string) => {
    if (table === "organizations") throw new Error("Staff cannot SELECT the full organization row");
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (column: string, value: string) => { filters[column] = value; return query; },
      or: () => mocks.memberships(),
      maybeSingle: () => table === "profiles" ? mocks.profile() : mocks.dataQuery(table, filters),
      order: () => mocks.dataQuery(table, filters),
    };
    return query;
  },
} }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adminView.mockResolvedValue({ status: "none" });
  mocks.profile.mockResolvedValue({ data: { organization_id: "old-student-school" }, error: null });
  mocks.owner.mockResolvedValue({ data: false, error: null });
  mocks.core.mockResolvedValue({ data: { name: "Рабочая организация", frdo_enabled: true }, error: null });
  mocks.memberships.mockResolvedValue({ data: [{
    organization_id: "new-staff-school", role: "teacher", expires_at: null, sections_access: [],
  }], error: null });
  mocks.dataQuery.mockResolvedValue({ data: [], error: null });
});
afterEach(()=>{cleanup();vi.useRealTimers();});

function pending(){let resolve!:(value:any)=>void;const promise=new Promise<any>(done=>{resolve=done;});return{promise,resolve};}
describe('bounded organization loading',()=>{
 it('core metadata never settling ends in a retryable error; late metadata cannot start tenant reads',async()=>{vi.useFakeTimers();const old=pending();mocks.core.mockReturnValueOnce(old.promise);const h=renderHook(()=>useOrganizationDataLoader({userId:'staff'}));await act(async()=>{await vi.advanceTimersByTimeAsync(15001);});expect(h.result.current.isLoadingCourses).toBe(false);expect(h.result.current.coursesError).toContain('Повторите загрузку');expect(mocks.dataQuery).not.toHaveBeenCalled();act(()=>h.result.current.refreshData());await act(async()=>{await vi.advanceTimersByTimeAsync(1);});expect(h.result.current.coursesError).toBeNull();expect(mocks.dataQuery).toHaveBeenCalledTimes(3);await act(async()=>{old.resolve({data:{name:'OLD',frdo_enabled:false},error:null});});expect(h.result.current.organizationName).toBe('Рабочая организация');expect(mocks.dataQuery).toHaveBeenCalledTimes(3);});
 it('an optional request hanging cannot keep the whole screen loading forever or count as a successful zero',async()=>{vi.useFakeTimers();const old=pending();mocks.dataQuery.mockImplementation((table:string)=>table==='companies'?old.promise:Promise.resolve({data:[],error:null}));const h=renderHook(()=>useOrganizationDataLoader({userId:'staff'}));await act(async()=>{await vi.advanceTimersByTimeAsync(15001);});expect(h.result.current.isLoadingCourses).toBe(false);expect(h.result.current.coursesError).not.toBeNull();await act(async()=>{old.resolve({data:[],error:null});});expect(h.result.current.coursesError).not.toBeNull();});
 it('an expired old actor deadline cannot publish an error after a fresh actor workspace loads',async()=>{vi.useFakeTimers();const old=pending();mocks.core.mockReturnValueOnce(old.promise);const h=renderHook(({userId})=>useOrganizationDataLoader({userId}),{initialProps:{userId:'old'}});await act(async()=>{await vi.advanceTimersByTimeAsync(1);});h.rerender({userId:'fresh'});await act(async()=>{await vi.advanceTimersByTimeAsync(15001);});expect(h.result.current.isLoadingCourses).toBe(false);expect(h.result.current.coursesError).toBeNull();await act(async()=>{old.resolve({data:{name:'PRIVATE OLD'},error:null});});expect(h.result.current.organizationName).toBe('Рабочая организация');});
});
