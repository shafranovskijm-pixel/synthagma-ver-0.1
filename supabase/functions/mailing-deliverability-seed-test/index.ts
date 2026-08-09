// Auth-only test for a receive-only deliverability seed inbox.
// It performs IMAP LOGIN + LOGOUT and never lists, selects, searches, reads,
// moves, deletes, or marks messages.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { closeImap, connectImap } from "../_shared/imap-mini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Category = "ok" | "auth" | "connection" | "tls" | "timeout" | "config" | "unknown";

function categorize(message: string): Category {
  const m = message.toLowerCase();
  if (/timeout|timed out/.test(m)) return "timeout";
  if (/auth|login|credential|invalid password|application password/.test(m)) return "auth";
  if (/tls|ssl|certificate/.test(m)) return "tls";
  if (/connect|refused|dns|unreachable|host|closed/.test(m)) return "connection";
  return "unknown";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData } = await userClient.auth.getUser();
    if (!authData?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const seedId = typeof body?.seed_id === "string" ? body.seed_id : "";
    if (!seedId) return json({ error: "seed_id required" }, 400);

    const admin = createClient(url, serviceKey);
    const { data: seedMeta } = await admin
      .from("mailing_deliverability_seeds")
      .select("organization_id")
      .eq("id", seedId)
      .maybeSingle();
    if (!seedMeta) return json({ error: "Forbidden" }, 403);

    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: authData.user.id,
      _role: "admin",
    });
    let allowed = !!isAdmin;
    if (!allowed) {
      const { data: canAccess } = await userClient.rpc("can_access_organization", {
        _organization_id: seedMeta.organization_id,
        _permission: "email.manage",
      });
      allowed = !!canAccess;
    }
    if (!allowed) return json({ error: "Forbidden" }, 403);

    // Decrypt only after the caller's tenant permission has been established.
    const { data: secretRows, error: secretError } = await admin.rpc(
      "get_mailing_deliverability_seed_secret",
      { p_seed_id: seedId },
    );
    const seed = Array.isArray(secretRows) ? secretRows[0] : secretRows;
    if (secretError || !seed || seed.organization_id !== seedMeta.organization_id) {
      return json({ error: "Forbidden" }, 403);
    }

    if (!seed.secret || !seed.imap_host || seed.imap_security !== "ssl") {
      await admin.from("mailing_deliverability_seeds").update({
        auth_status: "error",
        error_category: "config",
        last_tested_at: new Date().toISOString(),
      }).eq("id", seedId);
      return json({ success: false, error_category: "config" });
    }

    const started = Date.now();
    let category: Category = "ok";
    try {
      const connection = await connectImap({
        host: seed.imap_host,
        port: seed.imap_port || 993,
        user: seed.imap_username || seed.email,
        password: seed.secret,
      });
      await closeImap(connection);
    } catch (error) {
      category = categorize((error as Error)?.message || "");
    }

    const latency = Date.now() - started;
    const success = category === "ok";
    await admin.from("mailing_deliverability_seeds").update({
      auth_status: success ? "ok" : "error",
      error_category: success ? null : category,
      latency_ms: latency,
      last_tested_at: new Date().toISOString(),
    }).eq("id", seedId);

    return json({
      success,
      error_category: success ? null : category,
      latency_ms: latency,
    });
  } catch {
    return json({ success: false, error_category: "unknown" });
  }
});
