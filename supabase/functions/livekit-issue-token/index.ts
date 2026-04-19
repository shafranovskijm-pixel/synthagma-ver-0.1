import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function signLiveKitAccessToken(
  apiKey: string,
  apiSecret: string,
  identity: string,
  name: string,
  roomName: string,
  isHost: boolean,
  ttlSeconds = 6 * 3600,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    iss: apiKey,
    sub: identity,
    name,
    nbf: now - 5,
    iat: now,
    exp: now + ttlSeconds,
    video: {
      room: roomName,
      roomJoin: true,
      canPublish: isHost, // ученики только смотрят/чатятся
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
      ...(isHost ? { roomAdmin: true, roomRecord: true } : {}),
    },
  };
  const headerB64 = base64url(JSON.stringify(header));
  const bodyB64 = base64url(JSON.stringify(body));
  const data = `${headerB64}.${bodyB64}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${base64url(new Uint8Array(sig))}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user?.id) return json({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const wsUrl = Deno.env.get("LIVEKIT_WS_URL");
    if (!apiKey || !apiSecret || !wsUrl) return json({ error: "LiveKit не настроен" }, 500);

    const body = await req.json().catch(() => ({}));
    const webinarId: string | undefined = body.webinarId;
    const aiTutorSessionId: string | undefined = body.aiTutorSessionId;

    let roomName: string | null = null;
    let isHost = false;
    let displayName = user.email ?? "Участник";

    // Подтягиваем имя из профиля
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email, organization_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile?.full_name) displayName = profile.full_name;
    else if (profile?.email) displayName = profile.email;

    if (webinarId) {
      const { data: webinar } = await admin
        .from("webinars")
        .select("id, organization_id, created_by, player_settings, source_type")
        .eq("id", webinarId)
        .maybeSingle();
      if (!webinar) return json({ error: "Вебинар не найден" }, 404);

      // Авторизация: либо менеджер этой организации (host), либо участник/ученик курса
      const isOrgManager =
        profile?.organization_id && profile.organization_id === webinar.organization_id;
      isHost = !!isOrgManager || webinar.created_by === user.id;

      if (!isHost) {
        // Проверяем что ученик имеет право смотреть
        const { count: directCount } = await admin
          .from("webinar_participants")
          .select("id", { count: "exact", head: true })
          .eq("webinar_id", webinarId)
          .eq("user_id", user.id);

        let allowed = (directCount ?? 0) > 0;

        if (!allowed) {
          const { data: webinarRow } = await admin
            .from("webinars")
            .select("course_id")
            .eq("id", webinarId)
            .maybeSingle();
          if (webinarRow?.course_id) {
            const { count: enrollCount } = await admin
              .from("enrollments")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id)
              .eq("course_id", webinarRow.course_id)
              .in("status", ["active", "completed"]);
            allowed = (enrollCount ?? 0) > 0;
          }
        }
        if (!allowed) return json({ error: "Нет доступа к этому вебинару" }, 403);
      }

      const ps = (webinar.player_settings ?? {}) as Record<string, any>;
      roomName = ps?.livekit?.roomName ?? null;
      if (!roomName) return json({ error: "Комната ещё не создана" }, 400);
    } else if (aiTutorSessionId) {
      const { data: session } = await admin
        .from("ai_tutor_sessions")
        .select("id, user_id, room_name, started_at, max_duration_seconds, status")
        .eq("id", aiTutorSessionId)
        .maybeSingle();
      if (!session) return json({ error: "Сессия не найдена" }, 404);
      if (session.user_id !== user.id) return json({ error: "Forbidden" }, 403);
      if (session.status !== "active") return json({ error: "Сессия завершена" }, 400);

      const elapsed = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000);
      if (elapsed >= session.max_duration_seconds) {
        await admin.from("ai_tutor_sessions").update({
          status: "ended",
          ended_at: new Date().toISOString(),
          duration_seconds: elapsed,
        }).eq("id", session.id);
        return json({ error: "Время сессии истекло" }, 400);
      }

      roomName = session.room_name;
      isHost = true; // ученик — host своей AI-сессии (может говорить)
    } else {
      return json({ error: "Нужен webinarId или aiTutorSessionId" }, 400);
    }

    const token = await signLiveKitAccessToken(
      apiKey,
      apiSecret,
      user.id,
      displayName,
      roomName!,
      isHost,
    );

    return json({ ok: true, token, wsUrl, roomName, isHost });
  } catch (e) {
    console.error("[livekit-issue-token]", e);
    return json({ error: (e as Error).message || "Internal" }, 500);
  }
});

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
