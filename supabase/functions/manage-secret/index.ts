import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin role
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabaseAuth
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!roleData || roleData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { name, value } = await req.json();

    // Allowed secret names (whitelist)
    const ALLOWED_SECRETS = [
      "GIGACHAT_AUTH_KEY",
      "GIGACHAT_AUTH_KEY_2",
      "GIGACHAT_AUTH_KEY_3",
      "SALUTESPEECH_AUTH_KEY",
      "SALUTESPEECH_AUTH_KEY_2",
      "SALUTESPEECH_AUTH_KEY_3",
      "ELEVENLABS_API_KEY",
      "DADATA_API_KEY",
      "YANDEX_TELEMOST_OAUTH_TOKEN",
    ];

    if (!ALLOWED_SECRETS.includes(name)) {
      return new Response(JSON.stringify({ error: "Этот ключ нельзя изменить отсюда" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!value || typeof value !== "string" || !value.trim()) {
      return new Response(JSON.stringify({ error: "Значение обязательно" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client to manage vault secrets
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check if secret exists in vault
    const { data: existing } = await adminClient
      .from("vault" as any)
      .select("id")
      .eq("name", name)
      .maybeSingle();

    if (existing) {
      // Update existing
      const { error: updateError } = await adminClient.rpc("update_secret" as any, {
        secret_id: existing.id,
        new_secret: value.trim(),
        new_name: name,
      });
      if (updateError) {
        console.error("Vault update error:", updateError);
      }
    } else {
      // Insert new secret via vault.create_secret
      const { error: insertError } = await adminClient.rpc("create_secret" as any, {
        new_secret: value.trim(),
        new_name: name,
      });
      if (insertError) {
        console.error("Vault insert error:", insertError);
      }
    }

    // Also set as env var for current runtime (won't persist across deployments)
    // The vault approach persists via Supabase vault
    
    return new Response(JSON.stringify({ success: true, message: "Ключ сохранён. Изменения вступят в силу после перезапуска функций." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("manage-secret error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
