import { Blob as NodeBlob } from "node:buffer";
import { createHash,webcrypto } from "node:crypto";
import { afterEach,beforeEach,describe,expect,it,vi,type Mock } from "vitest";
import { createExactPlatformCourseFileGateway,parseSelectedPlatformFileContext,selectedPlatformFileFromReview,PLATFORM_SOURCE_FILE_ORG,PLATFORM_SOURCE_FILE_SCOPE,type SelectedPlatformFileReference,type SealedPlatformFileContext } from "../exactPlatformCourseFile";
import { parsedContext } from "./platformCoursePublication.fixtures";
const id=(n:number)=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const PDF=new TextEncoder().encode("%PDF-1.7\nSYNTHETIC selected proposal only\n");
const hash=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const selected:SelectedPlatformFileReference={actorId:id(1),marketplaceId:id(2),courseId:id(3),proposalId:id(4),proposalEditionSha256:"a".repeat(64),referenceKind:"course_document",referenceId:id(5)};
const sealed=():SealedPlatformFileContext=>({schema_version:1,actor_id:selected.actorId,organization_id:PLATFORM_SOURCE_FILE_ORG,marketplace_id:selected.marketplaceId,course_id:selected.courseId,proposal_id:selected.proposalId,proposal_edition_sha256:selected.proposalEditionSha256,reference_kind:selected.referenceKind,reference_id:selected.referenceId,state:"bytes_sealed",receipt:{receipt_id:id(6),captured_edition_id:id(7),source_org_version_id:null,file_bytes_sha256:hash(PDF),byte_length:PDF.length},delivery_scope:PLATFORM_SOURCE_FILE_SCOPE});
function binary(context=sealed(),bytes=PDF,extra:Record<string,string>={}){return{data:new Blob([new Uint8Array(bytes).buffer]),error:null,response:new Response(null,{status:200,headers:{"Content-Type":"application/octet-stream","Content-Length":String(context.receipt.byte_length),"X-File-Receipt-Id":context.receipt.receipt_id,"X-File-SHA256":context.receipt.file_bytes_sha256,...extra}})};}
let createURL:Mock<(blob:Blob|MediaSource)=>string>,revokeURL:Mock<(url:string)=>void>;
beforeEach(()=>{vi.stubGlobal("Blob",NodeBlob);vi.stubGlobal("crypto",webcrypto);createURL=vi.fn<(blob:Blob|MediaSource)=>string>(()=>"blob:verified-selected-proposal");revokeURL=vi.fn<(url:string)=>void>();vi.stubGlobal("URL",class extends URL{static createObjectURL(value:Blob|MediaSource){return createURL(value);}static revokeObjectURL(value:string){revokeURL(value);}});});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("explicit saved-proposal source receipt",()=>{
 it("selects the displayed historical proposal edition, not the current edition or readiness proposal",()=>{
  const c=parsedContext();const p=c.proposal!;p.id=selected.proposalId;p.editionSha256="b".repeat(64);p.isCurrent=false;p.source.fileBindings=[{kind:"course_document",referenceId:selected.referenceId,state:"unconfirmed"}];
  const value=selectedPlatformFileFromReview(c,"course_document",selected.referenceId);expect(value.proposalId).toBe(selected.proposalId);expect(value.proposalEditionSha256).toBe("b".repeat(64));expect(value.proposalEditionSha256).not.toBe(c.currentEditionSha256);
  p.source.fileBindings.push({...p.source.fileBindings[0]});expect(()=>selectedPlatformFileFromReview(c,"course_document",selected.referenceId)).toThrow();
 });
 it("holds a missing/foreign reference instead of selecting a first binding",()=>{
  const c=parsedContext();c.proposal!.source.fileBindings=[{kind:"course_document",referenceId:id(99),state:"unconfirmed"}];expect(()=>selectedPlatformFileFromReview(c,"course_document",selected.referenceId)).toThrow();
  c.proposal=null;expect(()=>selectedPlatformFileFromReview(c,"course_document",id(99))).toThrow();
 });
 it.each([{actor_id:id(9)},{organization_id:id(9)},{course_id:id(9)},{marketplace_id:id(9)},{proposal_id:id(9)},{proposal_edition_sha256:"b".repeat(64)},{reference_id:id(9)},{reference_kind:"lesson_attachment"},{delivery_scope:"learner"},{url:"https://source.invalid/raw.pdf"}])("rejects mismatched/extra metadata %j",change=>{expect(()=>parseSelectedPlatformFileContext({...sealed(),...change},selected)).toThrow();});
 it("preserves an explicit held/null result and never requests bytes for it",async()=>{
  const bytes=vi.fn();const gateway=createExactPlatformCourseFileGateway({context:async()=>({data:{...sealed(),state:"held",receipt:null},error:null}),bytes});const result=await gateway.context(selected,new AbortController().signal);expect(result.state).toBe("held");expect(bytes).not.toHaveBeenCalled();
 });
 it("sends only explicit proposal/listing/edition/reference fields and no actor/source URL",async()=>{
  const context=vi.fn().mockResolvedValue({data:sealed(),error:null});await createExactPlatformCourseFileGateway({context,bytes:vi.fn()}).context(selected,new AbortController().signal);
  expect(context.mock.calls[0][0]).toEqual({p_marketplace_id:selected.marketplaceId,p_proposal_id:selected.proposalId,p_expected_proposal_edition_sha256:selected.proposalEditionSha256,p_reference_kind:selected.referenceKind,p_reference_id:selected.referenceId});
 });
 it("creates an exact PDF lease only after header and full-byte integrity, then revokes once",async()=>{
  const bytes=vi.fn().mockResolvedValue(binary());const gateway=createExactPlatformCourseFileGateway({context:vi.fn(),bytes});const abort=new AbortController();const lease=await gateway.bytes(selected,sealed(),abort.signal);
  expect(bytes).toHaveBeenCalledWith(id(6),expect.any(AbortSignal));expect(lease.previewKind).toBe("pdf");expect(lease.mime).toBe("application/pdf");expect(createURL).toHaveBeenCalledTimes(1);expect(createURL.mock.calls[0][0]).toBeInstanceOf(Blob);
  const copy=lease.copyVerifiedPdfBytes();expect(Array.from(copy)).toEqual(Array.from(PDF));copy.fill(0);expect(Array.from(lease.copyVerifiedPdfBytes())).toEqual(Array.from(PDF));
  abort.abort();expect(()=>lease.copyVerifiedPdfBytes()).toThrow();lease.release();expect(revokeURL).toHaveBeenCalledTimes(1);expect(revokeURL).toHaveBeenCalledWith("blob:verified-selected-proposal");
 });
 it.each([{"X-File-Receipt-Id":id(99)},{"X-File-SHA256":"b".repeat(64)},{"Content-Length":"999"},{"Content-Type":"text/html"}])("rejects mismatched binary headers before a lease %j",headers=>{
  const gateway=createExactPlatformCourseFileGateway({context:vi.fn(),bytes:async()=>binary(sealed(),PDF,headers)});return expect(gateway.bytes(selected,sealed(),new AbortController().signal)).rejects.toThrow().then(()=>expect(createURL).not.toHaveBeenCalled());
 });
 it("rejects changed bytes even when server headers repeat the selected receipt",async()=>{
  const changed=PDF.slice();changed[changed.length-2]^=1;const gateway=createExactPlatformCourseFileGateway({context:vi.fn(),bytes:async()=>binary(sealed(),changed)});await expect(gateway.bytes(selected,sealed(),new AbortController().signal)).rejects.toThrow();expect(createURL).not.toHaveBeenCalled();
 });
 it("keeps valid HTML bytes unsupported, with no Blob URL, Office or raw fallback",async()=>{
  const html=new TextEncoder().encode('<html><script>synthetic</script></html>');const c=sealed();const exact={...c,receipt:{...c.receipt,file_bytes_sha256:hash(html),byte_length:html.length}};const gateway=createExactPlatformCourseFileGateway({context:vi.fn(),bytes:async()=>binary(exact,html)});await expect(gateway.bytes(selected,exact,new AbortController().signal)).rejects.toThrow();expect(createURL).not.toHaveBeenCalled();
 });
 it("does not create a URL after cancellation while Blob readback is delayed",async()=>{
  let release!:()=>void;const wait=new Promise<void>(yes=>{release=yes;});class SlowBlob extends Blob{async arrayBuffer(){await wait;return await super.arrayBuffer();}}
  const reply=binary();reply.data=new SlowBlob([PDF]);const gateway=createExactPlatformCourseFileGateway({context:vi.fn(),bytes:async()=>reply});const abort=new AbortController();const pending=gateway.bytes(selected,sealed(),abort.signal);abort.abort();await expect(pending).rejects.toBeDefined();release();await Promise.resolve();expect(createURL).not.toHaveBeenCalled();
 });
 it("bounds a metadata transport that ignores cancellation without issuing bytes",async()=>{
  vi.useFakeTimers();const bytes=vi.fn();const gateway=createExactPlatformCourseFileGateway({context:()=>new Promise(()=>{}),bytes});const pending=gateway.context(selected,new AbortController().signal);const rejected=expect(pending).rejects.toThrow();await vi.advanceTimersByTimeAsync(20001);await rejected;expect(bytes).not.toHaveBeenCalled();expect(createURL).not.toHaveBeenCalled();
 });
 it("bounds delayed full-byte digest before any local URL is created",async()=>{
  vi.useFakeTimers();vi.stubGlobal("crypto",{subtle:{digest:()=>new Promise(()=>{})}});const gateway=createExactPlatformCourseFileGateway({context:vi.fn(),bytes:async()=>binary()});const pending=gateway.bytes(selected,sealed(),new AbortController().signal);const rejected=expect(pending).rejects.toThrow();await vi.advanceTimersByTimeAsync(45001);await rejected;expect(createURL).not.toHaveBeenCalled();
 });
});
