import { Blob as NodeBlob } from "node:buffer";
import { createHash,webcrypto } from "node:crypto";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
const mock=vi.hoisted(()=>({rpc:vi.fn(),abortSignal:vi.fn(),invoke:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:mock.rpc,functions:{invoke:mock.invoke}}}));
import { exactPlatformCourseFile } from "../exactPlatformCourseFile";
import { PLATFORM_SOURCE_FILE_ORG,PLATFORM_SOURCE_FILE_SCOPE,type SelectedPlatformFileReference } from "@/lib/exactPlatformCourseFile";
const id=(n:number)=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const selection:SelectedPlatformFileReference={actorId:id(1),marketplaceId:id(2),courseId:id(3),proposalId:id(4),proposalEditionSha256:"a".repeat(64),referenceKind:"course_document",referenceId:id(5)};
const bytes=new TextEncoder().encode("%PDF-1.7\nSYNTHETIC selected adapter\n");
const sha=createHash("sha256").update(bytes).digest("hex");
const metadata=()=>({schema_version:1,actor_id:selection.actorId,organization_id:PLATFORM_SOURCE_FILE_ORG,marketplace_id:selection.marketplaceId,course_id:selection.courseId,proposal_id:selection.proposalId,proposal_edition_sha256:selection.proposalEditionSha256,reference_kind:selection.referenceKind,reference_id:selection.referenceId,state:"bytes_sealed" as const,receipt:{receipt_id:id(6),captured_edition_id:id(7),source_org_version_id:null,file_bytes_sha256:sha,byte_length:bytes.length},delivery_scope:PLATFORM_SOURCE_FILE_SCOPE});
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("Blob",NodeBlob);vi.stubGlobal("crypto",webcrypto);vi.stubGlobal("URL",class extends URL{static createObjectURL(){return "blob:adapter-verified";}static revokeObjectURL(){}});mock.rpc.mockImplementation(()=>({abortSignal:mock.abortSignal}));mock.abortSignal.mockResolvedValue({data:metadata(),error:null});mock.invoke.mockResolvedValue({data:new Blob([bytes]),error:null,response:new Response(null,{status:200,headers:{"Content-Type":"application/octet-stream","Content-Length":String(bytes.length),"X-File-Receipt-Id":id(6),"X-File-SHA256":sha}})});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("ordinary selected proposal adapter",()=>{
 it("uses the fixed metadata RPC with the five explicit selected arguments only",async()=>{const abort=new AbortController();await exactPlatformCourseFile.context(selection,abort.signal);expect(mock.rpc).toHaveBeenCalledTimes(1);expect(mock.rpc).toHaveBeenCalledWith("read_platform_course_proposal_file_context",{p_marketplace_id:selection.marketplaceId,p_proposal_id:selection.proposalId,p_expected_proposal_edition_sha256:selection.proposalEditionSha256,p_reference_kind:selection.referenceKind,p_reference_id:selection.referenceId});expect(mock.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));expect(mock.invoke).not.toHaveBeenCalled();});
 it("reads only that immutable receipt through the existing ordinary binary route",async()=>{const abort=new AbortController();const context=await exactPlatformCourseFile.context(selection,abort.signal);if(context.state!=="bytes_sealed")throw Error("synthetic sealed context missing");const lease=await exactPlatformCourseFile.bytes(selection,context,abort.signal);expect(mock.invoke).toHaveBeenCalledTimes(1);expect(mock.invoke).toHaveBeenCalledWith("platform-course-file/read",{body:{receipt_id:id(6)},signal:expect.any(AbortSignal),timeout:45000});expect(lease.url).toBe("blob:adapter-verified");lease.release();});
});
