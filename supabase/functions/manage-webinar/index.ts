import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DAILY_API = "https://api.daily.co/v1";

async function dailyFetch(path: string, opts: RequestInit = {}) {
  const key = Deno.env.get("DAILY_API_KEY");
  if (!key) throw new Error("DAILY_API_KEY not configured");
  const res = await fetch(`${DAILY_API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(opts.headers as Record<string, string> || {}) },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Daily.co API error [${res.status}]: ${body}`);
  return JSON.parse(body);
}

function getSupabase(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

async function getServiceSupabase() {
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
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }
  const userId = claimsData.claims.sub as string;

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // CREATE WEBINAR + DAILY ROOM
    if (req.method === "POST" && action === "create") {
      const body = await req.json();
      const { title, description, scheduled_at, duration_minutes, course_id, company_id, access_type, max_participants, organization_id } = body;

      // Create Daily.co room
      const roomName = `webinar-${crypto.randomUUID().slice(0, 8)}`;
      const exp = Math.floor(new Date(scheduled_at).getTime() / 1000) + (duration_minutes || 60) * 60 + 3600; // +1h buffer
      const room = await dailyFetch("/rooms", {
        method: "POST",
        body: JSON.stringify({
          name: roomName,
          properties: {
            exp,
            max_participants: max_participants || 100,
            enable_recording: "cloud",
            enable_chat: true,
            enable_screenshare: true,
            start_audio_off: true,
            start_video_off: false,
          },
        }),
      });

      // Save to DB
      const { data, error } = await supabase.from("webinars").insert({
        organization_id,
        title,
        description,
        scheduled_at,
        duration_minutes: duration_minutes || 60,
        course_id: course_id || null,
        company_id: company_id || null,
        access_type: access_type || "org_all",
        room_url: room.url,
        room_name: roomName,
        host_user_id: userId,
        max_participants: max_participants || 100,
      }).select().single();

      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // GET MEETING TOKEN
    if (req.method === "POST" && action === "token") {
      const { room_name, is_owner } = await req.json();
      const meetingToken = await dailyFetch("/meeting-tokens", {
        method: "POST",
        body: JSON.stringify({
          properties: {
            room_name,
            is_owner: is_owner || false,
            user_name: userId,
            exp: Math.floor(Date.now() / 1000) + 7200, // 2h
          },
        }),
      });
      return new Response(JSON.stringify({ token: meetingToken.token }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // UPDATE WEBINAR STATUS
    if (req.method === "PATCH") {
      const { webinar_id, status, recording_url, recording_size_bytes } = await req.json();
      const updateData: Record<string, unknown> = {};
      if (status) updateData.status = status;
      if (recording_url) updateData.recording_url = recording_url;
      if (recording_size_bytes) updateData.recording_size_bytes = recording_size_bytes;

      const { data, error } = await supabase.from("webinars").update(updateData).eq("id", webinar_id).select().single();
      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // DELETE WEBINAR + DAILY ROOM
    if (req.method === "DELETE") {
      const { webinar_id } = await req.json();
      // Get room name first
      const { data: webinar } = await supabase.from("webinars").select("room_name").eq("id", webinar_id).single();
      
      // Delete Daily room (ignore errors - room may not exist)
      if (webinar?.room_name) {
        try { await dailyFetch(`/rooms/${webinar.room_name}`, { method: "DELETE" }); } catch (_) { /* ok */ }
      }

      const { error } = await supabase.from("webinars").delete().eq("id", webinar_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // GET RECORDINGS from Daily.co
    if (req.method === "POST" && action === "recordings") {
      const { room_name } = await req.json();
      const recordings = await dailyFetch(`/recordings?room_name=${room_name}`);
      return new Response(JSON.stringify(recordings), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: corsHeaders });
  } catch (err) {
    console.error("manage-webinar error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
