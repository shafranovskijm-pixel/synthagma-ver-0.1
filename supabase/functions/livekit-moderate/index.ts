// Модерация участников вебинара: mute/kick через LiveKit RoomService API.
// Только хост (организация/админ) вебинара может выполнять.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { signLiveKitJwt, lkHttpUrl, getLiveKitEnv } from "../_shared/livekit-jwt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: u } = await supabase.auth.getUser();
    if (!u?.user?.id) return json({ error: "Unauthorized" }, 401);

    const { webinarId, action, identity, trackSid } = await req.json().catch(() => ({}));
    if (!webinarId || !action || !identity) return json({ error: "webinarId, action, identity required" }, 400);
    if (!["kick", "mute_audio", "mute_video"].includes(action)) return json({ error: "Invalid action" }, 400);

    const { data: w } = await admin
      .from("webinars").select("id, organization_id, host_user_id, player_settings, source_type")
      .eq("id", webinarId).maybeSingle();
    if (!w) return json({ error: "Not found" }, 404);
    if (w.source_type !== "livekit") return json({ error: "Only LiveKit" }, 400);

    const { data: prof } = await admin.from("profiles").select("organization_id").eq("user_id", u.user.id).maybeSingle();
    const { data: rolesRow } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
    const roles = (rolesRow ?? []).map((r) => r.role);
    const isAdmin = roles.includes("admin");
    const isOrgHost = prof?.organization_id === w.organization_id;
    if (!isAdmin && !isOrgHost && w.host_user_id !== u.user.id) return json({ error: "Forbidden" }, 403);

    const ps = (w.player_settings ?? {}) as Record<string, any>;
    const roomName = ps?.livekit?.roomName;
    if (!roomName) return json({ error: "Room not found" }, 400);

    const { apiKey, apiSecret, wsUrl } = getLiveKitEnv();
    const adminJwt = await signLiveKitJwt(apiKey, apiSecret, {
      video: { roomAdmin: true, room: roomName },
    }, 600);

    let endpoint = "";
    let body: Record<string, unknown> = {};
    if (action === "kick") {
      endpoint = "RemoveParticipant";
      body = { room: roomName, identity };
    } else if (action === "mute_audio" || action === "mute_video") {
      if (!trackSid) return json({ error: "trackSid required" }, 400);
      endpoint = "MutePublishedTrack";
      body = { room: roomName, identity, track_sid: trackSid, muted: true };
    }

    const resp = await fetch(`${lkHttpUrl(wsUrl)}/twirp/livekit.RoomService/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminJwt}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    if (!resp.ok) return json({ error: `LiveKit ${resp.status}: ${text}` }, 502);

    return json({ ok: true });
  } catch (e) {
    console.error("[livekit-moderate]", e);
    return json({ error: (e as Error).message || "Internal" }, 500);
  }
});

function json(d: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
