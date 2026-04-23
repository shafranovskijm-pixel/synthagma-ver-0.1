// Завершает LiveKit-комнату вебинара через DeleteRoom.
// Все участники моментально отключаются, ресурсы LiveKit Cloud освобождаются.

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
      .select("id, organization_id, host_user_id, room_name, source_type")
      .eq("id", webinarId)
      .maybeSingle();
    if (!w) return json({ error: "Not found" }, 404);

    // Авторизация: админ платформы / организация-владелец / хост
    const { data: prof } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("user_id", u.user.id)
      .maybeSingle();
    const { data: rolesRow } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
    const roles = (rolesRow ?? []).map((r) => r.role);
    const isAdmin = roles.includes("admin");
    const isOrgHost = prof?.organization_id === w.organization_id;
    if (!isAdmin && !isOrgHost && w.host_user_id !== u.user.id) {
      return json({ error: "Forbidden" }, 403);
    }

    if (w.source_type !== "livekit" || !w.room_name) {
      // Не LiveKit-вебинар или комната ещё не создавалась — нечего удалять
      return json({ ok: true, skipped: true });
    }

    const { apiKey, apiSecret, wsUrl } = getLiveKitEnv();
    if (!apiKey || !apiSecret || !wsUrl) {
      return json({ error: "LiveKit secrets not configured" }, 500);
    }

    const adminToken = await signLiveKitJwt(apiKey, apiSecret, {
      video: { roomAdmin: true, room: w.room_name },
    });

    const resp = await fetch(`${lkHttpUrl(wsUrl)}/twirp/livekit.RoomService/DeleteRoom`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ room: w.room_name }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      // 404 от LiveKit = комната уже удалена / истекла, это не ошибка
      if (resp.status === 404 || /room not found/i.test(text)) {
        console.log("[livekit-end-room] room already gone", w.room_name);
        return json({ ok: true, alreadyGone: true });
      }
      console.error("[livekit-end-room] LiveKit error", resp.status, text);
      return json({ error: `LiveKit error ${resp.status}: ${text}` }, 502);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("[livekit-end-room] error", e);
    return json({ error: (e as Error).message || "Internal error" }, 500);
  }
});

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
