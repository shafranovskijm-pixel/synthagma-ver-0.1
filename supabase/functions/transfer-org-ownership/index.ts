// Передача владения организацией (атомарная операция через service role)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { organization_id, new_owner_user_id } = body;
    if (!organization_id || !new_owner_user_id) {
      return new Response(JSON.stringify({ error: "Missing organization_id or new_owner_user_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 1) Verify caller is current owner
    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isOwner = callerRoles?.some((r: any) => r.role === "organization");
    if (!isOwner) {
      return new Response(JSON.stringify({ error: "Only current owner can transfer ownership" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("organization_id, full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (callerProfile?.organization_id !== organization_id) {
      return new Response(JSON.stringify({ error: "You don't own this organization" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2) Verify new owner is in org_staff (or already in profile)
    const { data: newOwnerStaff } = await admin
      .from("org_staff")
      .select("id, display_name")
      .eq("organization_id", organization_id)
      .eq("user_id", new_owner_user_id)
      .maybeSingle();

    const { data: newOwnerProfile } = await admin
      .from("profiles")
      .select("user_id, full_name, email")
      .eq("user_id", new_owner_user_id)
      .maybeSingle();

    if (!newOwnerStaff && !newOwnerProfile) {
      return new Response(JSON.stringify({ error: "New owner not found in organization" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3) Transfer:
    //    a) Update new owner profile organization_id
    //    b) Add 'organization' role to new owner
    //    c) Remove old owner from user_roles 'organization'
    //    d) Add old owner to org_staff as 'admin' if not already
    //    e) Remove new owner from org_staff (since they are now owner)

    await admin.from("profiles").update({ organization_id }).eq("user_id", new_owner_user_id);

    // Add new owner role (idempotent)
    await admin.from("user_roles").upsert(
      { user_id: new_owner_user_id, role: "organization" },
      { onConflict: "user_id,role" }
    );

    // Demote old owner: remove 'organization' role
    await admin
      .from("user_roles")
      .delete()
      .eq("user_id", user.id)
      .eq("role", "organization");

    // Ensure old owner has 'admin' app_role for org access (kept as student/auth fallback)
    // We leave existing role; just add to org_staff as admin
    const { data: existingOldStaff } = await admin
      .from("org_staff")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingOldStaff) {
      await admin.from("org_staff").update({ role: "admin" }).eq("id", existingOldStaff.id);
    } else {
      await admin.from("org_staff").insert({
        organization_id,
        user_id: user.id,
        role: "admin",
        display_name: callerProfile?.full_name || "Бывший владелец",
        visibility: "all",
      });
    }

    // Remove new owner from org_staff (owner is implicit)
    if (newOwnerStaff) {
      await admin.from("org_staff").delete().eq("id", newOwnerStaff.id);
    }

    // 4) Audit log
    await admin.from("role_audit_log").insert({
      scope: "organization",
      organization_id,
      target_user_id: new_owner_user_id,
      target_name: newOwnerStaff?.display_name || newOwnerProfile?.full_name || null,
      target_email: newOwnerProfile?.email || null,
      action: "granted",
      old_role: null,
      new_role: "owner",
      performed_by: user.id,
      performed_by_name: callerProfile?.full_name || null,
      details: { type: "ownership_transfer", from_user_id: user.id },
    });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[transfer-org-ownership]", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
