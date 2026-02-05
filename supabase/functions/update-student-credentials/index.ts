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

    const { user_id, new_login, new_password } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id обязателен" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!new_login && !new_password) {
      return new Response(
        JSON.stringify({ error: "Укажите новый логин или пароль" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Verify the target user belongs to the caller's organization
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('organization_id, login, generated_password')
      .eq('user_id', user_id)
     .maybeSingle();

   // Also check labor_safety_profiles if not found in profiles
   let effectiveProfile = targetProfile;
   let isLaborSafetyUser = false;
   
   if (!effectiveProfile) {
     const { data: laborProfile } = await supabaseAdmin
       .from('labor_safety_profiles')
       .select('organization_id, login, generated_password')
       .eq('user_id', user_id)
       .maybeSingle();
     
     if (laborProfile) {
       effectiveProfile = laborProfile;
       isLaborSafetyUser = true;
     }
   }

   if (!effectiveProfile) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Check target user's role - only students can have credentials updated
    const { data: targetRoleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user_id)
      .single();

    if (targetRoleData && (targetRoleData.role === 'organization' || targetRoleData.role === 'admin')) {
      return new Response(
        JSON.stringify({ error: "Нельзя изменить учетные данные администратора или организации" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

   if (roleData.role !== 'admin' && callerProfile?.organization_id !== effectiveProfile.organization_id) {
      return new Response(
        JSON.stringify({ error: "You can only update credentials for users in your organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate login format if provided
    if (new_login) {
      const loginRegex = /^[a-zA-Z0-9_]{3,30}$/;
      if (!loginRegex.test(new_login)) {
        return new Response(
          JSON.stringify({ error: "Логин должен содержать 3-30 символов (латинские буквы, цифры, _)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if login is already taken by another user
      const { data: existingLogin } = await supabaseAdmin
        .from('profiles')
        .select('user_id')
        .eq('login', new_login)
        .neq('user_id', user_id)
        .maybeSingle();

      if (existingLogin) {
        return new Response(
          JSON.stringify({ error: "Этот логин уже занят" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate password if provided
    if (new_password && new_password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Пароль должен быть не менее 6 символов" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

   const loginToUse = new_login || effectiveProfile.login;
   const passwordToUse = new_password || effectiveProfile.generated_password;

    // Update auth.users - email is based on login, password is the actual password
    const authUpdateData: { email?: string; email_confirm?: boolean; password?: string } = {};
    
    if (new_login) {
      authUpdateData.email = `${new_login}@student.local`;
      authUpdateData.email_confirm = true;
    }
    
    if (new_password) {
      authUpdateData.password = new_password;
    }

    if (Object.keys(authUpdateData).length > 0) {
      const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
        user_id,
        authUpdateData
      );

      if (updateAuthError) {
        console.error("Auth error:", updateAuthError);
        return new Response(
          JSON.stringify({ error: "Ошибка обновления учетных данных: " + updateAuthError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Update profiles table
    const profileUpdateData: { login?: string; generated_password?: string } = {};
    if (new_login) {
      profileUpdateData.login = new_login;
    }
    if (new_password) {
      profileUpdateData.generated_password = new_password;
    }

    if (Object.keys(profileUpdateData).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update(profileUpdateData)
        .eq("user_id", user_id);

      if (profileError) {
        console.error("Profile error:", profileError);
        return new Response(
          JSON.stringify({ error: "Ошибка обновления профиля: " + profileError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

     // Also update labor_safety_profiles if exists (always sync both tables)
     await supabaseAdmin
       .from("labor_safety_profiles")
       .update(profileUpdateData)
       .eq("user_id", user_id);
     console.log(`Labor safety profile also updated for user: ${user_id}`);
    }

    console.log(`Credentials updated for user: ${user_id} by: ${user.id}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        login: loginToUse,
        password: passwordToUse,
        message: "Учетные данные успешно обновлены"
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
