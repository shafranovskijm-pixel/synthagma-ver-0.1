import { describe, expect, it, vi } from "vitest";
import { buildIssueBatchPayload, issueEducationDocumentBatch, issueEducationDocumentsByCourse } from '../issueBatch.ts';
const item={user_id:"u1",enrollment_id:"e1",course_id:"c1",document_type:"certificate",full_name:"Иванов Иван",specialty_name:"Курс"};
describe("historical payload compatibility cannot issue new documents",()=>{
  it("retains pure historical normalization without sending data anywhere",()=>{
    const value=buildIssueBatchPayload({organizationId:"org1",groupId:"g1",courseId:"c1",items:[{...item,issue_date:"2026-10-01",qualification_name:""}]});
    expect(value).toMatchObject({p_organization_id:"org1",p_group_id:"g1",p_course_id:"c1",p_items:[{issue_date:"2026-10-01",qualification_name:null}]});
  });
  it("does not invoke the old allocator, even if a caller supplies complete personal metadata",async()=>{
    const client={rpc:vi.fn().mockResolvedValue({data:[{document_number:"fake"}],error:null})};
    await expect(issueEducationDocumentBatch({organizationId:"org1",groupId:"g1",courseId:"c1",items:[item]},client)).rejects.toThrow("журнал выдачи");
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("does not partially issue a multi-course batch through the legacy adapter",async()=>{
    const client={rpc:vi.fn()};
    await expect(issueEducationDocumentsByCourse({organizationId:"org1",items:[item,{...item,enrollment_id:"e2",course_id:"c2"}]},client)).rejects.toThrow("выдано партий: 0");
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
