import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { novofonClassicRequest } from "../_shared/novofon.ts";

const VERSION = "webrtc-official-first-v3";

interface WebrtcKeyResponse {
  status?: string;
  key?: string;
  message?: string;
}

interface WebphoneDataResponse {
  domain?: string;
  username?: string;
  pass?: string;
  datacenter?: string;
  error?: { content?: string } | string;
}

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

    const login = Deno.env.get("NOVOFON_WEBRTC_SIP_LOGIN")?.trim() || buildConfiguredSipLogin();
    const fallbackPassword = Deno.env.get("NOVOFON_WEBRTC_SIP_PASSWORD") || Deno.env.get("NOVOFON_SIP_PASSWORD");

    if (!login) {
      return json({ error: "sip_not_configured", message: "SIP-логин Novofon не задан" }, 200);
    }

    try {
      const keyResponse = await novofonClassicRequest<WebrtcKeyResponse>("GET", "/v1/webrtc/get_key/", { sip: login });
      const key = keyResponse?.key;
      if (!key || keyResponse?.status === "error") {
        throw new Error(keyResponse?.message || "Novofon не вернул WebRTC-ключ");
      }

      const webphoneData = await fetchWebphoneData(key, login);
      if (webphoneData?.error) {
        const message = typeof webphoneData.error === "string" ? webphoneData.error : webphoneData.error.content;
        throw new Error(message || "Novofon не вернул WebRTC-параметры");
      }
      if (!webphoneData?.domain || !webphoneData?.username || !webphoneData?.pass) {
        throw new Error("Novofon вернул неполные WebRTC-параметры");
      }

      const normalizedDomain = normalizeWebrtcDomain(webphoneData.domain, webphoneData.username || login);
      return json({
        ok: true,
        version: VERSION,
        source: "webrtc_key",
        login: webphoneData.username,
        password: webphoneData.pass,
        domain: normalizedDomain,
        wss: `wss://${normalizedDomain}:4443`,
      });
    } catch (webrtcError) {
      // Резерв для ручной SIP/WSS-конфигурации, если официальный WebRTC-ключ недоступен.
      const domain = pickSipDomain(login);
      const wss = pickSipWss(domain);
      if (!fallbackPassword || !wss) {
        return json({
          error: "webrtc_not_available",
          message: webrtcError instanceof Error ? webrtcError.message : String(webrtcError),
        }, 200);
      }

      return json({
        ok: true,
        version: VERSION,
        source: "static_fallback",
        login,
        password: fallbackPassword,
        domain,
        wss,
        warning: webrtcError instanceof Error ? webrtcError.message : String(webrtcError),
      });
    }
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

function pickSipDomain(login: string): string {
  const configured = Deno.env.get("NOVOFON_SIP_LINE_SERVER")
    || Deno.env.get("NOVOFON_WEBRTC_SIP_DOMAIN")
    || Deno.env.get("NOVOFON_SIP_DOMAIN")
    || Deno.env.get("NOVOFON_SIP_SERVER")
    || "";
  const normalized = configured
    .replace(/^sips?:\/\//i, "")
    .replace(/:\d+$/i, "")
    .trim();

  // Логин вида 0076627-100 — это внутренняя линия АТС, для неё Zadarma/Novofon
  // в официальных инструкциях использует PBX-домен, а не sip.novofon.ru.
  if (normalized.includes("novofon.ru")) {
    return login.includes("-") ? "pbx.zadarma.com" : "sip.zadarma.com";
  }
  if (normalized) return normalized;
  return login.includes("-") ? "pbx.zadarma.com" : "sip.zadarma.com";
}

function buildConfiguredSipLogin(): string {
  const explicit = (Deno.env.get("NOVOFON_SIP_LOGIN") || Deno.env.get("NOVOFON_SIP_LINE_LOGIN") || "").trim();
  if (!explicit) return "";
  return explicit;
}

function pickSipWss(domain: string): string {
  const configured = Deno.env.get("NOVOFON_SIP_WSS_URL")?.trim() || "";
  // Старое значение было введено ошибочно: DNS-имя не существует и даёт «Не подключено».
  if (configured && !configured.includes("webrtc.novofon.com")) return configured;
  return `wss://${domain}:4443`;
}

function normalizeWebrtcDomain(domain: string, login: string): string {
  // Novofon отдаёт брендовый домен sip.novofon.ru, но его WebRTC-порт 4443
  // не отвечает стабильно. Под капотом это Zadarma, рабочие WSS-шлюзы — zadarma.com.
  const normalized = domain.trim().toLowerCase();
  if (normalized.includes("novofon.ru")) return login.includes("-") ? "pbx.zadarma.com" : "sip.zadarma.com";
  return normalized;
}

async function fetchWebphoneData(key: string, sip: string): Promise<WebphoneDataResponse> {
  const callback = "sintagmaWebrtc";
  const url = new URL("https://api.zadarma.com/sys/webrtc/get_webphone_data.php");
  url.searchParams.set("jsonpCallback", callback);
  url.searchParams.set("integrationType", "CRM");
  url.searchParams.set("key", key);
  url.searchParams.set("sipId", sip);
  url.searchParams.set("language", "ru");

  const res = await fetch(url.toString(), { headers: { Accept: "application/javascript" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Novofon WebRTC HTTP ${res.status}`);

  const trimmed = text.trim();
  const prefix = `${callback}(`;
  if (!trimmed.startsWith(prefix) || !trimmed.endsWith(")")) {
    throw new Error("Novofon вернул некорректный WebRTC-ответ");
  }

  return JSON.parse(trimmed.slice(prefix.length, -1)) as WebphoneDataResponse;
}
