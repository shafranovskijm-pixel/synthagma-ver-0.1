import { supabase } from "@/integrations/supabase/client";
import { createCourseExactFileGateway, type CourseExactFileRPC, type CourseExactFileRPCName } from "@/lib/courseExactFileDelivery";

// These proposed RPCs are not in stock generated types until the separately reviewed SQL is applied.
// The cast describes the ordinary SDK call; it adds no credential or authorization path.
type OrdinaryRPCClient = {
  rpc(name: CourseExactFileRPCName, args: Readonly<Record<string, string>>): {
    abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
  };
};
const ordinaryClient: CourseExactFileRPC = {
  async call(name, args, signal) {
    return await (supabase as unknown as OrdinaryRPCClient).rpc(name, args).abortSignal(signal);
  },
};

export const courseExactFileGateway = createCourseExactFileGateway(ordinaryClient);
