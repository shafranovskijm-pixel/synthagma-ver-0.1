import { supabase } from "@/integrations/supabase/client";
import { createPublicationGateway, type PublicationApiPort } from "@/lib/platformCoursePublication";

// These five declarations are supplied alongside the backend source contract.
// No untyped RPC/name cast and no direct access to private evidence tables.
const api: PublicationApiPort = {
  readiness: args => supabase.rpc("read_platform_course_publication_readiness", args),
  context: args => supabase.rpc("read_platform_course_publication_review_context", args),
  submit: args => supabase.rpc("submit_platform_course_publication_proposal", args),
  review: args => supabase.rpc("record_platform_course_publication_review", args),
  publish: args => supabase.rpc("publish_platform_course_proposal", args),
};
export const platformCoursePublication = createPublicationGateway(api);
