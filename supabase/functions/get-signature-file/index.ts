import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signatureFileRequest } from "../_shared/signature-file-broker.ts";

serve(req => signatureFileRequest(req, {
  createDb: () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
  serviceConfigured: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
}));
