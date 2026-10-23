import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { org,course,pupil,enrollment,caps,source,withdrawal,mutation } from "@/lib/educationIssuance/__tests__/fixtures";
const mock=vi.hoisted(()=>({allowed:true,current:true,ready:true,read:vi.fn(),prepare:vi.fn(),run:vi.fn()}));
vi.mock("@/hooks/useStaffPermissions",()=>({useStaffPermissions:()=>({loading:false,can:()=>mock.allowed})}));
vi.mock("@/hooks/useEducationIssuance",()=>({useEducationIssuanceScope:()=>capture}));
vi.mock("@/lib/educationIssuance/client",async original=>({...await original<typeof import("@/lib/educationIssuance/client")>(),issuanceScopeCurrent:()=>mock.current,readEducationIssuance:mock.read,prepareEducationIssuanceMutation:mock.prepare}));
vi.mock("@/components/organization/education-issuance/SourcePicker",()=>({IssuanceSourcePicker:({onChange,disabled}:any)=><button disabled={disabled} onClick={()=>onChange(source)}>Выбрать основание</button>}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import { CancelCourseAssignmentButton } from "../CancelCourseAssignmentButton";
import { EducationIssuanceError } from "@/lib/educationIssuance/client";
const scope={actorId:pupil,accessRevision:1,organizationId:org,issuanceScope:{kind:"organization" as const},current:()=>true};
const capture=()=>scope;
const props={enrollmentId:enrollment,organizationId:org,courseTitle:"Фактический курс",progress:100,timeSpent:3600,status:"completed",hasTestAttempts:true,onCancelled:vi.fn()};
beforeEach(()=>{vi.clearAllMocks();mock.allowed=true;mock.current=true;mock.ready=true;mock.run.mockResolvedValue(mutation());
  mock.prepare.mockImplementation((_scope,action)=>({requestId:"stable-request",action,run:mock.run}));
  mock.read.mockImplementation(async(_scope,query)=>({schema_version:1,organization_id:org,scope:{kind:"organization"},capabilities:caps,...(query.kind==="withdrawal"?{kind:"withdrawal",state:withdrawal()}:{kind:"withdrawal_preview",preview:{intent:query.intent,preview_hash:"a".repeat(64),items:[{...withdrawal(),can_withdraw:mock.ready}],ready:mock.ready}})}));
});
afterEach(cleanup);
async function preview(){
  fireEvent.click(screen.getByRole("button",{name:"Прекратить обучение"}));
  fireEvent.click(await screen.findByRole("button",{name:"Выбрать основание"}));
  fireEvent.change(screen.getByLabelText("Пункт или реквизиты основания"),{target:{value:"Заявление №1"}});
  fireEvent.change(screen.getByLabelText("Причина решения"),{target:{value:"Фактическое заявление"}});
  fireEvent.click(screen.getByRole("button",{name:"Проверить на сервере"}));
  await screen.findByText(/Сохраняется: completed, 100%/);
}
describe("retained withdrawal operator flow",()=>{
  it("does not expose a mutation to read-only staff",()=>{mock.allowed=false;render(<CancelCourseAssignmentButton {...props}/>);expect(screen.queryByRole("button",{name:"Прекратить обучение"})).toBeNull();});
  it("allows explicit withdrawal of a progressed assignment while retaining results and requiring preview then confirmation",async()=>{
    render(<CancelCourseAssignmentButton {...props}/>);await preview();expect(mock.prepare).not.toHaveBeenCalled();expect(mock.run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Подтвердить прекращение"}));await waitFor(()=>expect(props.onCancelled).toHaveBeenCalledTimes(1));
    expect(mock.prepare).toHaveBeenCalledWith(scope,expect.objectContaining({action:"withdraw_enrollments",intent:expect.objectContaining({enrollment_ids:[enrollment]})}));
  });
  it("does not save a server-blocked preview",async()=>{
    mock.ready=false;render(<CancelCourseAssignmentButton {...props}/>);await preview();
    expect(screen.getByRole("button",{name:"Подтвердить прекращение"})).toBeDisabled();expect(mock.run).not.toHaveBeenCalled();
  });
  it("keeps the same prepared request after an unknown result",async()=>{
    mock.run.mockRejectedValueOnce(new EducationIssuanceError("DEPENDENCY_UNAVAILABLE",true)).mockResolvedValueOnce(mutation(true));
    render(<CancelCourseAssignmentButton {...props}/>);await preview();fireEvent.click(screen.getByRole("button",{name:"Подтвердить прекращение"}));
    fireEvent.click(await screen.findByRole("button",{name:"Повторить тот же запрос"}));await waitFor(()=>expect(props.onCancelled).toHaveBeenCalledTimes(1));
    expect(mock.prepare).toHaveBeenCalledTimes(1);expect(mock.run).toHaveBeenCalledTimes(2);
  });
});
