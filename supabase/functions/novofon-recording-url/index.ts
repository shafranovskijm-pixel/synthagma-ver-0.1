import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { novofonRequest } from "../_shared/novofon.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "auth required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return new Response("unauthorized", { status: 401, headers: corsHeaders });

    const { call_log_id } = await req.json();
    if (!call_log_id) {
      return new Response(JSON.stringify({ error: "call_log_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: log } = await admin
      .from("call_logs")
      .select("id, novofon_call_id, recording_url")
      .eq("id", call_log_id)
      .maybeSingle();

    if (!log) return new Response("not found", { status: 404, headers: corsHeaders });

    // если у нас уже есть прямой URL — вернём
    if (log.recording_url && log.recording_url.startsWith("http")) {
      // фиксируем факт прослушивания
      await admin.from("call_log_listens").insert({
        call_log_id: log.id, listener_user_id: user.id,
      });
      return new Response(JSON.stringify({ url: log.recording_url }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!log.novofon_call_id) {
      return new Response(JSON.stringify({ error: "no recording" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nfRes = await novofonRequest<{ status: string; link?: string; lifetime?: number }>(
      "GET",
      "/v1/pbx/record/request/",
      { call_id: log.novofon_call_id, lifetime: 3600 },
    );

    if (nfRes.status === "success" && nfRes.link) {
      await admin.from("call_log_listens").insert({
        call_log_id: log.id, listener_user_id: user.id,
      });
      return new Response(JSON.stringify({ url: nfRes.link }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "recording not available", novofon: nfRes }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("novofon-recording-url error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
