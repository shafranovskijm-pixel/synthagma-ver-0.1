// Edge function: log-client-error
// Принимает батч ошибок от клиента и сохраняет в client_error_logs.
// verify_jwt = false, чтобы ловить ошибки и от неавторизованных пользователей.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_EVENTS_PER_REQUEST = 50;
const MAX_STR = 2048;
const MAX_URL = 1024;

interface ClientEvent {
  occurred_at?: string;
  method?: string;
  url_host?: string;
  url_path?: string;
  status?: number | null;
  error_kind: string;
  error_message?: string;
  response_snippet?: string;
  response_content_type?: string;
  duration_ms?: number;
  page_url?: string;
  page_route?: string;
  user_agent?: string;
  proxy_used?: boolean;
  app_version?: string;
  occurrence_count?: number;
}

function clip(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}

const VALID_KINDS = new Set([
  "http_4xx",
  "http_5xx",
  "network_error",
  "cors_error",
  "timeout",
  "aborted",
  "unknown",
]);

// In-memory rate limit (per ip, per minute)
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 100;
const RATE_WINDOW_MS = 60_000;

function checkRate(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (!checkRate(clientIp)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { events?: ClientEvent[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const events = Array.isArray(body?.events) ? body.events : [];
  if (events.length === 0) {
    return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cappedEvents = events.slice(0, MAX_EVENTS_PER_REQUEST);

  // Try to identify the user from the JWT in the Authorization header
  let userId: string | null = null;
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data } = await supabaseAuth.auth.getUser();
      if (data?.user?.id) userId = data.user.id;
    } catch {
      // ignore
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // If user identified, try to resolve their organization_id
  let organizationId: string | null = null;
  if (userId) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", userId)
        .maybeSingle();
      organizationId = profile?.organization_id ?? null;
    } catch {
      // ignore
    }
  }

  const rows = cappedEvents.map((ev) => {
    const kind = VALID_KINDS.has(ev.error_kind) ? ev.error_kind : "unknown";
    return {
      occurred_at: ev.occurred_at ?? new Date().toISOString(),
      method: clip(ev.method, 16),
      url_host: clip(ev.url_host, 256),
      url_path: clip(ev.url_path, MAX_URL),
      status: typeof ev.status === "number" ? ev.status : null,
      error_kind: kind,
      error_message: clip(ev.error_message, MAX_STR),
      response_snippet: clip(ev.response_snippet, MAX_STR),
      response_content_type: clip(ev.response_content_type, 128),
      duration_ms:
        typeof ev.duration_ms === "number" && ev.duration_ms >= 0
          ? Math.min(ev.duration_ms, 600_000)
          : null,
      user_id: userId,
      organization_id: organizationId,
      page_url: clip(ev.page_url, MAX_URL),
      page_route: clip(ev.page_route, 256),
      user_agent: clip(ev.user_agent, 512),
      proxy_used: !!ev.proxy_used,
      app_version: clip(ev.app_version, 64),
      client_ip: clip(clientIp, 64),
      occurrence_count:
        typeof ev.occurrence_count === "number" && ev.occurrence_count > 0
          ? Math.min(ev.occurrence_count, 9999)
          : 1,
    };
  });

  const { error } = await supabase.from("client_error_logs").insert(rows);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, inserted: rows.length }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
