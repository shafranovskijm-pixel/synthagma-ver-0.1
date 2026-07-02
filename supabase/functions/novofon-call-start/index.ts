import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { novofonRequest } from "../_shared/novofon.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CallbackResponse {
  status: string;
  from?: string;
  to?: string;
  call_id?: string;
  time?: string;
  message?: string;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return "7" + digits.slice(1);
  if (digits.length === 10) return "7" + digits;
  return digits;
}

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
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "invalid auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { to_number, lead_id, company_inn, company_name, from_sip } = body ?? {};
    if (!to_number) {
      return new Response(JSON.stringify({ error: "to_number required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = Deno.env.get("NOVOFON_CALLER_ID");
    if (!callerId) {
      return new Response(JSON.stringify({ error: "NOVOFON_CALLER_ID not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const to = normalizePhone(to_number);
    const from = from_sip || callerId;

    // Novofon callback: сначала звоним менеджеру (from — его SIP/номер),
    // после ответа — соединяем с клиентом (to).
    const nfRes = await novofonRequest<CallbackResponse>("GET", "/v1/request/callback/", {
      from,
      to,
      sip: from_sip || "",
    });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: log, error: logErr } = await admin
      .from("call_logs")
      .insert({
        manager_user_id: user.id,
        direction: "outbound",
        from_number: from,
        to_number: to,
        company_inn: company_inn ?? null,
        company_name: company_name ?? null,
        lead_id: lead_id ?? null,
        status: "dialing",
        provider: "novofon",
        novofon_call_id: nfRes.call_id ?? null,
      })
      .select("id")
      .single();

    if (logErr) console.error("call_log insert error", logErr);

    return new Response(
      JSON.stringify({
        ok: nfRes.status === "success",
        novofon: nfRes,
        call_log_id: log?.id ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("novofon-call-start error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
