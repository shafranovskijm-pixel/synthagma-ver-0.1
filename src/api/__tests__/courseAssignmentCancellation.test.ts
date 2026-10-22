import { beforeEach, describe, expect, it, vi } from "vitest";
import { org,enrollment,uid,mutation,withdrawalAction } from "@/lib/educationIssuance/__tests__/fixtures";
const state=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:state.rpc,from:state.from}}));
import { cancelCourseAssignment } from "@/api/courseAssignmentCancellation";
import { bulkUnenrollStudents, unenrollStudent } from "@/api/students";
import type { PreparedIssuanceMutation } from "@/lib/educationIssuance/client";
const prepared=(run=vi.fn().mockResolvedValue(mutation()))=>({requestId:uid(7),action:withdrawalAction(),run}) as PreparedIssuanceMutation;
beforeEach(()=>vi.clearAllMocks());
describe("legacy cancellation compatibility is retained withdrawal only",()=>{
  it("refuses an unreviewed old cancellation without touching the database",async()=>{
    await expect(cancelCourseAssignment({enrollmentId:enrollment,organizationId:org})).rejects.toThrow("withdrawal_confirmation_required");
    await expect(unenrollStudent(enrollment,org)).resolves.toBe(false);
    const bulk=await bulkUnenrollStudents([enrollment,enrollment],org);
    expect(bulk).toMatchObject({success:0,failed:1});expect(state.rpc).not.toHaveBeenCalled();expect(state.from).not.toHaveBeenCalled();
  });
  it("confirms the exact retained state, even when learning and results already exist",async()=>{
    const operation=prepared();
    await expect(cancelCourseAssignment({enrollmentId:enrollment,organizationId:org,operation})).resolves.toMatchObject({withdrawn:true,enrollmentId:enrollment});
    expect(operation.run).toHaveBeenCalledTimes(1);expect(state.from).not.toHaveBeenCalled();
  });
  it("rejects a different selected assignment before running the prepared decision",async()=>{
    const operation=prepared();
    await expect(cancelCourseAssignment({enrollmentId:uid(99),organizationId:org,operation})).rejects.toThrow();
    expect(operation.run).not.toHaveBeenCalled();
  });
  it("never turns a green response for another organization into success",async()=>{
    const value=mutation();value.organization_id=uid(99);
    await expect(cancelCourseAssignment({enrollmentId:enrollment,organizationId:org,operation:prepared(vi.fn().mockResolvedValue(value))})).rejects.toThrow();
  });
  it("uses one confirmed atomic bulk operation and reports an unknown result without partial-success guesses",async()=>{
    const run=vi.fn().mockRejectedValue(new Error("network"));
    const result=await bulkUnenrollStudents([enrollment],org,prepared(run));
    expect(result).toMatchObject({success:0,failed:1});expect(run).toHaveBeenCalledTimes(1);expect(state.rpc).not.toHaveBeenCalled();
  });
});
