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
  perms: { canPublish: boolean; isHost: boolean },
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
      canPublish: perms.canPublish,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
      ...(perms.isHost ? { roomAdmin: true, roomRecord: true } : {}),
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
    const apiKey = (Deno.env.get("LIVEKIT_API_KEY") ?? "").trim();
    const apiSecret = (Deno.env.get("LIVEKIT_API_SECRET") ?? "").trim();
    const wsUrl = ((Deno.env.get("LIVEKIT_WS_URL") || Deno.env.get("LIVEKIT_URL")) ?? "").trim();
    if (!apiKey || !apiSecret || !wsUrl) return json({ error: "LiveKit не настроен" }, 500);
    if (!/^wss?:\/\/[^\s]+$/i.test(wsUrl)) {
      return json({ error: `LIVEKIT_WS_URL должен быть чистым wss://... URL.` }, 500);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const webinarId: string | undefined = body.webinarId;
    const aiTutorSessionId: string | undefined = body.aiTutorSessionId;
    const publicToken: string | undefined = body.publicToken;
    const guestName: string | undefined = body.guestName;
    const guestPassword: string | undefined = body.guestPassword;

    // ====== GUEST BRANCH (no auth required) ======
    if (publicToken) {
      const { data: webinar } = await admin
        .from("webinars")
        .select("id, allow_guests, guest_password, status, player_settings, source_type")
        .eq("public_token", publicToken)
        .maybeSingle();

      if (!webinar) return json({ error: "Вебинар не найден" }, 404);
      if (!webinar.allow_guests) return json({ error: "Гостевой вход выключен" }, 403);
      if (webinar.source_type !== "livekit") return json({ error: "Не LiveKit-вебинар" }, 400);
      if (webinar.status !== "live") {
        return json({ error: "Эфир ещё не начался или уже завершён" }, 403);
      }

      // Проверяем пароль через RPC (поддерживает шифрованный guest_password).
      if (webinar.guest_password) {
        const { data: ok, error: vErr } = await admin.rpc("verify_webinar_guest_password", {
          p_public_token: publicToken,
          p_password: guestPassword ?? "",
        });
        if (vErr || ok !== true) return json({ error: "Неверный пароль" }, 401);
      }

      const ps = (webinar.player_settings ?? {}) as Record<string, any>;
      const roomName = ps?.livekit?.roomName ?? null;
      if (!roomName) return json({ error: "Комната ещё не создана" }, 400);

      const guestId = "guest_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const displayName = (guestName || "").toString().trim().slice(0, 60) || "Гость";

      const token = await signLiveKitAccessToken(
        apiKey,
        apiSecret,
        guestId,
        displayName,
        roomName,
        { canPublish: false, isHost: false },
      );

      return json({ ok: true, token, wsUrl, roomName, isHost: false, isGuest: true });
    }

    // ====== AUTHENTICATED BRANCH ======
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user?.id) return json({ error: "Unauthorized" }, 401);

    let roomName: string | null = null;
    let isHost = false;
    let displayName = user.email ?? "Участник";

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
        .select("id, organization_id, created_by, host_user_id, player_settings, source_type, course_id")
        .eq("id", webinarId)
        .maybeSingle();
      if (!webinar) return json({ error: "Вебинар не найден" }, 404);

      // Глобальный админ платформы — всегда host (может тестировать любой вебинар).
      const { data: rolesRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const isPlatformAdmin = (rolesRow ?? []).some((r: any) => r.role === "admin");

      const isOrgManager =
        profile?.organization_id && profile.organization_id === webinar.organization_id;

      // org_staff с правом webinars.write — тоже host (сотрудники школы).
      let isOrgStaffHost = false;
      if (!isOrgManager && webinar.organization_id) {
        try {
          const { data: hasPerm } = await admin.rpc("has_org_staff_permission", {
            _user_id: user.id,
            _organization_id: webinar.organization_id,
            _permission: "webinars.write",
          });
          isOrgStaffHost = hasPerm === true;
        } catch (e) {
          console.warn("[issue-token] has_org_staff_permission failed", e);
        }
      }

      isHost =
        isPlatformAdmin ||
        !!isOrgManager ||
        isOrgStaffHost ||
        webinar.created_by === user.id ||
        webinar.host_user_id === user.id;

      if (!isHost) {
        const { count: directCount } = await admin
          .from("webinar_participants")
          .select("id", { count: "exact", head: true })
          .eq("webinar_id", webinarId)
          .eq("user_id", user.id);

        let allowed = (directCount ?? 0) > 0;

        if (!allowed && webinar.course_id) {
          const { count: enrollCount } = await admin
            .from("enrollments")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("course_id", webinar.course_id)
            .in("status", ["active", "completed"]);
          allowed = (enrollCount ?? 0) > 0;
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
      isHost = true;
    } else {
      return json({ error: "Нужен webinarId, aiTutorSessionId или publicToken" }, 400);
    }

    const token = await signLiveKitAccessToken(
      apiKey,
      apiSecret,
      user.id,
      displayName,
      roomName!,
      { canPublish: isHost, isHost },
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
