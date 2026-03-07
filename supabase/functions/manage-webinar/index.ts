import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getSupabase(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

function getServiceSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const supabase = getSupabase(authHeader);
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }
  const userId = user.id;

  try {
    const db = getServiceSupabase();

    // CREATE WEBINAR
    if (req.method === "POST") {
      const body = await req.json();
      const {
        title, description, scheduled_at, duration_minutes,
        course_id, company_id, access_type, max_participants,
        organization_id, stream_url, stream_platform,
      } = body;

      const { data, error } = await db.from("webinars").insert({
        organization_id,
        title,
        description,
        scheduled_at,
        duration_minutes: duration_minutes || 60,
        course_id: course_id || null,
        company_id: company_id || null,
        access_type: access_type || "org_all",
        stream_url: stream_url || null,
        stream_platform: stream_platform || "telemost",
        host_user_id: userId,
        max_participants: max_participants || 100,
      }).select().single();

      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // UPDATE WEBINAR STATUS
    if (req.method === "PATCH") {
      const { webinar_id, status, recording_url, recording_size_bytes, stream_url } = await req.json();
      const updateData: Record<string, unknown> = {};
      if (status) updateData.status = status;
      if (recording_url) updateData.recording_url = recording_url;
      if (recording_size_bytes) updateData.recording_size_bytes = recording_size_bytes;
      if (stream_url !== undefined) updateData.stream_url = stream_url;

      const { data, error } = await db.from("webinars").update(updateData).eq("id", webinar_id).select().single();
      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // DELETE WEBINAR
    if (req.method === "DELETE") {
      const { webinar_id } = await req.json();
      const { error } = await db.from("webinars").delete().eq("id", webinar_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid method" }), { status: 400, headers: corsHeaders });
  } catch (err) {
    console.error("manage-webinar error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
