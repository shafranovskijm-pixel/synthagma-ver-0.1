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
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
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
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify admin role
    const { data: roleData } = await supabaseAuth
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || roleData.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: "Только администратор может генерировать учётные данные" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { organization_id } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "organization_id обязателен" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if credentials already exist
    const { data: existingCreds } = await supabaseAdmin
      .from('organization_credentials')
      .select('id')
      .eq('organization_id', organization_id)
      .maybeSingle();

    if (existingCreds) {
      return new Response(
        JSON.stringify({ error: "Учётные данные уже существуют" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get organization info
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id, name, email')
      .eq('id', organization_id)
      .single();

    if (orgError || !org) {
      return new Response(
        JSON.stringify({ error: "Организация не найдена" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find organization user - someone with 'organization' role linked to this org
    const { data: orgUsers } = await supabaseAdmin
      .from('profiles')
      .select('user_id')
      .eq('organization_id', organization_id);

    let orgUserId = null;
    
    if (orgUsers && orgUsers.length > 0) {
      // Check which one has organization role
      for (const profile of orgUsers) {
        const { data: userRole } = await supabaseAdmin
          .from('user_roles')
          .select('role')
          .eq('user_id', profile.user_id)
          .single();
        
        if (userRole?.role === 'organization') {
          orgUserId = profile.user_id;
          break;
        }
      }
    }

    // Generate password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    let loginEmail = org.email;

    if (orgUserId) {
      // Get the user's email from auth
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(orgUserId);
      if (authUser?.user?.email) {
        loginEmail = authUser.user.email;
      }

      // Update password for existing user
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        orgUserId,
        { password: password }
      );

      if (updateError) {
        console.error("Error updating password:", updateError);
        return new Response(
          JSON.stringify({ error: "Ошибка обновления пароля: " + updateError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // No org user found - check if user with this email already exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(u => u.email === org.email);

      if (existingUser) {
        // User exists - update password and link to organization
        orgUserId = existingUser.id;
        loginEmail = org.email;

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          orgUserId,
          { password: password }
        );

        if (updateError) {
          console.error("Error updating existing user password:", updateError);
          return new Response(
            JSON.stringify({ error: "Ошибка обновления пароля: " + updateError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update profile to link to organization
        const { data: existingProfile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('user_id', orgUserId)
          .maybeSingle();

        if (existingProfile) {
          await supabaseAdmin
            .from('profiles')
            .update({ organization_id: organization_id })
            .eq('user_id', orgUserId);
        } else {
          await supabaseAdmin.from('profiles').insert({
            user_id: orgUserId,
            organization_id: organization_id,
            full_name: 'Администратор',
            email: org.email,
          });
        }

        // Update or create user role
        const { data: existingRole } = await supabaseAdmin
          .from('user_roles')
          .select('id')
          .eq('user_id', orgUserId)
          .maybeSingle();

        if (existingRole) {
          await supabaseAdmin
            .from('user_roles')
            .update({ role: 'organization' })
            .eq('user_id', orgUserId);
        } else {
          await supabaseAdmin.from('user_roles').insert({
            user_id: orgUserId,
            role: 'organization',
          });
        }
      } else {
        // Create new user
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: org.email,
          password: password,
          email_confirm: true,
        });

        if (createError) {
          console.error("Error creating user:", createError);
          return new Response(
            JSON.stringify({ error: "Ошибка создания пользователя: " + createError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        orgUserId = newUser.user.id;
        loginEmail = org.email;

        // Create profile
        await supabaseAdmin.from('profiles').insert({
          user_id: orgUserId,
          organization_id: organization_id,
          full_name: 'Администратор',
          email: org.email,
        });

        // Create user role
        await supabaseAdmin.from('user_roles').insert({
          user_id: orgUserId,
          role: 'organization',
        });
      }
    }

    // Save credentials
    const { error: credError } = await supabaseAdmin
      .from('organization_credentials')
      .insert({
        organization_id: organization_id,
        login_email: loginEmail,
        login_password: password,
      });

    if (credError) {
      console.error("Error saving credentials:", credError);
      return new Response(
        JSON.stringify({ error: "Ошибка сохранения учётных данных: " + credError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Credentials generated for organization: ${organization_id}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        login_email: loginEmail,
        login_password: password,
        message: "Учётные данные успешно созданы"
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
