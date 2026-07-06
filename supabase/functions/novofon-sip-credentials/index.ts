import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Возвращает SIP-креды для WebRTC-софтфона.
 * Требует авторизованного пользователя (менеджер продаж или админ).
 * Реальные значения хранятся в секретах и никогда не попадают в код фронта.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return json({ error: "auth required" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return json({ error: "invalid auth" }, 401);

    const login = Deno.env.get("NOVOFON_SIP_LOGIN");
    const password = Deno.env.get("NOVOFON_SIP_PASSWORD");
    const domain = Deno.env.get("NOVOFON_SIP_DOMAIN") || "sip.novofon.ru";
    const wss = Deno.env.get("NOVOFON_SIP_WSS_URL") || "wss://webrtc.novofon.com:443/webrtc";

    if (!login || !password) {
      return json({ error: "sip_not_configured", message: "NOVOFON_SIP_LOGIN / NOVOFON_SIP_PASSWORD не заданы" }, 200);
    }

    return json({ ok: true, login, password, domain, wss });
  } catch (e) {
    return json({ error: "internal", message: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
