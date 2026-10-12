// Auth-only test for a receive-only deliverability seed inbox.
// It performs IMAP LOGIN + LOGOUT and never lists, selects, searches, reads,
// moves, deletes, or marks messages.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { closeImap, connectImap } from "../_shared/imap-mini.ts";
import { canManageMailing } from "../_shared/mailing-authorization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Sintagma-Function-Revision",
  "X-Sintagma-Function-Revision": "s004-mailing-beta-20261012",
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
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

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
      .select("organization_id, updated_at")
      .eq("id", seedId)
      .maybeSingle();
    if (!seedMeta) return json({ error: "Forbidden" }, 403);

    if (!await canManageMailing(userClient, seedMeta.organization_id)) return json({ error: "Forbidden" }, 403);

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
      }).eq("id", seedId).eq("organization_id", seedMeta.organization_id).eq("updated_at", seedMeta.updated_at);
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
    const { data: saved, error: saveError } = await admin.from("mailing_deliverability_seeds").update({
      auth_status: success ? "ok" : "error",
      error_category: success ? null : category,
      latency_ms: latency,
      last_tested_at: new Date().toISOString(),
    }).eq("id", seedId).eq("organization_id", seedMeta.organization_id).eq("updated_at", seedMeta.updated_at)
      .select("id").maybeSingle();
    if (saveError || !saved) return json({ success: false, error_category: "config", retry_required: true });

    return json({
      success,
      error_category: success ? null : category,
      latency_ms: latency,
    });
  } catch {
    return json({ success: false, error_category: "unknown" });
  }
});
