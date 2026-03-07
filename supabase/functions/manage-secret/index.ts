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

    const { action, name, value } = await req.json();

    // Allowed secret names (whitelist)
    const ALLOWED_SECRETS = [
      "GIGACHAT_AUTH_KEY",
      "GIGACHAT_AUTH_KEY_2",
      "GIGACHAT_AUTH_KEY_3",
      "SALUTESPEECH_AUTH_KEY",
      "SALUTESPEECH_AUTH_KEY_2",
      "ELEVENLABS_API_KEY",
      "DADATA_API_KEY",
    ];

    if (!ALLOWED_SECRETS.includes(name)) {
      return new Response(JSON.stringify({ error: "This secret cannot be managed here" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set") {
      if (!value || typeof value !== "string" || !value.trim()) {
        return new Response(JSON.stringify({ error: "Value is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use the Management API to set the secret
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      
      // Extract project ref from URL
      const projectRef = supabaseUrl.replace("https://", "").split(".")[0];

      const mgmtResponse = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/secrets`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([{ name, value: value.trim() }]),
        }
      );

      if (!mgmtResponse.ok) {
        const errText = await mgmtResponse.text();
        console.error("Failed to set secret via Management API:", mgmtResponse.status, errText);
        
        // Fallback: store in vault
        const adminClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Try to upsert in vault
        const { error: vaultError } = await adminClient.rpc("set_secret_value", {
          secret_name: name,
          secret_value: value.trim(),
        }).maybeSingle();

        if (vaultError) {
          console.error("Vault fallback also failed:", vaultError);
          return new Response(JSON.stringify({ error: "Failed to save secret. Please use the Lovable Cloud secrets panel." }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      // We can't truly delete, but we can set to empty
      return new Response(JSON.stringify({ error: "Delete not supported. Set to empty value instead." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
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
