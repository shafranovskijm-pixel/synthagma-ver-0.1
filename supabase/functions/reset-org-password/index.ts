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

    // Verify user has admin or organization role
    const { data: roleData } = await supabaseAuth
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const isAdmin = roleData?.role === 'admin';
    const isOrg = roleData?.role === 'organization';

    if (!isAdmin && !isOrg) {
      return new Response(
        JSON.stringify({ error: "Нет прав для смены пароля" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { organization_id, new_password } = await req.json();

    // If caller is organization role, they must own this organization
    if (isOrg) {
      const { data: callerProfile } = await supabaseAdmin
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!callerProfile || callerProfile.organization_id !== organization_id) {
        return new Response(
          JSON.stringify({ error: "Нет доступа к этой организации" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

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

    // First, find the user with organization role for this org
    const { data: orgProfiles } = await supabaseAdmin
      .from('profiles')
      .select('user_id')
      .eq('organization_id', organization_id);

    let orgUserId = null;
    let orgUserEmail = null;
    
    if (orgProfiles && orgProfiles.length > 0) {
      for (const profile of orgProfiles) {
        const { data: userRole } = await supabaseAdmin
          .from('user_roles')
          .select('role')
          .eq('user_id', profile.user_id)
          .single();
        
        if (userRole?.role === 'organization') {
          orgUserId = profile.user_id;
          // Get the actual email from auth.users
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(profile.user_id);
          if (authUser?.user?.email) {
            orgUserEmail = authUser.user.email;
          }
          break;
        }
      }
    }
    
    if (!orgUserId || !orgUserEmail) {
      return new Response(
        JSON.stringify({ error: "Пользователь организации не найден в системе" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update password in auth.users
    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      orgUserId,
      { password: new_password }
    );

    if (updateAuthError) {
      console.error("Auth update error:", updateAuthError);
      return new Response(
        JSON.stringify({ error: "Ошибка обновления пароля: " + updateAuthError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update/upsert organization_credentials with correct email and password
    const { data: existingCreds } = await supabaseAdmin
      .from('organization_credentials')
      .select('id')
      .eq('organization_id', organization_id)
      .maybeSingle();

    if (existingCreds) {
      const { error: credUpdateError } = await supabaseAdmin
        .from('organization_credentials')
        .update({ login_email: orgUserEmail, login_password: new_password })
        .eq('organization_id', organization_id);

      if (credUpdateError) {
        console.error("Credentials update error:", credUpdateError);
      }
    } else {
      const { error: credInsertError } = await supabaseAdmin
        .from('organization_credentials')
        .insert({ 
          organization_id: organization_id, 
          login_email: orgUserEmail, 
          login_password: new_password 
        });

      if (credInsertError) {
        console.error("Credentials insert error:", credInsertError);
      }
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
