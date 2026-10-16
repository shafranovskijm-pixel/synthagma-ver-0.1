import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createSubscriptionCheckoutHandler } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(createSubscriptionCheckoutHandler({
  db: admin, supabaseUrl: url, fetch: (url, init) => fetch(url, init),
  authorize: async (authorization, organizationId) => {
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await caller.auth.getUser();
    if (error || !data.user) return false;
    const [access, active] = await Promise.all([
      caller.rpc("can_access_organization", { _organization_id: organizationId, _permission: "settings.write" }),
      caller.rpc("account_deletion_access_allowed"),
    ]);
    if (access.error || active.error) throw new Error("Payment access check unavailable");
    return access.data === true && active.data === true;
  },
}));
