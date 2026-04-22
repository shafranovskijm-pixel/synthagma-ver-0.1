// Запускает RoomCompositeEgress для вебинара. Запись идёт во встроенное хранилище LiveKit Cloud.
// Хост организации/админ инициирует — webinarId обязателен.

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

    const { webinarId } = await req.json().catch(() => ({}));
    if (!webinarId) return json({ error: "webinarId required" }, 400);

    const { data: w } = await admin
      .from("webinars")
      .select("id, organization_id, host_user_id, player_settings, source_type, recording_status, recording_egress_id, title")
      .eq("id", webinarId)
      .maybeSingle();
    if (!w) return json({ error: "Webinar not found" }, 404);
    if (w.source_type !== "livekit") return json({ error: "Only LiveKit webinars" }, 400);

    // Permission check: must be host (org member) or admin
    const { data: prof } = await admin.from("profiles").select("organization_id").eq("user_id", u.user.id).maybeSingle();
    const { data: rolesRow } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
    const roles = (rolesRow ?? []).map((r) => r.role);
    const isAdmin = roles.includes("admin");
    const isOrgHost = prof?.organization_id === w.organization_id;
    if (!isAdmin && !isOrgHost && w.host_user_id !== u.user.id) {
      return json({ error: "Forbidden" }, 403);
    }

    if (w.recording_status === "active" || w.recording_status === "starting") {
      return json({ ok: true, alreadyRecording: true, egressId: w.recording_egress_id });
    }

    const ps = (w.player_settings ?? {}) as Record<string, any>;
    const roomName = ps?.livekit?.roomName;
    if (!roomName) return json({ error: "Room not created yet" }, 400);

    const { apiKey, apiSecret, wsUrl } = getLiveKitEnv();
    if (!apiKey || !apiSecret || !wsUrl) return json({ error: "LiveKit not configured" }, 500);

    // Используем встроенное LiveKit Cloud хранилище через Egress API.
    // RoomCompositeEgress с layout=speaker, file output type=MP4, file location=локальное Cloud-хранилище.
    const egressJwt = await signLiveKitJwt(apiKey, apiSecret, {
      video: { roomRecord: true, roomAdmin: true, room: roomName },
    }, 3600);

    const filename = `webinar-${webinarId}-${Date.now()}.mp4`;
    const egressBody = {
      room_name: roomName,
      layout: "speaker",
      audio_only: false,
      video_only: false,
      file_outputs: [
        {
          file_type: 1, // MP4
          filepath: filename,
          // disable_manifest: true — без отдельного JSON-манифеста
          disable_manifest: true,
        },
      ],
    };

    const resp = await fetch(`${lkHttpUrl(wsUrl)}/twirp/livekit.Egress/StartRoomCompositeEgress`, {
      method: "POST",
      headers: { Authorization: `Bearer ${egressJwt}`, "Content-Type": "application/json" },
      body: JSON.stringify(egressBody),
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error("[livekit-start-recording] LiveKit error", resp.status, text);
      await admin.from("webinars").update({ recording_status: "failed" }).eq("id", webinarId);
      return json({ error: `LiveKit error ${resp.status}: ${text}` }, 502);
    }

    let egressInfo: any = {};
    try { egressInfo = JSON.parse(text); } catch { /* ignore */ }
    const egressId = egressInfo?.egress_id ?? egressInfo?.egressId ?? null;

    await admin.from("webinars").update({
      recording_status: "active",
      recording_egress_id: egressId,
      recording_started_at: new Date().toISOString(),
      auto_record: true,
    }).eq("id", webinarId);

    return json({ ok: true, egressId, filename });
  } catch (e) {
    console.error("[livekit-start-recording]", e);
    return json({ error: (e as Error).message || "Internal" }, 500);
  }
});

function json(d: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
