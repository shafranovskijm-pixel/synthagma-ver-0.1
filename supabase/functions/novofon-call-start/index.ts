import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  describeNovofonError,
  hasCallApiCredentials,
  normalizeNovofonPhone,
  NovofonApiError,
  novofonClassicRequest,
  novofonRpc,
} from "../_shared/novofon.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CallStartResponse {
  call_session_id?: number;
}

interface ClassicCallbackResponse {
  status?: string;
  from?: string | number;
  to?: string | number;
  time?: number;
}

function canUseClassicFallback() {
  return Boolean(Deno.env.get("NOVOFON_API_KEY") && Deno.env.get("NOVOFON_API_SECRET"));
}

function shouldFallbackToClassic(error: unknown) {
  return error instanceof NovofonApiError
    && [
      "access_token_invalid",
      "access_token_expired",
      "access_token_blocked",
      "auth_error",
      "component_disabled",
      "method_component_disabled",
    ].includes(error.mnemonic || "");
}

async function startClassicCallback(operator: string, to: string, fromSip?: string): Promise<ClassicCallbackResponse> {
  return await novofonClassicRequest<ClassicCallbackResponse>("POST", "/v1/request/callback/", {
    from: operator,
    to,
    ...(fromSip ? { sip: fromSip } : {}),
  });
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
    const { to_number, lead_id, company_inn, company_name, from_sip, operator_number, is_test } = body ?? {};
    if (!to_number) {
      return new Response(JSON.stringify({ error: "to_number required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = normalizeNovofonPhone(Deno.env.get("NOVOFON_VIRTUAL_PHONE_NUMBER") || Deno.env.get("NOVOFON_CALLER_ID") || "");
    if (!callerId) {
      return new Response(JSON.stringify({ error: "NOVOFON_CALLER_ID not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const to = normalizeNovofonPhone(to_number);
    const operator = normalizeNovofonPhone(
      operator_number || from_sip || Deno.env.get("NOVOFON_OPERATOR_NUMBER") || "",
    );
    if (!operator) {
      return new Response(JSON.stringify({
        ok: false,
        error: "NOVOFON_OPERATOR_NUMBER not configured",
        message: "Не задан номер менеджера. Для теста и звонков нужен NOVOFON_OPERATOR_NUMBER или operator_number.",
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (to === callerId) {
      return new Response(JSON.stringify({
        ok: false,
        error: "own_virtual_phone_number_not_allowed",
        message: "Нельзя тестировать звонок на сам купленный виртуальный номер. Укажите личный мобильный менеджера.",
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let nfRes: CallStartResponse | ClassicCallbackResponse;
    let providerCallId: string | null = null;
    let usedApi: "call_api" | "classic_callback" = "call_api";

    if (hasCallApiCredentials()) {
      // Novofon Call API v4.0: сначала звоним оператору/менеджеру,
      // после ответа соединяем с контактом.
      try {
        nfRes = await novofonRpc<CallStartResponse>("start.simple_call", {
          first_call: "operator",
          switch_at_once: true,
          show_virtual_phone_number: true,
          virtual_phone_number: callerId,
          direction: "in",
          contact: to,
          operator,
          external_id: lead_id || `test-${Date.now()}`,
        });
        providerCallId = nfRes.call_session_id ? String(nfRes.call_session_id) : null;
      } catch (error) {
        if (!canUseClassicFallback() || !shouldFallbackToClassic(error)) throw error;
        console.warn("Call API failed, using classic callback fallback:", describeNovofonError(error));
        usedApi = "classic_callback";
        nfRes = await startClassicCallback(operator, to, from_sip || Deno.env.get("NOVOFON_SIP_LOGIN") || undefined);
        providerCallId = (nfRes as ClassicCallbackResponse).time ? String((nfRes as ClassicCallbackResponse).time) : null;
      }
    } else if (canUseClassicFallback()) {
      // Classic Novofon/Zadarma callback API: works with API key + secret.
      usedApi = "classic_callback";
      nfRes = await startClassicCallback(operator, to, from_sip || Deno.env.get("NOVOFON_SIP_LOGIN") || undefined);
      providerCallId = nfRes.time ? String(nfRes.time) : null;
    } else {
      return new Response(JSON.stringify({
        ok: false,
        error: "call_api_credentials_missing",
        message: "Не задан Call API токен Novofon и нет NOVOFON_API_KEY/NOVOFON_API_SECRET для резервного callback.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
        from_number: operator,
        to_number: to,
        company_inn: company_inn ?? null,
        company_name: company_name ?? null,
        lead_id: lead_id ?? null,
        status: "dialing",
        provider: "novofon",
        novofon_call_id: providerCallId,
        notes: is_test ? '__test_call__' : null,
      })
      .select("id")
      .single();

    if (logErr) console.error("call_log insert error", logErr);

    return new Response(
      JSON.stringify({
        ok: usedApi === "classic_callback" ? nfRes.status === "success" : Boolean((nfRes as CallStartResponse).call_session_id),
        api: usedApi,
        novofon: nfRes,
        call_log_id: log?.id ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = describeNovofonError(e);
    console.error("novofon-call-start error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
