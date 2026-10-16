import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createTbankWebhookHandler } from "./handler.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(createTbankWebhookHandler(db));
