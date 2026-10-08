import { describe, expect, it, vi } from "vitest";
import { createAccountDeletionHandler, type AccountDeletionDependencies } from "./account-deletion";
const uid="11111111-1111-4111-8111-111111111111";
const requestId="22222222-2222-4222-8222-222222222222";
const planToken="a".repeat(64), statusToken="b".repeat(64);
const actor={id:uid,email:"technical-student@example.invalid",hasVerifiedMfa:false};
function setup() {
 let state="planned", exists=true;
 const calls: string[]=[];
 const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{
  calls.push(name);
  if(name==="account_deletion_prepare")return{data:{canDelete:true,requestId,expiresAt:"2099-01-01T00:00:00Z",categories:[],blockers:[]},error:null};
  if(name==="account_deletion_begin"){state="cleanup_pending";return{data:{requestId,receiptHash:"receipt-hash"},error:null};}
  if(name==="account_deletion_work")return{data:state==="planned"?{code:"NOT_CONFIRMED"}:state==="deleted"?{status:state}:{status:state,userId:uid,files:[{bucket:"avatars",path:uid+"/photo.jpg"}]},error:null};
  if(name==="account_deletion_complete")state="deleted";
  if(name==="account_deletion_status")return{data:{status:state,requestId,...(state==="deleted"?{completedAt:"2026-10-07T00:00:00Z"}:{})},error:null};
  return{data:{erased:true},error:null};
 });
 const deps:AccountDeletionDependencies={
  authenticate:vi.fn(async()=>actor),reauthenticate:vi.fn(async()=>true),rpc,
  revoke:vi.fn(async()=>{calls.push("ban");}),removeFiles:vi.fn(async()=>{calls.push("remove");}),
  deleteAuthUser:vi.fn(async()=>{calls.push("auth-delete");exists=false;}),authUserExists:vi.fn(async()=>exists),
  randomToken:vi.fn().mockReturnValueOnce(planToken).mockReturnValueOnce(statusToken),hashToken:async t=>"hash:"+t,
 };
 const call=(body:unknown,auth=true)=>createAccountDeletionHandler(deps)(new Request("https://example.invalid",{method:"POST",headers:auth?{authorization:"Bearer verified"}:{},body:JSON.stringify(body)}));
 const confirm=()=>call({action:"confirm",planToken,password:"technical-password",confirmation:"DELETE_MY_ACCOUNT_AND_PERSONAL_DATA",consentVersion:"full-personal-data-v1"});
 return{deps,call,confirm,calls,rpc,setState:(s:string)=>{state=s;}};
}
describe("self-account deletion security and durable outcomes",()=>{
 it("rejects unauthenticated preview before creating any plan",async()=>{
  const t=setup();vi.mocked(t.deps.authenticate).mockResolvedValue(null);
  expect((await t.call({action:"preview"})).status).toBe(401);expect(t.rpc).not.toHaveBeenCalled();
 });
 it.each(["user_id","organization_id","viewAs","email"])("never accepts a target override %s",async key=>{
  const t=setup();expect((await t.call({action:"preview",[key]:uid})).status).toBe(400);expect(t.rpc).not.toHaveBeenCalled();
 });
 it("binds preview to verified caller and exposes separate random capabilities",async()=>{
  const t=setup();const data=await(await t.call({action:"preview"})).json();
  expect(t.rpc).toHaveBeenCalledWith("account_deletion_prepare",{p_user_id:uid,p_plan_hash:"hash:"+planToken,p_receipt_hash:"hash:"+statusToken,p_consent_version:"full-personal-data-v1"});
  expect(data).toMatchObject({revision:"account-deletion-v2",consentVersion:"full-personal-data-v1",planToken,statusToken,requestId});
 });
 it("does not issue capabilities for a blocked plan",async()=>{
  const t=setup();t.rpc.mockResolvedValueOnce({data:{canDelete:false,requestId:null,expiresAt:null,categories:[],blockers:[{code:"RETENTION_POLICY_REQUIRED",message:"docs"}]},error:null});
  expect(await(await t.call({action:"preview"})).json()).toMatchObject({canDelete:false,planToken:null,statusToken:null});
 });
 it("does not allow password-only confirmation for an MFA user",async()=>{
  const t=setup();vi.mocked(t.deps.authenticate).mockResolvedValue({...actor,hasVerifiedMfa:true});
  expect((await t.confirm()).status).toBe(403);expect(t.deps.reauthenticate).not.toHaveBeenCalled();expect(t.rpc).not.toHaveBeenCalled();
 });
 it("wrong password cannot begin deletion or remove files",async()=>{
  const t=setup();vi.mocked(t.deps.reauthenticate).mockResolvedValue(false);
  expect((await t.confirm()).status).toBe(403);expect(t.rpc).not.toHaveBeenCalled();expect(t.deps.deleteAuthUser).not.toHaveBeenCalled();
 });
 it("requires explicit confirmation text",async()=>{
  const t=setup();expect((await t.call({action:"confirm",planToken,password:"x",confirmation:"YES",consentVersion:"full-personal-data-v1"})).status).toBe(409);expect(t.rpc).not.toHaveBeenCalled();
 });
 it.each([undefined,"account-deletion-v1","full-personal-data-v0"])("rejects legacy/missing consent %s before password verification or mutation",async consentVersion=>{
  const t=setup();const response=await t.call({action:"confirm",planToken,password:"secret",consentVersion,confirmation:"DELETE_MY_ACCOUNT"});
  expect(response.status).toBe(409);expect(await response.json()).toMatchObject({code:"CONSENT_REQUIRED"});
  expect(t.deps.reauthenticate).not.toHaveBeenCalled();expect(t.rpc).not.toHaveBeenCalled();expect(t.deps.revoke).not.toHaveBeenCalled();
 });
 it("shows warning and retained exceptions for the current consent",async()=>{
  const t=setup();const data=await(await t.call({action:"preview"})).json();expect(data.warning).toContain("необратимо");expect(data.warning).toContain("резервные копии");
 });
 it("a legacy receipt cannot escalate into v2 deletion",async()=>{
  const t=setup();t.rpc.mockResolvedValueOnce({data:{code:"CONSENT_REQUIRED"},error:null});
  expect((await t.call({action:"resume",requestId,statusToken},false)).status).toBe(409);expect(t.deps.revoke).not.toHaveBeenCalled();
 });
 it("returns expired/changed plans without destructive calls",async()=>{
  const t=setup();t.rpc.mockResolvedValueOnce({data:{code:"PLAN_EXPIRED"},error:null});
  expect((await t.confirm()).status).toBe(409);expect(t.deps.revoke).not.toHaveBeenCalled();
 });
 it("orders storage removal, data scrub, Auth deletion and verification before completion",async()=>{
  const t=setup();expect(await(await t.confirm()).json()).toMatchObject({status:"deleted",requestId});
  expect(t.calls).toEqual(["account_deletion_begin","account_deletion_work","ban","remove","account_deletion_erase_data","auth-delete","account_deletion_complete","account_deletion_status"]);
  expect(t.deps.authUserExists).toHaveBeenCalledTimes(3);
 });
 it("a storage failure is pending, never Auth-deleted or reported completed",async()=>{
  const t=setup();vi.mocked(t.deps.removeFiles).mockRejectedValue(new Error("sensitive-path"));
  const response=await t.confirm();expect(response.status).toBe(202);const text=await response.text();expect(text).toContain("cleanup_pending");expect(text).not.toContain("sensitive-path");expect(t.deps.deleteAuthUser).not.toHaveBeenCalled();
 });
 it("a database scrub failure is pending and leaves Auth for a safe retry",async()=>{
  const t=setup();const original=t.rpc.getMockImplementation()!;
  t.rpc.mockImplementation(async(n,a)=>n==="account_deletion_erase_data"?{data:null,error:new Error("db secret")}:original(n,a));
  expect((await t.confirm()).status).toBe(202);expect(t.deps.deleteAuthUser).not.toHaveBeenCalled();
 });
 it("Auth deletion failure remains pending",async()=>{
  const t=setup();vi.mocked(t.deps.deleteAuthUser).mockRejectedValue(new Error("failed"));
  expect((await t.confirm()).status).toBe(202);expect(t.calls).not.toContain("account_deletion_complete");
 });
 it("does not trust deleteAuthUser success without independent absence verification",async()=>{
  const t=setup();vi.mocked(t.deps.deleteAuthUser).mockResolvedValue(undefined);vi.mocked(t.deps.authUserExists).mockResolvedValue(true);
  expect((await t.confirm()).status).toBe(202);expect(t.calls).not.toContain("account_deletion_complete");
 });
 it("read-only status works after logout and returns no personal data",async()=>{
  const t=setup();t.setState("deleted");const data=await(await t.call({action:"status",requestId,statusToken},false)).json();
  expect(data.status).toBe("deleted");expect(t.deps.authenticate).not.toHaveBeenCalled();expect(t.deps.removeFiles).not.toHaveBeenCalled();expect(data).not.toHaveProperty("userId");expect(data).not.toHaveProperty("files");
 });
 it("receipt possession cannot start an unconfirmed plan",async()=>{
  const t=setup();expect((await t.call({action:"resume",requestId,statusToken},false)).status).toBe(409);expect(t.deps.revoke).not.toHaveBeenCalled();
 });
 it("repeated resume after completion performs no mutations",async()=>{
  const t=setup();t.setState("deleted");expect((await t.call({action:"resume",requestId,statusToken},false)).status).toBe(200);expect(t.deps.revoke).not.toHaveBeenCalled();expect(t.deps.deleteAuthUser).not.toHaveBeenCalled();
 });
 it("resumes a pending request without an Auth session",async()=>{
  const t=setup();t.setState("cleanup_pending");expect(await(await t.call({action:"resume",requestId,statusToken},false)).json()).toMatchObject({status:"deleted"});expect(t.deps.authenticate).not.toHaveBeenCalled();
 });
 it("does not expose raw errors or credentials",async()=>{
  const t=setup();vi.mocked(t.deps.authenticate).mockRejectedValue(new Error("secret jwt"));const text=await(await t.confirm()).text();expect(text).not.toContain("secret");expect(text).not.toContain("technical-password");
 });
});
