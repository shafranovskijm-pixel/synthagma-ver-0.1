import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createMailingReportHandler } from "./handler.ts";

Deno.serve(createMailingReportHandler({
  env: (key) => Deno.env.get(key),
  createAdmin: () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
}));
