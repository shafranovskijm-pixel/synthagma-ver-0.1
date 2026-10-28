import { supabase } from "@/integrations/supabase/client";
import { createCourseFileModeGateway, type CourseFileModePort } from "@/lib/courseFileConsumer";
type OrdinaryModeRPC = { rpc(name: "read_course_exact_file_delivery_mode", args: { p_course_id: string; p_access_mode: string }): { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> } };
const port: CourseFileModePort = { async read(args, signal) { return await (supabase as unknown as OrdinaryModeRPC).rpc("read_course_exact_file_delivery_mode", args).abortSignal(signal); } };
export const readCourseFileDeliveryMode = createCourseFileModeGateway(port);
