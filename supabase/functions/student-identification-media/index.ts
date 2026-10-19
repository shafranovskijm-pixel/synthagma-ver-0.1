import { createClient } from "npm:@supabase/supabase-js@2.90.1";
import { identificationMediaRequest } from "../_shared/identification-media.ts";

Deno.serve(request => identificationMediaRequest(request, {
  configured: !!Deno.env.get("SUPABASE_URL") && !!Deno.env.get("SUPABASE_ANON_KEY"),
  createCaller: authorization => {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
      global: {headers: {Authorization: authorization}},
    });
    return {auth: client.auth, storage: client.storage,
      rpc: (name, args) => client.rpc(name, args).setHeader("Authorization", authorization)};
  },
}));
