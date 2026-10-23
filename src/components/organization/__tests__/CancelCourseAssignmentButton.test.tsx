import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { org,course,pupil,enrollment,caps,source,withdrawal,mutation } from "@/lib/educationIssuance/__tests__/fixtures";
const mock=vi.hoisted(()=>({allowed:true,current:true,ready:true,removable:false,read:vi.fn(),prepare:vi.fn(),run:vi.fn(),removalRead:vi.fn(),removalPrepare:vi.fn(),removalRun:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{}}));
vi.mock("@/hooks/useStaffPermissions",()=>({useStaffPermissions:()=>({loading:false,can:allowed})}));
vi.mock("@/hooks/useEducationIssuance",()=>({useEducationIssuanceScope:()=>capture}));
vi.mock("@/lib/educationIssuance/client",async original=>({...await original<typeof import("@/lib/educationIssuance/client")>(),issuanceScopeCurrent:()=>mock.current,readEducationIssuance:mock.read,prepareEducationIssuanceMutation:mock.prepare}));
vi.mock("@/components/organization/education-issuance/SourcePicker",()=>({IssuanceSourcePicker:({onChange,disabled}:any)=><button disabled={disabled} onClick={()=>onChange(source)}>Выбрать основание</button>}));
vi.mock("@/api/erroneousCourseAssignment",async original=>({...await original<typeof import("@/api/erroneousCourseAssignment")>(),readAssignmentRemoval:mock.removalRead,prepareAssignmentRemoval:mock.removalPrepare}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import { CancelCourseAssignmentButton } from "../CancelCourseAssignmentButton";
import { AssignmentRemovalError } from "@/api/erroneousCourseAssignment";
import { EducationIssuanceError } from "@/lib/educationIssuance/client";
const scope={actorId:pupil,accessRevision:1,organizationId:org,issuanceScope:{kind:"organization" as const},current:()=>true};
const capture=()=>scope;
const allowed=()=>mock.allowed;
function removalState(){return{schema_version:1 as const,ref:{organization_id:org,group_id:null,enrollment_id:enrollment,user_id:pupil,course_id:course,state_hash:'b'.repeat(64)},state:'active' as const,can_remove:mock.removable,can_withdraw:true,reason:mock.removable?null:'LEARNING_STARTED' as const};}
const props={enrollmentId:enrollment,organizationId:org,courseTitle:"Фактический курс",progress:100,timeSpent:3600,status:"completed",hasTestAttempts:true,onCancelled:vi.fn()};
beforeEach(()=>{vi.clearAllMocks();mock.allowed=true;mock.current=true;mock.ready=true;mock.removable=false;mock.run.mockResolvedValue(mutation());
  mock.removalRead.mockImplementation(async()=>removalState());mock.removalRun.mockResolvedValue({cancelled:true,retained:true});mock.removalPrepare.mockImplementation(()=>({requestId:"stable-removal-request",run:mock.removalRun}));
  mock.prepare.mockImplementation((_scope,action)=>({requestId:"stable-request",action,run:mock.run}));
  mock.read.mockImplementation(async(_scope,query)=>({schema_version:1,organization_id:org,scope:{kind:"organization"},capabilities:caps,...(query.kind==="withdrawal"?{kind:"withdrawal",state:withdrawal()}:{kind:"withdrawal_preview",preview:{intent:query.intent,preview_hash:"a".repeat(64),items:[{...withdrawal(),can_withdraw:mock.ready}],ready:mock.ready}})}));
});
afterEach(cleanup);
async function preview(){
  fireEvent.click(await screen.findByRole("button",{name:"Прекратить обучение"}));
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

const simpleProps={...props,progress:0,timeSpent:0,status:'active',completedAt:null,hasTestAttempts:false};
describe("simple erroneous assignment removal",()=>{
 it("does not read or mutate for each row until an operator clicks one assignment",async()=>{
  render(<><CancelCourseAssignmentButton {...simpleProps}/><CancelCourseAssignmentButton {...simpleProps} enrollmentId="00000000-0000-4000-8000-000000000099"/></>);
  expect(screen.getAllByRole('button',{name:'Удалить курс'})).toHaveLength(2);expect(mock.removalRead).not.toHaveBeenCalled();expect(mock.read).not.toHaveBeenCalled();expect(mock.removalPrepare).not.toHaveBeenCalled();
  mock.removable=true;fireEvent.click(screen.getAllByRole('button',{name:'Удалить курс'})[0]);await screen.findByRole('alertdialog');expect(mock.removalRead).toHaveBeenCalledExactlyOnceWith(scope,enrollment);
 });
 async function openRemoval(){fireEvent.click(await screen.findByRole('button',{name:'Удалить курс'}));await screen.findByRole('alertdialog');}
 it("offers Delete with one confirmation and no legal basis fields or mutation before confirmation",async()=>{
  mock.removable=true;render(<CancelCourseAssignmentButton {...simpleProps}/>);await openRemoval();
  expect(screen.queryByLabelText('Пункт или реквизиты основания')).toBeNull();expect(mock.removalPrepare).not.toHaveBeenCalled();expect(mock.removalRun).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Удалить назначение'}));await waitFor(()=>expect(props.onCancelled).toHaveBeenCalledTimes(1));
  expect(mock.removalPrepare).toHaveBeenCalledExactlyOnceWith(scope,expect.objectContaining({can_remove:true,ref:expect.objectContaining({enrollment_id:enrollment})}));expect(mock.prepare).not.toHaveBeenCalled();
 });
 it("cancels the confirmation without changing any assignment",async()=>{
  mock.removable=true;render(<CancelCourseAssignmentButton {...simpleProps}/>);await openRemoval();fireEvent.click(screen.getByRole('button',{name:'Отмена'}));expect(mock.removalRun).not.toHaveBeenCalled();expect(props.onCancelled).not.toHaveBeenCalled();
 });
 it("reuses one prepared request after an unknown mutation result",async()=>{
  mock.removable=true;mock.removalRun.mockRejectedValueOnce(new AssignmentRemovalError('DEPENDENCY_UNAVAILABLE',true)).mockResolvedValueOnce({cancelled:true,retained:true});
  render(<CancelCourseAssignmentButton {...simpleProps}/>);await openRemoval();fireEvent.click(screen.getByRole('button',{name:'Удалить назначение'}));
  fireEvent.click(await screen.findByRole('button',{name:'Повторить тот же запрос'}));await waitFor(()=>expect(props.onCancelled).toHaveBeenCalledTimes(1));expect(mock.removalPrepare).toHaveBeenCalledTimes(1);expect(mock.removalRun).toHaveBeenCalledTimes(2);
 });
 it("uses the current server history check instead of optimistic zero progress props",async()=>{
  mock.removable=false;render(<CancelCourseAssignmentButton {...simpleProps}/>);fireEvent.click(screen.getByRole('button',{name:'Удалить курс'}));
  expect(await screen.findByRole('button',{name:'Выбрать основание'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Удалить назначение'})).toBeNull();expect(mock.removalPrepare).not.toHaveBeenCalled();
 });
 it("does not substitute legal withdrawal when the removal read fails",async()=>{
  mock.removalRead.mockRejectedValueOnce(new Error('offline'));render(<CancelCourseAssignmentButton {...simpleProps}/>);fireEvent.click(screen.getByRole('button',{name:'Удалить курс'}));
  expect(await screen.findByRole('button',{name:'Проверить назначение'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Выбрать основание'})).toBeNull();mock.removable=true;
  fireEvent.click(screen.getByRole('button',{name:'Проверить назначение'}));expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
 });
 it("requires a new check after stale server CAS and does not report removal",async()=>{
  mock.removable=true;mock.removalRun.mockRejectedValueOnce(new AssignmentRemovalError('SOURCE_CHANGED'));render(<CancelCourseAssignmentButton {...simpleProps}/>);await openRemoval();fireEvent.click(screen.getByRole('button',{name:'Удалить назначение'}));
  expect(await screen.findByRole('button',{name:'Проверить заново'})).toBeInTheDocument();expect(props.onCancelled).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Повторить тот же запрос'})).toBeNull();
 });
 it("does not apply a late removal response to another enrollment",async()=>{
  mock.removable=true;let resolve!:(value:unknown)=>void;mock.removalRun.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const {rerender}=render(<CancelCourseAssignmentButton {...simpleProps}/>);await openRemoval();
  fireEvent.click(screen.getByRole('button',{name:'Удалить назначение'}));await waitFor(()=>expect(mock.removalRun).toHaveBeenCalledTimes(1));rerender(<CancelCourseAssignmentButton {...simpleProps} enrollmentId="00000000-0000-4000-8000-000000000099"/>);resolve({cancelled:true,retained:true});
  await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());expect(props.onCancelled).not.toHaveBeenCalled();
 });
 it("shows an already removed assignment without another mutation or legal form",async()=>{
  mock.removalRead.mockResolvedValueOnce({...removalState(),state:'removed',can_remove:false,can_withdraw:false,reason:'ALREADY_REMOVED'});render(<CancelCourseAssignmentButton {...simpleProps}/>);fireEvent.click(screen.getByRole('button',{name:'Удалить курс'}));
  expect(await screen.findByText('Назначение удалено · история сохранена')).toBeInTheDocument();expect(mock.removalRun).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Выбрать основание'})).toBeNull();
 });
});
