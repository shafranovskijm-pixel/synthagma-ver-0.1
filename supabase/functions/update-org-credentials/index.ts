import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
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

    // Check if user has organization role
    const { data: roleData } = await supabaseAuth
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || roleData.role !== 'organization') {
      return new Response(
        JSON.stringify({ error: "Только организация может изменить свои учётные данные" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { organization_id, new_email, new_password } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "organization_id обязателен" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the organization credentials belong to this user
    const { data: credentials, error: credError } = await supabaseAdmin
      .from('organization_credentials')
      .select('login_email')
      .eq('organization_id', organization_id)
      .single();

    if (credError || !credentials) {
      return new Response(
        JSON.stringify({ error: "Учётные данные организации не найдены" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify this is the correct user by email match
    if (user.email !== credentials.login_email) {
      return new Response(
        JSON.stringify({ error: "Нет доступа к этой организации" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const updates: { email?: string; password?: string } = {};
    const credUpdates: { login_email?: string; login_password?: string } = {};

    if (new_email && new_email !== credentials.login_email) {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(new_email)) {
        return new Response(
          JSON.stringify({ error: "Неверный формат email" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      updates.email = new_email;
      credUpdates.login_email = new_email;
    }

    if (new_password) {
      if (new_password.length < 6) {
        return new Response(
          JSON.stringify({ error: "Пароль должен быть не менее 6 символов" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      updates.password = new_password;
      credUpdates.login_password = new_password;
    }

    if (Object.keys(updates).length === 0) {
      return new Response(
        JSON.stringify({ error: "Нет данных для обновления" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update auth.users
    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      updates
    );

    if (updateAuthError) {
      console.error("Auth update error:", updateAuthError);
      return new Response(
        JSON.stringify({ error: "Ошибка обновления: " + updateAuthError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update organization_credentials
    if (Object.keys(credUpdates).length > 0) {
      const { error: credUpdateError } = await supabaseAdmin
        .from('organization_credentials')
        .update(credUpdates)
        .eq('organization_id', organization_id);

      if (credUpdateError) {
        console.error("Credentials update error:", credUpdateError);
        return new Response(
          JSON.stringify({ error: "Ошибка обновления учётных данных: " + credUpdateError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Credentials updated for organization: ${organization_id} by user: ${user.id}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Учётные данные успешно обновлены"
      }),
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
