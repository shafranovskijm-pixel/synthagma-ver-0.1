import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// LiveKit REST API: создаёт комнату через серверный JWT (admin-grant: roomCreate).
// Доки: https://docs.livekit.io/home/server/managing-rooms/

function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function signLiveKitJwt(
  apiKey: string,
  apiSecret: string,
  payload: Record<string, unknown>,
  ttlSeconds = 600,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    iss: apiKey,
    nbf: now - 5,
    iat: now,
    exp: now + ttlSeconds,
    ...payload,
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

function lkHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^wss?:\/\//, (m) => (m === "wss://" ? "https://" : "http://"));
}

/**
 * Терпимый разбор секрета: если кто-то вставил в поле целый .env-блок
 * (например "LIVEKIT_URL=wss://... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=..."),
 * вытаскиваем нужное значение по имени переменной или по http(s)/ws(s)-схеме.
 */
function extractSecret(raw: string | undefined, varName: string, kind: "url" | "token"): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  // Если это именно URL/токен без мусора — вернуть как есть.
  if (kind === "url" && /^wss?:\/\/\S+$/i.test(trimmed)) return trimmed;
  if (kind === "token" && !/\s/.test(trimmed) && !trimmed.includes("=")) return trimmed;

  // Иначе ищем "VARNAME=VALUE" в строке, разделители — пробел/перевод строки/;
  const re = new RegExp(`(?:^|[\\s;,])${varName}\\s*=\\s*("([^"]+)"|'([^']+)'|(\\S+))`, "i");
  const m = trimmed.match(re);
  if (m) return (m[2] || m[3] || m[4] || "").trim();

  // Для URL — попробуем найти первый wss:// в строке.
  if (kind === "url") {
    const u = trimmed.match(/wss?:\/\/\S+/i);
    if (u) return u[0].replace(/[",;]+$/g, "");
  }
  return trimmed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return json({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const wsUrl = Deno.env.get("LIVEKIT_WS_URL");
    if (!apiKey || !apiSecret || !wsUrl) {
      return json({ error: "LiveKit secrets не настроены" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const webinarId: string | undefined = body.webinarId;
    const titleHint: string = (body.title || "Вебинар").toString().slice(0, 100);

    const roomName = `wbn_${(webinarId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48)}_${Math.random().toString(36).slice(2, 6)}`;

    const adminToken = await signLiveKitJwt(apiKey, apiSecret, {
      video: { roomCreate: true, roomAdmin: true, room: roomName },
    });

    const resp = await fetch(`${lkHttpUrl(wsUrl)}/twirp/livekit.RoomService/CreateRoom`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: roomName,
        empty_timeout: 600, // комната уйдёт через 10 мин пустоты
        max_participants: 100,
        metadata: JSON.stringify({ title: titleHint, webinarId: webinarId ?? null }),
      }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      console.error("[livekit-create-room] LiveKit error", resp.status, text);
      return json({ error: `LiveKit error ${resp.status}: ${text}` }, 502);
    }

    return json({ ok: true, roomName, wsUrl });
  } catch (e) {
    console.error("[livekit-create-room] error", e);
    return json({ error: (e as Error).message || "Internal error" }, 500);
  }
});

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
