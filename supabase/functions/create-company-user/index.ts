import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is org or admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!roleData || !["admin", "organization"].includes(roleData.role)) {
      return new Response(
        JSON.stringify({ error: "Forbidden: admin or organization required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { company_id, email, password } = await req.json();

    if (!company_id || !email || !password) {
      return new Response(
        JSON.stringify({ error: "company_id, email, and password are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify company exists and belongs to caller's org (if org role)
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, organization_id, name, user_id")
      .eq("id", company_id)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (company.user_id) {
      return new Response(
        JSON.stringify({ error: "Company already has an account" }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // If org role, verify company belongs to their org
    if (roleData.role === "organization") {
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", caller.id)
        .single();

      if (callerProfile?.organization_id !== company.organization_id) {
        return new Response(
          JSON.stringify({ error: "Company does not belong to your organization" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Create auth user
    const { data: newUser, error: createError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: company.name },
      });

    if (createError || !newUser.user) {
      return new Response(
        JSON.stringify({
          error: createError?.message || "Failed to create user",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Assign company role
    await supabase
      .from("user_roles")
      .update({ role: "company" })
      .eq("user_id", newUser.user.id);

    // Update profile with org and company
    await supabase
      .from("profiles")
      .update({
        organization_id: company.organization_id,
        company_id: company_id,
        full_name: company.name,
      })
      .eq("user_id", newUser.user.id);

    // Save credentials to companies table
    await supabase
      .from("companies")
      .update({
        user_id: newUser.user.id,
        login_email: email,
        generated_password: password, // Will be encrypted by trigger
      })
      .eq("id", company_id);

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUser.user.id,
        email,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
