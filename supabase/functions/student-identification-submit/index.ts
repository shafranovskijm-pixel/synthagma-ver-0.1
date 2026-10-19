import { createClient } from "npm:@supabase/supabase-js@2.90.1";
import { identificationSubmitRequest } from "../_shared/identification-submit.ts";

Deno.serve(request => identificationSubmitRequest(request, {
  configured: !!Deno.env.get("SUPABASE_URL") && !!Deno.env.get("SUPABASE_ANON_KEY") && !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  createCaller: authorization => {
    // A stateless per-request client with a fixed original Authorization header.
    // Postgrest also pins that header explicitly across its asynchronous getter.
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
      global: {headers: {Authorization: authorization}},
    });
    return {auth: client.auth, storage: client.storage,
      rpc: (name, args) => client.rpc(name, args).setHeader("Authorization", authorization)};
  },
  commit: args => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
  }).rpc("uc_commit_identification_photo", args),
}));
