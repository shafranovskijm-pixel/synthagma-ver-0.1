import { supabase } from "@/integrations/supabase/client";
import { createExactPlatformCourseFileGateway, type SelectedPlatformFilePort } from "@/lib/exactPlatformCourseFile";
// Ordinary SDK authority only. These proposed source-reader RPC types do not add
// an auth role, a secret, a service client or direct access to private evidence.
type SourceContextRPC = { rpc(name:"read_platform_course_proposal_file_context",args:Parameters<SelectedPlatformFilePort["context"]>[0]):{abortSignal(signal:AbortSignal):PromiseLike<{data:unknown;error:unknown}>} };
const port:SelectedPlatformFilePort={
  async context(args,signal){return await(supabase as unknown as SourceContextRPC).rpc("read_platform_course_proposal_file_context",args).abortSignal(signal);},
  async bytes(receiptId,signal){return await supabase.functions.invoke<Blob>("platform-course-file/read",{body:{receipt_id:receiptId},signal,timeout:45_000});},
};
export const exactPlatformCourseFile=createExactPlatformCourseFileGateway(port);
