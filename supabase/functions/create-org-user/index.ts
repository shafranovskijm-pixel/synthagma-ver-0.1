import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createOrgUserHandler } from "../_shared/create-org-user.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

serve(createOrgUserHandler({
  db,
  // Never log passwords, emails, bearer tokens or raw provider errors.
  reportCleanupFailure: (userId, stage) => console.error("create-org-user cleanup incomplete", { userId, stage }),
}));
