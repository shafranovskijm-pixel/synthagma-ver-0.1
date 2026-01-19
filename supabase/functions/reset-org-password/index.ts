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
    // SECURITY: Verify authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create authenticated client to verify the caller
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user identity
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has admin role
    const { data: roleData } = await supabaseAuth
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || roleData.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: "Только администратор может сбрасывать пароли организаций" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { organization_id, new_password } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "organization_id обязателен" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!new_password || new_password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Пароль должен быть не менее 6 символов" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get organization credentials
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

    // Find the user by email
    const { data: usersList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error("List users error:", listError);
      return new Response(
        JSON.stringify({ error: "Ошибка получения пользователей" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgUser = usersList.users.find(u => u.email === credentials.login_email);
    
    if (!orgUser) {
      return new Response(
        JSON.stringify({ error: "Пользователь организации не найден в системе" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update password in auth.users
    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      orgUser.id,
      { password: new_password }
    );

    if (updateAuthError) {
      console.error("Auth update error:", updateAuthError);
      return new Response(
        JSON.stringify({ error: "Ошибка обновления пароля: " + updateAuthError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update password in organization_credentials
    const { error: credUpdateError } = await supabaseAdmin
      .from('organization_credentials')
      .update({ login_password: new_password })
      .eq('organization_id', organization_id);

    if (credUpdateError) {
      console.error("Credentials update error:", credUpdateError);
      return new Response(
        JSON.stringify({ error: "Ошибка обновления учётных данных: " + credUpdateError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Password reset for organization: ${organization_id} by admin: ${user.id}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        new_password: new_password,
        message: "Пароль успешно изменён"
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
