import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    // Verify user has organization or admin role
    const { data: roleData } = await supabaseAuth
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || (roleData.role !== 'organization' && roleData.role !== 'admin')) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions. Organization or admin role required." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get caller's organization
    const { data: callerProfile } = await supabaseAuth
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { user_id, new_password, new_email } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id обязателен" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Verify the target user belongs to the caller's organization
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('organization_id, login')
      .eq('user_id', user_id)
      .single();

    if (!targetProfile) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (roleData.role !== 'admin' && callerProfile?.organization_id !== targetProfile.organization_id) {
      return new Response(
        JSON.stringify({ error: "You can only reset passwords for users in your organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate password if not provided
    const password = new_password || (() => {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let pwd = '';
      for (let i = 0; i < 10; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return pwd;
    })();

    // Determine if we need to update email to login-based format
    const emailToUpdate = new_email || (targetProfile.login ? `${targetProfile.login}@student.local` : undefined);

    // Update password (and optionally email) in auth.users
    const updateData: { password: string; email?: string; email_confirm?: boolean } = { password };
    if (emailToUpdate) {
      updateData.email = emailToUpdate;
      updateData.email_confirm = true;
    }

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      updateData
    );

    if (updateAuthError) {
      console.error("Auth error:", updateAuthError);
      return new Response(
        JSON.stringify({ error: "Ошибка обновления пароля: " + updateAuthError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update password in profiles (for display purposes - this is stored temporarily)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ generated_password: password })
      .eq("user_id", user_id);

    if (profileError) {
      console.error("Profile error:", profileError);
    }

    console.log(`Password reset for user: ${user_id} by: ${user.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        password,
        message: "Пароль успешно обновлён"
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
