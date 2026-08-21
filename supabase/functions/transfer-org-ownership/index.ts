// Передача владения организацией (атомарная операция через service role)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { organization_id, new_owner_user_id } = body;
    if (!organization_id || !new_owner_user_id) {
      return new Response(JSON.stringify({ error: "Missing organization_id or new_owner_user_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: transferred, error: transferError } = await supabase.rpc(
      "transfer_org_ownership_atomic",
      {
        p_organization_id: organization_id,
        p_new_owner_user_id: new_owner_user_id,
      },
    );

    if (transferError || transferred !== true) {
      const status = transferError?.code === "42501"
        ? 403
        : transferError?.code === "P0002"
        ? 404
        : transferError?.code === "23514" || transferError?.code === "22004"
        ? 400
        : 500;
      return new Response(
        JSON.stringify({ error: transferError?.message || "Ownership transfer failed" }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[transfer-org-ownership]", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
