// Shared LiveKit JWT signing helpers + Twirp HTTP URL converter

export function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export async function signLiveKitJwt(
  apiKey: string,
  apiSecret: string,
  payload: Record<string, unknown>,
  ttlSeconds = 600,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = { iss: apiKey, nbf: now - 5, iat: now, exp: now + ttlSeconds, ...payload };
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

export function lkHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^wss?:\/\//, (m) => (m === "wss://" ? "https://" : "http://"));
}

export function getLiveKitEnv() {
  const apiKey = (Deno.env.get("LIVEKIT_API_KEY") ?? "").trim();
  const apiSecret = (Deno.env.get("LIVEKIT_API_SECRET") ?? "").trim();
  const wsUrl = ((Deno.env.get("LIVEKIT_WS_URL") || Deno.env.get("LIVEKIT_URL")) ?? "").trim();
  return { apiKey, apiSecret, wsUrl };
}
