import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createStudentCredentialsHandler } from "../_shared/student-credentials.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { autoRefreshToken: false, persistSession: false },
});
serve(createStudentCredentialsHandler("update", {
  db: admin,
  authenticate: async authorization => {
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    return { userId: data?.user?.id ?? null, error };
  },
  updateAuthUser: async (userId, values) => admin.auth.admin.updateUserById(userId, values),
}));
