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
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Требуется авторизация" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Недействительная авторизация" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roleData } = await supabaseAuth
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    const isAdmin = roleData?.role === "admin";
    const isOrg = roleData?.role === "organization";
    if (!isAdmin && !isOrg) {
      return new Response(
        JSON.stringify({ error: "Нет прав для смены email" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { organization_id, new_email } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "organization_id обязателен" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!new_email || !emailRegex.test(new_email)) {
      return new Response(
        JSON.stringify({ error: "Неверный формат email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Find organization owner user
    const { data: orgProfiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("organization_id", organization_id);

    let orgUserId: string | null = null;
    if (orgProfiles && orgProfiles.length > 0) {
      for (const p of orgProfiles) {
        const { data: ur } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", p.user_id)
          .single();
        if (ur?.role === "organization") {
          orgUserId = p.user_id;
          break;
        }
      }
    }

    if (!orgUserId) {
      return new Response(
        JSON.stringify({ error: "Пользователь организации не найден" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If caller is organization, they must be the org owner
    if (isOrg && user.id !== orgUserId) {
      return new Response(
        JSON.stringify({ error: "Нет доступа к этой организации" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update auth email
    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      orgUserId,
      { email: new_email, email_confirm: true }
    );

    if (updateAuthError) {
      console.error("Auth update error:", updateAuthError);
      return new Response(
        JSON.stringify({ error: "Ошибка обновления email: " + updateAuthError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update profiles.email
    await supabaseAdmin
      .from("profiles")
      .update({ email: new_email })
      .eq("user_id", orgUserId);

    // Upsert organization_credentials
    const { data: existing } = await supabaseAdmin
      .from("organization_credentials")
      .select("id")
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("organization_credentials")
        .update({ login_email: new_email })
        .eq("organization_id", organization_id);
    } else {
      await supabaseAdmin
        .from("organization_credentials")
        .insert({ organization_id, login_email: new_email, login_password: "" });
    }

    console.log(`Email updated for organization: ${organization_id} by user: ${user.id}`);

    return new Response(
      JSON.stringify({ success: true, message: "Email успешно обновлён" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
