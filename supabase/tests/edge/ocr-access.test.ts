// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as privileged from "../../functions/_shared/privileged-access";
import * as ocr from "../../functions/_shared/ocr-access";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const actor=id(1),student=id(2),org=id(3),documentId=id(4),path=`${student}/passport_qa.pdf`;
const sourceRow={id:documentId,organization_id:org,user_id:student,type:"passport",file_path:path};
const primary={documentId,organizationId:org,studentUserId:student,doc_type:"passport"};
type Options={invalid?:boolean;revokedAt?:number;denied?:string;denyAtRead?:number;rpcError?:boolean;rowAccess?:boolean;ambiguous?:boolean;sourceChangedAt?:number;plan?:string;downloadError?:boolean;bytes?:Uint8Array;size?:number;providerStatus?:number;providerContent?:unknown;fetchError?:boolean;hang?:boolean};
function actualHandler(options:Options={}){
 let reads=0,authChecks=0;const mutations=vi.fn(),logs=vi.fn();
 const rpc=vi.fn(async(name:string)=>({data: !(options.denied===name || options.denyAtRead===reads),error:options.rpcError?{message:"Synthetic authority unavailable"}:null}));
 const userFrom=vi.fn((table:string)=>{
  const filters:Record<string,unknown>={};const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q;},
   limit:async()=>{reads++;let row={...sourceRow};if(options.sourceChangedAt===reads)row={...row,file_path:`${student}/replaced_qa.pdf`};
    const rows=options.rowAccess===false || Object.entries(filters).some(([k,v])=>(row as any)[k]!==v)?[]:[row];return {data:options.ambiguous?[...rows,...rows]:rows,error:null};},
   maybeSingle:async()=>({data:table==="organizations"?{subscription_plan:options.plan??"professional"}:null,error:null}),
   insert:mutations,update:mutations,delete:mutations};return q;
 });
 const adminFrom=vi.fn((table:string)=>{
  if(table!=="account_deletion_revocations")throw new Error("Service client attempted private source lookup");
  authChecks++;const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:options.revokedAt===authChecks?{user_id:actor}:null,error:null})};return q;
 });
 const download=vi.fn(async()=>{const blob=new Blob([options.bytes??new TextEncoder().encode("%PDF-1.4\nSynthetic QA only")]);
  return {data:options.size===undefined?blob:{size:options.size,arrayBuffer:()=>blob.arrayBuffer()},error:options.downloadError?{message:"Synthetic storage denied"}:null};});
 const storageFrom=vi.fn(()=>({download,upload:mutations,remove:mutations}));
 const admin={auth:{getUser:vi.fn(async()=>({data:{user:options.invalid?null:{id:actor}},error:null}))},from:adminFrom,rpc:vi.fn(()=>{throw Error("Service authority forbidden");}),storage:{from:vi.fn(()=>{throw Error("Service storage forbidden");})}};
 const user={from:userFrom,rpc,storage:{from:storageFrom}};
 const createClient=vi.fn((_url:string,key:string)=>key==="synthetic-service"?admin:user);
 const fetch=vi.fn(async(_url:string,init:any)=>{
  if(options.hang)return await new Promise<Response>((_resolve,reject)=>init.signal.addEventListener("abort",()=>reject(new Error("Synthetic timeout"))));
  if(options.fetchError)throw Error("Synthetic transport failure");
  return new Response(JSON.stringify({choices:[{message:{content:options.providerContent??JSON.stringify({passport_series:"0000",passport_number:"000000",passport_issue_date:"01.10.2026",passport_issued_by:"Synthetic QA issuer",passport_department_code:"000000",birth_date:"2000-01-01",confidence:0.9,raw:"MUST-NOT-RETURN",extra:"MUST-NOT-RETURN"})}}]}),{status:options.providerStatus??200});
 });
 let handler!:(request:Request)=>Promise<Response>;
 const source=readFileSync("supabase/functions/ocr-snils/index.ts","utf8"),ast=ts.createSourceFile("handler.ts",source,ts.ScriptTarget.Latest,true);
 const ranges=ast.statements.filter(ts.isImportDeclaration).map(s=>({start:s.getFullStart(),end:s.end}));
 const stripped=ranges.sort((a,b)=>b.start-a.start).reduce((s,r)=>s.slice(0,r.start)+s.slice(r.end),source);
 const code=ts.transpileModule(stripped,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const deps={...privileged,...ocr,createClient,fetch,console:{error:logs},Deno:{serve:(f:typeof handler)=>{handler=f;},env:{get:(key:string)=>key==="SUPABASE_SERVICE_ROLE_KEY"?"synthetic-service":key==="SUPABASE_ANON_KEY"?"synthetic-anon":key==="SUPABASE_URL"?"https://synthetic.invalid":"synthetic-ai-key"}}};
 new Function(...Object.keys(deps),code)(...Object.values(deps));
 return {handler,fetch,download,mutations,rpc,userFrom,adminFrom,storageFrom,createClient,logs};
}
const req=(body:unknown=primary,token:string|null="synthetic-user",method="POST")=>new Request("https://synthetic.invalid/ocr",{method,headers:token?{Authorization:`Bearer ${token}`}:{},...(method==="POST"?{body:JSON.stringify(body)}:{})});
afterEach(()=>vi.useRealTimers());
describe("actual OCR handler original caller boundary",()=>{
 it.each([
  ["missing token",{},null,401],["invalid token",{invalid:true},"synthetic-user",401],["revoked account",{revokedAt:1},"synthetic-user",403],
  ["foreign/hidden source",{rowAccess:false},"synthetic-user",404],["ambiguous legacy source",{ambiguous:true},"synthetic-user",409],
  ["read-only teacher/platform viewer/no write",{denied:"uc_document_has_action"},"synthetic-user",403],
  ["no student write/learner/company",{denied:"can_access_organization"},"synthetic-user",403],
  ["other assigned group",{denied:"uc_document_student_scope_allowed"},"synthetic-user",403],
  ["expired/revoked staff action",{denyAtRead:1},"synthetic-user",403],["authority unavailable",{rpcError:true},"synthetic-user",503],
 ] as const)("denies %s before private bytes or AI",async(_label,options,token,status)=>{
  const f=actualHandler(options);const res=await f.handler(req(primary,token));expect(res.status).toBe(status);expect(f.download).not.toHaveBeenCalled();expect(f.fetch).not.toHaveBeenCalled();expect(f.mutations).not.toHaveBeenCalled();
 });
 it("extracts an authorized source using original-user Storage and exact RPCs, without raw extras or writes",async()=>{
  const f=actualHandler();const response=await f.handler(req());expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("no-store");
  const data=await response.json();expect(data).toEqual({documentId,doc_type:"passport",snils:null,birth_date:"2000-01-01",passport_series:"00 00",passport_number:"000000",passport_issue_date:"2026-10-01",passport_issued_by:"Synthetic QA issuer",passport_department_code:"000-000",confidence:0.9});
  expect(f.storageFrom).toHaveBeenCalledWith("student-documents");expect(f.download).toHaveBeenCalledExactlyOnceWith(path);
  expect(f.adminFrom.mock.calls.every(([table])=>table==="account_deletion_revocations")).toBe(true);expect(f.rpc).toHaveBeenCalledTimes(9);
  expect(f.rpc).toHaveBeenCalledWith("uc_document_has_action",{p_org:org,p_action:"write"});expect(f.rpc).toHaveBeenCalledWith("can_access_organization",{_organization_id:org,_permission:"students.write"});expect(f.rpc).toHaveBeenCalledWith("uc_document_student_scope_allowed",{p_org:org,p_user:student});
  expect(f.mutations).not.toHaveBeenCalled();expect(f.logs).not.toHaveBeenCalled();
 });
 it("retains authorized legacy path requests while deriving the original document/type",async()=>{
  const f=actualHandler();expect((await f.handler(req({file_path:path,doc_type:"passport"}))).status).toBe(200);expect(f.userFrom).toHaveBeenCalledWith("student_identity_documents");
 });
 it.each([
  [{...primary,organizationId:id(99)},409],[{...primary,studentUserId:id(99)},409],[{...primary,doc_type:"snils"},409],
  [{...primary,file_path:`${student}/different.pdf`},409],[{documentId:id(99)},404],
  [{file_path:`${student}/../foreign.pdf`},400],[{file_path:`${student}/%2fescape.pdf`},400],[{file_path:"https://foreign.invalid/file.pdf"},400],
  [{...primary,bucket:"foreign"},400],[{documentId:"bad"},400],[{...primary,doc_type:"diploma"},400],[{},400],
 ] as const)("rejects changed/invalid source context %# before private bytes",async(body,status)=>{
  const f=actualHandler();expect((await f.handler(req(body))).status).toBe(status);expect(f.download).not.toHaveBeenCalled();expect(f.fetch).not.toHaveBeenCalled();
 });
 it.each([2,3])("rechecks source and current authority at phase%s",async phase=>{
  for(const options of [{revokedAt:phase},{denyAtRead:phase},{sourceChangedAt:phase}]){
   const f=actualHandler(options);const res=await f.handler(req());expect([403,409]).toContain(res.status);expect(await res.json()).not.toHaveProperty("passport_number");expect(f.fetch).toHaveBeenCalledTimes(phase===2?0:1);expect(f.mutations).not.toHaveBeenCalled();
  }
 });
 it.each([
  [{plan:"free"},403],[{downloadError:true},422],[{size:0},422],[{size:ocr.MAX_OCR_BYTES+1},422],[{bytes:new Uint8Array([1,2,3])},422],
 ] as const)("rejects unsupported plan/bytes before AI %#",async(options,status)=>{
  const f=actualHandler(options);expect((await f.handler(req())).status).toBe(status);expect(f.fetch).not.toHaveBeenCalled();expect(f.mutations).not.toHaveBeenCalled();
 });
 it.each([[{providerStatus:429},429],[{providerStatus:402},402],[{providerStatus:500},502],[{fetchError:true},503],[{providerContent:"not json"},502],[{providerContent:"null"},502]] as const)("returns sanitized provider failure %#",async(options,status)=>{
  const f=actualHandler(options);const res=await f.handler(req());expect(res.status).toBe(status);const text=await res.text();expect(text).not.toContain(path);expect(text).not.toContain("MUST-NOT-RETURN");expect(JSON.stringify(f.logs.mock.calls)).not.toContain(path);expect(f.mutations).not.toHaveBeenCalled();
 });
 it("bounds provider time and aborts a stalled request without returning personal fields",async()=>{
  vi.useFakeTimers();const f=actualHandler({hang:true});const pending=f.handler(req());await vi.waitFor(()=>expect(f.fetch).toHaveBeenCalledOnce());await vi.advanceTimersByTimeAsync(25001);const res=await pending;expect(res.status).toBe(503);expect(await res.json()).not.toHaveProperty("passport_number");
 });
 it.each([["OPTIONS",200],["GET",405]] as const)("answers %s before creating clients",async(method,status)=>{
  const f=actualHandler();expect((await f.handler(req(null,null,method))).status).toBe(status);expect(f.createClient).not.toHaveBeenCalled();expect(f.fetch).not.toHaveBeenCalled();
 });
});
describe("OCR output is candidate data only",()=>{
 it("rejects invalid dates/confidence and omits fields of another document kind and arbitrary provider data",()=>{
  const result=ocr.normalizedOcrResult({birth_date:"2026-02-31",confidence:10,snils:"00000000000",passport_number:"000000",internal:"secret"},{id:documentId,userId:student,organizationId:org,kind:"snils",path});
  expect(result).toMatchObject({snils:"000-000-000 00",passport_number:null,birth_date:null,confidence:null});expect(result).not.toHaveProperty("internal");expect(result).not.toHaveProperty("raw");
 });
 it("supports only fixed canonical identity paths and explicit source requests",()=>{
  expect(()=>ocr.parseOcrInput({file_path:`${student}//invalid.pdf`})).toThrow();expect(()=>ocr.parseOcrInput([])).toThrow();expect(()=>ocr.parseOcrInput({documentId,url:"https://foreign.invalid"})).toThrow();
 });
});
