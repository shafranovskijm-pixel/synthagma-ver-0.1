import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SESSION_DURATION = 25 * 60; // 25 минут
const MONTHLY_FREE_MINUTES = 1000; // лимит LiveKit Cloud Free

function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function signLkJwt(
  apiKey: string,
  apiSecret: string,
  payload: Record<string, unknown>,
  ttlSeconds = 600,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = { iss: apiKey, nbf: now - 5, iat: now, exp: now + ttlSeconds, ...payload };
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(body))}`;
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

function lkHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^wss?:\/\//, (m) => (m === "wss://" ? "https://" : "http://"));
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
    const topic: string = (body.topic || "").toString().slice(0, 200);

    // Профиль пользователя для organization_id
    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const orgId = profile?.organization_id ?? null;

    // Проверяем месячный лимит на уровне организации (или пользователя если нет org)
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);

    const limitQuery = admin
      .from("ai_tutor_sessions")
      .select("duration_seconds")
      .gte("started_at", since.toISOString());
    const filtered = orgId
      ? limitQuery.eq("organization_id", orgId)
      : limitQuery.eq("user_id", user.id);
    const { data: usageRows } = await filtered;
    const usedSeconds = (usageRows ?? []).reduce(
      (s: number, r: any) => s + (r.duration_seconds ?? 0),
      0,
    );
    const usedMinutes = Math.floor(usedSeconds / 60);
    if (usedMinutes >= MONTHLY_FREE_MINUTES) {
      return json({
        error: `Достигнут месячный лимит ИИ-преподавателя (${MONTHLY_FREE_MINUTES} мин). Обновится 1-го числа следующего месяца.`,
      }, 429);
    }

    // Останавливаем активные сессии этого пользователя — одна активная за раз
    await admin
      .from("ai_tutor_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("status", "active");

    const roomName = `tutor_${user.id.slice(0, 8)}_${Math.random().toString(36).slice(2, 8)}`;

    // Создаём комнату на LiveKit
    const adminToken = await signLkJwt(apiKey, apiSecret, {
      video: { roomCreate: true, room: roomName },
    });
    const lkResp = await fetch(`${lkHttpUrl(wsUrl)}/twirp/livekit.RoomService/CreateRoom`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: roomName,
        empty_timeout: 60,
        max_participants: 2,
        metadata: JSON.stringify({ kind: "ai-tutor", userId: user.id, topic }),
      }),
    });
    if (!lkResp.ok) {
      const t = await lkResp.text();
      console.error("[ai-tutor-start] LiveKit error", lkResp.status, t);
      return json({ error: `LiveKit error: ${t}` }, 502);
    }

    const { data: session, error: insertErr } = await admin
      .from("ai_tutor_sessions")
      .insert({
        user_id: user.id,
        organization_id: orgId,
        room_name: roomName,
        topic: topic || null,
        max_duration_seconds: SESSION_DURATION,
        status: "active",
      })
      .select()
      .single();
    if (insertErr || !session) {
      console.error("[ai-tutor-start] insert err", insertErr);
      return json({ error: "Не удалось сохранить сессию" }, 500);
    }

    return json({
      ok: true,
      sessionId: session.id,
      roomName,
      maxDurationSeconds: SESSION_DURATION,
      remainingMinutesThisMonth: Math.max(0, MONTHLY_FREE_MINUTES - usedMinutes),
    });
  } catch (e) {
    console.error("[ai-tutor-start]", e);
    return json({ error: (e as Error).message || "Internal" }, 500);
  }
});

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
