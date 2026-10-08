import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { createAccountDeletionHandler } from "../_shared/account-deletion.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(createAccountDeletionHandler({
  authenticate: async (authorization) => {
    if (!/^Bearer\s+\S+$/i.test(authorization)) return null;
    const { data, error } = await service.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null,
      hasVerifiedMfa: (data.user.factors ?? []).some(factor => factor.status === "verified") };
  },
  reauthenticate: async (actor, password) => {
    // A separate stateless client must never replace the caller's main session.
    const verifier = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await verifier.auth.signInWithPassword({ email: actor.email!, password });
    try { return !error && data.user?.id === actor.id && !(data.user.factors ?? []).some(factor => factor.status === "verified"); }
    finally { if (data.session) await verifier.auth.signOut({ scope: "local" }); }
  },
  rpc: (name, args) => service.rpc(name, args),
  revoke: async (userId) => {
    const { error } = await service.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    if (error) throw error;
  },
  removeFiles: async (bucket, paths) => {
    const { error } = await service.storage.from(bucket).remove(paths);
    if (error) throw error;
  },
  deleteAuthUser: async (userId) => {
    const { error } = await service.auth.admin.deleteUser(userId, false);
    if (error) throw error;
  },
  authUserExists: async (userId) => {
    const { data, error } = await service.auth.admin.getUserById(userId);
    if (error && (error.code === "user_not_found" || error.status === 404)) return false;
    if (error) throw error;
    return !!data.user;
  },
}));
