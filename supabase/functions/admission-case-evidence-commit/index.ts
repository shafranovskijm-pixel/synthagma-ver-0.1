import { createClient } from "npm:@supabase/supabase-js@2.90.1";
import { admissionEvidenceCommitRequest } from "../_shared/admission-case-evidence-commit.ts";
import { admissionFetch } from "../_shared/admission-case-access.ts";

Deno.serve(request => admissionEvidenceCommitRequest(request, {
  configured: !!Deno.env.get("SUPABASE_URL") && !!Deno.env.get("SUPABASE_ANON_KEY") && !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  createCaller: (authorization, signal) => {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
      global: {headers: {Authorization: authorization}, fetch: admissionFetch(fetch, signal)},
    });
    return {auth: client.auth, storage: client.storage, rpc: (name, args) => client.rpc(name, args).setHeader("Authorization", authorization)};
  },
  createService: signal => {
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, authorization = `Bearer ${key}`;
    const client = createClient(Deno.env.get("SUPABASE_URL")!, key, {
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}, global: {headers: {Authorization: authorization}, fetch: admissionFetch(fetch, signal)},
    });
    return {storage: client.storage, rpc: (name, args) => client.rpc(name, args).setHeader("Authorization", authorization)};
  },
}));
