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
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user: caller }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      email,
      password,
      fullName,
      organizationId,
      role = "teacher",
      displayName,
      visibility = "all",
      canReceiveCrmTasks = false,
    } = body ?? {};

    if (!email || !password || !organizationId) {
      return new Response(JSON.stringify({ error: "Missing required fields: email, password, organizationId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (String(password).length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: caller must be admin OR own/manage this org
    const { data: rolesRows } = await supabaseAuth
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const callerRoles = (rolesRows ?? []).map((r: any) => r.role);
    const isPlatformAdmin = callerRoles.includes("admin");

    let isOrgManager = false;
    if (!isPlatformAdmin) {
      const { data: callerProfile } = await supabaseAuth
        .from("profiles")
        .select("organization_id")
        .eq("user_id", caller.id)
        .maybeSingle();

      const isOrgOwner =
        callerRoles.includes("organization") &&
        callerProfile?.organization_id === organizationId;

      let hasStaffPermission = false;
      if (!isOrgOwner) {
        const { data: orgStaff } = await supabaseAuth
          .from("org_staff")
          .select("role")
          .eq("user_id", caller.id)
          .eq("organization_id", organizationId)
          .maybeSingle();
        if (orgStaff && ["owner", "admin"].includes(orgStaff.role)) {
          hasStaffPermission = true;
        }
      }
      isOrgManager = isOrgOwner || hasStaffPermission;
    }

    if (!isPlatformAdmin && !isOrgManager) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const normalizedEmail = String(email).trim().toLowerCase();

    // Check if user already exists by email — try to fetch from profiles first
    let userId: string | null = null;
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("user_id, organization_id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingProfile) {
      userId = existingProfile.user_id;
    } else {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: String(password),
        email_confirm: true,
        user_metadata: { full_name: fullName || displayName || normalizedEmail },
      });
      if (createErr) {
        return new Response(JSON.stringify({ error: createErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = created.user!.id;

      await supabaseAdmin.from("profiles").insert({
        user_id: userId,
        email: normalizedEmail,
        full_name: fullName || displayName || normalizedEmail,
        organization_id: organizationId,
      });

      // Give them a base role so they can authenticate; sales_manager only if applicable.
      const baseRole = role === "sales_manager" ? "sales_manager" : "organization";
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: baseRole });
    }

    // Upsert org_staff record
    const { error: staffErr } = await supabaseAdmin
      .from("org_staff")
      .upsert(
        {
          organization_id: organizationId,
          user_id: userId,
          role,
          display_name: (displayName || fullName || normalizedEmail).toString(),
          visibility,
          can_receive_crm_tasks: !!canReceiveCrmTasks,
        },
        { onConflict: "organization_id,user_id" },
      );

    if (staffErr) {
      return new Response(JSON.stringify({ error: staffErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        login: normalizedEmail,
        password: existingProfile ? null : String(password),
        existed: !!existingProfile,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("create-org-staff error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
