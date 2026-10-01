import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createStudentLoginLinkHandler } from "../_shared/student-login-link.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
Deno.serve(createStudentLoginLinkHandler({
  db,
  authenticate: async (authorization) => {
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    return { userId: data.user?.id ?? null, error };
  },
}));
